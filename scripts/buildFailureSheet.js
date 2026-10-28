/* eslint-disable no-console */
/**
 * The failure sheet: an Excel workbook a non-technical reader can work from.
 *
 *   node scripts/buildFailureSheet.js <run report .json> <out .xlsx>
 *        [--rerun <re-run report .json>] [--verdicts <verdicts .json>] [--folder-map <map .json>]
 *
 * Sheets:
 *   Failed steps  - one row per failed step: case, story, what the step did,
 *                   expected result, actual result, what the screen showed,
 *                   screenshot links, the verdict (application issue / test
 *                   issue fixed / needs a business decision) and, when a re-run
 *                   is given, its result.
 *   Blocked cases - why each case could not be exercised.
 *   Summary       - counts per story.
 *
 * Every sentence comes from utils/failureNarrator.js - the same wording the
 * HTML report, steps.txt and Azure carry (QA lead, 2026-10-28: "the report
 * should be readable by human and can find the issue that happened").
 *
 * <run report .json> is the data file scripts/buildReport.js writes next to its
 * HTML (reports/PBM-<Module>-Module-<label>.json).
 */
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const { narrateStep, stepHeading } = require('../utils/failureNarrator');
const { workItemUrl } = require('./azureIds');

const args = process.argv.slice(2);
const flag = (name) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};
const [IN, OUT] = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
if (!IN || !OUT) {
  console.error('usage: node scripts/buildFailureSheet.js <run .json> <out .xlsx> [--rerun <json>] [--verdicts <json>] [--folder-map <json>]');
  process.exit(1);
}
const read = (file) => (file && fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null);
const run = read(IN);
const rerun = read(flag('--rerun'));
const verdicts = read(flag('--verdicts')) || {};
const folderMap = read(flag('--folder-map') || path.join('reports', 'plans', 'azure', 'plans-folder-map.json'));

/** The Azure story of a report story, from the folder map when there is one. */
const storyOf = (story) => {
  const folder = (folderMap && folderMap.folders || []).find((f) => f.folder === story.folder || (story.name || '').includes(f.title));
  return folder ? { id: folder.storyId, title: folder.title } : { id: story.azureStoryId, title: story.azureStoryTitle || story.name };
};
const rerunCase = new Map();
for (const story of (rerun && rerun.stories) || []) for (const c of story.cases) rerunCase.set(String(c.id), c);

const VERDICT_LABEL = {
  app: 'Application issue',
  automation: 'Test issue - fixed in the automation',
  decision: 'Needs a business decision',
  environment: 'Environment / test data',
};
const FILL = {
  header: 'FF1F3A5F', app: 'FFFDE2E1', automation: 'FFE3F1E4', decision: 'FFFFF4CE', environment: 'FFE8EAF0', fail: 'FFFDE2E1', pass: 'FFE3F1E4',
};

