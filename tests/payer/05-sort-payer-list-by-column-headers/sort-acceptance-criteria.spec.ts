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
  // Azure test case 14421
  test('14421: should default to Payer Name ascending when the list loads in Arabic', async ({
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

});
