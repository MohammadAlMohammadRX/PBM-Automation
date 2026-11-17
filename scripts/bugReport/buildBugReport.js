/* eslint-disable no-console */
/**
 * A module's bug report: one Excel workbook a reader who never saw the
 * automation can work from, with the evidence copied next to it.
 *
 *   node scripts/bugReport/buildBugReport.js reports/bug-reports/defs/<key>.bugs.json [outRoot]
 *
 * Writes <outRoot>/<Module>/ (default outRoot reports/bug-reports):
 *   PBM-<Module>-Bug-Report.xlsx
 *     Summary          - the run, the result, the bugs by severity, how to read
 *     Bugs             - one row per bug (all fields), filterable
 *     Bug Details      - one card per bug: every field, its test cases with links,
 *                        and the screenshot that shows the bug
 *     Test Cases       - one row per failed test case: its bug, the failed step,
 *                        expected / actual / what the screen showed, evidence links
 *     Needs a Decision - where the test case and the application (or the story)
 *                        disagree; for the business analyst
 *     Blocked          - cases that could not be exercised, and why
 *   evidence/<Bug No>/TC-<id>-step-NN.png, ...-msg-N.png, TC-<id>-failure-log.txt
 *   Automation-Report.html - the full run report
 *
 * The definition file (written per module, checked by checkDefs.js) says which
 * failed cases form each bug and words the bug; everything else (case titles,
 * stories, failed steps, screen messages, screenshots) comes from the module's
 * final report and Azure export.
 */
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const { workItemUrl } = require('../azureIds');

const ROOT = path.resolve(__dirname, '..', '..');
const [DEFS, OUT_ROOT = path.join(ROOT, 'reports', 'bug-reports')] = process.argv.slice(2);
if (!DEFS) {
  console.error('usage: node scripts/bugReport/buildBugReport.js <defs .json> [outRoot]');
  process.exit(1);
}
const defs = JSON.parse(fs.readFileSync(DEFS, 'utf8'));
const report = JSON.parse(fs.readFileSync(path.join(ROOT, defs.finalReport), 'utf8'));
const exported = defs.export ? JSON.parse(fs.readFileSync(path.join(ROOT, defs.export), 'utf8')) : [];

// ---------------------------------------------------------------- lookups
const items = new Map(exported.map((w) => [String(w.id), w]));
const caseOf = new Map();
const storyOfCase = new Map();
for (const s of report.stories) {
  for (const c of s.cases) {
    caseOf.set(String(c.id), c);
    const tc = items.get(String(c.id));
    const story = tc && items.get(String(tc.parent));
    storyOfCase.set(String(c.id), story ? { id: String(story.id), title: story.title } : { id: String(s.azureStoryId || ''), title: s.azureStoryTitle || s.name });
  }
}
const titleOf = (id) => (items.get(String(id)) || {}).title || (caseOf.get(String(id)) || {}).expected || '';
const storyLabel = (st) => (st && st.id ? `US ${st.id} ${st.title}` : (st && st.title) || '');
const storiesOf = (ids) => [...new Map(ids.map((id) => storyOfCase.get(String(id))).filter(Boolean).map((s) => [s.id, s])).values()];

const moduleDir = path.join(OUT_ROOT, defs.module.replace(/[^A-Za-z0-9]+/g, '-').replace(/-+$/, ''));
const fileStem = `PBM-${defs.module.replace(/ Management$/, '').replace(/[^A-Za-z0-9]+/g, '-')}-Bug-Report`;
fs.rmSync(moduleDir, { recursive: true, force: true });
fs.mkdirSync(path.join(moduleDir, 'evidence'), { recursive: true });

// ---------------------------------------------------------------- evidence
const failedSteps = (c) => (c.steps || []).filter((s) => s.status === 'FAIL');
const slug = (s) => String(s).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');