(async () => {
  const book = new ExcelJS.Workbook();
  book.creator = 'PBM automation';
  book.created = new Date();

  // ---- Failed steps -------------------------------------------------------------
  const sheet = book.addWorksheet('Failed steps', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = [
    { header: 'Case', key: 'case', width: 9 },
    { header: 'User story', key: 'story', width: 30 },
    { header: 'Test case', key: 'title', width: 42 },
    { header: 'Failed step', key: 'step', width: 34 },
    { header: 'Expected result', key: 'expected', width: 46 },
    { header: 'Actual result', key: 'actual', width: 58 },
    { header: 'What the screen showed at that moment', key: 'screen', width: 46 },
    { header: 'Verdict', key: 'verdict', width: 24 },
    { header: 'Explanation', key: 'note', width: 46 },
    { header: 'Re-run result', key: 'rerun', width: 40 },
    { header: 'Screenshot', key: 'shot', width: 14 },
    { header: 'Message screenshots', key: 'msgShots', width: 14 },
  ];

  const blocked = book.addWorksheet('Blocked cases', { views: [{ state: 'frozen', ySplit: 1 }] });
  blocked.columns = [
    { header: 'Case', key: 'case', width: 9 },
    { header: 'User story', key: 'story', width: 32 },
    { header: 'Test case', key: 'title', width: 50 },
    { header: 'Why it could not be tested', key: 'why', width: 90 },
  ];

  const summary = book.addWorksheet('Summary');
  summary.columns = [
    { header: 'User story', key: 'story', width: 60 },
    { header: 'Passed', key: 'pass', width: 10 },
    { header: 'Failed', key: 'fail', width: 10 },
    { header: 'Blocked', key: 'blocked', width: 10 },
    { header: 'Application issues', key: 'app', width: 18 },
    { header: 'Test issues (fixed)', key: 'auto', width: 18 },
    { header: 'Passed on re-run', key: 'fixedPass', width: 16 },
  ];

  const link = (cell, url, text) => {
    cell.value = { text, hyperlink: url };
    cell.font = { color: { argb: 'FF1D4ED8' }, underline: true };
  };
  const fileUrl = (p) => `file:///${String(p).replace(/\\/g, '/')}`;

  for (const story of run.stories || []) {
    const az = storyOf(story);
    const storyName = az.id ? `US ${az.id} - ${az.title}` : story.name;
    const counts = { story: storyName, pass: 0, fail: 0, blocked: 0, app: 0, auto: 0, fixedPass: 0 };

    for (const c of story.cases) {
      const status = c.status;
      if (status === 'PASS') counts.pass += 1;
      if (status === 'BLOCKED') {
        counts.blocked += 1;
        const why = String(c.actual || '').replace(/Labels present:.*$/s, '').replace(/\s*Underlying failure: \[RolePermissionsStep\]/, ' -').trim();
        const row = blocked.addRow({ case: Number(c.id) || c.id, story: storyName, title: c.expected, why });
        if (/^\d+$/.test(String(c.id))) link(row.getCell('case'), workItemUrl(c.id), String(c.id));
      }
      if (status !== 'FAIL') continue;
      counts.fail += 1;

      const verdict = verdicts[String(c.id)] || {};
      if (verdict.verdict === 'app') counts.app += 1;
      if (verdict.verdict === 'automation') counts.auto += 1;
      const again = rerunCase.get(String(c.id));
      if (again && again.status === 'PASS') counts.fixedPass += 1;
      const againText = again
        ? again.status === 'PASS'
          ? 'PASSED on re-run'
          : `${again.status} on re-run${again.status === 'FAIL' ? `: ${(again.steps || []).filter((s) => s.status === 'FAIL').map((s) => `${stepHeading(narrateStep(s))} - ${narrateStep(s).actual}`).join(' | ')}` : ''}`
        : '';

      const failedSteps = (c.steps || []).filter((s) => s.status === 'FAIL');
      const rows = failedSteps.length ? failedSteps : [{ index: '-', name: c.expected, reason: c.message || c.actual }];
      for (const s of rows) {
        const told = narrateStep(s);
        const plainWords = (s.reason ? told : s.plain) || told; // re-told from the raw reason, so wording fixes reach old runs
        const row = sheet.addRow({
          case: Number(c.id) || c.id,
          story: storyName,
          title: c.expected,
          step: s.index === '-' ? '(before the first step)' : `${stepHeading(told)}`,
          expected: plainWords.expected,
          actual: plainWords.actual,
          screen: (((s.plain && !s.reason) ? s.plain.screen : told.screen) || []).join('\n') || 'No message, pop-up or error was shown.',
          verdict: VERDICT_LABEL[verdict.verdict] || '',
          note: verdict.note || '',
          rerun: againText,
          shot: '',
          msgShots: '',
        });
        if (/^\d+$/.test(String(c.id))) link(row.getCell('case'), workItemUrl(c.id), String(c.id));
        if (s.screenshot) link(row.getCell('shot'), fileUrl(s.screenshot), 'Open');
        const shots = (s.observed && s.observed.screenshots) || [];
        if (shots.length) link(row.getCell('msgShots'), fileUrl(shots[shots.length - 1]), `${shots.length} - open last`);
        if (verdict.verdict && FILL[verdict.verdict]) {
          row.getCell('verdict').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL[verdict.verdict] } };
        }
        if (again) {
          row.getCell('rerun').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: again.status === 'PASS' ? FILL.pass : FILL.fail } };
        }
      }
    }
    summary.addRow(counts);
  }

  for (const ws of [sheet, blocked, summary]) {
    const head = ws.getRow(1);
    head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL.header } };
    head.alignment = { vertical: 'middle', wrapText: true };
    head.height = 30;
    ws.eachRow((row, n) => {
      if (n > 1) row.alignment = { vertical: 'top', wrapText: true };
    });
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columns.length } };
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  await book.xlsx.writeFile(OUT);
  console.log(`Failure sheet written: ${OUT}  (${sheet.rowCount - 1} failed steps, ${blocked.rowCount - 1} blocked cases)`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
