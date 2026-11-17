/* eslint-disable no-console */
/**
 * The overview of every module's bug report: one row per module with its run
 * result, bug counts by severity, decisions, and a link to the module's
 * workbook.
 *
 *   node scripts/bugReport/buildIndex.js [outRoot]   (default reports/bug-reports)
 *
 * Reads the definition files in <outRoot>/defs and each module's final report.
 */
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const { workItemUrl } = require('../azureIds');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT_ROOT = process.argv[2] || path.join(ROOT, 'reports', 'bug-reports');
const ORDER = ['terminology', 'formulary', 'policy', 'facility', 'member', 'user', 'lookup', 'settings', 'notification', 'role'];
const SEVS = ['1 - Critical', '2 - High', '3 - Medium', '4 - Low'];

const rows = ORDER.map((key) => {
  const defs = JSON.parse(fs.readFileSync(path.join(OUT_ROOT, 'defs', `${key}.bugs.json`), 'utf8'));
  const report = JSON.parse(fs.readFileSync(path.join(ROOT, defs.finalReport), 'utf8'));
  const t = report.totals || {};
  const dir = defs.module.replace(/[^A-Za-z0-9]+/g, '-').replace(/-+$/, '');
  const file = `PBM-${defs.module.replace(/ Management$/, '').replace(/[^A-Za-z0-9]+/g, '-')}-Bug-Report.xlsx`;
  const sev = Object.fromEntries(SEVS.map((s) => [s, defs.bugs.filter((b) => b.severity === s).length]));
  return {
    defs, t, sev, link: `${dir}/${file}`,
    azure: defs.bugs.filter((b) => b.azureId).map((b) => b.azureId),
  };
});

const wb = new ExcelJS.Workbook();
const ws = wb.addWorksheet('Modules');
const ACCENT = 'FF0F5E6B';
ws.mergeCells('A1:N1');
ws.getCell('A1').value = 'PBM - Bug Reports by Module';
ws.getCell('A1').font = { bold: true, size: 18, color: { argb: ACCENT } };
ws.getRow(1).height = 30;
ws.mergeCells('A2:N2');
ws.getCell('A2').value = 'One workbook per module (link in the last column). Each holds every bug with its steps, actual and expected result, the linked test cases (links to Azure), and the evidence (screenshots and failure logs) in the evidence folder next to it.';
ws.getCell('A2').alignment = { wrapText: true };
ws.getRow(2).height = 32;
const cols = [
  ['Module', 28], ['Feature', 10], ['Test run', 20], ['Test cases', 10], ['Passed', 9], ['Failed', 9], ['Blocked', 9],
  ['Bugs', 8], ['Critical', 9], ['High', 8], ['Medium', 9], ['Low', 8], ['Needs a decision', 11], ['Bug report', 36],
];
const head = ws.getRow(4);
cols.forEach(([h, w], i) => {
  const c = head.getCell(i + 1);
  c.value = h;
  c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ACCENT } };
  c.alignment = { wrapText: true, vertical: 'middle' };
  ws.getColumn(i + 1).width = w;
});
head.height = 30;
const link = (text, hyperlink) => ({ text: String(text), hyperlink });
const font = { color: { argb: 'FF0563C1' }, underline: true };
const sum = Array(13).fill(0);
rows.forEach((r, i) => {
  const t = r.t;
  const total = (t.PASS || 0) + (t.FAIL || 0) + (t.BLOCKED || 0) + (t.SKIPPED || 0);
  const nums = [total, t.PASS || 0, t.FAIL || 0, t.BLOCKED || 0, r.defs.bugs.length, ...SEVS.map((s) => r.sev[s]), r.defs.decisions.length];
  nums.forEach((n, j) => { sum[j] += n; });
  const values = [
    r.defs.module + (r.azure.length ? ` (bugs ${Math.min(...r.azure)}-${Math.max(...r.azure)} in Azure)` : ''),
    link(r.defs.feature, workItemUrl(r.defs.feature)),
    String(r.defsRun || '') || require(path.join(ROOT, r.defs.finalReport)).runDate.slice(0, 10),
    ...nums,
    link(r.link, r.link),
  ];
  const row = ws.getRow(5 + i);
  values.forEach((v, j) => {
    const c = row.getCell(j + 1);
    c.value = v;
    c.alignment = { wrapText: true, vertical: 'top' };
    if (v && v.hyperlink) c.font = font;
  });
});
const total = ws.getRow(5 + rows.length);
total.getCell(1).value = 'Total';
sum.forEach((n, j) => { total.getCell(4 + j).value = n; });
total.font = { bold: true };
ws.views = [{ state: 'frozen', ySplit: 4 }];

const out = path.join(OUT_ROOT, 'PBM-Bug-Reports-Index.xlsx');
wb.xlsx.writeFile(out).then(() => console.log(`${path.relative(ROOT, out)}: ${rows.length} modules, ${sum[4]} bugs, ${sum[9]} decisions`));
