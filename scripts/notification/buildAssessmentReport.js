/* eslint-disable no-console */
/**
 * Notification Center Management (Feature 20980) - automation assessment report.
 *
 *   node scripts/notification/buildAssessmentReport.js
 *
 * Reads reports/notification/assessment/*.json (one file per story group, written by the
 * assessment, see reports/notification/Notification-Assessment-Brief.md) and the Azure export,
 * and writes:
 *   reports/notification/PBM-Notification-Automation-Assessment.html  (the review page)
 *   reports/notification/PBM-Notification-Details-Needed.xlsx        (questions + an Answer column)
 */
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const ROOT = path.resolve(__dirname, '..', '..');
const DIR = path.join(ROOT, 'reports', 'notification');
const AS = path.join(DIR, 'assessment');
const EXPORT = require(path.join(DIR, 'source', 'notification-azure-export-2026-11-11.json'));
const CFG = require(path.join(DIR, 'assessment-config.json'));
const ADO = 'https://dev.azure.com/neomatixco/CareConnect/_workitems/edit/';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const link = (id) => `<a href="${ADO}${id}" target="_blank" rel="noopener">${id}</a>`;
const h = (min) => Math.round((min / 60) * 10) / 10;

const VERDICTS = {
  AUTO: { label: 'Automatable', cls: 'v-auto', note: 'The suite can build every precondition itself.' },
  AUTO_NEEDS_DETAILS: { label: 'Automatable - needs details', cls: 'v-details', note: 'Automatable once the missing precondition / test data / expected result is given.' },
  AUTO_JOB: { label: 'Automatable - job / date', cls: 'v-job', note: 'Needs the admin to move a job time (restored after) or dated seed data.' },
  PARTIAL: { label: 'Partly automatable', cls: 'v-partial', note: 'At least one step (usually "received by e-mail/SMS") can only be checked as an attempt.' },
  BLOCKED_ENV: { label: 'Blocked by environment', cls: 'v-blocked', note: 'Automated as a BLOCKED test until the environment allows it.' },
  MANUAL: { label: 'Manual only', cls: 'v-manual', note: 'Not sensibly automatable.' },
};
const ORDER = Object.keys(VERDICTS);

// ---- load
const groups = fs.readdirSync(AS).filter((f) => f.endsWith('.json') && !['manual-estimate.json', 'live-probe-changes.json'].includes(f))
  .map((f) => JSON.parse(fs.readFileSync(path.join(AS, f), 'utf8')));
const manual = fs.existsSync(path.join(AS, 'manual-estimate.json')) ? JSON.parse(fs.readFileSync(path.join(AS, 'manual-estimate.json'), 'utf8')) : null;
const cases = groups.flatMap((g) => g.cases.map((c) => ({ ...c, group: g.group })));
const storyInfo = new Map(groups.flatMap((g) => g.stories.map((s) => [Number(s.id), { ...s, group: g.group }])));
const tcOf = new Map(EXPORT.filter((w) => w.type === 'Test Case').map((w) => [w.id, w]));
const storyTitle = new Map(EXPORT.filter((w) => w.type === 'User Story').map((w) => [w.id, w.title]));

// ---- checks
const inScope = CFG.automationStories;
const expected = EXPORT.filter((w) => w.type === 'Test Case' && inScope.includes(w.parent)).map((w) => w.id);
const seen = new Map();
for (const c of cases) seen.set(Number(c.id), (seen.get(Number(c.id)) || 0) + 1);
const missingCases = expected.filter((id) => !seen.has(id));
const dupCases = [...seen].filter(([, n]) => n > 1).map(([id]) => id);
const strayCases = [...seen.keys()].filter((id) => !expected.includes(id));
const badVerdict = cases.filter((c) => !VERDICTS[c.verdict]).map((c) => c.id);
if (missingCases.length || dupCases.length || strayCases.length || badVerdict.length) {
  console.error('assessment incomplete:', { missingCases, dupCases, strayCases, badVerdict });
  process.exit(1);
}

