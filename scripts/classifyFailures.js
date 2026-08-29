#!/usr/bin/env node
/**
 * Run report: execution status per test case, plus attribution for failures.
 *
 * Two sections:
 *
 *   1. Execution status - PASS / FAIL / BLOCKED / SKIPPED for every case, with
 *      the reason for anything that is not a pass, and the step breakdown for
 *      anything that failed. See constants/TestStatus.ts for how each status is
 *      produced; BLOCKED and dependency-skips are carried as annotations because
 *      Playwright has no native status for them.
 *
 *   2. Failure attribution - for FAIL cases only, whether the fault lies with
 *      the environment, the test, or the application. With RETRIES=0 a run gives
 *      one verdict per test, so every failure has to be read; this groups them.
 *
 * Reads reports/results.json (the json reporter in playwright.config.ts). Run the
 * suite WITHOUT a --reporter flag on the CLI, or that file is never written.
 *
 * Usage:  npm run report:status
 */
const fs = require('fs');
const path = require('path');

const IN = process.argv[2] || path.join('reports', 'results.json');
const ANSI = /\x1b\[[0-9;]*m/g;
const clean = (t) => (t || '').replace(ANSI, '').trim();

/** Failure attribution. First match wins, so most specific evidence first. */
const RULES = [
  {
    kind: 'ENVIRONMENT',
    label: 'network dropped mid-run',
    re: /net::ERR_(NETWORK_CHANGED|INTERNET_DISCONNECTED|CONNECTION_[A-Z_]+|NAME_NOT_RESOLVED|EMPTY_RESPONSE)|ECONNREFUSED|ECONNRESET|socket hang up/,
    advice: 'Re-run. Nothing was learned about the app or the test.',
  },
  {
    kind: 'ENVIRONMENT',
    label: 'browser or page was lost',
    re: /Target (page|browser|context) (closed|crashed)|Browser has been closed|Execution context was destroyed/,
    advice: 'Re-run. Usually the machine under load, or a browser crash.',
  },
  {
    kind: 'ENVIRONMENT',
    label: 'sign-in never completed',
    re: /waitForURL[\s\S]*?(dashboard|Timeout)/,
    advice: 'Check the account exists and has a password. A case needing a '
      + 'non-admin or second-admin account should call steps.blocked() so it is '
      + 'reported BLOCKED rather than failed.',
  },
  {
    kind: 'ENVIRONMENT',
    label: 'the page never loaded',
    re: /page\.goto[\s\S]*?Timeout/,
    advice: 'The app was unreachable or too slow. Re-run before calling it a defect.',
  },
  {
    kind: 'TEST',
    label: 'locator matched more than one element',
    re: /strict mode violation/,
    advice: 'The selector is ambiguous. Narrow it to one id.',
  },
  {
    kind: 'TEST',
    label: 'a precondition the test needs was not met',
    re: /\[(PayerManagementPage|EntityWizardDialog|ConfirmDialog|ListPageBase|PayerDetailPage|ApprovalManagementPage)\]/,
    advice: 'A page object raised this deliberately; its message says what was '
      + 'missing. If the cause is external, use steps.blocked() instead.',
  },
  {
    kind: 'TEST',
    label: 'field has no id mapping',
    re: /No id mapping for/,
    advice: 'Add the field to constants/ElementIds.ts, verified against the live app.',
  },
  {
    kind: 'APPLICATION',
    label: 'the app produced a different value',
    re: /Expected:[\s\S]*?Received:|expect\([\s\S]*?\)\.(toBe|toEqual|toHaveText|toContainText|toHaveValue|toHaveCount|toMatch)/,
    advice: 'The test asked a fair question and got a different answer. The '
      + 'Expected/Received pair IS the actual result for a defect report.',
  },
  {
    kind: 'REVIEW',
    label: 'an element never appeared',
    re: /waiting for locator|toBeVisible|toBeHidden|toBeEnabled/,
    advice: 'Could be the app not rendering it, or the test looking in the wrong '
      + 'place. Open the trace to tell which.',
  },
  {
    kind: 'REVIEW',
    label: 'the test ran out of time',
    re: /Test timeout of \d+ms exceeded/,
    advice: 'Genuinely slow (environment) or stuck on something that never '
      + 'happens (test). The trace shows which step hung.',
  },
];

if (!fs.existsSync(IN)) {
  console.error(`No results file at ${IN}.`);
  console.error('Run the suite without a --reporter flag so the json reporter writes it.');
  process.exit(2);
}

// ---- collect every case ---------------------------------------------------
const cases = [];

(function walk(suites, hint = '') {
  for (const suite of suites || []) {
    const file = suite.file || hint;
    for (const spec of suite.specs || []) {
      for (const test of spec.tests || []) {
        const results = test.results || [];
        const last = results[results.length - 1] || {};
        const ann = {};
        for (const a of test.annotations || []) ann[a.type] = a.description || '';

        let steps = [];
        if (ann.steps) {
          try {
            steps = JSON.parse(ann.steps);
          } catch {
            steps = [];
          }
        }

        cases.push({
          file,
          story: (file || '').split(/[\\/]/).slice(-2, -1)[0] || '',
          title: spec.title,
          playwrightStatus: last.status || test.status || 'unknown',
          expectedStatus: test.expectedStatus,
          annotations: ann,
          steps,
          message: clean(
            results.flatMap((r) => (r.errors || []).map((e) => e.message)).join('\n'),
          ),
        });
      }
    }
    walk(suite.suites, file);
  }
})(JSON.parse(fs.readFileSync(IN, 'utf8')).suites);

/**
 * The four reported statuses, resolved from what Playwright recorded plus our
 * annotations. BLOCKED is checked first: a blocked case is skipped at the
 * Playwright level, so the annotation is the only thing that distinguishes it
 * from a deliberate skip.
 */
function statusOf(c) {
  if (c.annotations.blocked !== undefined) return 'BLOCKED';
  if (c.playwrightStatus === 'skipped') return 'SKIPPED';
  if (c.playwrightStatus === 'passed') return 'PASS';
  return 'FAIL';
}

/** Why a case is not a plain pass, in one line. */
function reasonOf(c, status) {
  if (status === 'BLOCKED') return c.annotations.blocked;
  if (status === 'SKIPPED') {
    if (c.annotations['dependency-skipped']) {
      return `dependency: ${c.annotations['dependency-skipped']}`;
    }
    // `skip` and `fixme` both carry the reason when the in-body form is used
    // (test.skip(cond, why) / test.fixme(cond, why)). The title-form of either
    // records the annotation with no description, hence the fallback.
    return c.annotations.skip || c.annotations.fixme || 'intentionally excluded';
  }
  if (status === 'FAIL') {
    const failed = c.steps.filter((s) => s.status === 'FAIL');
    if (failed.length) {
      return `step ${failed[0].index} "${failed[0].name}" failed: `
        + `${(failed[0].reason || '').split('\n')[0].slice(0, 120)}`;
    }
    const first = (c.message.split('\n').find((l) => l.trim()) || 'no detail captured').slice(
      0,
      150,
    );
    // No step recorded at all: the body never ran. Say so plainly - otherwise the
    // bare assertion text reads as a finding about the feature under test.
    return c.steps.length === 0
      ? `the test body never ran (no step was recorded); ${first}`
      : first;
  }
  return '';
}

for (const c of cases) {
  c.status = statusOf(c);
  c.reason = reasonOf(c, c.status);
}

// Ignore the auth setup project - it is infrastructure, not a test case.
const testCases = cases.filter((c) => !/setup/.test(c.file || ''));

// ---- section 1: execution status ------------------------------------------
const ORDER = ['PASS', 'FAIL', 'BLOCKED', 'SKIPPED'];
const counts = Object.fromEntries(ORDER.map((s) => [s, 0]));
for (const c of testCases) counts[c.status] += 1;

console.log(`\n${'='.repeat(78)}`);
console.log('EXECUTION STATUS');
console.log('='.repeat(78));
console.log(`  ${testCases.length} test case(s) in ${IN}\n`);
for (const s of ORDER) {
  const pct = testCases.length ? Math.round((counts[s] / testCases.length) * 100) : 0;
  console.log(`  ${s.padEnd(9)} ${String(counts[s]).padStart(4)}   ${pct}%`);
}

for (const status of ORDER) {
  const group = testCases.filter((c) => c.status === status);
  if (!group.length || status === 'PASS') continue;
  console.log(`\n  --- ${status} ---`);
  for (const c of group) {
    console.log(`\n  ${c.title}`);
    if (c.story) console.log(`    story  : ${c.story}`);
    console.log(`    reason : ${c.reason}`);
    if (c.expectedStatus === 'failed') {
      console.log('    note   : marked test.fail() - a known defect, so the run stays green');
    }
    if (c.steps.length) {
      console.log('    steps  :');
      for (const s of c.steps) {
        const mark = s.status === 'PASS' ? ' ' : '!';
        console.log(`      ${mark} Step ${s.index} -> ${s.status.padEnd(12)} ${s.name}`);
        if (s.reason) {
          console.log(`          Reason: ${s.reason.split('\n')[0].slice(0, 120)}`);
        }
      }
    }
  }
}

// ---- section 2: attribution for failures ---------------------------------
const failures = testCases.filter((c) => c.status === 'FAIL');

const FIXTURE_STACK = /[\\/]fixtures[\\/][\w.-]+\.ts:\d+/;

/**
 * Step names that only get the test to the place where the real work happens.
 * A failure here means the application never presented the screen under test, so
 * whatever the case was asking about was never asked.
 */
const NAVIGATION_STEP =
  /^(open|reopen|return to|reload|navigate|sign in|maker [ab] opens|admin [ab] (opens|signs)|.* opens the payer list)/i;

/** The first step that failed, or undefined if none did. */
function firstFailedStep(c) {
  return c.steps.find((st) => st.status === 'FAIL');
}

if (failures.length) {
  for (const f of failures) {
    // Checked before the message rules: a failure with NO recorded steps whose
    // stack points into a fixture never entered the test body, so nothing was
    // learned about the feature. Such a case belongs in BLOCKED - the fixture
    // should call blockedByPrecondition() - and until it does, saying so here
    // stops it being mis-read as an application defect.
    if (f.steps.length === 0 && FIXTURE_STACK.test(f.message)) {
      f.kind = 'REVIEW';
      f.label = 'the test never ran - a fixture failed to provision its precondition';
      f.advice = 'No step was recorded, so nothing was observed about the feature. '
        + 'Wrap the provisioning in blockedByPrecondition() (fixtures/testStatus.fixture.ts) '
        + 'so this reports BLOCKED instead of FAIL.';
      continue;
    }

    // Checked before the message rules for the same reason as the fixture case
    // above: if the step that failed was only getting the test to the screen,
    // the feature under test was never exercised, whatever the assertion text
    // looks like. Playwright's toBeVisible message carries an Expected/Received
    // pair, which would otherwise match the application-defect rule.
    const failedStep = firstFailedStep(f);
    if (failedStep && NAVIGATION_STEP.test(failedStep.name)) {
      f.kind = 'ENVIRONMENT';
      f.label = `the screen never loaded - failed at step ${failedStep.index}, "${failedStep.name}"`;
      f.advice = 'Nothing was learned about the feature. Re-run; if it reproduces with '
        + '--workers=1 it is worth investigating, otherwise it is load contention.';
      continue;
    }

    const rule = RULES.find((r) => r.re.test(f.message));
    f.kind = rule ? rule.kind : 'REVIEW';
    f.label = rule ? rule.label : 'unrecognised failure shape';
    f.advice = rule ? rule.advice : 'Read the message and the trace.';
  }

  const KINDS = ['ENVIRONMENT', 'TEST', 'APPLICATION', 'REVIEW'];
  const HEADLINE = {
    ENVIRONMENT: "the run's surroundings failed - re-run; nothing was learned",
    TEST: 'the test is at fault - fix the test',
    APPLICATION: 'the app behaved differently - candidate defect',
    REVIEW: 'cannot be attributed from the message alone',
  };

  console.log(`\n${'='.repeat(78)}`);
  console.log('FAILURE ATTRIBUTION');
  console.log('='.repeat(78));
  for (const kind of KINDS) {
    const n = failures.filter((f) => f.kind === kind).length;
    if (n) console.log(`  ${String(n).padStart(3)}  ${kind}`);
  }

  for (const kind of KINDS) {
    const group = failures.filter((f) => f.kind === kind);
    if (!group.length) continue;
    console.log(`\n  --- ${kind}: ${HEADLINE[kind]} ---`);
    for (const f of group) {
      console.log(`\n  ${f.title}`);
      console.log(`    why    : ${f.label}`);
      console.log(`    action : ${f.advice}`);
    }
  }

  console.log('\n  APPLICATION means the assertion was answered differently, not that the');
  console.log('  app is definitely wrong - confirm the expectation before filing.\n');
} else {
  console.log('\nNo failures in this run.\n');
}