function failureLog(id, c, owner) {
  const st = storyOfCase.get(id);
  const lines = [
    `Test case ${id} - ${titleOf(id)}`,
    `User story: ${storyLabel(st)}`,
    `Reported under: ${owner}`,
    `Result: ${c.status}   (run of ${report.runDate}, environment ${report.environment || ''})`,
    `Azure: ${workItemUrl(id)}`,
    '',
    'What the test checks:',
    `  ${(c.expectedReadable && c.expectedReadable.sentence) || c.expected || ''}`,
    '',
    'Summary of the failure:',
    `  ${c.actual || ''}`,
    '',
    'Steps:',
  ];
  for (const s of c.steps || []) {
    lines.push(`  ${String(s.index).padStart(2)}. [${s.status}] ${s.name}`);
    if (s.status === 'FAIL') {
      if (s.plain) {
        lines.push(`      Expected: ${s.plain.expected || ''}`);
        lines.push(`      Actual:   ${s.plain.actual || ''}`);
        for (const sc of s.plain.screen || []) lines.push(`      Seen on screen: ${sc}`);
      }
      for (const e of (s.observed && s.observed.events) || []) lines.push(`      Event during the step: ${e}`);
      if (s.reason) lines.push('      Technical detail:', ...String(s.reason).split('\n').map((l) => `        ${l}`));
    } else if (s.status !== 'PASS' && s.reason) {
      lines.push(`      ${s.reason}`);
    }
  }
  return `${lines.join('\r\n')}\r\n`;
}

/** Copies a case's evidence into evidence/<owner>/; answers the files (relative to the module folder). */
function collectEvidence(id, owner) {
  const c = caseOf.get(id);
  const dir = path.join('evidence', slug(owner));
  fs.mkdirSync(path.join(moduleDir, dir), { recursive: true });
  const out = { log: null, shots: [], msgShots: [] };
  for (const s of failedSteps(c)) {
    const n = String(s.index).padStart(2, '0');
    if (s.screenshot && fs.existsSync(s.screenshot)) {
      const rel = path.join(dir, `TC-${id}-step-${n}.png`);
      fs.copyFileSync(s.screenshot, path.join(moduleDir, rel));
      out.shots.push({ rel, step: s.index });
    }
    ((s.observed && s.observed.screenshots) || []).forEach((src, i) => {
      if (!fs.existsSync(src)) return;
      const rel = path.join(dir, `TC-${id}-step-${n}-message-${i + 1}.png`);
      fs.copyFileSync(src, path.join(moduleDir, rel));
      out.msgShots.push({ rel, step: s.index });
    });
  }
  out.log = path.join(dir, `TC-${id}-failure-log.txt`);
  fs.writeFileSync(path.join(moduleDir, out.log), failureLog(id, c, owner));
  return out;
}

const evidence = new Map();
for (const b of defs.bugs) for (const id of b.cases.map(String)) evidence.set(id, collectEvidence(id, `Bug ${b.no}`));
for (const d of defs.decisions || []) for (const id of d.cases.map(String)) evidence.set(id, collectEvidence(id, `Decision ${d.no}`));
for (const n of defs.notBugs || []) evidence.set(String(n.case), collectEvidence(String(n.case), 'Not an app bug'));
if (defs.reportHtml && fs.existsSync(path.join(ROOT, defs.reportHtml))) fs.copyFileSync(path.join(ROOT, defs.reportHtml), path.join(moduleDir, 'Automation-Report.html'));

// ---------------------------------------------------------------- styles
const SEV = {
  '1 - Critical': { fill: 'FF7B1E1E', font: 'FFFFFFFF' },
  '2 - High': { fill: 'FFD9534F', font: 'FFFFFFFF' },
  '3 - Medium': { fill: 'FFF0AD4E', font: 'FF000000' },
  '4 - Low': { fill: 'FF8DB4E2', font: 'FF000000' },
};
const ACCENT = 'FF0F5E6B';
const LABEL_FILL = 'FFE8F1F2';
const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const thin = { style: 'thin', color: { argb: 'FFBFBFBF' } };
const border = { top: thin, left: thin, bottom: thin, right: thin };
const wrap = { wrapText: true, vertical: 'top' };
const link = (text, target) => ({ text: String(text), hyperlink: target.replace(/\\/g, '/') });
const linkFont = { color: { argb: 'FF0563C1' }, underline: true };
const numbered = (steps) => steps.map((s, i) => `${i + 1}. ${String(s).replace(/^\d+[.)]\s*/, '')}`).join('\n');
const envText = (defs.environment || []).join('\n');

/** Rough row height for wrapped text in a column of `width` characters. */
function heightFor(texts) {
  let lines = 1;
  for (const [text, width] of texts) {
    const n = String(text || '').split('\n').reduce((acc, l) => acc + Math.max(1, Math.ceil(l.length / Math.max(8, width - 2))), 0);
    lines = Math.max(lines, n);
  }
  return Math.min(409, 15 * lines + 4);
}

