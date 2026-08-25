import { test, expect } from '../../../fixtures';
import {
  STATUS_BOUNDARY_CASES,
  FILTER_COMBINATIONS,
  TYPE_TRANSITION_SEQUENCE,
  EMPTY_RESULT_COMBINATION,
  INVALID_URL_FILTERS,
  PAYER_TYPE_LOOKUP,
  buildPayerTypeLookupItem,
} from '../../../data/payers/filterPayer.data';

/**
 * User story: Filter Payer List by Type and Status.
 * Filtering on one criterion at a time.
 */
test.describe('Filter Payer List by Type and Status - Single criterion', () => {
  test('TC-001: should list only private payers when the Payer Type filter is set to Private', async ({
    payerManagementPage,
  }) => {
    await payerManagementPage.open();

    await payerManagementPage.filterByType('Private');

    await payerManagementPage.expectAllRowsOfType('Private');
  });

  test('TC-002: should list only government payers when the Payer Type filter is set to Government', async ({
    payerManagementPage,
  }) => {
    await payerManagementPage.open();

    await payerManagementPage.filterByType('Government');

    await payerManagementPage.expectAllRowsOfType('Government');
  });

  test('TC-003: should list only active payers when the Status filter is set to Active', async ({
    payerManagementPage,
  }) => {
    await payerManagementPage.open();

    await payerManagementPage.filterByStatus('Active');

    // Pending, Inactive and Expired payers must all be excluded.
    await payerManagementPage.expectAllRowsOfStatus('Active');
  });

  // TC-006: the first and last selectable status must filter correctly - proving
  // there is no off-by-one error in the dropdown selection.
  for (const boundary of STATUS_BOUNDARY_CASES) {
    test(`TC-006: should filter to only ${boundary.status} payers when the ${boundary.position} Status option is selected`, async ({
      payerManagementPage,
    }) => {
      await payerManagementPage.open();

      await payerManagementPage.filterByStatus(boundary.status);

      await payerManagementPage.expectStatusFilterOutcome(boundary.status);
    });
  }
});

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

/**
 * User story: Filter Payer List by Type and Status.
 * A Payer Type added through lookup administration must appear in the filter
 * with no code change or release.
 */
test.describe('Filter Payer List by Type and Status - Configurable Payer Type', () => {
  test('TC-010: should offer a newly configured Payer Type in the filter without a code change', async ({
    payerManagementPage,
    lookupManagementPage,
    cleanup,
  }) => {
    const newType = buildPayerTypeLookupItem();
    // Leave the reference data exactly as it was found.
    cleanup.register(async () => {
      await lookupManagementPage.openCategory(PAYER_TYPE_LOOKUP);
      await lookupManagementPage.deleteItem(newType.nameEn);
    });

    // Administrator adds the value through configuration only.
    await lookupManagementPage.openCategory(PAYER_TYPE_LOOKUP);
    await lookupManagementPage.addItem(newType);
    await lookupManagementPage.expectItemListed(newType.nameEn);

    // It is then selectable in the payer list's Payer Type filter...
    await payerManagementPage.open();
    const options = await payerManagementPage.getFilterOptions('type');
    expect(options, 'the new Payer Type should be offered by the filter').toContain(newType.nameEn);

    // ...and filtering by it works (no payer uses it yet, so the list is empty).
    await payerManagementPage.filterByType(newType.nameEn);
    await payerManagementPage.expectEmptyState();
  });
});
