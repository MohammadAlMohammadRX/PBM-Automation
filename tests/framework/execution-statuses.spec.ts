import { test as base } from '@playwright/test';
import { blockedByPrecondition } from '../../fixtures/testStatus.fixture';
import { test, expect } from '../../fixtures';
import { env } from '../../constants/EnvironmentConfig';

/**
 * Verification of the four execution statuses and the step recorder.
 *
 * These are framework tests, not application tests: they prove that PASS, FAIL,
 * BLOCKED and SKIPPED are produced and reported correctly, and that a failed
 * step does not abandon the steps after it. They are cheap - only ST-001 and
 * ST-002 touch the application at all.
 *
 * ST-002 and ST-003 are EXPECTED to fail: each contains a deliberately failing
 * step, and the point is that the case ends as FAIL. `test.fail()` inverts the
 * expectation, so the run stays green while they behave as designed - and turns
 * red if the recorder ever stops reporting a failed step as a failure.
 */
test.describe('Framework - execution statuses', () => {
  test('ST-001: PASS - every step succeeds', async ({ steps, payerManagementPage }) => {
    await steps.critical('Open the payer list', async () => {
      await payerManagementPage.open();
    });

    await steps.step('Read the Total Payers KPI', async () => {
      const total = await payerManagementPage.getPageCount();
      expect(total).toBeGreaterThan(0);
    });

    await steps.step('Search for a known payer', async () => {
      await payerManagementPage.search('Al');
    });

    const recorded = steps.records();
    expect(recorded).toHaveLength(3);
    expect(recorded.every((r) => r.status === 'PASS')).toBe(true);
  });

  test('ST-002: FAIL - one step fails, the remaining steps still run', async ({
    steps,
    payerManagementPage,
  }) => {
    // Inside the body, so it marks THIS test only. At describe scope it would
    // apply to every test in the group.
    test.fail(true, 'Expected to fail: a failed step must still end the case as FAIL.');

    await steps.critical('Open the payer list', async () => {
      await payerManagementPage.open();
    });

    // Fails deliberately. Non-critical, so steps 3 and 4 must still execute.
    await steps.step('Assert an impossible page count', async () => {
      expect(await payerManagementPage.getPageCount()).toBe(-1);
    });

    await steps.step('Search still works after the failed step', async () => {
      await payerManagementPage.search('Al');
    });

    await steps.step('And the list is still readable', async () => {
      expect(await payerManagementPage.getVisiblePayerNames()).not.toBeUndefined();
    });

    // The proof: step 2 failed, yet steps 3 and 4 ran and passed.
    const recorded = steps.records();
    expect(recorded).toHaveLength(4);
    expect(recorded[1].status).toBe('FAIL');
    expect(recorded[1].reason).toBeTruthy();
    expect(recorded[2].status).toBe('PASS');
    expect(recorded[3].status).toBe('PASS');
  });

  test('ST-003: FAIL - a critical step failing leaves the rest NOT EXECUTED', async ({
    steps,
  }) => {
    test.fail(true, 'Expected to fail: a failed critical step must end the case as FAIL.');

    // No application calls: this checks the recorder's own control flow.
    await steps.step('A step that passes', async () => {
      expect(1).toBe(1);
    });

    await steps.critical('A critical step that fails', async () => {
      throw new Error('simulated critical failure');
    });

    await steps.step('Depends on the critical step', async () => {
      throw new Error('this body must never run');
    });

    const recorded = steps.records();
    expect(recorded.map((r) => r.status)).toEqual(['PASS', 'FAIL', 'NOT EXECUTED']);
    expect(recorded[2].reason).toContain('depend');
  });

  test('ST-004: BLOCKED - an external prerequisite is missing', async ({ steps }) => {
    // A real blocker in this environment: the non-admin account does not exist,
    // so any test needing it cannot evaluate the behaviour it exists to check.
    if (!env.nonAdminUsername) {
      steps.blocked('NON_ADMIN_USERNAME is not configured in .env, so a non-admin session cannot be established.');
    }

    await steps.step('Would exercise non-admin permissions', async () => {
      throw new Error('unreachable while the account is missing');
    });
  });

  test('ST-005: SKIPPED - intentionally excluded from this execution', async ({ steps }) => {
    // Deliberate exclusion: applicable only to production, and this is not it.
    test.skip(
      !env.baseUrl.includes('prod'),
      'Applies to the production environment only; this run targets a non-production host.',
    );

    await steps.step('Production-only assertion', async () => {
      throw new Error('unreachable outside production');
    });
  });

  test('ST-006: SKIPPED - prerequisite test case failed', async ({ steps }) => {
    // ST-002 is designed to fail, so this case must not execute. The reason is
    // recorded as a `dependency-skipped` annotation naming the prerequisite.
    steps.dependsOn('ST-002');

    await steps.step('Would build on ST-002 result', async () => {
      throw new Error('unreachable while ST-002 is failing');
    });
  });
});

/**
 * ST-007 proves the OTHER route to BLOCKED: a data fixture that cannot build the
 * state the test starts from.
 *
 * This is not a hypothetical. Two TC-008 edit cases were reported FAILED with no
 * steps and no reason because `publishedPayer` timed out waiting for the approval
 * queue - the test body never ran, so the failure asserted something about payer
 * editing that was never observed. `blockedByPrecondition` is what those fixtures
 * now call, and this case is what keeps it working.
 *
 * The fixture below fails on purpose, so ST-007 must be reported BLOCKED - never
 * FAILED, and never a silent pass.
 */
const blockedFixtureTest = base.extend<{ unprovisionable: string }>({
  unprovisionable: async ({}, use, testInfo) => {
    try {
      throw new Error('simulated provisioning failure: the approval queue never listed the record');
    } catch (error) {
      blockedByPrecondition(testInfo, 'a published payer ("ST-007 subject")', error);
    }

    await use('unreachable');
  },
});

blockedFixtureTest.describe('Execution statuses - fixture preconditions', () => {
  blockedFixtureTest(
    'ST-007: BLOCKED - a data fixture could not provision the test precondition',
    async ({ unprovisionable }) => {
      throw new Error(`unreachable - the fixture blocks first (${unprovisionable})`);
    },
  );
});
