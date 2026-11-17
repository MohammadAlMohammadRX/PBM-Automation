import { test, expect } from '../../../fixtures';
import type { TestSteps } from '../../../fixtures/testStatus.fixture';
import type { LookupItemsPage, LookupRegisterPage } from '../../../pages/lookup/LookupPages';
import type { LookupItem } from '../../../utils/lookup/lookupApi';
import { readLookupItems } from '../../../utils/lookup/lookupApi';
import { CASES, FORMATS_OFFERED, HOME_LIST, MESSAGES, SCOPE_LABELS, SINGLE_ITEM_BLOCK } from '../../../data/lookup/exportLookupItems.data';
import {
  codesOnScreen,
  downloadExcel,
  exportedCodes,
  findSingleItemList,
  formatPromptShown,
  formatsOffered,
  isXlsx,
  itemsExportMenu,
  missingColumns,
  requireOrBlock,
  rowMismatches,
  scopeChoices,
  searchItems,
  sepless,
  sortedCodes,
  waitForToast,
  type ExportedFile,
} from '../../../utils/lookup/writerCHelpers';

/** Step 1 of every case: the register of lists. */
async function openModule(steps: TestSteps, register: LookupRegisterPage): Promise<void> {
  await steps.critical('Navigate to the Lookups Management module - the list of lookups is displayed', async () => {
    await register.open();
    await register.expectRowsRendered();
  });
}

/** Opens the home list's items and waits for its rows. */
async function openHomeList(items: LookupItemsPage): Promise<void> {
  await items.open(HOME_LIST);
  await items.expectRowsRendered();
}

/**
 * User story 20857: Export Lookup Items - the scope menu, the Excel-only
 * format prompt, and the file's rows and columns against the screen and
 * GET Items. The message, failure and permission cases are in
 * export-messages-and-access.spec.ts. See the data file for the readings.
 */
