import { test, expect } from '../../../fixtures';
import type { PlanVersionRow } from '../../../pages/plan/PlanVersionHistoryTab';
import { formularyCode } from '../../../data/plans/assignPlanFormulary.data';
import {
  APPROVER_NAME,
  BLOCKED_CASES,
  CASE,
  REQUIRED_COLUMNS,
  SUITE_PAYER,
  TIME_TOLERANCE_MS,
  VERSION_COUNT,
  VERSION_STATE,
  newPlanData,
  parseScreenDateTime,
  v,
  versionNumber,
} from '../../../data/plans/planVersionHistory.data';

/**
 * User story 14154: View version history for a plan.
 * The Version History tab: every version newest first, each row's fields,
 * the latest one marked out, and how it follows a version through approval.
 *
 * Versions are built from approved formulary changes (`planWithFormularyHistory`)
 * - see the data file.
 */
test.describe('US 14154 - Plan version history', () => {
  test.describe.configure({ timeout: 20 * 60_000 });

  test(`TC-${CASE.newestFirst}: should list every version from newest to oldest when the plan has several versions`, async ({
    planManagementPage,
    planDetailPage,
    suitePayerFormularies,
    planWithFormularyHistory,
    steps,
  }) => {
    const [a, b] = await suitePayerFormularies(2);
    const plan = await planWithFormularyHistory([a, b, a]);
    const tab = planDetailPage.versions();

    await steps.critical('Navigate to the Plans Management module - the plan list loads', async () => {
      await planManagementPage.openListFor(SUITE_PAYER);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Open the plan and select Version History - the tab opens', async () => {
      await planDetailPage.open(plan.id);
      await tab.open();
      expect((await tab.readRows()).length).toBeGreaterThan(0);
    });

    await steps.step('Review the order of the versions - highest Version first, descending to the oldest', async () => {
      const numbers = (await tab.readRows()).map((row) => versionNumber(row.version));
      expect(numbers.length, 'every version should be listed').toBeGreaterThanOrEqual(VERSION_COUNT);
      expect(numbers, 'newest first').toEqual([...numbers].sort((x, y) => y - x));
    });
  });

  test(`TC-${CASE.rowFields}: should show Version, Status, Effective and Expiry Dates and Created By / On when a version row is inspected`, async ({
    planManagementPage,
    planDetailPage,
    suitePayerFormularies,
    planWithFormularyHistory,
    steps,
  }) => {
    const [a, b] = await suitePayerFormularies(2);
    const plan = await planWithFormularyHistory([a, b, a]);
    const tab = planDetailPage.versions();

    await steps.critical('Navigate to the Plans Management module - the plan list loads', async () => {
      await planManagementPage.openListFor(SUITE_PAYER);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Open the plan and select Version History - a list of version rows', async () => {
      await planDetailPage.open(plan.id);
      await tab.open();
      expect((await tab.readRows()).length).toBeGreaterThanOrEqual(VERSION_COUNT);
    });

    await steps.step('Inspect a version row against the required fields - all present and populated', async () => {
      const headers = await tab.getHeaders();
      const missing = REQUIRED_COLUMNS.filter((column) => !headers.some((header) => header.toLowerCase() === column.toLowerCase()));
      expect(missing, `the tab shows ${headers.join(', ')}`).toEqual([]);
      const row = (await tab.readRows()).find((r) => r.version === v(2));
      expect([row?.version, row?.status, row?.requestedBy, row?.requestedOn].every((cell) => Boolean(cell)), `v2 row ${JSON.stringify(row)}`).toBe(true);
    });
  });

  test(`TC-${CASE.latestHighlighted}: should mark out only the newest version and move the mark when a new version is added`, async ({
    planManagementPage,
    planDetailPage,
    planApprovalsPage,
    suitePayerFormularies,
    planWithFormularyHistory,
    steps,
  }) => {
    const [a, b] = await suitePayerFormularies(2);
    const plan = await planWithFormularyHistory([a, b]);
    const tab = planDetailPage.versions();
    let latest = '';

    await steps.critical('Navigate to the Plans Management module - the plan list loads', async () => {
      await planManagementPage.openListFor(SUITE_PAYER);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Open the plan and select Version History - the version list is displayed', async () => {
      await planDetailPage.open(plan.id);
      await tab.open();
      latest = (await tab.readRows())[0]?.version ?? '';
      expect(latest).toBe(v(2));
    });

    await steps.step('Identify the highest Version - that row alone is highlighted', async () => {
      expect(await tab.readHighlightedVersions(), 'only the latest version should be marked out').toEqual([latest]);
    });

    await steps.step('Add a new version and reopen Version History - the highlight moves to it', async () => {
      await planDetailPage.formulary().open();
      expect((await planDetailPage.formulary().replaceWith(formularyCode(a)))?.status).toBeLessThan(300);
      await planDetailPage.submitForApproval();
      await planApprovalsPage.open();
      await planApprovalsPage.approve(plan.name);
      await planDetailPage.open(plan.id);
      await tab.open();
      expect((await tab.readRows())[0]?.version).toBe(v(3));
      expect(await tab.readHighlightedVersions(), 'the mark should move to the new latest version').toEqual([v(3)]);
    });
  });

  test(`TC-${CASE.singleVersion}: should show exactly one populated, highlighted row when the plan has a single version`, async ({
    planManagementPage,
    planDetailPage,
    planIn,
    steps,
  }) => {
    const plan = await planIn('Active');
    const tab = planDetailPage.versions();

    await steps.critical('Navigate to the Plans Management module - the plan list loads', async () => {
      await planManagementPage.openListFor(SUITE_PAYER);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Open the plan that has exactly one version - its details open', async () => {
      await planDetailPage.open(plan.id);
      expect(await planDetailPage.getName()).toBe(plan.name);
    });

    await steps.step('Select Version History - exactly one row, highlighted as the latest, with its fields populated', async () => {
      await tab.open();
      const rows = await tab.readRows();
      expect(rows.map((row) => row.version)).toEqual([v(1)]);
      expect([rows[0].status, rows[0].requestedBy, rows[0].requestedOn].every(Boolean), `the row ${JSON.stringify(rows[0])}`).toBe(true);
      expect(await tab.readHighlightedVersions(), 'the only version is the latest').toEqual([v(1)]);
    });
  });

  test(`TC-${CASE.lifecycleRow}: should show the new version at the top and update it in place when it moves from Pending Approval to approved`, async ({
    planManagementPage,
    planDetailPage,
    planApprovalsPage,
    planIn,
    suitePayerFormularies,
    steps,
  }) => {
    const [original, replacement] = await suitePayerFormularies(2);
    const plan = await planIn('Active', { formularyId: original.id });
    const tab = planDetailPage.versions();
    let pendingCount = 0;

    await steps.critical('Navigate to the Plans Management module - the plan list loads', async () => {
      await planManagementPage.openListFor(SUITE_PAYER);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Open the plan and submit a new version - it is created in Pending Approval', async () => {
      await planDetailPage.open(plan.id);
      await planDetailPage.formulary().open();
      expect((await planDetailPage.formulary().replaceWith(formularyCode(replacement)))?.status).toBeLessThan(300);
      await planDetailPage.submitForApproval();
      await planApprovalsPage.open();
      await planApprovalsPage.expectInQueue(plan.name);
    });

    await steps.critical('Open Version History - the new version is at the top with its pending status', async () => {
      await planDetailPage.open(plan.id);
      await tab.open();
      const rows = await tab.readRows();
      pendingCount = rows.length;
      expect(rows[0]?.version).toBe(v(2));
      expect(rows[0]?.status).toMatch(VERSION_STATE.pendingApproval);
    });

    await steps.step('Approve the pending version - its row turns approved with no duplicate row', async () => {
      await planApprovalsPage.open();
      await planApprovalsPage.approve(plan.name);
      await planDetailPage.open(plan.id);
      await tab.open();
      const rows: PlanVersionRow[] = await tab.readRows();
      expect(rows.length, 'no duplicate row').toBe(pendingCount);
      expect(rows.filter((row) => row.version === v(2)).length).toBe(1);
      expect(rows[0]?.status).toMatch(VERSION_STATE.published);
    });
  });

  test(`TC-${CASE.stableOnReturn}: should show the same versions, order and values when the user leaves the tab and returns`, async ({
    planManagementPage,
    planDetailPage,
    suitePayerFormularies,
    planWithFormularyHistory,
    steps,
  }) => {
    const [a, b] = await suitePayerFormularies(2);
    const plan = await planWithFormularyHistory([a, b]);
    const tab = planDetailPage.versions();
    let noted: PlanVersionRow[] = [];

    await steps.critical('Navigate to the Plans Management module - the plan list loads', async () => {
      await planManagementPage.openListFor(SUITE_PAYER);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Open Version History and note the versions and their order - the list is displayed', async () => {
      await planDetailPage.open(plan.id);
      await tab.open();
      noted = await tab.readRows();
      expect(noted.length).toBeGreaterThanOrEqual(2);
    });

    await steps.critical('Go to another tab, then back to Version History - the tab reloads', async () => {
      await planDetailPage.openTab('overview');
      expect(await planDetailPage.readOverviewField('payer')).toBe(SUITE_PAYER);
      await tab.open();
      expect((await tab.readRows()).length).toBeGreaterThan(0);
    });

    await steps.step('Compare the reloaded list with the noted one - versions, order and values unchanged', async () => {
      expect(await tab.readRows()).toEqual(noted);
    });
  });

  test(`TC-${CASE.firstVersion}: should show the single original version with its status, dates and creator when a plan has just been created`, async ({
    planManagementPage,
    planDetailPage,
    cleanup,
    steps,
  }) => {
    const data = newPlanData();
    const form = planManagementPage.editForm();
    let planId = '';

    await steps.critical('Navigate to the Plans Management module - the plan list loads', async () => {
      await planManagementPage.openListFor(SUITE_PAYER);
      expect(await planManagementPage.isAddOffered(), 'the Add control').toBe(true);
    });

    await steps.critical('Create a brand-new plan - it is created in Draft', async () => {
      await planManagementPage.openAddForm();
      await form.fill(data);
      const report = await form.saveNewAndReport();
      cleanup.register(() => form.discardCreated(report.outcome));
      expect(report.created, `CreatePlan: ${report.text}`).toBe(true);
      planId = form.createdId(report.outcome);
      expect(planId).not.toBe('');
    });

    await steps.step('Open Version History at once - the single original version with its status, dates and creator', async () => {
      await planDetailPage.open(planId);
      await planDetailPage.versions().open();
      const rows = await planDetailPage.versions().readRows();
      expect(rows.length, 'exactly the original version').toBe(1);
      expect(rows[0]?.status).toMatch(VERSION_STATE.draft);
      expect(rows[0]?.requestedBy, 'the creator').toBe(APPROVER_NAME);
      expect(rows[0]?.requestedOn, 'when it was created').not.toBe('');
    });
  });

  test(`TC-${CASE.authorship}: should record the signed-in user and the creation time when a named user creates a version`, async ({
    planManagementPage,
    planDetailPage,
    planIn,
    suitePayerFormularies,
    steps,
  }) => {
    const [original, replacement] = await suitePayerFormularies(2);
    const plan = await planIn('Active', { formularyId: original.id });
    const tab = planDetailPage.versions();
    let createdAt = 0;

    await steps.critical('Navigate to the Plans Management module - the plan list loads', async () => {
      await planManagementPage.openListFor(SUITE_PAYER);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('As the signed-in user, create a new version at a known time - the version is created', async () => {
      await planDetailPage.open(plan.id);
      await planDetailPage.formulary().open();
      createdAt = Date.now();
      expect((await planDetailPage.formulary().replaceWith(formularyCode(replacement)))?.status).toBeLessThan(300);
      await planDetailPage.submitForApproval();
    });

    await steps.critical('Open Version History - the new version row appears', async () => {
      await planDetailPage.open(plan.id);
      await tab.open();
      expect((await tab.readRows())[0]?.version).toBe(v(2));
    });

    await steps.step('Compare the row\'s authorship with the signed-in user and the time of creation - they match', async () => {
      const [row] = await tab.readRows();
      expect(row.requestedBy, 'the version\'s author').toBe(APPROVER_NAME);
      const recorded = parseScreenDateTime(row.requestedOn);
      expect(Math.abs(recorded - createdAt), `"${row.requestedOn}" should be the creation time`).toBeLessThanOrEqual(TIME_TOLERANCE_MS);
    });
  });

  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.azureId}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
