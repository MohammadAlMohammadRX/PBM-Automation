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
 *
 * Steps are recorded through the `steps` fixture. Applying a sort is `critical` -
 * if the selection never took effect, asserting on the resulting order would
 * report a failure about the application that was never exercised.
 *
 * The decision-table cases (TC-038 onwards) keep one `steps.step` per
 * column/direction pair, deliberately NOT critical: the pairs are independent,
 * so a failure on one column must not stop the other thirteen from reporting.
 */
test.describe('Sort Payer List by Column Headers - Default and per-column sorting', () => {
  test('TC-030: should sort by Payer Name ascending by default when the list is first opened', async ({
    payerManagementPage,
    steps,
  }) => {
    // Opened fresh, with no sort selected in this session.
    await steps.critical('Open the payer list fresh, with no sort selected', () =>
      payerManagementPage.open());

    await steps.step(
      `The indicator shows the default sort: ${DEFAULT_SORT.column} ${DEFAULT_SORT.direction}`,
      () =>
        payerManagementPage.expectSortIndicator(DEFAULT_SORT.column, DEFAULT_SORT.direction),
    );

    await steps.step('The list is ordered by that default sort', () =>
      payerManagementPage.expectColumnSorted(DEFAULT_SORT.column, DEFAULT_SORT.direction));
  });

  test('TC-031: should reorder the list Z-to-A when Payer Name descending is selected', async ({
    payerManagementPage,
    steps,
  }) => {
    await steps.critical('Open the payer list', () => payerManagementPage.open());

    await steps.critical('Select Sort By = Payer Name descending', () =>
      payerManagementPage.sortBy('payerName', 'desc'));

    await steps.step('The list is reordered Z-to-A', () =>
      payerManagementPage.expectColumnSorted('payerName', 'desc'));

    await steps.step('The indicator shows Payer Name descending', () =>
      payerManagementPage.expectSortIndicator('payerName', 'desc'));
  });

  test('TC-032: should reorder then reverse the list when Payer Type ascending and descending are selected', async ({
    payerManagementPage,
    steps,
  }) => {
    let ascending: string[] = [];

    await steps.critical('Open the payer list', () => payerManagementPage.open());

    await steps.critical('Select Sort By = Payer Type ascending', () =>
      payerManagementPage.sortBy('payerType', 'asc'));

    await steps.step('The list is ordered by Payer Type ascending', () =>
      payerManagementPage.expectColumnSorted('payerType', 'asc'));

    await steps.step('The indicator shows Payer Type ascending', () =>
      payerManagementPage.expectSortIndicator('payerType', 'asc'));

    await steps.critical('Record the ascending order', async () => {
      ascending = await payerManagementPage.getColumnValues('payerType');
    });

    await steps.critical('Select Sort By = Payer Type descending', () =>
      payerManagementPage.sortBy('payerType', 'desc'));

    await steps.step('The list is ordered by Payer Type descending', () =>
      payerManagementPage.expectColumnSorted('payerType', 'desc'));

    await steps.step('The indicator shows Payer Type descending', () =>
      payerManagementPage.expectSortIndicator('payerType', 'desc'));

    // The two directions must genuinely disagree - proof the list reversed
    // rather than the indicator changing on its own.
    await steps.step('The two directions genuinely disagree, so the list really reversed', async () => {
      const descending = await payerManagementPage.getColumnValues('payerType');
      expect(descending[0], 'descending must not start where ascending started').not.toBe(
        ascending[0],
      );
    });
  });

  test('TC-033: should reorder the list by Payer Code when Code ascending is selected', async ({
    payerManagementPage,
    steps,
  }) => {
    await steps.critical('Open the payer list', () => payerManagementPage.open());

    await steps.critical('Select Sort By = Payer Code ascending', () =>
      payerManagementPage.sortBy('code', 'asc'));

    await steps.step('The indicator shows Payer Code ascending', () =>
      payerManagementPage.expectSortIndicator('code', 'asc'));

    // Codes are only issued to published payers, so the ascending sort puts the
    // code-less rows first; the real codes are on the closing pages.
    await steps.step('The code-less rows are grouped together, not interleaved', () =>
      payerManagementPage.expectBlanksGrouped('code'));

    await steps.step('The issued codes on the closing pages are in ascending order', () =>
      payerManagementPage.expectColumnSortedOnLastPages('code', 'asc'));
  });

  test('TC-034: should reorder the list by License Number when License Number descending is selected', async ({
    payerManagementPage,
    steps,
  }) => {
    await steps.critical('Open the payer list', () => payerManagementPage.open());

    await steps.critical('Select Sort By = License Number descending', () =>
      payerManagementPage.sortBy('licenseNumber', 'desc'));

    await steps.step('The list is ordered by License Number descending', () =>
      payerManagementPage.expectColumnSorted('licenseNumber', 'desc'));

    await steps.step('The indicator shows License Number descending', () =>
      payerManagementPage.expectSortIndicator('licenseNumber', 'desc'));
  });

  test('TC-035: should reorder the list alphabetically by Email when Email ascending is selected', async ({
    payerManagementPage,
    steps,
  }) => {
    await steps.critical('Open the payer list', () => payerManagementPage.open());

    await steps.critical('Select Sort By = Email ascending', () =>
      payerManagementPage.sortBy('email', 'asc'));

    await steps.step('The list is ordered alphabetically by Email', () =>
      payerManagementPage.expectColumnSorted('email', 'asc'));

    await steps.step('The indicator shows Email ascending', () =>
      payerManagementPage.expectSortIndicator('email', 'asc'));
  });

  test('TC-036: should reorder the list by Phone when Phone descending is selected', async ({
    payerManagementPage,
    steps,
  }) => {
    await steps.critical('Open the payer list', () => payerManagementPage.open());

    await steps.critical('Select Sort By = Phone descending', () =>
      payerManagementPage.sortBy('phone', 'desc'));

    await steps.step('The list is ordered by Phone descending', () =>
      payerManagementPage.expectColumnSorted('phone', 'desc'));

    await steps.step('The indicator shows Phone descending', () =>
      payerManagementPage.expectSortIndicator('phone', 'desc'));
  });

  test('TC-037: should group payers by status value when Status ascending is selected', async ({
    payerManagementPage,
    steps,
  }) => {
    await steps.critical('Open the payer list', () => payerManagementPage.open());

    await steps.critical('Select Sort By = Status ascending', () =>
      payerManagementPage.sortBy('status', 'asc'));

    // The Status column is ordered by the underlying lifecycle value, so the
    // requirement is checked as grouping: equal statuses stay in one block.
    await steps.step('Equal statuses stay together in one block', () =>
      payerManagementPage.expectColumnSorted('status', 'asc'));

    await steps.step('The indicator shows Status ascending', () =>
      payerManagementPage.expectSortIndicator('status', 'asc'));
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
    steps,
  }) => {
    await steps.critical('Open the payer list', () => payerManagementPage.open());

    // 7 columns x 2 directions - one test case, so the whole decision table is
    // walked inside a single block, each row asserted as it is applied. Each
    // pair is its own non-critical step, so a failure on one column still lets
    // the remaining columns report.
    for (const { column, direction } of SORT_MATRIX) {
      await steps.step(`Sort By = ${column} ${direction} orders the list and the indicator agrees`, async () => {
        await payerManagementPage.sortBy(column, direction);
        await payerManagementPage.expectColumnSorted(column, direction);
        await payerManagementPage.expectSortIndicator(column, direction);
      });
    }
  });

  test('TC-039: should update the indicator and order at every transition and return to the default state', async ({
    payerManagementPage,
    steps,
  }) => {
    await steps.critical('Open the payer list', () => payerManagementPage.open());

    // The starting state is observed, not selected - the list must already be on
    // its default sort when it loads.
    const [start, ...transitions] = SORT_TRANSITIONS;

    await steps.step(`${start.step}: the list loads on ${start.column} ${start.direction}`, async () => {
      await payerManagementPage.expectSortIndicator(start.column, start.direction);
      await payerManagementPage.expectColumnSorted(start.column, start.direction);
    });

    // Default -> Payer Type asc -> Code desc -> back to the default. Each
    // transition is independent, so one failing transition still lets the next
    // one report.
    for (const { step, column, direction } of transitions) {
      await steps.step(`${step}: ${column} ${direction}`, async () => {
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
    steps,
  }) => {
    // The fixture provisions a payer with a unique name, so searching for it
    // narrows the list to exactly one record.
    await steps.critical('Open the payer list', () => payerManagementPage.open());

    await steps.critical('Search for the unique payer name', () =>
      payerManagementPage.typeInSearch(draftPayer.nameEn));

    // Critical: a one-row result set is the precondition this case exists to
    // exercise. Without it the sorts below prove nothing.
    await steps.critical('The result set narrows to exactly one record', () =>
      payerManagementPage.expectOnlyRow(draftPayer.nameEn));

    for (const { column, direction } of SINGLE_RECORD_SORTS) {
      await steps.step(`Sort By = ${column} ${direction} on a single record`, async () => {
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
    steps,
  }) => {
    let baseline!: Awaited<ReturnType<typeof payerManagementPage.getListSize>>;

    await steps.critical('Open the payer list and record how many records it holds', async () => {
      await payerManagementPage.open();
      baseline = await payerManagementPage.getListSize();
    });

    for (const column of BLANK_VALUE_COLUMNS) {
      await steps.step(`Blank handling for ${column}`, async () => {
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
    steps,
  }) => {
    await steps.critical('Open the payer list', () => payerManagementPage.open());

    // The UI language is restored in `finally`: it is stored with the session, so
    // leaving it in Arabic would change the language for every later test.
    try {
      // English: sorting by Status brings each status - Expired included - together
      // in one block, which is how the administrator spots renewals.
      await steps.critical('Select Sort By = Status ascending, in English', () =>
        payerManagementPage.sortBy('status', 'asc'));

      await steps.step('Each status is grouped into one block', () =>
        payerManagementPage.expectColumnSorted('status', 'asc'));

      await steps.step('The indicator shows Status ascending', () =>
        payerManagementPage.expectSortIndicator('status', 'asc'));

      await steps.critical('Select Sort By = Status descending', () =>
        payerManagementPage.sortBy('status', 'desc'));

      await steps.step('The grouping holds in the reverse direction', () =>
        payerManagementPage.expectColumnSorted('status', 'desc'));

      await steps.step('The indicator shows Status descending', () =>
        payerManagementPage.expectSortIndicator('status', 'desc'));

      // Arabic: the same grouping must hold, with the menu and indicator localized
      // and the ordering following the active language's collation.
      await steps.critical('Switch the interface language to Arabic', () =>
        payerManagementPage.language().switchTo('ar'));

      await steps.step('The page is rendered right-to-left', () =>
        payerManagementPage.language().expectRightToLeft());

      await steps.critical('Select Sort By = Status ascending, in Arabic', () =>
        payerManagementPage.sortBy('status', 'asc'));

      await steps.step('The same grouping holds under Arabic collation', () =>
        payerManagementPage.expectColumnSorted('status', 'asc'));

      await steps.step('The indicator is localized and shows Status ascending', () =>
        payerManagementPage.expectSortIndicator('status', 'asc', 'ar'));
    } finally {
      await payerManagementPage.language().switchTo('en');
    }
  });

  test('TC-043: should keep filter and search applied while sorting the narrowed result set', async ({
    payerManagementPage,
    steps,
  }) => {
    const { column, direction } = COMBINED_CONTEXT.sort;

    await steps.critical('Open the payer list', () => payerManagementPage.open());

    await steps.critical(`Filter by Payer Type = ${COMBINED_CONTEXT.type}`, () =>
      payerManagementPage.filterByType(COMBINED_CONTEXT.type));

    await steps.critical(`Filter by Status = ${COMBINED_CONTEXT.status}`, () =>
      payerManagementPage.filterByStatus(COMBINED_CONTEXT.status));

    await steps.critical('Search within the filtered set', () =>
      payerManagementPage.typeInSearch(KNOWN_PAYER.namePartial));

    await steps.critical(`Sort the narrowed set by ${column} ${direction}`, () =>
      payerManagementPage.sortBy(column, direction));

    // The sort applies to the narrowed subset, and neither the filter nor the
    // search is dropped by sorting. Four independent facts, each reported alone.
    await steps.step('The sort applies to the narrowed subset', () =>
      payerManagementPage.expectSortedSubsetConsistent(column, direction));

    await steps.step(`The indicator shows ${column} ${direction}`, () =>
      payerManagementPage.expectSortIndicator(column, direction));

    await steps.step('Sorting did not drop the filters', () =>
      payerManagementPage.expectFiltersApplied(COMBINED_CONTEXT.type, COMBINED_CONTEXT.status));

    await steps.step('Sorting did not drop the search term', () =>
      payerManagementPage.expectSearchTerm(KNOWN_PAYER.namePartial));

    // Designed refresh behaviour: filter, search and sort all reset to their
    // defaults, and the list re-renders consistently. Runs last, because it
    // reloads the page and discards the state the steps above inspect.
    await steps.step('After a refresh, filter, search and sort all reset to their defaults', () =>
      payerManagementPage.expectListStateAfterReload());
  });

  test('TC-044: should offer all seven columns in both directions with an accurate sort indicator', async ({
    payerManagementPage,
    steps,
  }) => {
    await steps.critical('Open the payer list', () => payerManagementPage.open());

    // Checklist: the trigger, then all 7 columns x 2 directions, in menu order.
    await steps.step('The Sort By menu offers all seven columns in both directions', () =>
      payerManagementPage.expectSortMenuComplete());

    // The indicator names the column and direction actually in effect.
    await steps.critical('Select Sort By = Email descending', () =>
      payerManagementPage.sortBy('email', 'desc'));

    await steps.step('The indicator names the column and direction actually in effect', () =>
      payerManagementPage.expectSortIndicator('email', 'desc'));

    await steps.step('Only one option is marked active', () =>
      payerManagementPage.sortMenu().expectSingleActiveOption());
  });
});
