import { test, expect } from '../../../fixtures';
import { ncStamp } from '../../../utils/notification/notificationApi';
import type { ListAnswer } from '../../../pages/notification/NotificationCenterPage';
import { WriterADefinitions, definitionsPage, normalise, sheetNames, type ExportAttempt } from '../../../utils/notification/writerAHelpers';
import { CASES, ERROR_WORDS, EXPORT_HEADERS, EXPORT_LABELS, LIST_KEYS, NO_MATCH_PREFIX, SUITE_DEFINITION } from '../../../data/notification/sortAndExportAppNotifications.data';

/**
 * User story 20998: Sort and Export App Notifications - Selected Export, Export
 * All Data, the Excel format, the Export control, an empty selection and an
 * exploratory filter + sort + export run. Definitions are only read, plus suite
 * App Notifications made in the test (deleted at teardown).
 */
test.describe('US 20998 - Sort and Export App Notifications', () => {
  test.describe.configure({ timeout: 4 * 60_000 });

  test(`TC-${CASES.selectedExport.azureId}: should export only the notifications matching the current search with Selected Export`, async ({ page, steps, suiteDefinitions }) => {
    const list = new WriterADefinitions(page);
    const tag = ncStamp();
    const names: string[] = [];
    let shown: string[] = [];
    let file!: ExportAttempt;

    await steps.critical('Navigate to the Notification Center Management module - the App Notification list screen loads', async () => {
      names.push((await suiteDefinitions.create({ moduleId: SUITE_DEFINITION.moduleId, actionId: SUITE_DEFINITION.olderAction, name: suiteDefinitions.newName(tag) })).name);
      names.push((await suiteDefinitions.create({ moduleId: SUITE_DEFINITION.moduleId, actionId: SUITE_DEFINITION.newerAction, name: suiteDefinitions.newName(tag) })).name);
      const answer = await list.open();
      expect(answer?.status, 'GetDefinitions').toBe(200);
    });

    await steps.step('Apply a search so only part of the notifications are displayed - the list shows only matching notifications', async () => {
      await list.search(tag);
      shown = await list.column('name');
      expect(shown.sort(), `rows for the search "${tag}"`).toEqual([...names].sort());
    });

    await steps.step('Click Export and choose "Selected Export" - an Excel file download begins', async () => {
      file = await list.tryExport('selected');
      expect({ downloaded: file.downloaded, workbook: file.isWorkbook }, `the Selected Export (${file.filename || `no file; toast "${file.toast}"`})`).toEqual({ downloaded: true, workbook: true });
    });

    await steps.step('Open the exported file - it contains only the notifications matching the current search', async () => {
      expect(sheetNames(file.sheet).sort(), `rows of ${file.filename}`).toEqual([...shown].sort());
    });
  });

  test(`TC-${CASES.exportAll.azureId}: should export every notification regardless of the search with Export All Data`, async ({ page, steps, suiteDefinitions }) => {
    const list = new WriterADefinitions(page);
    const tag = ncStamp();
    let file!: ExportAttempt;
    let total = 0;

    await steps.critical('Navigate to the Notification Center Management module - the App Notification list screen loads', async () => {
      await suiteDefinitions.create({ moduleId: SUITE_DEFINITION.moduleId, actionId: SUITE_DEFINITION.olderAction, name: suiteDefinitions.newName(tag) });
      const answer = await list.open();
      expect(answer?.status, 'GetDefinitions').toBe(200);
    });

    await steps.step('Apply a search so only part of the notifications are displayed - the list shows a filtered subset', async () => {
      const answer = await list.search(tag);
      total = (await definitionsPage(page, {})).totalRows;
      expect({ subset: answer?.totalRows, below: (answer?.totalRows ?? 0) < total }, `GetDefinitions for "${tag}" against ${total} in all`).toEqual({ subset: 1, below: true });
    });

    await steps.step('Click Export and choose "Export All Data" - an Excel file download begins', async () => {
      file = await list.tryExport('all');
      expect({ downloaded: file.downloaded, workbook: file.isWorkbook }, `Export All Data (${file.filename || `no file; toast "${file.toast}"`})`).toEqual({ downloaded: true, workbook: true });
    });

    await steps.step('Open the exported file - it contains every notification regardless of the applied search', async () => {
      const rows = sheetNames(file.sheet);
      expect({ rows: rows.length, outside: rows.some((n) => !n.includes(tag)) }, `rows of ${file.filename}`).toEqual({ rows: total, outside: true });
    });
  });

  test(`TC-${CASES.excelFormat.azureId}: should produce a valid Excel file from both export options`, async ({ page, steps }) => {
    const list = new WriterADefinitions(page);
    let selected!: ExportAttempt;

    await steps.critical('Navigate to the Notification Center Management module - the App Notification list screen loads', async () => {
      const answer = await list.open();
      expect(answer?.totalRows ?? 0, 'notifications listed').toBeGreaterThan(0);
    });

    await steps.step('Click Export and choose "Selected Export" - a file downloads', async () => {
      selected = await list.tryExport('selected');
      expect(selected.downloaded, `the Selected Export (toast "${selected.toast}")`).toBe(true);
    });

    await steps.step('Verify the downloaded file\'s format - the file is a valid Excel (.xlsx) file', async () => {
      expect({ workbook: selected.isWorkbook, headers: selected.sheet?.headers }, `the Selected Export ${selected.filename}`).toEqual({ workbook: true, headers: EXPORT_HEADERS });
    });

    await steps.step('Repeat using "Export All Data" - the file downloads as a valid Excel (.xlsx) file', async () => {
      const all = await list.tryExport('all');
      expect({ downloaded: all.downloaded, workbook: all.isWorkbook, headers: all.sheet?.headers }, `Export All Data ${all.filename || `(toast "${all.toast}")`}`).toEqual({ downloaded: true, workbook: true, headers: EXPORT_HEADERS });
    });
  });

  test(`TC-${CASES.exportControl.azureId}: should offer the Export action with both options directly on the App Notification list`, async ({ page, steps }) => {
    const list = new WriterADefinitions(page);

    await steps.critical('Navigate to the Notification Center Management module - the App Notification list screen loads', async () => {
      const answer = await list.open();
      expect(answer?.status, 'GetDefinitions').toBe(200);
    });

    await steps.step('Locate the Export action on the list screen - the Export control is visible and clickable', async () => {
      await expect(list.exportControl(), 'Export').toBeVisible();
      await expect(list.exportControl(), 'Export').toBeEnabled();
    });

    await steps.step('Click Export - Selected Export and Export All Data options are presented', async () => {
      expect(await list.openExportMenu(), 'the Export menu').toEqual(EXPORT_LABELS);
    });
  });

  test(`TC-${CASES.emptySelectedExport.azureId}: should export headers only or say there is nothing to export, without an error, when nothing matches`, async ({ page, steps }) => {
    const list = new WriterADefinitions(page);
    let answer: ListAnswer | null = null;

    await steps.critical('Navigate to the Notification Center Management module - the App Notification list screen loads', async () => {
      const first = await list.open();
      expect(first?.status, 'GetDefinitions').toBe(200);
    });

    await steps.step('Apply a search that returns no matching notifications - the list shows no records', async () => {
      answer = await list.search(`${NO_MATCH_PREFIX}${ncStamp()}`);
      expect({ total: answer?.totalRows, rows: await list.rowIds() }, 'the list').toEqual({ total: 0, rows: [] });
    });

    await steps.step('Click Export and choose "Selected Export" - the system exports headers only or informs that there is nothing to export, without error', async () => {
      const file = await list.tryExport('selected', 15_000);
      const headersOnly = file.downloaded && file.isWorkbook && sheetNames(file.sheet).length === 0 && JSON.stringify(file.sheet?.headers) === JSON.stringify(EXPORT_HEADERS);
      const informed = !file.downloaded && file.toast !== '';
      expect({ answered: headersOnly || informed, errorShown: ERROR_WORDS.test(file.toast) }, `the empty Selected Export (file ${file.filename || 'none'}, rows ${sheetNames(file.sheet).length}, headers ${JSON.stringify(file.sheet?.headers)}, toast "${file.toast}")`)
        .toEqual({ answered: true, errorShown: false });
    });
  });

  test(`TC-${CASES.exploratory.azureId}: should keep filter, sort and both exports consistent when they are combined`, async ({ page, steps, suiteDefinitions }) => {
    const d = CASES.exploratory;
    const list = new WriterADefinitions(page);

    await steps.critical('Navigate to the Notification Center Management module - the App Notification list screen loads', async () => {
      await suiteDefinitions.create({ moduleId: SUITE_DEFINITION.moduleId, actionId: SUITE_DEFINITION.olderAction, name: suiteDefinitions.newName('explore b') });
      await suiteDefinitions.create({ moduleId: SUITE_DEFINITION.moduleId, actionId: SUITE_DEFINITION.newerAction, name: suiteDefinitions.newName('explore a') });
      const answer = await list.open();
      expect(answer?.status, 'GetDefinitions').toBe(200);
    });

    await steps.step('Apply a filter, change the Sort By option, then export with Selected Export and Export All Data in turn - each export has its scope and the Excel content matches the displayed order and data', async () => {
      const filtered = await list.filter({ ...d.filter });
      const sorted = await list.sortBy(d.sortKey);
      const screen = await list.column('name');
      const same = await definitionsPage(page, { ...(sorted?.request ?? {}) });
      const selected = await list.tryExport('selected');
      const all = await list.tryExport('all');
      const total = (await definitionsPage(page, {})).totalRows;
      // Names compared with whitespace collapsed and trimmed (NAME_COMPARISON in the data file).
      const selectedNames = sheetNames(selected.sheet).map(normalise);
      expect.soft({ filterStatus: filtered?.status, sortStatus: sorted?.status, filterKept: Object.keys(filtered?.request ?? {}).filter((k) => !LIST_KEYS.includes(k)).every((k) => k in (sorted?.request ?? {})) }, 'the filter and sort answers')
        .toEqual({ filterStatus: 200, sortStatus: 200, filterKept: true });
      expect.soft(selectedNames, `the Selected Export ${selected.filename} against GetDefinitions ${JSON.stringify(sorted?.request)}`).toEqual(same.items.map((i) => normalise(i.name)));
      expect.soft(selectedNames.slice(0, screen.length), 'the Selected Export starts with the rows on screen, in their order').toEqual(screen.map(normalise));
      expect(sheetNames(all.sheet).length, `Export All Data ${all.filename} against ${total} definitions`).toBe(total);
    });
  });
});
