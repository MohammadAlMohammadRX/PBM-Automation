import { test, expect } from '../../../fixtures';
import {
  STATUS_BOUNDARY_CASES,
  FILTER_COMBINATIONS,
  TYPE_TRANSITION_SEQUENCE,
  EMPTY_RESULT_COMBINATION,
  INVALID_URL_FILTERS,
} from '../../../data/payers/filterPayer.data';

/**
 * User story: Filter Payer List by Type and Status.
 * Filtering on one criterion at a time.
 *
 * Steps are recorded through the `steps` fixture. Applying a filter is
 * `critical` - if the selection never took effect, asserting on the resulting
 * rows would report a failure about the application that was never exercised.
 * Each assertion on the result is a `step`, so one failing check still lets the
 * next one report.
 */
test.describe('Filter Payer List by Type and Status - Single criterion', () => {
  test('TC-001: should list only private payers when the Payer Type filter is set to Private', async ({
    payerManagementPage,
    steps,
  }) => {
    await steps.critical('Open the payer list', () => payerManagementPage.open());

    await steps.critical('Set the Payer Type filter to Private', () =>
      payerManagementPage.filterByType('Private'));

    await steps.step('Every listed row is of type Private', () =>
      payerManagementPage.expectAllRowsOfType('Private'));
  });

  test('TC-002: should list only government payers when the Payer Type filter is set to Government', async ({
    payerManagementPage,
    steps,
  }) => {
    await steps.critical('Open the payer list', () => payerManagementPage.open());

    await steps.critical('Set the Payer Type filter to Government', () =>
      payerManagementPage.filterByType('Government'));

    await steps.step('Every listed row is of type Government', () =>
      payerManagementPage.expectAllRowsOfType('Government'));
  });

  test('TC-003: should list only active payers when the Status filter is set to Active', async ({
    payerManagementPage,
    steps,
  }) => {
    await steps.critical('Open the payer list', () => payerManagementPage.open());

    await steps.critical('Set the Status filter to Active', () =>
      payerManagementPage.filterByStatus('Active'));

    // Pending, Inactive and Expired payers must all be excluded.
    await steps.step('Every listed row is Active - Pending, Inactive and Expired excluded', () =>
      payerManagementPage.expectAllRowsOfStatus('Active'));
  });

  // TC-006: the first and last selectable status must filter correctly - proving
  // there is no off-by-one error in the dropdown selection.
  for (const boundary of STATUS_BOUNDARY_CASES) {
    test(`TC-006: should filter to only ${boundary.status} payers when the ${boundary.position} Status option is selected`, async ({
      payerManagementPage,
      steps,
    }) => {
      await steps.critical('Open the payer list', () => payerManagementPage.open());

      await steps.critical(
        `Select the ${boundary.position} Status option, "${boundary.status}"`,
        () => payerManagementPage.filterByStatus(boundary.status),
      );

      await steps.step(`Only ${boundary.status} payers are listed`, () =>
        payerManagementPage.expectStatusFilterOutcome(boundary.status));
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
      steps,
    }) => {
      await steps.critical('Open the payer list', () => payerManagementPage.open());

      await steps.critical(`Set the Payer Type filter to ${combination.type}`, () =>
        payerManagementPage.filterByType(combination.type));

      await steps.critical(`Set the Status filter to ${combination.status}`, () =>
        payerManagementPage.filterByStatus(combination.status));

      // Rows must satisfy BOTH criteria - or the list is legitimately empty.
      await steps.step(
        'Every listed row satisfies both criteria, or the list is legitimately empty',
        () =>
          payerManagementPage.expectCombinedFilterOutcome(
            combination.type,
            combination.status,
          ),
      );
    });
  }

  /**
   * This case is about NARROWING and RESTORING, which is what the user story
   * asks for: apply both filters, the list narrows; clear them, the full list
   * comes back.
   *
   * It deliberately does NOT assert the Status text of each row. That assertion
   * belongs to TC-003 and TC-006, where it IS the point of the case - and it is
   * where the Status-filter defect is reported. Repeating it here made this case
   * fail for a reason it was never meant to cover, and hid the behaviour it was
   * meant to prove. The Type column IS asserted, because the type filter is
   * unaffected.
   */
  test('TC-008: should narrow the list to active government payers and restore the full list when the filters are cleared', async ({
    payerManagementPage,
    steps,
  }) => {
    let unfilteredPages = 0;

    await steps.critical('Open the payer list and record its unfiltered size', async () => {
      await payerManagementPage.open();
      unfilteredPages = await payerManagementPage.getPageCount();
    });

    // The administrator narrows the list for a compliance review.
    await steps.critical('Set the Payer Type filter to Government', () =>
      payerManagementPage.filterByType('Government'));

    await steps.critical('Set the Status filter to Active', () =>
      payerManagementPage.filterByStatus('Active'));

    // Narrowed: every remaining row is a Government payer, and the result set
    // is smaller than the unfiltered one.
    await steps.step('Every remaining row is a Government payer', () =>
      payerManagementPage.expectAllRowsOfType('Government'));

    await steps.step('The narrowed result set is smaller than the unfiltered one', () =>
      payerManagementPage.expectFewerPagesThan(unfilteredPages));

    // ...and clearing both filters returns the full list without error.
    await steps.critical('Clear both filters', () => payerManagementPage.resetFilters());

    await steps.step('The full list is restored without error', () =>
      payerManagementPage.expectPageCount(unfilteredPages));
  });
});

