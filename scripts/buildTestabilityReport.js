/**
 * Testability report: every payer test case that is not testable, invalid,
 * not implemented, not reproducible, too high-level, blocked, or a business gap.
 *
 *   node scripts/buildTestabilityReport.js
 *   -> reports/PBM-Payer-Testability-Report.xlsx and .html
 *
 * EVIDENCE ONLY. A case is put in a category only when a recorded source says
 * so: a QA-lead decision (report-overrides.json, N-refs), a verified decision
 * (review-decisions.json, D-refs), an open question in the review register,
 * or the register's own precondition / root-cause category. Each row names its
 * source. A case no source places in one of the seven categories is not
 * guessed into one - it stays in "All cases" with its current result.
 *
 * ONE CATEGORY PER CASE, by this precedence (first match wins):
 *   1 manual story            -> Not testable
 *   2 story removed by the QA lead -> per the removal reason
 *   3 open requirement question / ambiguity decision -> Business gap
 *   4 QA-lead "invalid" decision -> Invalid
 *   5 functionality absent     -> Feature not implemented
 *   6 exploratory by nature    -> High level
 *   7 needs time / a scheduled job -> Not testable
 *   8 result not reproducible  -> Can't reproduce
 *   9 any other BLOCKED        -> Blocked
 */
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const { storyOfFolder, workItemUrl } = require('./azureIds');

const ROOT = path.resolve(__dirname, '..');
const Q = path.join(ROOT, 'reports', 'qa-review');
const RUN = JSON.parse(fs.readFileSync(path.join(Q, 'results-current-2026-10-11.json'), 'utf8'));
const FINAL = JSON.parse(fs.readFileSync(path.join(ROOT, 'reports', 'PBM-Payer-Module-Full-Run.json'), 'utf8'));
const LISTING = JSON.parse(fs.readFileSync(path.join(Q, 'current-tests-2026-10-13.json'), 'utf8'));
const OVERRIDES = JSON.parse(fs.readFileSync(path.join(Q, 'report-overrides.json'), 'utf8'));
const DECISIONS = JSON.parse(fs.readFileSync(path.join(Q, 'review-decisions.json'), 'utf8')).decisions;
const REGISTER = path.join(Q, 'PBM-QA-Review-Register.xlsx');
const OUT = path.join(ROOT, 'reports', 'PBM-Payer-Testability-Report');

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const readable = (expected) => clean(expected).replace(/^Should\s+/i, 'The system should ').replace(/([^.!?])$/, '$1.');
const cellText = (v) => (v && typeof v === 'object' ? (v.text ?? v.result ?? '') : (v ?? ''));

// ---- the categories ---------------------------------------------------------
const CATEGORY = {
  notTestable: {
    name: 'Not testable',
    meaning: 'Cannot be exercised by automation in this environment as written: it needs a scheduled job to fire, data-layer or server access, or is to be tested manually by QA-lead decision.',
    owner: 'QA - manual execution',
  },
  invalid: {
    name: 'Invalid',
    meaning: 'The test case does not match the product as designed, or belongs to another module - by QA-lead decision.',
    owner: 'QA lead - rework or retire the test case in Azure',
  },
  notImplemented: {
    name: 'Feature not implemented',
    meaning: 'The acceptance criteria describe a control or function the application does not offer (yet).',
    owner: 'BA / PO - confirm scope; Dev if in scope',
  },
  cantReproduce: {
    name: "Can't reproduce",
    meaning: 'The recorded result could not be reproduced or confirmed: a QA-lead pass the automation could not confirm, a result that conflicts with the QA-lead note, or a run-time failure (timeout) that observed nothing about the feature.',
    owner: 'QA - re-run or check manually',
  },
  highLevel: {
    name: 'High level',
    meaning: 'Exploratory or open-ended: there is no single deterministic expected result to automate.',
    owner: 'QA lead - split into concrete cases, or run as an exploratory session',
  },
  blocked: {
    name: 'Blocked',
    meaning: 'Testable, but a precondition is missing in the environment (data, accounts or states the suite cannot create).',
    owner: 'Dev / environment owner - provide the precondition',
  },
  businessGap: {
    name: 'Business gap',
    meaning: 'The requirement is unclear, contradicts the product or another requirement, or refers to something that no longer exists - needs a BA / QA-lead answer.',
    owner: 'BA - answer the question; then the case is re-baselined',
  },
};
const ORDER = ['notTestable', 'invalid', 'notImplemented', 'cantReproduce', 'highLevel', 'blocked', 'businessGap'];

