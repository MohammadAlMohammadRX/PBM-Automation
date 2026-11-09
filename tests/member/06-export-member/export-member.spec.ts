import { test, expect } from '../../../fixtures';
import type { Page } from '@playwright/test';
import type { TestSteps } from '../../../fixtures/testStatus.fixture';
import type { MemberManagementPage } from '../../../pages/member/MemberManagementPage';
import type { ConfirmDialog } from '../../../pages/components/ConfirmDialog';
import type { ParsedCsv } from '../../../utils/CsvUtils';
import { CASES, EXPORT_COLUMNS, EXPORT_HEADER } from '../../../data/member/exportMember.data';
import { listMemberRegister, type ProvisionedMember } from '../../../utils/MemberProvisioning';
import { columnOf, downloadFormat, headerOf, isXlsx, parseExport, type DownloadedFile } from '../../../utils/member/writerAHelpers';

const FORMAT_LABEL = { csv: /csv/i, excel: /excel/i } as const;

/** Which list columns the file lacks. */
const missingColumns = (parsed: ParsedCsv): string[] => EXPORT_COLUMNS.filter(([, pattern]) => headerOf(parsed.headers, pattern) === '').map(([name]) => name);

/** The register's size now. */
const registerTotal = async (page: Page): Promise<number> => (await listMemberRegister(page, {}, 1)).totalRows;

/** 19856 / 19857: the whole list exported to one format, five steps. */
async function exportWholeList(
  { list, page, steps, member }: { list: MemberManagementPage; page: Page; steps: TestSteps; member: ProvisionedMember },
  format: 'csv' | 'excel',
): Promise<void> {
  let dialog!: ConfirmDialog;
  let file: DownloadedFile | null = null;
  const name = format === 'csv' ? 'CSV' : 'Excel';

  await steps.critical('Navigate to the Member Management module - the member list view is displayed', async () => {
    await list.openTable();
    expect(await list.countRows()).toBeGreaterThan(0);
  });

  await steps.critical('Click the "Export" button (Export All Data) - the export format options are displayed', async () => {
    dialog = await list.chooseExport('all');
    const formats = await list.readExportFormats();
    expect({ csv: formats.some((f) => FORMAT_LABEL.csv.test(f)), excel: formats.some((f) => FORMAT_LABEL.excel.test(f)) }, formats.join(' | ')).toEqual({ csv: true, excel: true });
  });

  await steps.critical(`Select "${name}" as the export format - the ${name} option is selected`, async () => {
    expect(await dialog.getActionKeys(), 'the format dialog\'s choices').toContain(format);
  });

  await steps.critical('Confirm the export - a file download begins', async () => {
    file = await downloadFormat(page, dialog, format);
    expect({ downloaded: file !== null, name: file?.filename ?? '' }).toEqual({ downloaded: true, name: expect.stringMatching(format === 'csv' ? /\.csv$/i : /\.xlsx$/i) });
  });

  await steps.step(`Open the downloaded file - a valid ${name} file with every member and the details the list shows`, async () => {
    const got = file as unknown as DownloadedFile;
    const parsed = parseExport(format, got.bytes);
    expect({
      valid: format === 'excel' ? isXlsx(got.bytes) : parsed.headers.length > 1,
      rows: parsed.rows.length,
      missingColumns: missingColumns(parsed),
      ownListed: columnOf(parsed, EXPORT_HEADER.code).includes(member.code),
      scope: got.request.scope,
    }, `headers: ${parsed.headers.join(', ')}`).toEqual({ valid: true, rows: await registerTotal(page), missingColumns: [], ownListed: true, scope: 'All' });
  });
}

/**
 * User story 14381: Export Member.
 * The whole list to Excel and CSV, every page, an empty result, a filtered
 * export, the columns against the list, and a large list. The unauthorised-user
 * case is in export-permission.spec.ts. See the data file for how the cases map
 * onto the live list.
 */
