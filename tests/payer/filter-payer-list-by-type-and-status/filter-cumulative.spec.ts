import { test } from '../../../fixtures';
import { FILTER_COMBINATIONS } from '../../../data/payers/filterPayer.data';

/**
 * User story: Filter Payer List by Type and Status.
 * The two filters must combine with AND logic, never OR.
 */
test.describe('Filter Payer List by Type and Status - Cumulative filtering', () => {
  // TC-004: one iteration per decision-table combination.
  for (const combination of FILTER_COMBINATIONS) {
    test(`TC-004: should list only payers matching both criteria when Payer Type is ${combination.type} and Status is ${combination.status}`, async ({
      payerManagementPage,
    }) => {
      await payerManagementPage.open();

      await payerManagementPage.filterByType(combination.type);
      await payerManagementPage.filterByStatus(combination.status);

      // Rows must satisfy BOTH criteria - or the list is legitimately empty.
      await payerManagementPage.expectCombinedFilterOutcome(combination.type, combination.status);
    });
  }

  test('TC-008: should narrow the list to active government payers and restore the full list when the filters are cleared', async ({
    payerManagementPage,
  }) => {
    await payerManagementPage.open();
    const unfilteredPages = await payerManagementPage.getPageCount();

    // The administrator narrows the list for a compliance review.
    await payerManagementPage.filterByType('Government');
    await payerManagementPage.filterByStatus('Active');
    await payerManagementPage.expectCombinedFilterOutcome('Government', 'Active');

    // ...and can return to the full list afterwards without error.
    await payerManagementPage.resetFilters();
    await payerManagementPage.expectPageCount(unfilteredPages);
  });
});
