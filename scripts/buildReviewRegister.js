/**
 * Builds the QA review register: one row per non-passing case, with Expected /
 * Actual / Evidence / QA Assessment / Conclusion, plus the defect candidates,
 * blocked cases, change log, re-run changes and open clarifications.
 *
 *   node scripts/buildReviewRegister.js
 *
 * RULES OF EVIDENCE.
 *  - A verified decision (reports/qa-review/review-decisions.json) always wins.
 *  - "Confirmed defect" only from a verified decision, or from evidence the run
 *    itself attached (the permission-propagation annotation). Pattern matches
 *    on failure text stop at "Potential defect".
 *  - Anything no rule explains is "Insufficient evidence", never a guess.
 *  - Original (4-5 Oct) results are shown beside current ones, never replaced.
 */
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const { storyOfFolder, storyOfName, workItemUrl } = require('./azureIds');

const ROOT = path.resolve(__dirname, '..');
const Q = path.join(ROOT, 'reports', 'qa-review');
// The latest results: the full run, the 6 Oct folder re-run, and the 11 Oct
// targeted re-runs layered case by case (scripts/mergeLayers.js). The 6 Oct
// snapshot stays in reports/qa-review as history.
const CURRENT = JSON.parse(fs.readFileSync(
  process.env.REVIEW_CURRENT || path.join(Q, 'results-current-2026-10-11.json'), 'utf8'));
/** Result layers, oldest first - later layers supply the annotations of the cases they re-ran. */
const LAYERS = (process.env.REVIEW_LAYERS
  || 'reports/partials,reports/partials-rerun-batch1-20261011,reports/partials-rerun-batch2-20261011,reports/partials-rerun-batch3-20261011,reports/partials-rerun-batch4-20261011,reports/partials-rerun-batch4b-20261011,reports/partials-rerun-batch5-20261011,reports/partials-rerun-batch6-20261011,reports/partials-rerun-batch6b-20261011,reports/partials-rerun-batch7-20261011,reports/partials-rerun-batch8-20261012,reports/partials-rerun-batch9-20261012,reports/partials-rerun-batch10-20261012,reports/partials-rerun-batch11-20261013,reports/partials-rerun-batch12-20261013,reports/partials-rerun-batch13-20261013,reports/partials-rerun-batch14-20261013,reports/partials-rerun-batch15-20261013,reports/partials-rerun-batch16-20261013,reports/partials-rerun-batch16b-20261013,reports/partials-rerun-batch17-20261018,reports/partials-rerun-batch17b-20261018,reports/partials-rerun-batch18-20261018,reports/partials-rerun-batch19-20261018,reports/partials-rerun-batch20-20261018,reports/partials-rerun-batch20b-20261018,reports/partials-rerun-batch21-20261018,reports/partials-rerun-batch21b-20261018,reports/partials-rerun-batch22-20261019,reports/partials-rerun-batch23-20261019,reports/partials-rerun-batch24-20261019,reports/partials-rerun-batch25-20261019,reports/partials-rerun-batch25b-20261019,reports/partials-rerun-batch25c-20261019,reports/partials-rerun-batch25d-20261019')
  .split(',').map((d) => path.join(ROOT, d.trim())).filter((d) => fs.existsSync(d));
const ORIGINAL = JSON.parse(fs.readFileSync(path.join(Q, 'results-fullrun-2026-10-05.json'), 'utf8'));
const DECISIONS = JSON.parse(fs.readFileSync(path.join(Q, 'review-decisions.json'), 'utf8')).decisions;
const PARTIALS = path.join(ROOT, 'reports', 'partials');
const PARTIALS_ORIG = path.join(ROOT, 'reports', 'partials-fullrun-20261005');
const SHOTS = 'C:/AutomationArtifacts/PBM/FailedScreenshots';
const OUT = path.join(Q, 'PBM-QA-Review-Register.xlsx');

const norm = (s) => String(s || '').toLowerCase().replace(/^\d+:\s*/, '').replace(/[^a-z0-9]+/g, '');
const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

// ---- which folders the 6 Oct re-run replaced -------------------------------
const RERUN = new Set(
  fs.readdirSync(PARTIALS).filter((f) => /^\d\d\.json$/.test(f))
    .filter((f) => !fs.existsSync(path.join(PARTIALS_ORIG, f))
      || !fs.readFileSync(path.join(PARTIALS, f)).equals(fs.readFileSync(path.join(PARTIALS_ORIG, f))))
    .map((f) => f.slice(0, 2)),
);

