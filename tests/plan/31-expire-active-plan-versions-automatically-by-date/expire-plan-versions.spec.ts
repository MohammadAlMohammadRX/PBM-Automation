import { test, expect } from '../../../fixtures';
import {
  APPROVAL,
  BLOCKED_CASES,
  CASES,
  EXPIRED_ENTRY,
  NOT_ELIGIBLE,
  RUN_TOLERANCE_MS,
  SEED_PAYER,
  SNAPSHOT,
  STATUS,
  SYSTEM_ACTOR,
  VIEWER_TIME_ZONE,
  VIEWER_UTC_OFFSET_MINUTES,
} from '../../../data/plans/expirePlanVersionsByDate.data';
import {
  badgeOf,
  claimPlanSeed,
  describeEntry,
  expiryOf,
  expiryRunObservedAt,
  isStatusChange,
  isSystemActor,
  planAuditSince,
  requireReprocessedPlanSeed,
  stateBeforeExpiryRun,
  utcMs,
} from '../../../utils/jobDriven/writerPHelpers';
import type { ClaimedJobSeed } from '../../../utils/jobDriven/jobSeeds';

/**
 * User story 14156: Expire active plan versions automatically by date.
 *
 * SEED-THEN-CHECK: every case claims a suite plan built and processed by
 * `npm run seed:plan-jobs` TODAY (Jobs.PlanLifecycleCron fired at F1 and F2,
 * restored after each) and asserts what the job did - no case moves the job.
 * No seed today -> BLOCKED naming the seed command. Read with
 * data/plans/expirePlanVersionsByDate.data.ts (dates, conflicts).
 */
