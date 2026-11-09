import { test, expect } from '../../../fixtures';
import {
  APPROVAL,
  BLOCKED_CASES,
  CASES,
  DAY_TOLERANCE_MS,
  DRAFT_LABEL,
  MIXED_PURPOSES,
  SEED_PAYER,
  SNAPSHOT,
  STATUS,
  STATUS_CHECKLIST,
  TEN_DAYS_AHEAD,
  TEN_DAYS_MS,
} from '../../../data/plans/planStatusDerivation.data';
import {
  claimPlanSeed,
  derivedPlanLabel,
  effectiveOf,
  utcMs,
} from '../../../utils/jobDriven/writerPHelpers';
import { riyadhDate } from '../../../utils/JobClock';
import { readPlan } from '../../../utils/PlanProvisioning';
import type { ClaimedJobSeed } from '../../../utils/jobDriven/jobSeeds';

/**
 * User story 14338: Determine plan status automatically from approval,
 * effective date, and payer status.
 *
 * Approval never makes a plan Active by itself - it reads Pending until the
 * daily plan job runs (verified 2026-11-08) - so the "Active" cases claim
 * plans built and processed by `npm run seed:plan-jobs` TODAY and assert what
 * the job left; no seed today -> BLOCKED naming the seed command. 19299 needs
 * no job and builds its own plan. The inactive-payer cases are BLOCKED (the
 * suite's only approvable payer must stay Active). Read with
 * data/plans/planStatusDerivation.data.ts.
 */
