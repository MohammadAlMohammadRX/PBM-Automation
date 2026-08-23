import { test } from '../../../fixtures';
import { SORT_MATRIX, SORT_TRANSITIONS } from '../../../data/payers/sortPayer.data';

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
