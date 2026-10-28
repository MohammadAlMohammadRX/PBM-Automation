import { test, expect } from '../../../fixtures';
import { PLAN_COLUMN } from '../../../constants/ElementIds';
import type { PlanDetailPage } from '../../../pages/plan/PlanDetailPage';
import { CASES, versionNumber } from '../../../data/plans/planDirectoryKpis.data';

/**
 * User story 14145: View plan directory with KPI tiles and filtering.
 * The directory's entries - one row per plan at its current version, the full
 * history behind it on the Version History tab, the default table view and
 * the card view, and a status badge on every plan.
 *
 * A plan with two versions is built by approving it (v1) and then approving its
 * inactivation (v2) - `planIn('Inactive')`. The card-view case leaves the list
 * in Table view again: the view preference is remembered per user.
 */
test.describe('US 14145 - Directory entries and views', () => {
  test(`TC-${CASES.versionHistory.azureId}: should list every previous version in order on the Version History tab when a plan has several versions`, async ({
    planManagementPage,
    planIn,
    steps,
  }) => {
    test.setTimeout(15 * 60_000);
    const data = CASES.versionHistory;
    const plan = await planIn('Inactive');
    let detail!: PlanDetailPage;

    await steps.critical('Navigate to the Plans Management module - the plan directory loads', async () => {
      await planManagementPage.openList();
      expect(await planManagementPage.isListed(plan.name), `"${plan.name}" should be listed`).toBe(true);
    });

    await steps.critical('Viewing the plan opens its detail view', async () => {
      detail = await planManagementPage.openDetails(plan.name);
      expect(await detail.getName()).toContain(plan.name);
    });

    await steps.step('The Version History tab lists every version in chronological order, superseded ones included', async () => {
      const tab = detail.versions();
      await tab.open();
      const rows = await tab.readRows();
      const numbers = rows.map((row) => versionNumber(row.version));
      expect(rows.length, 'both versions should be listed').toBeGreaterThanOrEqual(data.minimumVersions);
      expect([[...numbers].sort((a, b) => a - b), [...numbers].sort((a, b) => b - a)], `versions in order: ${numbers.join(', ')}`).toContainEqual(numbers);
      expect(rows.map((row) => row.status), 'the superseded first version should be kept').toContain(data.superseded);
    });
  });

  test(`TC-${CASES.oneEntryPerPlan.azureId}: should show exactly one directory row per plan carrying its current version when a plan has several versions`, async ({
    planManagementPage,
    planIn,
    steps,
  }) => {
    test.setTimeout(15 * 60_000);
    const data = CASES.oneEntryPerPlan;
    const plan = await planIn('Inactive');

    await steps.critical('Navigate to the Plans Management module - the plan directory loads', async () => {
      await planManagementPage.openList();
      await planManagementPage.expectRowsRendered();
    });

    await steps.step('Each plan appears only once in the directory', async () => {
      await planManagementPage.expectColumnValuesUnique(PLAN_COLUMN.code);
      await planManagementPage.search(plan.name);
      const rows = (await planManagementPage.getPlanRows()).filter((row) => row.name === plan.name);
      expect(rows.length, `"${plan.name}" has two versions and should still have one row`).toBe(1);
    });

    await steps.step('That single row carries the current version only', async () => {
      const cell = await planManagementPage.getApprovalCell(plan.name);
      expect(versionNumber(cell), `the approval cell "${cell}" should name the current version`).toBe(data.currentVersion);
    });
  });

  test(`TC-${CASES.viewToggle.azureId}: should open in table view and switch to cards and back when the view toggle is used`, async ({
    planManagementPage,
    cleanup,
    steps,
  }) => {
    cleanup.register(() => planManagementPage.switchToTableView());

    await steps.critical('Navigate to the Plans Management module - the plan directory loads', async () => {
      await planManagementPage.open();
      expect(await planManagementPage.isKpiBandVisible(), 'the directory should load').toBe(true);
    });

    await steps.step('Without changing any setting the table view is shown', async () => {
      expect(await planManagementPage.isTableViewActive(), 'table view should be the default on load').toBe(true);
    });

    await steps.step('Choosing card view shows the plans as cards', async () => {
      await planManagementPage.switchToCardsView();
      expect((await planManagementPage.getCardTitles()).length, 'cards should render').toBeGreaterThan(0);
    });

    await steps.step('Choosing table view again shows the table', async () => {
      await planManagementPage.switchToTableView();
      await planManagementPage.expectRowsRendered();
      expect(await planManagementPage.isTableViewActive()).toBe(true);
    });
  });

  test(`TC-${CASES.statusBadges.azureId}: should show a correctly labelled, distinct status badge on every plan when plans of each status are listed`, async ({
    planManagementPage,
    steps,
  }) => {
    const [first, ...others] = CASES.statusBadges.statuses;
    const tones: string[] = [];

    await steps.critical('Navigate to the Plans Management module - the directory shows all plans', async () => {
      await planManagementPage.openList();
      await planManagementPage.expectRowsRendered();
    });

    await steps.step(`An ${first} plan's row shows a badge labelled ${first}`, async () => {
      await planManagementPage.applyQuickFilter('status', first);
      const pairs = await planManagementPage.getStatusTonePairs();
      expect(pairs.length, `an ${first} plan should be listed`).toBeGreaterThan(0);
      expect(pairs.filter((pair) => pair.status !== first), `badges not labelled ${first}`).toEqual([]);
      tones.push(pairs[0].tone);
    });

    await steps.step(`${others.join(', ')} plans each show their own label in a distinct badge`, async () => {
      for (const status of others) {
        await planManagementPage.openList();
        await planManagementPage.applyQuickFilter('status', status);
        const pairs = await planManagementPage.getStatusTonePairs();
        expect(pairs.length, `a ${status} plan should be listed`).toBeGreaterThan(0);
        expect(pairs.filter((pair) => pair.status !== status), `badges not labelled ${status}`).toEqual([]);
        tones.push(pairs[0].tone);
      }
      expect(new Set(tones).size, `each status should have its own badge tone: ${tones.join(', ')}`).toBe(CASES.statusBadges.statuses.length);
    });
  });
});
