import { test, expect } from '../../../fixtures';
import type { Page } from '@playwright/test';
import type { FacilityListAnswer, FacilityManagementPage } from '../../../pages/facility/FacilityManagementPage';
import type { ParsedCsv } from '../../../utils/CsvUtils';
import { FACILITY_LIST } from '../../../constants/facility/facilityIds';
import { CASES, EXPORT_COLUMNS, EXPORT_HEADER, STATUS_ORDER } from '../../../data/facility/sortAndExportTheFacilityList.data';
import { facilityDayText, suiteFacilityName, type ProvisionedFacility } from '../../../utils/FacilityProvisioning';
import {
  columnOf,
  compareText,
  dayValue,
  exportRowOf,
  groupToken,
  headerOf,
  isOrdered,
  parseExport,
  readSortOptionIds,
  sortByOptionId,
  wholeRegister,
} from '../../../utils/facility/writerAHelpers';

const ascending = (a: string, b: string): number => compareText(a, b);
const descending = (a: string, b: string): number => compareText(b, a);
const byDay = (a: string, b: string): number => dayValue(a) - dayValue(b);

/** Runs a whole export and parses the file. */
async function exportFile(list: FacilityManagementPage, scope: 'all' | 'selected', format: 'csv' | 'excel'): Promise<{ filename: string; parsed: ParsedCsv }> {
  const { filename, bytes } = await list.exportAndParse(scope, format);
  return { filename, parsed: parseExport(format, bytes) };
}

/** The sort option ids of `field` (matched in the id, after the prefix) for asc / desc. */
async function sortOptionsFor(page: Page, field: RegExp): Promise<{ asc?: string; desc?: string; all: string[] }> {
  const all = await readSortOptionIds(page);
  const of = (dir: string) => all.find((id) => field.test(id.slice(FACILITY_LIST.sortOptionPrefix.length)) && id.endsWith(`-${dir}`));
  return { asc: of('asc'), desc: of('desc'), all };
}

/**
 * User story 15134: Sort and export the facility list.
 * Sorting by code, name, licence expiry, type and status in both directions,
 * stable ties, and exports to CSV / Excel - whole set, filtered, Selected vs
 * All, empty, columns - and a session combining filters, sorts and an export.
 * See the data file for how the cases map onto the live list.
 */
