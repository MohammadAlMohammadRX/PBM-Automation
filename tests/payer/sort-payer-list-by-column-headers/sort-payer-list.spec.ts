import { test, expect } from '../../../fixtures';
import { KNOWN_PAYER } from '../../../data/payers/searchPayer.data';
import {
  DEFAULT_SORT,
  SORT_MATRIX,
  SORT_TRANSITIONS,
  BLANK_VALUE_COLUMNS,
  SINGLE_RECORD_SORTS,
  COMBINED_CONTEXT,
} from '../../../data/payers/sortPayer.data';

/**
 * User story: Sort Payer List by Column Headers.
 *
 * The list is sorted from the toolbar's "Sort By" menu; its checked item is the
 * sort indicator. These tests cover the default sort plus one column at a time.
 */
test.describe('Sort Payer List by Column Headers - Default and per-column sorting', () => {
  test('TC-030: should sort by Payer Name ascending by default when the list is first opened', async ({
    payerManagementPage,
  }) => {
    // Opened fresh, with no sort selected in this session.
    await payerManagementPage.open();

    await payerManagementPage.expectSortIndicator(DEFAULT_SORT.column, DEFAULT_SORT.direction);
    await payerManagementPage.expectColumnSorted(DEFAULT_SORT.column, DEFAULT_SORT.direction);
  });

  test('TC-031: should reorder the list Z-to-A when Payer Name descending is selected', async ({
    payerManagementPage,
  }) => {
    await payerManagementPage.open();

    await payerManagementPage.sortBy('payerName', 'desc');

    await payerManagementPage.expectColumnSorted('payerName', 'desc');
    await payerManagementPage.expectSortIndicator('payerName', 'desc');
  });

  test('TC-032: should reorder then reverse the list when Payer Type ascending and descending are selected', async ({
    payerManagementPage,
  }) => {
    await payerManagementPage.open();

    await payerManagementPage.sortBy('payerType', 'asc');
    await payerManagementPage.expectColumnSorted('payerType', 'asc');
    await payerManagementPage.expectSortIndicator('payerType', 'asc');
    const ascending = await payerManagementPage.getColumnValues('payerType');

    await payerManagementPage.sortBy('payerType', 'desc');
    await payerManagementPage.expectColumnSorted('payerType', 'desc');
    await payerManagementPage.expectSortIndicator('payerType', 'desc');
    const descending = await payerManagementPage.getColumnValues('payerType');

    // The two directions must genuinely disagree - proof the list reversed
    // rather than the indicator changing on its own.
    expect(descending[0], 'descending must not start where ascending started').not.toBe(
      ascending[0],
    );
  });

  test('TC-033: should reorder the list by Payer Code when Code ascending is selected', async ({
    payerManagementPage,
  }) => {
    await payerManagementPage.open();

    await payerManagementPage.sortBy('code', 'asc');

    await payerManagementPage.expectSortIndicator('code', 'asc');
    // Codes are only issued to published payers, so the ascending sort puts the
    // code-less rows first; the real codes are on the closing pages.
    await payerManagementPage.expectBlanksGrouped('code');
    await payerManagementPage.expectColumnSortedOnLastPages('code', 'asc');
  });

  test('TC-034: should reorder the list by License Number when License Number descending is selected', async ({
    payerManagementPage,
  }) => {
    await payerManagementPage.open();

    await payerManagementPage.sortBy('licenseNumber', 'desc');

    await payerManagementPage.expectColumnSorted('licenseNumber', 'desc');
    await payerManagementPage.expectSortIndicator('licenseNumber', 'desc');
  });

  test('TC-035: should reorder the list alphabetically by Email when Email ascending is selected', async ({
    payerManagementPage,
  }) => {
    await payerManagementPage.open();

    await payerManagementPage.sortBy('email', 'asc');

    await payerManagementPage.expectColumnSorted('email', 'asc');
    await payerManagementPage.expectSortIndicator('email', 'asc');
  });

  test('TC-036: should reorder the list by Phone when Phone descending is selected', async ({
    payerManagementPage,
  }) => {
    await payerManagementPage.open();

    await payerManagementPage.sortBy('phone', 'desc');

    await payerManagementPage.expectColumnSorted('phone', 'desc');
    await payerManagementPage.expectSortIndicator('phone', 'desc');
  });

  test('TC-037: should group payers by status value when Status ascending is selected', async ({
    payerManagementPage,
  }) => {
    await payerManagementPage.open();

    await payerManagementPage.sortBy('status', 'asc');

    // The Status column is ordered by the underlying lifecycle value, so the
    // requirement is checked as grouping: equal statuses stay in one block.
    await payerManagementPage.expectColumnSorted('status', 'asc');
    await payerManagementPage.expectSortIndicator('status', 'asc');
  });
});

