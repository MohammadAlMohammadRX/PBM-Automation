import { test, expect } from '../../../fixtures';
import { NetworkUtils } from '../../../utils/NetworkUtils';
import { parseCsv } from '../../../utils/CsvUtils';
import { parseXlsx } from '../../../utils/XlsxUtils';
import {
  BLOCKED_CASES,
  CASES,
  COMBINATIONS,
  EXPORT_COLUMN,
  EXPORT_FILENAME,
  FILENAME_CLOCK_WINDOW_MS,
  SCOPE,
  XLSX_SIGNATURE,
  dataHeaders,
  exportColumn,
  filenameTimestamp,
  sameHeader,
} from '../../../data/plans/exportPlanDirectory.data';

/**
 * User story 14158: Export plan directory to CSV or Excel.
 * The export FLOW - the scope and format prompts, each format/scope
 * combination, the empty export, cancelling, the file name, who may export,
 * and an export service that is down.
 *
 * The screen asks scope first, then format (see the data file); each step
 * asserts the sheet's expectation where the screen meets it.
 */
test.describe('US 14158 - Export flow', () => {
  test(`TC-${CASES.allCsv.azureId}: should download every plan with all table columns as CSV when All plans is exported`, async ({
    planManagementPage,
    steps,
  }) => {
    const menu = planManagementPage.exportMenu();
    let total = -1;
    let headers: string[] = [];
    let file!: { filename: string; bytes: Buffer };

    await steps.critical('Navigate to the Plans Management module - the plan directory is displayed', async () => {
      total = await planManagementPage.captureListTotal(() => planManagementPage.openList());
      headers = dataHeaders(await planManagementPage.getHeaderTexts());
      expect(total, 'at least five plans exist').toBeGreaterThanOrEqual(CASES.allCsv.minimumPlans);
    });

    await steps.critical('Clicking Export prompts for the scope of the export', async () => {
      await menu.open();
      expect(await menu.isMenuOpen(), 'the Export prompt should open').toBe(true);
      expect(await menu.getOfferedScopes()).toEqual(expect.arrayContaining([SCOPE.allPlans, SCOPE.filteredResults]));
    });

    await steps.critical('CSV is offered as the file format', async () => {
      await menu.chooseScope(SCOPE.allPlans);
      expect(await menu.getOfferedFormats(), 'CSV should be offered').toContain('csv');
    });

    await steps.step('All plans is taken as the scope and the format prompt stands', async () => {
      expect(await menu.isMenuOpen(), 'the scope prompt should have closed on the choice').toBe(false);
      expect(await menu.isFormatDialogOpen(), 'the format prompt should be open for All plans').toBe(true);
    });

    await steps.critical('Confirming the export downloads a CSV file and reports success', async () => {
      file = await menu.chooseFormatAndRead('csv');
      expect(file.filename, 'the file name').toMatch(EXPORT_FILENAME.csv);
      expect(file.bytes.length, 'the file should not be empty').toBeGreaterThan(0);
      expect(await planManagementPage.waitForVisibleMessages(), 'a success indicator should be shown').not.toEqual([]);
    });

    await steps.step('The file holds every plan with every table column populated', async () => {
      const parsed = parseCsv(file.bytes.toString('utf8'));
      expect(parsed.rows.length, 'one row per plan in the directory').toBe(total);
      expect(headers.filter((header) => !parsed.headers.some((h) => sameHeader(h, header))), 'table columns missing from the file').toEqual([]);
      const code = exportColumn(parsed.headers, EXPORT_COLUMN.code);
      expect(parsed.rows.filter((row) => (row[code] ?? '').trim() === '').length, 'rows without a Plan Code').toBe(0);
    });
  });

  test(`TC-${CASES.filteredExcel.azureId}: should download only the filtered plans as Excel when Current filtered results is exported`, async ({
    planManagementPage,
    steps,
  }) => {
    const data = CASES.filteredExcel;
    const menu = planManagementPage.exportMenu();
    let filtered = -1;
    let file!: { filename: string; bytes: Buffer };

    await steps.critical(`Navigate to the module filtered by payer "${data.payer}" - the subset is shown`, async () => {
      await planManagementPage.openList();
      filtered = await planManagementPage.captureListTotal(() => planManagementPage.filterByPayer(data.payer));
      expect(filtered, `"${data.payer}" holds plans`).toBeGreaterThan(0);
    });

    await steps.critical('Clicking Export opens the prompt', async () => {
      await menu.open();
      expect(await menu.isMenuOpen()).toBe(true);
    });

    await steps.critical('Excel is offered as the file format', async () => {
      await menu.chooseScope(SCOPE.filteredResults);
      expect(await menu.getOfferedFormats(), 'Excel should be offered').toContain('excel');
    });

    await steps.step('Current filtered results is taken as the scope', async () => {
      expect(await menu.isFormatDialogOpen(), 'the format prompt should be open for the filtered scope').toBe(true);
    });

    await steps.critical('Confirming downloads an Excel (.xlsx) workbook', async () => {
      file = await menu.chooseFormatAndRead('excel');
      expect(file.filename).toMatch(EXPORT_FILENAME.excel);
      expect(file.bytes.subarray(0, 2).toString('latin1'), 'a real workbook').toBe(XLSX_SIGNATURE);
    });

    await steps.step('Only the plans matching the filter are in the file', async () => {
      const parsed = parseXlsx(file.bytes);
      const payer = exportColumn(parsed.headers, EXPORT_COLUMN.payer);
      expect(payer, 'the file should carry a Payer column').not.toBe('');
      expect(parsed.rows.filter((row) => row[payer] !== data.payer).length, `rows of a payer other than "${data.payer}"`).toBe(0);
      expect(parsed.rows.length, 'every filtered plan, across every page').toBe(filtered);
    });
  });

  test(`TC-${CASES.zeroRecords.azureId}: should produce a header-only file or a no-data message when the filtered export matches no plan`, async ({
    planManagementPage,
    steps,
  }) => {
    const data = CASES.zeroRecords;
    const menu = planManagementPage.exportMenu();

    await steps.critical('Navigate to the module filtered to nothing - the list is empty', async () => {
      await planManagementPage.openList();
      const total = await planManagementPage.captureListTotal(() => planManagementPage.search(data.term()));
      expect(total).toBe(0);
      expect(await planManagementPage.getTableBodyText()).toMatch(data.empty);
    });

    await steps.critical('Clicking Export opens the prompt', async () => {
      await menu.open();
      expect(await menu.isMenuOpen()).toBe(true);
    });

    await steps.step('CSV and Current filtered results can both be chosen', async () => {
      await menu.chooseScope(SCOPE.filteredResults);
      expect(await menu.getOfferedFormats()).toContain('csv');
      await menu.cancel();
    });

    await steps.step('Confirming yields a header-only file or a clear no-data message, without an error', async () => {
      const outcome = await planManagementPage.attemptExport(SCOPE.filteredResults, 'csv');
      const headerOnly = outcome.parsed !== null && outcome.parsed.rows.length === 0 && outcome.parsed.headers.length > 0;
      expect(
        headerOnly || (outcome.parsed === null && outcome.messages.length > 0),
        `expected a header-only file or a no-data message; got ${outcome.parsed ? `a file with ${outcome.parsed.rows.length} row(s)` : 'no file'} and messages [${outcome.messages.join(' | ')}]`,
      ).toBe(true);
    });
  });

  test(`TC-${CASES.combinations.azureId}: should produce the right file type and scope for each format and scope combination when exported`, async ({
    planManagementPage,
    steps,
  }) => {
    const data = CASES.combinations;
    const totals: Record<string, number> = {};

    await steps.critical(`Navigate to the module - plans are visible, then filtered by Status ${data.status}`, async () => {
      totals[SCOPE.allPlans] = await planManagementPage.captureListTotal(() => planManagementPage.openList());
      totals[SCOPE.filteredResults] = await planManagementPage.captureListTotal(() => planManagementPage.applyQuickFilter('status', data.status));
      expect(totals[SCOPE.filteredResults], `${data.status} plans exist`).toBeGreaterThan(0);
      expect(totals[SCOPE.filteredResults]).toBeLessThan(totals[SCOPE.allPlans]);
    });

    for (const combo of COMBINATIONS) {
      await steps.step(`${combo.label} downloads a ${combo.extension} file holding exactly that scope's plans`, async () => {
        const file = await planManagementPage.exportAndParse(combo.scope, combo.format);
        expect(file.filename.endsWith(combo.extension), `"${file.filename}" should be ${combo.extension}`).toBe(true);
        expect(file.parsed.rows.length, `${combo.label} row count`).toBe(totals[combo.scope]);
        const status = exportColumn(file.parsed.headers, EXPORT_COLUMN.status);
        expect(file.parsed.rows.filter((row) => combo.onlyStatus !== null && row[status] !== combo.onlyStatus).length, 'rows outside the filter').toBe(0);
      });
    }
  });

  test(`TC-${CASES.cancel.azureId}: should close the prompt and download nothing when the export is cancelled`, async ({
    planManagementPage,
    steps,
  }) => {
    const menu = planManagementPage.exportMenu();
    let rowsBefore = -1;
    let chipsBefore: string[] = [];
    let downloaded = true;

    await steps.critical('Navigate to the module - plans are visible', async () => {
      await planManagementPage.openList();
      await planManagementPage.expectRowsRendered();
      rowsBefore = await planManagementPage.getVisibleRowCount();
      chipsBefore = await planManagementPage.getChips();
    });

    await steps.critical('Clicking Export opens the selection prompt', async () => {
      await menu.open();
      expect(await menu.isMenuOpen()).toBe(true);
    });

    await steps.step('Choosing a scope and then Cancel closes the prompt and returns to the directory', async () => {
      await menu.chooseScope(SCOPE.allPlans);
      downloaded = await menu.expectNoDownloadWhile(() => menu.cancel());
      expect(await menu.isFormatDialogOpen(), 'the prompt should be closed').toBe(false);
    });

    await steps.step('No file was downloaded and the directory is unchanged', async () => {
      expect(downloaded, 'no file may be produced').toBe(false);
      expect(await planManagementPage.getVisibleRowCount()).toBe(rowsBefore);
      expect(await planManagementPage.getChips()).toEqual(chipsBefore);
    });
  });

  test(`TC-${CASES.filename.azureId}: should name every export Plans_yyyyMMdd_HHmmss with the format's extension when CSV and Excel are exported`, async ({
    planManagementPage,
    steps,
  }) => {
    let csvName = '';

    await steps.critical('Navigate to the module - plans are visible', async () => {
      await planManagementPage.openList();
      await planManagementPage.expectRowsRendered();
    });

    await steps.critical('A CSV export at the current time completes', async () => {
      const file = await planManagementPage.exportMenu().exportAndReadBytes(SCOPE.allPlans, 'csv');
      csvName = file.filename;
      expect(file.bytes.length).toBeGreaterThan(0);
    });

    await steps.step('The CSV file name is Plans_yyyyMMdd_HHmmss.csv with a valid, zero-padded timestamp', async () => {
      expect(csvName).toMatch(EXPORT_FILENAME.csv);
      const stamp = filenameTimestamp(csvName);
      expect(stamp, `"${csvName}" should carry a real date and time`).not.toBeNull();
      expect(Math.abs(stamp!.getTime() - Date.now()), 'the timestamp should be the time of the export').toBeLessThan(FILENAME_CLOCK_WINDOW_MS);
    });

    await steps.step('The Excel file name is Plans_yyyyMMdd_HHmmss.xlsx', async () => {
      const file = await planManagementPage.exportMenu().exportAndReadBytes(SCOPE.allPlans, 'excel');
      expect(file.filename).toMatch(EXPORT_FILENAME.excel);
      expect(filenameTimestamp(file.filename), `"${file.filename}" should carry a real date and time`).not.toBeNull();
    });
  });

  test(`TC-${CASES.permission.azureId}: should withhold the export when the user's role lacks the export permission`, async ({
    planManagementPage,
    shapedNonAdmin,
    requireBaseline,
    steps,
  }) => {
    const session = await shapedNonAdmin({ without: [CASES.permission.permission] });

    await steps.critical('Navigate to the module as the restricted user - the plan directory shows', async () => {
      await planManagementPage.openList();
      requireBaseline(await planManagementPage.exportMenu().isAvailable(), 'the Export action for a session holding ExportPlans');
      await session.plans.openList();
    });

    await steps.step('The Export action is hidden or disabled for this role', async () => {
      expect(await session.plans.exportMenu().isAvailable(), 'Export must not be offered without ExportPlans').toBe(false);
    });

    await steps.step('Any attempt to run the export is refused and produces no file', async () => {
      await session.plans.exportMenu().expectExportRefused();
    });
  });

  test(`TC-${CASES.serviceDown.azureId}: should report a clear error and deliver no file when the export service is unavailable`, async ({
    page,
    planManagementPage,
    cleanup,
    steps,
  }) => {
    test.slow();
    const menu = planManagementPage.exportMenu();
    cleanup.register(() => NetworkUtils.restore(page));
    let endpoint = '';
    let downloaded = true;

    await steps.critical('Navigate to the module - plans are visible', async () => {
      await planManagementPage.openList();
      await planManagementPage.expectRowsRendered();
    });

    await steps.critical('An export confirmed while the export service is down sends its request', async () => {
      endpoint = (await NetworkUtils.captureRequestUrl(page, CASES.serviceDown.exportRequest, async () => {
        await menu.exportAndDownload(SCOPE.allPlans, 'csv');
      })) ?? '';
      expect(endpoint, 'the export should call an export endpoint (learned from one real export)').not.toBe('');
      await NetworkUtils.failEndpoint(page, endpoint);
      await planManagementPage.openList();
      await menu.open();
      await menu.chooseScope(SCOPE.allPlans);
      downloaded = await menu.expectNoDownloadWhile(() => menu.clickFormat('csv'));
      expect(downloaded, 'a failed export must not deliver a file').toBe(false);
    });

    await steps.step('A clear error is shown, no file arrives, and the directory stays usable', async () => {
      const messages = await planManagementPage.waitForVisibleMessages();
      expect(messages, `the user should be told the export failed; the screen showed: ${messages.join(' | ') || '(nothing)'}`).not.toEqual([]);
      await NetworkUtils.restore(page);
      await planManagementPage.openList();
      await planManagementPage.expectRowsRendered();
    });
  });

  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.azureId}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