test.describe('US 14156 - Expire active plan versions automatically by date', () => {
  test.describe.configure({ timeout: 6 * 60_000 });

  test(`TC-${CASES.expiresAfterExpiry.azureId}: should transition an Active version to Expired when its expiry date has passed and the daily job runs`, async ({
    page,
    planManagementPage,
    planDetailPage,
    steps,
  }, testInfo) => {
    const seed = await claimPlanSeed(page, testInfo, 'PlanVersionExpire');

    await steps.critical('Navigate to the Plans Management module - the Plans list page loads', async () => {
      await planManagementPage.openListFor(SEED_PAYER);
      expect(await planManagementPage.isListed(seed.name)).toBe(true);
    });

    await steps.critical('Confirm the version read Active with its expiry date already past (UTC) when the job ran', async () => {
      expect(stateBeforeExpiryRun(seed)?.status, 'the version before the expiry run').toBe(SNAPSHOT.active);
      expect(expiryOf(seed), 'the expiry had passed when the job ran').toBeLessThan(expiryRunObservedAt(seed));
    });

    await steps.critical('Allow the daily expiry job to run - the seed run recorded its result', async () => {
      expect(seed.after, 'the state after the expiry run').not.toBeNull();
    });

    await steps.critical('Reopen the plan version\'s detail page - it loads with refreshed data', async () => {
      await planDetailPage.open(seed.id);
      expect(await planDetailPage.isLoaded()).toBe(true);
    });

    await steps.step('The version\'s status badge now reads Expired', async () => {
      await planDetailPage.expectStatus(STATUS.expired);
      expect(seed.now?.status, 'GetPlan').toBe(SNAPSHOT.expired);
    });
  });

  test(`TC-${CASES.activeOnExpiryDay.azureId}: should keep the version Active when the job runs on the day it is scheduled to expire`, async ({
    page,
    planManagementPage,
    planDetailPage,
    steps,
  }, testInfo) => {
    const seed = await claimPlanSeed(page, testInfo, 'PlanActiveExpiryTomorrow');

    await steps.critical('Navigate to the Plans Management module - the Plans list page loads', async () => {
      await planManagementPage.openListFor(SEED_PAYER);
      expect(await planManagementPage.isListed(seed.name)).toBe(true);
    });

    await steps.critical('Confirm the version is Active and its expiry had not yet passed when the job ran', async () => {
      expect(stateBeforeExpiryRun(seed)?.status, 'the version before the run').toBe(SNAPSHOT.active);
      expect(expiryOf(seed), 'the expiry was still ahead at the run').toBeGreaterThan(expiryRunObservedAt(seed));
    });

    await steps.critical('Allow the daily expiry job to run - the seed run recorded its result', async () => {
      expect(seed.after, 'the state after the run').not.toBeNull();
    });

    await steps.critical('Reopen the plan version\'s detail page - it loads with refreshed data', async () => {
      await planDetailPage.open(seed.id);
      expect(await planDetailPage.isLoaded()).toBe(true);
    });

    await steps.step('The version\'s status badge still reads Active', async () => {
      await planDetailPage.expectStatus(STATUS.active);
      expect(seed.after?.status, 'right after the run').toBe(SNAPSHOT.active);
    });
  });

  test(`TC-${CASES.expiresDayAfter.azureId}: should expire the version on the first run after its expiry date when that date has just passed`, async ({
    page,
    planManagementPage,
    planDetailPage,
    steps,
  }, testInfo) => {
    const seed = await claimPlanSeed(page, testInfo, 'PlanVersionExpire');

    await steps.critical('Navigate to the Plans Management module - the Plans list page loads', async () => {
      await planManagementPage.openListFor(SEED_PAYER);
      expect(await planManagementPage.isListed(seed.name)).toBe(true);
    });

    await steps.critical('Confirm the version was Active and its expiry had just passed before the run', async () => {
      expect(stateBeforeExpiryRun(seed)?.status, 'the version before the run').toBe(SNAPSHOT.active);
      expect(expiryOf(seed), 'the expiry had passed at the run').toBeLessThan(expiryRunObservedAt(seed));
    });

    await steps.critical('Allow the daily expiry job to run - the seed run recorded its result', async () => {
      expect(seed.after, 'the state after the run').not.toBeNull();
    });

    await steps.critical('Reopen the plan version\'s detail page - it loads with refreshed data', async () => {
      await planDetailPage.open(seed.id);
      expect(await planDetailPage.isLoaded()).toBe(true);
    });

    await steps.step('The version\'s status badge now reads Expired', async () => {
      await planDetailPage.expectStatus(STATUS.expired);
      expect(seed.after?.status, 'right after the run').toBe(SNAPSHOT.expired);
    });
  });

  test(`TC-${CASES.draftUntouched.azureId}: should leave a Draft version unchanged when the expiry job runs past its expiry date`, async ({
    page,
    planManagementPage,
    planDetailPage,
    steps,
  }, testInfo) => {
    const seed = await claimPlanSeed(page, testInfo, 'PlanDraft');

    await steps.critical('Navigate to the Plans Management module - the Plans list page loads', async () => {
      await planManagementPage.openListFor(SEED_PAYER);
      expect(await planManagementPage.isListed(seed.name)).toBe(true);
    });

    await steps.critical('Confirm the version is a Draft whose expiry date had passed when the job ran', async () => {
      expect(await planManagementPage.getApprovalCell(seed.name)).toMatch(APPROVAL.draft);
      expect(expiryOf(seed), 'the expiry had passed at the run').toBeLessThan(expiryRunObservedAt(seed));
    });

    await steps.critical('Allow the daily expiry job to run - the seed run recorded its result', async () => {
      expect(seed.after, 'the state after the run').not.toBeNull();
    });

    await steps.critical('Reopen the plan version\'s detail page - it loads with refreshed data', async () => {
      await planDetailPage.open(seed.id);
      expect(await planDetailPage.isLoaded()).toBe(true);
    });

    await steps.step('The version is still a Draft - not Expired, its status as before the run', async () => {
      expect(await planDetailPage.getVersionBadge()).toMatch(APPROVAL.draft);
      expect(await planDetailPage.getStatus()).not.toBe(STATUS.expired);
      expect(seed.now?.status, 'GetPlan, against the state before the run').toBe(seed.before?.status);
    });
  });

  test(`TC-${CASES.inactiveUntouched.azureId}: should leave an Inactive version unchanged when the expiry job runs past its expiry date`, async ({
    page,
    planManagementPage,
    planDetailPage,
    steps,
  }, testInfo) => {
    const seed = await claimPlanSeed(page, testInfo, 'InactivePlanExpire');

    await steps.critical('Navigate to the Plans Management module - the Plans list page loads', async () => {
      await planManagementPage.openListFor(SEED_PAYER);
      expect(await planManagementPage.isListed(seed.name)).toBe(true);
    });

    await steps.critical('Confirm the version read Inactive with a past expiry date when the job ran', async () => {
      expect(stateBeforeExpiryRun(seed)?.status, 'the version before the run').toBe(SNAPSHOT.inactive);
      expect(expiryOf(seed), 'the expiry had passed at the run').toBeLessThan(expiryRunObservedAt(seed));
    });

    await steps.critical('Allow the daily expiry job to run - the seed run recorded its result', async () => {
      expect(seed.after, 'the state after the run').not.toBeNull();
    });

    await steps.critical('Reopen the plan version\'s detail page - it loads with refreshed data', async () => {
      await planDetailPage.open(seed.id);
      expect(await planDetailPage.isLoaded()).toBe(true);
    });

    await steps.step('The version\'s status badge still reads Inactive', async () => {
      await planDetailPage.expectStatus(STATUS.inactive);
      expect(seed.now?.status, 'GetPlan').toBe(SNAPSHOT.inactive);
    });
  });

  test(`TC-${CASES.systemActor.azureId}: should record System as the actor when a version is expired by the job`, async ({
    page,
    planManagementPage,
    planDetailPage,
    steps,
  }, testInfo) => {
    const seed = await claimPlanSeed(page, testInfo, 'PlanVersionExpire');

    await steps.critical('Navigate to the Plans Management module - the Plans list page loads', async () => {
      await planManagementPage.openListFor(SEED_PAYER);
      expect(await planManagementPage.isListed(seed.name)).toBe(true);
    });

    await steps.critical('Open the detail page of the version the job just expired - it loads', async () => {
      await planDetailPage.open(seed.id);
      await planDetailPage.expectStatus(STATUS.expired);
    });

    await steps.critical('Select the Audit History tab - the entries load', async () => {
      await planDetailPage.audit().open();
      expect((await planDetailPage.audit().readAllEntries()).length, 'an expired plan has history').toBeGreaterThan(0);
    });

    await steps.step('The actor recorded for the expiry reads System, not a user name', async () => {
      const entries = await planDetailPage.audit().readAllEntries();
      expect(entries[0]?.by, `the newest entry (the expiry): ${entries.map((e) => `${e.action} by ${e.by}`).join('; ')}`).toBe(SYSTEM_ACTOR);
      const expiry = await planAuditSince(page, seed.id, expiryOf(seed));
      expect(expiry.length, 'the expiry run recorded an entry').toBeGreaterThan(0);
      expect(expiry.filter((e) => !isSystemActor(e.actorLabel)).map(describeEntry), 'entries since the expiry not by System').toEqual([]);
    });
  });

  test(`TC-${CASES.kpiTiles.azureId}: should reflect the expired versions in the KPI tiles when the expiry job has processed them`, async ({
    page,
    planManagementPage,
    steps,
  }, testInfo) => {
    const seed = await claimPlanSeed(page, testInfo, 'PlanVersionExpire');

    await steps.critical('Navigate to the Plans Management module - the dashboard loads with its KPI tiles', async () => {
      await planManagementPage.openListFor(SEED_PAYER);
      expect(await planManagementPage.isKpiBandVisible()).toBe(true);
    });

    await steps.critical('Note the version\'s place before the job - it was counted Active', async () => {
      expect(stateBeforeExpiryRun(seed)?.status, 'the version before the run').toBe(SNAPSHOT.active);
    });

    await steps.critical('Allow the daily expiry job to run and process the version - it is Expired now', async () => {
      expect(seed.now?.status, 'GetPlan').toBe(SNAPSHOT.expired);
    });

    await steps.critical('Refresh the dashboard - the KPI tiles reload', async () => {
      await planManagementPage.openListFor(SEED_PAYER);
      expect(await planManagementPage.getSettledKpiValue('expired'), 'the Expired tile counts at least this version').toBeGreaterThan(0);
    });

    await steps.step('The Expired tile equals the plans the list shows as Expired, and the version is counted there', async () => {
      const tile = await planManagementPage.getSettledKpiValue('expired');
      const listed = await planManagementPage.captureListTotal(() => planManagementPage.applyQuickFilter('status', STATUS.expired));
      expect(tile, 'Expired KPI tile against the list filtered to Expired').toBe(listed);
      expect(await planManagementPage.readStatus(seed.name), 'the version is listed under Expired').toBe(STATUS.expired);
    });
  });

  test(`TC-${CASES.directoryBadge.azureId}: should show an Expired badge in the plan directory when a version has been auto-expired`, async ({
    page,
    planManagementPage,
    steps,
  }, testInfo) => {
    const seed = await claimPlanSeed(page, testInfo, 'PlanVersionExpire');

    await steps.critical('Navigate to the Plans Management module - the plan directory loads', async () => {
      await planManagementPage.openListFor(SEED_PAYER);
      expect(await planManagementPage.isKpiBandVisible()).toBe(true);
    });

    await steps.critical('Locate the plan whose version was auto-expired - its row is visible', async () => {
      expect(await planManagementPage.isListed(seed.name)).toBe(true);
    });

    await steps.step('The row\'s status indicator shows an Expired badge', async () => {
      expect(await planManagementPage.readStatus(seed.name)).toBe(STATUS.expired);
    });
  });

  test(`TC-${CASES.onlyActiveToExpired.azureId}: should move a version only from Active to Expired when the expiry job processes it`, async ({
    page,
    planManagementPage,
    planDetailPage,
    steps,
  }, testInfo) => {
    const seed = await claimPlanSeed(page, testInfo, 'PlanVersionExpire');

    await steps.critical('Navigate to the Plans Management module - the Plans list page loads', async () => {
      await planManagementPage.openListFor(SEED_PAYER);
      expect(await planManagementPage.isListed(seed.name)).toBe(true);
    });

    await steps.critical('Confirm the version\'s starting status was Active', async () => {
      expect(stateBeforeExpiryRun(seed)?.status, 'the version before the run').toBe(SNAPSHOT.active);
    });

    await steps.critical('Allow the daily expiry job to run - the seed run recorded its result', async () => {
      expect(seed.after, 'the state after the run').not.toBeNull();
    });

    await steps.step('Reopen the version\'s detail page - the status reads Expired, not Draft or Inactive', async () => {
      await planDetailPage.open(seed.id);
      await planDetailPage.expectStatus(STATUS.expired);
      expect(seed.now?.currentVersion, 'no new version was staged').toBe(stateBeforeExpiryRun(seed)?.currentVersion);
    });

    await steps.step('The history records a single Active-to-Expired transition, with no other status change', async () => {
      await planDetailPage.audit().open();
      const since = (await planAuditSince(page, seed.id, expiryOf(seed))).filter(isStatusChange);
      expect(since.map(describeEntry), 'status transitions recorded since the expiry instant').toHaveLength(1);
      expect(isSystemActor(since[0]?.actorLabel), describeEntry(since[0] ?? {})).toBe(true);
    });
  });

  test(`TC-${CASES.nothingEligible.azureId}: should change nothing when the job runs and the plans are not due to expire`, async ({
    page,
    planManagementPage,
    steps,
  }, testInfo) => {
    const seeds: { seed: ClaimedJobSeed; keeps: string }[] = [];
    for (const row of NOT_ELIGIBLE) seeds.push({ seed: await claimPlanSeed(page, testInfo, row.purpose), keeps: row.keeps });

    await steps.critical('Navigate to the Plans Management module - the Plans list page shows the current statuses', async () => {
      await planManagementPage.openListFor(SEED_PAYER);
      for (const { seed } of seeds) expect(await planManagementPage.isListed(seed.name), seed.name).toBe(true);
    });

    await steps.critical('Record the statuses before the run - no plan is due: Active / Future ones expire later', async () => {
      for (const { seed, keeps } of seeds) {
        expect(stateBeforeExpiryRun(seed)?.status, `${seed.name} before the run`).toBe(keeps);
        expect(expiryOf(seed), `${seed.name} expiry is still ahead`).toBeGreaterThan(expiryRunObservedAt(seed));
      }
    });

    await steps.critical('Allow the daily expiry job to run - the seed run recorded its result', async () => {
      for (const { seed } of seeds) expect(seed.after, `${seed.name} after the run`).not.toBeNull();
    });

    await steps.critical('Refresh the plans list and the KPI tiles - the page reloads with current data', async () => {
      await planManagementPage.openListFor(SEED_PAYER);
      expect(await planManagementPage.isKpiBandVisible()).toBe(true);
    });

    await steps.step('No status changed and no change was recorded by the run', async () => {
      for (const { seed, keeps } of seeds) {
        expect(await planManagementPage.readStatus(seed.name), seed.name).toBe(badgeOf(keeps));
        expect(seed.now?.status, `${seed.name} now`).toBe(keeps);
        const since = await planAuditSince(page, seed.id, utcMs(stateBeforeExpiryRun(seed)?.readAt) + 2_000);
        expect(since.map(describeEntry), `${seed.name}: entries recorded by the run`).toEqual([]);
      }
    });
  });

  test(`TC-${CASES.auditEntry.azureId}: should create an audit entry with action Expired, actor System and the run time when the job expires a version`, async ({
    page,
    planManagementPage,
    planDetailPage,
    steps,
  }, testInfo) => {
    const seed = await claimPlanSeed(page, testInfo, 'PlanVersionExpire');

    await steps.critical('Navigate to the Plans Management module - the Plans list page loads', async () => {
      await planManagementPage.openListFor(SEED_PAYER);
      expect(await planManagementPage.isListed(seed.name)).toBe(true);
    });

    await steps.critical('Open the detail page of the plan whose version was just expired - it loads', async () => {
      await planDetailPage.open(seed.id);
      await planDetailPage.expectStatus(STATUS.expired);
    });

    await steps.critical('Select the Audit History tab - the entries load', async () => {
      await planDetailPage.audit().open();
      expect((await planDetailPage.audit().readAllEntries()).length).toBeGreaterThan(0);
    });

    await steps.step('The expiry entry reads Action Expired, Actor System, at the job\'s run time', async () => {
      const entry = await planDetailPage.audit().openEntry(0);
      const recorded = `${entry.action} ${entry.changes.map((c) => `${c.field}: ${c.before} -> ${c.after}`).join('; ')}`;
      expect(recorded, 'the entry records the expiry').toMatch(EXPIRED_ENTRY);
      expect(entry.meta, 'the actor').toContain(SYSTEM_ACTOR);
      const since = (await planAuditSince(page, seed.id, expiryOf(seed))).filter(isStatusChange);
      const at = utcMs(since[since.length - 1]?.occurredAtUtc);
      expect(at, 'recorded after the expiry passed').toBeGreaterThanOrEqual(expiryOf(seed) - 1_000);
      expect(at, 'recorded by the run that expired it').toBeLessThanOrEqual(expiryRunObservedAt(seed) + RUN_TOLERANCE_MS);
    });
  });

  test(`TC-${CASES.idempotentRerun.azureId}: should not reprocess an already Expired version when the job runs again the same day`, async ({
    page,
    planManagementPage,
    planDetailPage,
    steps,
  }, testInfo) => {
    const { seed, rerunAt } = await requireReprocessedPlanSeed(page, testInfo, 'PlanVersionExpire');
    let expiryEntries = 0;

    await steps.critical('Navigate to the Plans Management module - the Plans list page loads', async () => {
      await planManagementPage.openListFor(SEED_PAYER);
      expect(await planManagementPage.isListed(seed.name)).toBe(true);
    });

    await steps.critical('Confirm the version was Expired with one expiry entry after its first expiry run', async () => {
      expect(seed.after?.status, 'after the first expiry run').toBe(SNAPSHOT.expired);
      const first = (await planAuditSince(page, seed.id, expiryOf(seed)))
        .filter((e) => isStatusChange(e) && utcMs(e.occurredAtUtc) <= expiryRunObservedAt(seed) + RUN_TOLERANCE_MS);
      expiryEntries = first.length;
      expect(expiryEntries, 'one expiry entry').toBe(1);
    });

    await steps.critical('The expiry job ran a second time the same day - completed', async () => {
      expect(rerunAt.getTime(), `a later run at ${rerunAt.toISOString()}`).toBeGreaterThan(expiryRunObservedAt(seed));
    });

    await steps.critical('Reopen the version\'s detail page and its Audit History tab - they reload', async () => {
      await planDetailPage.open(seed.id);
      await planDetailPage.audit().open();
      expect((await planDetailPage.audit().readAllEntries()).length).toBeGreaterThan(0);
    });

    await steps.step('The status remains Expired and no duplicate expiry entry was created', async () => {
      await planDetailPage.expectStatus(STATUS.expired);
      const all = (await planAuditSince(page, seed.id, expiryOf(seed))).filter(isStatusChange);
      expect(all.map(describeEntry), 'status transitions since the expiry instant').toHaveLength(expiryEntries);
    });
  });

  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.azureId}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});

