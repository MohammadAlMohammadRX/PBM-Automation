import { test, expect } from '../../../fixtures';
import { NETWORK_COLUMN } from '../../../constants/ElementIds';
import { isSorted } from '../../../utils/SortUtils';
import {
  CASES,
  COLUMN_CASES,
  COLUMN_WORDS,
  createdOnKeys,
  dateKey,
  expectedSortBy,
  sortKeys,
} from '../../../data/networks/sortDirectory.data';

/**
 * User story 14123: Sort network directory by columns.
 * The default order and each column's ascending and descending sort.
 *
 * Every sort is checked twice over: the `sortBy` the list asked the server for,
 * and the order the first page actually renders.
 */
test.describe('US 14123 - Sort by column', () => {
  test(`TC-${CASES.defaultOrder.azureId}: should list the newest network first when the directory loads without a chosen sort`, async ({
    networkManagementPage,
    networkIn,
    steps,
  }) => {
    const newest = await networkIn('Draft');
    let items: Record<string, unknown>[] = [];

    await steps.critical('Navigate to the Network Management module - the directory loads', async () => {
      expect((await networkManagementPage.captureDefaultSort()).toLowerCase()).toBe(expectedSortBy('createdOn', 'desc'));
    });

    await steps.step('The list is shown in its default order with the newest network on top', async () => {
      items = await networkManagementPage.reloadAndCaptureItems();
      const names = await networkManagementPage.readColumn(NETWORK_COLUMN.networkName);
      expect(names[0], 'the network created last should be first').toBe(newest.name);
    });

    await steps.step('Creation dates run from the most recent to the oldest', async () => {
      expect(isSorted(createdOnKeys(items), 'desc'), 'creation dates should descend down the page').toBe(true);
    });
  });

  for (const sortCase of COLUMN_CASES) {
    const words = COLUMN_WORDS[sortCase.column];
    test(`TC-${sortCase.azureId}: should reorder the directory by ${words} in both directions when ${words} ascending and descending are chosen`, async ({
      networkManagementPage,
      steps,
    }) => {
      await steps.critical('Navigate to the Network Management module - the directory loads', async () => {
        await networkManagementPage.openList();
        await networkManagementPage.expectRowsRendered();
      });

      await steps.step(`The Sort By menu offers ${words} ascending and descending`, async () => {
        const options = await networkManagementPage.getSortOptions();
        expect(options.filter((option) => option.startsWith(words)), `${words} options`).toHaveLength(2);
      });

      await steps.step(`${words} ascending puts the list in ascending order`, async () => {
        const sortBy = await networkManagementPage.sortBy(sortCase.column, 'asc');
        expect(sortBy.toLowerCase()).toBe(expectedSortBy(sortCase.column, 'asc'));
        const values = sortKeys(await networkManagementPage.readColumn(sortCase.cell), sortCase.kind);
        expect(isSorted(values, 'asc'), `${words} should ascend: ${values.join(' | ')}`).toBe(true);
      });

      await steps.step(`${words} descending puts the list in descending order`, async () => {
        const sortBy = await networkManagementPage.sortBy(sortCase.column, 'desc');
        expect(sortBy.toLowerCase()).toBe(expectedSortBy(sortCase.column, 'desc'));
        const values = sortKeys(await networkManagementPage.readColumn(sortCase.cell), sortCase.kind);
        expect(isSorted(values, 'desc'), `${words} should descend: ${values.join(' | ')}`).toBe(true);
      });
    });
  }

  test(`TC-${CASES.creation.azureId}: should reorder by creation date both ways when Oldest to Newest and Newest to Oldest are chosen`, async ({
    networkManagementPage,
    steps,
  }) => {
    await steps.critical('Navigate to the Network Management module - the directory loads', async () => {
      await networkManagementPage.openList();
    });

    await steps.step('The menu offers Newest to Oldest and Oldest to Newest', async () => {
      const options = await networkManagementPage.getSortOptions();
      expect(options.some((o) => o.includes('Newest to Oldest'))).toBe(true);
      expect(options.some((o) => o.includes('Oldest to Newest'))).toBe(true);
    });

    await steps.step('Oldest to Newest puts the earliest-created network first', async () => {
      const result = await networkManagementPage.sortByAndCaptureItems('createdOn', 'asc');
      expect(result.sortBy.toLowerCase()).toBe(expectedSortBy('createdOn', 'asc'));
      expect(isSorted(createdOnKeys(result.items), 'asc')).toBe(true);
    });

    await steps.step('Newest to Oldest puts the most recently created network first', async () => {
      const result = await networkManagementPage.sortByAndCaptureItems('createdOn', 'desc');
      expect(result.sortBy.toLowerCase()).toBe(expectedSortBy('createdOn', 'desc'));
      expect(isSorted(createdOnKeys(result.items), 'desc')).toBe(true);
    });
  });

  test(`TC-${CASES.adminReview.azureId}: should surface the networks nearest expiry first when the administrator sorts by Expiry Date ascending`, async ({
    networkManagementPage,
    steps,
  }) => {
    await steps.critical('Navigate to the module - the directory loads in its default order', async () => {
      expect((await networkManagementPage.captureDefaultSort()).toLowerCase()).toBe(expectedSortBy('createdOn', 'desc'));
    });

    await steps.step('The Sort By menu shows the available options', async () => {
      expect((await networkManagementPage.getSortOptions()).length).toBeGreaterThan(0);
    });

    await steps.step('Expiry Date ascending brings the nearest expiry dates to the top', async () => {
      await networkManagementPage.sortBy('expiryDate', 'asc');
      const expiry = (await networkManagementPage.readColumn(NETWORK_COLUMN.expiryDate)).map(dateKey);
      expect(isSorted(expiry, 'asc'), `expiry dates should ascend: ${expiry.join(' | ')}`).toBe(true);
    });

    await steps.step('The top record is the one needing attention first', async () => {
      const expiry = (await networkManagementPage.readColumn(NETWORK_COLUMN.expiryDate)).map(dateKey);
      expect(expiry[0] <= expiry[expiry.length - 1], 'the first row should expire no later than the last').toBe(true);
    });
  });
});
