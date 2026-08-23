import { test, expect } from '../../../fixtures';
import {
  ADVANCED_SEARCH_COMBINATIONS,
  ADVANCED_SEARCH_FIELDS,
  CONTRADICTORY_ADVANCED_SEARCH,
  KNOWN_PAYER,
} from '../../../data/payers/searchPayer.data';
import { DETAIL_LABELS } from '../../../data/payers/editPayer.data';

/**
 * User story: Search Payers by Name or Code.
 * The Advanced Search panel and its individual criteria.
 */
test.describe('Search Payers by Name or Code - Advanced search', () => {
  test('TC-018: should return only the matching payer when a Licence Number is searched', async ({
    payerManagementPage,
  }) => {
    await payerManagementPage.open();

    const advanced = await payerManagementPage.openAdvancedSearch();
    await advanced.fill({ licenseNumber: KNOWN_PAYER.licenseNumber });
    await advanced.submit();

    // Every returned row carries exactly that licence number.
    await payerManagementPage.expectAllLicenseNumbers(KNOWN_PAYER.licenseNumber);
  });

  // TC-019: the two advanced criteria must combine, and each must work alone.
  for (const combination of ADVANCED_SEARCH_COMBINATIONS) {
    test(`TC-019: should apply the entered criteria when ${combination.label}`, async ({
      payerManagementPage,
    }) => {
      await payerManagementPage.open();

      const advanced = await payerManagementPage.openAdvancedSearch();
      await advanced.fill({
        ...(combination.nameOrCode === undefined ? {} : { nameOrCode: combination.nameOrCode }),
        ...(combination.licenseNumber === undefined
          ? {}
          : { licenseNumber: combination.licenseNumber }),
      });
      await advanced.submit();

      // Each combination returns results; the empty pair falls back to the list.
      await payerManagementPage.expectResultsFound();
    });
  }

  test('TC-019: should return nothing when the Name/Code and Licence Number criteria contradict each other', async ({
    payerManagementPage,
  }) => {
    await payerManagementPage.open();

    const advanced = await payerManagementPage.openAdvancedSearch();
    await advanced.fill(CONTRADICTORY_ADVANCED_SEARCH);
    await advanced.submit();

    // Proof the criteria combine as AND rather than OR.
    await payerManagementPage.expectEmptyState();
  });

  test('TC-024: should let an administrator locate a payer by Licence Number and open its record', async ({
    payerManagementPage,
  }) => {
    await payerManagementPage.open();

    const advanced = await payerManagementPage.openAdvancedSearch();
    await advanced.fill({ licenseNumber: KNOWN_PAYER.licenseNumber });
    await advanced.submit();
    await payerManagementPage.expectAllLicenseNumbers(KNOWN_PAYER.licenseNumber);

    // The located record opens and is the right organisation.
    const detail = await payerManagementPage.openDetails(KNOWN_PAYER.name);
    await expect
      .poll(() => detail.getFieldValue(DETAIL_LABELS.licenseNumber))
      .toContain(KNOWN_PAYER.licenseNumber);
  });

  test('TC-027: should present all search controls and advanced criteria per the checklist', async ({
    payerManagementPage,
  }) => {
    await payerManagementPage.open();

    // Search icon, meaningful placeholder and the advanced toggle.
    await payerManagementPage.expectSearchUiPresent();

    // The clear control appears once text has been entered.
    await payerManagementPage.typeInSearch(KNOWN_PAYER.namePartial);
    await payerManagementPage.expectClearControlVisible();
    await payerManagementPage.clearSearchBox();

    // The advanced panel exposes each documented criterion.
    const advanced = await payerManagementPage.openAdvancedSearch();
    const labels = await advanced.getFieldLabels();
    expect(labels).toEqual(
      expect.arrayContaining([
        ADVANCED_SEARCH_FIELDS.nameOrCode,
        ADVANCED_SEARCH_FIELDS.payerType,
        ADVANCED_SEARCH_FIELDS.status,
        ADVANCED_SEARCH_FIELDS.licenseNumber,
      ]),
    );
    await advanced.cancel();
  });
});
