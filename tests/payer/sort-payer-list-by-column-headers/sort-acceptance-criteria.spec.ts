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
 */
test.describe('Sort Payer List by Column Headers - Acceptance criteria', () => {
  test('AC-02: should display the active sort column and direction on the sort indicator without opening the menu', async ({
    payerManagementPage,
  }) => {
    await payerManagementPage.open();

    await payerManagementPage.sortBy('licenseNumber', 'desc');

    // A user must be able to see what the list is sorted by while looking at
    // the list - not only after re-opening the Sort By menu.
    await payerManagementPage.expectVisibleSortIndicator('licenseNumber', 'desc');
  });

  test('AC-03: should default to Payer Name ascending when the list loads in Arabic', async ({
    payerManagementPage,
  }) => {
    await payerManagementPage.open();
    await payerManagementPage.language().switchTo('ar');

    // Reloaded so this is a genuine fresh load in Arabic, with no sort chosen.
    await payerManagementPage.reopen();

    await payerManagementPage.expectSortIndicator(
      DEFAULT_SORT.column,
      DEFAULT_SORT.direction,
      'ar',
    );
    await payerManagementPage.expectColumnSorted(DEFAULT_SORT.column, DEFAULT_SORT.direction);
  });

  test('AC-05: should keep the sort indicator accurate after the interface language is switched', async ({
    payerManagementPage,
  }) => {
    await payerManagementPage.open();
    await payerManagementPage.expectSortIndicator(DEFAULT_SORT.column, DEFAULT_SORT.direction);

    // Switching language must not lose the sort the list is actually applying.
    await payerManagementPage.language().switchTo('ar');

    await payerManagementPage.expectSortIndicator(
      DEFAULT_SORT.column,
      DEFAULT_SORT.direction,
      'ar',
    );
  });

  test('AC-04: should allow sorting each sortable column from its own column header', async ({
    payerManagementPage,
  }) => {
    await payerManagementPage.open();

    // The story is "Sort Payer List by Column Headers": each sortable column's
    // header should carry a sort control and report its state via aria-sort.
    await payerManagementPage.expectColumnHeadersSortable();
  });
});
