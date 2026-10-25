import { test, expect } from '../../../fixtures';
import {
  CASES,
  COMBINATIONS,
  EXPORT_FILE,
  EXPORT_HEADERS,
  SCOPE,
  XLSX_SIGNATURE,
} from '../../../data/networks/exportNetworkList.data';

/**
 * User story 14121: Export network list to CSV or Excel.
 * What each scope and format writes: the whole register, the filtered set,
 * across pages, and nothing at all.
 *
 * "All Networks" is the menu's "Export All Data" and "Filtered Results" its
 * "Selected Export" (see the data file). The register size is read from the
 * list's own request in the same payer scope the export uses.
 */
test.describe('US 14121 - Export scope and format', () => {
  test(`TC-${CASES.allCsv.azureId}: should download every network in CSV when All Networks and CSV are chosen`, async ({
    networkManagementPage,
    steps,
  }) => {
    let register = -1;

    await steps.critical('Navigate to the Network Management module - the directory lists networks', async () => {
      register = await networkManagementPage.captureListTotal(() => networkManagementPage.openList());
      expect(register, 'the register should hold at least 5 networks').toBeGreaterThanOrEqual(5);
    });

    await steps.step('The export offers both scopes and then both formats', async () => {
      const menu = networkManagementPage.exportMenu();
      await menu.open();
      expect(await menu.getOfferedScopes()).toEqual(expect.arrayContaining([SCOPE.allNetworks, SCOPE.filteredResults]));
      await menu.chooseScope(SCOPE.allNetworks);
      await menu.expectFormatChoiceOffered();
      await menu.cancel();
    });

    await steps.step('The CSV downloads with every network in the register', async () => {
      const file = await networkManagementPage.exportAndParse(SCOPE.allNetworks, 'csv');
      expect(file.filename).toMatch(EXPORT_FILE);
      expect(file.filename.endsWith('.csv')).toBe(true);
      expect(file.parsed.headers).toEqual(EXPORT_HEADERS);
      expect(file.parsed.rows.length, 'one row per network in the register').toBe(register);
    });
  });

  test(`TC-${CASES.allExcel.azureId}: should download every network as an Excel workbook when All Networks and Excel are chosen`, async ({
    networkManagementPage,
    steps,
  }) => {
    let register = -1;

    await steps.critical('Navigate to the Network Management module - the directory lists networks', async () => {
      register = await networkManagementPage.captureListTotal(() => networkManagementPage.openList());
      expect(register).toBeGreaterThanOrEqual(5);
    });

    await steps.step('An .xlsx workbook downloads holding every network', async () => {
      const file = await networkManagementPage.exportAndParse(SCOPE.allNetworks, 'excel');
      expect(file.filename).toMatch(EXPORT_FILE);
      expect(file.filename.endsWith('.xlsx')).toBe(true);
      expect(file.bytes.subarray(0, 2).toString('utf8'), 'a real workbook is a zip').toBe(XLSX_SIGNATURE);
      expect(file.parsed.headers).toEqual(EXPORT_HEADERS);
      expect(file.parsed.rows.length, 'one row per network in the register').toBe(register);
    });
  });

  test(`TC-${CASES.filteredCsv.azureId}: should write only the Active networks to CSV when Filtered Results is exported under a Status filter`, async ({
    networkManagementPage,
    steps,
  }) => {
    const data = CASES.filteredCsv;
    let filtered = -1;

    await steps.critical('Navigate to the module and filter by Status Active - only Active networks show', async () => {
      await networkManagementPage.openList();
      filtered = await networkManagementPage.captureListTotal(() => networkManagementPage.applyQuickFilter('status', data.status));
      expect(filtered).toBeGreaterThan(0);
    });

    await steps.step('The CSV holds exactly the filtered networks', async () => {
      const file = await networkManagementPage.exportAndParse(SCOPE.filteredResults, 'csv');
      expect(file.parsed.headers).toEqual(EXPORT_HEADERS);
      expect(file.parsed.rows.length, 'every Active network and nothing else').toBe(filtered);
    });
  });

  test(`TC-${CASES.filteredExcel.azureId}: should write only the matching networks to Excel when Filtered Results is exported under a Type filter`, async ({
    networkManagementPage,
    steps,
  }) => {
    const data = CASES.filteredExcel;
    let filtered = -1;

    await steps.critical(`Navigate to the module and filter by Type ${data.type}`, async () => {
      await networkManagementPage.openList();
      filtered = await networkManagementPage.captureListTotal(() => networkManagementPage.applyQuickFilter('type', data.type));
      expect(filtered).toBeGreaterThan(0);
    });

    await steps.step(`The workbook holds exactly the ${data.type} networks`, async () => {
      const file = await networkManagementPage.exportAndParse(SCOPE.filteredResults, 'excel');
      expect(file.bytes.subarray(0, 2).toString('utf8')).toBe(XLSX_SIGNATURE);
      expect(file.parsed.rows.length, `every ${data.type} network and nothing else`).toBe(filtered);
      expect(file.parsed.rows.filter((row) => row[EXPORT_HEADERS[3]] !== data.type), `rows typed other than ${data.type}`).toEqual([]);
    });
  });

  test(`TC-${CASES.acrossPages.azureId}: should export every matching record across pages when Filtered Results is exported from page one`, async ({
    networkManagementPage,
    steps,
  }) => {
    const data = CASES.acrossPages;
    let filtered = -1;
    let onPage = -1;

    await steps.critical('Navigate to the module and apply a filter spanning several pages, on page 1', async () => {
      await networkManagementPage.openList();
      filtered = await networkManagementPage.captureListTotal(() => networkManagementPage.applyQuickFilter('status', data.status));
      onPage = await networkManagementPage.getVisibleRowCount();
      expect(filtered, 'the filter should match more records than one page shows').toBeGreaterThan(onPage);
      await networkManagementPage.expectCurrentPage(1);
    });

    await steps.step('The file holds records beyond the current page - every match', async () => {
      const file = await networkManagementPage.exportAndParse(SCOPE.filteredResults, 'csv');
      expect(file.parsed.rows.length, `more than the ${onPage} rows on page 1`).toBeGreaterThan(onPage);
      expect(file.parsed.rows.length, 'every matching record').toBe(filtered);
    });
  });

  test(`TC-${CASES.zeroMatch.azureId}: should produce a header-only file without an error when Filtered Results matches nothing`, async ({
    networkManagementPage,
    steps,
  }) => {
    const data = CASES.zeroMatch;

    await steps.critical('Navigate to the module and search a code no network has - zero results', async () => {
      await networkManagementPage.openList();
      const total = await networkManagementPage.captureListTotal(() => networkManagementPage.search(data.term));
      expect(total).toBe(0);
    });

    await steps.step('The export completes with the headers and no rows', async () => {
      const file = await networkManagementPage.exportAndParse(SCOPE.filteredResults, 'csv');
      expect(file.parsed.headers, 'a header-only file').toEqual(EXPORT_HEADERS);
      expect(file.parsed.rows).toEqual([]);
    });
  });

  test(`TC-${CASES.combinations.azureId}: should scope and format each file correctly for all four scope and format combinations`, async ({
    networkManagementPage,
    steps,
  }) => {
    const data = CASES.combinations;
    let register = -1;
    let filtered = -1;

    await steps.critical('Navigate to the module - the directory loads', async () => {
      register = await networkManagementPage.captureListTotal(() => networkManagementPage.openList());
      filtered = await networkManagementPage.captureListTotal(() => networkManagementPage.applyQuickFilter('status', data.status));
      expect(filtered).toBeLessThan(register);
    });

    for (const combination of COMBINATIONS) {
      await steps.step(`${combination.scope} / ${combination.format} writes the right rows in the right format`, async () => {
        const file = await networkManagementPage.exportAndParse(combination.scope, combination.format);
        const expectedRows = { [SCOPE.allNetworks]: register, [SCOPE.filteredResults]: filtered }[combination.scope];
        expect(file.filename.endsWith(combination.extension), `file "${file.filename}"`).toBe(true);
        expect(file.parsed.rows.length, `${combination.scope} should write ${expectedRows} rows`).toBe(expectedRows);
      });
    }
  });

  test(`TC-${CASES.analystFlow.azureId}: should give the analyst an Excel file of exactly the filtered networks when filtering by status and type`, async ({
    networkManagementPage,
    steps,
  }) => {
    const data = CASES.analystFlow;
    let filtered = -1;

    await steps.critical('Navigate to the module - the directory loads', async () => {
      await networkManagementPage.openList();
    });

    await steps.step('Status Active and Type HMO narrow the list to matching networks', async () => {
      await networkManagementPage.applyQuickFilter('status', data.status);
      filtered = await networkManagementPage.captureListTotal(() => networkManagementPage.applyQuickFilter('type', data.type));
      expect(filtered).toBeGreaterThan(0);
    });

    await steps.step('The Filtered Results workbook opens and holds exactly that data', async () => {
      const file = await networkManagementPage.exportAndParse(SCOPE.filteredResults, 'excel');
      expect(file.bytes.subarray(0, 2).toString('utf8')).toBe(XLSX_SIGNATURE);
      expect(file.parsed.headers).toEqual(EXPORT_HEADERS);
      expect(file.parsed.rows.length).toBe(filtered);
      expect(file.parsed.rows.filter((row) => row[EXPORT_HEADERS[3]] !== data.type)).toEqual([]);
    });
  });
});