test.describe('US 14156 - Expiry decided on the UTC date', () => {
  test.use({ timezoneId: VIEWER_TIME_ZONE });
  test.describe.configure({ timeout: 6 * 60_000 });

  test(`TC-${CASES.utcBased.azureId}: should expire the version by the UTC comparison whatever the viewer's time zone when the job runs`, async ({
    page,
    planManagementPage,
    planDetailPage,
    steps,
  }, testInfo) => {
    const seed = await claimPlanSeed(page, testInfo, 'PlanVersionExpire');

    await steps.critical('Navigate to the Plans Management module - the Plans list page loads', async () => {
      await planManagementPage.openListFor(SEED_PAYER);
      expect(await planManagementPage.isListed(seed.name)).toBe(true);
    });

    await steps.critical('Confirm the version was Active with its expiry passed in UTC when the job ran', async () => {
      expect(stateBeforeExpiryRun(seed)?.status, 'the version before the run').toBe(SNAPSHOT.active);
      expect(expiryOf(seed), 'expiry against the run, both UTC instants').toBeLessThan(expiryRunObservedAt(seed));
    });

    await steps.critical('Allow the daily expiry job to run - the seed run recorded its result', async () => {
      expect(seed.after, 'the state after the run').not.toBeNull();
    });

    await steps.critical('Reopen the version\'s detail page from a session in another time zone - it loads', async () => {
      expect(await planDetailPage.getBrowserUtcOffsetMinutes(), 'the viewer\'s offset').toBe(VIEWER_UTC_OFFSET_MINUTES);
      await planDetailPage.open(seed.id);
      expect(await planDetailPage.isLoaded()).toBe(true);
    });

    await steps.step('The status reflects the UTC comparison - Expired, the same as the server reports', async () => {
      await planDetailPage.expectStatus(STATUS.expired);
      expect(seed.now?.status, 'GetPlan').toBe(SNAPSHOT.expired);
    });
  });
});
