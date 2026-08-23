import { test, expect } from '../../../fixtures';
import {
  KNOWN_PAYER,
  NO_MATCH_TERM,
  longSearchTerm,
} from '../../../data/payers/searchPayer.data';

/**
 * User story: Search Payers by Name or Code.
 * Clearing the search, and how the box handles boundary inputs.
 */
test.describe('Search Payers by Name or Code - Clearing & boundaries', () => {
  test('TC-020: should restore the full unfiltered list when the search input is cleared', async ({
    payerManagementPage,
  }) => {
    await payerManagementPage.open();
    const unfilteredPages = await payerManagementPage.getPageCount();

    await payerManagementPage.typeInSearch(KNOWN_PAYER.namePartial);
    await payerManagementPage.expectAllNamesContain(KNOWN_PAYER.namePartial);

    await payerManagementPage.clearSearchBox();

    // The complete list is back.
    await payerManagementPage.expectPageCount(unfilteredPages);
    await payerManagementPage.expectMixedPayerTypes();
  });

  test('TC-022: should handle an excessively long search term without error', async ({
    payerManagementPage,
  }) => {
    await payerManagementPage.open();
    const term = longSearchTerm();

    await payerManagementPage.typeInSearch(term);

    // Either the input is truncated or the term simply matches nothing - but the
    // page keeps working and shows a normal empty state.
    await payerManagementPage.expectEmptyState();
    const entered = await payerManagementPage.getSearchBoxValue();
    expect(entered.length, 'the search box should not exceed the term length').toBeLessThanOrEqual(
      term.length,
    );

    // And the list recovers once the term is cleared.
    await payerManagementPage.clearSearchBox();
    await payerManagementPage.expectResultsFound();
  });

  test('TC-023: should show a no-matching-results message when the search term matches nothing', async ({
    payerManagementPage,
  }) => {
    await payerManagementPage.open();

    await payerManagementPage.typeInSearch(NO_MATCH_TERM);

    // A clear empty state, not an error or a stale list.
    await payerManagementPage.expectEmptyState();
  });
});
