import { test, expect } from '../../../fixtures';
import { PLAN_COLUMN } from '../../../constants/ElementIds';
import { PROVISIONAL_PLAN_CODE } from '../../../data/plans/plan.data';
import { CASES } from '../../../data/plans/planDirectoryKpis.data';

/**
 * User story 14145: View plan directory with KPI tiles and filtering.
 * The directory's filters - by payer, type and status, combined with chips and
 * Clear All - and the quick search on English name, Arabic name and Plan Code.
 *
 * Plan Type is not a column of the table, so the type cases read the
 * `planTypeId` of the rows the list request answered.
 */
test.describe('US 14145 - Directory filters and quick search', () => {
  test(`TC-${CASES.typeFilter.azureId}: should list only plans of the chosen type when the type filter is applied`, async ({
    planManagementPage,
    planIn,
    steps,
  }) => {
    const data = CASES.typeFilter;
    await planIn('Draft', { type: data.typeCode });
    let items: Record<string, unknown>[] = [];

    await steps.critical('Navigate to the Plans Management module - the directory shows all plans', async () => {
      await planManagementPage.openList();
      await planManagementPage.expectRowsRendered();
    });

    await steps.step(`Choosing Type ${data.type} shows a ${data.type} filter chip`, async () => {
      items = await planManagementPage.captureListItems(() => planManagementPage.applyQuickFilter('type', data.type));
      expect((await planManagementPage.getChips()).join(' | '), `a ${data.type} chip`).toContain(data.type);
    });

    await steps.step(`Only ${data.type} plans are listed`, async () => {
      const wanted = await planManagementPage.planTypeIdFor(data.type);
      expect(items.length, `the case's own ${data.type} plan should be listed`).toBeGreaterThan(0);
      expect(items.filter((item) => String(item.planTypeId) !== wanted).map((item) => String(item.planNameEn)), `plans that are not ${data.type}`).toEqual([]);
    });
  });

  test(`TC-${CASES.statusFilter.azureId}: should list only plans in the chosen status when the status filter is applied`, async ({
    planManagementPage,
    steps,
  }) => {
    const data = CASES.statusFilter;

    await steps.critical('Navigate to the Plans Management module - the directory shows all plans', async () => {
      await planManagementPage.openList();
      await planManagementPage.expectRowsRendered();
    });

    await steps.step(`Choosing Status ${data.status} shows a ${data.status} filter chip`, async () => {
      await planManagementPage.applyQuickFilter('status', data.status);
      expect((await planManagementPage.getChips()).join(' | '), `a ${data.status} chip`).toContain(data.status);
    });

    await steps.step(`Only ${data.status} plans are listed`, async () => {
      await planManagementPage.expectRowsRendered();
      const statuses = await planManagementPage.readColumn(PLAN_COLUMN.status);
      expect(statuses.filter((status) => status !== data.status), `rows that are not ${data.status}`).toEqual([]);
    });
  });

  test(`TC-${CASES.payerFilter.azureId}: should list only the chosen payer's plans when the payer filter is applied`, async ({
    planManagementPage,
    steps,
  }) => {
    const data = CASES.payerFilter;

    await steps.critical('Navigate to the Plans Management module - the directory shows all plans', async () => {
      await planManagementPage.openList();
      await planManagementPage.expectRowsRendered();
    });

    await steps.step(`Choosing payer "${data.payer}" shows a filter chip for that payer`, async () => {
      await planManagementPage.filterByPayer(data.payer);
      expect((await planManagementPage.getChips()).join(' | '), `a "${data.payer}" chip`).toContain(data.payer);
    });

    await steps.step(`Only "${data.payer}" plans are listed`, async () => {
      const rows = await planManagementPage.getPlanRows();
      expect(rows.length, `"${data.payer}" holds the suite's plans`).toBeGreaterThan(0);
      expect(rows.filter((row) => row.payer !== data.payer).map((row) => `${row.name} (${row.payer})`), 'rows of another payer').toEqual([]);
    });
  });

  test(`TC-${CASES.combinedFilters.azureId}: should apply payer, type and status together and restore the full list when Clear All is used`, async ({
    planManagementPage,
    steps,
  }) => {
    const data = CASES.combinedFilters;
    let unfiltered = -1;
    let narrowed = -1;

    await steps.critical('Navigate to the Plans Management module - the directory shows all plans', async () => {
      unfiltered = await planManagementPage.captureListTotal(() => planManagementPage.openList());
      expect(unfiltered).toBeGreaterThan(0);
    });

    await steps.critical('Payer, type and status applied together show three chips and only plans matching all three', async () => {
      await planManagementPage.filterByPayer(data.payer);
      await planManagementPage.applyQuickFilter('type', data.type);
      let items: Record<string, unknown>[] = [];
      narrowed = await planManagementPage.captureListTotal(async () => {
        items = await planManagementPage.captureListItems(() => planManagementPage.applyQuickFilter('status', data.status));
      });
      const chips = (await planManagementPage.getChips()).join(' | ');
      expect(chips, 'the payer chip').toContain(data.payer);
      expect(chips, 'the type chip').toContain(data.type);
      expect(chips, 'the status chip').toContain(data.status);
      const typeId = await planManagementPage.planTypeIdFor(data.type);
      const rows = await planManagementPage.getPlanRows();
      expect(rows.filter((row) => row.payer !== data.payer || row.status !== data.status), 'rows outside the payer and status').toEqual([]);
      expect(items.filter((item) => String(item.planTypeId) !== typeId).length, `rows that are not ${data.type}`).toBe(0);
    });

    await steps.step('Removing the type chip leaves the payer and status filters applied', async () => {
      const total = await planManagementPage.captureListTotal(() => planManagementPage.removeChip(data.type));
      const chips = (await planManagementPage.getChips()).join(' | ');
      expect(chips, 'the type chip should be gone').not.toContain(data.type);
      expect(chips, 'the payer and status chips should remain').toContain(data.status);
      expect(total, 'dropping a criterion cannot narrow the list').toBeGreaterThanOrEqual(narrowed);
      const rows = await planManagementPage.getPlanRows();
      expect(rows.filter((row) => row.payer !== data.payer || row.status !== data.status), 'rows outside the two remaining filters').toEqual([]);
    });

    await steps.step('Clear All removes every chip and restores the unfiltered list', async () => {
      const total = await planManagementPage.captureListTotal(() => planManagementPage.clearAllChips());
      expect(await planManagementPage.getChips(), 'no chip should remain').toEqual([]);
      expect(total, 'the full directory should be listed again').toBe(unfiltered);
    });
  });

  test(`TC-${CASES.quickSearch.azureId}: should find the same plan by its English name, Arabic name and Plan Code when each is searched`, async ({
    planManagementPage,
    languageSwitcher,
    planIn,
    cleanup,
    steps,
  }) => {
    const plan = await planIn('Draft', { nameEn: CASES.quickSearch.nameEn() });
    cleanup.register(() => languageSwitcher.switchTo('en'));
    let code = '';

    await steps.critical('Navigate to the Plans Management module - the directory shows all plans', async () => {
      await planManagementPage.openList();
      await planManagementPage.expectRowsRendered();
    });

    await steps.critical('Searching the English name lists the plan', async () => {
      expect(await planManagementPage.isListed(plan.name), `"${plan.name}" should be found by its English name`).toBe(true);
      code = await planManagementPage.readCode(plan.name);
      expect(code, 'the plan should show its code').toMatch(PROVISIONAL_PLAN_CODE);
    });

    await steps.step('Switching the interface to Arabic lays it out right-to-left', async () => {
      await languageSwitcher.switchTo('ar');
      await languageSwitcher.expectRightToLeft();
    });

    await steps.step('Searching the Arabic name lists the same plan', async () => {
      expect(await planManagementPage.isListed(plan.nameAr), `"${plan.nameAr}" should be found by its Arabic name`).toBe(true);
    });

    await steps.step('Searching the Plan Code lists the same plan', async () => {
      expect(await planManagementPage.isListed(code), `${code} should be found by its code`).toBe(true);
    });
  });

  test(`TC-${CASES.noMatch.azureId}: should show an empty state and no error when the quick search matches no plan`, async ({
    planManagementPage,
    steps,
  }) => {
    const data = CASES.noMatch;
    const term = data.term();

    await steps.critical('Navigate to the Plans Management module - the directory shows all plans', async () => {
      await planManagementPage.openList();
      await planManagementPage.expectRowsRendered();
    });

    await steps.step('A term no plan carries narrows the list to nothing', async () => {
      const total = await planManagementPage.captureListTotal(() => planManagementPage.search(term));
      expect(total, `"${term}" should match no plan`).toBe(0);
    });

    await steps.step('The result is an empty-state message with zero rows, not an error', async () => {
      expect(await planManagementPage.getVisibleRowCount()).toBe(0);
      expect(await planManagementPage.getTableBodyText()).toMatch(data.empty);
      expect(await planManagementPage.waitForVisibleMessages(), 'no error should be reported').toEqual([]);
    });
  });
});