// ---- per story rows
const stories = inScope.map((id) => {
  const cs = cases.filter((c) => Number(c.story) === id || (tcOf.get(Number(c.id))?.parent === id));
  const by = Object.fromEntries(ORDER.map((v) => [v, cs.filter((c) => c.verdict === v).length]));
  return {
    id, title: storyTitle.get(id), flagged: CFG.flaggedStories.includes(id), info: storyInfo.get(id) || {},
    count: cs.length, by, writeMin: cs.reduce((n, c) => n + (Number(c.writeMin) || 0), 0),
    runSec: cs.reduce((n, c) => n + (Number(c.runSec) || 0), 0),
    questions: cs.filter((c) => c.question || c.missing).length,
  };
});
const totals = Object.fromEntries(ORDER.map((v) => [v, cases.filter((c) => c.verdict === v).length]));
const totalWrite = cases.reduce((n, c) => n + (Number(c.writeMin) || 0), 0);
const totalRun = cases.reduce((n, c) => n + (Number(c.runSec) || 0), 0);
const needDetails = cases.filter((c) => (c.question && c.question.trim()) || (c.missing && c.missing.trim()));

// ---- manual
const manualStories = manual ? manual.stories.map((s) => {
  const cs = manual.cases.filter((c) => Number(c.story) === Number(s.id));
  const exec = cs.reduce((n, c) => n + (Number(c.execMin) || 0), 0);
  const wait = cs.reduce((n, c) => n + (Number(c.waitMin) || 0), 0);
  // Hands-on time only; waiting on a job / schedule is calendar time that overlaps (CFG.manualCalendar).
  return { ...s, count: cs.length, exec, wait, total: (Number(s.setupMin) || 0) + exec, calendar: (CFG.manualCalendar || {})[s.id] || (wait ? `${wait} min of waiting` : 'same day'), cases: cs };
}) : [];
const manualTotal = manualStories.reduce((n, s) => n + s.total, 0);

// ---- plan (phases) from the config, with the computed writing / run figures
const phases = CFG.phases.map((p) => {
  if (p.key === 'write') return { ...p, effortH: h(totalWrite) };
  if (p.key === 'fullrun') return { ...p, effortH: Math.round((totalRun / 3600) * 10) / 10 + (p.extraH || 0) };
  return p;
});

// ---- HTML
const verdictPill = (v) => `<span class="pill ${VERDICTS[v].cls}">${esc(VERDICTS[v].label)}</span>`;
const bar = (by, n) => `<div class="bar">${ORDER.filter((v) => by[v]).map((v) => `<span class="${VERDICTS[v].cls}" style="width:${(by[v] / n) * 100}%" title="${esc(VERDICTS[v].label)}: ${by[v]}"></span>`).join('')}</div>`;

const storyRows = stories.map((s) => `<tr${s.flagged ? ' class="flag"' : ''}>
  <td>${link(s.id)}${s.flagged ? ' <span class="tag">you flagged</span>' : ''}</td><td>${esc(s.title)}</td><td class="num">${s.count}</td>
  ${ORDER.map((v) => `<td class="num">${s.by[v] || ''}</td>`).join('')}
  <td>${bar(s.by, s.count)}</td><td class="num">${s.questions || ''}</td><td class="num">${h(s.writeMin)}</td><td class="num">${Math.round(s.runSec / 60)}</td></tr>`).join('');

const detailsByStory = inScope.map((sid) => {
  const cs = needDetails.filter((c) => (tcOf.get(Number(c.id))?.parent ?? Number(c.story)) === sid);
  if (!cs.length) return '';
  return `<details class="story"${CFG.flaggedStories.includes(sid) ? ' open' : ''}><summary>${link(sid)} ${esc(storyTitle.get(sid))} <span class="count">${cs.length} case${cs.length > 1 ? 's' : ''}</span>${CFG.flaggedStories.includes(sid) ? ' <span class="tag">you flagged</span>' : ''}</summary>
  <table class="q"><thead><tr><th>Test case</th><th>Verdict</th><th>What is missing</th><th>Question for you / the BA</th></tr></thead><tbody>
  ${cs.map((c) => `<tr><td>${link(c.id)}<div class="t">${esc(c.title)}</div></td><td>${verdictPill(c.verdict)}</td><td>${esc(c.missing)}</td><td>${esc(c.question)}</td></tr>`).join('')}
  </tbody></table></details>`;
}).join('');

