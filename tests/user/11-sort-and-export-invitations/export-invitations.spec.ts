import { test, expect } from '../../../fixtures';
import type { TestSteps } from '../../../fixtures/testStatus.fixture';
import type { InvitationListPage } from '../../../pages/user/InvitationListPage';
import type { UserExportResult } from '../../../pages/user/userCommon';
import { CASES, EXPORT_CHECKLIST, EXPORT_FORMAT, OLDEST_SORT_BY, PAYER_A } from '../../../data/user/sortAndExportInvitations.data';
import {
  EXPORT_HEADER,
  exportKeys,
  exportRowFor,
  headerMatching,
  isXlsx,
  listDateToIso,
  provisionInvitations,
  rapidExports,
  sameStatus,
  stampTerm,
  stampedInvitationEmail,
} from '../../../utils/user/writerDHelpers';
import { userStamp } from '../../../utils/UserProvisioning';

/** Rows on screen that the file does not carry with the same role and status. */
async function rowsMissingFromFile(list: InvitationListPage, result: UserExportResult): Promise<string[]> {
  const status = headerMatching(result.parsed, EXPORT_HEADER.status);
  return (await list.readRows())
    .filter((row) => !sameStatus(exportRowFor(result.parsed, row.email, row.role)?.[status] ?? '#', row.status))
    .map((row) => `${row.email} | ${row.role} | ${row.status}`);
}

/** 20629 / 20630: the whole list to one format, three steps. */
async function exportWholeList(list: InvitationListPage, steps: TestSteps, format: 'csv' | 'excel'): Promise<void> {
  let total = -1;
  let result: UserExportResult | null = null;
  const name = format === 'csv' ? 'CSV' : 'Excel';

  await steps.critical('Navigate to the User Management module - the Invitations list loads with existing invitations', async () => {
    const answer = await list.captureList(() => list.openTable());
    total = answer.totalRows;
    expect({ total: total > 0, rows: await list.countRows() > 0 }).toEqual({ total: true, rows: true });
  });

  await steps.critical(`Select Export and choose ${name} format - a ${name} file download is generated`, async () => {
    result = await list.exportAndParse('all', format);
    expect({ name: result.filename, format: result.request.format, bytes: result.bytes.length > 0 })
      .toEqual({ name: expect.stringMatching(format === 'csv' ? /\.csv$/i : /\.xlsx$/i), format: EXPORT_FORMAT[format], bytes: true });
  });

  await steps.step(`Open the downloaded file - the invitations data matching the list on screen${format === 'excel' ? ', correctly formatted in columns' : ''}`, async () => {
    const got = result as unknown as UserExportResult;
    expect({
      valid: format === 'excel' ? isXlsx(got.bytes) : got.parsed.headers.length > 1,
      columns: [EXPORT_HEADER.email, EXPORT_HEADER.role, EXPORT_HEADER.status].map((re) => headerMatching(got.parsed, re) !== ''),
      rows: got.parsed.rows.length,
      missingOnScreenRows: await rowsMissingFromFile(list, got),
    }, `headers: ${got.parsed.headers.join(', ')}`).toEqual({ valid: true, columns: [true, true, true], rows: total, missingOnScreenRows: [] });
  });
}

/**
 * User story 20417: Sort and Export Invitations - the export cases.
 * CSV and Excel of the whole list, an empty list, the columns against the list,
 * a large list with special characters, repeated Export clicks, and the sort
 * kept in the file. See the data file for how the cases map onto the live list.
 */
