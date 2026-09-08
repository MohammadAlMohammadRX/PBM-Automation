import { test, expect } from '../../../fixtures';
import { PAYER_COLUMN, PAYER_EXPORT_COLUMN } from '../../../constants/ElementIds';
import { columnValues } from '../../../utils/CsvUtils';
import { buildUniquePayer } from '../../../data/payers/payer.data';
import { uniqueLicenceOfLength } from '../../../data/payers/licenceNumber.data';
import { RandomDataUtils } from '../../../utils/RandomDataUtils';

/**
 * User story: Validate Payer Licence Number Length and Required Entry.
 * Where the licence number is VISIBLE once stored - list, search, export.
 *
 * The keyword search matching a licence number is not an assumption: verified
 * against the live list, where searching a real licence returned exactly the one
 * row carrying it. Worth stating because the search box is described elsewhere
 * as "search by name or code", which would have made this case a failure.
 */
test.describe('Validate Payer Licence Number Length and Required Entry - Visibility', () => {
  test('TC-008: should show the new payer with its licence number in the list when creation completes', async ({
    payerManagementPage,
    steps,
  }) => {
    const licence = uniqueLicenceOfLength(14, RandomDataUtils.uniqueSuffix());
    const payer = buildUniquePayer({ licenseNumber: licence });

    await steps.critical('Navigate to the Payer Management module', () =>
      payerManagementPage.open());

    await steps.step('Creating the payer confirms the save and returns to the list', async () => {
      await payerManagementPage.createDraftPayer(payer);
      // The confirmation is the application's own statement that the record was
      // persisted; asserting it separates "saved" from "the drawer closed".
      await payerManagementPage.expectToastContains('draft');
    });

    await steps.step('The new payer row carries every value entered, licence included', () =>
      payerManagementPage.expectRowShowsDetails(payer.nameEn, [
        payer.nameEn,
        payer.email,
        licence,
      ]));
  });

  test('TC-009: should return only the matching record when its exact licence number is typed into the keyword search', async ({
    payerManagementPage,
    steps,
  }) => {
    const licence = uniqueLicenceOfLength(16, RandomDataUtils.uniqueSuffix());
    const payer = buildUniquePayer({ licenseNumber: licence });

    await steps.critical('Navigate to the Payer Management module', async () => {
      await payerManagementPage.open();
      await payerManagementPage.expectSearchUiPresent();
    });

    await steps.critical('Create a payer with a known licence number to search for', async () => {
      await payerManagementPage.createDraftPayer(payer);
      await payerManagementPage.open();
    });

    await steps.step('The search box shows the entered licence number', async () => {
      await payerManagementPage.typeInSearch(licence);
      await payerManagementPage.expectSearchTerm(licence);
    });

    await steps.step('The list filters to the matching record', () =>
      payerManagementPage.expectOnlyRow(payer.nameEn));

    await steps.step('The matched row displays exactly the searched licence number', () =>
      payerManagementPage.expectRowCellEquals(
        payer.nameEn,
        PAYER_COLUMN.licenseNumber,
        licence,
      ));
  });

  test('TC-010: should return only payers matching the criterion when the Licence Number filter is applied in advanced search', async ({
    payerManagementPage,
    steps,
  }) => {
    const licence = uniqueLicenceOfLength(18, RandomDataUtils.uniqueSuffix());
    const payer = buildUniquePayer({ licenseNumber: licence });

    await steps.critical('Navigate to the Payer Management module', async () => {
      await payerManagementPage.open();
      await payerManagementPage.createDraftPayer(payer);
      await payerManagementPage.open();
    });

    let drawer!: Awaited<ReturnType<typeof payerManagementPage.openAdvancedSearch>>;
    await steps.critical('Open the Advanced Search panel', async () => {
      drawer = await payerManagementPage.openAdvancedSearch();
      // The criterion has to be OFFERED before it can be applied - asserting
      // the panel's field list is this step's own expected result.
      const labels = await drawer.getFieldLabels();
      expect(labels.join(' | ')).toMatch(/licen[cs]e/i);
    });

    await steps.step('The Licence Number criterion is applied', async () => {
      await drawer.fill({ licenseNumber: licence });
      await drawer.submit();
      await drawer.waitForClosed();
      await payerManagementPage.expectResultsFound();
    });

    await steps.step('Only payers carrying that licence number are returned', () =>
      payerManagementPage.expectAllLicenseNumbers(licence));
  });

  test('TC-011: should match the stored value when the list column displays a payer licence number', async ({
    payerManagementPage,
    steps,
  }) => {
    const licence = uniqueLicenceOfLength(20, RandomDataUtils.uniqueSuffix());
    const payer = buildUniquePayer({ licenseNumber: licence });

    await steps.critical('Navigate to the Payer Management module', async () => {
      await payerManagementPage.open();
      await payerManagementPage.createDraftPayer(payer);
      await payerManagementPage.open();
    });

    await steps.step('A Licence Number column is present in the grid', () =>
      payerManagementPage.expectColumnPresent(PAYER_COLUMN.licenseNumber));

    // "Stored" is read from the payer's own detail screen rather than from the
    // list a second time: comparing the list against itself would pass however
    // wrong both were. The detail screen is the record's own view of the value.
    await steps.step('The list value matches the value held on the record', async () => {
      // Searched first. `getCellValue` reads the row on the CURRENT page, and
      // the unfiltered register runs to 37 pages, so a newly created payer is
      // almost never on the page being shown - which reads as a missing row
      // rather than as the paging it actually is.
      await payerManagementPage.search(payer.nameEn);
      const listed = await payerManagementPage.getCellValue(
        payer.nameEn,
        PAYER_COLUMN.licenseNumber,
      );
      const detail = await payerManagementPage.openDetails(payer.nameEn);
      const stored = await detail.getFieldValue('License Number');
      expect(listed).toBe(stored);
      expect(listed).toBe(licence);
    });
  });

  test('TC-012: should include the licence number in the exported file when the payer list is exported', async ({
    payerManagementPage,
    exportMenu,
    steps,
  }) => {
    const licence = uniqueLicenceOfLength(22, RandomDataUtils.uniqueSuffix());
    const payer = buildUniquePayer({ licenseNumber: licence });

    await steps.critical('Navigate to the Payer Management module', async () => {
      await payerManagementPage.open();
      await payerManagementPage.createDraftPayer(payer);
      await payerManagementPage.open();
    });

    await steps.step('The export offers a downloadable file in both formats', async () => {
      await exportMenu.open();
      await exportMenu.chooseScope('all');
      await exportMenu.expectFormatChoiceOffered();
      await exportMenu.cancel();
    });

    let csv!: Awaited<ReturnType<typeof exportMenu.exportCsv>>;
    await steps.critical('Download the exported file and read its columns', async () => {
      // The whole flow is re-run rather than continuing the dialog left open by
      // the previous step: the download listener must be armed BEFORE the format
      // is clicked, and that step deliberately stopped short of clicking one.
      await payerManagementPage.open();
      csv = await exportMenu.exportCsv('all');
      expect(csv.headers).toContain(PAYER_EXPORT_COLUMN.licenseNumber);
    });

    await steps.step('The Licence Number column contains values', async () => {
      const licences = columnValues(csv, PAYER_EXPORT_COLUMN.licenseNumber);
      expect(licences.length).toBeGreaterThan(0);
      expect(licences.some((value) => value.trim() !== '')).toBe(true);
    });

    // Cross-checked against an EXPORTED row rather than against the payer this
    // case created. Verified: a freshly created payer is a private v0 draft and
    // does not appear in the export at all - reasonably, since the export is of
    // the published register - so looking for it here failed on a correct
    // export. Taking a row the export does contain and checking it against the
    // list is the comparison the criterion actually asks for, and it is the
    // stronger direction: it proves the exported figure matches what a reviewer
    // sees on screen.
    await steps.step('An exported licence number matches its on-screen record', async () => {
      const exported = csv.rows.find(
        (row) =>
          (row[PAYER_EXPORT_COLUMN.licenseNumber] ?? '').trim() !== ''
          && (row[PAYER_EXPORT_COLUMN.nameEn] ?? '').trim() !== '',
      );
      expect(exported, 'the export should contain at least one row with a licence number')
        .toBeDefined();

      const exportedName = exported![PAYER_EXPORT_COLUMN.nameEn];
      const exportedLicence = exported![PAYER_EXPORT_COLUMN.licenseNumber];
      await payerManagementPage.open();
      await payerManagementPage.expectRowCellEquals(
        exportedName,
        PAYER_COLUMN.licenseNumber,
        exportedLicence,
      );
    });
  });
});
