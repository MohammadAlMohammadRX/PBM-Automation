import { test, expect } from '../../../fixtures';
import { PLAN_COLUMN } from '../../../constants/ElementIds';
import { isSorted } from '../../../utils/SortUtils';
import {
  CASES,
  DEFAULT_SORT,
  ITEM_FIELD,
  expectedSortBy,
  mixedNameDataset,
} from '../../../data/plans/sortPlanDirectory.data';

/**
 * User story 14161: Sort plan directory by attribute.
 * How a chosen sort BEHAVES - kept through a filter, never moving the KPI
 * tiles, chained one after another, on an empty directory, with unusual
 * names, and only for a role that may see the directory.
 */
test.describe('US 14161 - Sort behaviour', () => {
  test(`TC-${CASES.persistsThroughFilter.azureId}: should keep the chosen Plan Code order when a status filter is then applied`, async ({
    planManagementPage,
    steps,
  }) => {
    const data = CASES.persistsThroughFilter;
    let request: Record<string, unknown> = {};

    await steps.critical('Navigate to the Plans Management module - the plan directory is visible', async () => {
      await planManagementPage.openList();
      await planManagementPage.expectRowsRendered();
    });

    await steps.critical('Plan Code ascending reloads the list sorted by plan code', async () => {
      expect((await planManagementPage.sortBy(data.column, 'asc')).toLowerCase()).toBe(expectedSortBy(data.column, 'asc'));
      expect(isSorted(await planManagementPage.readColumn(data.cell), 'asc')).toBe(true);
    });

    await steps.step(`Applying Status ${data.status} shows the filtered list`, async () => {
      request = await planManagementPage.captureListRequest(() => planManagementPage.applyQuickFilter('status', data.status));
      const statuses = await planManagementPage.readColumn(PLAN_COLUMN.status);
      expect(statuses.length).toBeGreaterThan(0);
      expect(statuses.filter((status) => status !== data.status), 'rows outside the filter').toEqual([]);
    });

    await steps.step('The filtered results are still sorted by Plan Code ascending', async () => {
      expect(String(request.sortBy ?? '').toLowerCase(), 'the filter request should keep the chosen sort').toBe(expectedSortBy(data.column, 'asc'));
      const codes = await planManagementPage.readColumn(data.cell);
      expect(isSorted(codes, 'asc'), `codes should still ascend: ${codes.join(' | ')}`).toBe(true);
    });
  });

  test(`TC-${CASES.kpisUnchanged.azureId}: should leave every KPI counter unchanged when each sort option is applied in turn`, async ({
    planManagementPage,
    steps,
  }) => {
    const sorts = CASES.kpisUnchanged.sorts;
    let before: Record<string, number> = {};
    const after: { sort: string; kpis: Record<string, number> }[] = [];

    await steps.critical('Navigate to the Plans Management module - the list and KPI counters are visible', async () => {
      await planManagementPage.openList();
      expect(await planManagementPage.isKpiBandVisible()).toBe(true);
    });

    await steps.critical('The KPI counter values are recorded', async () => {
      before = await planManagementPage.readKpis();
      expect(before.total).toBeGreaterThan(0);
    });

    await steps.step('Each sort option in turn reorders the list', async () => {
      for (const sort of sorts) {
        const sortBy = await planManagementPage.sortBy(sort.column, sort.direction);
        expect(sortBy.toLowerCase(), `${sort.column} ${sort.direction}`).toBe(expectedSortBy(sort.column, sort.direction));
        after.push({ sort: `${sort.column} ${sort.direction}`, kpis: await planManagementPage.readKpis() });
      }
      expect(after).toHaveLength(sorts.length);
    });

    await steps.step('The KPI counters are the same after every sort change', async () => {
      expect(after.filter((entry) => JSON.stringify(entry.kpis) !== JSON.stringify(before)).map((entry) => entry.sort), 'sorts that changed the KPIs').toEqual([]);
    });
  });

  test(`TC-${CASES.successive.azureId}: should reorder correctly at each step when name, status and Newest to Oldest are chosen in succession`, async ({
    planManagementPage,
    steps,
  }) => {
    await steps.critical('Navigate to the Plans Management module - the list shows in its default order', async () => {
      expect((await planManagementPage.captureDefaultSort()).toLowerCase()).toBe(DEFAULT_SORT);
    });

    const { byName, byStatus, newest } = CASES.successive;

    await steps.step('Plan Name ascending reorders the list by name ascending', async () => {
      expect((await planManagementPage.sortBy(byName.column, byName.direction)).toLowerCase()).toBe(expectedSortBy(byName.column, byName.direction));
      expect(isSorted(await planManagementPage.readColumn(byName.cell), byName.direction)).toBe(true);
    });

    await steps.step('Status descending reorders the list by status descending', async () => {
      expect((await planManagementPage.sortBy(byStatus.column, byStatus.direction)).toLowerCase()).toBe(expectedSortBy(byStatus.column, byStatus.direction));
      expect(isSorted(await planManagementPage.readColumn(byStatus.cell), byStatus.direction)).toBe(true);
    });

    await steps.step('Newest to Oldest restores the default creation-date order', async () => {
      const result = await planManagementPage.sortByAndCaptureItems(newest.column, newest.direction);
      expect(result.sortBy.toLowerCase()).toBe(DEFAULT_SORT);
      expect(isSorted(result.items.map((item) => String(item[ITEM_FIELD.createdOn] ?? '')), 'desc'), 'creation dates should descend').toBe(true);
    });
  });

  test(`TC-${CASES.emptyDirectory.azureId}: should apply a sort without error and keep the empty state when no plan is listed`, async ({
    planManagementPage,
    steps,
  }) => {
    const data = CASES.emptyDirectory;

    await steps.critical('Navigate to the Plans Management module', async () => {
      await planManagementPage.openList();
      await planManagementPage.expectRowsRendered();
    });

    await steps.critical('A filter matching no plan shows the empty-state message', async () => {
      expect(await planManagementPage.captureListTotal(() => planManagementPage.search(data.term()))).toBe(0);
      expect(await planManagementPage.getTableBodyText()).toMatch(data.empty);
    });

    await steps.step('Choosing a sort option applies it without error and keeps the empty state', async () => {
      expect((await planManagementPage.sortBy(data.column, 'asc')).toLowerCase()).toBe(expectedSortBy(data.column, 'asc'));
      expect(await planManagementPage.getTableBodyText()).toMatch(data.empty);
      expect(await planManagementPage.waitForVisibleMessages(), 'no error should be reported').toEqual([]);
    });
  });

  test(`TC-${CASES.authorized.azureId}: should offer the Sort By menu only to a role that may see the plan directory when users with and without that right open it`, async ({
    planManagementPage,
    shapedNonAdmin,
    requireBaseline,
    steps,
  }) => {
    const data = CASES.authorized;
    const session = await shapedNonAdmin({ without: data.permissions });

    await steps.critical('A user without plan directory permissions is restricted from the directory and its sort', async () => {
      await planManagementPage.openList();
      requireBaseline(await planManagementPage.isSortOffered(), 'the Sort By menu for a session holding the plan read rights');
      const access = await session.plans.readListAccess();
      expect(access.table, 'the plan list must not render').toBe(false);
      expect(await session.plans.isSortOffered(), 'the Sort By menu must not be offered').toBe(false);
    });

    await steps.step('A Plan Administrator sees the plan directory and the Sort By menu', async () => {
      await planManagementPage.openList();
      await planManagementPage.expectRowsRendered();
      expect(await planManagementPage.isSortOffered()).toBe(true);
    });

    await steps.step('Status ascending reorders the list for the administrator', async () => {
      expect((await planManagementPage.sortBy(data.column, 'asc')).toLowerCase()).toBe(expectedSortBy(data.column, 'asc'));
      expect(isSorted(await planManagementPage.readColumn(data.cell), 'asc')).toBe(true);
    });
  });

  test(`TC-${CASES.mixedNames.azureId}: should order numeric, special-character and bilingual plan names predictably when Plan Name ascending is chosen`, async ({
    planManagementPage,
    planIn,
    steps,
  }) => {
    const dataset = mixedNameDataset();
    for (const plan of dataset.plans) await planIn('Draft', { ...plan, noFormulary: true });

    await steps.critical('Navigate to the Plans Management module - the case\'s plans are listed', async () => {
      await planManagementPage.openList();
      await planManagementPage.search(dataset.stamp);
      expect(await planManagementPage.getVisibleRowCount()).toBe(dataset.plans.length);
    });

    await steps.step('Plan Name ascending reorders the list', async () => {
      expect((await planManagementPage.sortBy(CASES.mixedNames.column, 'asc')).toLowerCase()).toBe(expectedSortBy(CASES.mixedNames.column, 'asc'));
    });

    await steps.step('The mixed names are ordered predictably and every one is still shown', async () => {
      const names = await planManagementPage.readColumn(CASES.mixedNames.cell);
      expect([...names].sort(), 'every plan, exactly once').toEqual(dataset.plans.map((plan) => plan.nameEn).sort());
      expect(isSorted(names, 'asc'), `names should ascend: ${names.join(' | ')}`).toBe(true);
    });
  });
});
