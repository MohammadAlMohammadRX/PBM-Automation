import { test, expect } from '../../../fixtures';
import {
  BLOCKED_CASES,
  CASES,
  COL,
  EXPORT_FILE,
  FILTER_A,
  FILTER_B,
  NO_MATCH_TERM,
  SCOPE,
  SHEET_HEADER_WORDS,
  cellAt,
} from '../../../data/networks/arabicPayerExport.data';

/**
 * User story 14303: Include Arabic details and owning payer when exporting the
 * network list.
 * Which rows the Arabic-interface export writes - all, filtered, none, the
 * CURRENT filter - plus its naming, header order and permission.
 */
test.describe('US 14303 - Export scope in the Arabic interface', () => {
  test.beforeEach(async ({ languageSwitcher, cleanup }) => {
    cleanup.register(() => languageSwitcher.switchTo('en'));
  });

  test(`TC-${CASES.scopePrompt.azureId}: should ask whether to export all networks or only the filtered results when a filter is applied`, async ({
    networkManagementPage,
    languageSwitcher,
    steps,
  }) => {
    await steps.critical('Navigate to the module in Arabic', async () => {
      await networkManagementPage.openList();
      await languageSwitcher.switchTo('ar');
      await networkManagementPage.openList();
    });

    await steps.step('A status filter narrows the grid to a subset', async () => {
      const total = await networkManagementPage.captureListTotal(() => networkManagementPage.applyQuickFilter('status', CASES.scopePrompt.filter));
      expect(total).toBeGreaterThan(0);
    });

    await steps.step('Export offers the choice of all networks or only the filtered results', async () => {
      const menu = networkManagementPage.exportMenu();
      await menu.open();
      expect(await menu.getOfferedScopes()).toEqual(expect.arrayContaining([SCOPE.allNetworks, SCOPE.filteredResults]));
      await menu.cancelMenu();
    });
  });

  test(`TC-${CASES.allIgnoresFilter.azureId}: should export every network with its Arabic data when All Networks is chosen under a filter`, async ({
    networkManagementPage,
    languageSwitcher,
    steps,
  }) => {
    let register = -1;

    await steps.critical('Navigate to the module in Arabic', async () => {
      await networkManagementPage.openList();
      await languageSwitcher.switchTo('ar');
      register = await networkManagementPage.captureListTotal(() => networkManagementPage.openList());
    });

    await steps.step('A filter narrows the grid to fewer networks than the register', async () => {
      const filtered = await networkManagementPage.captureListTotal(() => networkManagementPage.applyQuickFilter('status', CASES.allIgnoresFilter.filter));
      expect(filtered).toBeLessThan(register);
    });

    await steps.step('The All Networks file holds the whole register, every row with its Arabic name', async () => {
      const file = await networkManagementPage.exportAndParse(SCOPE.allNetworks, 'csv');
      expect(file.parsed.rows.length, 'the filter must be ignored').toBe(register);
      expect(file.parsed.rows.filter((row) => cellAt(file.parsed, row, COL.nameAr) === ''), 'rows without an Arabic name').toEqual([]);
    });
  });

  test(`TC-${CASES.filteredOnly.azureId}: should export exactly the payer's networks with Arabic and payer data when Filtered Results is chosen`, async ({
    networkManagementPage,
    languageSwitcher,
    publishedPayer,
    networkIn,
    steps,
  }) => {
    test.setTimeout(15 * 60_000);
    const owned = await networkIn('Draft', { payerName: publishedPayer.nameEn });
    let filtered = -1;
    let payerCode = '';

    await steps.critical('Navigate to the module in Arabic filtered to the payer', async () => {
      await networkManagementPage.openListFor(publishedPayer.nameEn);
      expect((await networkManagementPage.readRow(owned.name)).code).not.toBe('');
      await languageSwitcher.switchTo('ar');
      filtered = await networkManagementPage.captureListTotal(() => networkManagementPage.openListFor(publishedPayer.nameEn));
      expect(filtered).toBeGreaterThan(0);
    });

    await steps.step('The Filtered Results file holds exactly the filtered networks', async () => {
      const file = await networkManagementPage.exportAndParse(SCOPE.filteredResults, 'csv');
      expect(file.parsed.rows.length, 'every filtered network and no other').toBe(filtered);
      payerCode = cellAt(file.parsed, file.parsed.rows[0] ?? {}, COL.payer);
    });

    await steps.step('Every exported row carries its Arabic name and the selected payer', async () => {
      const file = await networkManagementPage.exportAndParse(SCOPE.filteredResults, 'csv');
      expect(payerCode, 'the payer should be exported').not.toBe('');
      expect(file.parsed.rows.filter((row) => cellAt(file.parsed, row, COL.nameAr) === '')).toEqual([]);
      expect(file.parsed.rows.filter((row) => cellAt(file.parsed, row, COL.payer) !== payerCode), 'rows of another or no payer').toEqual([]);
    });
  });

  test(`TC-${CASES.zeroResults.azureId}: should handle a zero-result Filtered Results export with a header-only file when nothing matches`, async ({
    networkManagementPage,
    languageSwitcher,
    steps,
  }) => {
    await steps.critical('Navigate to the module in Arabic', async () => {
      await networkManagementPage.openList();
      await languageSwitcher.switchTo('ar');
      await networkManagementPage.openList();
    });

    await steps.step('A search nothing matches shows no results', async () => {
      expect(await networkManagementPage.captureListTotal(() => networkManagementPage.search(NO_MATCH_TERM))).toBe(0);
    });

    await steps.step('The export completes with headers and no rows, not a corrupt file', async () => {
      const file = await networkManagementPage.exportAndParse(SCOPE.filteredResults, 'csv');
      expect(file.parsed.headers.length, 'the header row should be written').toBeGreaterThan(0);
      expect(file.parsed.rows).toEqual([]);
    });
  });

  test(`TC-${CASES.noPermission.azureId}: should not let a view-only user export the list in any format`, async ({
    shapedNonAdmin,
    steps,
  }) => {
    const session = await shapedNonAdmin({ without: ['exportNetworks'] });

    await steps.critical('The view-only user opens the directory in Arabic', async () => {
      await session.networks.openList();
      await session.networks.languageSwitcher().switchTo('ar');
      await session.networks.openList();
    });

    await steps.step('The Export control is withheld and no export can be completed', async () => {
      await session.networks.exportMenu().expectExportRefused();
    });
  });

  test(`TC-${CASES.naming.azureId}: should name both files by convention and write the same documented headers in the same order`, async ({
    networkManagementPage,
    languageSwitcher,
    steps,
  }) => {
    let csv!: Awaited<ReturnType<typeof networkManagementPage.exportAndParse>>;
    let excel!: Awaited<ReturnType<typeof networkManagementPage.exportAndParse>>;

    await steps.critical('Navigate to the module in Arabic', async () => {
      await networkManagementPage.openList();
      await languageSwitcher.switchTo('ar');
      await networkManagementPage.openList();
    });

    await steps.step('The CSV and Excel files both download, named "Networks_" plus a timestamp', async () => {
      csv = await networkManagementPage.exportAndParse(SCOPE.allNetworks, 'csv');
      excel = await networkManagementPage.exportAndParse(SCOPE.allNetworks, 'excel');
      expect(csv.filename).toMatch(EXPORT_FILE);
      expect(excel.filename).toMatch(EXPORT_FILE);
    });

    await steps.step('Both files carry the same headers in the same order', async () => {
      expect(excel.parsed.headers).toEqual(csv.parsed.headers);
    });

    await steps.step('The headers include names, descriptions, owning payer, type, status and approval status', async () => {
      const headers = csv.parsed.headers.join(' | ');
      expect(SHEET_HEADER_WORDS.filter((word) => !headers.includes(word)), `columns missing from: ${headers}`).toEqual([]);
    });
  });

  test(`TC-${CASES.currentState.azureId}: should export the filter applied at the moment of export rather than an earlier one`, async ({
    networkManagementPage,
    languageSwitcher,
    steps,
  }) => {
    let onScreen: string[] = [];

    await steps.critical('Navigate to the module in Arabic', async () => {
      await networkManagementPage.openList();
      await languageSwitcher.switchTo('ar');
      await networkManagementPage.openList();
    });

    await steps.step('Filter A, then Filter B, are applied - the grid shows Filter B\'s networks', async () => {
      await networkManagementPage.applyQuickFilter('status', FILTER_A);
      await networkManagementPage.applyQuickFilter('status', FILTER_B);
      onScreen = await networkManagementPage.readCodesOnPage();
      expect(onScreen.length).toBeGreaterThan(0);
    });

    await steps.step('The Filtered Results file holds Filter B\'s networks, not Filter A\'s', async () => {
      const file = await networkManagementPage.exportAndParse(SCOPE.filteredResults, 'csv');
      const exported = file.parsed.rows.map((row) => cellAt(file.parsed, row, COL.code));
      expect(onScreen.filter((code) => !exported.includes(code)), 'networks on screen missing from the file').toEqual([]);
    });
  });

  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.azureId}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
