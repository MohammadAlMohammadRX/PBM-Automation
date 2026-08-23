import { test } from '../../../fixtures';
import { TYPE_TRANSITION_SEQUENCE } from '../../../data/payers/filterPayer.data';

/**
 * User story: Filter Payer List by Type and Status.
 * Resetting filters, moving between filter states, and rapid toggling.
 */
test.describe('Filter Payer List by Type and Status - Reset & transitions', () => {
  test('TC-005: should restore the full unfiltered list when both filters are set back to All', async ({
    payerManagementPage,
  }) => {
    await payerManagementPage.open();
    const unfilteredPages = await payerManagementPage.getPageCount();

    // Narrow the list first, so the reset has something to undo.
    await payerManagementPage.filterByType('Private');
    await payerManagementPage.filterByStatus('Active');

    await payerManagementPage.resetFilters();

    // Back to the complete list, regardless of type or status.
    await payerManagementPage.expectPageCount(unfilteredPages);
    await payerManagementPage.expectMixedPayerTypes();
  });

  test('TC-007: should update the list at every step when the Payer Type filter changes in sequence', async ({
    payerManagementPage,
  }) => {
    await payerManagementPage.open();
    const unfilteredPages = await payerManagementPage.getPageCount();

    // Unfiltered -> Private -> Government -> All
    await payerManagementPage.filterByType(TYPE_TRANSITION_SEQUENCE[0]);
    await payerManagementPage.expectAllRowsOfType('Private');

    await payerManagementPage.filterByType(TYPE_TRANSITION_SEQUENCE[1]);
    await payerManagementPage.expectAllRowsOfType('Government');

    await payerManagementPage.filterByType(TYPE_TRANSITION_SEQUENCE[2]);

    // The reset returns exactly to the original unfiltered state.
    await payerManagementPage.expectPageCount(unfilteredPages);
    await payerManagementPage.expectMixedPayerTypes();
  });

  test('TC-012: should show only the last selected filter combination after rapid successive changes', async ({
    payerManagementPage,
  }) => {
    await payerManagementPage.open();

    // Toggle both filters through several states in quick succession, ending on
    // Payer Type = Private and Status = Inactive.
    await payerManagementPage.filterByType('Government');
    await payerManagementPage.filterByType('All Types');
    await payerManagementPage.filterByType('Private');
    await payerManagementPage.filterByStatus('Active');
    await payerManagementPage.filterByStatus('Pending');
    await payerManagementPage.filterByStatus('Inactive');

    // Only the final selection is reflected - no stale or duplicated rows.
    await payerManagementPage.expectCombinedFilterOutcome('Private', 'Inactive');
  });
});