/**
 * Open requirement questions, by case. Each is recorded in the review register
 * (Clarifications Q-numbers, QA-lead notes N-refs) or a decision (D-refs).
 */
const BUSINESS_QUESTIONS = [
  { cases: ['14520'], source: 'Clarification Q2', reason: 'The "Payer Admin" role definition says no create and no delete, yet the interface offers both - which is intended? (The case also fails on the permission-propagation defect.)' },
  { cases: ['14421', '14430', '14438'], source: 'Clarification Q4', reason: 'The AC (updated 2026-09-27) says the default sort is "Newest to Oldest"; the control shows "Sort By" and never indicates the active sort.' },
  { cases: ['14762'], source: 'Clarification Q5', reason: 'Does reactivation require a reason? Sheet 41 TC-566 says no; this case expects one.' },
  { cases: ['14460'], source: 'QA-lead note N-002', reason: 'When the payer was deactivated before expiry and "Active" appears - is that control enabled or disabled? The expected result is to be corrected by the QA lead.' },
  { cases: ['14371'], source: 'QA-lead note N-022', reason: 'The title says the maker must not approve their own edit; the scenario the QA lead described is different - which behaviour does the case cover?' },
  { cases: ['15726'], source: 'QA-lead note N-041', reason: 'The case expects a WITHDRAWAL recorded with the maker and no reviewer; a rejection always has a reviewer - reject or withdraw?' },
  { cases: ['14402'], source: 'Open question (filter permission)', reason: 'The case removes a "filter" permission; the role tree has no separate permission for filtering the payer list.' },
  { cases: ['14419'], source: 'Open question (advanced-search permission)', reason: 'The case removes an "advanced search" permission; the role tree has no separate permission for it.' },
  { cases: ['14793'], source: 'QA-lead note N-070', reason: 'GetPayerNetworks was removed from the role tree in this build - which permission now governs the linked-networks count?' },
  { cases: ['14954'], source: 'QA-lead note N-071', reason: 'The AC does not list which columns are REQUIRED on the Linked Policies table.' },
  { cases: ['14967'], source: 'QA-lead note N-071', reason: 'What must a click on a linked-policy row open? Not defined.' },
];

/** QA-lead PASS decisions the automation could not confirm, and held evidence conflicts. */
const NOT_CONFIRMED = [
  { cases: ['16413', '16429'], source: 'QA-lead decision N-027', reason: 'Reported PASS by QA-lead decision; the run could not confirm it ("not independently confirmed by the run").' },
  { cases: ['15692', '15693', '14594', '14602'], source: 'Held evidence conflict', reason: 'The QA-lead note says this passes; the automated run recorded a different result. Not reproduced either way yet.' },
  { cases: ['15554', '15557'], source: 'QA-lead notes N-062 / N-063', reason: 'The QA-lead note expects a pass on a payer with version 0; the run on a payer with history shows otherwise - setup to be agreed.' },
];

// ---- inputs -----------------------------------------------------------------
async function readRegister() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(REGISTER);
  const rows = new Map(); // `${id}|${readable first line}` -> info
  for (const [sheetName, kind] of [['Failed cases', 'FAIL'], ['Blocked cases', 'BLOCKED']]) {
    const ws = wb.getWorksheet(sheetName);
    const h = ws.getRow(1).values;
    const col = (name) => h.indexOf(name);
    ws.eachRow((r, i) => {
      if (i === 1) return;
      const id = String(cellText(r.getCell(col('Case ID')).value));
      const firstLine = String(cellText(r.getCell(col('Expected result')).value)).split('\n')[0].trim();
      rows.set(`${id}|${firstLine}`, {
        kind,
        conclusion: String(cellText(r.getCell(col('Conclusion')).value)),
        group: kind === 'FAIL' ? String(cellText(r.getCell(col('Root-cause group')).value)) : '',
        precondition: kind === 'BLOCKED' ? String(cellText(r.getCell(col('Precondition category')).value)) : '',
        why: kind === 'BLOCKED' ? clean(cellText(r.getCell(col('Why it could not run')).value)) : clean(cellText(r.getCell(col('Actual result')).value)),
        decision: col('Decision ref') > 0 ? String(cellText(r.getCell(col('Decision ref')).value) || '') : '',
      });
    });
  }
  return rows;
}

