import { test as base, expect } from '@playwright/test';
import type { TestInfo } from '@playwright/test';
import { Logger } from '../utils/Logger';
import { ScreenshotUtils } from '../utils/ScreenshotUtils';
import {
  ANNOTATION,
  StepStatus,
  TestStatus,
  type StepRecord,
  type TestStatusName,
} from '../constants/TestStatus';

/**
 * Outcomes of test cases already finished in THIS worker, so a later case can
 * refuse to run when its prerequisite failed.
 *
 * Keyed by `<spec file>::<case id>` because case ids repeat across stories -
 * there is a TC-002 in the create story and another in the edit story, and they
 * are unrelated. Keying on the id alone would let one story's failure skip an
 * unrelated case in another.
 *
 * Worker-scoped by nature: Playwright gives each worker its own process. With
 * `fullyParallel: false` a spec FILE runs start-to-finish in one worker, so
 * dependencies inside a file are always seen. A dependency that crosses files
 * cannot be, and `dependsOn` says so rather than silently passing.
 */
const outcomes = new Map<string, TestStatusName>();

/**
 * Playwright colourises assertion messages. Those escape codes are invisible in
 * a terminal but land as literal noise in the JSON report and any document built
 * from it, so they are stripped where the reason is captured rather than at each
 * point of use.
 */
