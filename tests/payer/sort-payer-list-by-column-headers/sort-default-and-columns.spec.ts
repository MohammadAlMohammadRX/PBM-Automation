import { test, expect } from '../../../fixtures';
import { DEFAULT_SORT } from '../../../data/payers/sortPayer.data';

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
