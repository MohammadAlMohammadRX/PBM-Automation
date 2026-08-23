import { test } from '../../../fixtures';
import { KNOWN_PAYER } from '../../../data/payers/searchPayer.data';
import { COMBINED_CONTEXT } from '../../../data/payers/sortPayer.data';

/**
 * User story: Sort Payer List by Column Headers.
 * Business use case, sorting combined with filter/search, and the UI checklist.
 */
test.describe('Sort Payer List by Column Headers - Use case, combined state and checklist', () => {
  test('TC-041: should let the administrator group payers by Status in either interface language', async ({
    payerManagementPage,
  }) => {
    await payerManagementPage.open();

    // English: sorting by Status brings each status - Expired included - together
    // in one block, which is how the administrator spots renewals.
    await payerManagementPage.sortBy('status', 'asc');
    await payerManagementPage.expectColumnSorted('status', 'asc');
    await payerManagementPage.expectSortIndicator('status', 'asc');

    await payerManagementPage.sortBy('status', 'desc');
    await payerManagementPage.expectColumnSorted('status', 'desc');
    await payerManagementPage.expectSortIndicator('status', 'desc');

    // Arabic: the same grouping must hold, with the menu and indicator localized
    // and the ordering following the active language's collation.
    await payerManagementPage.language().switchTo('ar');
    await payerManagementPage.language().expectRightToLeft();

    await payerManagementPage.sortBy('status', 'asc');
    await payerManagementPage.expectColumnSorted('status', 'asc');
    await payerManagementPage.expectSortIndicator('status', 'asc', 'ar');
  });

  test('TC-043: should keep filter and search applied while sorting the narrowed result set', async ({
    payerManagementPage,
  }) => {
    await payerManagementPage.open();

    await payerManagementPage.filterByType(COMBINED_CONTEXT.type);
    await payerManagementPage.filterByStatus(COMBINED_CONTEXT.status);
    await payerManagementPage.typeInSearch(KNOWN_PAYER.namePartial);

    const { column, direction } = COMBINED_CONTEXT.sort;
    await payerManagementPage.sortBy(column, direction);

    // The sort applies to the narrowed subset, and neither the filter nor the
    // search is dropped by sorting.
    await payerManagementPage.expectSortedSubsetConsistent(column, direction);
    await payerManagementPage.expectSortIndicator(column, direction);
    await payerManagementPage.expectFiltersApplied(COMBINED_CONTEXT.type, COMBINED_CONTEXT.status);
    await payerManagementPage.expectSearchTerm(KNOWN_PAYER.namePartial);

    // Designed refresh behaviour: filter, search and sort all reset to their
    // defaults, and the list re-renders consistently.
    await payerManagementPage.expectListStateAfterReload();
  });

  test('TC-044: should offer all seven columns in both directions with an accurate sort indicator', async ({
    payerManagementPage,
  }) => {
    await payerManagementPage.open();

    // Checklist: the trigger, then all 7 columns x 2 directions, in menu order.
    await payerManagementPage.expectSortMenuComplete();

    // The indicator names the column and direction actually in effect.
    await payerManagementPage.sortBy('email', 'desc');
    await payerManagementPage.expectSortIndicator('email', 'desc');
    await payerManagementPage.sortMenu().expectSingleActiveOption();
  });
});