const allRows = cases.slice().sort((a, b) => a.id - b.id).map((c) => {
  const tc = tcOf.get(Number(c.id));
  const pre = (tc?.description.split('Preconditions:')[1] || '').split('Test Data:')[0].trim();
  return `<tr data-v="${c.verdict}" data-s="${tc?.parent}"><td>${link(c.id)}</td><td>${link(tc?.parent)}</td><td>${esc(c.title)}<div class="t">Preconditions: ${esc(pre) || '-'}</div></td><td>${verdictPill(c.verdict)}</td><td>${esc(c.how)}</td><td>${esc((c.envNeeds || []).filter((e) => e !== 'none').join(', '))}</td><td>${esc(c.missing)}</td><td class="num">${c.writeMin}</td></tr>`;
}).join('');

const manualHtml = manual ? `
<h2 id="manual">Manual testing estimate - the 5 stories you will test by hand</h2>
<p class="lead">Hands-on time for one tester to run every case once: one-off preparation for the story, then each case (prepare its data, run the steps, record the result). Waiting for a job or a schedule is calendar time, not work: the waits overlap and are shown separately. Re-tests after bug fixes are not included.</p>
<table><thead><tr><th>Story</th><th>Title</th><th class="num">Cases</th><th class="num">Preparation (min)</th><th class="num">Execution (min)</th><th class="num">Hands-on (hours)</th><th>Waiting (calendar)</th><th>Notes</th></tr></thead><tbody>
${manualStories.map((s) => `<tr><td>${link(s.id)}</td><td>${esc(s.title || storyTitle.get(Number(s.id)))}</td><td class="num">${s.count}</td><td class="num">${s.setupMin}</td><td class="num">${s.exec}</td><td class="num"><b>${h(s.total)}</b></td><td>${esc(s.calendar)}</td><td>${esc(s.notes)}</td></tr>`).join('')}
<tr class="tot"><td colspan="2">Total</td><td class="num">${manualStories.reduce((n, s) => n + s.count, 0)}</td><td class="num">${manualStories.reduce((n, s) => n + (Number(s.setupMin) || 0), 0)}</td><td class="num">${manualStories.reduce((n, s) => n + s.exec, 0)}</td><td class="num"><b>${h(manualTotal)}</b></td><td>${esc(CFG.manualCalendarTotal || '')}</td><td>about ${Math.ceil(h(manualTotal) / 6)} working day(s) of hands-on work at 6 focused hours a day</td></tr>
</tbody></table>
${manualStories.map((s) => `<details class="story"><summary>${link(s.id)} ${esc(s.title || storyTitle.get(Number(s.id)))} <span class="count">${s.count} cases</span></summary>
<table class="q"><thead><tr><th>Test case</th><th class="num">Exec (min)</th><th class="num">Wait (min)</th><th>Missing for a manual tester</th><th>Note</th></tr></thead><tbody>
${s.cases.map((c) => `<tr><td>${link(c.id)}<div class="t">${esc(c.title)}</div></td><td class="num">${c.execMin}</td><td class="num">${c.waitMin || ''}</td><td>${esc([c.missing, c.question].filter(Boolean).join(' - '))}</td><td>${esc(c.note)}</td></tr>`).join('')}
</tbody></table></details>`).join('')}` : '';

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Notification Center Automation Assessment</title>
<style>
:root{--bg:#f7f8fa;--card:#fff;--ink:#1d2330;--muted:#5b6475;--line:#e3e6ec;--accent:#0b6e75;
--auto:#2e8b57;--details:#d18f00;--job:#3a6fd8;--partial:#8a5cc7;--blocked:#c4513b;--manual:#6b7280;--flag:#fff7e0}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#14171d;--card:#1c2028;--ink:#e6e8ec;--muted:#a3abb8;--line:#2c323d;--accent:#4fb3ba;--flag:#2d2817}}
:root[data-theme=dark]{--bg:#14171d;--card:#1c2028;--ink:#e6e8ec;--muted:#a3abb8;--line:#2c323d;--accent:#4fb3ba;--flag:#2d2817}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 "Segoe UI",system-ui,sans-serif}
main{max-width:1280px;margin:0 auto;padding:24px 16px 64px}h1{font-size:24px;margin:0 0 4px}h2{font-size:18px;margin:36px 0 8px;color:var(--accent)}
.lead{color:var(--muted);margin:4px 0 14px}.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:16px 0}
.tile{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:12px}.tile b{display:block;font-size:24px}.tile span{color:var(--muted);font-size:12px}
.card{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:14px 16px;margin:10px 0}
.warn{border-left:4px solid var(--blocked)}table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);font-size:13px}
th,td{padding:7px 8px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}th{background:color-mix(in srgb,var(--accent) 10%,var(--card));font-weight:600}
.num{text-align:right;white-space:nowrap}tr.flag td{background:var(--flag)}tr.tot td{font-weight:600}.t{color:var(--muted);font-size:12px}
.pill{display:inline-block;padding:1px 8px;border-radius:10px;color:#fff;font-size:12px;white-space:nowrap}
.v-auto{background:var(--auto)}.v-details{background:var(--details)}.v-job{background:var(--job)}.v-partial{background:var(--partial)}.v-blocked{background:var(--blocked)}.v-manual{background:var(--manual)}
.bar{display:flex;height:10px;min-width:120px;border-radius:5px;overflow:hidden;background:var(--line)}.bar span{display:block;height:100%}
.tag{font-size:11px;background:var(--details);color:#fff;border-radius:8px;padding:0 6px}.count{color:var(--muted);font-weight:400}
details.story{background:var(--card);border:1px solid var(--line);border-radius:8px;margin:8px 0;padding:6px 12px}details.story summary{cursor:pointer;font-weight:600;padding:4px 0}
details.story table{margin:8px 0}.scroll{overflow-x:auto}a{color:var(--accent)}
.filters{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0}.filters select,.filters input{padding:5px 8px;border:1px solid var(--line);border-radius:6px;background:var(--card);color:var(--ink)}
ul.legend{list-style:none;padding:0;margin:8px 0;display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:6px}
@media (max-width:700px){table{font-size:12px}th,td{padding:5px}}
</style></head><body><main>
<h1>Notification Center Management - automation assessment</h1>
<p class="lead">Feature ${link(20980)} · PBM Sprint 3 · test plan 20972, suite 21975 · assessed ${CFG.date} from the Azure test cases and a read-only probe of the live screens (${esc(CFG.probeDate)}). Nothing was saved or changed in the app.</p>

<div class="tiles">
<div class="tile"><b>${CFG.feature.stories}</b><span>user stories in the feature (${CFG.feature.cases} test cases)</span></div>
<div class="tile"><b>${inScope.length}</b><span>stories to automate (${cases.length} test cases)</span></div>
<div class="tile"><b>${CFG.manualStories.length}</b><span>stories you test by hand (${manualStories.reduce((n, s) => n + s.count, 0)} test cases)</span></div>
<div class="tile"><b>${CFG.excludedOnly.length}</b><span>other stories left out (${CFG.excludedOnlyCases} test cases)</span></div>
<div class="tile"><b>${needDetails.length}</b><span>test cases with a missing detail or a question (${totals.AUTO_NEEDS_DETAILS} cannot be written without it)</span></div>
</div>

${CFG.blockers.map((b) => `<div class="card warn"><b>${esc(b.title)}</b><br>${esc(b.text)}</div>`).join('')}

<h2>Can automation do it? - all ${cases.length} test cases</h2>
<div class="tiles">${ORDER.map((v) => `<div class="tile"><b>${totals[v]}</b>${verdictPill(v)}<br><span>${esc(VERDICTS[v].note)}</span></div>`).join('')}</div>

<h2>Time estimate - every action, before we start</h2>
<p class="lead">${esc(CFG.estimateNote)}</p>
<table><thead><tr><th>#</th><th>Action</th><th>What it includes</th><th class="num">Effort (hours)</th><th>Elapsed with our setup</th><th>Depends on</th></tr></thead><tbody>
${phases.map((p, i) => `<tr><td>${i + 1}</td><td><b>${esc(p.name)}</b></td><td>${esc(p.what)}</td><td class="num">${p.effortH ?? '-'}</td><td>${esc(p.elapsed)}</td><td>${esc(p.dependsOn || '')}</td></tr>`).join('')}
<tr class="tot"><td></td><td colspan="2">Automation total</td><td class="num">${Math.round(phases.reduce((n, p) => n + (Number(p.effortH) || 0), 0))}</td><td>${esc(CFG.elapsedTotal)}</td><td></td></tr>
</tbody></table>

<h2>Per story</h2>
<p class="lead">Highlighted rows are the stories you asked me to check case by case. Writing hours are engineer effort per case from the estimate guide; run minutes are one full run.</p>
<div class="scroll"><table><thead><tr><th>Story</th><th>Title</th><th class="num">Cases</th>${ORDER.map((v) => `<th class="num" title="${esc(VERDICTS[v].label)}">${esc(VERDICTS[v].label.replace('Automatable - ', '').replace('Automatable', 'Auto'))}</th>`).join('')}<th>Mix</th><th class="num">Need details</th><th class="num">Write (h)</th><th class="num">Run (min)</th></tr></thead><tbody>${storyRows}</tbody></table></div>

<h2 id="details">Test cases that need more details in their preconditions</h2>
<p class="lead">For each case: what is missing and the question to answer. The same list is in <b>PBM-Notification-Details-Needed.xlsx</b> with an empty "Answer" column. Fill it in and I'll put the answers into the automation.</p>
${detailsByStory}

${manualHtml}

<h2>Every test case</h2>
<div class="filters"><select id="fv"><option value="">All verdicts</option>${ORDER.map((v) => `<option value="${v}">${esc(VERDICTS[v].label)}</option>`).join('')}</select>
<select id="fs"><option value="">All stories</option>${inScope.map((s) => `<option value="${s}">${s} ${esc(storyTitle.get(s))}</option>`).join('')}</select>
<input id="fq" placeholder="Search text"></div>
<div class="scroll"><table id="all"><thead><tr><th>TC</th><th>Story</th><th>Title / preconditions</th><th>Verdict</th><th>How automation does it</th><th>Needs</th><th>Missing</th><th class="num">Write (min)</th></tr></thead><tbody>${allRows}</tbody></table></div>

<h2>Left out of automation</h2>
<p class="lead">As you asked: ${CFG.excludedOnly.map((s) => `${link(s)} ${esc(storyTitle.get(s))}`).join(' · ')}; and the manual stories ${CFG.manualStories.map((s) => link(s)).join(', ')}.</p>
</main>
<script>
const fv=document.getElementById('fv'),fs=document.getElementById('fs'),fq=document.getElementById('fq');
function f(){const v=fv.value,s=fs.value,q=fq.value.toLowerCase();for(const r of document.querySelectorAll('#all tbody tr')){r.style.display=(!v||r.dataset.v===v)&&(!s||r.dataset.s===s)&&(!q||r.textContent.toLowerCase().includes(q))?'':'none';}}
[fv,fs].forEach(e=>e.addEventListener('change',f));fq.addEventListener('input',f);
</script></body></html>`;
fs.writeFileSync(path.join(DIR, 'PBM-Notification-Automation-Assessment.html'), html);

// ---- XLSX: questions with an Answer column
(async () => {
  const wb = new ExcelJS.Workbook();
  const head = (ws) => { ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }; ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B6E75' } }; ws.views = [{ state: 'frozen', ySplit: 1 }]; ws.autoFilter = { from: 'A1', to: { row: 1, column: ws.columnCount } }; };
  const q = wb.addWorksheet('Details Needed');
  q.columns = [
    { header: 'Story', key: 's', width: 9 }, { header: 'Story title', key: 'st', width: 32 }, { header: 'Test case', key: 'id', width: 10 },
    { header: 'Test case title', key: 't', width: 48 }, { header: 'Current preconditions', key: 'pre', width: 48 }, { header: 'Verdict', key: 'v', width: 24 },
    { header: 'What is missing', key: 'm', width: 52 }, { header: 'Question', key: 'q', width: 52 }, { header: 'Answer', key: 'a', width: 48 },
  ];
  for (const c of needDetails.slice().sort((a, b) => (tcOf.get(+a.id)?.parent - tcOf.get(+b.id)?.parent) || a.id - b.id)) {
    const tc = tcOf.get(Number(c.id));
    const pre = (tc?.description.split('Preconditions:')[1] || '').trim();
    const r = q.addRow({ s: tc?.parent, st: storyTitle.get(tc?.parent), id: Number(c.id), t: c.title, pre, v: VERDICTS[c.verdict].label, m: c.missing, q: c.question, a: '' });
    r.getCell('id').value = { text: String(c.id), hyperlink: ADO + c.id };
    r.getCell('a').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7E0' } };
  }
  q.eachRow((row) => { row.alignment = { wrapText: true, vertical: 'top' }; });
  head(q);
  const a = wb.addWorksheet('All Cases');
  a.columns = [{ header: 'Story', key: 's', width: 9 }, { header: 'Test case', key: 'id', width: 10 }, { header: 'Title', key: 't', width: 50 }, { header: 'Verdict', key: 'v', width: 24 },
    { header: 'How', key: 'h', width: 52 }, { header: 'Needs', key: 'n', width: 22 }, { header: 'Missing', key: 'm', width: 44 }, { header: 'Write (min)', key: 'w', width: 11 }, { header: 'Run (s)', key: 'r', width: 9 }];
  for (const c of cases.slice().sort((x, y) => x.id - y.id)) a.addRow({ s: tcOf.get(+c.id)?.parent, id: +c.id, t: c.title, v: VERDICTS[c.verdict].label, h: c.how, n: (c.envNeeds || []).filter((e) => e !== 'none').join(', '), m: c.missing, w: c.writeMin, r: c.runSec });
  a.eachRow((row) => { row.alignment = { wrapText: true, vertical: 'top' }; });
  head(a);
  if (manual) {
    const m = wb.addWorksheet('Manual Estimate');
    m.columns = [{ header: 'Story', key: 's', width: 9 }, { header: 'Test case', key: 'id', width: 10 }, { header: 'Title', key: 't', width: 50 }, { header: 'Exec (min)', key: 'e', width: 10 }, { header: 'Wait (min)', key: 'w', width: 10 }, { header: 'Missing / question', key: 'm', width: 56 }, { header: 'Note', key: 'n', width: 40 }];
    for (const s of manualStories) for (const c of s.cases) m.addRow({ s: s.id, id: c.id, t: c.title, e: c.execMin, w: c.waitMin, m: [c.missing, c.question].filter(Boolean).join(' - '), n: c.note });
    m.eachRow((row) => { row.alignment = { wrapText: true, vertical: 'top' }; });
    head(m);
  }
  await wb.xlsx.writeFile(path.join(DIR, 'PBM-Notification-Details-Needed.xlsx'));
  console.log(`cases ${cases.length}`, totals, `write ${h(totalWrite)} h, run ${Math.round(totalRun / 60)} min, need details ${needDetails.length}, manual ${h(manualTotal)} h`);
  for (const s of stories) console.log(`  ${s.id} ${s.count} write ${h(s.writeMin)}h run ${Math.round(s.runSec / 60)}m`, JSON.stringify(s.by));
})();
