/**
 * Publishes the FINAL reviewed payer-module results to Azure DevOps Test Plans.
 *
 *   node scripts/publishToAzure.js --list-plans
 *   node scripts/publishToAzure.js --plan <id> [--suite <id>]             (dry run - reads only)
 *   node scripts/publishToAzure.js --plan <id> [--suite <id>] --publish   (writes one test run)
 *
 * WHY OUR OWN AND NOT A REPORTER. The results are merged from several runs
 * (scripts/mergeLayers.js) and carry QA-lead decisions (report overrides); a
 * Playwright reporter only sees the run it is attached to. This reads the final
 * report JSON that buildReport.js writes, so Azure receives exactly what the
 * HTML report shows.
 *
 * WHAT IT DOES WITH --publish (and only then):
 *   1. creates ONE test run in the plan, for the test points of the cases the
 *      report holds;
 *   2. sets each result: Passed / Failed / Blocked, the actual result as the
 *      comment, the failing step's screenshot attached;
 *   3. attaches the HTML report to the run and completes it - the plan's
 *      Outcome column then shows these results.
 * Without --publish nothing is written: it reads the plan (with a token) or
 * the report alone (without one) and writes a preview to reports/azure-publish/.
 *
 * MAPPING. A report case id is the Azure Test Case id (the title prefix,
 * "15516: ..."). Several rows of a data-driven case share one id; they become
 * ONE result with the worst outcome (Failed > Blocked > Passed) and every row
 * listed in the comment. SKIPPED rows are not published; stories removed from
 * the report, and manual stories, never reach this script.
 *
 * AUTH. A Personal Access Token with "Test Management (Read & write)" scope, in
 * the AZURE_DEVOPS_PAT environment variable - set by the user, never written to
 * a file or printed by this script.
 *
 * Options / environment:
 *   --report <path>        report JSON (default reports/PBM-Payer-Module-Full-Run.json)
 *   --html <path>          HTML report attached to the run (default: same name, .html)
 *   --run-name <text>      run title (default "Payer module - automated results <date>")
 *   --no-screenshots       do not attach failing-step screenshots
 *   --bugs <path>          JSON { "<test case id>": <Azure bug id> } of the QA-approved bugs. With it,
 *                          only Passed results and Failed results that have an approved bug are
 *                          published (each Failed result linked to its bug); every other Failed and
 *                          all Blocked results are held back and listed in the preview.
 *   --exclude <ids>        comma-separated test case ids never to publish (e.g. tagged invalid in Azure)
 *   AZURE_DEVOPS_ORG       default neomatixco
 *   AZURE_DEVOPS_PROJECT   default CareConnect
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'reports', 'azure-publish');
const API = '7.1';
const API_PREVIEW = '7.1-preview.1';

// ---- arguments --------------------------------------------------------------
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const option = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};

const ORG = process.env.AZURE_DEVOPS_ORG || 'neomatixco';
const PROJECT = process.env.AZURE_DEVOPS_PROJECT || 'CareConnect';
const BASE = `https://dev.azure.com/${encodeURIComponent(ORG)}/${encodeURIComponent(PROJECT)}`;
const TOKEN = process.env.AZURE_DEVOPS_PAT || '';
const REPORT = path.resolve(ROOT, option('report', 'reports/PBM-Payer-Module-Full-Run.json'));
const HTML = path.resolve(ROOT, option('html', REPORT.replace(/\.json$/i, '.html')));
const PLAN = option('plan', '');
const SUITE = option('suite', '');
const PUBLISH = flag('publish');
const SCREENSHOTS = !flag('no-screenshots');
const BUGS_FILE = option('bugs', '');
const BUGS = BUGS_FILE ? JSON.parse(fs.readFileSync(path.resolve(ROOT, BUGS_FILE), 'utf8')) : null;
const EXCLUDE = new Set(option('exclude', '').split(',').map((s) => s.trim()).filter(Boolean));
const STAMP = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);

const OUTCOME = { PASS: 'Passed', FAIL: 'Failed', BLOCKED: 'Blocked' };
const RANK = { Failed: 3, Blocked: 2, Passed: 1 };
const COMMENT_MAX = 1000;
const ERROR_MAX = 1000;

const clip = (s, n) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
const fail = (message) => {
  console.error(`\n${message}\n`);
  process.exit(1);
};

// ---- HTTP -------------------------------------------------------------------
const authHeader = () => `Basic ${Buffer.from(`:${TOKEN}`).toString('base64')}`;

/** One REST call, retried on throttling / server errors. Returns { body, headers }. */
async function call(method, url, body) {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const response = await fetch(url, {
      method,
      headers: { Authorization: authHeader(), 'Content-Type': 'application/json', Accept: 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (response.status === 429 || response.status >= 500) {
      const wait = Number(response.headers.get('retry-after')) * 1000 || 2000 * attempt;
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    const text = await response.text();
    if (response.status === 401 || response.status === 203) {
      fail('Azure DevOps refused the token (401). Check that AZURE_DEVOPS_PAT is set, not expired, '
        + `and has "Test Management (Read & write)" scope for the ${ORG} organisation.`);
    }
    if (!response.ok) {
      throw new Error(`${method} ${url.replace(BASE, '')} answered ${response.status}: ${clip(text, 400)}`);
    }
    return { body: text ? JSON.parse(text) : {}, headers: response.headers };
  }
  throw new Error(`${method} ${url.replace(BASE, '')}: still throttled after 4 attempts`);
}

/** Every item of a paged Test Plans listing (x-ms-continuationtoken). */
async function listAll(url) {
  const items = [];
  let token = '';
  do {
    const sep = url.includes('?') ? '&' : '?';
    const { body, headers } = await call('GET', token ? `${url}${sep}continuationToken=${encodeURIComponent(token)}` : url);
    items.push(...(body.value || []));
    token = headers.get('x-ms-continuationtoken') || '';
  } while (token);
  return items;
}

// ---- the report -------------------------------------------------------------
/** The report's cases, one entry per Azure Test Case id. */
function readResults() {
  if (!fs.existsSync(REPORT)) fail(`Report not found: ${REPORT}`);
  const report = JSON.parse(fs.readFileSync(REPORT, 'utf8'));
  // The report MERGES a full run with later re-runs, so neither date alone is
  // "when this ran": say both - the full run's start and when the report was built.
  const builtOn = fs.statSync(REPORT).mtime.toISOString().slice(0, 10);
  const source = `final reviewed payer-module report (full run from ${String(report.runDate || '').slice(0, 10) || 'n/a'}, `
    + `with re-runs and QA-lead decisions; built ${builtOn})`;
  const byId = new Map();
  const skipped = [];
  const notAzure = [];
  for (const story of report.stories || []) {
    for (const c of story.cases || []) {
      if (!/^\d+$/.test(String(c.id))) { notAzure.push({ id: c.id, story: story.name }); continue; }
      if (!OUTCOME[c.status]) { skipped.push({ id: c.id, story: story.name, status: c.status }); continue; }
      const entry = byId.get(c.id) || { id: c.id, story: story.name, rows: [] };
      entry.rows.push(c);
      byId.set(c.id, entry);
    }
  }
  for (const entry of byId.values()) {
    const outcomes = entry.rows.map((r) => OUTCOME[r.status]);
    entry.outcome = outcomes.sort((a, b) => RANK[b] - RANK[a])[0];
    const failing = entry.rows.filter((r) => OUTCOME[r.status] === entry.outcome && r.status !== 'PASS');
    const lines = entry.rows.length === 1
      ? [entry.rows[0].actual || entry.rows[0].expected]
      : entry.rows.map((r, i) => `Row ${i + 1} ${r.status}: ${r.status === 'PASS' ? r.expected : r.actual}`);
    entry.comment = clip(
      `Automated (Playwright), ${source}. ${entry.outcome}. ${lines.join(' | ')}`,
      COMMENT_MAX,
    );
    entry.errorMessage = failing.length ? clip(failing.map((r) => r.actual).join(' | '), ERROR_MAX) : '';
    entry.durationInMs = entry.rows.reduce((sum, r) => sum + (r.steps || []).reduce((s, st) => s + (st.durationMs || 0), 0), 0);
    entry.screenshot = failing.flatMap((r) => (r.steps || []).map((s) => s.screenshot)).find((p) => p && fs.existsSync(p)) || '';
  }
  return { report, results: [...byId.values()], skipped, notAzure };
}

// ---- the plan ---------------------------------------------------------------
async function readPlanPoints(planId) {
  const suites = SUITE
    ? [{ id: Number(SUITE), name: `suite ${SUITE}` }]
    : await listAll(`${BASE}/_apis/testplan/Plans/${planId}/suites?api-version=${API}`);
  const points = [];
  for (const suite of suites) {
    const inSuite = await listAll(`${BASE}/_apis/testplan/Plans/${planId}/Suites/${suite.id}/TestPoint?api-version=${API}`);
    for (const p of inSuite) {
      points.push({
        pointId: p.id,
        testCaseId: String(p.testCaseReference?.id ?? ''),
        testCaseName: p.testCaseReference?.name ?? '',
        suiteId: suite.id,
        suiteName: suite.name,
        configuration: p.configuration?.name ?? '',
        active: p.isActive !== false,
      });
    }
  }
  return { suites, points };
}

// ---- preview ----------------------------------------------------------------
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

function writePreview(model) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const base = path.join(OUT_DIR, `preview-${STAMP}`);
  fs.writeFileSync(`${base}.json`, JSON.stringify(model, null, 2));
  const count = (list, k) => list.filter((r) => r.outcome === k).length;
  const rows = model.toPublish.map((r) => `<tr><td>${esc(r.id)}</td><td>${esc(r.story)}</td><td class="${esc(r.outcome)}">${esc(r.outcome)}</td>`
    + `<td>${esc(r.points.join(', ') || '-')}</td><td>${esc(r.bug || '-')}</td><td>${esc(r.rows)}</td><td>${esc(r.comment)}</td></tr>`).join('');
  const list = (title, items, fmt) => `<h2>${esc(title)} (${items.length})</h2>`
    + (items.length ? `<p class="small">${items.map((x) => esc(fmt(x))).join(' · ')}</p>` : '<p class="small">None.</p>');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Azure publish preview</title>
<style>body{font:14px/1.45 system-ui,sans-serif;margin:24px;color:#1b1b1f;background:#fff}h1{font-size:20px}h2{font-size:16px;margin-top:24px}
table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:4px 6px;vertical-align:top;text-align:left}th{background:#f3f3f6}
.Passed{color:#0a7a33;font-weight:600}.Failed{color:#b3261e;font-weight:600}.Blocked{color:#8a5a00;font-weight:600}.small{font-size:12px;color:#555}
.tile{display:inline-block;margin:0 16px 8px 0;padding:8px 12px;border:1px solid #ddd;border-radius:6px}</style></head><body>
<h1>Azure DevOps publish - ${model.mode === 'publish' ? 'PUBLISHED' : 'preview (nothing was written)'}</h1>
<p class="small">${esc(ORG)}/${esc(PROJECT)} · plan ${esc(model.plan || '(not read - no plan or token)')} · report ${esc(path.relative(ROOT, REPORT))} · ${esc(STAMP)}</p>
<div><span class="tile">To publish: <b>${model.toPublish.length}</b></span><span class="tile Passed">Passed ${count(model.toPublish, 'Passed')}</span>
<span class="tile Failed">Failed ${count(model.toPublish, 'Failed')}</span><span class="tile Blocked">Blocked ${count(model.toPublish, 'Blocked')}</span></div>
${list('Held back by the QA filter - NOT published', model.heldBack, (x) => `${x.id} ${x.outcome} (${x.reason})`)}
${list('In the report but not in the plan - will NOT be published', model.notInPlan, (x) => `${x.id} (${x.story})`)}
${list('In the plan but not in this report - left untouched', model.planOnly, (x) => `${x.testCaseId} ${x.testCaseName}`)}
${list('Skipped in the report - not published', model.skipped, (x) => `${x.id} (${x.status})`)}
${list('Report rows without an Azure id', model.notAzure, (x) => `${x.id} (${x.story})`)}
<h2>Results to publish</h2><table><tr><th>Test case</th><th>Story</th><th>Outcome</th><th>Test point(s)</th><th>Bug</th><th>Rows</th><th>Comment</th></tr>${rows}</table>
</body></html>`;
  fs.writeFileSync(`${base}.html`, html);
  return `${base}.html`;
}

// ---- publish ----------------------------------------------------------------
async function attach(url, file, comment) {
  const stream = fs.readFileSync(file).toString('base64');
  await call('POST', url, { stream, fileName: path.basename(file), comment, attachmentType: 'GeneralAttachment' });
}

async function publish(planId, toPublish, report) {
  const byPoint = new Map();
  for (const r of toPublish) for (const p of r.points) byPoint.set(p, r);
  const runName = option('run-name', `Payer module - automated results, reviewed ${STAMP.slice(0, 10)}`);

  const { body: run } = await call('POST', `${BASE}/_apis/test/runs?api-version=${API}`, {
    name: runName,
    plan: { id: String(planId) },
    pointIds: [...byPoint.keys()],
    automated: false,
    state: 'InProgress',
    comment: 'Published from the final reviewed Playwright report (merged re-runs and QA-lead decisions). See the attached HTML report.',
  });
  console.log(`Created run ${run.id}: ${run.webAccessUrl || ''}`);

  const created = [];
  for (let skip = 0; ; skip += 1000) {
    const { body } = await call('GET', `${BASE}/_apis/test/Runs/${run.id}/results?api-version=${API}&$top=1000&$skip=${skip}`);
    created.push(...(body.value || []));
    if (!body.value || body.value.length < 1000) break;
  }

  const updates = created
    .map((res) => ({ res, r: byPoint.get(Number(res.testPoint?.id)) }))
    .filter((x) => x.r)
    .map(({ res, r }) => ({
      id: res.id,
      outcome: r.outcome,
      state: 'Completed',
      comment: r.comment,
      errorMessage: r.errorMessage || undefined,
      durationInMs: r.durationInMs || undefined,
      associatedBugs: r.bug ? [{ id: String(r.bug) }] : undefined,
    }));
  for (let i = 0; i < updates.length; i += 100) {
    await call('PATCH', `${BASE}/_apis/test/Runs/${run.id}/results?api-version=${API}`, updates.slice(i, i + 100));
    console.log(`  results updated: ${Math.min(i + 100, updates.length)} / ${updates.length}`);
  }

  let shots = 0;
  if (SCREENSHOTS) {
    for (const res of created) {
      const r = byPoint.get(Number(res.testPoint?.id));
      if (!r || !r.screenshot) continue;
      await attach(`${BASE}/_apis/test/Runs/${run.id}/Results/${res.id}/attachments?api-version=${API_PREVIEW}`, r.screenshot, 'Failing step screenshot')
        .then(() => { shots += 1; })
        .catch((e) => console.warn(`  screenshot for ${r.id} not attached: ${e.message}`));
    }
  }
  if (fs.existsSync(HTML)) {
    await attach(`${BASE}/_apis/test/Runs/${run.id}/attachments?api-version=${API_PREVIEW}`, HTML, 'Final reviewed HTML report')
      .catch((e) => console.warn(`  HTML report not attached: ${e.message}`));
  }

  await call('PATCH', `${BASE}/_apis/test/runs/${run.id}?api-version=${API}`, { state: 'Completed' });
  console.log(`Run ${run.id} completed: ${updates.length} result(s), ${shots} screenshot(s).`);
  return { runId: run.id, url: run.webAccessUrl || '', results: updates.length, screenshots: shots };
}

// ---- main -------------------------------------------------------------------
(async () => {
  if (flag('list-plans')) {
    if (!TOKEN) fail('Set AZURE_DEVOPS_PAT first (Test Management read scope is enough to list plans).');
    const plans = await listAll(`${BASE}/_apis/testplan/plans?api-version=${API}`);
    for (const p of plans) console.log(`${String(p.id).padEnd(8)} ${p.name}${p.state ? `  [${p.state}]` : ''}`);
    console.log(`\n${plans.length} plan(s) in ${ORG}/${PROJECT}.`);
    return;
  }

  if (PUBLISH && (!TOKEN || !PLAN)) fail('--publish needs both --plan <id> and the AZURE_DEVOPS_PAT environment variable.');

  const { report, results: read, skipped, notAzure } = readResults();
  // QA filter: excluded ids never go out; with --bugs, only Passed and bug-approved Failed results do.
  const heldBack = [];
  const results = read.filter((r) => {
    if (EXCLUDE.has(r.id)) { heldBack.push({ id: r.id, story: r.story, outcome: r.outcome, reason: 'excluded (--exclude)' }); return false; }
    if (!BUGS) return true;
    if (r.outcome === 'Passed') return true;
    if (r.outcome === 'Failed' && BUGS[r.id]) { r.bug = BUGS[r.id]; return true; }
    heldBack.push({ id: r.id, story: r.story, outcome: r.outcome, reason: r.outcome === 'Failed' ? 'failed - no approved bug' : 'blocked' });
    return false;
  });
  let planOnly = [];
  let notInPlan = [];
  let toPublish = results.map((r) => ({ ...r, points: [] }));

  if (TOKEN && PLAN) {
    const { points } = await readPlanPoints(PLAN);
    const active = points.filter((p) => p.active);
    const byCase = new Map();
    for (const p of active) byCase.set(p.testCaseId, [...(byCase.get(p.testCaseId) || []), p.pointId]);
    toPublish = results.map((r) => ({ ...r, points: byCase.get(r.id) || [] }));
    notInPlan = toPublish.filter((r) => r.points.length === 0).map((r) => ({ id: r.id, story: r.story }));
    toPublish = toPublish.filter((r) => r.points.length > 0);
    const ours = new Set(results.map((r) => r.id));
    planOnly = active.filter((p) => !ours.has(p.testCaseId));
  } else {
    console.log('No plan read (needs --plan and AZURE_DEVOPS_PAT): the preview lists what the REPORT holds, without test points.');
  }

  const model = {
    mode: PUBLISH ? 'publish' : 'preview',
    plan: PLAN,
    org: ORG,
    project: PROJECT,
    report: path.relative(ROOT, REPORT),
    toPublish: toPublish.map((r) => ({ id: r.id, story: r.story, outcome: r.outcome, points: r.points, rows: r.rows.length,
      bug: r.bug || '', comment: r.comment, errorMessage: r.errorMessage, screenshot: r.screenshot })),
    heldBack,
    notInPlan,
    planOnly,
    skipped,
    notAzure,
  };
  const preview = writePreview(model);
  console.log(`Report cases: ${read.length} Azure test case(s) | held back: ${heldBack.length} | to publish: ${toPublish.length} `
    + `(Passed ${toPublish.filter((r) => r.outcome === 'Passed').length}, Failed ${toPublish.filter((r) => r.outcome === 'Failed').length}, `
    + `Blocked ${toPublish.filter((r) => r.outcome === 'Blocked').length}) | `
    + `not in plan: ${notInPlan.length} | plan-only: ${planOnly.length} | skipped: ${skipped.length}`);
  console.log(`Preview: ${path.relative(ROOT, preview)}`);

  if (!PUBLISH) {
    console.log('\nDry run - nothing was written to Azure DevOps. Re-run with --publish to create the test run.');
    return;
  }
  const outcome = await publish(PLAN, toPublish, report);
  fs.writeFileSync(path.join(OUT_DIR, `published-${STAMP}.json`), JSON.stringify({ ...outcome, ...model }, null, 2));
})().catch((e) => fail(`Publish failed: ${e.message}`));
