import { test, expect } from '../../../fixtures';
import {
  BLOCKED_CASES,
  CASES,
  EXPIRED_ENTRY,
  SEED_PAYER,
  SNAPSHOT,
  STATUS,
  STATUS_FIELD,
  SYSTEM_ACTOR,
} from '../../../data/plans/expireInactivePlan.data';
import { dayNumber, todayNumber } from '../../../data/plans/activationEligibility.data';
import {
  claimPlanSeed,
  describeEntry,
  expiryOf,
  expiryRunObservedAt,
  isStatusChange,
  isSystemActor,
  planAuditBetween,
  planAuditSince,
  requireReprocessedPlanSeed,
  stateBeforeExpiryRun,
  utcDay,
  utcMs,
} from '../../../utils/jobDriven/writerPHelpers';

/**
 * User story 14330: Automatically expire an inactive plan once its expiry date
 * passes.
 *
 * SEED-THEN-CHECK: every case claims a suite plan built and processed by
 * `npm run seed:plan-jobs` TODAY - Active at F1, inactivated by the
 * administrator, then the plan job's F2 run after its expiry - and asserts what
 * the job did. No case moves the job; no seed today -> BLOCKED naming the seed
 * command. Read with data/plans/expireInactivePlan.data.ts.
 */
test.describe('US 14330 - Automatically expire an inactive plan once its expiry date passes', () => {
  test.describe.configure({ timeout: 6 * 60_000 });

  test(`TC-${CASES.inactiveExpires.azureId}: should transition an Inactive plan to Expired when its expiry date has passed and the daily process runs`, async ({
    page,
    planManagementPage,
    planDetailPage,
    steps,
  }, testInfo) => {
    const seed = await claimPlanSeed(page, testInfo, 'InactivePlanExpire');

    await steps.critical('Navigate to the Plans Management module - the plan list shows the plan, Inactive before the run', async () => {
      await planManagementPage.openListFor(SEED_PAYER);
      expect(await planManagementPage.isListed(seed.name)).toBe(true);
      expect(stateBeforeExpiryRun(seed)?.status, 'before the run').toBe(SNAPSHOT.inactive);
    });

    await steps.critical('Confirm the plan\'s expiry date is in the past - the detail shows an expiry date earlier than now', async () => {
      await planDetailPage.open(seed.id);
      expect(dayNumber((await planDetailPage.readOverview()).expiryDate), 'the detail\'s expiry date').toBeLessThanOrEqual(todayNumber());
      expect(expiryOf(seed), 'the expiry had passed at the run').toBeLessThan(expiryRunObservedAt(seed));
    });

    await steps.critical('Trigger the daily lifecycle process - it scanned the plans against their expiry dates', async () => {
      expect(seed.after, 'the state after the run').not.toBeNull();
    });

    await steps.step('Refresh the plan list after the process - the plan\'s status now shows Expired', async () => {
      await planManagementPage.openListFor(SEED_PAYER);
      expect(await planManagementPage.readStatus(seed.name)).toBe(STATUS.expired);
    });

    await steps.step('Open the plan\'s audit history - an entry records the transition to Expired', async () => {
      await planDetailPage.open(seed.id);
      await planDetailPage.audit().open();
      expect((await planDetailPage.audit().readAllEntries()).length).toBeGreaterThan(0);
      const since = await planAuditSince(page, seed.id, expiryOf(seed));
      expect(since.length, 'an entry recorded by the expiry run').toBeGreaterThan(0);
    });
  });

  test(`TC-${CASES.notOnExpiryDay.azureId}: should keep an Inactive plan Inactive on its expiry day and expire it once the date has passed`, async ({
    page,
    planManagementPage,
    steps,
  }, testInfo) => {
    const dayOne = await claimPlanSeed(page, testInfo, 'InactivePlanFutureExpiry');
    const dayTwo = await claimPlanSeed(page, testInfo, 'InactivePlanExpire');

    await steps.critical('Navigate to the Plans Management module - the plan list shows the plan with status Inactive', async () => {
      await planManagementPage.openListFor(SEED_PAYER);
      expect(await planManagementPage.isListed(dayOne.name)).toBe(true);
      expect(stateBeforeExpiryRun(dayOne)?.status, 'before the run').toBe(SNAPSHOT.inactive);
    });

    await steps.critical('Confirm the expiry date had been reached but not passed when the process ran', async () => {
      expect(expiryOf(dayOne), 'the expiry was still ahead at the run').toBeGreaterThan(expiryRunObservedAt(dayOne));
    });

    await steps.critical('Trigger the daily lifecycle process - it evaluated the plan', async () => {
      expect(dayOne.after, 'the state after the run').not.toBeNull();
    });

    await steps.step('Refresh the plan list - the plan status remains Inactive', async () => {
      await planManagementPage.openListFor(SEED_PAYER);
      expect(await planManagementPage.readStatus(dayOne.name)).toBe(STATUS.inactive);
    });

    await steps.step('Re-run the process once the expiry is in the past - the plan transitions to Expired', async () => {
      expect(stateBeforeExpiryRun(dayTwo)?.status, 'the same recipe, Inactive before its run').toBe(SNAPSHOT.inactive);
      expect(expiryOf(dayTwo), 'its expiry had passed at the run').toBeLessThan(expiryRunObservedAt(dayTwo));
      expect(await planManagementPage.readStatus(dayTwo.name)).toBe(STATUS.expired);
    });
  });

  test(`TC-${CASES.sameRuleAsActive.azureId}: should expire Active and Inactive plans alike when both expiry dates have passed and the process runs`, async ({
    page,
    planManagementPage,
    steps,
  }, testInfo) => {
    const planA = await claimPlanSeed(page, testInfo, 'PlanVersionExpire');
    const planB = await claimPlanSeed(page, testInfo, 'InactivePlanExpire');

    await steps.critical('Navigate to the Plans Management module - the plan list shows both plans with expired dates', async () => {
      await planManagementPage.openListFor(SEED_PAYER);
      expect(await planManagementPage.isListed(planA.name)).toBe(true);
      expect(await planManagementPage.isListed(planB.name)).toBe(true);
    });

    await steps.critical('Note the statuses before the run: Plan A Active, Plan B Inactive, both expiry dates in the past', async () => {
      expect(stateBeforeExpiryRun(planA)?.status, 'Plan A').toBe(SNAPSHOT.active);
      expect(stateBeforeExpiryRun(planB)?.status, 'Plan B').toBe(SNAPSHOT.inactive);
      expect(expiryOf(planA)).toBeLessThan(expiryRunObservedAt(planA));
      expect(expiryOf(planB)).toBeLessThan(expiryRunObservedAt(planB));
    });

    await steps.critical('Trigger the daily lifecycle process - it ran against all plans regardless of status', async () => {
      expect(planA.after, 'Plan A after the run').not.toBeNull();
      expect(planB.after, 'Plan B after the run').not.toBeNull();
    });

    await steps.step('Refresh the plan list - both Plan A and Plan B show Expired', async () => {
      await planManagementPage.openListFor(SEED_PAYER);
      expect(await planManagementPage.readStatus(planA.name), 'Plan A').toBe(STATUS.expired);
      expect(await planManagementPage.readStatus(planB.name), 'Plan B').toBe(STATUS.expired);
    });

    await steps.step('Compare their audit entries - the same transition rule, both by System', async () => {
      const a = (await planAuditSince(page, planA.id, expiryOf(planA))).filter(isStatusChange);
      const b = (await planAuditSince(page, planB.id, expiryOf(planB))).filter(isStatusChange);
      expect(a.length, 'Plan A has an expiry entry').toBeGreaterThan(0);
      expect(b.length, 'Plan B has an expiry entry').toBeGreaterThan(0);
      expect(String(b[b.length - 1]?.actionType), `${describeEntry(a[a.length - 1] ?? {})} vs ${describeEntry(b[b.length - 1] ?? {})}`)
        .toBe(String(a[a.length - 1]?.actionType));
      expect(isSystemActor(a[a.length - 1]?.actorLabel), describeEntry(a[a.length - 1] ?? {})).toBe(true);
      expect(isSystemActor(b[b.length - 1]?.actorLabel), describeEntry(b[b.length - 1] ?? {})).toBe(true);
    });
  });

  test(`TC-${CASES.systemActor.azureId}: should record System, the run date and Inactive to Expired when the process expires an Inactive plan`, async ({
    page,
    planManagementPage,
    planDetailPage,
    steps,
  }, testInfo) => {
    const seed = await claimPlanSeed(page, testInfo, 'InactivePlanExpire');

    await steps.critical('Navigate to the Plans Management module - the plan list shows the plan, Inactive before the run', async () => {
      await planManagementPage.openListFor(SEED_PAYER);
      expect(await planManagementPage.isListed(seed.name)).toBe(true);
      expect(stateBeforeExpiryRun(seed)?.status, 'before the run').toBe(SNAPSHOT.inactive);
    });

    await steps.critical('Trigger the daily lifecycle process - it evaluated and transitioned the plan', async () => {
      expect(seed.after?.status, 'right after the run').toBe(SNAPSHOT.expired);
    });

    await steps.step('Refresh the plan list - the plan status shows Expired', async () => {
      await planManagementPage.openListFor(SEED_PAYER);
      expect(await planManagementPage.readStatus(seed.name)).toBe(STATUS.expired);
    });

    await steps.critical('Open the plan\'s audit history tab - an entry is listed for the status change', async () => {
      await planDetailPage.open(seed.id);
      await planDetailPage.audit().open();
      expect((await planDetailPage.audit().readAllEntries()).length).toBeGreaterThan(0);
    });

    await steps.step('Checklist: the actor is System, the date is the run date, the status went Inactive -> Expired', async () => {
      const entry = await planDetailPage.audit().openEntry(0);
      expect(entry.meta, 'the actor').toContain(SYSTEM_ACTOR);
      const since = (await planAuditSince(page, seed.id, expiryOf(seed))).filter(isStatusChange);
      expect(utcDay(since[since.length - 1]?.occurredAtUtc), 'the entry\'s date').toBe(utcDay(seed.after?.readAt));
      const status = entry.changes.find((c) => STATUS_FIELD.test(c.field));
      expect(status, `a status change in ${JSON.stringify(entry.changes)}`).toBeDefined();
      expect(status?.before, 'previous status').toBe(STATUS.inactive);
      expect(status?.after, 'new status').toMatch(EXPIRED_ENTRY);
    });
  });

  test(`TC-${CASES.idempotentRerun.azureId}: should keep the plan Expired without a duplicate expiry entry when the process runs again`, async ({
    page,
    planManagementPage,
    planDetailPage,
    steps,
  }, testInfo) => {
    const { seed, rerunAt } = await requireReprocessedPlanSeed(page, testInfo, 'InactivePlanExpire');
    let expiryEntries = 0;

    await steps.critical('Navigate to the Plans Management module - the plan list shows the plan with status Expired', async () => {
      await planManagementPage.openListFor(SEED_PAYER);
      expect(await planManagementPage.readStatus(seed.name)).toBe(STATUS.expired);
    });

    await steps.critical('Open the plan\'s audit history - exactly one expiry transition entry was recorded by the first run', async () => {
      await planDetailPage.open(seed.id);
      await planDetailPage.audit().open();
      const first = (await planAuditBetween(page, seed.id, expiryOf(seed), expiryRunObservedAt(seed) + 3 * 60_000)).filter(isStatusChange);
      expiryEntries = first.length;
      expect(expiryEntries, first.map(describeEntry).join('; ')).toBe(1);
    });

    await steps.critical('Trigger the daily lifecycle process again on the same plans - it ran a second time', async () => {
      expect(rerunAt.getTime(), `a later run at ${rerunAt.toISOString()}`).toBeGreaterThan(expiryRunObservedAt(seed));
    });

    await steps.step('Refresh the plan list - the plan remains Expired with no error', async () => {
      await planManagementPage.openListFor(SEED_PAYER);
      expect(await planManagementPage.readStatus(seed.name)).toBe(STATUS.expired);
    });

    await steps.step('Re-check the audit history - no duplicate expiry entry was added', async () => {
      const all = (await planAuditSince(page, seed.id, expiryOf(seed))).filter(isStatusChange);
      expect(all.map(describeEntry), 'status transitions since the expiry instant').toHaveLength(expiryEntries);
    });
  });

  test(`TC-${CASES.fullLifecycle.azureId}: should show Active, Inactive by the administrator, then Expired by System when an inactivated plan's expiry passes`, async ({
    page,
    planManagementPage,
    planDetailPage,
    steps,
  }, testInfo) => {
    const seed = await claimPlanSeed(page, testInfo, 'InactivePlanExpire');

    await steps.critical('Navigate to the Plans Management module - the plan list showed the plan Active', async () => {
      await planManagementPage.openListFor(SEED_PAYER);
      expect(await planManagementPage.isListed(seed.name)).toBe(true);
      expect(seed.afterF1?.status, 'after it went live').toBe(SNAPSHOT.active);
    });

    await steps.critical('Deactivate the plan with a valid reason and approve it - the plan transitioned to Inactive', async () => {
      expect(seed.afterInactivation?.status, 'after the approved deactivation').toBe(SNAPSHOT.inactive);
    });

    await steps.critical('Allow time to pass until the expiry date - it is in the past while the plan stayed Inactive', async () => {
      expect(expiryOf(seed), 'the expiry had passed at the run').toBeLessThan(expiryRunObservedAt(seed));
      expect(utcMs(seed.afterInactivation?.readAt), 'inactivated before the expiry').toBeLessThan(expiryOf(seed));
    });

    await steps.critical('Trigger the daily lifecycle process - it evaluated the Inactive plan', async () => {
      expect(seed.after, 'the state after the run').not.toBeNull();
    });

    await steps.step('Refresh the list and open the audit history - Expired, Active -> Inactive by the administrator -> Expired by System', async () => {
      await planManagementPage.openListFor(SEED_PAYER);
      expect(await planManagementPage.readStatus(seed.name)).toBe(STATUS.expired);
      await planDetailPage.open(seed.id);
      await planDetailPage.audit().open();
      const inactivation = await planAuditBetween(page, seed.id, utcMs(seed.afterF1?.readAt), utcMs(seed.afterInactivation?.readAt));
      expect(inactivation.filter((e) => !isSystemActor(e.actorLabel)).map(describeEntry), 'the deactivation recorded by the administrator')
        .not.toEqual([]);
      expect(inactivation.filter((e) => isStatusChange(e) && isSystemActor(e.actorLabel)).map(describeEntry), 'the Active -> Inactive transition attributed to System')
        .toEqual([]);
      const expiry = (await planAuditSince(page, seed.id, expiryOf(seed))).filter(isStatusChange);
      expect(expiry.length, 'the expiry is recorded').toBeGreaterThan(0);
      expect(expiry.filter((e) => !isSystemActor(e.actorLabel)).map(describeEntry), 'expiry entries not by System').toEqual([]);
    });
  });

  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.azureId}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
