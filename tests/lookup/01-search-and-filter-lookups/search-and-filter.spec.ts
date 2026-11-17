import { test, expect } from '../../../fixtures';
import type { Page } from '@playwright/test';
import type { TestSteps } from '../../../fixtures/testStatus.fixture';
import type { LookupRegisterPage } from '../../../pages/lookup/LookupPages';
import {
  CASES,
  CLEAR_SETUP,
  EMPTY_STATE,
  EXPLORATORY_TERMS,
  GENDER_CODE,
  NO_MATCH_TERM,
  TWO_FILTERS,
} from '../../../data/lookup/searchAndFilterLookups.data';
import { lookupByCode, readAllLookups, type LookupRow } from '../../../utils/lookup/lookupApi';
import {
  FILTER_OK,
  advancedSearch,
  chipTexts,
  clearAll,
  containsText,
  emptyStateText,
  filterOutcome,
  inconsistencies,
  keptAfterClear,
  openCapturing,
  removableChipKeys,
  removeChip,
  rowIdsOnScreen,
  rowsNotMatching,
  rowsNotMatchingAny,
  searchBoxValue,
  searchRegister,
  type RegisterCall,
} from '../../../utils/lookup/writerAHelpers';

/**
 * User story 20853: Search and Filter Lookups - the keyword search, Advance
 * Search (Code / English Name / Arabic Name), the chips, Clear, the empty state
 * and the scripted exploratory sequence. The cases' "GENDER" example is the
 * register's own `gender` list, its names read from GetLookups. Read-only.
 */

async function openModule(steps: TestSteps, page: Page, register: LookupRegisterPage): Promise<RegisterCall> {
  let call: RegisterCall = { status: -1, request: {}, answer: { totalRows: -1, items: [] }, requeried: false };
  await steps.critical('Navigate to the Lookups Management module - the module loads', async () => {
    call = await openCapturing(page, register);
    expect(call.status, `GetLookups answered ${call.status}`).toBe(200);
  });
  return call;
}

async function registerOpens(steps: TestSteps, page: Page, call: RegisterCall, name: string): Promise<void> {
  await steps.step(name, async () => {
    const api = await readAllLookups(page);
    expect({ totalRows: call.answer.totalRows, rowsShown: (await rowIdsOnScreen(page)).length > 0 }).toEqual({ totalRows: api.totalRows, rowsShown: true });
  });
}

/** 21106: one keyword search (code / English name / Arabic name) -> rows matching it, the gender list among them. */
async function searchStep(steps: TestSteps, page: Page, name: string, term: () => string): Promise<void> {
  await steps.step(name, async () => {
    const call = await searchRegister(page, term());
    const shown = await rowIdsOnScreen(page);
    expect({
      status: call.status,
      notMatching: rowsNotMatchingAny(call.answer.items, term()),
      listed: call.answer.items.some((i) => i.code === GENDER_CODE),
      screenIsAnswer: shown.join() === call.answer.items.map((i) => i.id).join(),
    }, `"${term()}" -> ${call.answer.items.map((i) => i.code).join(', ')}`).toEqual({ status: 200, notMatching: [], listed: true, screenIsAnswer: true });
  });
}

