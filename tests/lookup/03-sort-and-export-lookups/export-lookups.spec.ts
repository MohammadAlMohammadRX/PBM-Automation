import { test, expect } from '../../../fixtures';
import type { Page } from '@playwright/test';
import type { TestSteps } from '../../../fixtures/testStatus.fixture';
import type { LookupRegisterPage } from '../../../pages/lookup/LookupPages';
import {
  CASES,
  EXCEL_OFFERED,
  EXPORTED_TOAST,
  EXPORT_FAILED_TOAST,
  EXPORT_FORMAT,
  EXPORT_HEADERS,
  EXPORT_MENU,
  FAILED_STATUS,
  FILTER_SETUP,
  NOTHING_TO_EXPORT,
  NO_MATCH_TERM,
  SORT_COLUMN,
} from '../../../data/lookup/sortAndExportLookups.data';
import { readAllLookups } from '../../../utils/lookup/lookupApi';
import {
  advancedSearch,
  dataHeadersOnScreen,
  describeExport,
  emptyExportHandled,
  exportRegister,
  exportedCodes,
  exportedTriples,
  failExport,
  hasMessage,
  openCapturing,
  orderOk,
  orderOutcome,
  replayRegister,
  restoreExport,
  rowIdsOnScreen,
  rowsNotMatching,
  rowsNotMatchingAny,
  screenTriples,
  searchRegister,
  sortRegister,
  type RegisterCall,
  type RegisterExport,
} from '../../../utils/lookup/writerAHelpers';

/**
 * User story 20855: Sort and Export Lookups - Export: Selected Export (the
 * filtered rows / the page on screen), Export All Data, the file's columns, a
 * failing export, an export with an active sort and one with no rows. Files are
 * saved under the test's output folder and read back. Read-only. See the data file.
 */

async function openModule(steps: TestSteps, page: Page, register: LookupRegisterPage): Promise<RegisterCall> {
  let call: RegisterCall = { status: -1, request: {}, answer: { totalRows: -1, items: [] }, requeried: false };
  await steps.critical('Navigate to the Lookups Management module - the register loads', async () => {
    call = await openCapturing(page, register);
    expect(call.status, `GetLookups answered ${call.status}`).toBe(200);
  });
  return call;
}

/** 21136 / 21137: a search term and an Advance Search filter -> the narrowed answer. */
async function searchAndFilter(steps: TestSteps, page: Page, whole: number, name: string): Promise<RegisterCall> {
  let filtered: RegisterCall = { status: -1, request: {}, answer: { totalRows: -1, items: [] }, requeried: false };
  await steps.critical(name, async () => {
    await searchRegister(page, FILTER_SETUP.search);
    filtered = await advancedSearch(page, { code: FILTER_SETUP.code });
    expect({
      status: filtered.status,
      narrowed: filtered.answer.totalRows > 0 && filtered.answer.totalRows < whole,
      breaksSearch: rowsNotMatchingAny(filtered.answer.items, FILTER_SETUP.search),
      breaksCode: rowsNotMatching(filtered.answer.items, 'code', FILTER_SETUP.code),
    }, `${filtered.answer.totalRows} of ${whole} lists; ${JSON.stringify(filtered.request)}`).toEqual({ status: 200, narrowed: true, breaksSearch: [], breaksCode: [] });
  });
  return filtered;
}

/** The export reached a file through the Excel choice. */
const downloaded = (r: RegisterExport) => ({
  menu: [...r.menu],
  excelOffered: r.dialog.actions.some((a) => EXCEL_OFFERED.test(a)),
  status: r.status,
  file: r.parsed !== null,
});
const DOWNLOADED = { menu: [...EXPORT_MENU], excelOffered: true, status: 200, file: true };