/**
 * User story: Sort Payer List by Column Headers.
 *
 * Decision-table coverage of every column/direction pair, and the state
 * transitions between successive sort selections.
 */
test.describe('Sort Payer List by Column Headers - Matrix and state transitions', () => {
  test('TC-038: should produce the correct order and indicator for every column and direction combination', async ({
    payerManagementPage,
  }) => {
    await payerManagementPage.open();

    // 7 columns x 2 directions - one test case, so the whole decision table is
    // walked inside a single block, each row asserted as it is applied.
    for (const { column, direction } of SORT_MATRIX) {
      await test.step(`Sort By = ${column} ${direction}`, async () => {
        await payerManagementPage.sortBy(column, direction);
        await payerManagementPage.expectColumnSorted(column, direction);
        await payerManagementPage.expectSortIndicator(column, direction);
      });
    }
  });

  test('TC-039: should update the indicator and order at every transition and return to the default state', async ({
    payerManagementPage,
  }) => {
    await payerManagementPage.open();

    // The starting state is observed, not selected - the list must already be on
    // its default sort when it loads.
    const [start, ...transitions] = SORT_TRANSITIONS;
    await test.step(`${start.step}: ${start.column} ${start.direction}`, async () => {
      await payerManagementPage.expectSortIndicator(start.column, start.direction);
      await payerManagementPage.expectColumnSorted(start.column, start.direction);
    });

    // Default -> Payer Type asc -> Code desc -> back to the default.
    for (const { step, column, direction } of transitions) {
      await test.step(`${step}: ${column} ${direction}`, async () => {
        await payerManagementPage.sortBy(column, direction);
        await payerManagementPage.expectColumnSorted(column, direction);
        await payerManagementPage.expectSortIndicator(column, direction);
        // Only the newly selected option may be marked active.
        await payerManagementPage.sortMenu().expectSingleActiveOption();
      });
    }
  });
});

/**
 * User story: Sort Payer List by Column Headers.
 * Boundary and error-guessing coverage: a one-row result set, and columns whose
 * cells can be blank.
 */
test.describe('Sort Payer List by Column Headers - Boundary and blank values', () => {
  test('TC-040: should sort without error when the result set contains exactly one record', async ({
    payerManagementPage,
    draftPayer,
  }) => {
    // The fixture provisions a payer with a unique name, so searching for it
    // narrows the list to exactly one record.
    await payerManagementPage.open();
    await payerManagementPage.typeInSearch(draftPayer.nameEn);
    await payerManagementPage.expectOnlyRow(draftPayer.nameEn);

    for (const { column, direction } of SINGLE_RECORD_SORTS) {
      await test.step(`Sort By = ${column} ${direction}`, async () => {
        await payerManagementPage.sortBy(column, direction);
        // Nothing to reorder, but the indicator still updates and the single
        // record stays listed.
        await payerManagementPage.expectSortIndicator(column, direction);
        await payerManagementPage.expectOnlyRow(draftPayer.nameEn);
      });
    }
  });

  test('TC-042: should place blank values consistently without losing or duplicating rows', async ({
    payerManagementPage,
  }) => {
    await payerManagementPage.open();
    const baseline = await payerManagementPage.getListSize();

    for (const column of BLANK_VALUE_COLUMNS) {
      await test.step(`Blank handling for ${column}`, async () => {
        await payerManagementPage.sortBy(column, 'asc');

        // Blank cells must all sit at one end, never interleaved with values.
        await payerManagementPage.expectBlanksGrouped(column);
        await payerManagementPage.expectNoDuplicateRows();
        // Reordering must not change how many records exist.
        expect(await payerManagementPage.getListSize()).toEqual(baseline);
      });
    }
  });
});

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