/** Every payer test in the code, with the manual ones identified. */
function listedTests() {
  const out = [];
  (function walk(suites, file, chain, top) {
    for (const s of suites || []) {
      const f = top ? (s.file || s.title) : file;
      const c = top ? [] : [...chain, s.title || ''];
      for (const sp of s.specs || []) out.push({ file: f, chain: c.join(' > '), title: sp.title });
      walk(s.suites, f, c, false);
    }
  })(LISTING.suites, '', [], true);
  return out.filter((t) => /^payer[\\/]/.test(t.file));
}

// ---- classify ---------------------------------------------------------------
function classify(c, reg) {
  const id = String(c.id);
  const put = (key, reason, source) => ({ key, reason, source });

  if (c.manual) return put('notTestable', 'Manual user story: depends on scheduled jobs, time passing or an external integration; tested manually.', 'Manual story (excluded from the automated report)');

  const removed = (OVERRIDES.removeStories || []).find((r) => r.name === c.story);
  if (removed) {
    const why = removed.reason || removed.label || '';
    if (/not implemented/i.test(why)) return put('notImplemented', `Story removed from the report: ${why}`, 'QA-lead decision (story removed)');
    if (/scope|module/i.test(why)) return put('invalid', `Story removed from the report: ${why}`, 'QA-lead decision (story removed)');
    if (/manual/i.test(why)) return put('notTestable', `Story removed from the report: ${why}`, 'QA-lead decision (story removed)');
  }

  const ambiguity = DECISIONS.filter((d) => d.cases.includes(id) && d.conclusion === 'Requirement ambiguity').slice(-1)[0];
  if (ambiguity) return put('businessGap', `${ambiguity.group}. ${clean(ambiguity.action)}`, `Decision ${ambiguity.id}`);
  const question = BUSINESS_QUESTIONS.find((q) => q.cases.includes(id));
  if (question) return put('businessGap', question.reason, question.source);

  const override = (OVERRIDES.statusOverrides || []).find((o) => o.cases.includes(id));
  if (override && /invalid|no manual page-number input/i.test(override.label)) {
    return put('invalid', override.label.replace(/^QA-lead decision:\s*/i, ''), `QA-lead decision ${override.ref}`);
  }

  const d9 = DECISIONS.find((d) => d.cases.includes(id) && /cannot be filtered by Delete/i.test(d.group));
  if (d9) return put('notImplemented', `${d9.group}. ${clean(d9.action)}`, `Decision ${d9.id}`);
  if (reg && reg.kind === 'FAIL' && /Specified functionality not present/i.test(reg.group)) {
    return put('notImplemented', clip(reg.why, 300), `Register: ${reg.group}`);
  }
  if (reg && reg.kind === 'BLOCKED' && /Feature not present|Not implemented/i.test(reg.precondition)) {
    return put('notImplemented', clip(reg.why, 300), `Register: ${reg.precondition}`);
  }

  if (reg && reg.kind === 'BLOCKED' && /Exploratory/i.test(reg.precondition)) return put('highLevel', clip(reg.why, 300), `Register: ${reg.precondition}`);

  if (reg && reg.kind === 'BLOCKED' && /time to pass|scheduled|data-layer or host access/i.test(reg.precondition)) return put('notTestable', clip(reg.why, 300), `Register: ${reg.precondition}`);

  const notConfirmed = NOT_CONFIRMED.find((q) => q.cases.includes(id));
  if (notConfirmed && (c.status !== 'PASS' || /N-027/.test(notConfirmed.source))) return put('cantReproduce', notConfirmed.reason, notConfirmed.source);
  if (reg && reg.kind === 'FAIL' && reg.conclusion === 'Environment issue' && c.status !== 'PASS') {
    return put('cantReproduce', `Failed on a run-time timeout or connection error, not on an assertion about the feature: ${clip(reg.why, 220)}`, `Register: ${reg.group}`);
  }

  if (c.status === 'BLOCKED' || (reg && reg.kind === 'BLOCKED')) {
    if (override && override.status === 'BLOCKED') return put('blocked', override.label, `QA-lead decision ${override.ref}`);
    return put('blocked', clip(reg ? reg.why : c.actual, 300), reg && reg.precondition ? `Register: ${reg.precondition}` : 'Report: BLOCKED');
  }
  return null;
}
const clip = (s, n) => { const t = clean(s); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };

