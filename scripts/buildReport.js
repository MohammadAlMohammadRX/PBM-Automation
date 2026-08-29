#!/usr/bin/env node
/**
 * Builds the payer-module test report from a run's results.json.
 *
 * Everything in the output is read from the run - statuses, observed values and
 * the step breakdown - so the report cannot drift from what actually happened.
 * The one editorial choice is the "expected result", which is taken from each
 * test's own title: the titles are written as requirement statements ("should
 * save the payer as a private Draft when ..."), which is exactly what the case
 * is asserting.
 *
 * Usage:  node scripts/buildReport.js [results.json] [out.html]
 *         npm run report:doc
 */
const fs = require('fs');
const path = require('path');

const IN = process.argv[2] || path.join('reports', 'results.json');
const OUT = process.argv[3] || path.join('reports', 'PBM-Payer-Module-Test-Results.html');

const ANSI = /\[[0-9;]*m/g;
const clean = (t) => (t || '').replace(ANSI, '').trim();

/** Directory name -> the user story as the QA documents name it. */
const STORIES = [
  ['create-new-payer-organization-record', 'Create New Payer Organization Record'],
  ['edit-existing-payer-configuration-details', 'Edit Existing Payer Configuration Details'],
  ['delete-payer-with-dependency-validation', 'Delete Payer with/without Dependency Validation'],
  ['search-payers-by-name-or-code', 'Search Payers by Name or Code'],
  ['filter-payer-list-by-type-and-status', 'Filter Payer List by Type and Status'],
  ['sort-payer-list-by-column-headers', 'Sort Payer List by Column Headers'],
];

const ORDER = ['PASS', 'FAIL', 'BLOCKED', 'SKIPPED'];

if (!fs.existsSync(IN)) {
  console.error(`No results file at ${IN}. Run the suite with no --reporter flag first.`);
  process.exit(2);
}

const raw = JSON.parse(fs.readFileSync(IN, 'utf8'));

/**
 * Two accepted inputs:
 *   - a Playwright results.json, which this script derives everything from;
 *   - an already-prepared dataset (it has `stories`), which is rendered as-is.
 * The second exists so a report can be rebuilt for a run whose results.json is
 * gone, without this renderer having to know where the data came from.
 */
const PREPARED = Array.isArray(raw.stories);

// Taken from the RUN, not from the clock: the report describes when the suite
// executed, which is not necessarily when the document was generated.
const RUN_DATE = (() => {
  if (Array.isArray(raw.stories) && raw.runDate) return raw.runDate;
  const iso = raw.stats?.startTime;
  if (!iso) return 'not recorded in results.json';
  const d = new Date(iso);
  return d.toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
})();

const RUN_ENV = (Array.isArray(raw.stories) && raw.environment) || process.env.BASE_URL
  || (fs.existsSync('.env')
    ? (fs.readFileSync('.env', 'utf8').match(/^BASE_URL=(.*)$/m) || [, 'see .env'])[1].trim()
    : 'see .env');

// ---- collect every case ---------------------------------------------------
const cases = [];

(function walk(suites, hint = '') {
  for (const suite of suites || []) {
    const file = suite.file || hint;
    for (const spec of suite.specs || []) {
      for (const test of spec.tests || []) {
        const results = test.results || [];
        const last = results[results.length - 1] || {};
        const ann = {};
        for (const a of test.annotations || []) ann[a.type] = a.description || '';

        let steps = [];
        if (ann.steps) {
          try {
            steps = JSON.parse(ann.steps);
          } catch {
            steps = [];
          }
        }

        cases.push({
          file,
          storyDir: (file || '').split(/[\\/]/).slice(-2, -1)[0] || '',
          title: spec.title,
          playwrightStatus: last.status || test.status || 'unknown',
          durationMs: results.reduce((n, r) => n + (r.duration || 0), 0),
          ann,
          steps,
          message: clean(
            results.flatMap((r) => (r.errors || []).map((e) => e.message)).join('\n'),
          ),
        });
      }
    }
    walk(suite.suites, file);
  }
})(raw.suites);

const testCases = cases.filter((c) => !/setup/.test(c.file || ''));

// ---- status + expected/actual --------------------------------------------
function statusOf(c) {
  if (c.ann.blocked !== undefined) return 'BLOCKED';
  if (c.playwrightStatus === 'skipped') return 'SKIPPED';
  if (c.playwrightStatus === 'passed') return 'PASS';
  return 'FAIL';
}

/** `TC-014: should block ...` -> { id: 'TC-014', expected: 'Should block ...' } */
function splitTitle(title) {
  const m = title.match(/^\s*((?:TC|AC|ST)-\d+)\s*:\s*(.*)$/);
  if (!m) return { id: '-', expected: title.trim() };
  const text = m[2].trim();
  return { id: m[1], expected: text.charAt(0).toUpperCase() + text.slice(1) };
}

/**
 * The observed result, in the words of the run.
 *
 * An Expected/Received pair is the most useful form for a defect report - it is
 * literally what the application produced - so it is preferred over the raw
 * assertion text where present.
 */
function observed(message) {
  const msg = clean(message);
  if (!msg) return '';

  const pair = msg.match(/Expected:?\s*(?:pattern|substring|string)?\s*(.+?)\n+Received:?\s*(?:string|array|object)?\s*(.+?)(?:\n|$)/s);
  if (pair) {
    // A leading ":" survives shapes like "Received: string: \"x\"", so it is
    // trimmed here rather than complicating the pattern above.
    const tidy = (t) => t.replace(/\s+/g, ' ').replace(/^:\s*/, '').trim().slice(0, 240);
    const exp = tidy(pair[1]);
    const got = tidy(pair[2]);
    return `Observed ${got} — expected ${exp}.`;
  }

  const timeout = msg.match(/Timeout\s+(\d+)ms exceeded while waiting on the predicate/);
  if (timeout) {
    return `The expected condition was never met within ${
      Number(timeout[1]) / 1000
    }s of polling.`;
  }

  const locator = msg.match(/expect\(locator\)\.(\w+)\(\)/);
  if (locator) {
    const map = {
      toBeVisible: 'The expected element never became visible.',
      toBeHidden: 'The element that should have disappeared stayed on screen.',
      toBeEnabled: 'The expected control never became enabled.',
      toContainText: 'The element did not contain the expected text.',
      toHaveCount: 'The number of matching elements differed from the expectation.',
    };
    if (map[locator[1]]) return map[locator[1]];
  }

  return (msg.split('\n').find((l) => l.trim()) || '').slice(0, 220);
}

function actualOf(c, status) {
  if (status === 'PASS') return 'As expected.';
  if (status === 'BLOCKED') return c.ann.blocked;
  if (status === 'SKIPPED') {
    if (c.ann['dependency-skipped']) return `Not run — ${c.ann['dependency-skipped']}.`;
    return c.ann.skip || c.ann.fixme || 'Intentionally excluded from this execution.';
  }

  const failed = c.steps.filter((s) => s.status === 'FAIL');
  const notRun = c.steps.filter((s) => s.status === 'NOT EXECUTED').length;

  if (!failed.length) {
    const detail = observed(c.message);
    return c.steps.length === 0
      ? `The test body never ran — a fixture could not provision its precondition. ${detail}`
      : detail || 'Failed with no detail captured.';
  }

  const parts = failed.map(
    (s) => `Step ${s.index} (${s.name}): ${observed(s.reason) || clean(s.reason)}`,
  );
  if (notRun) {
    parts.push(
      `${notRun} later step${notRun === 1 ? '' : 's'} not executed, because a step they depend on failed.`,
    );
  }
  return parts.join(' ');
}

for (const c of testCases) {
  c.status = statusOf(c);
  const t = splitTitle(c.title);
  c.id = t.id;
  c.expected = t.expected;
  c.actual = actualOf(c, c.status);
}

// ---- group by story ------------------------------------------------------
const grouped = STORIES.map(([dir, name]) => ({
  name,
  dir,
  cases: testCases.filter((c) => c.storyDir === dir),
})).filter((g) => g.cases.length);

const other = testCases.filter((c) => !STORIES.some(([d]) => d === c.storyDir));
if (other.length) grouped.push({ name: 'Other', dir: '', cases: other });

let totals = Object.fromEntries(ORDER.map((s) => [s, 0]));
for (const c of testCases) totals[c.status] += 1;

if (PREPARED) {
  grouped.length = 0;
  for (const st of raw.stories) {
    grouped.push({
      name: st.name,
      dir: '',
      cases: st.cases.map((c) => ({ ...c, durationMs: c.durationMs || 0 })),
    });
  }
  totals = raw.totals;
}

/** Case count for the header and the percentages, from whichever path ran. */
const CASE_COUNT = PREPARED
  ? Object.values(raw.totals).reduce((a, b) => a + b, 0)
  : testCases.length;

const totalMs = testCases.reduce((n, c) => n + c.durationMs, 0);
const workers = PREPARED ? raw.workers : (raw.config?.metadata?.actualWorkers ?? raw.config?.workers ?? '-');
const durationMs = PREPARED ? raw.durationMs : (raw.stats?.duration ?? totalMs);

// ---- render --------------------------------------------------------------
const esc = (s) =>
  String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Story tag, because case ids repeat across stories (TC-003 exists in four). */
const tagOf = (name) => name.replace(/[^A-Za-z ]/g, '').split(' ')[0].slice(0, 3).toUpperCase();

/** Cases that did not pass come first; failures before blocked before skipped. */
const RANK = { FAIL: 0, BLOCKED: 1, SKIPPED: 2, PASS: 3 };
const byAttention = (a, b) =>
  RANK[a.status] - RANK[b.status] || a.id.localeCompare(b.id, 'en', { numeric: true });

/** True when the two runs of the day did not agree on this case. */
const disputed = (c) =>
  c.reproducibility === 'unstable' || c.reproducibility === 'same-status-different-cause';

/** Quoted values inside a sentence are data - set them in mono. */
const codeify = (t) =>
  esc(t).replace(/&quot;([^&]*?)&quot;/g, '<code>$1</code>');

const mins = (ms) => `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
const pct = (n) => (CASE_COUNT ? Math.round((n / CASE_COUNT) * 100) : 0);

function storyCounts(g) {
  const c = Object.fromEntries(ORDER.map((s) => [s, 0]));
  for (const x of g.cases) c[x.status] += 1;
  return c;
}

function stepsHtml(c) {
  if (!c.steps.length || c.status === 'PASS') return '';
  const rows = c.steps
    .map(
      (s) => `<li class="st st--${s.status.replace(' ', '-').toLowerCase()}">
        <span class="st__n">${s.index}</span>
        <span class="st__s">${esc(s.status)}</span>
        <span class="st__t">${esc(s.name)}${
        s.reason ? `<em>${codeify(clean(s.reason).split('\n')[0].slice(0, 200))}</em>` : ''
      }${
        s.screenshot
          ? `<em class="shot">Screenshot at this step: <code>${esc(
              s.screenshot.split(/[\/]/).pop(),
            )}</code></em>`
          : ''
      }</span>
      </li>`,
    )
    .join('');
  const partial = c.stepsPartial
    ? '<p class="partial">The run log truncated this step list; later steps are not shown.</p>'
    : '';
  return `<details class="steps"><summary>Step-by-step result (${c.steps.length} step${
    c.steps.length === 1 ? '' : 's'
  })</summary><ol class="stl">${rows}</ol>${partial}</details>`;
}

const storySections = grouped
  .map((g) => {
    const c = storyCounts(g);
    const chips = ORDER.filter((s) => c[s])
      .map((s) => `<span class="chip chip--${s.toLowerCase()}">${c[s]} ${s}</span>`)
      .join('');

    const rows = [...g.cases]
      .sort(byAttention)
      .map(
        (x) => `<tr class="r r--${x.status.toLowerCase()}${
          disputed(x) ? ' r--unstable' : ''
        }">
        <td class="c-id">${esc(tagOf(g.name))}-${esc(x.id)}</td>
        <td class="c-exp">${esc(x.expected)}</td>
        <td class="c-act">${codeify(x.actual)}${
          disputed(x)
            ? `<p class="repro">Not reproduced &mdash; the other run of the same day recorded this case as <b>${esc(
                x.otherRunStatus,
              )}</b>.</p>`
            : ''
        }${stepsHtml(x)}</td>
        <td class="c-st"><span class="badge badge--${x.status.toLowerCase()}">${x.status}</span>${
          disputed(x) ? '<span class="flaky">unstable</span>' : ''
        }</td>
      </tr>`,
      )
      .join('');

    return `<section class="story">
      <h2>${esc(g.name)}</h2>
      <p class="story__meta">${g.cases.length} test case${g.cases.length === 1 ? '' : 's'} ${chips}</p>
      <div class="tw"><table>
        <thead><tr><th>Case</th><th>Expected result</th><th>Actual result</th><th>Status</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </section>`;
  })
  .join('');

const attention = grouped
  .flatMap((g) => g.cases.map((c) => ({ ...c, story: g.name, tag: tagOf(g.name) })))
  .filter((c) => c.status !== 'PASS')
  .sort(byAttention);

const attentionCount = attention.length;
const attentionRows = attention
  .map(
    (c) => `<tr class="r r--${c.status.toLowerCase()}${disputed(c) ? ' r--unstable' : ''}">
      <td class="c-id">${esc(c.tag)}-${esc(c.id)}</td>
      <td>${esc(c.story)}</td>
      <td class="c-exp">${esc(c.expected)}</td>
      <td>${codeify(c.actual)}${
      disputed(c)
        ? `<p class="repro">Not reproduced &mdash; the other run recorded this as <b>${esc(
            c.otherRunStatus,
          )}</b>.</p>`
        : ''
    }</td>
      <td class="c-st"><span class="badge badge--${c.status.toLowerCase()}">${c.status}</span></td>
    </tr>`,
  )
  .join('');

const summaryRows = grouped
  .map((g) => {
    const c = storyCounts(g);
    return `<tr><td><b>${esc(tagOf(g.name))}</b>&nbsp; ${esc(g.name)}</td><td class="n">${g.cases.length}</td>${ORDER.map(
      (s) => `<td class="n${c[s] && s !== 'PASS' ? ' n--flag' : ''}">${c[s] || '–'}</td>`,
    ).join('')}</tr>`;
  })
  .join('');

const html = `<title>Payer Module Test Results</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Serif:wght@500;600&display=swap">
<style>
  :root{
    --ground:#f7f9f9; --panel:#ffffff; --panel-2:#f1f5f5;
    --ink:#101a1a; --muted:#566b6b; --rule:#dce5e5; --accent:#0f5f63;
    --pass:#0e7a4b; --pass-bg:#e4f3ea; --fail:#b3261e; --fail-bg:#fbeae8;
    --blocked:#8a5a00; --blocked-bg:#fbf0dc; --skip:#55636b; --skip-bg:#eceff0;
    --sans:"IBM Plex Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
    --serif:"IBM Plex Serif",Georgia,"Times New Roman",serif;
    --mono:"IBM Plex Mono",ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  }
  @media (prefers-color-scheme: dark){
    :root:not([data-theme="light"]){
      --ground:#0e1414; --panel:#161d1d; --panel-2:#1b2323;
      --ink:#e6eded; --muted:#93a5a5; --rule:#263131; --accent:#5cc9cf;
      --pass:#5fd39b; --pass-bg:#122a20; --fail:#ff9086; --fail-bg:#2e1a18;
      --blocked:#e8b96b; --blocked-bg:#2a2013; --skip:#a3b0b8; --skip-bg:#1f2529;
    }
  }
  :root[data-theme="dark"]{
    --ground:#0e1414; --panel:#161d1d; --panel-2:#1b2323;
    --ink:#e6eded; --muted:#93a5a5; --rule:#263131; --accent:#5cc9cf;
    --pass:#5fd39b; --pass-bg:#122a20; --fail:#ff9086; --fail-bg:#2e1a18;
    --blocked:#e8b96b; --blocked-bg:#2a2013; --skip:#a3b0b8; --skip-bg:#1f2529;
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--ground);color:var(--ink);font-family:var(--sans);
    font-size:15px;line-height:1.55;-webkit-font-smoothing:antialiased}
  .wrap{max-width:1200px;margin:0 auto;padding:40px 22px 80px;display:flex;flex-direction:column;gap:30px}
  code{font-family:var(--mono);font-size:.88em;background:var(--panel-2);
    padding:1px 5px;border-radius:4px;word-break:break-word}

  .eyebrow{font-size:.72rem;letter-spacing:.13em;text-transform:uppercase;color:var(--accent);
    font-weight:600;margin:0 0 8px}
  h1{font-family:var(--serif);font-weight:600;font-size:2.15rem;line-height:1.15;margin:0 0 10px;
    letter-spacing:-.015em;text-wrap:balance}
  .lede{color:var(--muted);margin:0;max-width:64ch}

  .meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(132px,1fr));gap:1px;
    background:var(--rule);border:1px solid var(--rule);border-radius:10px;overflow:hidden}
  .meta div{background:var(--panel);padding:11px 14px}
  .meta dt{font-size:.68rem;letter-spacing:.09em;text-transform:uppercase;color:var(--muted);
    margin:0 0 3px;font-weight:600}
  .meta dd{margin:0;font-size:.92rem;font-variant-numeric:tabular-nums}

  .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}
  .card{background:var(--panel);border:1px solid var(--rule);border-radius:10px;
    padding:16px 18px;position:relative;overflow:hidden}
  .card::before{content:"";position:absolute;inset:0 auto 0 0;width:3px}
  .card--pass::before{background:var(--pass)} .card--fail::before{background:var(--fail)}
  .card--blocked::before{background:var(--blocked)} .card--skipped::before{background:var(--skip)}
  .card b{display:block;font-family:var(--mono);font-size:2.05rem;font-weight:500;line-height:1.05;
    font-variant-numeric:tabular-nums}
  .card--pass b{color:var(--pass)} .card--fail b{color:var(--fail)}
  .card--blocked b{color:var(--blocked)} .card--skipped b{color:var(--skip)}
  .card span{display:block;color:var(--muted);font-size:.74rem;letter-spacing:.09em;
    text-transform:uppercase;font-weight:600;margin-top:5px}

  h2{font-family:var(--serif);font-size:1.3rem;font-weight:600;margin:0 0 6px;letter-spacing:-.01em}
  .story{display:flex;flex-direction:column;gap:10px}
  .story__meta{color:var(--muted);font-size:.84rem;margin:0;display:flex;flex-wrap:wrap;gap:7px;align-items:center}
  .chip{font-size:.71rem;padding:2px 9px;border-radius:20px;font-weight:600;letter-spacing:.02em}
  .chip--pass{background:var(--pass-bg);color:var(--pass)}
  .chip--fail{background:var(--fail-bg);color:var(--fail)}
  .chip--blocked{background:var(--blocked-bg);color:var(--blocked)}
  .chip--skipped{background:var(--skip-bg);color:var(--skip)}

  .tw{overflow-x:auto;border:1px solid var(--rule);border-radius:10px;background:var(--panel)}
  table{border-collapse:collapse;width:100%;min-width:900px;font-size:.875rem}
  th,td{text-align:left;padding:11px 13px;border-bottom:1px solid var(--rule);vertical-align:top}
  th{background:var(--panel-2);font-size:.68rem;letter-spacing:.09em;text-transform:uppercase;
    color:var(--muted);font-weight:600;position:sticky;top:0;z-index:1}
  tbody tr:last-child td{border-bottom:0}
  td.c-id{font-family:var(--mono);font-weight:500;white-space:nowrap;width:78px;
    border-left:3px solid transparent;font-variant-numeric:tabular-nums}
  .r--pass td.c-id{border-left-color:var(--pass)}
  .r--fail td.c-id{border-left-color:var(--fail);color:var(--fail)}
  .r--blocked td.c-id{border-left-color:var(--blocked);color:var(--blocked)}
  .r--skipped td.c-id{border-left-color:var(--skip);color:var(--skip)}
  .c-exp{width:33%}
  .c-st{width:100px}
  .badge{display:inline-block;font-size:.68rem;font-weight:600;padding:3px 9px;border-radius:5px;
    letter-spacing:.06em}
  .badge--pass{background:var(--pass-bg);color:var(--pass)}
  .badge--fail{background:var(--fail-bg);color:var(--fail)}
  .badge--blocked{background:var(--blocked-bg);color:var(--blocked)}
  .badge--skipped{background:var(--skip-bg);color:var(--skip)}
  td.n{text-align:right;font-family:var(--mono);font-variant-numeric:tabular-nums}
  th.n{text-align:right}

  .steps{margin-top:10px}
  .steps summary{cursor:pointer;color:var(--accent);font-size:.79rem;font-weight:500}
  .steps summary:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:3px}
  .stl{list-style:none;margin:10px 0 0;padding:0 0 0 12px;border-left:1px solid var(--rule);
    display:flex;flex-direction:column;gap:5px}
  .st{display:grid;grid-template-columns:1.6rem 6.6rem 1fr;gap:9px;font-size:.81rem}
  .st__n{color:var(--muted);font-family:var(--mono);font-variant-numeric:tabular-nums}
  .st__s{font-size:.67rem;font-weight:600;letter-spacing:.06em;padding-top:2px}
  .st__t em{display:block;color:var(--muted);font-style:normal;margin-top:2px}
  .st__t em.shot{color:var(--accent)}
  .st--pass .st__s{color:var(--pass)}
  .st--fail .st__s{color:var(--fail)}
  .st--not-executed .st__s{color:var(--muted)}
  .partial{color:var(--blocked);font-size:.78rem;margin:7px 0 0}

  .repro{margin:8px 0 0;padding:7px 10px;background:var(--blocked-bg);color:var(--blocked);
    border-radius:6px;font-size:.79rem}
  .repro b{font-weight:600}
  .flaky{display:block;margin-top:5px;font-size:.63rem;letter-spacing:.08em;text-transform:uppercase;
    color:var(--blocked);font-weight:600}
  .r--unstable td.c-id{border-left-style:dashed}
  .note{background:var(--panel);border:1px solid var(--rule);border-left:3px solid var(--blocked);
    border-radius:8px;padding:14px 16px;font-size:.87rem}
  .note b{color:var(--blocked)}
  footer{border-top:1px solid var(--rule);padding-top:20px;color:var(--muted);font-size:.85rem;
    display:flex;flex-direction:column;gap:11px}
  footer b{color:var(--ink)}
  @media (max-width:640px){ .wrap{padding:26px 14px 60px} h1{font-size:1.7rem} .c-exp{width:auto} }
  @media (prefers-reduced-motion:reduce){ *{animation:none!important;transition:none!important} }