const ANSI = /\u001b\[[0-9;]*m/g;
const plain = (text: string) => text.replace(ANSI, '').trim();

/** `TC-014: should block...` -> `TC-014`. Falls back to the whole title. */
function caseIdOf(title: string): string {
  const match = title.match(/^\s*([A-Z]+-\d+)/);
  return match ? match[1] : title.trim();
}

const keyFor = (info: TestInfo, caseId: string) => `${info.file}::${caseId}`;

export interface TestSteps {
  /**
   * Runs one step. If it fails, the failure is recorded and execution
   * CONTINUES to the next step - the test case still ends as FAIL.
   *
   * Use for a step whose failure does not invalidate what follows.
   */
  step(name: string, body: () => Promise<void>): Promise<void>;

  /**
   * Runs one step whose success the following steps depend on. If it fails,
   * every remaining step is recorded as NOT EXECUTED with the reason, because
   * running them would produce a meaningless or unsafe result.
   */
  critical(name: string, body: () => Promise<void>): Promise<void>;

  /**
   * Declares the test BLOCKED and stops it: an external prerequisite is
   * missing - environment, service, account or seed data - so the behaviour
   * under test was never exercised. Reported as skipped + a `blocked`
   * annotation, never as a failure.
   */
  blocked(reason: string): never;

  /**
   * Declares a dependency on another test case in the SAME spec file. If that
   * case failed, this one is skipped with the prerequisite named as the reason.
   */
  dependsOn(caseId: string): void;

  /** The steps recorded so far. */
  records(): StepRecord[];
}

export interface TestStatusFixtures {
  steps: TestSteps;
}

export const test = base.extend<TestStatusFixtures>({
  steps: async ({ page }, use, testInfo) => {
    const records: StepRecord[] = [];
    let abortReason: string | null = null;

    const add = (
      name: string,
      status: StepRecord['status'],
      reason: string | undefined,
      durationMs: number,
      screenshot?: string,
    ) => {
      records.push({ index: records.length + 1, name, status, reason, durationMs, screenshot });
    };

    async function run(name: string, body: () => Promise<void>, isCritical: boolean) {
      if (abortReason) {
        add(name, StepStatus.NOT_EXECUTED, abortReason, 0);
        Logger.warn(`Step "${name}" NOT EXECUTED - ${abortReason}`);
        return;
      }

      const started = Date.now();
      try {
        // Wrapped in test.step so the HTML report and trace show the same
        // structure this recorder reports.
        await base.step(name, body);
        add(name, StepStatus.PASS, undefined, Date.now() - started);
      } catch (error) {
        const reason = plain(error instanceof Error ? error.message : String(error));

        // Taken HERE, before anything else runs, so the image shows the screen
        // that produced the failure rather than whatever teardown leaves behind.
        const shot = await ScreenshotUtils.captureStepFailure(
          page,
          testInfo,
          records.length + 1,
          name,
        );

        add(name, StepStatus.FAIL, reason, Date.now() - started, shot);
        Logger.error(`Step "${name}" FAILED`, reason);

        // A SOFT failure, so the test continues here but Playwright still ends
        // it as failed. This is what lets the remaining steps run while keeping
        // the overall verdict honest - no separate bookkeeping decides it.
        expect
          .soft(false, `Step ${records.length} "${name}" failed: ${reason.split('\n')[0]}`)
          .toBe(true);

        if (isCritical) {
          abortReason = `step ${records.length} "${name}" failed and later steps depend on it`;
        }
      }
    }

    const steps: TestSteps = {
      step: (name, body) => run(name, body, false),
      critical: (name, body) => run(name, body, true),

      blocked(reason) {
        testInfo.annotations.push({ type: ANNOTATION.blocked, description: reason });
        Logger.warn(`BLOCKED: ${reason}`);
        // Skipping, not failing: the behaviour under test was never observed.
        base.skip(true, `BLOCKED: ${reason}`);
        throw new Error('unreachable');
      },

      dependsOn(caseId) {
        const outcome = outcomes.get(keyFor(testInfo, caseId));

        if (outcome === undefined) {
          // Nothing to go on - the prerequisite has not run in this worker.
          // Stay silent rather than skip: a partial run (a `-g` filter, or the
          // file split across workers) must not fabricate a dependency failure.
          Logger.warn(
            `Dependency "${caseId}" has not run in this worker - continuing without it`,
          );
          return;
        }

        if (outcome === TestStatus.FAIL || outcome === TestStatus.BLOCKED) {
          const reason = `depends on ${caseId}, which ended as ${outcome}`;
          testInfo.annotations.push({
            type: ANNOTATION.dependencySkipped,
            description: reason,
          });
          Logger.warn(`SKIPPED: ${reason}`);
          base.skip(true, `SKIPPED: ${reason}`);
        }
      },

      records: () => [...records],
    };

    await use(steps);

    // ---- teardown: publish the step breakdown and remember the outcome -----

    if (records.length > 0) {
      const lines = records.map((r) => {
        const head = `Step ${r.index} -> ${r.status}  (${(r.durationMs / 1000).toFixed(1)}s)  ${r.name}`;
        const parts = [head];
        if (r.reason) parts.push(`    Reason: ${r.reason.split('\n')[0]}`);
        if (r.screenshot) parts.push(`    Screenshot: ${r.screenshot}`);
        return parts.join('\n');
      });

      testInfo.annotations.push({
        type: ANNOTATION.steps,
        description: JSON.stringify(records),
      });

      // A readable copy for whoever opens the HTML report.
      await testInfo
        .attach('steps.txt', {
          body: lines.join('\n'),
          contentType: 'text/plain',
        })
        .catch(() => undefined);
    }

    outcomes.set(keyFor(testInfo, caseIdOf(testInfo.title)), resolveStatus(testInfo));
  },
});

/**
 * The test case's status, from what Playwright recorded plus our annotations.
 *
 * Read in teardown, where `testInfo.status` is already settled.
 */
function resolveStatus(info: TestInfo): TestStatusName {
  const blocked = info.annotations.some((a) => a.type === ANNOTATION.blocked);
  if (blocked) return TestStatus.BLOCKED;
  if (info.status === 'skipped') return TestStatus.SKIPPED;
  if (info.status === 'passed') return TestStatus.PASS;
  // failed or timedOut. An EXPECTED failure (test.fail) still counts as FAIL for
  // dependency purposes: the case did not achieve its expected result, so a case
  // depending on it must not run.
  return TestStatus.FAIL;
}

/**
 * Declares the test BLOCKED because a PRECONDITION could not be provisioned,
 * and stops it. Never returns.
 *
 * A data fixture that cannot build the state a test starts from leaves nothing
 * to observe: the test body never runs, so no step is ever recorded and the
 * report has no reason to show. Playwright marks such a test failed, which
 * asserts something about the feature under test that was never exercised -
 * exactly what BLOCKED exists to avoid.
 *
 * Called from a fixture, where `testInfo` is the third argument. The underlying
 * error is kept in the reason so the provisioning failure is still triageable;
 * it is not swallowed. If the application itself is broken, every test sharing
 * the fixture turns BLOCKED at once, which is loud rather than quiet.
 */
export function blockedByPrecondition(
  testInfo: TestInfo,
  precondition: string,
  cause: unknown,
): never {
  const detail = plain(cause instanceof Error ? cause.message : String(cause)).split('\n')[0];
  const reason = `${precondition} could not be provisioned, so the behaviour under test was `
    + `never exercised. Underlying failure: ${detail}`;

  testInfo.annotations.push({ type: ANNOTATION.blocked, description: reason });
  Logger.warn(`BLOCKED: ${reason}`);

  // Skip rather than fail: nothing was learned about the feature under test.
  testInfo.skip(true, `BLOCKED: ${reason}`);
  throw cause; // unreachable - testInfo.skip throws
}
