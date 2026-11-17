/* eslint-disable no-console */
/**
 * Turns a module's bug definition file into the payload used to create its
 * bugs in Azure DevOps, and stages each bug's evidence (at most 6 files: one
 * failure log per linked test case, up to 5, plus one screenshot).
 *
 *   node scripts/bugReport/azureBugPayload.js <defs .json> <tag> <out dir>
 *
 * Writes <out dir>/<key>-bugs-payload.json and <out dir>/<bug no>/<files>.
 * Bug text follows the house style: Repro Steps = description, preconditions,
 * Steps to Reproduce, Test Data, Actual Result, Expected Result (+ Note);
 * System Info = the environment lines.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const [DEFS, TAG, OUT] = process.argv.slice(2);
if (!DEFS || !TAG || !OUT) {
  console.error('usage: node scripts/bugReport/azureBugPayload.js <defs .json> <tag> <out dir>');
  process.exit(1);
}
const defs = JSON.parse(fs.readFileSync(DEFS, 'utf8'));
const exported = defs.export ? JSON.parse(fs.readFileSync(path.join(ROOT, defs.export), 'utf8')) : [];
const parent = new Map(exported.map((w) => [String(w.id), String(w.parent)]));
const moduleDir = path.join(ROOT, 'reports', 'bug-reports', defs.module.replace(/[^A-Za-z0-9]+/g, '-').replace(/-+$/, ''));
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const para = (label, text) => (text && text !== '-' ? `<p><strong>${label}:</strong><br>${esc(text).replace(/\n/g, '<br>')}</p>` : '');
const slug = (s) => String(s).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
const BUG_TYPE = { UI: 'GUI' };

const env = defs.environment || [];
const systemInfo = `<div><p>Environment: ${esc(env[0] || '')}<br>Browser: ${esc(env[1] || '')}<br>Language: ${esc(env[2] || '')}<br>User: ${esc(env[3] || '')}</p></div>`;

const payload = defs.bugs.map((b) => {
  const cases = b.cases.map(String);
  const stories = [...new Set(cases.map((c) => parent.get(c)).filter(Boolean))].map(Number);
  const reproSteps = '<div>'
    + `<p>${esc(b.description)}</p>`
    + para('Preconditions', b.preconditions)
    + `<p><strong>Steps to Reproduce:</strong></p><ol>${b.steps.map((s) => `<li>${esc(String(s).replace(/^\d+[.)]\s*/, ''))}</li>`).join('')}</ol>`
    + para('Test Data', b.testData)
    + para('Actual Result', b.actual)
    + para('Expected Result', b.expected)
    + para('Note', b.notes)
    + '</div>';

  // Evidence: the workbook's evidence folder for this bug.
  const src = path.join(moduleDir, 'evidence', slug(`Bug ${b.no}`));
  const files = fs.existsSync(src) ? fs.readdirSync(src) : [];
  const dest = path.join(OUT, b.no);
  fs.mkdirSync(dest, { recursive: true });
  const evidence = [];
  for (const c of cases.slice(0, 5)) {
    const log = files.find((f) => f === `TC-${c}-failure-log.txt`);
    if (!log) continue;
    const text = fs.readFileSync(path.join(src, log), 'utf8').replace(/^Reported under:.*\r?\n/m, '');
    fs.writeFileSync(path.join(dest, `${c}-failure-log.txt`), text);
    evidence.push(`${c}-failure-log.txt`);
  }
  const primary = String(b.primaryCase || cases[0]);
  const order = [primary, ...cases.filter((c) => c !== primary)];
  let shot = null;
  for (const c of order) {
    const msg = files.find((f) => f.startsWith(`TC-${c}-step-`) && f.includes('-message-'));
    const step = files.find((f) => f.startsWith(`TC-${c}-step-`) && f.endsWith('.png') && !f.includes('-message-'));
    if (msg || step) { shot = { c, f: msg || step }; break; }
  }
  if (shot) {
    const name = `${shot.c}-failure-screenshot.png`;
    fs.copyFileSync(path.join(src, shot.f), path.join(dest, name));
    evidence.push(name);
  }
  return {
    no: b.no, title: b.title, severity: b.severity, priority: b.priority, bugType: BUG_TYPE[b.bugType] || 'Functionality',
    tags: `${TAG}; PBM`, cases: cases.map(Number), stories, reproSteps, systemInfo, evidence,
  };
});

fs.writeFileSync(path.join(OUT, `${defs.key}-bugs-payload.json`), JSON.stringify(payload, null, 2));
console.log(`${defs.key}: ${payload.length} bugs, ${payload.reduce((n, p) => n + p.evidence.length, 0)} evidence files -> ${path.relative(ROOT, OUT)}`);
for (const p of payload) console.log(`  ${p.no} ${p.severity} P${p.priority} ${p.bugType} cases ${p.cases.join(',')} stories ${p.stories.join(',')} evidence ${p.evidence.length}`);
