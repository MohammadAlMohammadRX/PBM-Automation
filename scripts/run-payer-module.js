/**
 * Runs the payer module a folder at a time.
 *
 * NOT one whole-suite invocation. A single four-hour invocation degraded the
 * application mid-run once and lost ten folders' results, and the saved admin
 * token lives about an hour - so each folder runs WITH the setup project, which
 * re-logs in (about 15 s) and keeps that folder's session fresh.
 *
 * Node rather than a shell script because the team runs this from PowerShell,
 * where `bash` is not on the PATH.
 *
 *   npm run test:payer            all 74 folders
 *   npm run test:payer 38         resume from folder 38, keeping earlier partials
 *
 * A RE-RUN THAT MUST NOT TOUCH EARLIER RESULTS sets RUN_LABEL. Its partials,
 * merged data, report and run-manifest.json (per folder: start, end, active
 * time, counts, freezes, interruptions) all land under that label:
 *
 *   cross-env RUN_LABEL=rerun-20261007 npm run test:payer 04,06,09
 *
 * A partial is written after every folder, so a run that is stopped keeps what
 * it had and the resume picks up where it left off.
 *
 * MODULE picks the module under tests/ (default "payer"). The network module
 * (2026-10-24) runs the same way, with its own partials and report:
 *
 *   npm run test:network          all network folders
 *   npm run test:network 21       resume from folder 21
 *   npm run test:network 03,07    exactly those folders, in that order
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const { measureTiming } = require('./executionTiming');

const ROOT = path.resolve(__dirname, '..');
// RUN_LABEL keeps a run's results APART from every earlier run's: a re-run with
// RUN_LABEL=rerun-20261007 writes to reports/partials-rerun-20261007 and its own
// report, and never touches reports/partials. Without a label, behaviour is as
// before.
const LABEL = (process.env.RUN_LABEL || '').replace(/[^A-Za-z0-9_-]/g, '');
// MODULE keeps each module's partials and report apart: the payer module keeps
// its original paths, any other module gets "partials-<module>" and its own report.
const MODULE = (process.env.MODULE || 'payer').replace(/[^a-z]/g, '');
const IS_PAYER = MODULE === 'payer';
const TITLE = `${MODULE.charAt(0).toUpperCase()}${MODULE.slice(1)}`;
const PARTIALS = path.join(ROOT, 'reports', LABEL ? `partials-${LABEL}` : IS_PAYER ? 'partials' : `partials-${MODULE}`);
const RESULTS = path.join(ROOT, 'reports', 'results.json');
const BASE = LABEL ? `PBM-${TITLE}-Module-${LABEL}` : `PBM-${TITLE}-Module-Full-Run`;
// ".merged.json", not ".json": buildReport writes its own data file next to the
// HTML under the HTML's name, which used to be this exact path - so the merged
// input was overwritten by the report data on every run.
const MERGED = path.join(ROOT, 'reports', `${BASE}.merged.json`);
const HTML = path.join(ROOT, 'reports', `${BASE}.html`);
const SHEET = path.join(ROOT, 'reports', `${BASE}-Failures.xlsx`);
const MANIFEST = path.join(PARTIALS, 'run-manifest.json');
const CRASH_SIGNS = /Target crashed|worker process exited|3221225794|net::ERR_[A-Z_]+|browserType\.launch: Timeout/g;

const arg = process.argv[2] || '01';
const clock = () => new Date().toISOString().slice(11, 19);

fs.mkdirSync(PARTIALS, { recursive: true });

const all = fs
  .readdirSync(path.join(ROOT, 'tests', MODULE), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

// CASES runs only the named test cases (Azure ids), not whole folders - a
// targeted re-run of 25 cases instead of eight hours of folders. The folders
// that hold them are found from the spec files, so no folder list is needed:
//   cross-env RUN_LABEL=rerun-x CASES=15584,15595 npm run test:payer
const CASES = (process.env.CASES || '').split(',').map((s) => s.trim()).filter((s) => /^\d+$/.test(s));
// The payer specs spell their ids in the titles. The network titles take them
// from data files (`TC-${...azureId}`), so for other modules the folders are
// found by asking Playwright which listed tests match.
const listedFolders = () => {
  const out = spawnSync('npx', ['playwright', 'test', `tests/${MODULE}`, '--list', '--grep', JSON.stringify(`(${CASES.join('|')}):`)], {
    cwd: ROOT, shell: true, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
  const found = new Set();
  // The listing prints paths relative to testDir: "› network\01-...\x.spec.ts".
  // Matched on the whitespace before the module, not on the "›" separator.
  for (const m of `${out.stdout || ''}`.matchAll(new RegExp(`\\s${MODULE}[\\\\/]([^\\\\/\\s]+)[\\\\/]`, 'g'))) found.add(m[1]);
  return found;
};
const listed = CASES.length && !IS_PAYER ? listedFolders() : new Set();
const holds = (folder, id) => (IS_PAYER
  ? fs.readdirSync(path.join(ROOT, 'tests', 'payer', folder))
    .filter((f) => f.endsWith('.ts'))
    .some((f) => new RegExp(`['\`]${id}:|'${id}'`).test(fs.readFileSync(path.join(ROOT, 'tests', 'payer', folder, f), 'utf8')))
  : listed.has(folder));

// A comma-separated list runs exactly those folders, IN THE ORDER GIVEN - which
// is how a time-boxed run puts the folders that matter first. A single value is
// a starting point and everything from there runs, as before.
const folders = CASES.length && !process.argv[2]
  ? all.filter((name) => CASES.some((id) => holds(name, id)))
  : arg.includes(',')
  ? arg.split(',').map((n) => n.trim().padStart(2, '0'))
      .map((n) => all.find((name) => name.startsWith(`${n}-`)))
      .filter((name) => Boolean(name))
  : all.filter((name) => name.split('-')[0] >= arg.padStart(2, '0'));

console.log(`=== ${MODULE} module: ${folders.length} folder(s) [${arg}], ${clock()} UTC`);

const run = (args, logFile) => {
  const out = spawnSync('npx', args, {
    cwd: ROOT,
    shell: true,
    encoding: 'utf8',
    // WORKERS=1 is not optional: the app stores a per-user view preference
    // server-side and the register holds shared mutable records, so parallel
    // workers overwrite each other's state.
    env: { ...process.env, WORKERS: '1' },
    maxBuffer: 64 * 1024 * 1024,
  });
  const text = `${out.stdout || ''}${out.stderr || ''}`;
  if (logFile) fs.writeFileSync(logFile, text);
  return { status: out.status, text };
};

// THE MANIFEST is written BEFORE each folder starts and again when it ends, so
// a run that is cut off - sleep, crash, a killed terminal - leaves a record of
// exactly which folder was in flight and when, instead of silence.
const manifest = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : { label: LABEL || null, folders: [] };
const saveManifest = () => fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));

for (const name of folders) {
  const nn = name.split('-')[0];
  console.log(`=== ${name}  start ${clock()}`);
  const entry = { folder: nn, name, start: new Date().toISOString(), end: null, status: 'running' };
  manifest.folders = manifest.folders.filter((f) => f.folder !== nn);
  manifest.folders.push(entry);
  saveManifest();

  // Cleared first: if this folder dies before Playwright writes results, there
  // must be NOTHING to copy - copying the previous folder's file under this
  // folder's name is how stale results once polluted a whole report.
  fs.rmSync(RESULTS, { force: true });

  const logFile = path.join(PARTIALS, `run-${nn}.log`);
  // Never pass --reporter: it detaches the JSON reporter, and the BLOCKED
  // annotations that distinguish "precondition missing" from "failed" go with it.
  // Titles start "<id>: ", so anchoring on the colon stops 1558 matching 15584.
  const grep = CASES.length ? ['--grep', JSON.stringify(`(${CASES.join('|')}):`)] : [];
  const { status, text } = run(
    ['playwright', 'test', `tests/${MODULE}/${name}`, '--project=chromium', ...grep],
    logFile,
  );
  console.log(`    exit ${status}`);

  const produced = fs.existsSync(RESULTS);
  if (produced) fs.copyFileSync(RESULTS, path.join(PARTIALS, `${nn}.json`));

  const counts = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s+(\d+) (passed|failed|skipped|flaky|did not run)/);
    if (m) {
      counts[m[2]] = Number(m[1]);
      console.log(`    ${line.trim()}`);
    }
  }
  const timed = produced ? measureTiming(PARTIALS).folders.find((f) => f.folder === nn) : null;
  Object.assign(entry, {
    end: new Date().toISOString(),
    // Playwright exits 1 whenever any test fails - that is a COMPLETED folder.
    // Only a missing results file or a crash sign means it did not finish.
    status: produced ? 'completed' : 'interrupted',
    exitCode: status,
    counts,
    wallMs: timed ? timed.wallMs : null,
    frozenMs: timed ? timed.frozenMs : null,
    activeMs: timed ? timed.activeMs : null,
    freezes: timed ? timed.gaps : [],
    interruptions: [...new Set(text.match(CRASH_SIGNS) || [])],
  });
  saveManifest();
  if (!produced) console.log(`    INTERRUPTED: no results were produced - see ${path.relative(ROOT, logFile)}`);
}

console.log(`=== merging ${clock()}`);
// Quoted: this project lives under "OneDrive - NeoRx", and an unquoted
// absolute path splits at the space when it goes through a shell - which is
// how the merge step came to hand Node a directory and crash on 2026-09-29.
const merge = spawnSync('node', [path.join('scripts', 'mergeResults.js'), JSON.stringify(PARTIALS), JSON.stringify(MERGED)], {
  cwd: ROOT, shell: true, encoding: 'utf8', stdio: 'inherit',
});
if (merge.status === 0) {
  // The partials directory goes in as the third argument so the report's
  // running time is ACTIVE time, with sleep and freezes taken out.
  spawnSync('node', [path.join('scripts', 'buildReport.js'), JSON.stringify(MERGED), JSON.stringify(HTML), JSON.stringify(PARTIALS)], {
    cwd: ROOT, shell: true, encoding: 'utf8', stdio: 'inherit',
  });
  // The failure sheet beside every report: each failed step as plain Expected /
  // Actual / On screen, with screenshot links (QA lead, 2026-10-28).
  spawnSync('node', [path.join('scripts', 'buildFailureSheet.js'), JSON.stringify(HTML.replace(/\.html$/, '.json')), JSON.stringify(SHEET)], {
    cwd: ROOT, shell: true, encoding: 'utf8', stdio: 'inherit',
  });
}
console.log(`=== done ${clock()} UTC`);
console.log(`    report: ${path.relative(ROOT, HTML)}`);
console.log(`    failure sheet: ${path.relative(ROOT, SHEET)}`);