</style>

<div class="wrap">
<header>
  <p class="eyebrow">NeoRx PBM &middot; Automated regression</p>
  <h1>Payer Module Test Results</h1>
  <p class="lede">Every one of the ${CASE_COUNT} automated test cases across the six payer user
  stories, with the expected result, what the application actually did, and the step at which it
  diverged.</p>
</header>

<dl class="meta">
  <div><dt>Run</dt><dd>${esc(RUN_DATE)}</dd></div>
  <div><dt>Test cases</dt><dd>${CASE_COUNT}</dd></div>
  <div><dt>Workers</dt><dd>${esc(String(workers))}</dd></div>
  <div><dt>Retries</dt><dd>0</dd></div>
  <div><dt>Duration</dt><dd>${mins(durationMs)}</dd></div>
  <div><dt>Environment</dt><dd>${esc(RUN_ENV)}</dd></div>
</dl>

<div class="cards">
  ${ORDER.map(
    (s) => `<div class="card card--${s.toLowerCase()}">
    <b>${totals[s]}</b><span>${s} &middot; ${pct(totals[s])}%</span>
  </div>`,
  ).join('')}
</div>

${
  PREPARED && raw.provenance
    ? `<p class="note"><b>How this report was assembled.</b> ${esc(raw.provenance)}</p>`
    : ''
}