/**
 * User story: Filter Payer List by Type and Status.
 * Resetting filters, moving between filter states, and rapid toggling.
 */
test.describe('Filter Payer List by Type and Status - Reset & transitions', () => {
  test('TC-005: should restore the full unfiltered list when both filters are set back to All', async ({
    payerManagementPage,
    steps,
  }) => {
    let unfilteredPages = 0;

    await steps.critical('Open the payer list and record its unfiltered size', async () => {
      await payerManagementPage.open();
      unfilteredPages = await payerManagementPage.getPageCount();
    });

    // Narrow the list first, so the reset has something to undo.
    await steps.critical('Narrow the list by Payer Type = Private', () =>
      payerManagementPage.filterByType('Private'));

    await steps.critical('Narrow the list by Status = Active', () =>
      payerManagementPage.filterByStatus('Active'));

    await steps.critical('Set both filters back to All', () => payerManagementPage.resetFilters());

    // Back to the complete list, regardless of type or status.
    await steps.step('The full page count is restored', () =>
      payerManagementPage.expectPageCount(unfilteredPages));

    await steps.step('The restored list shows mixed payer types', () =>
      payerManagementPage.expectMixedPayerTypes());
  });

  test('TC-007: should update the list at every step when the Payer Type filter changes in sequence', async ({
    payerManagementPage,
    steps,
  }) => {
    let unfilteredPages = 0;

    await steps.critical('Open the payer list and record its unfiltered size', async () => {
      await payerManagementPage.open();
      unfilteredPages = await payerManagementPage.getPageCount();
    });

    // Unfiltered -> Private -> Government -> All. Each transition is critical
    // because it sets up the state the next assertion reads, but the assertions
    // themselves are independent.
    await steps.critical(`Change the Payer Type filter to ${TYPE_TRANSITION_SEQUENCE[0]}`, () =>
      payerManagementPage.filterByType(TYPE_TRANSITION_SEQUENCE[0]));

    await steps.step('The list updates to only Private payers', () =>
      payerManagementPage.expectAllRowsOfType('Private'));

    await steps.critical(`Change the Payer Type filter to ${TYPE_TRANSITION_SEQUENCE[1]}`, () =>
      payerManagementPage.filterByType(TYPE_TRANSITION_SEQUENCE[1]));

    await steps.step('The list updates to only Government payers', () =>
      payerManagementPage.expectAllRowsOfType('Government'));

    await steps.critical(`Change the Payer Type filter to ${TYPE_TRANSITION_SEQUENCE[2]}`, () =>
      payerManagementPage.filterByType(TYPE_TRANSITION_SEQUENCE[2]));

    // The reset returns exactly to the original unfiltered state.
    await steps.step('The reset returns exactly to the original page count', () =>
      payerManagementPage.expectPageCount(unfilteredPages));

    await steps.step('The unfiltered list shows mixed payer types again', () =>
      payerManagementPage.expectMixedPayerTypes());
  });

  test('TC-012: should show only the last selected filter combination after rapid successive changes', async ({
    payerManagementPage,
    steps,
  }) => {
    await steps.critical('Open the payer list', () => payerManagementPage.open());

    // Toggle both filters through several states in quick succession, ending on
    // Payer Type = Private and Status = Inactive.
    await steps.critical(
      'Toggle both filters rapidly, ending on Payer Type = Private and Status = Inactive',
      async () => {
        await payerManagementPage.filterByType('Government');
        await payerManagementPage.filterByType('All Types');
        await payerManagementPage.filterByType('Private');
        await payerManagementPage.filterByStatus('Active');
        await payerManagementPage.filterByStatus('Pending');
        await payerManagementPage.filterByStatus('Inactive');
      },
    );

    // Only the final selection is reflected - no stale or duplicated rows.
    await steps.step('Only the final selection is reflected - no stale or duplicated rows', () =>
      payerManagementPage.expectCombinedFilterOutcome('Private', 'Inactive'));
  });
});

