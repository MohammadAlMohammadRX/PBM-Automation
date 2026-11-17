/**
 * Every BLOCKED test case of the modules from Terminology onwards, in one workbook (2026-11-15).
 *   node scripts/buildBlockedReport.js [out.xlsx]
 * Reads each module's final report data (Terminology has only its Full-Run). Sheets: Summary (per module and per
 * reason group) and Blocked Cases (module, story, case, title, reason group, the run's full reason).
 */
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const { workItemUrl } = require('./azureIds');

const ROOT = path.join(__dirname, '..');
const OUT = process.argv[2] || path.join(ROOT, 'reports', 'PBM-Blocked-Test-Cases.xlsx');

const MODULES = [
  ['Terminology Management', 'PBM-Terminology-Module-Full-Run.json'],
  ['Formulary Management', 'PBM-Formulary-Module-Final.json'],
  ['Policy Management', 'PBM-Policy-Module-Final.json'],
  ['Facility Management', 'PBM-Facility-Module-Final.json'],
  ['Member Management', 'PBM-Member-Module-Final.json'],
  ['User Management', 'PBM-User-Module-Final.json'],
  ['System Settings', 'PBM-Settings-Module-Final.json'],
  ['Lookups Management', 'PBM-Lookup-Module-Final.json'],
  ['Notification Center Management', 'PBM-Notification-Module-Final.json'],
  ['Role Management', 'PBM-Role-Module-Final.json'],
];

/** Reason groups, first match wins - read from the run's own BLOCKED text. */
const GROUPS = [
  ['Not run on purpose (would change protected / shared data)', /switched off|predefined triggers|needs the user'/i],
  ['Second user or restricted role could not be signed in / set up', /restricted role|shaped Payer Admin|signed-in suite user|role holder signed in|role holding|Needs an account|accounts?:|distinct .*accounts|SECOND user|Needs two accounts|payer-scoped account|disposable .*USER|second account|role A offered|Payer Admin offered|Payer Admin's payer select|Needs a role|Needs a user assigned|Upload Data is offered/i],
  ['Session, password or sign-in state the suite cannot create', /session|temporary password|Two-factor|reset link|Locked user|never locks|password older|registration|invitation link|e-mail is unconfirmed|built-in platform account|only one non-administrator/i],
  ['Scheduled job or date-driven state not reached', /job|did not turn Active|still reads|Future|EXPIRED|expired|benefit year|Benefit Period|coverage year|new installation|effective in a few minutes|reminder process|precondition .* does not hold/i],
  ['Data the environment does not have (claims, transactions, volumes)', /claim|transaction|accumulator|PAYER-PAID|usage|resets performed|10,000|200 or more|42 members|catalogue|zero items|reversal|Authorizations|family/i],
  ['Record the application cannot produce (refused or not offered)', /cannot be created|cannot be produced|never saves|offers no|no delete|refused|not documented|outage|simulate|anomaly|EMPTY|Needs a way|standard/i],
];
const groupOf = (text) => (GROUPS.find(([, re]) => re.test(text)) || ['Starting record could not be set up for the case'])[0];

module.exports = { MODULES, GROUPS, groupOf };

if (require.main === module) (async () => {
  const rows = [];
  const perModule = [];
  for (const [module, file] of MODULES) {
    const report = JSON.parse(fs.readFileSync(path.join(ROOT, 'reports', file), 'utf8'));
    let total = 0;
    let blocked = 0;
    for (const story of report.stories) {
      for (const c of story.cases) {
        total += 1;
        if (c.status !== 'BLOCKED') continue;
        blocked += 1;
        const reason = (c.actual || '').replace(/\s+/g, ' ').trim();
        rows.push({
          module,
          story: story.azureStoryId ? `US ${story.azureStoryId} ${story.azureStoryTitle || ''}`.trim() : story.name,
          id: Number(c.id),
          title: (c.expectedReadable && c.expectedReadable.sentence) || c.expected || '',
          group: groupOf(reason),
          reason,
        });
      }
    }
    perModule.push({ module, total, blocked, run: file.includes('Full-Run') ? 'Full run' : 'Final (after re-runs)' });
  }

  const wb = new ExcelJS.Workbook();
  const head = (ws) => {
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B2A6B' } };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
  };

  const sum = wb.addWorksheet('Summary');
  sum.columns = [
    { header: 'Module', key: 'module', width: 34 },
    { header: 'Results used', key: 'run', width: 22 },
    { header: 'Test cases', key: 'total', width: 12 },
    { header: 'Blocked', key: 'blocked', width: 10 },
  ];
  perModule.forEach((m) => sum.addRow(m));
  const totalRow = sum.addRow({ module: 'Total', total: perModule.reduce((a, m) => a + m.total, 0), blocked: rows.length });
  totalRow.font = { bold: true };
  head(sum);
  sum.addRow([]);
  const gHead = sum.addRow(['Reason group', '', 'Blocked', 'Modules']);
  gHead.font = { bold: true };
  const groups = [...new Set([...GROUPS.map(([g]) => g), 'Starting record could not be set up for the case'])];
  for (const g of groups) {
    const hit = rows.filter((r) => r.group === g);
    if (!hit.length) continue;
    const mods = [...new Set(hit.map((r) => r.module.replace(/ Management$/, '')))].join(', ');
    sum.addRow([g, '', hit.length, mods]).alignment = { wrapText: true, vertical: 'top' };
  }
  sum.getColumn(4).width = 60;

  const ws = wb.addWorksheet('Blocked Cases');
  ws.columns = [
    { header: 'Module', key: 'module', width: 24 },
    { header: 'User story', key: 'story', width: 40 },
    { header: 'Test case', key: 'id', width: 11 },
    { header: 'Title', key: 'title', width: 55 },
    { header: 'Reason group', key: 'group', width: 34 },
    { header: 'Why it is blocked (from the run)', key: 'reason', width: 110 },
  ];
  rows.forEach((r) => {
    const row = ws.addRow(r);
    row.alignment = { wrapText: true, vertical: 'top' };
    row.getCell('id').value = { text: String(r.id), hyperlink: workItemUrl(r.id) };
    row.getCell('id').font = { color: { argb: 'FF1F5FBF' }, underline: true };
  });
  head(ws);
  ws.autoFilter = { from: 'A1', to: 'F1' };

  await wb.xlsx.writeFile(OUT);
  console.log(`${OUT}: ${rows.length} blocked cases in ${perModule.length} modules`);
  for (const g of groups) {
    const n = rows.filter((r) => r.group === g).length;
    if (n) console.log(`  ${n}  ${g}`);
  }
})();
