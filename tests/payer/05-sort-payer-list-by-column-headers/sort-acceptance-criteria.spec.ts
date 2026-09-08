import { test } from '../../../fixtures';
import { DEFAULT_SORT } from '../../../data/payers/sortPayer.data';

/**
 * User story: Sort Payer List by Column Headers - acceptance criteria.
 *
 * The 15 manual test cases (TC-030..TC-044) exercise the Sort By menu as the
 * application implements it. These tests assert the acceptance criteria
 * themselves, including the parts the current build does not satisfy, so each
 * gap is evidenced by a reproducible failure rather than by a written note.
 *
 * AC-1 ("a Sort By menu offers ascending and descending sort on all seven
 * columns") is already covered by TC-044 and TC-038 and is not repeated here.
 *
 * The two Arabic cases restore English in `finally`. The interface language is
 * stored with the session, so leaving it in Arabic would change the language for
 * every later test in the worker.
 */
test.describe('Sort Payer List by Column Headers - Acceptance criteria', () => {
  test('AC-02: should display the active sort column and direction on the sort indicator without opening the menu', async ({
    payerManagementPage,
    steps,
  }) => {
    await steps.critical('Open the payer list', () => payerManagementPage.open());

    await steps.critical('Select Sort By = License Number descending', () =>
      payerManagementPage.sortBy('licenseNumber', 'desc'));

    // A user must be able to see what the list is sorted by while looking at
    // the list - not only after re-opening the Sort By menu.
    await steps.step('The active sort is visible without opening the menu', () =>
      payerManagementPage.expectVisibleSortIndicator('licenseNumber', 'desc'));
  });

  test('AC-03: should default to Payer Name ascending when the list loads in Arabic', async ({
    payerManagementPage,
    steps,
  }) => {
    await steps.critical('Open the payer list', () => payerManagementPage.open());

    try {
      await steps.critical('Switch the interface language to Arabic', () =>
        payerManagementPage.language().switchTo('ar'));

      // Reloaded so this is a genuine fresh load in Arabic, with no sort chosen.
      await steps.critical('Reload the list for a genuine fresh load in Arabic', () =>
        payerManagementPage.reopen());

      await steps.step(
        `The Arabic indicator shows the default sort: ${DEFAULT_SORT.column} ${DEFAULT_SORT.direction}`,
        () =>
          payerManagementPage.expectSortIndicator(
            DEFAULT_SORT.column,
            DEFAULT_SORT.direction,
            'ar',
          ),
      );

      await steps.step('The list is ordered by that default sort', () =>
        payerManagementPage.expectColumnSorted(DEFAULT_SORT.column, DEFAULT_SORT.direction));
    } finally {
      await payerManagementPage.language().switchTo('en');
    }
  });

  test('AC-05: should keep the sort indicator accurate after the interface language is switched', async ({
    payerManagementPage,
    steps,
  }) => {
    await steps.critical('Open the payer list', () => payerManagementPage.open());

    await steps.step('The indicator shows the default sort in English', () =>
      payerManagementPage.expectSortIndicator(DEFAULT_SORT.column, DEFAULT_SORT.direction));

    try {
      // Switching language must not lose the sort the list is actually applying.
      await steps.critical('Switch the interface language to Arabic', () =>
        payerManagementPage.language().switchTo('ar'));

      await steps.step('The indicator still names the sort the list is applying', () =>
        payerManagementPage.expectSortIndicator(
          DEFAULT_SORT.column,
          DEFAULT_SORT.direction,
          'ar',
        ));
    } finally {
      await payerManagementPage.language().switchTo('en');
    }
  });

  test('AC-04: should allow sorting each sortable column from its own column header', async ({
    payerManagementPage,
    steps,
  }) => {
    await steps.critical('Open the payer list', () => payerManagementPage.open());

    // The story is "Sort Payer List by Column Headers": each sortable column's
    // header should carry a sort control and report its state via aria-sort.
    await steps.step('Each sortable column header carries a sort control reporting its state', () =>
      payerManagementPage.expectColumnHeadersSortable());
  });
});
