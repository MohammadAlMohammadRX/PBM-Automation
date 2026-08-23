import { test } from '../../../fixtures';
import {
  EMPTY_RESULT_COMBINATION,
  INVALID_URL_FILTERS,
} from '../../../data/payers/filterPayer.data';

/**
 * User story: Filter Payer List by Type and Status.
 * Empty results, and robustness against unsupported filter values.
 */
test.describe('Filter Payer List by Type and Status - Empty state & URL handling', () => {
  test('TC-009: should show a no-results empty state when the filter combination matches no payers', async ({
    payerManagementPage,
  }) => {
    await payerManagementPage.open();

    await payerManagementPage.filterByType(EMPTY_RESULT_COMBINATION.type);
    await payerManagementPage.filterByStatus(EMPTY_RESULT_COMBINATION.status);

    // A clear empty state - not an error, stale data, or a blank screen.
    await payerManagementPage.expectEmptyState();
  });

  test('TC-013: should ignore unsupported filter values supplied through the URL without breaking the page', async ({
    payerManagementPage,
  }) => {
    await payerManagementPage.openWithQuery(INVALID_URL_FILTERS);

    // The page still renders and falls back to the unfiltered list; no crash and
    // no partially-filtered data.
    await payerManagementPage.expectFiltersAtDefault();
    await payerManagementPage.expectMixedPayerTypes();
  });

  test('TC-014: should update the result count, recalculate pagination and reset to page one when a filter is applied', async ({
    payerManagementPage,
  }) => {
    await payerManagementPage.open();
    const unfilteredPages = await payerManagementPage.getPageCount();

    // Move off page one so the reset is observable.
    await payerManagementPage.goToPage(2);
    await payerManagementPage.expectNotOnFirstPage();

    await payerManagementPage.filterByType('Private');
    await payerManagementPage.filterByStatus('Active');

    // Pagination recalculates to a smaller set and the view returns to page one.
    await payerManagementPage.expectOnFirstPage();
    await payerManagementPage.expectFewerPagesThan(unfilteredPages);
  });
});