test.describe('US 14338 - Determine plan status automatically from approval, effective date, and payer status', () => {
  test.describe.configure({ timeout: 8 * 60_000 });

  test(`TC-${CASES.futurePending.azureId}: should show an approved plan as Pending when its effective date is 10 days ahead`, async ({
    page,
    planManagementPage,
    planIn,
    steps,
  }) => {
    const startedAt = Date.now();
    const plan = await planIn('Pending', TEN_DAYS_AHEAD);

    await steps.critical('Navigate to the Plans Management module - the plan list is visible', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isKpiBandVisible()).toBe(true);
    });

    await steps.critical('Set the effective date 10 days ahead and save the approval - Approved with the future effective date', async () => {
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
      expect(await planManagementPage.getApprovalCell(plan.name)).toMatch(APPROVAL.approved);
      const effective = utcMs((await readPlan(page, plan.id)).effectiveDate);
      expect(Math.abs(effective - startedAt - TEN_DAYS_MS), 'effective in 10 days').toBeLessThan(DAY_TOLERANCE_MS);
    });

    await steps.critical('Open the Plans list and locate the plan - its status column is visible', async () => {
      expect((await planManagementPage.readRow(plan.name)).status).not.toBe('');
    });

    await steps.step('The status column displays Pending', async () => {
      expect(await planManagementPage.readStatus(plan.name)).toBe(STATUS.pending);
    });
  });

  test(`TC-${CASES.todayActive.azureId}: should show an approved plan as Active when its effective date is today and the payer is Active`, async ({
    page,
    planManagementPage,
    steps,
  }, testInfo) => {
    const seed = await claimPlanSeed(page, testInfo, 'PlanActivateOnEffective');

    await steps.critical('Navigate to the Plans Management module - the plan list is visible', async () => {
      await planManagementPage.openListFor(SEED_PAYER);
      expect(await planManagementPage.isKpiBandVisible()).toBe(true);
    });

    await steps.critical('The plan is Approved with an effective date equal to today', async () => {
      expect(await planManagementPage.isListed(seed.name)).toBe(true);
      expect(await planManagementPage.getApprovalCell(seed.name)).toMatch(APPROVAL.approved);
      expect(riyadhDate(effectiveOf(seed)), 'the effective date').toBe(riyadhDate());
    });

    await steps.critical('Open the Plans list and locate the plan - its status column is visible', async () => {
      expect((await planManagementPage.readRow(seed.name)).status).not.toBe('');
    });

    await steps.step('The status column displays Active - today counts as arrived', async () => {
      expect(await planManagementPage.readStatus(seed.name)).toBe(STATUS.active);
    });
  });

  test(`TC-${CASES.pastActive.azureId}: should show an approved plan as Active when its effective date is already in the past`, async ({
    page,
    planManagementPage,
    steps,
  }, testInfo) => {
    const seed = await claimPlanSeed(page, testInfo, 'PlanActivateOnEffective');

    await steps.critical('Navigate to the Plans Management module - the plan list is visible', async () => {
      await planManagementPage.openListFor(SEED_PAYER);
      expect(await planManagementPage.isKpiBandVisible()).toBe(true);
    });

    await steps.critical('The plan is Approved with an effective date in the past', async () => {
      expect(await planManagementPage.isListed(seed.name)).toBe(true);
      expect(await planManagementPage.getApprovalCell(seed.name)).toMatch(APPROVAL.approved);
      expect(effectiveOf(seed), 'the effective date has passed').toBeLessThan(Date.now());
    });

    await steps.critical('Open the Plans list and locate the plan - its status column is visible', async () => {
      expect((await planManagementPage.readRow(seed.name)).status).not.toBe('');
    });

    await steps.step('The status column displays Active', async () => {
      expect(await planManagementPage.readStatus(seed.name)).toBe(STATUS.active);
    });
  });

  test(`TC-${CASES.tomorrowPending.azureId}: should keep an approved plan Pending when it is due to start tomorrow`, async ({
    page,
    planManagementPage,
    steps,
  }, testInfo) => {
    const seed = await claimPlanSeed(page, testInfo, 'PlanFutureEffective');

    await steps.critical('Navigate to the Plans Management module - the plan list is visible', async () => {
      await planManagementPage.openListFor(SEED_PAYER);
      expect(await planManagementPage.isKpiBandVisible()).toBe(true);
    });

    await steps.critical('The plan is Approved with an effective date after today', async () => {
      expect(await planManagementPage.isListed(seed.name)).toBe(true);
      expect(await planManagementPage.getApprovalCell(seed.name)).toMatch(APPROVAL.approved);
      expect(riyadhDate(effectiveOf(seed)) > riyadhDate(), `effective ${riyadhDate(effectiveOf(seed))}, today ${riyadhDate()}`).toBe(true);
    });

    await steps.critical('Open the Plans list and locate the plan - its status column is visible', async () => {
      expect((await planManagementPage.readRow(seed.name)).status).not.toBe('');
    });

    await steps.step('The status column displays Pending - the day has not yet arrived', async () => {
      expect(await planManagementPage.readStatus(seed.name)).toBe(STATUS.pending);
    });
  });

  test(`TC-${CASES.yesterdayActive.azureId}: should show an approved plan that has already started as Active`, async ({
    page,
    planManagementPage,
    steps,
  }, testInfo) => {
    const seed = await claimPlanSeed(page, testInfo, 'PlanActivateOnEffective');

    await steps.critical('Navigate to the Plans Management module - the plan list is visible', async () => {
      await planManagementPage.openListFor(SEED_PAYER);
      expect(await planManagementPage.isKpiBandVisible()).toBe(true);
    });

    await steps.critical('The plan is Approved with an effective date before the job run', async () => {
      expect(await planManagementPage.isListed(seed.name)).toBe(true);
      expect(await planManagementPage.getApprovalCell(seed.name)).toMatch(APPROVAL.approved);
      expect(effectiveOf(seed), 'started before the job ran').toBeLessThan(utcMs(seed.afterF1?.readAt));
    });

    await steps.critical('Open the Plans list and locate the plan - its status column is visible', async () => {
      expect((await planManagementPage.readRow(seed.name)).status).not.toBe('');
    });

    await steps.step('The status column displays Active', async () => {
      expect(await planManagementPage.readStatus(seed.name)).toBe(STATUS.active);
    });
  });

  test(`TC-${CASES.unapprovedNeverLive.azureId}: should show an unapproved plan as Draft and never Pending or Active whatever its effective date`, async ({
    page,
    planManagementPage,
    steps,
  }, testInfo) => {
    const draft = await claimPlanSeed(page, testInfo, 'PlanDraft');
    const submitted = await claimPlanSeed(page, testInfo, 'PlanUnapproved');

    await steps.critical('Navigate to the Plans Management module - the plan list is visible', async () => {
      await planManagementPage.openListFor(SEED_PAYER);
      expect(await planManagementPage.isKpiBandVisible()).toBe(true);
    });

    await steps.critical('The unapproved plans have an effective date that has arrived and keep their unapproved state', async () => {
      expect(await planManagementPage.isListed(draft.name)).toBe(true);
      expect(await planManagementPage.getApprovalCell(draft.name), draft.name).toMatch(APPROVAL.draft);
      expect(await planManagementPage.getApprovalCell(submitted.name), submitted.name).toMatch(APPROVAL.pendingApproval);
      expect(effectiveOf(draft)).toBeLessThan(Date.now());
      expect(effectiveOf(submitted)).toBeLessThan(Date.now());
    });

    await steps.critical('Open the Plans list and locate the plans - their status column is visible', async () => {
      expect((await planManagementPage.readRow(draft.name)).status).not.toBe('');
      expect((await planManagementPage.readRow(submitted.name)).status).not.toBe('');
    });

    await steps.step('The status column displays Draft and never Pending or Active', async () => {
      expect(await planManagementPage.readStatus(draft.name), draft.name).toBe(DRAFT_LABEL);
      const shown = [await planManagementPage.readStatus(draft.name), await planManagementPage.readStatus(submitted.name)];
      expect(shown.filter((s) => s === STATUS.pending || s === STATUS.active), 'an unapproved plan shown Pending / Active').toEqual([]);
    });
  });

  test(`TC-${CASES.jobActivates.azureId}: should move a plan from Pending to Active when the daily process runs on its start date`, async ({
    page,
    planManagementPage,
    steps,
  }, testInfo) => {
    const seed = await claimPlanSeed(page, testInfo, 'PlanActivateOnEffective');

    await steps.critical('Navigate to the Plans Management module - the plan list is visible', async () => {
      await planManagementPage.openListFor(SEED_PAYER);
      expect(await planManagementPage.isListed(seed.name)).toBe(true);
    });

    await steps.critical('The plan showed Pending before the lifecycle process ran', async () => {
      expect(seed.before?.status, 'right after the approval').toBe(SNAPSHOT.future);
    });

    await steps.critical('The daily lifecycle process ran and processed the plan', async () => {
      expect(seed.afterF1?.status, 'right after the run').toBe(SNAPSHOT.active);
    });

    await steps.critical('Refresh the Plans list and locate the plan - its status column is visible', async () => {
      await planManagementPage.openListFor(SEED_PAYER);
      expect((await planManagementPage.readRow(seed.name)).status).not.toBe('');
    });

    await steps.step('The status column now displays Active', async () => {
      expect(await planManagementPage.readStatus(seed.name)).toBe(STATUS.active);
    });
  });

  test(`TC-${CASES.jobLeavesPending.azureId}: should leave a plan Pending when the daily process runs before its start date`, async ({
    page,
    planManagementPage,
    steps,
  }, testInfo) => {
    const seed = await claimPlanSeed(page, testInfo, 'PlanFutureEffective');

    await steps.critical('Navigate to the Plans Management module - the plan list is visible', async () => {
      await planManagementPage.openListFor(SEED_PAYER);
      expect(await planManagementPage.isListed(seed.name)).toBe(true);
    });

    await steps.critical('The plan showed Pending before the lifecycle process ran', async () => {
      expect(seed.before?.status, 'right after the approval').toBe(SNAPSHOT.future);
    });

    await steps.critical('The daily lifecycle process ran without altering a plan whose date has not arrived', async () => {
      expect(effectiveOf(seed), 'still ahead at the run').toBeGreaterThan(utcMs(seed.after?.readAt));
      expect(seed.afterF1?.status, 'after the first run').toBe(SNAPSHOT.future);
      expect(seed.after?.status, 'after the second run').toBe(SNAPSHOT.future);
    });

    await steps.critical('Refresh the Plans list and locate the plan - its status column is visible', async () => {
      await planManagementPage.openListFor(SEED_PAYER);
      expect((await planManagementPage.readRow(seed.name)).status).not.toBe('');
    });

    await steps.step('The status column still displays Pending', async () => {
      expect(await planManagementPage.readStatus(seed.name)).toBe(STATUS.pending);
    });
  });

  test(`TC-${CASES.listAccurate.azureId}: should show every plan with the status its approval, dates and payer justify when the list is opened`, async ({
    page,
    planManagementPage,
    planDetailPage,
    steps,
  }, testInfo) => {
    const seeds: ClaimedJobSeed[] = [];
    for (const purpose of MIXED_PURPOSES) seeds.push(await claimPlanSeed(page, testInfo, purpose));
    const shown = new Map<string, string>();

    await steps.critical('Navigate to the Plans Management module - the plan list is visible', async () => {
      await planManagementPage.openListFor(SEED_PAYER);
      expect(await planManagementPage.isKpiBandVisible()).toBe(true);
    });

    await steps.critical('Open the Plans list showing the plans - each is listed with its status', async () => {
      for (const seed of seeds) {
        shown.set(seed.id, await planManagementPage.readStatus(seed.name));
        expect(shown.get(seed.id), seed.name).not.toBe('');
      }
    });

    await steps.step('Each plan\'s displayed status matches its approval state, effective / expiry dates and payer', async () => {
      const wrong = seeds
        .flatMap((s) => (s.now ? [{ name: s.name, shown: shown.get(s.id), expected: derivedPlanLabel(s.now, Date.now()) }] : []))
        .filter((r) => r.shown !== r.expected);
      expect(seeds.filter((s) => s.now === null).map((s) => s.name), 'plans GetPlan could not read').toEqual([]);
      expect(wrong, 'plans whose status does not follow from their data').toEqual([]);
    });

    await steps.step('Select a plan and open its detail - the same status as the list, with the approval, effective date and payer', async () => {
      const active = seeds.find((s) => s.purpose === 'PlanActivateOnEffective') ?? seeds[0];
      await planDetailPage.open(active.id);
      await planDetailPage.expectStatus(shown.get(active.id) ?? '');
      expect(await planDetailPage.getVersionBadge(), 'the approval').toMatch(APPROVAL.approved);
      const overview = await planDetailPage.readOverview();
      expect(overview.effectiveDate, 'the effective date').not.toBe('');
      expect(overview.payer, 'the (Active) payer').toContain(SEED_PAYER);
    });
  });

  test(`TC-${CASES.everyStatus.azureId}: should label each plan Draft, Pending, Active, Inactive or Expired correctly in the plan list`, async ({
    page,
    planManagementPage,
    steps,
  }, testInfo) => {
    const rows: { status: string; label: string; seed: ClaimedJobSeed }[] = [];
    for (const row of STATUS_CHECKLIST) rows.push({ status: row.status, label: row.label, seed: await claimPlanSeed(page, testInfo, row.purpose) });

    await steps.critical('Navigate to the Plans Management module - the plan list is visible', async () => {
      await planManagementPage.openListFor(SEED_PAYER);
      expect(await planManagementPage.isKpiBandVisible()).toBe(true);
    });

    for (const { status, label, seed } of rows) {
      await steps.step(`Locate a plan in ${status} status - the list shows "${label}" for it`, async () => {
        expect(await planManagementPage.readStatus(seed.name), seed.name).toBe(label);
      });
    }
  });

  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.azureId}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