// ---- per-test folder + annotations, from the raw Playwright results ----------
const raw = new Map(); // key id|norm(title) -> { folder, annotations, layer }
for (const dir of LAYERS) {
  const layer = path.basename(dir);
  for (const f of fs.readdirSync(dir).filter((x) => /^\d\d\.json$/.test(x))) {
    const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    (function walk(suites) {
      for (const s of suites || []) {
        for (const spec of s.specs || []) {
          const id = (spec.title.match(/^(\d+)/) || [, ''])[1];
          for (const t of spec.tests || []) raw.set(`${id}|${norm(spec.title)}`, { folder: f.slice(0, 2), annotations: t.annotations || [], layer });
        }
        walk(s.suites);
      }
    })(j.suites);
  }
}

// ---- screenshot index -------------------------------------------------------
const shots = new Map(); // id -> [{day, file}]
if (fs.existsSync(SHOTS)) {
  for (const dir of fs.readdirSync(SHOTS)) {
    const full = path.join(SHOTS, dir);
    if (!fs.statSync(full).isDirectory()) continue;
    for (const file of fs.readdirSync(full)) {
      const id = (file.match(/^(\d{5})__/) || [, ''])[1];
      if (!id) continue;
      if (!shots.has(id)) shots.set(id, []);
      shots.get(id).push({ day: dir.slice(0, 10), file: `${SHOTS}/${dir}/${file}` });
    }
  }
}
const evidenceShots = (id, rerun, rerun11) => {
  const days = rerun11 ? ['2026-10-11'] : rerun ? ['2026-10-06'] : ['2026-10-04', '2026-10-05'];
  const list = (shots.get(String(id)) || []).filter((s) => days.includes(s.day));
  const steps = list.filter((s) => /_step-/.test(s.file));
  return (steps.length ? steps : list).slice(-2).map((s) => s.file);
};

// ---- original results, for history ------------------------------------------
const original = new Map();
for (const st of ORIGINAL.stories) for (const c of st.cases) original.set(`${st.name}|${c.id}|${norm(c.expected)}`, c.status);

// ---- classification ----------------------------------------------------------
const OVERRIDES = fs.existsSync(path.join(Q, 'report-overrides.json'))
  ? JSON.parse(fs.readFileSync(path.join(Q, 'report-overrides.json'), 'utf8'))
  : { statusOverrides: [], removeStories: [] };
const removedStory = (name) => (OVERRIDES.removeStories || []).find((r) => r.name === name) || null;
const reportedAs = (id, status) => {
  const o = (OVERRIDES.statusOverrides || []).find((x) => x.cases.includes(String(id)));
  return o && o.status !== status ? `${o.status} (${o.ref})` : status;
};

const decisionFor = (id) => DECISIONS.filter((d) => d.cases.includes(String(id))).slice(-1)[0] || null;

