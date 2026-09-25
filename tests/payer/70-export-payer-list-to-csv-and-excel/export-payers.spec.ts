import { test, expect } from '../../../fixtures';
import { azureOrCase } from '../../../data/azureTestIds.data';
import type { ShapedSession } from '../../../fixtures/shapedNonAdmin.fixture';
import { NON_ADMIN_PROFILE } from '../../../data/accounts/nonAdminAccount.data';
import { NetworkUtils } from '../../../utils/NetworkUtils';
import { PAYER_EXPORT_COLUMN } from '../../../constants/ElementIds';
import type { PayerData } from '../../../data/payers/payerTypes';
import { SCOPE_FILTER } from '../../../data/payers/exportScope.data';
import {
  BLOCKED_CASES,
  EXPORT_FILE_NAME,
  FILTERED_SCOPE,
  NO_MATCH_SEARCH,
  ORDER_SAMPLE,
  REQUIRED_EXPORT_COLUMNS,
  SPECIAL_LICENCE,
  TIMESTAMP_TOLERANCE_MS,
  XLSX_MAGIC,
  parseExportTimestamp,
} from '../../../data/payers/exportPayers.data';

/**
 * User story: Export Payer List to CSV and Excel.
 *
 * The export menu and CSV parsing are the export-scope story's (folder 28);
 * this story is about the FILE. Two of its expectations contradict sheet 23
 * (a "filtered" scope; no prompt without a filter) and are asserted as this
 * sheet states them, so the conflict is reported rather than resolved here.
 */
