import { test, expect } from '../../../fixtures';
import { NETWORK_COLUMN } from '../../../constants/ElementIds';
import { isGrouped, isSorted } from '../../../utils/SortUtils';
import { NETWORK_MESSAGE } from '../../../data/networks/network.data';
import { CASES, REQUIRED_OPTIONS, SORT_OPTIONS, expectedSortBy } from '../../../data/networks/sortDirectory.data';

/**
 * User story 14123: Sort network directory by columns.
 * How the Sort By menu behaves: on an empty list, with ties, in Arabic, in
 * sequence, together with a filter, under exploratory use, and its checklist.
 */
test.describe('US 14123 - Sort By menu behaviour', () => {
  test(`TC-${CASES.emptyList.azureId}: should open and apply a sort without error when the directory is empty`, async ({
    networkManagementPage,
    steps,
  }) => {
    const data = CASES.emptyList;

    await steps.critical('Navigate to the module with a search matching nothing - the empty state shows', async () => {
      await networkManagementPage.openList();
      const total = await networkManagementPage.captureListTotal(() => networkManagementPage.search(data.term));
      expect(total).toBe(0);
    });

    await steps.step('The Sort By menu opens and lists every option', async () => {
      expect(await networkManagementPage.getSortOptions()).toEqual(SORT_OPTIONS);
    });

    await steps.step('Choosing Network Name ascending applies cleanly and the empty state remains', async () => {
      const sortBy = await networkManagementPage.sortBy('name', 'asc');
      expect(sortBy.toLowerCase()).toBe(expectedSortBy('name', 'asc'));
      expect(await networkManagementPage.getTableBodyText()).toContain(NETWORK_MESSAGE.noNetworksFound);
    });
  });

  test(`TC-${CASES.ties.azureId}: should group tied values and order them identically when the same sort is repeated`, async ({
    networkManagementPage,
    steps,
  }) => {
    await steps.critical('Navigate to the Network Management module - the directory loads', async () => {
      await networkManagementPage.openList();
      await networkManagementPage.expectRowsRendered();
    });

    await steps.step('Status ascending groups tied statuses together, in the same order every time', async () => {
      await networkManagementPage.sortBy('status', 'asc');
      const first = await networkManagementPage.readColumn(NETWORK_COLUMN.networkName);
      expect(isGrouped(await networkManagementPage.readColumn(NETWORK_COLUMN.status)), 'tied statuses should sit together').toBe(true);
      await networkManagementPage.sortBy('name', 'asc');
      await networkManagementPage.sortBy('status', 'asc');
      expect(await networkManagementPage.readColumn(NETWORK_COLUMN.networkName), 'repeating the sort must not reshuffle ties').toEqual(first);
    });

    await steps.step('Effective Date ascending groups tied dates together, in the same order every time', async () => {
      await networkManagementPage.sortBy('effectiveDate', 'asc');
      const first = await networkManagementPage.readColumn(NETWORK_COLUMN.networkName);
      expect(isGrouped(await networkManagementPage.readColumn(NETWORK_COLUMN.effectiveDate))).toBe(true);
      await networkManagementPage.sortBy('name', 'desc');
      await networkManagementPage.sortBy('effectiveDate', 'asc');
      expect(await networkManagementPage.readColumn(NETWORK_COLUMN.networkName)).toEqual(first);
    });
  });

  test(`TC-${CASES.bilingual.azureId}: should sort names by the English name in English and by the Arabic name in Arabic`, async ({
    networkManagementPage,
    languageSwitcher,
    cleanup,
    steps,
  }) => {
    cleanup.register(() => languageSwitcher.switchTo('en'));

    await steps.critical('Navigate to the Network Management module - the directory loads', async () => {
      await networkManagementPage.openList();
      await languageSwitcher.switchTo('en');
    });

    await steps.step('In English, Network Name ascending orders the English names alphabetically', async () => {
      const sortBy = await networkManagementPage.sortBy('name', 'asc');
      expect(sortBy.toLowerCase()).toBe(expectedSortBy('name', 'asc'));
      const names = await networkManagementPage.readColumn(NETWORK_COLUMN.networkName);
      expect(isSorted(names, 'asc'), `English names should ascend: ${names.join(' | ')}`).toBe(true);
    });

    await steps.step('In Arabic, Network Name ascending orders the Arabic names alphabetically', async () => {
      await languageSwitcher.switchTo('ar');
      await networkManagementPage.openList();
      const sortBy = await networkManagementPage.sortBy('name', 'asc');
      expect(sortBy.toLowerCase(), 'the Arabic interface should sort by the Arabic name').toContain('networknamear');
      const names = await networkManagementPage.readColumn(NETWORK_COLUMN.networkName);
      expect(isSorted(names, 'asc'), `Arabic names should ascend: ${names.join(' | ')}`).toBe(true);
    });
  });

  test(`TC-${CASES.sequential.azureId}: should replace the previous order each time and mark the active option when sorts are chosen in sequence`, async ({
    networkManagementPage,
    steps,
  }) => {
    const path = CASES.sequential.path;

    await steps.critical('Navigate to the module - the directory loads Newest to Oldest', async () => {
      expect((await networkManagementPage.captureDefaultSort()).toLowerCase()).toBe(expectedSortBy('createdOn', 'desc'));
    });

    for (const choice of path) {
      await steps.step(`${choice.label} replaces the previous order`, async () => {
        const sortBy = await networkManagementPage.sortBy(choice.column, choice.direction);
        expect(sortBy.toLowerCase()).toBe(expectedSortBy(choice.column, choice.direction));
      });
    }

    await steps.step('Reopening the menu shows Effective Date ascending as the selected option', async () => {
      expect(await networkManagementPage.getActiveSortOption()).toBe(path[path.length - 1].label);
    });
  });

  test(`TC-${CASES.withFilter.azureId}: should sort within the filtered set and keep the sort when the filter is cleared`, async ({
    networkManagementPage,
    steps,
  }) => {
    const data = CASES.withFilter;

    await steps.critical('Navigate to the module and filter by Status Active', async () => {
      await networkManagementPage.openList();
      await networkManagementPage.applyQuickFilter('status', data.status);
      expect((await networkManagementPage.readColumn(NETWORK_COLUMN.status)).filter((s) => s !== data.status)).toEqual([]);
    });

    await steps.step('Network Name ascending reorders only the Active networks', async () => {
      await networkManagementPage.sortBy('name', 'asc');
      const names = await networkManagementPage.readColumn(NETWORK_COLUMN.networkName);
      expect(isSorted(names, 'asc')).toBe(true);
      expect((await networkManagementPage.readColumn(NETWORK_COLUMN.status)).filter((s) => s !== data.status)).toEqual([]);
    });

    await steps.step('Clearing the filter brings back the full list, still sorted by name', async () => {
      const request = await networkManagementPage.captureQuickFilterRequest('status', data.allStatuses);
      expect(String(request.sortBy ?? '').toLowerCase(), 'the chosen sort should persist').toBe(expectedSortBy('name', 'asc'));
      expect(isSorted(await networkManagementPage.readColumn(NETWORK_COLUMN.networkName), 'asc')).toBe(true);
    });
  });

  test(`TC-${CASES.checklist.azureId}: should offer ascending and descending for all six columns plus both creation orders when the menu opens`, async ({
    networkManagementPage,
    steps,
  }) => {
    let options: string[] = [];

    await steps.critical('Navigate to the module and open the Sort By menu', async () => {
      await networkManagementPage.openList();
      options = await networkManagementPage.getSortOptions();
      expect(options.length).toBeGreaterThan(0);
    });

    await steps.step('Each of the six columns has an ascending and a descending entry', async () => {
      const columnOptions = REQUIRED_OPTIONS.filter((o) => o.includes('('));
      expect(columnOptions.filter((required) => !options.includes(required)), 'missing column options').toEqual([]);
    });

    await steps.step('Newest to Oldest and Oldest to Newest are both present and distinct', async () => {
      const orders = REQUIRED_OPTIONS.filter((o) => !o.includes('('));
      expect(orders.filter((required) => !options.some((o) => o.includes(required))), 'missing creation orders').toEqual([]);
    });
  });
});