${
  attentionRows
    ? `<section class="story">
  <h2>Cases needing attention</h2>
  <p class="story__meta">${attentionCount} of ${CASE_COUNT} cases did not pass &mdash; failures
  first, then blocked, then skipped. Each also appears in its own user story below.</p>
  <div class="tw"><table>
    <thead><tr><th>Case</th><th>User story</th><th>Expected result</th><th>Actual result</th><th>Status</th></tr></thead>
    <tbody>${attentionRows}</tbody>
  </table></div>
</section>`
    : ''
}

<section class="story">
  <h2>Summary by user story</h2>
  <div class="tw"><table>
    <thead><tr><th>User story</th><th class="n">Cases</th>${ORDER.map(
      (s) => `<th class="n">${s}</th>`,
    ).join('')}</tr></thead>
    <tbody>${summaryRows}</tbody>
  </table></div>
</section>

${storySections}

<footer>
  <p><b>PASS</b> the expected result was observed. <b>FAIL</b> the application was exercised and
  produced a different result &mdash; the actual result names the failing step and the observed
  value. <b>BLOCKED</b> a prerequisite was unavailable, so the behaviour was never exercised and
  nothing was learned about it; this is deliberately not counted as a failure. <b>SKIPPED</b>
  deliberately excluded, with the reason recorded.</p>
  <p>Steps marked <b>NOT EXECUTED</b> were not run because an earlier step they depend on failed.
  Where a step failed and later steps still ran, those checks were independent, and each reports
  its own result.</p>
  <p><b>Retries are disabled.</b> Every verdict comes from a single execution &mdash; a case that
  passes only on a second attempt is reported as a failure, not a pass.</p>
</footer>
</div>
`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html, 'utf8');

// A machine-readable copy, for building other formats without re-deriving any of this.
// Skipped when the input was already such a file.
const jsonOut = OUT.replace(/\.html$/, '.json');
if (!PREPARED) fs.writeFileSync(
  jsonOut,
  JSON.stringify(
    {
      runDate: RUN_DATE,
      environment: RUN_ENV,
      workers,
      retries: 0,
      durationMs,
      totals,
      stories: grouped.map((g) => ({
        name: g.name,
        counts: storyCounts(g),
        cases: g.cases.map((c) => ({
          id: c.id,
          expected: c.expected,
          actual: c.actual,
          status: c.status,
          steps: c.steps,
        })),
      })),
    },
    null,
    2,
  ),
  'utf8',
);

console.log(`Report written: ${OUT}`);
console.log(`Data written  : ${jsonOut}`);
console.log(
  `  ${testCases.length} cases  |  ` + ORDER.map((s) => `${s} ${totals[s]}`).join('  '),
);