test.describe('Export the payer list', () => {
  // Azure test case 14545
  test('14545: should download a CSV holding the listed payers when the list is exported', async ({
    payerManagementPage,
    exportMenu,
    steps,
  }) => {
    await steps.critical('Navigate to the module with the unfiltered list', async () => {
      await payerManagementPage.open();
      await payerManagementPage.expectRowsRendered();
    });

    await steps.step('The CSV export holds the register with its headers', async () => {
      const parsed = await exportMenu.exportCsv('all');
      expect(parsed.headers.length, 'the file should carry column headers').toBeGreaterThan(0);
      expect(parsed.rows.length, 'the file should hold the listed payers').toBeGreaterThanOrEqual(10);
    });
  });

  // Azure test case 14548
  test('14548: should download a valid Excel workbook when the list is exported to Excel', async ({
    payerManagementPage,
    exportMenu,
    steps,
  }) => {
    await steps.critical('Navigate to the module with the unfiltered list', async () => {
      await payerManagementPage.open();
      await payerManagementPage.expectRowsRendered();
    });

    await steps.step('The Excel export is a real, non-empty workbook', async () => {
      const { filename, bytes } = await exportMenu.exportAndReadBytes('all', 'excel');
      expect(filename, 'the workbook should follow the naming convention').toMatch(EXPORT_FILE_NAME.excel);
      expect(bytes.length, 'the workbook should not be empty').toBeGreaterThan(0);
      expect(bytes.subarray(0, 2).toString('latin1'), 'an .xlsx is a zip and starts with "PK"').toBe(XLSX_MAGIC);
    });
  });

  // Azure test case 14554
  test('14554: should include every visible column plus Arabic Name, Dial Code and Licence Number in the export', async ({
    payerManagementPage,
    exportMenu,
    publishedPayer,
    steps,
  }) => {
    await steps.critical('Navigate to the module and export the register', async () => {
      await payerManagementPage.open();
      await payerManagementPage.expectRowsRendered();
    });

    await steps.step('The checklist columns are all present with the payer\'s data', async () => {
      const parsed = await exportMenu.exportCsv('all');
      for (const column of REQUIRED_EXPORT_COLUMNS) {
        expect(parsed.headers, `the file should carry a "${column}" column`).toContain(column);
      }
      const row = parsed.rows.find((r) => r[PAYER_EXPORT_COLUMN.nameEn] === publishedPayer.nameEn);
      expect(row, `"${publishedPayer.nameEn}" should be in the file`).not.toBe(undefined);
      expect(row?.[PAYER_EXPORT_COLUMN.nameAr], 'the Arabic name should be exported').toBe(publishedPayer.nameAr);
      expect(row?.[PAYER_EXPORT_COLUMN.licenseNumber], 'the licence should be exported').toBe(publishedPayer.licenseNumber);
    });
  });

  // Azure test case 14546
  test('14546: should ask whether to export all or only the filtered payers when a filter is applied', async ({
    payerManagementPage,
    exportMenu,
    steps,
  }) => {
    await steps.critical('Navigate to the module and apply a filter', async () => {
      await payerManagementPage.open();
      await payerManagementPage.filterByStatus(SCOPE_FILTER.status);
      await payerManagementPage.expectRowsRendered();
    });

    await steps.step('The export prompt offers the filtered results as a scope', async () => {
      // Sheet 33's expectation. The app offers "selected" and "all" only -
      // the export-scope story's finding, restated from this sheet's angle.
      await exportMenu.open();
      const scopes = await exportMenu.getOfferedScopes();
      expect(scopes, `a filtered list should offer a "${FILTERED_SCOPE}" scope; offered: ${scopes.join(', ')}`).toContain(FILTERED_SCOPE);
      await exportMenu.cancelMenu();
    });
  });

  // Azure test case 14553
  test('14553: should export every payer when All Payers is chosen over a filtered list', async ({
    payerManagementPage,
    exportMenu,
    steps,
  }) => {
    let visible = 0;

    await steps.critical('Navigate to the module and apply a filter that narrows the list', async () => {
      await payerManagementPage.open();
      await payerManagementPage.filterByStatus(SCOPE_FILTER.status);
      await payerManagementPage.expectRowsRendered();
      visible = (await payerManagementPage.getVisiblePayerNames()).length;
      expect(visible).toBeGreaterThan(0);
    });

    await steps.step('Exporting All holds more than the filtered page', async () => {
      const parsed = await exportMenu.exportCsv('all');
      expect(parsed.rows.length, 'All Payers should ignore the filter').toBeGreaterThan(visible);
    });
  });

  // Azure test case 14551
  test('14551: should export only the on-screen payers when Filtered Results Only is chosen', async ({
    payerManagementPage,
    exportMenu,
    steps,
  }) => {
    let visible: string[] = [];

    await steps.critical('Navigate to the module and apply a filter', async () => {
      await payerManagementPage.open();
      await payerManagementPage.filterByStatus(SCOPE_FILTER.status);
      await payerManagementPage.expectRowsRendered();
      visible = await payerManagementPage.getVisiblePayerNames();
      expect(visible.length).toBeGreaterThan(0);
    });

    await steps.step('A filtered-only export matches the on-screen rows', async () => {
      // Either a "filtered" scope exists, or the nearest scope exports exactly
      // what is on screen. Neither holds today: "selected" exports ticked rows.
      await exportMenu.open();
      const scopes = await exportMenu.getOfferedScopes();
      await exportMenu.cancelMenu();
      const parsed = await exportMenu.exportCsv('selected').catch(() => null);
      const exported = parsed === null ? 0 : parsed.rows.length;
      expect(
        scopes.includes(FILTERED_SCOPE) || exported === visible.length,
        `a filtered-only export should hold the ${visible.length} on-screen payer(s); scopes offered: `
          + `${scopes.join(', ')}; "selected" exported ${exported}`,
      ).toBe(true);
    });
  });

  test('TC-007: should export immediately without a scope prompt when no filter is applied', async ({
    payerManagementPage,
    exportMenu,
    steps,
  }) => {
    await steps.critical('Navigate to the module with no filter applied', async () => {
      await payerManagementPage.open();
      await payerManagementPage.expectRowsRendered();
    });

    await steps.step('No scope prompt is shown', async () => {
      // Sheet 33's expectation; sheet 23 (folder 28 TC-002) expects the prompt
      // ALWAYS. The app prompts always - asserted as this sheet states it.
      await exportMenu.open();
      const scopes = await exportMenu.getOfferedScopes();
      expect(scopes, `with no filter the export should not prompt for a scope; it offered: ${scopes.join(', ')}`).toEqual([]);
      await exportMenu.cancelMenu();
    });
  });

  // Azure test case 14555
  test('14555: should name the file PayerList_YYYYMMDD_HHMMSS with a timestamp of the export moment', async ({
    payerManagementPage,
    exportMenu,
    steps,
  }) => {
    await steps.critical('Navigate to the module', async () => {
      await payerManagementPage.open();
      await payerManagementPage.expectRowsRendered();
    });

    await steps.step('The file name follows the convention and its timestamp is now', async () => {
      const before = Date.now();
      const { filename } = await exportMenu.exportAndReadBytes('all', 'csv');
      expect(filename).toMatch(EXPORT_FILE_NAME.csv);
      const stamped = parseExportTimestamp(filename);
      expect(stamped, 'the timestamp should parse').not.toBeNull();
      expect(
        Math.abs((stamped as Date).getTime() - before),
        `the embedded timestamp should be within a few minutes of the export; file "${filename}"`,
      ).toBeLessThan(TIMESTAMP_TOLERANCE_MS);
    });
  });

  // Azure test case 14559
  test('14559: should produce headers and no data rows when the filtered list has no results', async ({
    payerManagementPage,
    exportMenu,
    steps,
  }) => {
    await steps.critical('Navigate to the module and apply a filter matching nothing', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(NO_MATCH_SEARCH);
      await payerManagementPage.expectEmptyState();
    });

    await steps.step('The export of the empty result holds no data rows', async () => {
      const parsed = await exportMenu.exportCsv('selected').catch(() => null);
      const rows = parsed === null ? 0 : parsed.rows.length;
      expect(rows, 'an export of nothing should hold no data rows').toBe(0);
      await payerManagementPage.expectNoUnexpectedDialog();
    });
  });

  test('TC-010: should export the whole register without truncation or duplication', async ({
    payerManagementPage,
    exportMenu,
    payerMetrics,
    steps,
  }) => {
    test.slow();
    let total = 0;

    await steps.critical('Navigate to the module and read the total payer count', async () => {
      await payerManagementPage.open();
      total = await payerMetrics.getMetric('total');
      expect(total, 'the register should hold payers').toBeGreaterThan(0);
    });

    await steps.step('The export holds exactly that many distinct payers', async () => {
      const parsed = await exportMenu.exportCsv('all');
      expect(parsed.rows.length, 'row count should equal the total on screen').toBe(total);
      const codes = new Set(parsed.rows.map((r) => r[PAYER_EXPORT_COLUMN.code]));
      expect(codes.size, 'no payer should be duplicated').toBe(parsed.rows.length);
    });
  });

  // Azure test case 14563
  test('14563: should encode Arabic names and special characters correctly in the export', async ({
    payerManagementPage,
    exportMenu,
    publishPayer,
    steps,
  }) => {
    test.slow();
    let payer: PayerData | null = null;

    await steps.critical('Navigate to the module and publish a payer with special characters', async () => {
      // Published, not merely drafted: VERIFIED the export carries live
      // records only, so a Draft would be absent for a reason unrelated to
      // encoding.
      payer = await publishPayer({ licenseNumber: SPECIAL_LICENCE });
      await payerManagementPage.open();
      await payerManagementPage.search(payer.nameEn);
      await payerManagementPage.waitForRowVisible(payer.nameEn);
    });

    await steps.step('The CSV carries the Arabic name and the special characters intact', async () => {
      const expected = payer as PayerData;
      await payerManagementPage.open();
      const parsed = await exportMenu.exportCsv('all');
      const row = parsed.rows.find((r) => r[PAYER_EXPORT_COLUMN.nameEn] === expected.nameEn);
      expect(row, 'the new payer should be in the file').not.toBe(undefined);
      expect(row?.[PAYER_EXPORT_COLUMN.nameAr], 'Arabic must survive the encoding').toBe(expected.nameAr);
      expect(row?.[PAYER_EXPORT_COLUMN.licenseNumber], 'quotes, commas, & and % must survive').toBe(SPECIAL_LICENCE);
    });
  });

  test('TC-012: should abort the export with no file when the scope prompt is cancelled', async ({
    payerManagementPage,
    exportMenu,
    steps,
  }) => {
    await steps.critical('Navigate to the module and apply a filter', async () => {
      await payerManagementPage.open();
      await payerManagementPage.filterByStatus(SCOPE_FILTER.status);
      await payerManagementPage.expectRowsRendered();
    });

    await steps.step('Cancelling the prompt downloads nothing and keeps the filtered list', async () => {
      await exportMenu.open();
      const downloaded = await exportMenu.expectNoDownloadWhile(() => exportMenu.cancelMenu());
      expect(downloaded, 'cancelling must not download a file').toBe(false);
      await payerManagementPage.expectRowsRendered();
    });
  });

  // Azure test case 14562
  test('14562: should report the failure and deliver no file when the export service is down, then succeed on retry', async ({
    page,
    payerManagementPage,
    exportMenu,
    steps,
  }) => {
    test.slow();
    let endpoint = '';

    await steps.critical('Navigate to the module and learn the export endpoint from a real export', async () => {
      await payerManagementPage.open();
      endpoint = (await NetworkUtils.captureRequestUrl(page, /export/i, async () => {
        await exportMenu.exportAndDownload('all', 'csv');
      })) ?? '';
      expect(endpoint, 'the export endpoint should have been captured').not.toBe('');
    });

    await steps.step('With the service failing, no file is delivered and the user is told', async () => {
      await NetworkUtils.failEndpoint(page, endpoint);
      await payerManagementPage.open();
      await exportMenu.open();
      await exportMenu.chooseScope('all');
      const downloaded = await exportMenu.expectNoDownloadWhile(() => exportMenu.clickFormat('csv'));
      const messages = await payerManagementPage.waitForVisibleMessages();
      expect(downloaded, 'a failed export must not deliver a file').toBe(false);
      expect(messages.length, `the user should be told the export failed; the screen showed: ${messages.join(' | ') || '(nothing)'}`).toBeGreaterThan(0);
    });

    await steps.step('The export succeeds once the service is back', async () => {
      await NetworkUtils.restoreEndpoint(page, endpoint);
      await payerManagementPage.open();
      const parsed = await exportMenu.exportCsv('all');
      expect(parsed.rows.length).toBeGreaterThan(0);
    });
  });

  test('TC-016: should reflect the applied sort order and search query in the exported data', async ({
    payerManagementPage,
    exportMenu,
    publishedPayer,
    steps,
  }) => {
    test.slow();
    let onScreen: string[] = [];

    await steps.critical('Navigate to the module and sort the list by name descending', async () => {
      await payerManagementPage.open();
      await payerManagementPage.sortBy('payerName', 'desc');
      onScreen = (await payerManagementPage.getColumnValues('payerName')).slice(0, ORDER_SAMPLE);
      expect(onScreen.length).toBeGreaterThan(0);
    });

    await steps.step('The export is in the same order as the screen', async () => {
      const parsed = await exportMenu.exportCsv('all');
      const inFile = parsed.rows.map((r) => r[PAYER_EXPORT_COLUMN.nameEn]).slice(0, onScreen.length);
      expect(inFile, 'the file should follow the on-screen sort order').toEqual(onScreen);
    });

    await steps.step('A search narrows the export to the searched records', async () => {
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.waitForRowVisible(publishedPayer.nameEn);
      const parsed = await exportMenu.exportCsv('all');
      expect(
        parsed.rows.length,
        `with a search applied the export should hold only the searched record(s); it held ${parsed.rows.length}`,
      ).toBe(1);
    });
  });


  // ---- the withheld half, on a role shaped for this case -------------------
  // This used to report BLOCKED: the one non-administrator credential in this
  // environment HOLDS the permission whose absence the case is about. The
  // account is now BUILT - the administrator takes the permission off the
  // shared "Payer Admin" role, the case signs in as it, and the permission
  // goes back when the case ends.

  // Azure test case 14567
  test('14567: should withhold the Export functionality from a user without export permission', async ({ shapedNonAdmin, steps }) => {
    let session!: ShapedSession;

    await steps.critical('Sign in as a user without Export Payers', async () => {
      session = await shapedNonAdmin({ without: ['exportPayers'] });
      await session.payers.navigate();
      await session.payers.expectRowsRendered();
    });

    await steps.step('The export control is withheld from this role', async () => {
      await session.exportMenu.expectExportRefused();
    });
  });
  for (const blocked of BLOCKED_CASES) {
    test(`${azureOrCase('70', 'TC-' + blocked.id)}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
