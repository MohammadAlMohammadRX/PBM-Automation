/**
 * Measures how long each folder ACTUALLY executed, excluding the time the
 * machine was asleep or frozen.
 *
 * WHY. Playwright's own duration is wall clock: a laptop that sleeps for three
 * hours in the middle of a folder adds three hours to it. The 4-5 October full
 * run reported 35.65 h, of which 9.58 h was the machine asleep (folders 31, 45,
 * 52, 71 and 77) - so the reported running time overstated the real execution
 * by more than a third.
 *
 * HOW. Every framework log line carries an ISO timestamp, and a test that is
 * running logs every few seconds. A silence longer than THRESHOLD_SEC between
 * two consecutive lines is therefore time nothing was executing, and is taken
 * out. 300 s is well above the longest legitimate silence (a single wait in the
 * suite tops out at 180 s), and the totals barely move between a 120 s and a
 * 600 s threshold, so the cut-off is not doing the deciding.
 *
 *   node scripts/executionTiming.js <partialsDir> [out.json] [thresholdSec]
 *
 * Also required by buildReport.js, which uses it for the report's running time.
 */
const fs = require('fs');
const path = require('path');

const DEFAULT_THRESHOLD_SEC = 300;
const STAMP = /\[(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d+Z)\]/g;

function measureFolder(dir, folder, thresholdSec) {
  const jsonPath = path.join(dir, `${folder}.json`);
  const logPath = path.join(dir, `run-${folder}.log`);
  const stats = fs.existsSync(jsonPath) ? JSON.parse(fs.readFileSync(jsonPath, 'utf8')).stats || {} : {};
  const wallMs = stats.duration || 0;
  const start = stats.startTime ? new Date(stats.startTime) : null;

  const stamps = fs.existsSync(logPath)
    ? (fs.readFileSync(logPath, 'utf8').match(STAMP) || []).map((s) => Date.parse(s.slice(1, -1))).sort((a, b) => a - b)
    : [];

  let frozenMs = 0;
  const gaps = [];
  for (let i = 1; i < stamps.length; i += 1) {
    const gap = stamps[i] - stamps[i - 1];
    if (gap > thresholdSec * 1000) {
      frozenMs += gap;
      gaps.push({ from: new Date(stamps[i - 1]).toISOString(), to: new Date(stamps[i]).toISOString(), minutes: Math.round(gap / 60000) });
    }
  }
  // A freeze cannot exceed the folder's own wall clock; clamp against log noise.
  frozenMs = Math.min(frozenMs, wallMs);

  return {
    folder,
    start: start ? start.toISOString() : null,
    end: start ? new Date(start.getTime() + wallMs).toISOString() : null,
    wallMs,
    frozenMs,
    activeMs: wallMs - frozenMs,
    gaps,
  };
}

function measureTiming(dir, thresholdSec = DEFAULT_THRESHOLD_SEC) {
  const folders = fs.readdirSync(dir)
    .filter((f) => /^\d\d\.json$/.test(f))
    .map((f) => f.slice(0, 2))
    .sort()
    .map((n) => measureFolder(dir, n, thresholdSec));
  const sum = (k) => folders.reduce((n, f) => n + f[k], 0);
  return {
    thresholdSec,
    folders,
    totals: { wallMs: sum('wallMs'), frozenMs: sum('frozenMs'), activeMs: sum('activeMs') },
  };
}

module.exports = { measureTiming, DEFAULT_THRESHOLD_SEC };

if (require.main === module) {
  const [dir = 'reports/partials', out, th] = process.argv.slice(2);
  const t = measureTiming(dir, th ? Number(th) : DEFAULT_THRESHOLD_SEC);
  const h = (ms) => `${(ms / 3600000).toFixed(2)} h`;
  console.log(`threshold ${t.thresholdSec}s | wall ${h(t.totals.wallMs)} | frozen ${h(t.totals.frozenMs)} | active ${h(t.totals.activeMs)}`);
  for (const f of t.folders.filter((x) => x.gaps.length)) {
    console.log(`  ${f.folder}: frozen ${Math.round(f.frozenMs / 60000)} min - ${f.gaps.map((g) => `${g.from.slice(5, 16)}Z +${g.minutes}m`).join(', ')}`);
  }
  if (out) {
    fs.writeFileSync(out, JSON.stringify(t, null, 2));
    console.log(`written: ${out}`);
  }
}