const RULES = [
  {
    when: (c) => c.annotations.some((a) => a.type === 'permission-not-propagated'),
    conclusion: 'Confirmed defect',
    group: 'Permission removed from a role is still effective for its users',
    assessment: 'The permission was taken off the "Payer Admin" role and the removal is stored, yet after a fresh sign-in the application still grants it to the account (GetCurrentUserRolesAndPermissions) and the control stays available. The run recorded this directly. Per the QA lead (2026-10-06) the control appearing is a defect; the evidence points at permission propagation rather than at the screen.',
    action: 'Attach to the permission-propagation bug.',
  },
  {
    // The run states this one itself: the suite's own guard refused to touch a
    // record reserved for other stories, so the feature was never exercised.
    when: (c) => /\[ProtectedData\] Refusing/.test(c.actual),
    conclusion: 'Test issue',
    group: 'Automation: precondition used a protected seed record',
    assessment: 'The suite\'s protected-data guard refused to modify a seeded record the precondition picked. The behaviour under test was not exercised.',
    action: 'Make the fixture create its own disposable record, then re-run.',
  },
  {
    when: (c) => c.status === 'FAIL' && /exceeded the test timeout|Tearing down|browserType\.launch|waitForURL: Timeout|net::ERR_/i.test(c.actual),
    conclusion: 'Environment issue',
    group: 'Run-time: timeout, machine sleep or network',
    assessment: 'The case stopped on a run-time timeout or connection error, not on an assertion about the feature. Nothing about the expected behaviour was observed.',
    action: 'Re-run. Escalate only if it recurs on a healthy run.',
  },
  {
    when: (c) => /must not be offered|should be withheld|role without|non-administrator should not|was offered|should be shown no payer|stripped of every|must not offer a usable|should not be offered|lacks .*permission|withheld from this role|should not be shown/i.test(c.actual),
    conclusion: 'Potential defect',
    group: 'Control or data available to a role that should not have it',
    assessment: 'A control or record was available to a role that, by its definition or its shaped permissions, should not have it. No propagation evidence was attached to this case, so the cause is not yet established - most likely the same propagation fault.',
    action: 'Verify the account\'s effective permissions for this case, then attach to the permission bug or raise separately.',
  },
  {
    when: (c) => /acceptance criteria require|criteria describe a control|requires a Clone action|No Withdraw action|Bulk Import control|catalogue should reach beyond|should come from a lookup service|no filtered scope|should offer a "filtered" scope|the menu offers: selected, all/i.test(c.actual),
    conclusion: 'Potential defect',
    group: 'Specified functionality not present in the application',
    assessment: 'The acceptance criteria describe a control or behaviour the application does not offer. Either it is not built yet or it is out of scope for this release.',
    action: 'Confirm scope with the BA; if in scope, raise as missing functionality.',
  },
  {
    when: (c) => /audit trail|trail should|history should show|should be traceable|trail carries|separate entries|trail holds/i.test(c.actual),
    conclusion: 'Potential defect',
    group: 'Event not recorded in the audit trail or history',
    assessment: 'The action completed but the expected audit or history entry was not found.',
    action: 'Confirm the AC requires this entry; check the audit screen manually; raise if confirmed.',
  },
  {
    when: (c) => /rapid clicks|clicks should send|should reach the server once|repeated trigger/i.test(c.actual),
    conclusion: 'Potential defect',
    group: 'Repeated clicks send duplicate requests (no debounce)',
    assessment: 'Several quick clicks produced more than one server request; the run counted the requests on the wire.',
    action: 'Reproduce manually with the network panel open; raise if confirmed.',
  },
  {
    when: (c) => /is listed as "|section should offer "|not offered under a name that matches|still shows the English text|fully translated|partly left in English/i.test(c.actual),
    conclusion: 'Potential defect',
    group: 'Labels not bilingual or not human-readable',
    assessment: 'Text expected in a readable, translated form is shown as a raw code or left in English.',
    action: 'Confirm the expected labels against the AC; raise if confirmed.',
  },
  {
    when: (c) => /should state|should say|should explain|should mention|should tell|should report|showed: \(nothing\)|should be told|not left guessing|answered 200|explicit empty state|should be illustrated|offer a way to dismiss|no dismiss control|silent blank|should demand|says why/i.test(c.actual),
    conclusion: 'Potential defect',
    group: 'Action completed or refused without the expected feedback',
    assessment: 'The application acted (or refused to) without showing the message or state the AC expects.',
    action: 'Check the exact expected wording in the AC; reproduce manually; raise if confirmed.',
  },
  {
    when: (c) => ['02', '03'].includes(c.folder) && c.status === 'FAIL',
    conclusion: 'Potential defect',
    group: 'Payer list Status filter returns rows of other statuses',
    assessment: 'Filter or search results do not match the selected criteria, or do not restore. Same component as the confirmed defect 14393 (decision D-003).',
    action: 'Review the step screenshot; attach to the 14393 bug if it shows the same leak.',
  },
  {
    when: (c) => /duplicate/i.test(c.actual) || /duplicate/i.test(c.expected),
    conclusion: 'Potential defect',
    group: 'Duplicate record accepted without being flagged',
    assessment: 'A record matching an existing one was not flagged or refused as the AC expects.',
    action: 'Reproduce manually; raise if confirmed.',
  },
];

const FALLBACK = {
  conclusion: 'Insufficient evidence',
  group: 'Needs manual review',
  assessment: 'The failure text alone does not identify the cause. Review the step screenshot and the log before classifying.',
  action: 'Manual review of the screenshot and log.',
};

