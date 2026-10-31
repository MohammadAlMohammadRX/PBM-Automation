import { test, expect } from '../../../fixtures';
import { TERMINOLOGY_COLUMN } from '../../../constants/ElementIds';
import { BLOCKED_CASES, CASES, NAME_HEADER, XLSX_SIGNATURE } from '../../../data/terminology/exportTerminology.data';

/**
 * User story 15147: Export Terminology list to File.
 * CSV and Excel exports of the terminology list - complete regardless of
 * pagination, readable, faithful to special characters, handled gracefully
 * when empty or failing, localized, and withheld from users without the right.
 */
test.describe('US 15147 - Export Terminology list to File', () => {
  test(`TC-${CASES.csv.azureId}: should download a CSV file of the terminology records when CSV is exported in English and in Arabic`, async ({
    terminologyManagementPage,
    languageSwitcher,
    cleanup,
    steps,
  }) => {
    cleanup.register(() => languageSwitcher.switchTo('en'));
    let total = -1;

    await steps.critical('Navigate to the Terminology Management module - the list view is displayed', async () => {
      total = (await terminologyManagementPage.captureList(() => terminologyManagementPage.open())).totalRows;
      expect(total).toBeGreaterThan(0);
    });

    await steps.step('The CSV format is offered for selection', async () => {
      await terminologyManagementPage.exportMenu().open();
      await terminologyManagementPage.exportMenu().chooseScope('all');
      await terminologyManagementPage.exportMenu().expectFormatChoiceOffered();
      await terminologyManagementPage.exportMenu().cancel();
    });

    let rows = 0;
    await steps.step('Clicking Export starts a CSV download', async () => {
      const file = await terminologyManagementPage.exportAndParse('all', 'csv');
      expect(file.filename).toMatch(CASES.csv.extension);
      rows = file.parsed.rows.length;
    });

    await steps.step('The downloaded CSV opens and contains the terminology records', async () => {
      expect(rows, 'records in the CSV').toBeGreaterThan(0);
    });

    await steps.step('In Arabic the labels render right-to-left and the export still downloads a CSV', async () => {
      await languageSwitcher.switchTo('ar');
      await languageSwitcher.expectRightToLeft();
      const file = await terminologyManagementPage.exportAndParse('all', 'csv');
      expect(file.filename).toMatch(CASES.csv.extension);
      expect(file.parsed.rows.length).toBeGreaterThan(0);
    });
  });

  test(`TC-${CASES.excel.azureId}: should download a valid Excel workbook of the terminology records when Excel is chosen`, async ({
    terminologyManagementPage,
    steps,
  }) => {
    let file: { filename: string; bytes: Buffer; rows: number } = { filename: '', bytes: Buffer.alloc(0), rows: 0 };

    await steps.critical('Navigate to the Terminology Management module - the list view is displayed', async () => {
      await terminologyManagementPage.open();
    });

    await steps.step('Excel is selected and Export starts an Excel download', async () => {
      const exported = await terminologyManagementPage.exportAndParse('all', 'excel');
      file = { filename: exported.filename, bytes: exported.bytes, rows: exported.parsed.rows.length };
      expect(file.filename).toMatch(CASES.excel.extension);
    });

    await steps.step('The workbook opens and holds the terminology records', async () => {
      expect(file.bytes.subarray(0, 2).toString('latin1'), 'an .xlsx workbook').toBe(XLSX_SIGNATURE);
      expect(file.rows).toBeGreaterThan(0);
    });
  });

  test(`TC-${CASES.allRecords.azureId}: should export every terminology rather than only the page on screen when the catalogue spans several pages`, async ({
    terminologyManagementPage,
    steps,
  }) => {
    let total = -1;

    await steps.critical('Navigate to the Terminology Management module - the list shows only its first page', async () => {
      total = (await terminologyManagementPage.captureList(() => terminologyManagementPage.open())).totalRows;
      expect(await terminologyManagementPage.countRows()).toBeLessThanOrEqual(CASES.allRecords.pageSize);
    });

    await steps.step('The list summary gives the total number of terminologies, more than one page', async () => {
      expect(total).toBeGreaterThan(CASES.allRecords.pageSize);
      expect(await terminologyManagementPage.hasNextPage(), 'a second page').toBe(true);
    });

    let exported = -1;
    await steps.step('Clicking Export generates a file', async () => {
      exported = (await terminologyManagementPage.exportAndParse('all', 'excel')).parsed.rows.length;
      expect(exported).toBeGreaterThan(0);
    });

    await steps.step('The file holds as many terminologies as the total, not just the visible page', async () => {
      expect(exported, `rows exported vs the ${total} in the catalogue`).toBe(total);
    });
  });

  test(`TC-${CASES.emptyResult.azureId}: should produce a header-only file or a clear message when the filtered list is empty`, async ({
    terminologyManagementPage,
    steps,
  }) => {
    const data = CASES.emptyResult;

    await steps.critical('Navigate to the Terminology Management module - the list view is displayed', async () => {
      await terminologyManagementPage.open();
    });

    await steps.step(`A search for "${data.term}" returns no results`, async () => {
      expect((await terminologyManagementPage.searchFor(data.term)).totalRows).toBe(0);
    });

    let outcome: { rows: number; headers: number; messages: string } = { rows: -1, headers: -1, messages: '' };
    await steps.step('Clicking Export triggers the export', async () => {
      const result = await terminologyManagementPage.exportOrMessages('csv');
      outcome = { rows: result.parsed?.rows.length ?? -1, headers: result.parsed?.headers.length ?? 0, messages: result.messages.join(' | ') };
      expect(outcome.rows === 0 || data.nothing.test(outcome.messages), `a file or a message - got rows=${outcome.rows}, messages="${outcome.messages}"`).toBe(true);
    });

    await steps.step('The answer is a header-only file or a clear "nothing to export" message, without errors', async () => {
      expect(outcome.messages).not.toMatch(/error|failed/i);
      expect(outcome.headers > 0 || data.nothing.test(outcome.messages), 'column headers, or a message').toBe(true);
    });
  });

  test(`TC-${CASES.formats.azureId}: should produce a .csv file and a .xlsx file holding the same data when CSV and then Excel are chosen`, async ({
    terminologyManagementPage,
    steps,
  }) => {
    let csv: string[] = [];
    let excel: string[] = [];

    await steps.critical('Navigate to the Terminology Management module - the list view is displayed', async () => {
      await terminologyManagementPage.open();
    });

    await steps.step('CSV and Export download a file with a .csv extension', async () => {
      const file = await terminologyManagementPage.exportAndParse('all', 'csv');
      expect(file.filename).toMatch(CASES.formats.csv);
      const header = file.parsed.headers.find((h) => NAME_HEADER.test(h)) ?? '';
      csv = file.parsed.rows.map((r) => r[header]);
    });

    await steps.step('Excel and Export download a file with a .xlsx extension', async () => {
      const file = await terminologyManagementPage.exportAndParse('all', 'excel');
      expect(file.filename).toMatch(CASES.formats.excel);
      const header = file.parsed.headers.find((h) => NAME_HEADER.test(h)) ?? '';
      excel = file.parsed.rows.map((r) => r[header]);
    });

    await steps.step('Both files hold the same terminology data in their own formats', async () => {
      expect(csv.length).toBeGreaterThan(0);
      expect([...excel].sort()).toEqual([...csv].sort());
    });
  });

  test(`TC-${CASES.progress.azureId}: should move from In Progress to Completed and then offer the file when an export is processed`, async ({
    terminologyManagementPage,
    steps,
  }) => {
    let watched: { states: string[]; filename: string } = { states: [], filename: '' };

    await steps.critical('Navigate to the Terminology Management module - the list view is displayed', async () => {
      await terminologyManagementPage.open();
    });

    await steps.step('Clicking Export shows an "In Progress" status with a progress indicator', async () => {
      watched = await terminologyManagementPage.exportWatchingProgress('excel');
      expect(watched.states.join(', '), 'an in-progress state').toMatch(CASES.progress.inProgress);
    });

    await steps.step('When processing finishes the status changes to "Completed"', async () => {
      expect(watched.states.join(', '), 'a completed state').toMatch(CASES.progress.completed);
    });

    await steps.step('The file is available and downloads', async () => {
      expect(watched.filename).not.toBe('');
    });
  });

  test(`TC-${CASES.noPermission.azureId}: should withhold the Export button and refuse a direct export when the user lacks the export permission`, async ({
    terminologyManagementPage,
    shapedNonAdmin,
    requireListAccess,
    requireBaseline,
    steps,
  }) => {
    await terminologyManagementPage.open();
    requireBaseline(await terminologyManagementPage.isExportOffered(), 'the Export button');
    const session = await shapedNonAdmin(CASES.noPermission.granted);
    await requireListAccess(session);

    await steps.step('The list view is displayed for the limited viewer', async () => {
      await session.terminologies.openExpectingDenial();
      expect(await session.terminologies.getPageText()).not.toBe('');
    });

    await steps.step('The Export button is hidden, disabled or not rendered', async () => {
      expect(await session.terminologies.isExportOffered(), 'Export for a role without the right').toBe(false);
    });

    await steps.step('Triggering the export directly is blocked with an access-denied answer', async () => {
      const answer = await session.terminologies.sendExport(2);
      expect(answer.status, `the server answered ${answer.status}`).toBeGreaterThanOrEqual(400);
    });
  });

  test(`TC-${CASES.failure.azureId}: should show a clear error when the export fails and succeed when it is retried after recovery`, async ({
    terminologyManagementPage,
    cleanup,
    steps,
  }) => {
    const data = CASES.failure;
    cleanup.register(() => terminologyManagementPage.restoreEndpoints());

    await steps.critical('Navigate to the Terminology Management module - the list view is displayed', async () => {
      await terminologyManagementPage.open();
    });

    let failed: { parsed: unknown; messages: string[] } = { parsed: null, messages: [] };
    await steps.step('Exporting while the export service is unavailable begins the export', async () => {
      await terminologyManagementPage.simulateFailure(data.endpoint);
      failed = await terminologyManagementPage.exportOrMessages('excel');
      expect(failed.parsed, 'no file should be produced by a failed export').toBeNull();
    });

    await steps.step('A clear error message is displayed', async () => {
      expect(failed.messages.join(' | '), 'an error message').toMatch(data.error);
    });

    await steps.step('Retrying after the service is restored completes the export', async () => {
      await terminologyManagementPage.restoreEndpoints();
      const file = await terminologyManagementPage.exportAndParse('all', 'excel');
      expect(file.parsed.rows.length).toBeGreaterThan(0);
    });
  });

  test(`TC-${CASES.readable.azureId}: should produce well-formed rows matching the terminologies on screen when the list is exported`, async ({
    terminologyManagementPage,
    steps,
  }) => {
    let names: string[] = [];
    let fields: string[] = [];

    await steps.critical('Navigate to the Terminology Management module - the list view is displayed', async () => {
      await terminologyManagementPage.open();
      names = await terminologyManagementPage.readNames();
      fields = await terminologyManagementPage.readColumn(TERMINOLOGY_COLUMN.fields);
    });

    let exported: Record<string, string>[] = [];
    let headers: string[] = [];
    await steps.step('The exported file has proper column headers, untruncated text and no corrupted rows', async () => {
      const file = await terminologyManagementPage.exportAndParse('all', 'csv');
      exported = file.parsed.rows;
      headers = file.parsed.headers;
      expect(headers.length).toBeGreaterThan(1);
      expect(headers.filter((h) => h === ''), 'empty headers').toEqual([]);
      expect(exported.filter((r) => Object.keys(r).length !== headers.length), 'rows misaligned with the header').toEqual([]);
    });

    await steps.step('A sample of exported rows matches the on-screen terminology details exactly', async () => {
      const nameHeader = headers.find((h) => NAME_HEADER.test(h)) ?? '';
      const fieldsHeader = headers.find((h) => /field/i.test(h)) ?? '';
      const sample = names.slice(0, CASES.readable.sample).map((name, i) => ({ name, fields: fields[i] }));
      const found = sample.map((s) => ({ name: s.name, fields: exported.find((r) => r[nameHeader] === s.name)?.[fieldsHeader] }));
      expect(found).toEqual(sample);
    });
  });

  test(`TC-${CASES.specialCharacters.azureId}: should keep the file intact when names hold commas and quotes and descriptions are long`, async ({
    terminologyManagementPage,
    terminologyIn,
    steps,
  }) => {
    const data = CASES.specialCharacters;
    const terminology = await terminologyIn({ name: data.name(), description: data.description() });

    await steps.critical('Navigate to the Terminology Management module - the list view is displayed', async () => {
      await terminologyManagementPage.open();
    });

    await steps.step('The terminology with commas, quotes, symbols and a long description is visible in the list', async () => {
      expect(await terminologyManagementPage.isListed(terminology.name)).toBe(true);
      await terminologyManagementPage.open();
    });

    await steps.step('Exported to CSV and Excel, its name and description are preserved without breaking columns or truncating', async () => {
      for (const format of ['csv', 'excel'] as const) {
        const file = await terminologyManagementPage.exportAndParse('all', format);
        const nameHeader = file.parsed.headers.find((h) => NAME_HEADER.test(h)) ?? '';
        const descHeader = file.parsed.headers.find((h) => /description/i.test(h)) ?? '';
        const row = file.parsed.rows.find((r) => r[nameHeader] === terminology.name);
        expect(row, `${format}: the row for ${terminology.name}`).toBeDefined();
        expect(row?.[descHeader], `${format}: the description`).toBe(terminology.description);
      }
    });
  });

  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.azureId}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