test.describe('US 20855 - Sort and Export Lookups (export)', () => {
  test.describe.configure({ timeout: 5 * 60_000 });

  test(`TC-${CASES.selectedExport.azureId}: should export only the lookups matching the current search and filters`, async ({ page, steps, lookupRegister: register }, testInfo) => {
    const call = await openModule(steps, page, register);
    const filtered = await searchAndFilter(steps, page, call.answer.totalRows, `Apply a search term ("${FILTER_SETUP.search}") and a filter (Code "${FILTER_SETUP.code}") - the register shows only matching rows`);
    let result!: RegisterExport;

    await steps.step('Select Export, then Selected Export, then Excel - a file downloads containing only the filtered/matching rows', async () => {
      result = await exportRegister(page, testInfo, 'selected', EXPORT_FORMAT);
      const expected = (await replayRegister(page, filtered.request)).items.map((i) => i.code).sort();
      expect({ ...downloaded(result), codes: exportedCodes(result).sort() }, describeExport(result)).toEqual({ ...DOWNLOADED, codes: expected });
    });

    await steps.step(`Check the confirmation message - "${EXPORTED_TOAST}" is displayed`, async () => {
      expect(hasMessage(result?.toasts ?? [], EXPORTED_TOAST), `toasts: [${(result?.toasts ?? []).join(' | ')}]`).toBe(true);
    });
  });

  test(`TC-${CASES.exportAll.azureId}: should export every lookup list regardless of the active search and filters`, async ({ page, steps, lookupRegister: register }, testInfo) => {
    const call = await openModule(steps, page, register);
    await searchAndFilter(steps, page, call.answer.totalRows, `Apply a search term ("${FILTER_SETUP.search}") and a filter (Code "${FILTER_SETUP.code}") - the register shows a narrowed subset of rows`);

    await steps.step('Select Export, then Export All Data, then Excel - a file downloads containing every lookup list regardless of the active search or filters', async () => {
      const result = await exportRegister(page, testInfo, 'all', EXPORT_FORMAT);
      const api = await readAllLookups(page);
      const codes = exportedCodes(result);
      expect({ ...downloaded(result), rows: codes.length, missing: api.items.map((i) => i.code).filter((c) => !codes.includes(c)) }, describeExport(result))
        .toEqual({ ...DOWNLOADED, rows: api.totalRows, missing: [] });
    });
  });

  test(`TC-${CASES.exportColumns.azureId}: should export Code, English Name and Arabic Name in the order shown on screen`, async ({ page, steps, lookupRegister: register }, testInfo) => {
    await openModule(steps, page, register);
    let result!: RegisterExport;

    await steps.critical('Select Export, then Export All Data, then Excel - the file downloads', async () => {
      result = await exportRegister(page, testInfo, 'all', EXPORT_FORMAT);
      expect(downloaded(result), describeExport(result)).toEqual(DOWNLOADED);
    });

    await steps.step('Open the downloaded Excel file and check its columns - the file carries Code, English Name and Arabic Name in that same order as shown on screen', async () => {
      expect({ file: result.parsed?.headers ?? [], screen: await dataHeadersOnScreen(page) }).toEqual({ file: [...EXPORT_HEADERS], screen: [...EXPORT_HEADERS] });
    });
  });

  test(`TC-${CASES.exportFails.azureId}: should tell the administrator "${EXPORT_FAILED_TOAST}" when the export fails`, async ({ page, steps, lookupRegister: register }, testInfo) => {
    await openModule(steps, page, register);
    let result!: RegisterExport;

    await steps.step(`Select Export, then Export All Data, then Excel, while the export service is failing (ExportLookups answers ${FAILED_STATUS}) - the export request fails`, async () => {
      await failExport(page, FAILED_STATUS);
      result = await exportRegister(page, testInfo, 'all', EXPORT_FORMAT);
      await restoreExport(page);
      expect({ status: result.status, file: result.filename }, describeExport(result)).toEqual({ status: FAILED_STATUS, file: '' });
    });

    await steps.step(`Check the message displayed on screen - "${EXPORT_FAILED_TOAST}" is displayed`, async () => {
      expect(hasMessage(result?.toasts ?? [], EXPORT_FAILED_TOAST), `toasts: [${(result?.toasts ?? []).join(' | ')}]`).toBe(true);
    });
  });

  test(`TC-${CASES.exportWithSort.azureId}: should export the same rows the screen shows when a sort is active`, async ({ page, steps, lookupRegister: register }, testInfo) => {
    await openModule(steps, page, register);
    let shown: string[] = [];
    let result!: RegisterExport;

    await steps.critical('Apply Sort By English Name, Z-A - the rows re-order by English Name descending', async () => {
      const s = await sortRegister(page, 'englishName', 'desc');
      const { outcome, evidence } = await orderOutcome(page, s, 'englishName', 'desc', SORT_COLUMN.englishName);
      shown = await screenTriples(page);
      expect(outcome, evidence).toEqual(orderOk('desc'));
    });

    await steps.critical('Select Export, then Selected Export, then Excel - a file downloads', async () => {
      result = await exportRegister(page, testInfo, 'selected', EXPORT_FORMAT);
      expect(downloaded(result), describeExport(result)).toEqual(DOWNLOADED);
    });

    await steps.step('Open the downloaded file and compare its rows to the on-screen data - the export carries the same rows the screen showed', async () => {
      expect({ rows: exportedTriples(result, EXPORT_HEADERS), screenRowsRead: (await rowIdsOnScreen(page)).length > 0 }).toEqual({ rows: shown, screenRowsRead: true });
    });
  });

  test(`TC-${CASES.exportNoRows.azureId}: should handle an export of a filter that matches no rows without a system error`, async ({ page, steps, lookupRegister: register }, testInfo) => {
    await openModule(steps, page, register);

    await steps.critical(`Apply a filter that matches no rows (Code "${NO_MATCH_TERM}") - the register shows zero rows`, async () => {
      const r = await advancedSearch(page, { code: NO_MATCH_TERM });
      expect({ status: r.status, totalRows: r.answer.totalRows, rows: (await rowIdsOnScreen(page)).length }, JSON.stringify(r.request)).toEqual({ status: 200, totalRows: 0, rows: 0 });
    });

    await steps.step(`Select Export, then Selected Export, then Excel - the system exports a header-only file or shows an appropriate message ("${NOTHING_TO_EXPORT}") instead of failing`, async () => {
      const result = await exportRegister(page, testInfo, 'selected', EXPORT_FORMAT);
      expect(emptyExportHandled(result, EXPORT_HEADERS, NOTHING_TO_EXPORT, EXPORT_FAILED_TOAST), describeExport(result))
        .toEqual({ handled: true, failedToast: false, serverError: false });
    });
  });
});
