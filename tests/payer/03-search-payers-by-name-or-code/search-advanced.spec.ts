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
 *
 * Steps are recorded through the `steps` fixture. Opening the panel, entering
 * criteria and submitting are `critical` - if the search was never submitted,
 * asserting on its results would report a failure that says nothing about the
 * application. Each assertion on the results is a `step`.
 */
test.describe('Search Payers by Name or Code - Advanced search', () => {
  test('TC-018: should return only the matching payer when a Licence Number is searched', async ({
    payerManagementPage,
    steps,
  }) => {
    let advanced!: Awaited<ReturnType<typeof payerManagementPage.openAdvancedSearch>>;

    await steps.critical('Open the payer list', () => payerManagementPage.open());

    await steps.critical('Open the Advanced Search panel', async () => {
      advanced = await payerManagementPage.openAdvancedSearch();
    });

    await steps.critical(
      `Search by Licence Number "${KNOWN_PAYER.licenseNumber}"`,
      async () => {
        await advanced.fill({ licenseNumber: KNOWN_PAYER.licenseNumber });
        await advanced.submit();
      },
    );

    // Every returned row carries exactly that licence number.
    await steps.step('Every returned row carries exactly that licence number', () =>
      payerManagementPage.expectAllLicenseNumbers(KNOWN_PAYER.licenseNumber));
  });

  // TC-019: the two advanced criteria must combine, and each must work alone.
  for (const combination of ADVANCED_SEARCH_COMBINATIONS) {
    test(`TC-019: should apply the entered criteria when ${combination.label}`, async ({
      payerManagementPage,
      steps,
    }) => {
      let advanced!: Awaited<ReturnType<typeof payerManagementPage.openAdvancedSearch>>;

      await steps.critical('Open the payer list', () => payerManagementPage.open());

      await steps.critical('Open the Advanced Search panel', async () => {
        advanced = await payerManagementPage.openAdvancedSearch();
      });

      await steps.critical(`Enter the criteria for ${combination.label} and submit`, async () => {
        await advanced.fill({
          ...(combination.nameOrCode === undefined ? {} : { nameOrCode: combination.nameOrCode }),
          ...(combination.licenseNumber === undefined
            ? {}
            : { licenseNumber: combination.licenseNumber }),
        });
        await advanced.submit();
      });

      // Each combination returns results; the empty pair falls back to the list.
      await steps.step('The search returns results', () =>
        payerManagementPage.expectResultsFound());
    });
  }

  test('TC-019: should return nothing when the Name/Code and Licence Number criteria contradict each other', async ({
    payerManagementPage,
    steps,
  }) => {
    let advanced!: Awaited<ReturnType<typeof payerManagementPage.openAdvancedSearch>>;

    await steps.critical('Open the payer list', () => payerManagementPage.open());

    await steps.critical('Open the Advanced Search panel', async () => {
      advanced = await payerManagementPage.openAdvancedSearch();
    });

    await steps.critical('Enter contradictory Name/Code and Licence Number criteria', async () => {
      await advanced.fill(CONTRADICTORY_ADVANCED_SEARCH);
      await advanced.submit();
    });

    // Proof the criteria combine as AND rather than OR.
    await steps.step('Nothing is returned, proving the criteria combine as AND not OR', () =>
      payerManagementPage.expectEmptyState());
  });

  test('TC-024: should let an administrator locate a payer by Licence Number and open its record', async ({
    payerManagementPage,
    steps,
  }) => {
    let advanced!: Awaited<ReturnType<typeof payerManagementPage.openAdvancedSearch>>;
    let detail!: Awaited<ReturnType<typeof payerManagementPage.openDetails>>;

    await steps.critical('Open the payer list', () => payerManagementPage.open());

    await steps.critical('Open the Advanced Search panel', async () => {
      advanced = await payerManagementPage.openAdvancedSearch();
    });

    await steps.critical(`Search by Licence Number "${KNOWN_PAYER.licenseNumber}"`, async () => {
      await advanced.fill({ licenseNumber: KNOWN_PAYER.licenseNumber });
      await advanced.submit();
    });

    await steps.step('Every returned row carries exactly that licence number', () =>
      payerManagementPage.expectAllLicenseNumbers(KNOWN_PAYER.licenseNumber));

    // The located record opens and is the right organisation.
    await steps.critical('Open the located record', async () => {
      detail = await payerManagementPage.openDetails(KNOWN_PAYER.name);
    });

    await steps.step('The opened record is the right organisation', async () => {
      await expect
        .poll(() => detail.getFieldValue(DETAIL_LABELS.licenseNumber))
        .toContain(KNOWN_PAYER.licenseNumber);
    });
  });

  test('TC-027: should present all search controls and advanced criteria per the checklist', async ({
    payerManagementPage,
    steps,
  }) => {
    let advanced!: Awaited<ReturnType<typeof payerManagementPage.openAdvancedSearch>>;

    await steps.critical('Open the payer list', () => payerManagementPage.open());

    // Search icon, meaningful placeholder and the advanced toggle.
    await steps.step('The search icon, placeholder and advanced toggle are present', () =>
      payerManagementPage.expectSearchUiPresent());

    // The clear control appears once text has been entered.
    await steps.critical('Type a search term', () =>
      payerManagementPage.typeInSearch(KNOWN_PAYER.namePartial));

    await steps.step('The clear control appears once text has been entered', () =>
      payerManagementPage.expectClearControlVisible());

    await steps.critical('Clear the search box', () => payerManagementPage.clearSearchBox());

    // The advanced panel exposes each documented criterion.
    await steps.critical('Open the Advanced Search panel', async () => {
      advanced = await payerManagementPage.openAdvancedSearch();
    });

    await steps.step('The advanced panel exposes every documented criterion', async () => {
      const labels = await advanced.getFieldLabels();
      expect(labels).toEqual(
        expect.arrayContaining([
          ADVANCED_SEARCH_FIELDS.nameOrCode,
          ADVANCED_SEARCH_FIELDS.payerType,
          ADVANCED_SEARCH_FIELDS.status,
          ADVANCED_SEARCH_FIELDS.licenseNumber,
        ]),
      );
    });

    await steps.critical('Close the Advanced Search panel', () => advanced.cancel());
  });
});
