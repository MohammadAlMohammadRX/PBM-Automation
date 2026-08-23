import { test } from '../../../fixtures';
import { KNOWN_PAYER } from '../../../data/payers/searchPayer.data';

/**
 * User story: Search Payers by Name or Code.
 * Search must combine with an active Type/Status filter, not replace it.
 */
test.describe('Search Payers by Name or Code - Combined with filters', () => {
  test('TC-029: should apply the search term together with an active Type and Status filter', async ({
    payerManagementPage,
  }) => {
    await payerManagementPage.open();

    // Narrow by filter first...
    await payerManagementPage.filterByType('Private');
    await payerManagementPage.filterByStatus('Active');

    // ...then search within that filtered set.
    await payerManagementPage.typeInSearch(KNOWN_PAYER.namePartial);

    // Results must satisfy the filter AND the search term simultaneously.
    await payerManagementPage.expectAllNamesContain(KNOWN_PAYER.namePartial);
    await payerManagementPage.expectAllRowsOfType('Private');
  });
});
