import { test, expect } from '../../../fixtures';
import type { Page } from '@playwright/test';
import type { TestSteps } from '../../../fixtures/testStatus.fixture';
import type { LookupRegisterPage } from '../../../pages/lookup/LookupPages';
import { AppRoutes } from '../../../constants/AppRoutes';
import {
  BLOCKED,
  CASES,
  DEFAULT_SORT,
  DEFAULT_SORT_LABEL,
  HOME_LIST,
  ONLY_ROW_ACTION,
  PREDEFINED,
  PREDEFINED_LIST_COUNT,
  REGISTER_COLUMNS,
  REGISTER_HEADERS,
} from '../../../data/lookup/searchAndFilterLookups.data';
import { lookupByCode, readAllLookups, readLookupItems } from '../../../utils/lookup/lookupApi';
import {
  addControlOffered,
  advancedFieldIds,
  advancedLabels,
  closeAdvanced,
  dataHeadersOnScreen,
  distinctValues,
  firstDateOutOfOrder,
  headersOnScreen,
  lastCrumb,
  openAdvanced,
  openCapturing,
  readAllPages,
  replayRegister,
  requireOrBlock,
  rowActionsOnScreen,
  rowIdsOnScreen,
  searchRegister,
  sortLabel,
  sortOptions,
  viewList,
  type RegisterCall,
} from '../../../utils/lookup/writerAHelpers';

/**
 * User story 20853: Search and Filter Lookups - the register itself: default
 * order, every list with its names, unique codes, the 57 lists without Add /
 * Edit / Delete, no Predefined anywhere, and View. Read-only. See the data file.
 */

async function openModule(steps: TestSteps, page: Page, register: LookupRegisterPage): Promise<RegisterCall> {
  let call: RegisterCall = { status: -1, request: {}, answer: { totalRows: -1, items: [] }, requeried: false };
  await steps.critical('Navigate to the Lookups Management module - the module loads', async () => {
    call = await openCapturing(page, register);
    expect(call.status, `GetLookups answered ${call.status}`).toBe(200);
  });
  return call;
}