function classify(c) {
  const removed = removedStory(c.story);
  if (removed) return { conclusion: 'Excluded from report', group: removed.reason, assessment: `Not reported, by QA-lead decision ${removed.ref}: ${removed.reason}`, action: 'None - kept here as evidence only.', decision: removed.ref };
  const d = decisionFor(c.id);
  if (d) return { conclusion: d.conclusion, group: d.group, assessment: d.assessment, action: d.action, decision: d.id, extraEvidence: d.evidence };
  // A case that never ran is not evidence of anything about the product, so
  // the failure rules are not applied to it - it is categorised by its
  // precondition on the Blocked sheet instead.
  if (c.status !== 'FAIL') {
    return { conclusion: 'Not executed (blocked)', group: '', assessment: 'The behaviour under test was not exercised; see the precondition category.', action: '', decision: '' };
  }
  const r = RULES.find((rule) => rule.when(c)) || FALLBACK;
  return { conclusion: r.conclusion, group: r.group, assessment: r.assessment, action: r.action, decision: '' };
}

// ---- assemble the case list ------------------------------------------------------
const rows = [];
for (const st of CURRENT.stories) {
  for (const c of st.cases) {
    const meta = raw.get(`${c.id}|${norm(c.expected)}`) || { folder: '', annotations: [] };
    const rerun = RERUN.has(meta.folder);
    const row = {
      folder: meta.folder,
      story: st.name,
      azureStory: st.azureStoryId || storyOfFolder(meta.folder)?.id || storyOfName(st.name)?.id || '',
      id: String(c.id),
      // Readable form (QA-lead note N-016): the claim as a sentence, then the
      // case's own steps, which state each expected outcome.
      expected: [
        clean(c.expected).replace(/^Should\s+/i, 'The system should ').replace(/([^.!?])$/, '$1.'),
        ...(c.steps || []).map((s, i) => `${i + 1}) ${clean(s.name)}`),
      ].join('\n'),
      actual: clean(c.actual),
      status: c.status,
      reported: reportedAs(c.id, c.status),
      original: original.get(`${st.name}|${c.id}|${norm(c.expected)}`) || '(not in full run)',
      rerun,
      rerun11: /rerun-batch/.test(meta.layer || ''),
      layer: meta.layer || '',
      annotations: meta.annotations,
    };
    if (row.status === 'PASS') continue;
    const k = classify(row);
    const ann = meta.annotations.filter((a) => a.type === 'permission-not-propagated').map((a) => `Run annotation: ${clean(a.description).slice(0, 300)}`);
    row.evidence = [
      ...evidenceShots(row.id, rerun, row.rerun11).map((f) => `Screenshot: ${f}`),
      `Log: reports/${/rerun-batch/.test(meta.layer || '') ? meta.layer : (rerun ? 'partials' : 'partials-fullrun-20261005')}/run-${meta.folder}.log`,
      ...ann,
      ...(k.extraEvidence ? [`Verified: ${k.extraEvidence}`] : []),
    ].join('\n');
    Object.assign(row, k);
    rows.push(row);
  }
}

// ---- workbook ------------------------------------------------------------------------
const wb = new ExcelJS.Workbook();
wb.creator = 'PBM QA Automation';
wb.created = new Date();

const HEAD = { font: { bold: true, color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F5F63' } } };
const COLOR = {
  'Confirmed defect': 'FFF8D7DA', 'Potential defect': 'FFFFF3CD', 'Test issue': 'FFD1ECF1',
  'Environment issue': 'FFE2E3E5', 'Requirement ambiguity': 'FFE8DAEF', 'Insufficient evidence': 'FFFFFFFF',
};
function sheet(name, columns, data, colorKey) {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = columns;
  ws.getRow(1).eachCell((cell) => Object.assign(cell, HEAD));
  for (const d of data) {
    const r = ws.addRow(d);
    r.alignment = { wrapText: true, vertical: 'top' };
    if (colorKey && COLOR[d[colorKey]]) r.getCell(colorKey).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR[d[colorKey]] } };
    // Azure ids open their work item (2026-10-12): a single id becomes a link.
    for (const key of ['azureStory', 'id']) {
      if (!columns.some((c) => c.key === key) || !/^\d{5}$/.test(String(d[key] || ''))) continue;
      if (key === 'id' && !columns.some((c) => c.key === 'azureStory')) continue;
      r.getCell(key).value = { text: String(d[key]), hyperlink: workItemUrl(d[key]) };
      r.getCell(key).font = { color: { argb: 'FF0F5F63' }, underline: true };
    }
  }
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  return ws;
}

