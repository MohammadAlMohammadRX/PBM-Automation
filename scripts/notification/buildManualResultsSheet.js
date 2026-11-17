/**
 * The manual-results workbook for the Notification module's 65 Manual test cases
 * (the attachment of the "Manual test results" e-mail).
 *
 *   node scripts/notification/buildManualResultsSheet.js [results.json] [out.xlsx]
 *
 * Case titles, stories and steps come from the checklist page's embedded data
 * (reports/notification/PBM-Notification-Manual-Checklist.html); the outcomes come
 * from the checklist's db export (reports/notification/manual-results-2026-11-15.json).
 *
 * Sheets: Summary (per story), Results (one row per case), Failed cases (with steps,
 * expected result, tester note and bug).
 */
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const ROOT = path.join(__dirname, '..', '..');
const resultsFile = process.argv[2] || path.join(ROOT, 'reports', 'notification', 'manual-results-2026-11-15.json');
const out = process.argv[3] || path.join(ROOT, 'reports', 'PBM-Notification-Manual-Results.xlsx');

const html = fs.readFileSync(path.join(ROOT, 'reports', 'notification', 'PBM-Notification-Manual-Checklist.html'), 'utf8');
const data = JSON.parse(html.match(/<script[^>]*id="data"[^>]*>([\s\S]*?)<\/script>/)[1]);
const { results, azureRun } = JSON.parse(fs.readFileSync(resultsFile, 'utf8'));

// Bugs raised for the failed manual cases (Azure, 2026-11-15).
const BUGS = {
  21615: [22245],
  21616: [22246],
  21627: [22245, 22246],
  21650: [22247],
  21843: [22247],
};
const BUG_TITLE = {
  22245: 'App Notification audit log: editing a notification is not recorded (no "Edit" entry)',
  22246: 'App Notification audit log: deleting a notification is recorded with action "Updated" instead of "Delete"',
  22247: 'Auto-archive (days) setting: after typing a negative sign the field stops accepting numbers and no validation message is shown',
};
const AZ = (id) => `https://dev.azure.com/neomatixco/CareConnect/_workitems/edit/${id}`;
const LABEL = { PASS: 'Passed', FAIL: 'Failed', BLOCKED: 'Blocked' };
const FILL = { Passed: 'FFD9F2D0', Failed: 'FFF8D0D0', Blocked: 'FFFFF0C2' };

const priority = (pre) => (pre.match(/Priority:\s*(\w+)/) || [])[1] || '';
const expected = (c) => c.st[c.st.length - 1][1].split('\n').pop();

const wb = new ExcelJS.Workbook();
wb.creator = 'PBM QA';
const header = (ws) => {
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
};
const link = (cell, id) => { cell.value = { text: String(id), hyperlink: AZ(id) }; cell.font = { color: { argb: 'FF0563C1' }, underline: true }; };

// Summary
const sum = wb.addWorksheet('Summary');
sum.columns = [
  { header: 'User story', key: 'story', width: 10 },
  { header: 'Title', key: 'title', width: 46 },
  { header: 'Cases', key: 'n', width: 8 },
  { header: 'Passed', key: 'p', width: 8 },
  { header: 'Failed', key: 'f', width: 8 },
  { header: 'Blocked', key: 'b', width: 8 },
];
header(sum);
const total = { n: 0, p: 0, f: 0, b: 0 };
for (const s of [...data.order].sort((a, b) => a - b)) {
  const cs = data.cases.filter((c) => c.s === s);
  const r = { n: cs.length, p: 0, f: 0, b: 0 };
  for (const c of cs) { const st = results[c.id]?.status; if (st === 'PASS') r.p++; else if (st === 'FAIL') r.f++; else if (st === 'BLOCKED') r.b++; }
  Object.keys(total).forEach((k) => { total[k] += r[k]; });
  const row = sum.addRow({ story: s, title: data.stories[s], ...r });
  link(row.getCell('story'), s);
}
const tr = sum.addRow({ story: 'Total', title: '', ...total });
tr.font = { bold: true };
sum.addRow({});
sum.addRow({ story: 'Azure', title: `Test run ${azureRun} - plan 20972 (PBM Sprint 3), suite 21975` });

// Results
const res = wb.addWorksheet('Results');
res.columns = [
  { header: 'Test case', key: 'id', width: 11 },
  { header: 'User story', key: 'story', width: 10 },
  { header: 'Title', key: 'title', width: 80 },
  { header: 'Priority', key: 'pr', width: 10 },
  { header: 'Result', key: 'res', width: 10 },
  { header: 'Bug', key: 'bug', width: 14 },
  { header: 'Tester note', key: 'note', width: 60 },
];
header(res);
for (const s of [...data.order].sort((a, b) => a - b)) {
  for (const c of data.cases.filter((x) => x.s === s).sort((a, b) => a.id - b.id)) {
    const r = results[c.id] || {};
    const label = LABEL[r.status] || 'Not run';
    const row = res.addRow({ id: c.id, story: s, title: c.t, pr: priority(c.pre), res: label, bug: (BUGS[c.id] || []).join(', '), note: r.note || '' });
    link(row.getCell('id'), c.id);
    if (BUGS[c.id]?.length === 1) link(row.getCell('bug'), BUGS[c.id][0]);
    if (FILL[label]) row.getCell('res').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL[label] } };
    row.alignment = { vertical: 'top', wrapText: true };
  }
}
res.autoFilter = { from: 'A1', to: 'G1' };

// Failed cases
const fl = wb.addWorksheet('Failed cases');
fl.columns = [
  { header: 'Test case', key: 'id', width: 11 },
  { header: 'User story', key: 'story', width: 10 },
  { header: 'Title', key: 'title', width: 45 },
  { header: 'Steps', key: 'steps', width: 60 },
  { header: 'Expected result', key: 'exp', width: 45 },
  { header: 'Actual result (tester note)', key: 'note', width: 50 },
  { header: 'Bug', key: 'bug', width: 60 },
];
header(fl);
for (const c of data.cases.filter((x) => results[x.id]?.status === 'FAIL').sort((a, b) => a.id - b.id)) {
  const bugs = BUGS[c.id] || [];
  const note = results[c.id].note
    || (c.id === 21627 ? 'The consolidated trail is incomplete: the Edit action is not audited and the Delete action is logged as "Updated".' : '');
  const row = fl.addRow({
    id: c.id,
    story: c.s,
    title: c.t,
    steps: c.st.map(([a], i) => `${i + 1}. ${a}`).join('\n'),
    exp: expected(c),
    note,
    bug: bugs.map((b) => `${b} - ${BUG_TITLE[b]}`).join('\n'),
  });
  link(row.getCell('id'), c.id);
  row.alignment = { vertical: 'top', wrapText: true };
}

wb.xlsx.writeFile(out).then(() => console.log(`Manual results written: ${path.relative(ROOT, out)}  (${total.n} cases | Passed ${total.p} | Failed ${total.f} | Blocked ${total.b})`));