test.describe('US 20857 - Export Lookup Items', () => {
  test.describe.configure({ timeout: 5 * 60_000 });

  test(`TC-${CASES.exportAll.azureId}: should download every value of the lookup as Excel when Export All Data is chosen`, async ({
    page,
    steps,
    lookupRegister,
    lookupItemsPage: items,
  }) => {
    const menu = itemsExportMenu(page);
    let file!: ExportedFile;
    let toasts: string[] = [];
    await openModule(steps, lookupRegister);

    await steps.critical('Open a lookup and select Export - a choice between "Selected Export" and "Export All Data" is shown', async () => {
      await openHomeList(items);
      await menu.open();
      expect(await scopeChoices(page), 'the export menu\'s choices').toEqual(SCOPE_LABELS);
    });

    await steps.critical('Choose "Export All Data" - the system prompts for the export file format', async () => {
      await menu.chooseScope('all');
      expect(await formatsOffered(page), 'the formats the prompt offers').toContain('excel');
    });

    await steps.critical('Choose Excel - the file download begins', async () => {
      file = await downloadExcel(page);
      toasts = await waitForToast(page, MESSAGES.exported);
      expect({ xlsx: isXlsx(file.bytes), name: file.filename }, `request ${JSON.stringify(file.request)}`).toEqual({ xlsx: true, name: expect.stringMatching(/\.xlsx$/i) });
    });

    await steps.step('Open the downloaded file - it holds every value of the lookup regardless of any search or filter, and "Lookups exported." is displayed', async () => {
      const all = await readLookupItems(page, HOME_LIST);
      expect(sortedCodes(exportedCodes(file.parsed)), `file headers: ${file.parsed.headers.join(', ')}`).toEqual(sortedCodes(all.map((i) => i.code)));
      expect(toasts, 'the toasts after the export').toContain(sepless(MESSAGES.exported));
    });
  });

  test(`TC-${CASES.selectedFiltered.azureId}: should export only the matching rows when Selected Export is chosen with a search applied`, async ({
    page,
    steps,
    lookupRegister,
    lookupItemsPage: items,
    suiteLookupItems,
  }) => {
    const suite = await suiteLookupItems.create(HOME_LIST);
    const menu = itemsExportMenu(page);
    let shown: string[] = [];
    let file!: ExportedFile;
    let toasts: string[] = [];
    await openModule(steps, lookupRegister);

    await steps.critical('Open a lookup and apply a search term on the items grid (the suite item code) - only matching rows are displayed', async () => {
      await openHomeList(items);
      shown = await searchItems(page, items, suite.code);
      expect(shown, `rows on screen after searching "${suite.code}"`).toEqual([suite.code]);
    });

    await steps.critical('Select Export - a choice of "Selected Export" or "Export All Data" is shown', async () => {
      await menu.open();
      expect(await scopeChoices(page), 'the export menu\'s choices').toEqual(SCOPE_LABELS);
    });

    await steps.critical('Choose "Selected Export" - the system prompts for the export file format', async () => {
      await menu.chooseScope('selected');
      expect(await formatsOffered(page), 'the formats the prompt offers').toContain('excel');
    });

    await steps.critical('Choose Excel - the file downloads', async () => {
      file = await downloadExcel(page);
      toasts = await waitForToast(page, MESSAGES.exported);
      expect(isXlsx(file.bytes), `${file.filename}; request ${JSON.stringify(file.request)}`).toBe(true);
    });

    await steps.step('Open the downloaded file - it contains only the rows that match the search, and "Lookups exported." is displayed', async () => {
      expect(exportedCodes(file.parsed), `file headers: ${file.parsed.headers.join(', ')}`).toEqual(shown);
      expect(toasts, 'the toasts after the export').toContain(sepless(MESSAGES.exported));
    });
  });

  test(`TC-${CASES.selectedPage.azureId}: should export the rows on the current page when Selected Export is chosen with no filter`, async ({
    page,
    steps,
    lookupRegister,
    lookupItemsPage: items,
  }) => {
    const menu = itemsExportMenu(page);
    let shown: string[] = [];
    let file!: ExportedFile;
    let toasts: string[] = [];
    await openModule(steps, lookupRegister);

    await steps.critical('Open a lookup with no filters or search applied - the full unfiltered grid with its current page is shown', async () => {
      await openHomeList(items);
      await expect(items.control('searchInput'), 'the search box').toHaveValue('');
      shown = await codesOnScreen(items);
      expect(shown.length, 'rows on the current page').toBeGreaterThan(0);
    });

    await steps.critical('Select Export then "Selected Export" - the system prompts for the file format', async () => {
      await menu.open();
      await menu.chooseScope('selected');
      expect(await formatsOffered(page), 'the formats the prompt offers').toContain('excel');
    });

    await steps.critical('Choose Excel - the file downloads', async () => {
      file = await downloadExcel(page);
      toasts = await waitForToast(page, MESSAGES.exported);
      expect(isXlsx(file.bytes), `${file.filename}; request ${JSON.stringify(file.request)}`).toBe(true);
    });

    await steps.step('Open the downloaded file - it contains exactly the rows visible on the current page, and "Lookups exported." is displayed', async () => {
      expect(sortedCodes(exportedCodes(file.parsed)), `file headers: ${file.parsed.headers.join(', ')}`).toEqual(sortedCodes(shown));
      expect(toasts, 'the toasts after the export').toContain(sepless(MESSAGES.exported));
    });
  });

  test(`TC-${CASES.allIgnoresFilter.azureId}: should export every record with Export All Data even when a search is active`, async ({
    page,
    steps,
    lookupRegister,
    lookupItemsPage: items,
    suiteLookupItems,
  }) => {
    const suite = await suiteLookupItems.create(HOME_LIST);
    const menu = itemsExportMenu(page);
    let shown: string[] = [];
    let file!: ExportedFile;
    let toasts: string[] = [];
    await openModule(steps, lookupRegister);

    await steps.critical('Open a lookup and apply a search that narrows the visible rows (the suite item code) - only matching rows are shown', async () => {
      await openHomeList(items);
      shown = await searchItems(page, items, suite.code);
      expect(shown, `rows on screen after searching "${suite.code}"`).toEqual([suite.code]);
    });

    await steps.critical('Select Export then "Export All Data" - the system prompts for the file format', async () => {
      await menu.open();
      await menu.chooseScope('all');
      expect(await formatsOffered(page), 'the formats the prompt offers').toContain('excel');
    });

    await steps.critical('Choose Excel - the file downloads', async () => {
      file = await downloadExcel(page);
      toasts = await waitForToast(page, MESSAGES.exported);
      expect(isXlsx(file.bytes), `${file.filename}; request ${JSON.stringify(file.request)}`).toBe(true);
    });

    await steps.step('Open the downloaded file - it contains all rows of the list, including those excluded by the search, and "Lookups exported." is displayed', async () => {
      const all = await readLookupItems(page, HOME_LIST);
      const codes = exportedCodes(file.parsed);
      expect({ codes: sortedCodes(codes), beyondTheSearch: codes.length > shown.length }, `file headers: ${file.parsed.headers.join(', ')}`)
        .toEqual({ codes: sortedCodes(all.map((i) => i.code)), beyondTheSearch: true });
      expect(toasts, 'the toasts after the export').toContain(sepless(MESSAGES.exported));
    });
  });

  test(`TC-${CASES.columns.azureId}: should carry code, both names, order, status and predefined for every exported item`, async ({
    page,
    steps,
    lookupRegister,
    lookupItemsPage: items,
  }) => {
    const menu = itemsExportMenu(page);
    let file!: ExportedFile;
    await openModule(steps, lookupRegister);

    await steps.critical('Open any lookup and export it (Export All Data, Excel) - the file downloads', async () => {
      await openHomeList(items);
      await menu.open();
      await menu.chooseScope('all');
      file = await downloadExcel(page);
      expect(isXlsx(file.bytes), `${file.filename}; request ${JSON.stringify(file.request)}`).toBe(true);
    });

    await steps.step('Open the downloaded file and inspect its columns - Code, Name (English), Name (Arabic), Display Order, Status and Predefined, with correct values in every row', async () => {
      const all = await readLookupItems(page, HOME_LIST);
      expect({ missingColumns: missingColumns(file.parsed), mismatches: rowMismatches(file.parsed, all) }, `file headers: ${file.parsed.headers.join(', ')}`)
        .toEqual({ missingColumns: [], mismatches: [] });
    });
  });

  test(`TC-${CASES.scopeBeforeFormat.azureId}: should ask for Selected Export or Export All Data before offering the Excel format`, async ({
    page,
    steps,
    lookupRegister,
    lookupItemsPage: items,
  }) => {
    const menu = itemsExportMenu(page);
    let formats: string[] = [];
    await openModule(steps, lookupRegister);

    await steps.critical('Open a lookup and select Export - the "Selected Export" / "Export All Data" choice is shown first, with no format option visible yet', async () => {
      await openHomeList(items);
      await menu.open();
      expect({ choices: await scopeChoices(page), formatPrompt: await formatPromptShown(page) }).toEqual({ choices: SCOPE_LABELS, formatPrompt: false });
    });

    await steps.critical('Choose either option (Export All Data) - only then is the Excel format option shown', async () => {
      await menu.chooseScope('all');
      formats = await formatsOffered(page);
      expect(formats, 'the formats the prompt offers').toContain('excel');
    });

    await steps.step('Confirm Excel - the download proceeds; the wizard went from scope to format and offered only Excel', async () => {
      const file = await downloadExcel(page);
      expect({ xlsx: isXlsx(file.bytes), formats }, file.filename).toEqual({ xlsx: true, formats: [...FORMATS_OFFERED] });
    });
  });

  test(`TC-${CASES.singleItem.azureId}: should export a lookup that holds a single value`, async ({
    page,
    steps,
    lookupRegister,
    lookupItemsPage: items,
  }) => {
    const menu = itemsExportMenu(page);
    let single!: { code: string; item: LookupItem };
    let file!: ExportedFile;
    let toasts: string[] = [];
    await openModule(steps, lookupRegister);

    await steps.critical('Open the lookup with exactly one value and choose Export All Data, Excel - the file downloads', async () => {
      single = requireOrBlock(steps, await findSingleItemList(page), SINGLE_ITEM_BLOCK);
      await items.open(single.code);
      await menu.open();
      await menu.chooseScope('all');
      file = await downloadExcel(page);
      toasts = await waitForToast(page, MESSAGES.exported);
      expect(isXlsx(file.bytes), `${file.filename} for "${single.code}"`).toBe(true);
    });

    await steps.step('Open the downloaded file - exactly one data row with all required columns, and "Lookups exported." is displayed', async () => {
      expect({ rows: file.parsed.rows.length, missingColumns: missingColumns(file.parsed), mismatches: rowMismatches(file.parsed, [single.item]) }, `file headers: ${file.parsed.headers.join(', ')}`)
        .toEqual({ rows: 1, missingColumns: [], mismatches: [] });
      expect(toasts, 'the toasts after the export').toContain(sepless(MESSAGES.exported));
    });
  });

  test(`TC-${CASES.excelOnly.azureId}: should offer Excel as the only export file format`, async ({
    page,
    steps,
    lookupRegister,
    lookupItemsPage: items,
  }) => {
    const menu = itemsExportMenu(page);
    await openModule(steps, lookupRegister);

    await steps.critical('Open a lookup, select Export and choose Export All Data - the system then prompts for the file format', async () => {
      await openHomeList(items);
      await menu.open();
      await menu.chooseScope('all');
      expect(await formatPromptShown(page), 'the format prompt').toBe(true);
    });

    await steps.step('Inspect the available file format options - only Excel is offered', async () => {
      expect(await formatsOffered(page), 'the formats the prompt offers').toEqual([...FORMATS_OFFERED]);
    });
  });
});