test.describe('US 20853 - Search and Filter Lookups (search and filters)', () => {
  test.describe.configure({ timeout: 5 * 60_000 });

  test(`TC-${CASES.advancedSearch.azureId}: should narrow the lookup list with Advance Search on each field alone and in combination`, async ({ page, steps, lookupRegister: register }) => {
    const call = await openModule(steps, page, register);
    let gender!: LookupRow;

    await steps.critical(`Open System Settings > Lookups - the Lookup Register screen opens (the "${GENDER_CODE}" list is read for its names)`, async () => {
      gender = await lookupByCode(page, GENDER_CODE);
      expect({ rowsShown: (await rowIdsOnScreen(page)).length > 0, names: !!gender.englishName && !!gender.arabicName }).toEqual({ rowsShown: true, names: true });
    });

    await steps.step('Open Advance Search and filter by Code only - the list shows only rows matching the entered code', async () => {
      const values = { code: GENDER_CODE };
      const r = await advancedSearch(page, values);
      expect({ ...(await filterOutcome(page, r, values, GENDER_CODE)), narrowed: r.answer.totalRows < call.answer.totalRows }, JSON.stringify(r.request))
        .toEqual({ ...FILTER_OK, narrowed: true });
    });

    await steps.step('Reset and filter by English Name only - the list shows only rows matching the entered English name', async () => {
      const values = { englishName: gender.englishName };
      const r = await advancedSearch(page, values);
      expect({ ...(await filterOutcome(page, r, values, GENDER_CODE)), narrowed: r.answer.totalRows < call.answer.totalRows }, JSON.stringify(r.request))
        .toEqual({ ...FILTER_OK, narrowed: true });
    });

    await steps.step('Reset and filter by Arabic Name only - the list shows only rows matching the entered Arabic name', async () => {
      const values = { arabicName: gender.arabicName };
      const r = await advancedSearch(page, values);
      expect({ ...(await filterOutcome(page, r, values, GENDER_CODE)), narrowed: r.answer.totalRows < call.answer.totalRows }, JSON.stringify(r.request))
        .toEqual({ ...FILTER_OK, narrowed: true });
    });

    await steps.step('Combine Code and English Name in the same filter - the list shows only rows matching both conditions', async () => {
      const values = { code: GENDER_CODE, englishName: gender.englishName };
      const r = await advancedSearch(page, values);
      expect(await filterOutcome(page, r, values, GENDER_CODE), JSON.stringify(r.request)).toEqual(FILTER_OK);
    });
  });

  test(`TC-${CASES.quickSearch.azureId}: should find a lookup by searching its code, English name or Arabic name`, async ({ page, steps, lookupRegister: register }) => {
    const call = await openModule(steps, page, register);
    let gender!: LookupRow;

    await steps.critical('Open System Settings > Lookups - the Lookup Register screen opens showing all lists', async () => {
      gender = await lookupByCode(page, GENDER_CODE);
      const api = await readAllLookups(page);
      expect({ totalRows: call.answer.totalRows, names: !!gender.englishName && !!gender.arabicName }).toEqual({ totalRows: api.totalRows, names: true });
    });

    await searchStep(steps, page, `Enter the lookup's Code ("${GENDER_CODE}") into Search - the list narrows to rows matching the entered code`, () => gender.code);
    await searchStep(steps, page, "Clear Search and enter the lookup's English Name - the list narrows to rows matching the English name", () => gender.englishName);
    await searchStep(steps, page, "Clear Search and enter the lookup's Arabic Name - the list narrows to rows matching the Arabic name", () => gender.arabicName);
  });

  test(`TC-${CASES.removeOneChip.azureId}: should lift only the removed filter when one of two filter chips is removed`, async ({ page, steps, lookupRegister: register }) => {
    await openModule(steps, page, register);
    let combined = 0;

    await steps.critical(`Open System Settings > Lookups with two filters applied (Code "${TWO_FILTERS.code}", English Name "${TWO_FILTERS.englishName}") - the list shows two filter chips and the narrowed results`, async () => {
      const r = await advancedSearch(page, TWO_FILTERS);
      combined = r.answer.totalRows;
      const chips = await chipTexts(page);
      expect({ ...(await filterOutcome(page, r, TWO_FILTERS)), chips: chips.length }, `chips: ${chips.join(' | ')}`).toEqual({ ...FILTER_OK, chips: 2 });
    });

    await steps.step('Select the remove icon on the Code filter chip - that chip disappears and the list updates to reflect only the remaining English Name filter', async () => {
      const r = await removeChip(page, 'code');
      const chips = await chipTexts(page);
      expect({
        removed: r.removed !== '',
        status: r.status,
        chips: chips.length,
        englishChipKept: chips.some((c) => containsText(c, TWO_FILTERS.englishName)),
        breaksEnglishName: rowsNotMatching(r.answer.items, 'englishName', TWO_FILTERS.englishName),
        codeFilterLifted: r.answer.items.some((i) => !containsText(i.code, TWO_FILTERS.code)),
        widened: r.answer.totalRows > combined,
      }, `chips offered [${r.offered.join(', ')}]; now [${chips.join(' | ')}]; ${combined} -> ${r.answer.totalRows} rows`)
        .toEqual({ removed: true, status: 200, chips: 1, englishChipKept: true, breaksEnglishName: [], codeFilterLifted: true, widened: true });
    });
  });

  test(`TC-${CASES.clearAll.azureId}: should remove every filter at once and restore the full lookup list when Clear is selected`, async ({ page, steps, lookupRegister: register }) => {
    const call = await openModule(steps, page, register);

    await steps.critical(`Open System Settings > Lookups with filters applied (search "${CLEAR_SETUP.search}", Code "${CLEAR_SETUP.code}") - the list shows the filter chips and narrowed results`, async () => {
      await searchRegister(page, CLEAR_SETUP.search);
      const r = await advancedSearch(page, { code: CLEAR_SETUP.code });
      const chips = await chipTexts(page);
      expect({
        status: r.status,
        chipsShown: chips.length > 0,
        narrowed: r.answer.totalRows < call.answer.totalRows,
        breaksSearch: rowsNotMatchingAny(r.answer.items, CLEAR_SETUP.search),
        breaksCode: rowsNotMatching(r.answer.items, 'code', CLEAR_SETUP.code),
      }, `chips: ${chips.join(' | ')}`).toEqual({ status: 200, chipsShown: true, narrowed: true, breaksSearch: [], breaksCode: [] });
    });

    await steps.step('Select Clear - all filter chips disappear and the list shows every maintained lookup again', async () => {
      const r = await clearAll(page);
      expect({ offered: r.offered, status: r.status, chips: await chipTexts(page), searchBox: await searchBoxValue(page), totalRows: r.answer.totalRows })
        .toEqual({ offered: true, status: 200, chips: [], searchBox: '', totalRows: call.answer.totalRows });
    });
  });

  test(`TC-${CASES.chipShown.azureId}: should show an applied Advance Search filter as a removable chip above the lookup list`, async ({ page, steps, lookupRegister: register }) => {
    const call = await openModule(steps, page, register);
    let gender!: LookupRow;

    await steps.critical(`Open System Settings > Lookups - the Lookup Register screen opens (the "${GENDER_CODE}" list is read for its English name)`, async () => {
      gender = await lookupByCode(page, GENDER_CODE);
      expect({ rowsShown: (await rowIdsOnScreen(page)).length > 0, englishName: !!gender.englishName }).toEqual({ rowsShown: true, englishName: true });
    });

    await steps.step('Apply a filter using Advance Search on English Name - a removable chip labeled with the filter appears above the list, and the list narrows accordingly', async () => {
      const values = { englishName: gender.englishName };
      const r = await advancedSearch(page, values);
      const chips = await chipTexts(page);
      const removable = await removableChipKeys(page);
      expect({
        ...(await filterOutcome(page, r, values, GENDER_CODE)),
        chipForFilter: chips.some((c) => containsText(c, gender.englishName)),
        removable: removable.length,
        narrowed: r.answer.totalRows < call.answer.totalRows,
      }, `chips [${chips.join(' | ')}], removable [${removable.join(', ')}]`).toEqual({ ...FILTER_OK, chipForFilter: true, removable: 1, narrowed: true });
    });
  });

  test(`TC-${CASES.noResults.azureId}: should show "No lookups found." when the search matches nothing`, async ({ page, steps, lookupRegister: register }) => {
    const call = await openModule(steps, page, register);
    await registerOpens(steps, page, call, 'Open System Settings > Lookups - the Lookup Register screen opens showing all lookup lists');

    await steps.step(`Enter a search term that matches no Code, English Name or Arabic Name ("${NO_MATCH_TERM}") - the list area shows "${EMPTY_STATE}" and no rows are displayed`, async () => {
      const r = await searchRegister(page, NO_MATCH_TERM);
      expect({ status: r.status, totalRows: r.answer.totalRows, rows: (await rowIdsOnScreen(page)).length, emptyState: await emptyStateText(page) })
        .toEqual({ status: 200, totalRows: 0, rows: 0, emptyState: EMPTY_STATE });
    });
  });

  test(`TC-${CASES.exploratory.azureId}: should keep the rows, chips and counts consistent while search and Advance Search filters are combined, removed and cleared`, async ({ page, steps, lookupRegister: register }) => {
    const call = await openModule(steps, page, register);
    await registerOpens(steps, page, call, 'Open System Settings > Lookups - the Lookup Register screen opens');
    const t = EXPLORATORY_TERMS;

    await steps.step('Freely combine the Search field with various Advance Search filters, remove and reapply them in different orders, and toggle Clear mid-session - the list, chips and row counts stay consistent with the filters in effect at each step', async () => {
      // After Clear the state in effect is what the screen keeps (the search box text stays - smoke 2026-11-09);
      // an action that sends no request is compared with the last answer the screen received.
      const whole = call.answer.totalRows;
      const found: string[] = [];
      found.push(...(await inconsistencies(page, `search "${t.search}"`, await searchRegister(page, t.search), { search: t.search }, whole)));
      found.push(...(await inconsistencies(page, `+ Code "${t.code}"`, await advancedSearch(page, { code: t.code }), { search: t.search, code: t.code }, whole)));
      found.push(...(await inconsistencies(page, 'search chip removed', await removeChip(page, 'search'), { code: t.code }, whole)));
      found.push(...(await inconsistencies(page, `+ English Name "${t.englishName}"`, await advancedSearch(page, { code: t.code, englishName: t.englishName }), { code: t.code, englishName: t.englishName }, whole)));
      found.push(...(await inconsistencies(page, 'Clear', await clearAll(page), await keptAfterClear(page), whole)));
      found.push(...(await inconsistencies(page, `search "${t.search}" again`, await searchRegister(page, t.search), { search: t.search }, whole)));
      found.push(...(await inconsistencies(page, `+ English Name "${t.englishName}" again`, await advancedSearch(page, { englishName: t.englishName }), { search: t.search, englishName: t.englishName }, whole)));
      found.push(...(await inconsistencies(page, 'Clear again', await clearAll(page), await keptAfterClear(page), whole)));
      expect(found).toEqual([]);
    });
  });
});
