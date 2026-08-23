import { test, expect } from '../../../fixtures';
import { BLANK_VALUE_COLUMNS, SINGLE_RECORD_SORTS } from '../../../data/payers/sortPayer.data';

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
