/**
 * Builds reports/blocked/PBM-Blocked-Cases-Checklist.html (2026-11-15): every BLOCKED test case of the modules from
 * Terminology to Role, to be tested by hand. Same page and db shape as the Notification manual checklist
 * (collection `results`, doc id = TC id, {status: PASS|FAIL|BLOCKED|null, note, updatedAt, by}).
 *   node scripts/buildBlockedChecklist.js
 * Case text (preconditions, steps) comes from each module's Azure export; Terminology's 38 cases were fetched from
 * Azure on 2026-11-15 into reports/terminology/source/terminology-blocked-tcs-2026-11-15.json.
 */
const fs = require('fs');
const path = require('path');
const { MODULES, GROUPS, groupOf } = require('./buildBlockedReport');

const ROOT = path.join(__dirname, '..');
const EXPORTS = {
  'Terminology Management': ['terminology-blocked-tcs-2026-11-15.json', 'terminology', 15145],
  'Formulary Management': ['formulary-azure-export-2026-11-02.json', 'formulary', 15190],
  'Policy Management': ['policy-azure-export-2026-11-03.json', 'policy', 15164],
  'Facility Management': ['facility-azure-export-2026-11-04.json', 'facility', 15130],
  'Member Management': ['member-azure-export-2026-11-05.json', 'member', 14375],
  'User Management': ['user-azure-export-2026-11-08.json', 'user', 12972],
  'System Settings': ['settings-azure-export-2026-11-09.json', 'settings', 20863],
  'Lookups Management': ['lookup-azure-export-2026-11-09.json', 'lookup', 20852],
  'Notification Center Management': ['notification-azure-export-2026-11-11.json', 'notification', 20980],
  'Role Management': ['role-azure-export-2026-11-14.json', 'role', 21279],
};
const clean = (t) => String(t || '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();

const modules = [];
const stories = {};
const cases = [];
for (const [name, file] of MODULES) {
  const [exportFile, key, feature] = EXPORTS[name];
  const rows = JSON.parse(fs.readFileSync(path.join(ROOT, 'reports', key, 'source', exportFile), 'utf8'));
  const report = JSON.parse(fs.readFileSync(path.join(ROOT, 'reports', file), 'utf8'));
  modules.push({ key, name, feature });
  for (const story of report.stories) {
    for (const c of story.cases) {
      if (c.status !== 'BLOCKED') continue;
      const tc = rows.find((r) => r.id === Number(c.id));
      if (!tc) throw new Error(`${name}: test case ${c.id} is not in ${exportFile}`);
      const sid = Number(tc.parent);
      if (!stories[sid]) {
        const s = rows.find((r) => r.id === sid);
        stories[sid] = ((s && s.title) || (story.azureStoryId === sid ? story.azureStoryTitle : '') || story.name).replace(/^US \d+\s+/, '');
      }
      const why = (c.actual || '').replace(/\s+/g, ' ').trim();
      cases.push({
        id: tc.id,
        m: key,
        s: sid,
        t: tc.title,
        pre: clean(tc.description),
        st: (tc.steps || []).map((x) => [clean(x.action), clean(x.expected)]),
        g: groupOf(why),
        why,
      });
    }
  }
}
// story order inside a module = story id, then case id
cases.sort((a, b) => modules.findIndex((m) => m.key === a.m) - modules.findIndex((m) => m.key === b.m) || a.s - b.s || a.id - b.id);

const groups = [...new Set([...GROUPS.map(([g]) => g), 'Starting record could not be set up for the case'])].filter((g) => cases.some((c) => c.g === g));
// Results the other testers recorded in Azure (read 2026-11-16, PASS/FAIL/NA/BLOCKED): carried into the main
// checklist as results (db `results`, src 'azure', bugs kept). Cases without one are the ones left to test.
const prior = JSON.parse(fs.readFileSync(path.join(ROOT, 'reports', 'blocked', 'source', 'azure-results-2026-11-16.json'), 'utf8'));
for (const c of cases) {
  const p = prior.cases[c.id];
  if (p) c.az = { s: p.status, d: p.date, by: p.by, run: p.run, bugs: p.bugs };
}
// --not-in-azure: only the cases nobody has a result for in Azure (never run there, or Role: not in any suite).
const NOT_IN_AZURE = process.argv.includes('--not-in-azure');
if (NOT_IN_AZURE) {
  cases.splice(0, cases.length, ...cases.filter((c) => !c.az));
  modules.splice(0, modules.length, ...modules.filter((m) => cases.some((c) => c.m === m.key)));
}
const data = { modules, stories, groups: groups.filter((g) => cases.some((c) => c.g === g)), cases, bugs: prior.bugs, view: NOT_IN_AZURE ? 'notaz' : 'all' };
const template = fs.readFileSync(path.join(ROOT, 'reports', 'blocked', 'blocked-checklist.template.html'), 'utf8');
const out = path.join(ROOT, 'reports', 'blocked', NOT_IN_AZURE ? 'PBM-Not-In-Azure-Checklist.html' : 'PBM-Blocked-Cases-Checklist.html');
let page = template.replace('__DATA__', JSON.stringify(data).replace(/</g, '\\u003c'));
if (NOT_IN_AZURE) {
  page = page.replace(/Blocked Cases Checklist/g, 'Not in Azure Checklist')
    .replace('test cases the automation could not run, Terminology to Role', 'blocked test cases nobody has tested in Azure yet, Terminology to Role');
}
fs.writeFileSync(out, page);
console.log(`${out}: ${cases.length} cases, ${Object.keys(stories).length} stories, ${modules.length} modules`);
for (const m of modules) console.log(`  ${m.name}: ${cases.filter((c) => c.m === m.key).length}`);
