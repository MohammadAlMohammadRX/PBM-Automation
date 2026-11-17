import { test, expect, NO_DIFF, matchesKeyword, resultDiff, stampOf, type WriterBItemsPage } from '../../../utils/lookup/writerBHelpers';
import type { TestSteps } from '../../../fixtures/testStatus.fixture';
import { readLookupItems } from '../../../utils/lookup/lookupApi';
import { HOME_LIST } from '../../../data/lookup/viewLookupItemList.data';
import { CASES, ERROR_TEXT, NO_MATCH_TERM, NO_RESULTS_MESSAGE, SPECIAL_TERM } from '../../../data/lookup/searchAndFilterLookupItems.data';

/**
 * User story 20856: Search and Filter Lookup Items - the toolbar search: a
 * keyword, a term matching nothing, special characters and a blank search.
 * The expected rows are GET Items filtered with the same term (see the data file).
 */

async function openItems(steps: TestSteps, items: WriterBItemsPage): Promise<void> {
  await steps.critical('Navigate to the Lookups Management module - the Lookup Items screen loads', async () => {
    await items.openList(HOME_LIST);
    await expect(items.searchBox(), 'the Lookup Items search box').toBeVisible();
    await items.expectRowsRendered();
  });
}

test.describe('US 20856 - Search and Filter Lookup Items (search)', () => {
  test.describe.configure({ timeout: 4 * 60_000 });

  test(`TC-${CASES.keyword.azureId}: should show only the matching items when a keyword matching an item's code or name is searched`, async ({
    page,
    steps,
    suiteLookupItems,
    itemsView,
  }) => {
    const own = await suiteLookupItems.create(HOME_LIST);
    const term = stampOf(own);
    await openItems(steps, itemsView);

    await steps.step(`Enter a keyword matching an item's Code or Name into Search ("${term}") - the grid filters to show only the matching items`, async () => {
      const expected = (await readLookupItems(page, HOME_LIST)).filter((i) => matchesKeyword(i, term));
      await itemsView.typeSearch(term);
      const shown = await itemsView.readResult(expected);
      expect({ diff: resultDiff(shown, expected), suiteItemShown: shown.some((r) => r.id === own.id) }, `search "${term}"`).toEqual({ diff: NO_DIFF, suiteItemShown: true });
    });
  });

  test(`TC-${CASES.noMatch.azureId}: should show an empty, clearly stated result when the search term matches nothing`, async ({ page, steps, itemsView }) => {
    await openItems(steps, itemsView);

    await steps.step(`Enter a keyword that does not match any Code, English Name or Arabic Name ("${NO_MATCH_TERM}") - the grid shows an empty, clearly stated no-matching-records message`, async () => {
      const expected = (await readLookupItems(page, HOME_LIST)).filter((i) => matchesKeyword(i, NO_MATCH_TERM));
      await itemsView.typeSearch(NO_MATCH_TERM);
      const shown = await itemsView.readResult(expected);
      expect(resultDiff(shown, expected), `search "${NO_MATCH_TERM}"`).toEqual(NO_DIFF);
      await expect(itemsView.emptyBlock(), 'the no-results state').toBeVisible();
      await expect(itemsView.emptyBlock(), 'the no-results message').toHaveText(NO_RESULTS_MESSAGE);
    });
  });

  test(`TC-${CASES.specialAndBlank.azureId}: should handle special characters and a blank search without errors`, async ({ page, steps, itemsView }) => {
    await openItems(steps, itemsView);

    await steps.step(`Enter a search term containing special characters such as %, * and < ("${SPECIAL_TERM}") - the grid either shows no matches or filters safely without an error`, async () => {
      const expected = (await readLookupItems(page, HOME_LIST)).filter((i) => matchesKeyword(i, SPECIAL_TERM));
      await itemsView.typeSearch(SPECIAL_TERM);
      const shown = await itemsView.readResult(expected);
      const toasts = await itemsView.readToasts();
      expect({ diff: resultDiff(shown, expected), errorToasts: toasts.filter((t) => ERROR_TEXT.test(t)) }, `search "${SPECIAL_TERM}"`).toEqual({ diff: NO_DIFF, errorToasts: [] });
      await expect(itemsView.table().or(itemsView.emptyBlock()).first(), 'the grid (or its empty state) is still drawn').toBeVisible();
    });

    await steps.step('Clear the search field and submit an empty search - the grid returns to showing all items', async () => {
      const all = await readLookupItems(page, HOME_LIST);
      await itemsView.typeSearch('');
      const shown = await itemsView.readResult(all);
      await expect(itemsView.searchBox(), 'the search box').toHaveValue('');
      expect(resultDiff(shown, all), 'the grid after a blank search against GET Items').toEqual(NO_DIFF);
    });
  });
});