// ---- assemble ---------------------------------------------------------------
(async () => {
  const register = await readRegister();
  const reported = new Map();
  for (const st of FINAL.stories) for (const c of st.cases) reported.set(`${st.name}|${c.id}|${clean(c.expected)}`, c.status);

  const cases = [];
  for (const st of RUN.stories) {
    for (const c of st.cases) {
      const folder = st.folder || '';
      cases.push({
        folder: folder.slice(0, 2),
        story: st.name,
        azureStory: st.azureStoryId || storyOfFolder(folder)?.id || '',
        id: String(c.id),
        expected: clean(c.expected),
        runStatus: c.status,
        status: reported.get(`${st.name}|${c.id}|${clean(c.expected)}`) || c.status,
        actual: clean(c.actual),
        manual: false,
      });
    }
  }
  // Manual stories are not in the automated report - take them from the code.
  // LEFT OUT by default since 2026-10-12 (QA lead: "remove the manual from the
  // report"); INCLUDE_MANUAL=1 brings them back.
  for (const t of process.env.INCLUDE_MANUAL ? listedTests() : []) {
    if (!/\[MANUAL\]/i.test(`${t.chain} ${t.title}`)) continue;
    const folderName = t.file.split(/[\\/]/)[1] || '';
    const us = storyOfFolder(folderName);
    const m = /^([^:]+):\s*(.*)$/.exec(t.title) || ['', '', t.title];
    cases.push({
      folder: folderName.slice(0, 2),
      story: us ? us.title : folderName,
      azureStory: us ? us.id : '',
      id: m[1],
      expected: clean(m[2].replace(/\[MANUAL\]\s*/i, '')).replace(/^should/i, 'Should'),
      runStatus: 'MANUAL',
      status: 'MANUAL',
      actual: '',
      manual: true,
    });
  }

  for (const c of cases) {
    const reg = register.get(`${c.id}|${readable(c.expected)}`) || null;
    c.registerConclusion = reg ? reg.conclusion : (c.status === 'PASS' ? 'Passed' : '');
    const hit = classify(c, reg);
    c.category = hit ? CATEGORY[hit.key].name : '';
    c.categoryKey = hit ? hit.key : '';
    c.reason = hit ? hit.reason : '';
    c.source = hit ? hit.source : '';
    c.owner = hit ? CATEGORY[hit.key].owner : '';
    c.notInCategory = hit ? '' : (c.status === 'PASS' ? 'Passed' : (reg ? `${reg.conclusion}${reg.group ? ` - ${reg.group}` : ''}` : c.status));
  }

  // ---- workbook -------------------------------------------------------------
  const wb = new ExcelJS.Workbook();
  wb.creator = 'PBM automation';
  const HEAD = { font: { bold: true, color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F5F63' } } };
  const link = (cell, id) => {
    if (!/^\d{5}$/.test(String(id || ''))) return;
    cell.value = { text: String(id), hyperlink: workItemUrl(id) };
    cell.font = { color: { argb: 'FF0F5F63' }, underline: true };
  };
  const cols = [
    { header: 'Folder', key: 'folder', width: 7 },
    { header: 'Azure User Story', key: 'azureStory', width: 11 },
    { header: 'User story', key: 'story', width: 34 },
    { header: 'Azure Test Case', key: 'id', width: 11 },
    { header: 'Test case (expected result)', key: 'expected', width: 60 },
    { header: 'Current result', key: 'status', width: 10 },
    { header: 'Category', key: 'category', width: 20 },
    { header: 'Why', key: 'reason', width: 70 },
    { header: 'Source of the classification', key: 'source', width: 30 },
    { header: 'Owner / next action', key: 'owner', width: 32 },
  ];
  const addSheet = (name, columns, rows) => {
    const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = columns;
    ws.getRow(1).eachCell((cell) => Object.assign(cell, HEAD));
    for (const d of rows) {
      const r = ws.addRow(d);
      r.alignment = { wrapText: true, vertical: 'top' };
      if (columns.some((c) => c.key === 'azureStory')) link(r.getCell('azureStory'), d.azureStory);
      if (columns.some((c) => c.key === 'id')) link(r.getCell('id'), d.id);
    }
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
    return ws;
  };

  const classified = cases.filter((c) => c.category);
  const counts = Object.fromEntries(ORDER.map((k) => [k, classified.filter((c) => c.categoryKey === k).length]));

  // Summary
  const sum = wb.addWorksheet('Summary');
  sum.columns = [{ width: 26 }, { width: 10 }, { width: 90 }, { width: 44 }];
  sum.addRow(['Payer module - testability report']).font = { bold: true, size: 14 };
  sum.addRow([`All ${cases.length} automated payer test cases (the 6 manual user stories are not included). Built ${new Date().toISOString().slice(0, 10)} from the final reviewed results, the QA-lead decisions and the review register.`]);
  sum.addRow(['Each case has ONE category, by precedence; every row names the source that placed it. Cases no source places in a category are in "All cases" with their current result - nothing is guessed.']);
  sum.addRow([]);
  const hr = sum.addRow(['Category', 'Cases', 'What it means', 'Owner / next action']);
  hr.eachCell((cell) => Object.assign(cell, HEAD));
  for (const k of ORDER) {
    const r = sum.addRow([CATEGORY[k].name, counts[k], CATEGORY[k].meaning, CATEGORY[k].owner]);
    r.alignment = { wrapText: true, vertical: 'top' };
  }
  const tr = sum.addRow(['Total in the seven categories', classified.length, '', '']);
  tr.font = { bold: true };
  sum.addRow([]);
  const rest = cases.filter((c) => !c.category);
  const restBy = rest.reduce((m, c) => { const k = c.notInCategory.startsWith('Passed') ? 'Passed' : c.notInCategory.split(' - ')[0]; m[k] = (m[k] || 0) + 1; return m; }, {});
  sum.addRow(['Not in these categories', rest.length, Object.entries(restBy).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}: ${v}`).join(' · '), '']).alignment = { wrapText: true, vertical: 'top' };

  // By story
  const stories = [...new Set(classified.map((c) => `${c.folder}|${c.azureStory}|${c.story}`))].sort();
  addSheet('By user story', [
    { header: 'Folder', key: 'folder', width: 7 },
    { header: 'Azure User Story', key: 'azureStory', width: 11 },
    { header: 'User story', key: 'story', width: 46 },
    ...ORDER.map((k) => ({ header: CATEGORY[k].name, key: k, width: 12 })),
    { header: 'Total', key: 'total', width: 8 },
  ], stories.map((key) => {
    const [folder, azureStory, story] = key.split('|');
    const mine = classified.filter((c) => `${c.folder}|${c.azureStory}|${c.story}` === key);
    return { folder, azureStory, story, ...Object.fromEntries(ORDER.map((k) => [k, mine.filter((c) => c.categoryKey === k).length || ''])), total: mine.length };
  }));

  for (const k of ORDER) addSheet(CATEGORY[k].name, cols, classified.filter((c) => c.categoryKey === k));
  addSheet('All cases', [
    ...cols.slice(0, 6),
    { header: 'Category', key: 'category', width: 20 },
    { header: 'If not in a category: current conclusion', key: 'notInCategory', width: 44 },
    ...cols.slice(7),
  ], cases);
  await wb.xlsx.writeFile(`${OUT}.xlsx`);

  // ---- HTML -----------------------------------------------------------------
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const a = (id, label) => (/^\d{5}$/.test(String(id)) ? `<a href="${workItemUrl(id)}" target="_blank" rel="noopener">${esc(label || id)}</a>` : esc(label || id || '—'));
  const sections = ORDER.map((k) => {
    const list = classified.filter((c) => c.categoryKey === k).sort((x, y) => x.folder.localeCompare(y.folder) || x.id.localeCompare(y.id));
    const rows = list.map((c) => `<tr><td class="m">${a(c.azureStory, c.azureStory ? `US ${c.azureStory}` : '')}</td><td>${esc(c.story)}</td><td class="m">${a(c.id)}</td>`
      + `<td>${esc(c.expected)}</td><td class="m s-${esc(c.status)}">${esc(c.status)}</td><td>${esc(c.reason)}</td><td class="small">${esc(c.source)}</td></tr>`).join('');
    return `<section id="${k}"><h2>${esc(CATEGORY[k].name)} <span class="n">${list.length}</span></h2>
<p class="lead">${esc(CATEGORY[k].meaning)} <b>Owner:</b> ${esc(CATEGORY[k].owner)}.</p>
${list.length ? `<div class="tw"><table><thead><tr><th>User story</th><th>Story name</th><th>Test case</th><th>Expected result</th><th>Result</th><th>Why</th><th>Source</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="lead">None.</p>'}</section>`;
  }).join('');
  const tiles = ORDER.map((k) => `<a class="tile" href="#${k}"><span class="tn">${counts[k]}</span><span class="tl">${esc(CATEGORY[k].name)}</span></a>`).join('');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Payer Testability Report</title>
<style>
:root{--ink:#16191d;--ink2:#4a5057;--line:#e2e2de;--ground:#f6f6f4;--surface:#fff;--accent:#0f5f63;--fail:#b3261e;--pass:#0a7a33;--blocked:#8a5a00}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--ink:#e9e9e4;--ink2:#b2b6b8;--line:#2d3237;--ground:#15171a;--surface:#1c1f23;--accent:#7fb8a5;--fail:#f2867d;--pass:#7fd49a;--blocked:#e3b35b}}
:root[data-theme="dark"]{--ink:#e9e9e4;--ink2:#b2b6b8;--line:#2d3237;--ground:#15171a;--surface:#1c1f23;--accent:#7fb8a5;--fail:#f2867d;--pass:#7fd49a;--blocked:#e3b35b}
body{margin:0;background:var(--ground);color:var(--ink);font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
.wrap{max-width:1280px;margin:0 auto;padding:28px 16px 64px}h1{margin:0 0 6px;font-size:1.6rem}h2{margin:36px 0 6px;font-size:1.15rem}
.n{font:600 .8rem ui-monospace,monospace;color:var(--accent);margin-left:6px}.lead{color:var(--ink2);margin:0 0 12px;max-width:90ch}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin:20px 0}
.tile{display:block;background:var(--surface);border:1px solid var(--line);padding:12px 14px;text-decoration:none;color:var(--ink)}
.tn{display:block;font:600 1.7rem ui-monospace,monospace;color:var(--accent)}.tl{font-size:.78rem;color:var(--ink2)}
.tw{overflow-x:auto;background:var(--surface);border:1px solid var(--line)}table{border-collapse:collapse;width:100%;font-size:.84rem}
th{text-align:left;font-size:.7rem;text-transform:uppercase;letter-spacing:.06em;color:var(--ink2);padding:8px;border-bottom:1px solid var(--line)}
td{padding:7px 8px;border-bottom:1px solid var(--line);vertical-align:top}.m{font-family:ui-monospace,monospace;white-space:nowrap}
.small{font-size:.76rem;color:var(--ink2)}a{color:var(--accent)}.s-FAIL{color:var(--fail)}.s-PASS{color:var(--pass)}.s-BLOCKED{color:var(--blocked)}
</style></head><body><div class="wrap">
<h1>Payer module - testability report</h1>
<p class="lead">All ${cases.length} automated payer test cases (the 6 manual user stories are not included). ${classified.length} fall in one of the seven categories below; the other ${rest.length} (${Object.entries(restBy).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${esc(k)} ${v}`).join(', ')}) are in the Excel "All cases" sheet. One category per case, by precedence; each row names the source that placed it. Built ${new Date().toISOString().slice(0, 10)}.</p>
<div class="tiles">${tiles}</div>${sections}</div></body></html>`;
  fs.writeFileSync(`${OUT}.html`, html);

  console.log(`cases: ${cases.length} (${cases.filter((c) => c.manual).length} manual)`);
  for (const k of ORDER) console.log(`  ${CATEGORY[k].name.padEnd(24)} ${counts[k]}`);
  console.log(`  ${'in no category'.padEnd(24)} ${rest.length}  ${JSON.stringify(restBy)}`);
  const unmatched = cases.filter((c) => !c.manual && c.status !== 'PASS' && !register.has(`${c.id}|${readable(c.expected)}`));
  console.log(`non-passing automated cases not found in the register: ${unmatched.length}${unmatched.length ? ` (${unmatched.slice(0, 8).map((c) => c.id).join(', ')})` : ''}`);
  console.log(`written: ${path.relative(ROOT, OUT)}.xlsx / .html`);
})();