const caseCols = [
  { header: 'Folder', key: 'folder', width: 7 },
  { header: 'User story', key: 'story', width: 30 },
  { header: 'Azure User Story', key: 'azureStory', width: 11 },
  { header: 'Case ID', key: 'id', width: 9 },
  { header: 'Result 4-5 Oct (original)', key: 'original', width: 14 },
  { header: 'Run result now', key: 'status', width: 11 },
  { header: 'Reported as', key: 'reported', width: 14 },
  { header: 'Re-run 6 Oct', key: 'rerunText', width: 9 },
  { header: 'Re-run 11 Oct', key: 'rerun11Text', width: 9 },
  { header: 'Expected result', key: 'expected', width: 42 },
  { header: 'Actual result', key: 'actual', width: 60 },
  { header: 'Observed evidence', key: 'evidence', width: 60 },
  { header: 'QA assessment', key: 'assessment', width: 55 },
  { header: 'Conclusion', key: 'conclusion', width: 18 },
  { header: 'Root-cause group', key: 'group', width: 34 },
  { header: 'Next action', key: 'action', width: 36 },
  { header: 'Decision ref', key: 'decision', width: 9 },
  { header: 'Reviewer notes', key: 'notes', width: 30 },
];
const asRow = (r) => ({ ...r, rerunText: r.rerun ? 'Yes' : '', rerun11Text: r.rerun11 ? 'Yes' : '' });

// Summary
const fails = rows.filter((r) => r.status === 'FAIL');
const blocked = rows.filter((r) => r.status === 'BLOCKED');
const by = (list, k) => list.reduce((m, r) => ({ ...m, [r[k]]: (m[r[k]] || 0) + 1 }), {});
const ws0 = wb.addWorksheet('Summary');
ws0.columns = [{ width: 46 }, { width: 12 }];
const put = (a, b, bold) => { const r = ws0.addRow([a, b]); if (bold) r.font = { bold: true }; };
put('PBM Payer Module - QA review register', '', true);
put(`Built ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC from the run of 4-5 Oct with 17 stories re-run 6 Oct`);
put('');
put('Results in scope (automated only, manual stories excluded)', '', true);
for (const [k, v] of Object.entries(CURRENT.totals)) put(k, v);
put('');
put('FAILED cases by conclusion', '', true);
for (const [k, v] of Object.entries(by(fails, 'conclusion')).sort((a, b) => b[1] - a[1])) put(k, v);
put('');
put('BLOCKED cases by conclusion', '', true);
for (const [k, v] of Object.entries(by(blocked, 'conclusion')).sort((a, b) => b[1] - a[1])) put(k, v);
put('');
put('How to read this', '', true);
put('Confirmed defect - verified by evidence or a QA-lead decision.');
put('Potential defect - the failure text points at the product; needs manual confirmation before a bug is raised.');
put('Test issue / Environment issue - not a product result; fix or re-run.');
put('Insufficient evidence - nothing classified it; review the screenshot and log.');
put('Original results are kept beside current ones; nothing is overwritten.');

sheet('Failed cases', caseCols, fails.map(asRow), 'conclusion');

