import { test, expect } from '../../../fixtures';
import { KNOWN_PAYER, SINGLE_CHARACTER_TERM } from '../../../data/payers/searchPayer.data';

/**
 * User story: Search Payers by Name or Code.
 * The toolbar search box filters the list in real time as the user types.
 */
test.describe('Search Payers by Name or Code - Real-time search', () => {
  test('TC-015: should filter the list in real time when a partial English payer name is typed', async ({
    payerManagementPage,
  }) => {
    await payerManagementPage.open();

    await payerManagementPage.typeInSearch(KNOWN_PAYER.namePartial);

    // Every remaining row matches the typed substring - no Enter was needed.
    await payerManagementPage.expectAllNamesContain(KNOWN_PAYER.namePartial);
    await payerManagementPage.expectResultsInclude(KNOWN_PAYER.name);
  });

  test('TC-016: should filter the list when a partial Arabic payer name is typed', async ({
    payerManagementPage,
  }) => {
    await payerManagementPage.open();

    await payerManagementPage.typeInSearch(KNOWN_PAYER.nameArabic);

    // The Arabic name is matched even though the list shows English names.
    await payerManagementPage.expectResultsFound();
    await payerManagementPage.expectResultsInclude(KNOWN_PAYER.name);
  });

  test('TC-017: should filter the list to the matching payer when a Payer Code is entered', async ({
    payerManagementPage,
  }) => {
    await payerManagementPage.open();

    // Every row returned carries exactly the searched code.
    await payerManagementPage.typeInSearch(KNOWN_PAYER.code);
    await payerManagementPage.expectAllPayerCodes(KNOWN_PAYER.code);

    // A partial code matches too.
    await payerManagementPage.typeInSearch(KNOWN_PAYER.codePartial);
    await payerManagementPage.expectAllPayerCodes(KNOWN_PAYER.code);
  });

  test('TC-021: should perform real-time matching from a single typed character', async ({
    payerManagementPage,
  }) => {
    await payerManagementPage.open();

    await payerManagementPage.typeInSearch(SINGLE_CHARACTER_TERM);

    // Partial matching applies even at the minimum input length.
    await payerManagementPage.expectResultsFound();
    const names = await payerManagementPage.getVisiblePayerNames();
    expect(names.length, 'a single character should still return matches').toBeGreaterThan(0);
  });
});
