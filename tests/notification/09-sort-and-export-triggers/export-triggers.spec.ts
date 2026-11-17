import { test, expect } from '../../../fixtures';
import type { ListAnswer, NcExport } from '../../../pages/notification/NotificationCenterPage';
import { listTriggers, type TriggerRecord } from '../../../utils/notification/notificationApi';
import {
  TriggerListView,
  answerIds,
  createOrderTriggers,
  describeExport,
  exportNames,
  namesForRequest,
} from '../../../utils/notification/writerBHelpers';
import {
  ACTIVE_FILTER,
  ACTIVE_MARK,
  CASES,
  EMPTY_FILTER,
  EMPTY_LIST_TEXT,
  EXCEL_FILE,
  EXPORT_MENU,
  ORDER_SEARCH,
  SORT_EXPORT_STORY,
  TRIGGER_COLUMNS,
  TRIGGER_COLUMN_KEYS,
} from '../../../data/notification/sortAndExportTriggers.data';

/**
 * US 20986 - Sort and Export Triggers: Selected Export (the current search and
 * filters) vs Export All Data, the Excel file and its columns. The file is read
 * back and compared with the screen and with the API's answer to the SAME
 * request - never with the TC's example counts.
 */
test.describe(`US ${SORT_EXPORT_STORY.id} - ${SORT_EXPORT_STORY.title}`, () => {
  test.describe.configure({ timeout: 4 * 60_000 });

  test(`TC-${CASES.exportSelected.azureId}: should export exactly the triggers matching the search and the Active filter when Selected Export is chosen`, async ({ steps, page, suiteTriggers }) => {
    const list = new TriggerListView(page);
    const made: { active: TriggerRecord | null; inactive: TriggerRecord | null } = { active: null, inactive: null };
    let filtered: ListAnswer | null = null;
    let shown: string[] = [];
    let file: NcExport | null = null;

    await steps.critical(`Precondition: suite triggers carrying "${ORDER_SEARCH}" exist - one active, one inactive`, async () => {
      const t = await createOrderTriggers(page, suiteTriggers, ORDER_SEARCH);
      made.active = t.active;
      made.inactive = t.inactive;
      expect([t.active.isActive, t.inactive.isActive], 'one active, one inactive').toEqual([true, false]);
    });

    await steps.critical('Navigate to the Notification Center Management module - the module loads and the trigger list is displayed', async () => {
      await list.open();
      await expect(list.rows().first(), 'the trigger list rows').toBeVisible();
    });

    await steps.step(`Apply Search "${ORDER_SEARCH}" and filter Active = Active - the list shows only the matching triggers`, async () => {
      await list.search(ORDER_SEARCH);
      filtered = await list.filter(ACTIVE_FILTER);
      const rows = await list.pageRows(['name', 'active']);
      shown = rows.map((r) => r.name);
      const said = `rows: ${rows.map((r) => `${r.name} ${r.active}`).join(' | ')}; request ${JSON.stringify(filtered?.request ?? {})}`;
      expect.soft(rows.filter((r) => !r.name.toLowerCase().includes(ORDER_SEARCH.toLowerCase()) || r.active !== ACTIVE_MARK.yes).map((r) => r.name), `rows not matching the search + filter - ${said}`).toEqual([]);
      expect.soft(await list.rowIds(), 'the screen equals the filtered answer').toEqual(answerIds(filtered));
      expect.soft(shown, `the inactive suite trigger is filtered out - ${said}`).not.toContain(made.inactive?.name);
      expect(shown, `the active suite trigger is listed - ${said}`).toContain(made.active?.name);
    });

    await steps.step('Select Export > Selected Export - the export runs', async () => {
      expect.soft(await list.exportMenuLabels(), 'the Export menu').toEqual([...EXPORT_MENU]);
      file = await list.export('selected');
      expect(file.sheet, `the downloaded file ${describeExport(file)}`).not.toBeNull();
    });

    await steps.step('Open the generated Excel file - it contains only the triggers matching the applied search and filters', async () => {
      const inFile = file ? exportNames(file) : [];
      const matching = await namesForRequest(page, filtered);
      expect.soft(inFile, `the file holds no other trigger - ${file ? describeExport(file) : 'no file'}`).not.toContain(made.inactive?.name);
      expect.soft([...inFile].sort(), 'the file vs the screen').toEqual([...shown].sort());
      expect([...inFile].sort(), `the file vs every trigger the same search + filter matches (API, ${matching.totalRows})`).toEqual([...matching.names].sort());
    });
  });

  test(`TC-${CASES.exportAll.azureId}: should export every trigger regardless of the search and the Active filter when Export All Data is chosen`, async ({ steps, page, suiteTriggers }) => {
    const list = new TriggerListView(page);
    const made: { active: TriggerRecord | null; inactive: TriggerRecord | null } = { active: null, inactive: null };
    let filtered: ListAnswer | null = null;
    let file: NcExport | null = null;

    await steps.critical(`Precondition: suite triggers carrying "${ORDER_SEARCH}" exist - one active, one inactive`, async () => {
      const t = await createOrderTriggers(page, suiteTriggers, ORDER_SEARCH);
      made.active = t.active;
      made.inactive = t.inactive;
      expect([t.active.isActive, t.inactive.isActive], 'one active, one inactive').toEqual([true, false]);
    });

    await steps.critical('Navigate to the Notification Center Management module - the module loads and the trigger list is displayed', async () => {
      await list.open();
      await expect(list.rows().first(), 'the trigger list rows').toBeVisible();
    });

    await steps.step(`Apply Search "${ORDER_SEARCH}" and filter Active = Active - the list shows only the matching triggers`, async () => {
      await list.search(ORDER_SEARCH);
      filtered = await list.filter(ACTIVE_FILTER);
      const all = await listTriggers(page);
      const shown = await list.column('name');
      expect.soft(shown, 'the inactive suite trigger is filtered out').not.toContain(made.inactive?.name);
      expect(filtered?.totalRows ?? Number.NaN, `the filtered count (${filtered?.totalRows}) is smaller than every trigger (${all.totalRows})`).toBeLessThan(all.totalRows);
    });

    await steps.step('Select Export > Export All Data - the export runs', async () => {
      file = await list.export('all');
      expect(file.sheet, `the downloaded file ${describeExport(file)}`).not.toBeNull();
    });

    await steps.step('Open the generated Excel file - it contains every trigger regardless of the applied search and filters', async () => {
      const inFile = file ? exportNames(file) : [];
      const all = await listTriggers(page, {}, 500);
      expect.soft(inFile, 'the inactive suite trigger is in the file').toContain(made.inactive?.name);
      expect.soft(inFile.length, `rows in the file vs every trigger (API ${all.totalRows})`).toBe(all.totalRows);
      expect([...inFile].sort(), 'the file vs every trigger (API)').toEqual(all.items.map((t) => t.name).sort());
    });
  });

  test(`TC-${CASES.exportExcel.azureId}: should produce a valid Excel workbook when the trigger list is exported`, async ({ steps, page }) => {
    const list = new TriggerListView(page);
    let file: NcExport | null = null;

    await steps.critical('Navigate to the Notification Center Management module - the module loads and the trigger list is displayed', async () => {
      await list.open();
      await expect(list.rows().first(), 'the trigger list rows').toBeVisible();
    });

    await steps.step('Select Export > Export All Data - the export runs', async () => {
      file = await list.export('all');
      expect(file.bytes.length, `the downloaded file ${describeExport(file)}`).toBeGreaterThan(0);
    });

    await steps.step('Check the downloaded file - it is an Excel (.xlsx) file that opens as a workbook', async () => {
      expect.soft(file?.filename ?? '', 'the file name').toMatch(EXCEL_FILE);
      expect.soft(file?.bytes.subarray(0, 2).toString() ?? '', 'an .xlsx is a zip package (starts "PK")').toBe('PK');
      expect(file?.sheet?.headers.length ?? 0, `the workbook opens with a header row - ${file ? describeExport(file) : 'no file'}`).toBeGreaterThan(0);
    });
  });

  test(`TC-${CASES.exportColumns.azureId}: should export the same columns the trigger list shows`, async ({ steps, page }) => {
    const list = new TriggerListView(page);
    let file: NcExport | null = null;

    await steps.critical('Navigate to the Notification Center Management module - the trigger list is displayed with columns Name, Module, Action, Recipient, Predefined and Active', async () => {
      await list.open();
      expect(await list.headerLabels(TRIGGER_COLUMN_KEYS), 'the list column headers').toEqual([...TRIGGER_COLUMNS]);
    });

    await steps.step('Select Export > Export All Data - the export completes', async () => {
      file = await list.export('all');
      expect(file.sheet, `the downloaded file ${describeExport(file)}`).not.toBeNull();
    });

    await steps.step('Open the exported Excel file and inspect the column headers - the file contains the columns Name, Module, Action, Recipient, Predefined and Active', async () => {
      expect(file?.sheet?.headers ?? [], 'the file column headers').toEqual([...TRIGGER_COLUMNS]);
    });
  });

  test(`TC-${CASES.exportEmpty.azureId}: should produce a header-only file without an error when no trigger matches the filters`, async ({ steps, page }) => {
    const list = new TriggerListView(page);
    let filtered: ListAnswer | null = null;
    let file: NcExport | null = null;

    await steps.critical('Navigate to the Notification Center Management module - the module loads and the trigger list is displayed', async () => {
      await list.open();
      await expect(list.rows().first(), 'the trigger list rows').toBeVisible();
    });

    await steps.step('Apply filters resulting in an empty list - zero triggers are shown', async () => {
      filtered = await list.filter(EMPTY_FILTER);
      expect.soft(filtered?.totalRows, `the filtered answer (request ${JSON.stringify(filtered?.request ?? {})})`).toBe(0);
      await expect.soft(list.rows(), 'no trigger rows').toHaveCount(0);
      await expect(list.emptyState(), 'the empty list message').toHaveText(EMPTY_LIST_TEXT);
    });

    await steps.step('Select Export > Selected Export - the export runs', async () => {
      file = await list.export('selected');
      expect(file.bytes.length, `the downloaded file ${describeExport(file)}`).toBeGreaterThan(0);
    });

    await steps.step('Open the resulting file - it has the headers only and no data rows, and no system error is shown', async () => {
      const toast = await list.toastText();
      expect.soft(toast, 'no error message after the export').not.toMatch(/error|fail|wrong/i);
      expect.soft(file?.sheet?.headers ?? [], `the file headers - ${file ? describeExport(file) : 'no file'}`).toEqual([...TRIGGER_COLUMNS]);
      expect(file?.sheet?.rows.length ?? -1, 'data rows in the file').toBe(0);
    });
  });
});