test.describe('US 20853 - Search and Filter Lookups (register)', () => {
  test.describe.configure({ timeout: 5 * 60_000 });

  test(`TC-${CASES.newestFirst.azureId}: should list the newest lookups first when the register opens without a sort`, async ({ page, steps, lookupRegister: register }) => {
    const call = await openModule(steps, page, register);

    await steps.critical('Precondition: multiple lookups exist with different creation dates', async () => {
      const all = await readAllLookups(page);
      const distinct = distinctValues(all.items.map((i) => i.createdOn));
      requireOrBlock(steps, distinct > 1, BLOCKED.sameCreationDates);
      expect(distinct, `different Created On values among ${all.totalRows} lists`).toBeGreaterThan(1);
    });

    await steps.step('Open System Settings > Lookups without applying any sort - the Lookup Register screen opens showing the list in its default order', async () => {
      expect({ sortBy: call.request.sortBy, label: await sortLabel(page) }).toEqual({ sortBy: DEFAULT_SORT, label: DEFAULT_SORT_LABEL });
    });

    await steps.step('Compare the order of rows against known creation dates - the most recently created lookup appears first, followed by older ones in descending order', async () => {
      const all = await readAllLookups(page);
      const newest = Math.max(...all.items.map((i) => Date.parse(i.createdOn)));
      const whole = await replayRegister(page, call.request);
      const shown = await rowIdsOnScreen(page);
      expect({
        screenIsAnswer: shown.join() === call.answer.items.map((i) => i.id).join(),
        firstIsNewest: Date.parse(call.answer.items[0]?.createdOn ?? '') === newest,
        pageOutOfOrderAt: firstDateOutOfOrder(call.answer.items.map((i) => i.createdOn), 'desc'),
        registerOutOfOrderAt: firstDateOutOfOrder(whole.items.map((i) => i.createdOn), 'desc'),
      }, `Created On on screen: ${call.answer.items.map((i) => `${i.code} ${i.createdOn}`).join(' | ')}`)
        .toEqual({ screenIsAnswer: true, firstIsNewest: true, pageOutOfOrderAt: -1, registerOutOfOrderAt: -1 });
    });
  });

  test(`TC-${CASES.everyList.azureId}: should show every maintained lookup list with its code, English name and Arabic name`, async ({ page, steps, lookupRegister: register }) => {
    await openModule(steps, page, register);

    await steps.step('Go to System Settings > Lookups - the Lookup Register screen opens', async () => {
      expect(await dataHeadersOnScreen(page)).toEqual([...REGISTER_HEADERS]);
    });

    await steps.step('Review the list of lookups displayed - each row shows the Code, English Name and Arabic Name of a maintained list, and every list is visible', async () => {
      const api = await readAllLookups(page);
      const { rows, pages } = await readAllPages(page);
      const byCode = new Map(rows.map((r) => [r.code, r]));
      expect({
        rows: rows.length,
        missing: api.items.filter((i) => !byCode.has(i.code)).map((i) => i.code),
        namesDiffer: api.items.filter((i) => byCode.has(i.code) && (byCode.get(i.code)?.englishName !== i.englishName.trim() || byCode.get(i.code)?.arabicName !== i.arabicName.trim())).map((i) => i.code),
        blankCells: rows.filter((r) => !r.code || !r.englishName || !r.arabicName).map((r) => r.id),
      }, `${rows.length} rows over ${pages} pages; GetLookups totalRows ${api.totalRows}`).toEqual({ rows: api.totalRows, missing: [], namesDiffer: [], blankCells: [] });
    });
  });

  test(`TC-${CASES.noPredefined.azureId}: should offer Predefined nowhere - not as a column, a filter or a sort option`, async ({ page, steps, lookupRegister: register }) => {
    await openModule(steps, page, register);

    await steps.step('Open System Settings > Lookups - the Lookup Register screen opens showing only Code, English Name and Arabic Name columns', async () => {
      const headers = await headersOnScreen(page);
      expect({ keys: headers.keys, predefinedHeaders: headers.texts.filter((t) => PREDEFINED.test(t)) }, headers.texts.join(' | '))
        .toEqual({ keys: [...REGISTER_COLUMNS], predefinedHeaders: [] });
    });

    await steps.step('Open Advance Search and review the available filter fields - Predefined is not offered as a filter option', async () => {
      const opened = await openAdvanced(page);
      const labels = await advancedLabels(page);
      const ids = await advancedFieldIds(page);
      await closeAdvanced(page);
      expect({ opened, fieldsRead: labels.length > 0, predefinedLabels: labels.filter((l) => PREDEFINED.test(l)), predefinedIds: ids.filter((i) => PREDEFINED.test(i)) }, `fields: ${labels.join(' | ')}`)
        .toEqual({ opened: true, fieldsRead: true, predefinedLabels: [], predefinedIds: [] });
    });

    await steps.step('Attempt to sort the list by any available column header - no sort option is available for Predefined, and no Predefined column exists to sort by', async () => {
      const options = await sortOptions(page);
      const headers = await headersOnScreen(page);
      expect({
        optionsRead: options.length > 0,
        predefinedOptions: options.filter((o) => PREDEFINED.test(o.key) || PREDEFINED.test(o.label)).map((o) => o.label),
        predefinedColumns: headers.keys.filter((k) => PREDEFINED.test(k)),
      }, `Sort By: ${options.map((o) => `${o.key}=${o.label}`).join(' | ')}`).toEqual({ optionsRead: true, predefinedOptions: [], predefinedColumns: [] });
    });
  });

  test(`TC-${CASES.uniqueCodes.azureId}: should hold a unique code for every lookup list in the register`, async ({ page, steps, lookupRegister: register }) => {
    const call = await openModule(steps, page, register);

    await steps.step('Open System Settings > Lookups - the Lookup Register screen opens showing all lookup lists', async () => {
      const api = await readAllLookups(page);
      expect({ totalRows: call.answer.totalRows, rowsShown: (await rowIdsOnScreen(page)).length > 0 }).toEqual({ totalRows: api.totalRows, rowsShown: true });
    });

    await steps.step('Review the Code column across every row - no two rows share the same Code value', async () => {
      const { rows } = await readAllPages(page);
      const codes = rows.map((r) => r.code);
      const lower = codes.map((c) => c.toLowerCase());
      expect({
        rows: rows.length,
        repeated: codes.filter((c, i) => codes.indexOf(c) !== i),
        repeatedIgnoringCase: codes.filter((_, i) => lower.indexOf(lower[i]) !== i),
      }).toEqual({ rows: call.answer.totalRows, repeated: [], repeatedIgnoringCase: [] });
    });
  });

  test(`TC-${CASES.viewList.azureId}: should open the values of the selected lookup list when View is selected`, async ({ page, steps, lookupRegister: register, lookupItemsPage }) => {
    const call = await openModule(steps, page, register);

    await steps.step('Open System Settings > Lookups - the Lookup Register screen opens showing all lookup lists', async () => {
      const api = await readAllLookups(page);
      expect({ totalRows: call.answer.totalRows, rowsShown: (await rowIdsOnScreen(page)).length > 0 }).toEqual({ totalRows: api.totalRows, rowsShown: true });
    });

    await steps.step(`Select View on a chosen lookup row ("${HOME_LIST}") - the screen displays the selected list's values`, async () => {
      const list = await lookupByCode(page, HOME_LIST);
      await searchRegister(page, HOME_LIST);
      const opened = await viewList(page, register, list.id, HOME_LIST);
      await lookupItemsPage.waitForRowsRendered();
      const shown = await lookupItemsPage.readColumn('code');
      const stored = (await readLookupItems(page, HOME_LIST)).map((i) => i.code);
      expect({
        itemsStatus: opened.status,
        path: new URL(page.url()).pathname,
        crumb: await lastCrumb(page),
        rowsShown: shown.length > 0,
        notInList: shown.filter((c) => !stored.includes(c)),
      }, `the list's items: ${stored.join(', ')}; on screen: ${shown.join(', ')}`).toEqual({
        itemsStatus: 200,
        path: `${AppRoutes.lookupManagement}/${HOME_LIST}`,
        crumb: list.englishName.trim(),
        rowsShown: true,
        notInList: [],
      });
    });
  });

  test(`TC-${CASES.fiftySeven.azureId}: should show all 57 predefined lists with no option to add, edit or delete a list`, async ({ page, steps, lookupRegister: register }) => {
    const call = await openModule(steps, page, register);
    let all: { rows: { code: string }[]; pages: number; actions: string[] } = { rows: [], pages: 0, actions: [] };

    await steps.step('Open System Settings > Lookups - the Lookup Register screen opens', async () => {
      expect((await rowIdsOnScreen(page)).length, 'rows on the first page').toBeGreaterThan(0);
    });

    await steps.step('Count the total number of lookup lists shown (across all pages, if paginated) - the total equals 57 predefined lists', async () => {
      all = await readAllPages(page);
      const api = await readAllLookups(page);
      expect({ counted: all.rows.length, screenAnswer: call.answer.totalRows, api: api.totalRows }, `${all.pages} pages`)
        .toEqual({ counted: PREDEFINED_LIST_COUNT, screenAnswer: PREDEFINED_LIST_COUNT, api: PREDEFINED_LIST_COUNT });
    });

    await steps.step('Review the screen for Add, Edit, or Delete controls on any lookup row - no such controls are present anywhere on the screen', async () => {
      const actions = all.actions.length > 0 ? all.actions : await rowActionsOnScreen(page);
      expect({ addControl: await addControlOffered(page), rowActions: actions }).toEqual({ addControl: false, rowActions: [ONLY_ROW_ACTION] });
    });
  });
});
