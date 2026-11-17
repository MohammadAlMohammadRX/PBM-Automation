/* eslint-disable no-console */
/**
 * Checks a module's bug definition file against its final report.
 *
 *   node scripts/bugReport/checkDefs.js reports/bug-reports/defs/<key>.bugs.json
 *
 * Every FAIL case of the final report must sit in exactly one bug, decision or
 * notBugs entry; no other case may appear. Each bug needs the fields the
 * workbook prints. Prints OK, or the problems (exit 1).
 */
const fs = require('fs');
const path = require('path');

const file = process.argv[2];
if (!file) {
  console.error('usage: node scripts/bugReport/checkDefs.js <defs .json>');
  process.exit(1);
}
const root = path.resolve(__dirname, '..', '..');
const defs = JSON.parse(fs.readFileSync(file, 'utf8'));
const problems = [];
const report = JSON.parse(fs.readFileSync(path.join(root, defs.finalReport), 'utf8'));

const status = new Map();
for (const s of report.stories) for (const c of s.cases) status.set(String(c.id), c.status);
const failed = [...status].filter(([, st]) => st === 'FAIL').map(([id]) => id);

const seen = new Map();
const place = (id, where) => {
  id = String(id);
  if (seen.has(id)) problems.push(`case ${id} is in both ${seen.get(id)} and ${where}`);
  else seen.set(id, where);
  if (!status.has(id)) problems.push(`case ${id} (${where}) is not in the final report`);
  else if (status.get(id) !== 'FAIL') problems.push(`case ${id} (${where}) is ${status.get(id)}, not FAIL`);
};

const SEVERITIES = ['1 - Critical', '2 - High', '3 - Medium', '4 - Low'];
const TYPES = ['Functionality', 'Validation', 'Permissions', 'UI', 'Data', 'Performance'];
const nos = new Set();
for (const b of defs.bugs || []) {
  const tag = `bug ${b.no || '?'}`;
  if (!b.no) problems.push('a bug has no "no"');
  if (nos.has(b.no)) problems.push(`${tag}: duplicate number`);
  nos.add(b.no);
  for (const k of ['title', 'description', 'actual', 'expected']) if (!b[k] || !String(b[k]).trim()) problems.push(`${tag}: empty ${k}`);
  if (!Array.isArray(b.steps) || b.steps.length === 0) problems.push(`${tag}: no steps`);
  if (!SEVERITIES.includes(b.severity)) problems.push(`${tag}: severity "${b.severity}" is not one of ${SEVERITIES.join(' / ')}`);
  if (![1, 2, 3, 4].includes(b.priority)) problems.push(`${tag}: priority must be 1-4`);
  if (b.bugType && !TYPES.includes(b.bugType)) problems.push(`${tag}: bugType "${b.bugType}" is not one of ${TYPES.join(' / ')}`);
  if (!Array.isArray(b.cases) || b.cases.length === 0) problems.push(`${tag}: no cases`);
  for (const id of b.cases || []) place(id, tag);
  if (/expect\(|toBe|toEqual|locator|selector|fixture|annotation/i.test(`${b.actual} ${b.expected} ${b.title}`)) problems.push(`${tag}: automation wording in title/actual/expected`);
}
for (const d of defs.decisions || []) {
  if (!d.topic || !d.decisionNeeded) problems.push(`decision ${d.no || '?'}: needs topic and decisionNeeded`);
  for (const id of d.cases || []) place(id, `decision ${d.no}`);
}
for (const n of defs.notBugs || []) {
  if (!n.reason) problems.push(`notBugs ${n.case}: no reason`);
  place(n.case, 'notBugs');
}
for (const id of failed) if (!seen.has(id)) problems.push(`FAIL case ${id} is not covered`);

if (problems.length) {
  console.log(`${problems.length} problem(s):\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log(`OK - ${failed.length} failed cases: ${(defs.bugs || []).length} bugs, ${(defs.decisions || []).length} decisions, ${(defs.notBugs || []).length} not bugs`);
