// Builds reports/notification/PBM-Notification-Manual-Checklist.html - the 65 test cases of the 5 Notification Center
// stories the user tests by hand (21008, 21015, 21019, 20991, 21004). Page template = the Sprint 1 manual checklist
// (reports/PBM-Sprint1-Manual-Checklist.html): same db `results` shape {status, note, updatedAt, by}, doc id = TC id.
//   node scripts/notification/buildManualChecklist.js
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const NC = path.join(ROOT, 'reports', 'notification');
const exportRows = require(path.join(NC, 'source', 'notification-azure-export-2026-11-11.json'));
const estimate = require(path.join(NC, 'assessment', 'manual-estimate.json'));
const STORIES = [21008, 21015, 21019, 20991, 21004];

const stories = {};
const notes = {};
for (const id of STORIES) {
  const s = exportRows.find((r) => r.id === id);
  stories[id] = s.title;
  const e = estimate.stories.find((x) => x.id === id);
  notes[id] = e ? { setup: e.setupMin, text: e.notes } : null;
}
const clean = (t) => String(t || '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
const cases = exportRows
  .filter((r) => r.type === 'Test Case' && STORIES.includes(Number(r.parent)))
  .sort((a, b) => STORIES.indexOf(Number(a.parent)) - STORIES.indexOf(Number(b.parent)) || a.id - b.id)
  .map((r) => {
    const e = estimate.cases.find((x) => x.id === r.id) || {};
    return {
      id: r.id,
      s: Number(r.parent),
      t: r.title,
      pre: clean(r.description),
      st: (r.steps || []).map((x) => [clean(x.action), clean(x.expected)]),
      ex: e.execMin || null,
      wait: e.waitMin || 0,
      tip: e.missing || '',
    };
  });

const data = { stories, notes, order: STORIES, cases };
const template = fs.readFileSync(path.join(NC, 'manual-checklist.template.html'), 'utf8');
const html = template.replace('__DATA__', JSON.stringify(data).replace(/</g, '\\u003c'));
fs.writeFileSync(path.join(NC, 'PBM-Notification-Manual-Checklist.html'), html);
console.log(`cases ${cases.length}; per story ${STORIES.map((s) => `${s}:${cases.filter((c) => c.s === s).length}`).join(' ')}`);
