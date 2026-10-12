/**
 * Merges partial result sets CASE BY CASE, later layers winning.
 *
 *   node scripts/mergeLayers.js <out.json> <baseDir> [<laterDir> ...]
 *
 *   CURRENT_TESTS=<listing.json>  drop results of tests no longer in the code; make the
 *   listing with  npx playwright test tests/payer --list --reporter=json > listing.json
 *
 * WHY NOT mergeResults.js. That script lets a later partial replace an earlier
 * one per SUITE FILE - right for whole-folder re-runs, wrong for a targeted
 * re-run (CASES=...), whose partial holds only the cases it ran. Merged per
 * file, re-running two cases of a twenty-case file would silently drop the
 * other eighteen from the report.
 *
 * Here every case is keyed by its file and full describe path plus its title,
 * and the latest layer that ran it supplies its result; everything else keeps
 * the result it had. The describe path is preserved, because the report reads
 * it - a describe tagged [MANUAL] is how manual stories are recognised.
 *
 * Each case remembers which layer produced it ("_layer"), so the report can
 * say where a result came from.
 */
const fs = require('fs');
const path = require('path');

const [out, ...dirs] = process.argv.slice(2);
if (!out || dirs.length === 0) {
  console.error('usage: node scripts/mergeLayers.js <out.json> <baseDir> [<laterDir> ...]');
  process.exit(1);
}

const cases = new Map(); // key -> { file, chain, spec }
const fromLayer = {};
for (const [layerIndex, dir] of dirs.entries()) {
  const layer = path.basename(dir);
  for (const f of fs.readdirSync(dir).filter((x) => /^\d\d\.json$/.test(x)).sort()) {
    const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    // By POSITION, not by the `file` field: Playwright puts `file` on every
    // suite, describes included, so "has a file" cannot tell a file from a
    // describe - and treating describes as files dropped the [MANUAL] titles
    // the report needs. Top-level suites are files; everything nested is a
    // describe.
    (function walk(suites, file, chain, topLevel) {
      for (const s of suites || []) {
        const here = topLevel ? (s.file || s.title || file) : file;
        const nextChain = topLevel ? [] : [...chain, s.title || ''];
        for (const spec of s.specs || []) {
          // FILE + TITLE, not the describe path: a case moved into a new
          // describe (16414/16418/16419 were, when converted from BLOCKED)
          // must REPLACE its old self, not sit beside it as a second case.
          // Titles carry the Azure id and are unique within a file.
          const key = `${here}::${spec.title}`;
          cases.set(key, { file: here, chain: nextChain, spec: { ...spec, _layer: layer } });
        }
        walk(s.suites, here, nextChain, false);
      }
    })(j.suites, '', [], true);
    fromLayer[layer] = (fromLayer[layer] || 0) + 1;
  }
  if (layerIndex === 0) console.log(`base layer ${layer}: ${cases.size} case(s)`);
}

// ONLY TESTS THAT STILL EXIST (2026-10-12). A case deleted from the code keeps
// its result in the older layers, and without this filter it lived on in the
// report - 14373's two rows for the removed Preferred Language / Contact
// Method fields were still reported FAIL from 4 Oct. CURRENT_TESTS names a
// `playwright test --list --reporter=json` listing; results whose file+title
// is not in it are dropped, and each one is printed.
if (process.env.CURRENT_TESTS) {
  const listing = JSON.parse(fs.readFileSync(process.env.CURRENT_TESTS, 'utf8'));
  const present = new Set();
  (function walk(suites, file, topLevel) {
    for (const s of suites || []) {
      const here = topLevel ? (s.file || s.title || file) : file;
      for (const spec of s.specs || []) present.add(`${here}::${spec.title}`);
      walk(s.suites, here, false);
    }
  })(listing.suites, '', true);
  const dropped = [...cases.keys()].filter((key) => !present.has(key));
  for (const key of dropped) {
    console.log(`  dropped (no longer in the code): ${key} [${cases.get(key).spec._layer}]`);
    cases.delete(key);
  }
  console.log(`current tests: ${present.size} listed; ${dropped.length} stale result(s) dropped`);
}

// Rebuild a Playwright-shaped tree: one suite per file, nested describes.
const files = new Map();
for (const { file, chain, spec } of cases.values()) {
  if (!files.has(file)) files.set(file, { title: file, file, specs: [], suites: [] });
  let node = files.get(file);
  for (const title of chain) {
    let child = node.suites.find((x) => x.title === title);
    if (!child) { child = { title, specs: [], suites: [] }; node.suites.push(child); }
    node = child;
  }
  node.specs.push(spec);
}

const stats = { expected: 0, unexpected: 0, flaky: 0, skipped: 0, startTime: null, duration: 0 };
for (const { spec } of cases.values()) {
  for (const t of spec.tests || []) {
    const st = t.status;
    if (st === 'expected') stats.expected += 1;
    else if (st === 'unexpected') stats.unexpected += 1;
    else if (st === 'flaky') stats.flaky += 1;
    else stats.skipped += 1;
  }
}
// Duration and start come from the BASE layer's partials - the report computes
// active time from partial directories separately; this is only a fallback.
for (const f of fs.readdirSync(dirs[0]).filter((x) => /^\d\d\.json$/.test(x))) {
  const s = JSON.parse(fs.readFileSync(path.join(dirs[0], f), 'utf8')).stats || {};
  stats.duration += s.duration || 0;
  if (s.startTime && (!stats.startTime || s.startTime < stats.startTime)) stats.startTime = s.startTime;
}

const byLayer = {};
for (const { spec } of cases.values()) byLayer[spec._layer] = (byLayer[spec._layer] || 0) + 1;
fs.writeFileSync(out, JSON.stringify({ config: null, suites: [...files.values()], errors: [], stats }, null, 2));
console.log(`merged ${cases.size} case(s) from ${dirs.length} layer(s) -> ${out}`);
console.log(`  results by layer: ${JSON.stringify(byLayer)}`);
