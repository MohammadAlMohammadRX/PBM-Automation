import { test, expect } from '../../../fixtures';
import {
  PAYER_TYPE_LOOKUP,
  buildPayerTypeLookupItem,
} from '../../../data/payers/filterPayer.data';

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
