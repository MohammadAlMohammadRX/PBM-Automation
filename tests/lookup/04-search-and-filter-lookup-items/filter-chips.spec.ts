import {
  test,
  expect,
  NO_DIFF,
  chipProblems,
  matchesFilters,
  resultDiff,
  runFilterSequence,
  stampOf,
  type WriterBItemsPage,
} from '../../../utils/lookup/writerBHelpers';
import type { TestSteps } from '../../../fixtures/testStatus.fixture';
import type { ItemFilters } from '../../../constants/lookup/writerBIds';
import { readLookupItems } from '../../../utils/lookup/lookupApi';
import { HOME_LIST } from '../../../data/lookup/viewLookupItemList.data';
import { CASES, OPTION, RAPID_SEQUENCE } from '../../../data/lookup/searchAndFilterLookupItems.data';

/**
 * User story 20856: Search and Filter Lookup Items - the applied-filter chips
 * (one removable chip per filter, removing one re-filters the grid) and the
 * exploratory rapid sequence. Chip ids are INFERRED (constants/lookup/writerBIds.ts).
 */

async function openItems(steps: TestSteps, items: WriterBItemsPage): Promise<void> {
  await steps.critical('Navigate to the Lookups Management module - the Lookup Items screen loads', async () => {
    await items.openList(HOME_LIST);
    await expect(items.searchBox(), 'the Lookup Items search box').toBeVisible();
    await items.expectRowsRendered();
  });
}

test.describe('US 20856 - Search and Filter Lookup Items (chips)', () => {
  test.describe.configure({ timeout: 5 * 60_000 });

  test(`TC-${CASES.chips.azureId}: should show one removable chip for each applied filter when Code and Active status are applied`, async ({ steps, suiteLookupItems, itemsView }) => {
    const own = await suiteLookupItems.create(HOME_LIST);
    const filters: ItemFilters = { code: own.code, status: OPTION.active };
    await openItems(steps, itemsView);

    await steps.step(`Open Advance Search and apply filters for Code (${own.code}) and Active status - a removable chip appears for each applied filter (Code and Active status)`, async () => {
      await itemsView.advancedSearch(filters);
      await expect.poll(async () => chipProblems(await itemsView.readChips(), filters), { message: `chips for ${JSON.stringify(filters)}` }).toEqual([]);
    });
  });

  test(`TC-${CASES.removeChip.azureId}: should drop a filter and refresh the grid when its chip is removed`, async ({ page, steps, suiteLookupItems, itemsView }) => {
    const own = await suiteLookupItems.create(HOME_LIST);
    const both: ItemFilters = { code: own.code, predefined: OPTION.no };
    const remaining: ItemFilters = { predefined: OPTION.no };
    await openItems(steps, itemsView);

    await steps.step(`Apply two filters, Code (${own.code}) and Predefined (No) - two chips appear and the grid shows the narrowed results`, async () => {
      const expected = (await readLookupItems(page, HOME_LIST)).filter((i) => matchesFilters(i, both));
      await itemsView.advancedSearch(both);
      const shown = await itemsView.readResult(expected);
      expect({ chips: chipProblems(await itemsView.readChips(), both), diff: resultDiff(shown, expected) }, `filters ${JSON.stringify(both)}`).toEqual({ chips: [], diff: NO_DIFF });
    });

    await steps.step('Click the remove control on one chip (Code) - that chip disappears and the grid refreshes to reflect only the remaining filter', async () => {
      const expected = (await readLookupItems(page, HOME_LIST)).filter((i) => matchesFilters(i, remaining));
      const removed = await itemsView.removeChipFor(own.code);
      const shown = await itemsView.readResult(expected);
      expect({ removedChip: removed !== '', chips: chipProblems(await itemsView.readChips(), remaining), diff: resultDiff(shown, expected) }, `after removing the Code chip; left ${JSON.stringify(remaining)}`).toEqual({
        removedChip: true,
        chips: [],
        diff: NO_DIFF,
      });
    });
  });

  test(`TC-${CASES.rapid.azureId}: should keep the grid and the chips in step with the filters when search and filters are changed rapidly`, async ({ page, steps, suiteLookupItems, itemsView }) => {
    const active = await suiteLookupItems.create(HOME_LIST);
    await suiteLookupItems.create(HOME_LIST, { isActive: false });
    const filter: ItemFilters = { status: OPTION.active };
    await openItems(steps, itemsView);

    await steps.step('Enter a search term, then apply an Advance Search filter (Active), then remove the search term while keeping the filter - the grid updates correctly to show only the filter\'s matches', async () => {
      await itemsView.typeSearch(stampOf(active));
      await itemsView.advancedSearch(filter);
      await itemsView.typeSearch('');
      const expected = (await readLookupItems(page, HOME_LIST)).filter((i) => matchesFilters(i, filter));
      const shown = await itemsView.readResult(expected);
      expect({ diff: resultDiff(shown, expected), chips: chipProblems(await itemsView.readChips(), filter) }, `search "${stampOf(active)}" then status Active, then the search cleared`).toEqual({ diff: NO_DIFF, chips: [] });
    });

    await steps.step('Rapidly toggle the Active/Inactive and Predefined filters on and off - the grid and filter chips stay in sync with the currently selected filters at each step', async () => {
      const all = await readLookupItems(page, HOME_LIST);
      const problems = await runFilterSequence(itemsView, all, filter, RAPID_SEQUENCE);
      expect(problems, `the sequence ${JSON.stringify(RAPID_SEQUENCE)}`).toEqual([]);
    });
  });
});