test.describe('US 14381 - Export Member', () => {
  test.describe.configure({ timeout: 10 * 60_000 });

  test(`TC-${CASES.allExcel.azureId}: should export the full member list to a valid Excel file`, async ({
    memberManagementPage: list,
    memberIn,
    page,
    steps,
  }) => {
    const member = await memberIn('Active');
    await exportWholeList({ list, page, steps, member }, 'excel');
  });

  test(`TC-${CASES.allCsv.azureId}: should export the full member list to a valid CSV file`, async ({
    memberManagementPage: list,
    memberIn,
    page,
    steps,
  }) => {
    const member = await memberIn('Active');
    await exportWholeList({ list, page, steps, member }, 'csv');
  });

  test(`TC-${CASES.allPagesExcel.azureId}: should export every member of the result set to Excel, not only the visible page`, async ({
    memberManagementPage: list,
    page,
    steps,
  }) => {
    let total = -1;
    let file: DownloadedFile | null = null;

    await steps.critical('Navigate to the Member Management module - the member list view is displayed', async () => {
      await list.openTable();
      expect(await list.countRows()).toBeGreaterThan(0);
    });

    await steps.critical('Apply no filters and note the total number of members shown in the list summary - the total is displayed', async () => {
      total = await list.readKpi('total');
      expect({ total, morethanOnePage: total > (await list.countRows()) }).toEqual({ total: await registerTotal(page), morethanOnePage: true });
    });

    await steps.critical('Click "Export" and select "Excel" - the file download begins', async () => {
      const dialog = await list.chooseExport('all');
      file = await downloadFormat(page, dialog, 'excel');
      expect(file?.filename ?? '').toMatch(/\.xlsx$/i);
    });

    await steps.step('Open the file and count the rows - every member of the result set, not only the current page', async () => {
      const parsed = parseExport('excel', (file as unknown as DownloadedFile).bytes);
      expect(parsed.rows.length, `headers: ${parsed.headers.join(', ')}`).toBe(total);
    });
  });

  test(`TC-${CASES.emptyList.azureId}: should handle an export of an empty result set gracefully`, async ({
    memberManagementPage: list,
    page,
    steps,
  }) => {
    const data = CASES.emptyList;
    let offered = false;

    await steps.critical('Navigate to the Member Management module - the member list view is displayed', async () => {
      await list.openTable();
      expect(await list.countRows()).toBeGreaterThan(0);
    });

    await steps.critical(`Apply a search that returns no member ("${data.keyword}") - an empty-state message is shown`, async () => {
      const answer = await list.searchFor(data.keyword);
      expect({ total: answer.totalRows, message: await list.getEmptyStateText() }).toEqual({ total: 0, message: expect.stringMatching(/no (results|records)/i) });
    });

    await steps.step('Click "Export" - the system responds', async () => {
      offered = await list.isExportOffered();
      expect(offered, 'the Export control is rendered').toBe(true);
    });

    await steps.step('Observe the outcome - the export is blocked with a message, or an empty file with headers only is produced', async () => {
      const dialog = await list.chooseExport('selected');
      const file = await downloadFormat(page, dialog, 'csv', 15_000);
      const messages = await list.waitForVisibleMessages(2_000);
      const parsed = file ? parseExport('csv', file.bytes) : null;
      const errors = messages.filter((m) => /error|fail|wrong/i.test(m) && !/no (members|records|data)/i.test(m));
      expect({
        handled: parsed !== null ? parsed.rows.length === 0 && parsed.headers.length > 0 : messages.length > 0,
        unexpectedErrors: errors,
      }, `file: ${file?.filename ?? 'none'} rows ${parsed?.rows.length ?? '-'} - messages: ${messages.join(' | ')}`).toEqual({ handled: true, unexpectedErrors: [] });
    });
  });

  test(`TC-${CASES.filtered.azureId}: should export only the members the applied Status filter shows`, async ({
    memberManagementPage: list,
    memberIn,
    page,
    steps,
  }) => {
    const data = CASES.filtered;
    const active = await memberIn('Active');
    const inactive = await memberIn('Inactive');
    let total = -1;
    let file: DownloadedFile | null = null;

    await steps.critical('Navigate to the Member Management module - the member list view is displayed', async () => {
      await list.openTable();
      expect(await list.countRows()).toBeGreaterThan(0);
    });

    await steps.critical(`Apply a filter, Status = "${data.status}" - the list shows only active members`, async () => {
      const answer = await list.filterBy('status', data.status);
      total = answer.totalRows;
      expect(answer.items.filter((i) => !i.isActive).length).toBe(0);
    });

    await steps.critical('Click "Export" and select "Selected Excel" - the file download begins', async () => {
      const dialog = await list.chooseExport('selected');
      file = await downloadFormat(page, dialog, 'excel');
      expect({ name: file?.filename ?? '', scope: file?.request.scope, isActive: file?.request.isActive })
        .toEqual({ name: expect.stringMatching(/\.xlsx$/i), scope: 'Filtered', isActive: true });
    });

    await steps.step('Open the downloaded file - only the members matching the filter', async () => {
      const parsed = parseExport('excel', (file as unknown as DownloadedFile).bytes);
      const codes = columnOf(parsed, EXPORT_HEADER.code);
      const actives = columnOf(parsed, EXPORT_HEADER.active);
      expect({
        rows: parsed.rows.length,
        notActive: actives.filter((v) => !/^(yes|active|true)$/i.test(v)),
        activeOwn: codes.includes(active.code),
        inactiveOwn: codes.includes(inactive.code),
      }, `headers: ${parsed.headers.join(', ')}`).toEqual({ rows: total, notActive: [], activeOwn: true, inactiveOwn: false });
    });
  });

  test(`TC-${CASES.columns.azureId}: should carry every field the member list shows as a column of the exported file`, async ({
    memberManagementPage: list,
    page,
    steps,
  }) => {
    let shown: string[] = [];
    let file: DownloadedFile | null = null;

    await steps.critical('Navigate to the Member Management module - the member list view is displayed', async () => {
      await list.openTable();
      expect(await list.countRows()).toBeGreaterThan(0);
    });

    await steps.critical('Note the fields displayed for each member in the list - the on-screen fields are recorded', async () => {
      shown = (await list.getHeaderTexts()).filter((h) => !/^actions?$/i.test(h));
      expect(shown.length, shown.join(' | ')).toBeGreaterThan(0);
    });

    await steps.critical('Click "Export" and select "Excel" - the file download begins', async () => {
      const dialog = await list.chooseExport('all');
      file = await downloadFormat(page, dialog, 'excel');
      expect(file?.filename ?? '').toMatch(/\.xlsx$/i);
    });

    await steps.step('Open the file and compare its columns with the list - every field shown in the records is a column of the file', async () => {
      const parsed = parseExport('excel', (file as unknown as DownloadedFile).bytes);
      const patternOf = (header: string): RegExp | undefined => EXPORT_COLUMNS.find(([name]) => name.toLowerCase() === header.toLowerCase()
        || (name === 'Name' && /^(member )?name$/i.test(header)) || (name === 'Member ID' && /^member id$/i.test(header)))?.[1];
      const missing = shown.filter((h) => { const p = patternOf(h); return p === undefined || headerOf(parsed.headers, p) === ''; });
      expect(missing, `list: ${shown.join(' | ')} - file: ${parsed.headers.join(', ')}`).toEqual([]);
    });
  });

  test(`TC-${CASES.largeList.azureId}: should export a large member list completely without timing out or truncating`, async ({
    memberManagementPage: list,
    memberVolume,
    page,
    steps,
  }) => {
    test.setTimeout(20 * 60_000);
    const volume = await memberVolume(CASES.largeList.volume);
    let file: DownloadedFile | null = null;

    await steps.critical('Navigate to the Member Management module - the member list view is displayed', async () => {
      await list.openTable();
      expect(volume.members.length, `the ${CASES.largeList.volume} imported members`).toBe(CASES.largeList.volume);
    });

    await steps.critical('Click "Export" and select "Excel" on the full, unfiltered list - the file generation begins', async () => {
      const dialog = await list.chooseExport('all');
      file = await downloadFormat(page, dialog, 'excel', 180_000);
      expect(file, 'a download started').not.toBeNull();
    });

    await steps.step('Wait for the export to complete - the download completes without timing out or truncating', async () => {
      const got = file as unknown as DownloadedFile;
      expect({ name: got.filename, xlsx: isXlsx(got.bytes) }).toEqual({ name: expect.stringMatching(/\.xlsx$/i), xlsx: true });
    });

    await steps.step('Open the file and compare the record count with the total members - every record is present', async () => {
      const parsed = parseExport('excel', (file as unknown as DownloadedFile).bytes);
      const lastNames = columnOf(parsed, EXPORT_HEADER.lastName);
      expect({ rows: parsed.rows.length, volumeInFile: lastNames.filter((n) => n.startsWith(volume.batch)).length })
        .toEqual({ rows: await registerTotal(page), volumeInFile: CASES.largeList.volume });
    });
  });
});
