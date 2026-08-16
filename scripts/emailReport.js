/* eslint-disable no-console */
/**
 * Emails the latest Playwright run report.
 *
 *   npm test                 # produces test-results/results.json + playwright-report/
 *   npm run report:email     # sends the summary + zipped HTML report
 *
 * All mail settings come from .env (never committed). This script reads
 * process.env directly because it is a standalone build tool, not part of the
 * test runtime. It NEVER contains credentials itself.
 *
 * Required .env keys: SMTP_HOST, SMTP_USER, SMTP_PASS, EMAIL_TO
 * Optional:           SMTP_PORT (587), SMTP_SECURE (false), EMAIL_FROM (=SMTP_USER),
 *                     EMAIL_SUBJECT_PREFIX ("PBM Automation")
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const nodemailer = require('nodemailer');
const AdmZip = require('adm-zip');
const { readSummary, STATUS_LABEL } = require('./lib/reportSummary');

const RESULTS_JSON = path.resolve(__dirname, '..', 'reports', 'results.json');
const REPORT_DIR = path.resolve(__dirname, '..', 'playwright-report');

function fail(message) {
  console.error(`\n[report:email] ${message}\n`);
  process.exit(1);
}

function requireEnv() {
  const missing = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'EMAIL_TO'].filter((k) => !process.env[k]);
  if (missing.length) {
    fail(
      `Missing required mail settings in .env: ${missing.join(', ')}.\n` +
        `See .env.example for the SMTP_* / EMAIL_* block.`,
    );
  }
}

function buildReport() {
  const summary = readSummary(RESULTS_JSON);
  if (!summary) {
    fail(`No results found at ${RESULTS_JSON}. Run the tests first (e.g. "npm test").`);
  }
  const { counts, specs, durationSec, runAt } = summary;

  const failedList = specs.filter((s) => s.status === 'unexpected');
  const flakyList = specs.filter((s) => s.status === 'flaky');

  const text = [
    `PBM Automation - Test Run Report`,
    `Run at: ${runAt}    Duration: ${durationSec}s`,
    ``,
    `Total: ${counts.total} | Passed: ${counts.passed} | Failed: ${counts.failed} | Flaky: ${counts.flaky} | Skipped: ${counts.skipped}`,
    ``,
    failedList.length ? `FAILED:` : `No failures.`,
    ...failedList.map((s) => `  - ${s.title}`),
    ...(flakyList.length ? [``, `FLAKY (passed on retry):`, ...flakyList.map((s) => `  - ${s.title}`)] : []),
  ].join('\n');

  const rows = specs
    .map(
      (s) =>
        `<tr><td style="padding:4px 10px;border-bottom:1px solid #eee">${STATUS_LABEL[s.status] || s.status}</td>` +
        `<td style="padding:4px 10px;border-bottom:1px solid #eee">${s.title}</td></tr>`,
    )
    .join('');
  const color = counts.failed > 0 ? '#c0392b' : '#27ae60';
  const html =
    `<h2 style="font-family:Arial">PBM Automation - Test Run Report</h2>` +
    `<p style="font-family:Arial;color:#555">Run at: ${runAt} &nbsp;&middot;&nbsp; Duration: ${durationSec}s</p>` +
    `<p style="font-family:Arial;font-size:16px"><b style="color:${color}">` +
    `Passed ${counts.passed} / ${counts.total}</b> &nbsp; Failed ${counts.failed} &nbsp; Flaky ${counts.flaky} &nbsp; Skipped ${counts.skipped}</p>` +
    `<table style="font-family:Arial;font-size:13px;border-collapse:collapse">${rows}</table>` +
    `<p style="font-family:Arial;color:#888;font-size:12px">Full HTML report attached (playwright-report.zip).</p>`;

  return { counts, durationSec, text, html };
}

function zipReport() {
  if (!fs.existsSync(REPORT_DIR)) {
    console.warn('[report:email] playwright-report/ not found - sending summary without attachment.');
    return null;
  }
  const zip = new AdmZip();
  zip.addLocalFolder(REPORT_DIR);
  const zipPath = path.resolve(__dirname, '..', 'test-results', 'playwright-report.zip');
  zip.writeZip(zipPath);
  const sizeMb = (fs.statSync(zipPath).size / (1024 * 1024)).toFixed(1);
  console.log(`[report:email] Zipped HTML report (${sizeMb} MB).`);
  return zipPath;
}

async function main() {
  requireEnv();
  const { counts, text, html } = buildReport();
  const zipPath = zipReport();

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  const prefix = process.env.EMAIL_SUBJECT_PREFIX || 'PBM Automation';
  const subject = `${prefix} - ${counts.failed ? `${counts.failed} FAILED` : 'All passed'} (${counts.passed}/${counts.total})`;

  const info = await transporter.sendMail({
    from: process.env.EMAIL_FROM || process.env.SMTP_USER,
    to: process.env.EMAIL_TO,
    subject,
    text,
    html,
    attachments: zipPath ? [{ filename: 'playwright-report.zip', path: zipPath }] : [],
  });

  console.log(`[report:email] Sent to ${process.env.EMAIL_TO} (messageId: ${info.messageId})`);
}

main().catch((err) => fail(`Failed to send report: ${err.message}`));