test.describe('US 20417 - Sort and Export Invitations', () => {
  test.describe.configure({ timeout: 6 * 60_000 });

  test(`TC-${CASES.exportCsv.azureId}: should export the invitations list as a CSV file matching the list when CSV is chosen`, async ({
    invitationListPage: list,
    suiteInvitation,
    steps,
  }) => {
    await suiteInvitation();
    await exportWholeList(list, steps, 'csv');
  });

  test(`TC-${CASES.exportExcel.azureId}: should export the invitations list as an Excel file matching the list when Excel is chosen`, async ({
    invitationListPage: list,
    suiteInvitation,
    steps,
  }) => {
    await suiteInvitation();
    await exportWholeList(list, steps, 'excel');
  });

  test(`TC-${CASES.exportEmpty.azureId}: should produce a headers-only file without error when an empty invitations list is exported`, async ({
    invitationListPage: list,
    steps,
  }) => {
    const data = CASES.exportEmpty;
    let result: UserExportResult | null = null;

    await steps.critical(`Navigate to the User Management module - the Invitations list loads showing zero invitations (search "${data.keyword}")`, async () => {
      await list.openTable();
      const answer = await list.searchFor(data.keyword);
      expect({ total: answer.totalRows, rows: await list.countRows(), empty: (await list.getEmptyStateText()) !== '' }).toEqual({ total: 0, rows: 0, empty: true });
    });

    await steps.critical('Select Export and choose CSV - a file is generated without error', async () => {
      result = await list.exportAndParse('selected', 'csv');
      const errors = (await list.readToasts()).filter((m) => /error|fail|could not|wrong/i.test(m));
      expect({ name: result.filename, searchText: result.request.searchText, errors }).toEqual({ name: expect.stringMatching(/\.csv$/i), searchText: data.keyword, errors: [] });
    });

    await steps.step('Open the downloaded file - only the column headers, no data rows', async () => {
      const got = result as unknown as UserExportResult;
      expect({ headers: got.parsed.headers.length > 0, rows: got.parsed.rows.length }, `headers: ${got.parsed.headers.join(', ')}`).toEqual({ headers: true, rows: 0 });
    });
  });

  test(`TC-${CASES.exportColumns.azureId}: should carry every on-screen invitation column with matching data when the list is exported to Excel`, async ({
    invitationListPage: list,
    suiteInvitation,
    suiteRole,
    steps,
  }) => {
    const role = await suiteRole({ hasAssignedPayers: true });
    const inv = await suiteInvitation({ roleId: role.id, payerName: PAYER_A });
    let shown = { email: '', role: '', payer: '', expiration: '', status: '' };
    let result: UserExportResult | null = null;

    await steps.critical('Navigate to the User Management module - the Invitations list loads with its visible columns (email, role, payer, status, date)', async () => {
      await list.openTable();
      const headers = await list.getHeaderTexts();
      await list.revealRow(inv.email);
      shown = await list.readRowById(inv.id);
      expect({ headers, row: shown }).toEqual({
        headers: expect.arrayContaining(['Email', 'Role', 'Payer', 'Expiration', 'Status']),
        row: { email: inv.email, role: role.name, payer: PAYER_A, expiration: expect.stringMatching(/\d{2}\/\d{2}\/\d{4}/), status: 'Pending' },
      });
    });

    await steps.critical('Export the list to Excel - the file downloads successfully', async () => {
      result = await list.exportAndParse('all', 'excel');
      expect({ name: result.filename, xlsx: isXlsx(result.bytes) }).toEqual({ name: expect.stringMatching(/\.xlsx$/i), xlsx: true });
    });

    await steps.step('Compare each exported column against the on-screen checklist - every column present with matching data for the invitation', async () => {
      const got = result as unknown as UserExportResult;
      const header = Object.fromEntries(EXPORT_CHECKLIST.map(([key, re]) => [key, headerMatching(got.parsed, re)]));
      const row = exportRowFor(got.parsed, inv.email, role.name) ?? {};
      const expiry = headerMatching(got.parsed, EXPORT_HEADER.expiration);
      expect({
        missingColumns: EXPORT_CHECKLIST.filter(([key]) => header[key] === '').map(([key]) => key),
        email: row[header.email] ?? '',
        role: row[header.role] ?? '',
        payer: row[header.payer] ?? '',
        status: row[header.status] ?? '',
        expiration: (row[expiry] ?? '').slice(0, 10),
      }, `headers: ${got.parsed.headers.join(', ')}`).toEqual({
        missingColumns: [],
        email: inv.email,
        role: role.name,
        payer: shown.payer,
        status: shown.status,
        expiration: listDateToIso(shown.expiration),
      });
    });
  });

  test(`TC-${CASES.exportLargeSpecial.azureId}: should export a large sorted invitations list with special characters intact when exported to CSV and Excel`, async ({
    invitationListPage: list,
    suiteInvitation,
    suiteRole,
    steps,
  }) => {
    const data = CASES.exportLargeSpecial;
    const stamp = userStamp();
    const role = await suiteRole({ name: `QA Automation Role ${stamp}${data.roleSuffix}` });
    const made = await provisionInvitations(suiteInvitation, data.volume, { roleId: role.id, emailOf: (i) => stampedInvitationEmail(stamp, `${data.addressTag}${i}`) });
    let total = -1;
    let csv: UserExportResult | null = null;
    let excel: UserExportResult | null = null;

    await steps.critical(`Navigate to the User Management module - the Invitations list loads with a large number of records (${data.volume} suite invitations added)`, async () => {
      const answer = await list.captureList(() => list.openTable());
      const ours = await list.searchFor(stampTerm(stamp));
      expect({ total: answer.totalRows >= data.volume, ours: ours.totalRows, morethanOnePage: ours.totalRows > (await list.countRows()) })
        .toEqual({ total: true, ours: data.volume, morethanOnePage: true });
    });

    await steps.critical('Sort the list by Email and export to both CSV and Excel - both files are generated without error or timeout', async () => {
      await list.searchFor('');
      const { answer } = await list.sortByOption('email');
      total = answer.totalRows;
      csv = await list.exportAndParse('selected', 'csv');
      excel = await list.exportAndParse('selected', 'excel');
      expect({ csv: csv.filename, excel: excel.filename, csvRows: csv.parsed.rows.length, excelRows: excel.parsed.rows.length })
        .toEqual({ csv: expect.stringMatching(/\.csv$/i), excel: expect.stringMatching(/\.xlsx$/i), csvRows: total, excelRows: total });
    });

    await steps.step('Inspect the records with special characters and commas - the characters display correctly and commas do not break the CSV columns', async () => {
      const broken = (file: UserExportResult): string[] => {
        const status = headerMatching(file.parsed, EXPORT_HEADER.status);
        return made.filter((inv) => exportRowFor(file.parsed, inv.email, role.name)?.[status] !== 'Pending').map((inv) => inv.email);
      };
      expect({ csv: broken(csv as unknown as UserExportResult), excel: broken(excel as unknown as UserExportResult) }, `role "${role.name}"`).toEqual({ csv: [], excel: [] });
    });
  });

  test(`TC-${CASES.rapidExport.azureId}: should produce one correct complete file when Export is selected repeatedly before the first download completes`, async ({
    invitationListPage: list,
    page,
    suiteInvitation,
    steps,
  }) => {
    const data = CASES.rapidExport;
    await suiteInvitation();
    let total = -1;

    await steps.critical('Navigate to the User Management module - the Invitations list loads', async () => {
      const answer = await list.captureList(() => list.openTable());
      total = answer.totalRows;
      expect(total).toBeGreaterThan(0);
    });

    await steps.step(`Select Export, choose CSV and click Export ${data.burst} times rapidly - the duplicates are queued or ignored and one correct, complete file results`, async () => {
      const burst = await rapidExports(page, list, data.burst);
      const contents = new Set(burst.files.map((f) => f.bytes.toString('utf8')));
      expect({
        produced: burst.files.length > 0,
        incomplete: burst.files.filter((f) => f.parsed.rows.length !== total || f.parsed.headers.length < 2).map((f) => `${f.name} (${f.parsed.rows.length} rows)`),
        distinctContents: contents.size,
      }, `requests ${burst.requests}, files ${burst.files.map((f) => f.name).join(', ')}, refused clicks ${burst.refusedClicks}`).toEqual({ produced: true, incomplete: [], distinctContents: 1 });
    });
  });

  test(`TC-${CASES.exportKeepsSort.azureId}: should keep the on-screen sort order in the exported file when a non-default sort is applied before exporting`, async ({
    invitationListPage: list,
    suiteInvitation,
    steps,
  }) => {
    await suiteInvitation();
    let onScreen: string[] = [];
    let result: UserExportResult | null = null;

    await steps.critical('Navigate to the User Management module - the Invitations list loads in default order', async () => {
      await list.openTable();
      expect(await list.readSortLabel()).toMatch(/newest/i);
    });

    await steps.critical('Apply a non-default sort order, oldest-to-newest - the on-screen list reorders accordingly', async () => {
      const { request } = await list.sortByOption('oldest');
      onScreen = (await list.readRows()).map((r) => `${r.email.toLowerCase()} | ${r.role}`);
      expect({ sortBy: request.sortBy, rows: onScreen.length > 1 }).toEqual({ sortBy: OLDEST_SORT_BY, rows: true });
    });

    await steps.critical('Export the list to CSV - the file downloads', async () => {
      result = await list.exportAndParse('selected', 'csv');
      expect({ name: result.filename, sortBy: result.request.sortBy }).toEqual({ name: expect.stringMatching(/\.csv$/i), sortBy: OLDEST_SORT_BY });
    });

    await steps.step('Compare the row order in the file to the on-screen order - the file preserves the displayed order', async () => {
      const fileOrder = exportKeys((result as unknown as UserExportResult).parsed).slice(0, onScreen.length);
      expect(fileOrder).toEqual(onScreen);
    });
  });
});
