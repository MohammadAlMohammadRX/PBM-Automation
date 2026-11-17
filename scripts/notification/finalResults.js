// Final Notification result per case = its LATEST executed result across the full run and the labelled re-runs
// (a SKIPPED / "did not run" entry never overrides an executed one).
//   node scripts/notification/finalResults.js Full-Run notification-rerun1 notification-rerun2
// Writes reports/notification/final-results.json and prints totals + the non-pass list per folder.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const labels = process.argv.slice(2);
const map = require(path.join(ROOT, 'reports', 'notification', 'source', 'notification-folder-map.json'));
const folderOf = {};
for (const x of Object.values(map)) for (const id of x.cases) folderOf[id] = x.folder.slice(0, 2);

const final = {};
for (const label of labels) {
  const j = require(path.join(ROOT, 'reports', `PBM-Notification-Module-${label}.json`));
  for (const s of j.stories) {
    for (const c of s.cases) {
      if (!['PASS', 'FAIL', 'BLOCKED'].includes(c.status)) continue;
      final[c.id] = { id: Number(c.id), folder: folderOf[c.id], status: c.status, run: label, actual: c.actual, steps: c.steps };
    }
  }
}
const all = Object.keys(folderOf).map(Number);
const missing = all.filter((id) => !final[id]);
const totals = { PASS: 0, FAIL: 0, BLOCKED: 0 };
for (const r of Object.values(final)) totals[r.status] += 1;
fs.writeFileSync(path.join(ROOT, 'reports', 'notification', 'final-results.json'), JSON.stringify({ runs: labels, totals, missing, cases: Object.values(final) }, null, 2));
console.log(`cases ${Object.keys(final).length}/${all.length}`, JSON.stringify(totals), 'missing', JSON.stringify(missing));
const byFolder = {};
for (const r of Object.values(final)) if (r.status !== 'PASS') (byFolder[r.folder] = byFolder[r.folder] || []).push(`${r.id}${r.status === 'BLOCKED' ? '(B)' : ''}`);
for (const f of Object.keys(byFolder).sort()) console.log(f, byFolder[f].join(' '));