function header(ws, cols, row = 1) {
  const r = ws.getRow(row);
  cols.forEach((c, i) => {
    const cell = r.getCell(i + 1);
    cell.value = c.header;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = fill(ACCENT);
    cell.alignment = { wrapText: true, vertical: 'middle' };
    cell.border = border;
    ws.getColumn(i + 1).width = c.width;
  });
  r.height = 30;
  ws.views = [{ state: 'frozen', ySplit: row }];
}

function pngSize(file) {
  const b = fs.readFileSync(file);
  if (b.readUInt32BE(12) !== 0x49484452) return null; // not IHDR
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

// ---------------------------------------------------------------- workbook
const wb = new ExcelJS.Workbook();
wb.creator = 'PBM test automation';
wb.created = new Date();

const counts = report.totals || {};
const total = (counts.PASS || 0) + (counts.FAIL || 0) + (counts.BLOCKED || 0) + (counts.SKIPPED || 0);
const bySev = {};
for (const b of defs.bugs) bySev[b.severity] = (bySev[b.severity] || 0) + 1;
const blocked = [];
for (const s of report.stories) for (const c of s.cases) if (c.status === 'BLOCKED') blocked.push(c);

// Summary
const sum = wb.addWorksheet('Summary', { properties: { tabColor: { argb: ACCENT } } });
sum.getColumn(1).width = 34;
sum.getColumn(2).width = 100;
sum.mergeCells('A1:B1');
sum.getCell('A1').value = `${defs.module} - Bug Report`;
sum.getCell('A1').font = { bold: true, size: 18, color: { argb: ACCENT } };
sum.getRow(1).height = 30;
const sumRows = [
  ['Feature', link(`Feature ${defs.feature}`, workItemUrl(defs.feature))],
  ['Test run', `${report.runDate} (final result, including the re-runs after fixing automation issues)`],
  ['Environment', envText],
  ['Test cases in the run', total],
  ['Passed', counts.PASS || 0],
  ['Failed', counts.FAIL || 0],
  ['Blocked (could not be exercised)', counts.BLOCKED || 0],
  ['', ''],
  ['Bugs (application issues)', defs.bugs.length],
  ...['1 - Critical', '2 - High', '3 - Medium', '4 - Low'].filter((s) => bySev[s]).map((s) => [`   Severity ${s}`, bySev[s]]),
  ['Failed test cases covered by these bugs', defs.bugs.reduce((n, b) => n + b.cases.length, 0)],
  ['Topics that need a business decision', `${(defs.decisions || []).length} (${(defs.decisions || []).reduce((n, d) => n + d.cases.length, 0)} test cases) - sheet "Needs a Decision"`],
  ...((defs.notBugs || []).length ? [['Failures that are not app bugs', `${defs.notBugs.length} - listed in "Test Cases" with the reason`]] : []),
  ['Logged in Azure DevOps', defs.bugs.some((b) => b.azureId) ? `Yes - see the "Azure Bug" column (${defs.bugs.filter((b) => b.azureId).length} bugs)` : 'Not yet - the bugs below are ready to be logged'],
  ['', ''],
  ['How to read this workbook', [
    '"Bugs" lists every bug in one row: severity, the linked test cases, steps to reproduce, actual and expected result.',
    '"Bug Details" shows each bug as a card with its test cases (links to Azure, the screenshot and the failure log) and the screenshot that shows the bug.',
    '"Test Cases" lists every failed test case with the step that failed, what was expected, what happened and what the screen showed.',
    '"Needs a Decision" lists where the test case and the application disagree and the business analyst must decide which is right.',
    '"Blocked" lists the test cases that could not be exercised in this environment, with the reason.',
    'The evidence folder next to this workbook holds, per bug, the failure screenshots, the screenshots taken when a message appeared, and a failure log per test case. Keep the folder next to the workbook so the links open.',
    'Automation-Report.html (next to this workbook) is the full run report with every test case.',
  ].join('\n')],
];
sumRows.forEach(([k, v], i) => {
  const r = sum.getRow(i + 3);
  r.getCell(1).value = k;
  r.getCell(2).value = v;
  if (k) {
    r.getCell(1).font = { bold: true };
    r.getCell(1).fill = fill(LABEL_FILL);
    r.getCell(1).border = border;
    r.getCell(2).border = border;
  }
  r.getCell(1).alignment = wrap;
  r.getCell(2).alignment = { ...wrap, horizontal: 'left' };
  if (v && v.hyperlink) r.getCell(2).font = linkFont;
  r.height = heightFor([[v && v.text ? v.text : v, 100]]);
});

// Bugs
const bugsWs = wb.addWorksheet('Bugs', { properties: { tabColor: { argb: 'FFD9534F' } } });
const BUG_COLS = [
  { header: 'Bug No.', width: 9 }, { header: 'Azure Bug', width: 11 }, { header: 'Severity', width: 12 }, { header: 'Priority', width: 9 },
  { header: 'Type', width: 13 }, { header: 'Title', width: 48 }, { header: 'User Story', width: 34 }, { header: 'Linked Test Cases', width: 16 },
  { header: 'Description', width: 45 }, { header: 'Preconditions', width: 34 }, { header: 'Steps to Reproduce', width: 55 },
  { header: 'Test Data', width: 28 }, { header: 'Actual Result', width: 55 }, { header: 'Expected Result', width: 50 },
  { header: 'Environment', width: 28 }, { header: 'Evidence', width: 18 }, { header: 'Notes', width: 38 },
];
header(bugsWs, BUG_COLS);

// Bug Details (cards) - built first so the Bugs sheet can link to each card.
const det = wb.addWorksheet('Bug Details', { properties: { tabColor: { argb: 'FFF0AD4E' } } });
det.getColumn(1).width = 24;
for (let c = 2; c <= 6; c++) det.getColumn(c).width = c === 2 ? 14 : 30;
let row = 1;
const cardRow = new Map();
for (const b of defs.bugs) {
  const ids = b.cases.map(String);
  const sev = SEV[b.severity] || SEV['3 - Medium'];
  cardRow.set(b.no, row);
  det.mergeCells(row, 1, row, 6);
  const head = det.getCell(row, 1);
  head.value = `Bug ${b.no}  |  ${b.severity}  |  ${b.title}`;
  head.font = { bold: true, size: 13, color: { argb: sev.font } };
  head.fill = fill(sev.fill);
  head.alignment = { wrapText: true, vertical: 'middle' };
  det.getRow(row).height = heightFor([[head.value, 150]]) + 6;
  row++;
  const fields = [
    ['Azure Bug', b.azureId ? link(`Bug ${b.azureId}`, workItemUrl(b.azureId)) : 'Not logged yet'],
    ['Severity / Priority', `${b.severity} / Priority ${b.priority}${b.bugType ? `  |  Type: ${b.bugType}` : ''}`],
    ['User Story', storiesOf(ids).map(storyLabel).join('\n')],
    ['Description', b.description],
    ['Preconditions', b.preconditions || '-'],
    ['Steps to Reproduce', numbered(b.steps)],
    ['Test Data', b.testData || '-'],
    ['Actual Result', b.actual],
    ['Expected Result', b.expected],
    ['Environment', envText],
    ...(b.notes ? [['Notes', b.notes]] : []),
  ];
  for (const [k, v] of fields) {
    det.mergeCells(row, 2, row, 6);
    const kc = det.getCell(row, 1);
    const vc = det.getCell(row, 2);
    kc.value = k;
    kc.font = { bold: true };
    kc.fill = fill(LABEL_FILL);
    kc.alignment = wrap;
    kc.border = border;
    vc.value = v;
    vc.alignment = wrap;
    vc.border = border;
    if (v && v.hyperlink) vc.font = linkFont;
    det.getRow(row).height = heightFor([[v && v.text ? v.text : v, 125]]);
    row++;
  }
  // Linked test cases
  const th = det.getRow(row);
  ['Linked test cases', 'Test case', 'Title', 'Failed step', 'Screenshot', 'Failure log'].forEach((t, i) => {
    const cell = th.getCell(i + 1);
    cell.value = t;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = fill(ACCENT);
    cell.border = border;
  });
  row++;
  for (const id of ids) {
    const c = caseOf.get(id);
    const ev = evidence.get(id);
    const fs1 = failedSteps(c)[0];
    const r = det.getRow(row);
    r.getCell(1).value = storyLabel(storyOfCase.get(id));
    r.getCell(2).value = link(`TC ${id}`, workItemUrl(id));
    r.getCell(2).font = linkFont;
    r.getCell(3).value = titleOf(id);
    r.getCell(4).value = fs1 ? `Step ${fs1.index}: ${fs1.name}` : (c.actual || '');
    const shot = ev.shots[0] || ev.msgShots[0];
    r.getCell(5).value = shot ? link(`Step ${shot.step} screenshot${ev.shots.length + ev.msgShots.length > 1 ? ` (+${ev.shots.length + ev.msgShots.length - 1} more in the folder)` : ''}`, shot.rel) : 'No screenshot (see the log)';
    if (shot) r.getCell(5).font = linkFont;
    r.getCell(6).value = link('Failure log', ev.log);
    r.getCell(6).font = linkFont;
    for (let i = 1; i <= 6; i++) {
      r.getCell(i).alignment = wrap;
      r.getCell(i).border = border;
    }
    r.height = heightFor([[r.getCell(1).value, 24], [r.getCell(3).value, 30], [r.getCell(4).value, 30]]);
    row++;
  }
  // The screenshot that shows the bug: the first case's message screenshot when one was taken, else its failed step's.
  const primary = evidence.get(String(b.primaryCase || ids[0]));
  const pick = (primary && (primary.msgShots[0] || primary.shots[0])) || ids.map((id) => evidence.get(id)).map((e) => e.msgShots[0] || e.shots[0]).find(Boolean);
  if (pick) {
    const abs = path.join(moduleDir, pick.rel);
    const size = pngSize(abs);
    if (size) {
      det.getCell(row, 1).value = `Screenshot (${path.basename(pick.rel)})`;
      det.getCell(row, 1).font = { italic: true, color: { argb: 'FF595959' } };
      row++;
      const width = Math.min(900, size.width);
      const height = Math.round((size.height * width) / size.width);
      const img = wb.addImage({ filename: abs, extension: 'png' });
      det.addImage(img, { tl: { col: 0, row: row - 1 }, ext: { width, height } });
      row += Math.ceil(height / 20) + 1;
    }
  }
  row += 2;
}

defs.bugs.forEach((b, i) => {
  const ids = b.cases.map(String);
  const r = bugsWs.getRow(i + 2);
  const values = [
    link(b.no, `#'Bug Details'!A${cardRow.get(b.no)}`),
    b.azureId ? link(b.azureId, workItemUrl(b.azureId)) : 'Not logged',
    b.severity, b.priority, b.bugType || '', b.title,
    storiesOf(ids).map(storyLabel).join('\n'),
    ids.length === 1 ? link(ids[0], workItemUrl(ids[0])) : ids.join(', '),
    b.description, b.preconditions || '-', numbered(b.steps), b.testData || '-', b.actual, b.expected, envText,
    link(`evidence/${slug(`Bug ${b.no}`)}`, path.join('evidence', slug(`Bug ${b.no}`))),
    b.notes || '',
  ];
  values.forEach((v, j) => {
    const cell = r.getCell(j + 1);
    cell.value = v;
    cell.alignment = wrap;
    cell.border = border;
    if (v && v.hyperlink) cell.font = linkFont;
  });
  const sev = SEV[b.severity];
  if (sev) {
    r.getCell(3).fill = fill(sev.fill);
    r.getCell(3).font = { bold: true, color: { argb: sev.font } };
  }
  r.height = heightFor(BUG_COLS.map((c, j) => [values[j] && values[j].text ? values[j].text : values[j], c.width]));
});
bugsWs.autoFilter = { from: { row: 1, column: 1 }, to: { row: defs.bugs.length + 1, column: BUG_COLS.length } };

// Test Cases
const tcWs = wb.addWorksheet('Test Cases', { properties: { tabColor: { argb: 'FF5B9BD5' } } });
const TC_COLS = [
  { header: 'Test Case', width: 10 }, { header: 'Title', width: 42 }, { header: 'User Story', width: 30 }, { header: 'Reported as', width: 14 },
  { header: 'Failed Step', width: 42 }, { header: 'Expected', width: 40 }, { header: 'Actual', width: 48 }, { header: 'Seen on Screen', width: 34 },
  { header: 'Screenshots', width: 20 }, { header: 'Failure Log', width: 14 },
];
header(tcWs, TC_COLS);
const owners = [
  ...defs.bugs.flatMap((b) => b.cases.map((id) => [String(id), `Bug ${b.no}`, `#'Bug Details'!A${cardRow.get(b.no)}`])),
  ...(defs.decisions || []).flatMap((d) => d.cases.map((id) => [String(id), `Decision ${d.no}`, null])),
  ...(defs.notBugs || []).map((n) => [String(n.case), 'Not an app bug', null]),
];
owners.forEach(([id, owner, target], i) => {
  const c = caseOf.get(id);
  const ev = evidence.get(id);
  const steps = failedSteps(c);
  const notBug = (defs.notBugs || []).find((n) => String(n.case) === id);
  const values = [
    link(id, workItemUrl(id)), titleOf(id), storyLabel(storyOfCase.get(id)), target ? link(owner, target) : owner,
    steps.map((s) => `Step ${s.index}: ${s.name}`).join('\n') || '-',
    steps.map((s) => (s.plain && s.plain.expected) || '').filter(Boolean).join('\n') || (c.expectedReadable && c.expectedReadable.sentence) || '',
    (notBug ? `Not an app bug: ${notBug.reason}\n` : '') + (steps.map((s) => (s.plain && s.plain.actual) || '').filter(Boolean).join('\n') || c.actual || ''),
    steps.flatMap((s) => (s.plain && s.plain.screen) || []).join('\n') || '-',
    (ev.shots[0] || ev.msgShots[0]) ? link(`${ev.shots.length + ev.msgShots.length} screenshot(s)`, path.dirname((ev.shots[0] || ev.msgShots[0]).rel)) : 'None',
    link('Open log', ev.log),
  ];
  const r = tcWs.getRow(i + 2);
  values.forEach((v, j) => {
    const cell = r.getCell(j + 1);
    cell.value = v;
    cell.alignment = wrap;
    cell.border = border;
    if (v && v.hyperlink) cell.font = linkFont;
  });
  r.height = heightFor(TC_COLS.map((col, j) => [values[j] && values[j].text ? values[j].text : values[j], col.width]));
});
tcWs.autoFilter = { from: { row: 1, column: 1 }, to: { row: owners.length + 1, column: TC_COLS.length } };

// Needs a Decision
const decWs = wb.addWorksheet('Needs a Decision', { properties: { tabColor: { argb: 'FF7030A0' } } });
const DEC_COLS = [{ header: 'No.', width: 7 }, { header: 'Topic', width: 34 }, { header: 'Test Cases', width: 16 }, { header: 'User Story', width: 32 },
  { header: 'What the application does', width: 60 }, { header: 'Decision needed', width: 55 }, { header: 'Evidence', width: 18 }];
header(decWs, DEC_COLS);
(defs.decisions || []).forEach((d, i) => {
  const ids = d.cases.map(String);
  const values = [d.no, d.topic, ids.length === 1 ? link(ids[0], workItemUrl(ids[0])) : ids.join(', '), storiesOf(ids).map(storyLabel).join('\n'),
    d.appBehaviour || '', d.decisionNeeded, link(`evidence/${slug(`Decision ${d.no}`)}`, path.join('evidence', slug(`Decision ${d.no}`)))];
  const r = decWs.getRow(i + 2);
  values.forEach((v, j) => {
    const cell = r.getCell(j + 1);
    cell.value = v;
    cell.alignment = wrap;
    cell.border = border;
    if (v && v.hyperlink) cell.font = linkFont;
  });
  r.height = heightFor(DEC_COLS.map((col, j) => [values[j] && values[j].text ? values[j].text : values[j], col.width]));
});
if (!(defs.decisions || []).length) decWs.getCell('A2').value = 'None for this module.';

// Blocked
const blkWs = wb.addWorksheet('Blocked', { properties: { tabColor: { argb: 'FF7F7F7F' } } });
const BLK_COLS = [{ header: 'Test Case', width: 10 }, { header: 'Title', width: 50 }, { header: 'User Story', width: 34 }, { header: 'Why it could not be exercised', width: 90 }];
header(blkWs, BLK_COLS);
blocked.forEach((c, i) => {
  const id = String(c.id);
  const values = [link(id, workItemUrl(id)), titleOf(id), storyLabel(storyOfCase.get(id)), c.actual || ''];
  const r = blkWs.getRow(i + 2);
  values.forEach((v, j) => {
    const cell = r.getCell(j + 1);
    cell.value = v;
    cell.alignment = wrap;
    cell.border = border;
    if (v && v.hyperlink) cell.font = linkFont;
  });
  r.height = heightFor(BLK_COLS.map((col, j) => [values[j] && values[j].text ? values[j].text : values[j], col.width]));
});
if (!blocked.length) blkWs.getCell('A2').value = 'None for this module.';

const outFile = path.join(moduleDir, `${fileStem}.xlsx`);
wb.xlsx.writeFile(outFile).then(() => {
  const files = fs.readdirSync(path.join(moduleDir, 'evidence'), { recursive: true }).filter((f) => /\.(png|txt)$/.test(f));
  console.log(`${path.relative(ROOT, outFile)}: ${defs.bugs.length} bugs, ${owners.length} failed cases, ${(defs.decisions || []).length} decisions, ${blocked.length} blocked; ${files.length} evidence files`);
});
