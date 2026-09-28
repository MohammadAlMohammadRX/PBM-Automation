/**
 * Merges per-folder Playwright JSON results into one file the report can read.
 *
 * Needed because each folder is run in its own invocation - the only shape that
 * proved reliable, after a single four-hour invocation degraded partway through
 * and lost ten folders' results - and the config writes every invocation to the
 * same path. Copying after each run and merging here keeps the per-folder
 * robustness and still yields one report.
 *
 * Later files win on conflict, so a re-run of one folder replaces its earlier
 * result rather than appearing twice.
 */
const fs = require('fs');
const path = require('path');

const dir = process.argv[2];
const out = process.argv[3];

const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
if (files.length === 0) throw new Error(`no partial results in ${dir}`);

const merged = { config: null, suites: [], errors: [], stats: { expected: 0, unexpected: 0, flaky: 0, skipped: 0, startTime: null, duration: 0 } };
const seen = new Map();

for (const f of files) {
  const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  if (merged.config === null) merged.config = j.config ?? null;
  for (const suite of j.suites ?? []) {
    // Keyed by the suite's file so a re-run replaces rather than duplicates.
    seen.set(suite.file ?? suite.title, suite);
  }
  const s = j.stats ?? {};
  merged.stats.expected += s.expected ?? 0;
  merged.stats.unexpected += s.unexpected ?? 0;
  merged.stats.flaky += s.flaky ?? 0;
  merged.stats.skipped += s.skipped ?? 0;
  merged.stats.duration += s.duration ?? 0;
  if (s.startTime && (merged.stats.startTime === null || s.startTime < merged.stats.startTime)) {
    merged.stats.startTime = s.startTime;
  }
}

merged.suites = [...seen.values()];
fs.writeFileSync(out, JSON.stringify(merged));
console.log(
  `merged ${files.length} partial(s) -> ${out}: ${merged.suites.length} suite file(s), `
  + `${merged.stats.expected} expected / ${merged.stats.unexpected} unexpected / `
  + `${merged.stats.skipped} skipped`,
);