// Blocked: categorise the precondition, decisions first
const blockedCat = (r) => {
  if (r.decision) return r.group;
  const a = r.actual;
  if (/waitForURL: Timeout|Timeout \d+ms exceeded/i.test(a)) return 'Run-time failure during setup - re-run';
  if (/Clone action|feature has landed|no Withdraw|offers no|does not offer one|no field-level|has not been observed/i.test(a)) return 'Feature not present in the application';
  if (/two accounts|TWO accounts|second account|THREE distinct|role per combination|an account (holding|with|assigned)|administrator|reviewer|checker|integration or service account|two credentials|consuming-module user|reshaped|Full, Partial and No-scope/i.test(a)) return 'Needs additional user accounts or roles';
  // ORDER MATTERS (2026-10-12): "expiry" appears in many reasons, so the old
  // single expir|job test filed policy-owner and environment-state cases as
  // "needs time to pass". Exploratory and linked-data needs are read first;
  // infrastructure (a job that must fire, a restart, server logs) is told apart
  // from a payer STATE that only time produces - the latter could be seeded.
  if (/exploratory/i.test(a)) return 'Exploratory - manual by nature';
  if (/data-layer|host access|server log|restart/i.test(a)) return 'Needs data-layer or host access';
  if (/polic(y|ies)|\bplans?\b|\bmembers?\b|facilit/i.test(a)) return 'Needs linked plans / policies / members / facilities';
  // Covered by manual testing, or needing the job itself to fire: time-bound.
  if (/agreed to cover by manual|manual testing|job runs nightly|job to (fire|be running)|fast-forward|recalculation|next day|daily/i.test(a)) return 'Needs time to pass or a scheduled-job trigger';
  // Only a payer STATE is missing - one that could be seeded.
  if (/expir|EXPIRED|PENDING|\bPending\b|NO payer is Active/i.test(a)) return 'Needs a payer state only reachable over time (Expired / Pending)';
  if (/CRON|nightly|cannot be triggered|job|schedule|seeded payers|clock/i.test(a)) return 'Needs time to pass or a scheduled-job trigger';
  if (/blank|mandatory|rejects any|corrupt|null status|data-layer|deleted|collision|in the past|duplicate to ARISE|irreversible/i.test(a)) return 'Needs data the interface cannot create';
  if (/shared, live records|two assigned payers/i.test(a)) return 'Would modify shared live payers (Al Dawaa / NUPCO)';
  if (/exploratory/i.test(a)) return 'Exploratory - manual by nature';
  if (/version|history|revert|Rejected|publish/i.test(a)) return 'Needs a specific version-history state';
  if (/network/i.test(a)) return 'Needs a specific network state';
  return 'Other precondition - review';
};
sheet('Blocked cases', [
  { header: 'Folder', key: 'folder', width: 7 },
  { header: 'User story', key: 'story', width: 30 },
  { header: 'Azure User Story', key: 'azureStory', width: 11 },
  { header: 'Case ID', key: 'id', width: 9 },
  { header: 'Result 4-5 Oct (original)', key: 'original', width: 14 },
  { header: 'Re-run 6 Oct', key: 'rerunText', width: 9 },
  { header: 'Re-run 11 Oct', key: 'rerun11Text', width: 9 },
  { header: 'Expected result', key: 'expected', width: 45 },
  { header: 'Why it could not run', key: 'actual', width: 70 },
  { header: 'Precondition category', key: 'category', width: 34 },
  { header: 'Conclusion', key: 'conclusion', width: 18 },
  { header: 'Next action', key: 'action', width: 34 },
  { header: 'Reviewer notes', key: 'notes', width: 30 },
], blocked.map((r) => {
  const category = blockedCat(r);
  const actionable = /re-run/i.test(category) || r.decision;
  return {
    ...asRow(r), category,
    conclusion: r.decision ? r.conclusion : 'Not executed (blocked)',
    action: r.decision ? r.action : (actionable ? 'Re-run' : 'Provide the precondition, or accept as blocked'),
  };
}), 'conclusion');

// Defect candidates
const defects = Object.values(fails.concat(blocked)
  .filter((r) => /defect/i.test(r.conclusion))
  .reduce((m, r) => {
    const g = m[r.group] || { group: r.group, conclusion: r.conclusion, cases: [], stories: new Set(), evidence: '' };
    g.cases.push(r.id); g.stories.add(r.azureStory ? `US ${r.azureStory} ${r.story}` : r.story);
    if (r.conclusion === 'Confirmed defect') g.conclusion = 'Confirmed defect';
    if (!g.evidence) g.evidence = r.evidence.split('\n')[0] || '';
    m[r.group] = g; return m;
  }, {}))
  .sort((a, b) => (a.conclusion === b.conclusion ? b.cases.length - a.cases.length : a.conclusion === 'Confirmed defect' ? -1 : 1));
sheet('Defect candidates', [
  { header: 'Draft bug title', key: 'group', width: 50 },
  { header: 'Conclusion', key: 'conclusion', width: 18 },
  { header: 'Cases', key: 'count', width: 7 },
  { header: 'Case IDs', key: 'ids', width: 50 },
  { header: 'User stories affected', key: 'stories', width: 55 },
  { header: 'Representative evidence', key: 'evidence', width: 60 },
  { header: 'Bug status', key: 'bug', width: 20 },
], defects.map((g) => ({
  group: g.group, conclusion: g.conclusion, count: g.cases.length, ids: g.cases.join(', '),
  stories: [...g.stories].join('; '), evidence: g.evidence, bug: 'Draft - for QA lead review',
})), 'conclusion');