/**
 * User story: Filter Payer List by Type and Status.
 * Empty results, and robustness against unsupported filter values.
 */
test.describe('Filter Payer List by Type and Status - Empty state & URL handling', () => {
  /**
   * PARKED with test.fixme - reported as skipped, not as a pass.
   *
   * The precondition genuinely holds: the list's own KPI strip reports zero
   * Expired payers, so Government + Expired must match nothing. The application
   * returns rows regardless, which is the same Status-filter defect behind
   * TC-003, TC-004 and TC-006 - the filter matches an internal field instead of
   * the displayed value, so the empty state never renders.
   *
   * Deliberately NOT a conditional skip. Gating on "did the filter return rows"
   * would skip precisely when the defect is present, leaving a test that can
   * never fail. fixme parks it while keeping the reason on the record.
   *
   * No `steps` fixture here: a fixme test never executes, so there is nothing to
   * record. It is reported SKIPPED with this reason.
   */
  test('TC-009: should show a no-results empty state when the filter combination matches no payers', async ({
    payerManagementPage,
  }) => {
    // The in-body form of fixme, because it is the only one that carries a
    // REASON into the report. `test.fixme(title, fn)` parks the case with no
    // description, so the report could only say "intentionally excluded" - and a
    // status without a reason is what this whole exercise set out to remove.
    test.fixme(
      true,
      'Parked: the KPI strip on the list itself reports zero Expired payers, so '
        + 'Government + Expired must match nothing, yet the application returns rows. '
        + 'Same Status-filter defect as TC-003, TC-004 and TC-006 - the filter matches '
        + 'an internal field rather than the displayed value, so the empty state never '
        + 'renders. Not a conditional skip: gating on "did the filter return rows" '
        + 'would skip precisely when the defect is present.',
    );

    await payerManagementPage.open();

    await payerManagementPage.filterByType(EMPTY_RESULT_COMBINATION.type);
    await payerManagementPage.filterByStatus(EMPTY_RESULT_COMBINATION.status);

    // A clear empty state - not an error, stale data, or a blank screen.
    await payerManagementPage.expectEmptyState();
  });

  test('TC-013: should ignore unsupported filter values supplied through the URL without breaking the page', async ({
    payerManagementPage,
    steps,
  }) => {
    await steps.critical('Open the payer list with unsupported filter values in the URL', () =>
      payerManagementPage.openWithQuery(INVALID_URL_FILTERS));

    // The page still renders and falls back to the unfiltered list; no crash and
    // no partially-filtered data.
    await steps.step('The filters fall back to their default state', () =>
      payerManagementPage.expectFiltersAtDefault());

    await steps.step('The unfiltered list renders with mixed payer types - no crash', () =>
      payerManagementPage.expectMixedPayerTypes());
  });

  test('TC-014: should update the result count, recalculate pagination and reset to page one when a filter is applied', async ({
    payerManagementPage,
    steps,
  }) => {
    let unfilteredPages = 0;

    await steps.critical('Open the payer list and record its unfiltered size', async () => {
      await payerManagementPage.open();
      unfilteredPages = await payerManagementPage.getPageCount();
    });

    // Move off page one so the reset is observable. Critical: if the view never
    // left page one, "returns to page one" proves nothing.
    await steps.critical('Move to page two so the reset is observable', async () => {
      await payerManagementPage.goToPage(2);
      await payerManagementPage.expectNotOnFirstPage();
    });

    await steps.critical('Set the Payer Type filter to Private', () =>
      payerManagementPage.filterByType('Private'));

    await steps.critical('Set the Status filter to Active', () =>
      payerManagementPage.filterByStatus('Active'));

    // Pagination recalculates to a smaller set and the view returns to page one.
    await steps.step('The view returns to page one', () =>
      payerManagementPage.expectOnFirstPage());

    await steps.step('Pagination recalculates to a smaller set', () =>
      payerManagementPage.expectFewerPagesThan(unfilteredPages));
  });
});