test.describe('US 15134 - Sort and export the facility list', () => {
  test.describe.configure({ timeout: 10 * 60_000 });

  test(`TC-${CASES.byCode.azureId}: should order the list by facility code ascending, then descending, with a sort indicator`, async ({
    facilityManagementPage: list,
    page,
    steps,
  }) => {
    let codes: string[] = [];

    await steps.critical('Navigate to the Facility Management module - the module loads and displays the facility list', async () => {
      await list.openTable();
      codes = (await wholeRegister(page)).map((i) => i.facilityCode).sort(ascending);
      expect(await list.countRows()).toBeGreaterThan(1);
    });

    await steps.step('Click the "Code" column header (Sort By Code) - the facilities are re-ordered by code ascending and a sort indicator appears', async () => {
      await list.sortBy('code', 'asc');
      const shown = await list.readColumnValues('code');
      expect({ ordered: isOrdered(shown, ascending), first: shown[0], indicator: await list.readSortLabel() }, shown.join(' | '))
        .toEqual({ ordered: true, first: codes[0], indicator: expect.stringMatching(/code/i) });
    });

    await steps.step('Click the "Code" column header again (descending) - the facilities are re-ordered by code descending', async () => {
      await list.sortBy('code', 'desc');
      const shown = await list.readColumnValues('code');
      expect({ ordered: isOrdered(shown, descending), first: shown[0], indicator: await list.readSortLabel() }, shown.join(' | '))
        .toEqual({ ordered: true, first: codes[codes.length - 1], indicator: expect.stringMatching(/code/i) });
    });
  });

  test(`TC-${CASES.byName.azureId}: should order the list by facility name A-Z, then Z-A, with the sort indicator showing the direction`, async ({
    facilityManagementPage: list,
    steps,
  }) => {
    let ascLabel = '';

    await steps.critical('Navigate to the Facility Management module - the module loads and displays the facility list', async () => {
      await list.openTable();
      expect(await list.countRows()).toBeGreaterThan(1);
    });

    await steps.step('Click the "Name" column header (Sort By Facility Name) - the facilities are re-ordered A-Z and the indicator shows ascending order', async () => {
      await list.sortBy('name', 'asc');
      const names = await list.readNames();
      ascLabel = await list.readSortLabel();
      expect({ ordered: isOrdered(names, ascending), indicator: ascLabel }, names.join(' | ')).toEqual({ ordered: true, indicator: expect.stringMatching(/name.*(a-z|asc)/i) });
    });

    await steps.step('Click the "Name" column header again - the facilities are re-ordered Z-A and the indicator shows descending order', async () => {
      await list.sortBy('name', 'desc');
      const names = await list.readNames();
      const label = await list.readSortLabel();
      expect({ ordered: isOrdered(names, descending), indicator: label, changed: label !== ascLabel }, names.join(' | '))
        .toEqual({ ordered: true, indicator: expect.stringMatching(/name.*(z-a|desc)/i), changed: true });
    });
  });

  test(`TC-${CASES.byExpiry.azureId}: should order the list by licence expiry across past, today and future dates in both directions`, async ({
    facilityManagementPage: list,
    facilityIn,
    page,
    steps,
  }) => {
    const data = CASES.byExpiry;
    const token = groupToken('Exp');
    const expired = await facilityIn('Expired', { nameEn: suiteFacilityName(`${token} Past`), licenseStartDate: data.expired.start, licenseExpiryDate: data.expired.expiry });
    const today = await facilityIn('ExpiresToday', { nameEn: suiteFacilityName(`${token} Today`) });
    const future = await facilityIn('Active', { nameEn: suiteFacilityName(`${token} Future`), licenseStartDate: data.future.start, licenseExpiryDate: data.future.expiry });
    let days: number[] = [];

    await steps.critical('Navigate to the Facility Management module - the module loads and displays the facility list', async () => {
      await list.openTable();
      days = (await wholeRegister(page)).map((i) => dayValue(i.licenseExpiryDate)).sort((a, b) => a - b);
      expect(days.length).toBeGreaterThan(1);
    });

    await steps.step('Click the "Licence Expiry" column header - the facilities order with the earliest expiry date first, the already-expired facility at the top', async () => {
      await list.sortBy('licenseExpiry', 'asc');
      const shown = await list.readColumnValues('licenseExpiry');
      expect({ ordered: isOrdered(shown, byDay), first: dayValue(shown[0] ?? ''), firstStatus: (await list.readRowsOnScreen())[0]?.status }, shown.join(' | '))
        .toEqual({ ordered: true, first: days[0], firstStatus: 'Expired' });
      await list.search(token);
      expect(await list.readNames(), 'the case\'s past / today / future facilities').toEqual([expired.nameEn, today.nameEn, future.nameEn]);
    });

    await steps.step('Click the "Licence Expiry" column header again - the facilities order with the latest expiry date first', async () => {
      await list.sortBy('licenseExpiry', 'desc');
      const own = await list.readNames();
      await list.search('');
      const shown = await list.readColumnValues('licenseExpiry');
      expect({ ordered: isOrdered(shown, (a, b) => byDay(b, a)), first: dayValue(shown[0] ?? ''), own }, shown.join(' | '))
        .toEqual({ ordered: true, first: days[days.length - 1], own: [future.nameEn, today.nameEn, expired.nameEn] });
    });
  });

  test(`TC-${CASES.byType.azureId}: should order the list by facility type ascending, then descending`, async ({
    facilityManagementPage: list,
    facilityIn,
    page,
    steps,
  }) => {
    await facilityIn('Active', { type: 'hospital' });
    await facilityIn('Active', { type: 'clinic' });
    let options: { asc?: string; desc?: string; all: string[] } = { all: [] };

    await steps.critical('Navigate to the Facility Management module - the module loads and displays the facility list', async () => {
      await list.openTable();
      options = await sortOptionsFor(page, /type/i);
      expect(options.all.length, 'the Sort By options').toBeGreaterThan(0);
    });

    await steps.step('Click the "Type" column header (Sort By Facility Type) - the facilities group and order alphabetically by type ascending', async () => {
      expect(options.asc, `a Facility Type sort (options: ${options.all.join(', ')})`).toBeDefined();
      await sortByOptionId(list, page, options.asc as string);
      const types = await list.readColumnValues('type');
      expect(isOrdered(types, ascending), types.join(' | ')).toBe(true);
    });

    await steps.step('Click the "Type" column header again - the facilities re-order by type descending', async () => {
      expect(options.desc, `a Facility Type sort, descending (options: ${options.all.join(', ')})`).toBeDefined();
      await sortByOptionId(list, page, options.desc as string);
      const types = await list.readColumnValues('type');
      expect(isOrdered(types, descending), types.join(' | ')).toBe(true);
    });
  });

  test(`TC-${CASES.byStatus.azureId}: should order the facilities consistently by status in ascending and descending order`, async ({
    facilityManagementPage: list,
    facilityIn,
    steps,
  }) => {
    const token = groupToken('Sts');
    for (const state of ['Active', 'Inactive', 'Future', 'Expired'] as const) await facilityIn(state, { nameEn: suiteFacilityName(`${token} ${state}`) });

    await steps.critical('Navigate to the Facility Management module - the module loads and displays the facility list', async () => {
      await list.openTable();
      await list.search(token);
      expect(await list.countRows(), 'the case\'s four facilities').toBe(4);
    });

    await steps.step('Sort the facilities by status in ascending order (A-Z) - the facilities order consistently by status value ascending', async () => {
      await list.sortBy('status', 'asc');
      const statuses = await list.readColumnValues('status');
      expect(statuses).toEqual([...STATUS_ORDER]);
    });

    await steps.step('Sort the facilities by status in descending order (Z-A) - the facilities order consistently by status value descending', async () => {
      await list.sortBy('status', 'desc');
      const statuses = await list.readColumnValues('status');
      expect(statuses).toEqual([...STATUS_ORDER].reverse());
    });
  });

  test(`TC-${CASES.exportAllCsv.azureId}: should export every facility record with all its information to CSV, not just the current page`, async ({
    facilityManagementPage: list,
    facilityIn,
    page,
    steps,
  }) => {
    const facility = await facilityIn('Active');
    const menu = list.exportMenu();
    let total = -1;

    await steps.critical('Navigate to the Facility Management module - the module loads and displays all facilities', async () => {
      await list.openTable();
      total = (await wholeRegister(page)).length;
      expect(await list.countRows()).toBeGreaterThan(0);
    });

    await steps.critical('Select the "Export to CSV" option (Export All Data) - a confirmation or download prompt appears', async () => {
      await menu.open();
      await menu.chooseScope('all');
      expect({ prompt: await menu.isFormatDialogOpen(), formats: await menu.getOfferedFormats() }).toEqual({ prompt: true, formats: expect.arrayContaining(['csv']) });
    });

    await steps.step('Open the generated CSV file - it contains all the facility records with all facility information', async () => {
      const { filename, bytes } = await menu.chooseFormatAndRead('csv');
      const parsed = parseExport('csv', bytes);
      const missing = EXPORT_COLUMNS.filter(([, pattern]) => headerOf(parsed.headers, pattern) === '').map(([name]) => name);
      const own = exportRowOf(parsed, EXPORT_HEADER.code, facility.code);
      expect({ file: filename, rows: parsed.rows.length, missingColumns: missing, own: own?.[headerOf(parsed.headers, EXPORT_HEADER.name)] }, `headers: ${parsed.headers.join(', ')}`)
        .toEqual({ file: expect.stringMatching(/\.csv$/i), rows: total, missingColumns: [], own: facility.nameEn });
    });
  });

  test(`TC-${CASES.exportFiltered.azureId}: should export to CSV and Excel only the Active Hospital facilities the filter shows`, async ({
    facilityManagementPage: list,
    facilityIn,
    steps,
  }) => {
    const data = CASES.exportFiltered;
    const hospital = await facilityIn('Active', { type: 'hospital' });
    await facilityIn('Active', { type: 'clinic' });
    let shown!: FacilityListAnswer;

    /** The file holds exactly the filter's facilities, all Active Hospitals, with the case's own. */
    const expectOnlyActiveHospitals = (parsed: ParsedCsv) => {
      const types = columnOf(parsed, EXPORT_HEADER.type);
      const statuses = columnOf(parsed, EXPORT_HEADER.status);
      expect({
        rows: parsed.rows.length,
        otherTypes: types.filter((t) => t !== data.type),
        otherStatuses: statuses.filter((s) => s !== data.status),
        own: columnOf(parsed, EXPORT_HEADER.code).includes(hospital.code),
      }, `headers: ${parsed.headers.join(', ')}`).toEqual({ rows: shown.totalRows, otherTypes: [], otherStatuses: [], own: true });
    };

    await steps.critical('Navigate to the Facility Management module - the module loads and displays the full facility list', async () => {
      await list.openTable();
      expect(await list.countRows()).toBeGreaterThan(0);
    });

    await steps.critical(`Filter the list by type "${data.type}" and status "${data.status}" (sorted by name ascending) - only ${data.status} ${data.type} facilities display`, async () => {
      await list.filterBy('type', data.type);
      await list.filterBy('status', data.status);
      shown = await list.sortBy('name', 'asc');
      const rows = await list.readRowsOnScreen();
      expect({ others: rows.filter((r) => r.type !== data.type || r.status !== data.status).map((r) => r.name), listed: shown.totalRows > 0 })
        .toEqual({ others: [], listed: true });
    });

    let csv: ParsedCsv | null = null;
    await steps.step('Export the list to CSV - a download is produced', async () => {
      const file = await exportFile(list, 'selected', 'csv');
      csv = file.parsed;
      expect(file.filename).toMatch(/\.csv$/i);
    });

    await steps.step(`Open the exported file - it contains only the ${data.status} ${data.type} facilities the filter shows`, async () => {
      expect(csv, 'the CSV file').not.toBeNull();
      expectOnlyActiveHospitals(csv as unknown as ParsedCsv);
    });

    let xlsx: ParsedCsv | null = null;
    await steps.step('Export the list to Xlsx - a download is produced', async () => {
      const file = await exportFile(list, 'selected', 'excel');
      xlsx = file.parsed;
      expect(file.filename).toMatch(/\.xlsx$/i);
    });

    await steps.step(`Open the exported file - it contains only the ${data.status} ${data.type} facilities the filter shows`, async () => {
      expect(xlsx, 'the Excel file').not.toBeNull();
      expectOnlyActiveHospitals(xlsx as unknown as ParsedCsv);
    });
  });

  test(`TC-${CASES.selectedExportCounts.azureId}: should export with Selected Export exactly the 2, then the 4 facilities the filter matches, to CSV and Excel`, async ({
    facilityManagementPage: list,
    facilityIn,
    steps,
  }) => {
    const data = CASES.selectedExportCounts;
    const token = groupToken('Sel');
    for (const [i, type] of (['hospital', 'hospital', 'clinic', 'clinic'] as const).entries()) {
      await facilityIn('Active', { type, nameEn: suiteFacilityName(`${token} ${type} ${i}`) });
    }

    await steps.critical('Navigate to the Facility Management module - the module loads and displays the facility list', async () => {
      await list.openTable();
      expect(await list.countRows()).toBeGreaterThan(0);
    });

    await steps.step(`Apply a filter that returns exactly ${data.first} matching facilities and export to CSV and Xlsx with Selected Export - each file contains exactly ${data.first} records`, async () => {
      await list.search(token);
      const answer = await list.filterBy('type', 'Hospital');
      const csv = await exportFile(list, 'selected', 'csv');
      const xlsx = await exportFile(list, 'selected', 'excel');
      expect({ listed: answer.totalRows, csv: csv.parsed.rows.length, xlsx: xlsx.parsed.rows.length }).toEqual({ listed: data.first, csv: data.first, xlsx: data.first });
    });

    await steps.step(`Adjust the filter so exactly ${data.second} matching facilities are returned and export to CSV and Xlsx with Selected Export - each file contains exactly ${data.second} records`, async () => {
      const answer = await list.filterBy('type', 'All Types');
      const csv = await exportFile(list, 'selected', 'csv');
      const xlsx = await exportFile(list, 'selected', 'excel');
      expect({ listed: answer.totalRows, csv: csv.parsed.rows.length, xlsx: xlsx.parsed.rows.length }).toEqual({ listed: data.second, csv: data.second, xlsx: data.second });
    });
  });

  test(`TC-${CASES.exportAllExcel.azureId}: should export the whole facility list to CSV and Excel with Export All Data`, async ({
    facilityManagementPage: list,
    page,
    steps,
  }) => {
    let total = -1;
    let files: Array<{ filename: string; parsed: ParsedCsv }> = [];

    await steps.critical('Navigate to the Facility Management module - the module loads and displays page 1 of the matching facilities', async () => {
      await list.openTable();
      total = (await wholeRegister(page)).length;
      expect({ onPage: (await list.countRows()) <= 10, total: total > 0 }).toEqual({ onPage: true, total: true });
    });

    await steps.step('Select the "Export All Data" option, click CSV, then Xlsx - a confirmation or download prompt appears and both download', async () => {
      files = [await exportFile(list, 'all', 'csv'), await exportFile(list, 'all', 'excel')];
      expect(files.map((f) => f.filename)).toEqual([expect.stringMatching(/\.csv$/i), expect.stringMatching(/\.xlsx$/i)]);
    });

    await steps.step('Open the generated files - each contains every matching facility record across the whole matching set', async () => {
      expect(files.map((f) => f.parsed.rows.length), 'rows in the CSV and the Excel file').toEqual([total, total]);
    });
  });

  test(`TC-${CASES.emptyExport.azureId}: should generate empty CSV and Excel files when the filter matches no facility`, async ({
    facilityManagementPage: list,
    steps,
  }) => {
    const keyword = CASES.emptyExport.keyword;

    await steps.critical('Navigate to the Facility Management module - the module loads and displays the facility list', async () => {
      await list.openTable();
      expect(await list.countRows()).toBeGreaterThan(0);
    });

    await steps.critical(`Apply a filter that matches no facilities (Code = ${keyword}) - the list displays zero results`, async () => {
      const answer = await list.searchFor(keyword);
      expect({ total: answer.totalRows, rows: await list.getRowCount() }).toEqual({ total: 0, rows: 0 });
    });

    await steps.step('Select "Selected Export", click CSV, then Xlsx - both the CSV and the XLSX files are generated, but they are empty', async () => {
      const csv = await exportFile(list, 'selected', 'csv').catch((e: Error) => ({ filename: `none: ${e.message.slice(0, 120)}`, parsed: null }));
      const xlsx = await exportFile(list, 'selected', 'excel').catch((e: Error) => ({ filename: `none: ${e.message.slice(0, 120)}`, parsed: null }));
      expect({ csv: csv.filename, csvRows: csv.parsed?.rows.length, xlsx: xlsx.filename, xlsxRows: xlsx.parsed?.rows.length })
        .toEqual({ csv: expect.stringMatching(/\.csv$/i), csvRows: 0, xlsx: expect.stringMatching(/\.xlsx$/i), xlsxRows: 0 });
    });
  });

  test(`TC-${CASES.stableTies.azureId}: should keep facilities with the same sort value in the same relative order each time the sort is applied`, async ({
    facilityManagementPage: list,
    facilityIn,
    steps,
  }) => {
    const data = CASES.stableTies;
    const token = groupToken('Tie');
    for (const label of ['A', 'B', 'C']) await facilityIn('Active', { nameEn: suiteFacilityName(`${token} ${label}`), licenseExpiryDate: data.expiry });
    let first: string[] = [];

    await steps.critical('Navigate to the Facility Management module - the module loads and displays the facility list', async () => {
      await list.openTable();
      await list.search(token);
      expect(await list.countRows(), 'the case\'s three facilities').toBe(3);
    });

    await steps.step(`Sort by a column where several facilities share a value (licence expiry ${facilityDayText(data.expiry)}) - the facilities with the tied value group together`, async () => {
      await list.sortBy('licenseExpiry', 'asc');
      first = await list.readNames();
      expect({ count: first.length, expiries: [...new Set(await list.readColumnValues('licenseExpiry'))] }).toEqual({ count: 3, expiries: [facilityDayText(data.expiry)] });
    });

    await steps.step('Repeat the sort action - the tied facilities keep the same relative order as before', async () => {
      const orders: string[][] = [];
      for (let i = 0; i < data.repeats; i += 1) {
        await list.sortBy('name', 'desc');
        await list.sortBy('licenseExpiry', 'asc');
        orders.push(await list.readNames());
      }
      expect(orders, `first order: ${first.join(' | ')}`).toEqual(Array.from({ length: data.repeats }, () => first));
    });
  });

  test(`TC-${CASES.combinedSession.azureId}: should keep the list correct through filter and sort changes and export exactly what the screen shows`, async ({
    facilityManagementPage: list,
    facilityIn,
    steps,
  }) => {
    const data = CASES.combinedSession;
    await facilityIn('Active');
    await facilityIn('Expired');
    let shown!: FacilityListAnswer;

    await steps.critical('Navigate to the Facility Management module - the module loads and displays the facility list', async () => {
      await list.openTable();
      expect(await list.countRows()).toBeGreaterThan(0);
    });

    await steps.step(`Apply a status filter (${data.firstStatus}), sort by licence expiry, change the sort to facility name, then change the filter (${data.secondStatus}) - the list updates correctly at each step`, async () => {
      const problems: string[] = [];
      const statusesOff = async (status: string) => (await list.readColumnValues('status')).filter((s) => s !== status);
      await list.filterBy('status', data.firstStatus);
      problems.push(...(await statusesOff(data.firstStatus)).map((s) => `status filter ${data.firstStatus}: a ${s} row`));
      await list.sortBy('licenseExpiry', 'asc');
      if (!isOrdered(await list.readColumnValues('licenseExpiry'), byDay)) problems.push('licence expiry sort not ascending');
      problems.push(...(await statusesOff(data.firstStatus)).map((s) => `after the expiry sort: a ${s} row`));
      await list.sortBy('name', 'asc');
      if (!isOrdered(await list.readNames(), ascending)) problems.push('name sort not ascending');
      shown = await list.filterBy('status', data.secondStatus);
      problems.push(...(await statusesOff(data.secondStatus)).map((s) => `status filter ${data.secondStatus}: a ${s} row`));
      if (!isOrdered(await list.readNames(), ascending)) problems.push(`name sort lost after filtering ${data.secondStatus}`);
      const errors = (await list.waitForVisibleMessages()).filter((m) => /error|failed|went wrong/i.test(m));
      expect([...problems, ...errors]).toEqual([]);
    });

    await steps.step('Export the list to Excel with "Selected Export" after the final filter and sort - the exported file matches exactly what is shown on screen', async () => {
      const onScreen = await list.readNames();
      const { parsed } = await exportFile(list, 'selected', 'excel');
      // The file keeps a name's stored spacing ("Future -  Activated"), the screen collapses
      // runs of spaces (full run 2026-11-04) - compared as displayed text.
      const names = columnOf(parsed, EXPORT_HEADER.name).map((n) => String(n).replace(/\s+/g, ' ').trim());
      expect({ rows: names.length, firstPage: names.slice(0, onScreen.length) }, `headers: ${parsed.headers.join(', ')}`).toEqual({ rows: shown.totalRows, firstPage: onScreen });
    });
  });

  test(`TC-${CASES.exportColumns.azureId}: should export CSV and Excel files with every required column, correctly labelled and formatted, matching the screen`, async ({
    facilityManagementPage: list,
    facilityIn,
    steps,
  }) => {
    const facility: ProvisionedFacility = await facilityIn('Active');
    let files: Array<{ format: string; filename: string; parsed: ParsedCsv }> = [];

    await steps.critical('Navigate to the Facility Management module - the module loads and displays the facility list', async () => {
      await list.openTable();
      expect(await list.countRows()).toBeGreaterThan(0);
    });

    await steps.step('Export the list to CSV and separately to Excel - both downloads complete successfully', async () => {
      files = [{ format: 'csv', ...(await exportFile(list, 'all', 'csv')) }, { format: 'excel', ...(await exportFile(list, 'all', 'excel')) }];
      expect(files.map((f) => ({ name: f.filename, rows: f.parsed.rows.length > 0 }))).toEqual([
        { name: expect.stringMatching(/\.csv$/i), rows: true },
        { name: expect.stringMatching(/\.xlsx$/i), rows: true },
      ]);
    });

    await steps.step('Check each file against the required column checklist - every column is present, labelled and holds correctly formatted values matching the screen', async () => {
      const row = await list.readRow(facility.nameEn);
      const problems: string[] = [];
      for (const { format, parsed } of files) {
        const missing = EXPORT_COLUMNS.filter(([, pattern]) => headerOf(parsed.headers, pattern) === '').map(([name]) => name);
        if (missing.length) problems.push(`${format}: columns missing ${missing.join(', ')} (headers: ${parsed.headers.join(', ')})`);
        const own = exportRowOf(parsed, EXPORT_HEADER.code, facility.code);
        if (!own) {
          problems.push(`${format}: no row for ${facility.code}`);
          continue;
        }
        const cell = (pattern: RegExp) => (own[headerOf(parsed.headers, pattern)] ?? '').trim();
        const exported = { name: cell(EXPORT_HEADER.name), nameAr: cell(EXPORT_HEADER.nameAr), type: cell(EXPORT_HEADER.type), licenceNo: cell(EXPORT_HEADER.licenceNo), expiryDay: dayValue(cell(EXPORT_HEADER.expiry)), status: cell(EXPORT_HEADER.status) };
        const screen = { name: row.name, nameAr: facility.nameAr, type: row.type, licenceNo: row.licenseNo, expiryDay: dayValue(row.licenseExpiry), status: row.status };
        if (JSON.stringify(exported) !== JSON.stringify(screen)) problems.push(`${format}: ${JSON.stringify(exported)} vs screen ${JSON.stringify(screen)}`);
      }
      expect(problems).toEqual([]);
    });
  });
});