// Re-run changes (historical record)
const changes = [];
for (const st of CURRENT.stories) {
  for (const c of st.cases) {
    const was = original.get(`${st.name}|${c.id}|${norm(c.expected)}`) || '(not in full run)';
    if (was !== c.status) changes.push({ story: st.name, azureStory: st.azureStoryId || storyOfName(st.name)?.id || '', id: String(c.id), was, now: c.status, actual: clean(c.actual).slice(0, 400) });
  }
}
sheet('Re-run changes', [
  { header: 'User story', key: 'story', width: 34 },
  { header: 'Azure User Story', key: 'azureStory', width: 11 },
  { header: 'Case ID', key: 'id', width: 9 },
  { header: '4-5 Oct', key: 'was', width: 12 },
  { header: 'After 6 Oct re-run', key: 'now', width: 14 },
  { header: 'Result after the re-run', key: 'actual', width: 90 },
], changes);

// Change log
sheet('Change log', [
  { header: 'Date', key: 'date', width: 11 },
  { header: 'Change', key: 'change', width: 50 },
  { header: 'Type', key: 'type', width: 18 },
  { header: 'Why', key: 'why', width: 55 },
  { header: 'Evidence', key: 'evidence', width: 50 },
  { header: 'Cases affected', key: 'cases', width: 40 },
  { header: 'Regression needed', key: 'regression', width: 30 },
], [
  { date: '2026-10-06', change: '"Select a Payer" gate answered on every module (BasePage.answerPayerScopeGate); "All Payers" preferred when offered', type: 'Automation fix', why: 'The gate was only answered on the Payer module, so consuming-module stories failed behind an undismissed modal.', evidence: 'Screenshots of the modal in folders 09, 21 and 59.', cases: 'Folders 09, 21, 32, 39, 40 (re-run 6 Oct); 58, 59, 60 (pending re-run)', regression: 'Yes - re-run 58, 59, 60' },
  { date: '2026-10-06', change: 'Network attached before approval only for never-published payers (PayerManagementPage.ensureNetworkForApproval)', type: 'Automation fix', why: 'An unreadable count was treated as "no network", so payers in dependency stories were given a dependency.', evidence: 'Folder 06 log: six "assigning one" events in a story about payers with no dependencies.', cases: 'Folders 06, 22, 27', regression: 'Done in the 6 Oct re-run' },
  { date: '2026-10-06', change: 'Role restore after permission shaping undone in reverse order (shapedNonAdmin)', type: 'Automation fix', why: 'Forward-order restore could leave the shared role holding a permission it never had.', evidence: 'Code review of the teardown.', cases: 'All permission cases', regression: 'Covered by the 6 Oct re-run' },
  { date: '2026-10-06', change: 'Six BLOCKED cases converted to real tests using the role-editing scenario', type: 'Test case update (QA-lead decision)', why: 'QA lead: edit the Payer Admin role, untick the right, sign in as the non-admin; the control appearing is a bug.', evidence: 'QA-lead instruction, 2026-10-06.', cases: '15386, 15392, 15456, 15791, 15794, 15796', regression: 'Executed 6 Oct' },
  { date: '2026-10-07', change: 'Report: 6 manual stories (86 cases) excluded; running time = active time', type: 'Report change', why: 'Only automated results belong in the report; sleep periods are not execution time.', evidence: 'Log-gap measurement: 9h 35m asleep during 4-5 Oct.', cases: 'All totals and percentages', regression: 'No' },
  { date: '2026-10-11', change: 'Report: "Actual result" keeps the test\'s own failure explanation', type: 'Report change', why: '36 failed cases showed only "Observed false - expected true"; the explanation the test wrote (e.g. 15578: "the submission did not reach the queue") was discarded. Bug reports are written from this text.', evidence: 'Raw Playwright error messages vs report text, compared case by case.', cases: '36 failed cases; no status changed', regression: 'No - wording only' },
  ...DECISIONS.map((d) => ({ date: d.date, change: `${d.id}: ${d.group}`, type: `Review decision - ${d.conclusion}`, why: d.assessment, evidence: d.evidence, cases: d.cases.join(', '), regression: /re-run/i.test(d.action) ? 'Yes - ' + d.action : 'No' })),
]);

