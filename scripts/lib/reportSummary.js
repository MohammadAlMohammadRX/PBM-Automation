/**
 * Shared reader for the Playwright JSON report (test-results/results.json).
 * Used by both scripts/generateReport.js and scripts/emailReport.js so the
 * summary logic lives in one place.
 */
const fs = require('fs');

const STATUS_LABEL = {
  expected: 'PASSED',
  unexpected: 'FAILED',
  flaky: 'FLAKY',
  skipped: 'SKIPPED',
};

/** Flattens nested suites into a flat list of { title, status, file }. */
function collectSpecs(suites, file, out) {
  for (const suite of suites || []) {
    const currentFile = suite.file || file || '';
    for (const spec of suite.specs || []) {
      const test = (spec.tests && spec.tests[0]) || {};
      const status = test.status || (spec.ok ? 'expected' : 'unexpected');
      out.push({ title: spec.title, status, file: currentFile });
    }
    collectSpecs(suite.suites, currentFile, out);
  }
  return out;
}

/** Returns a structured summary, or null if the results file is missing. */
function readSummary(resultsPath) {
  if (!fs.existsSync(resultsPath)) return null;
  const report = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));
  const stats = report.stats || {};
  const specs = collectSpecs(report.suites, '', []);

  const counts = {
    passed: stats.expected || 0,
    failed: stats.unexpected || 0,
    flaky: stats.flaky || 0,
    skipped: stats.skipped || 0,
  };
  counts.total = counts.passed + counts.failed + counts.flaky + counts.skipped;

  const durationSec = Math.round((stats.duration || 0) / 1000);
  const runAt = stats.startTime
    ? new Date(stats.startTime).toLocaleString()
    : new Date().toLocaleString();

  return { counts, specs, durationSec, runAt };
}

module.exports = { readSummary, STATUS_LABEL };