// Clarifications
sheet('Clarifications needed', [
  { header: '#', key: 'n', width: 4 },
  { header: 'Question', key: 'q', width: 70 },
  { header: 'Why it matters', key: 'why', width: 55 },
  { header: 'Cases', key: 'cases', width: 22 },
  { header: 'Owner', key: 'owner', width: 12 },
  { header: 'Answer', key: 'answer', width: 40 },
], [
  { n: 1, q: 'Can a payer remove its LAST network? A payer cannot be approved without one (rule of 2026-09-27); the removal story never says what happens to the last one.', why: 'Possible gap between two rules; no case covers it.', cases: 'Story 59 (new case)', owner: 'BA' },
  { n: 2, q: 'Should the "Payer Admin" role be offered Add Payer and Delete? Its definition says no create and no delete, yet the interface offers both.', why: 'Decides whether those failures are defects or the definition is wrong.', cases: '14520 and other create/delete access cases', owner: 'BA' },
  { n: 3, q: 'Are Bulk Import, Clone and Withdraw in scope for this release?', why: 'Their cases are failing/blocked on missing features; out-of-scope features should not be reported as defects.', cases: '16430, Clone story, Withdraw cases', owner: 'BA / PO' },
  { n: 4, q: 'Which default sort does the payer list use? The AC (updated 2026-09-27) says "Newest to Oldest"; the control shows "Sort By".', why: 'Decides whether the sort cases are a defect or need re-baselining.', cases: '14421, 14430, 14438', owner: 'BA' },
  { n: 5, q: 'Does reactivation require a reason? Sheet 41 TC-566 says no; the story case expects one.', why: 'Conflicting requirements - one of the two cases must change.', cases: '14762', owner: 'BA' },
  { n: 7, q: 'Which control does "Return Only Active Payers in Cross-Module Payer Selection" govern now? The Plans list no longer has its own payer filter; the payer is chosen in the global scope selector, which on Plans does not offer All Payers.', why: 'Ten cases wait on a control the design removed (decision D-006). Cannot be judged until answered.', cases: 'Folder 09 (10 cases)', owner: 'BA' },
  { n: 6, q: 'Should Country start blank? The AC asks for a deliberate choice; the form pre-selects Saudi Arabia.', why: 'Defect or accepted default.', cases: '14493', owner: 'BA' },
]);

// QA-lead notes, one row each, with the evidence and where each stands.
const TRACKER = path.join(Q, 'notes-tracker.json');
if (fs.existsSync(TRACKER)) {
  const notes = JSON.parse(fs.readFileSync(TRACKER, 'utf8')).notes;
  const order = { 'held-evidence-conflict': 0, 'needs-clarification': 1, 'ask-later': 2, 'code-pending': 3, 'rerun-pending': 4, 'code-done': 5, 're-run 11 Oct': 6, applied: 7, answered: 8 };
  const ws = sheet('QA-lead notes', [
    { header: 'Ref', key: 'ref', width: 7 },
    { header: 'Status', key: 'status', width: 20 },
    { header: 'Cases / story', key: 'scope', width: 30 },
    { header: 'Type', key: 'type', width: 18 },
    { header: 'Note (QA lead)', key: 'note', width: 55 },
    { header: 'What the evidence says', key: 'evidence', width: 60 },
    { header: 'Action', key: 'action', width: 45 },
    { header: 'Done (what changed)', key: 'done', width: 50 },
    { header: 'Result 11 Oct re-run', key: 'result11Oct', width: 34 },
    { header: 'Question for the QA lead', key: 'question', width: 45 },
  ], notes
    .map((n) => ({ ...n, scope: n.cases ? n.cases.join(', ') : n.story, evidence: n.evidence || '', question: n.question || '', done: n.done || '', result11Oct: n.result11Oct || '' }))
    .sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || a.ref.localeCompare(b.ref)));
  const tint = { 'held-evidence-conflict': 'FFF8D7DA', 'needs-clarification': 'FFFFF3CD', 'ask-later': 'FFFFF3CD', applied: 'FFD4EDDA', answered: 'FFD4EDDA' };
  ws.eachRow((row, i) => {
    if (i === 1) return;
    const argb = tint[row.getCell('status').value];
    if (argb) row.getCell('status').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
  });
}

fs.mkdirSync(Q, { recursive: true });
wb.xlsx.writeFile(OUT).then(() => {
  console.log(`written: ${path.relative(ROOT, OUT)}`);
  console.log(`failed: ${fails.length} ->`, JSON.stringify(by(fails, 'conclusion')));
  console.log(`blocked: ${blocked.length} ->`, JSON.stringify(by(blocked, 'conclusion')));
  console.log(`defect candidates: ${defects.length} groups | re-run changes: ${changes.length} | decisions applied: ${DECISIONS.length}`);
});
