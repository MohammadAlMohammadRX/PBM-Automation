import { test, expect, NO_DIFF, matchesFilters, resultDiff, uniqueArabicName, type WriterBItemsPage } from '../../../utils/lookup/writerBHelpers';
import type { TestSteps } from '../../../fixtures/testStatus.fixture';
import type { ItemFilters } from '../../../constants/lookup/writerBIds';
import { readLookupItems } from '../../../utils/lookup/lookupApi';
import { BADGE, HOME_LIST } from '../../../data/lookup/viewLookupItemList.data';
import { CASES, COMBINED_FILTERS, OPTION } from '../../../data/lookup/searchAndFilterLookupItems.data';

/**
 * User story 20856: Search and Filter Lookup Items - Advance Search by Code,
 * English / Arabic Name, Active / Inactive, Predefined Yes / No, and combined.
 * The drawer's inner ids are INFERRED (constants/lookup/writerBIds.ts). The
 * expected rows are GET Items filtered with the same criteria.
 */

async function openItems(steps: TestSteps, items: WriterBItemsPage): Promise<void> {
  await steps.critical('Navigate to the Lookups Management module - the Lookup Items screen loads', async () => {
    await items.openList(HOME_LIST);
    await expect(items.searchBox(), 'the Lookup Items search box').toBeVisible();
    await items.expectRowsRendered();
  });
}

test.describe('US 20856 - Search and Filter Lookup Items (Advance Search)', () => {
  test.describe.configure({ timeout: 4 * 60_000 });

  test(`TC-${CASES.byCode.azureId}: should show only the item with that code when Advance Search filters by an existing code`, async ({ page, steps, suiteLookupItems, itemsView }) => {
    const own = await suiteLookupItems.create(HOME_LIST);
    const filters: ItemFilters = { code: own.code };
    await openItems(steps, itemsView);

    await steps.step(`Open Advance Search and set the Code filter to an existing code (${own.code}) - the grid shows only the item(s) matching that code`, async () => {
      const expected = (await readLookupItems(page, HOME_LIST)).filter((i) => matchesFilters(i, filters));
      await itemsView.advancedSearch(filters);
      const shown = await itemsView.readResult(expected);
      expect({ diff: resultDiff(shown, expected), suiteItemShown: shown.some((r) => r.id === own.id) }, `Code = ${own.code}`).toEqual({ diff: NO_DIFF, suiteItemShown: true });
    });
  });

  test(`TC-${CASES.byStatus.azureId}: should show only Active items, then only Inactive items, when the status filter is changed`, async ({ page, steps, suiteLookupItems, itemsView }) => {
    const active = await suiteLookupItems.create(HOME_LIST);
    const inactive = await suiteLookupItems.create(HOME_LIST, { isActive: false });
    await openItems(steps, itemsView);

    await steps.step('Open Advance Search and set the status filter to Active - the grid shows only Active items', async () => {
      const filters: ItemFilters = { status: OPTION.active };
      const expected = (await readLookupItems(page, HOME_LIST)).filter((i) => matchesFilters(i, filters));
      await itemsView.advancedSearch(filters);
      const shown = await itemsView.readResult(expected);
      expect({
        diff: resultDiff(shown, expected),
        otherBadges: shown.filter((r) => r.status !== BADGE.active.en).map((r) => `${r.code}: ${r.status}`),
        suiteActiveShown: shown.some((r) => r.id === active.id),
      }, 'status = Active').toEqual({ diff: NO_DIFF, otherBadges: [], suiteActiveShown: true });
    });

    await steps.step('Change the status filter to Inactive - the grid shows only Inactive items', async () => {
      const filters: ItemFilters = { status: OPTION.inactive };
      const expected = (await readLookupItems(page, HOME_LIST)).filter((i) => matchesFilters(i, filters));
      await itemsView.advancedSearch(filters);
      const shown = await itemsView.readResult(expected);
      expect({
        diff: resultDiff(shown, expected),
        otherBadges: shown.filter((r) => r.status !== BADGE.inactive.en).map((r) => `${r.code}: ${r.status}`),
        suiteInactiveShown: shown.some((r) => r.id === inactive.id),
      }, 'status = Inactive').toEqual({ diff: NO_DIFF, otherBadges: [], suiteInactiveShown: true });
    });
  });

  test(`TC-${CASES.byNames.azureId}: should show only the matching items when Advance Search filters by English name, then by Arabic name`, async ({
    page,
    steps,
    suiteLookupItems,
    itemsView,
  }) => {
    const own = await suiteLookupItems.create(HOME_LIST, { arabicName: uniqueArabicName() });
    await openItems(steps, itemsView);

    await steps.step(`Open Advance Search and set the English Name filter to an existing name ("${own.englishName}") - the grid shows only items matching that English Name`, async () => {
      const filters: ItemFilters = { englishName: own.englishName };
      const expected = (await readLookupItems(page, HOME_LIST)).filter((i) => matchesFilters(i, filters));
      await itemsView.advancedSearch(filters);
      const shown = await itemsView.readResult(expected);
      expect({ diff: resultDiff(shown, expected), suiteItemShown: shown.some((r) => r.id === own.id) }, `English Name = ${own.englishName}`).toEqual({ diff: NO_DIFF, suiteItemShown: true });
    });

    await steps.step(`Clear the filter and set the Arabic Name filter to an existing Arabic value ("${own.arabicName}") - the grid shows only items matching that Arabic Name`, async () => {
      const filters: ItemFilters = { arabicName: own.arabicName };
      const expected = (await readLookupItems(page, HOME_LIST)).filter((i) => matchesFilters(i, filters));
      await itemsView.advancedSearch({ englishName: '', arabicName: own.arabicName });
      const shown = await itemsView.readResult(expected);
      expect({ diff: resultDiff(shown, expected), suiteItemShown: shown.some((r) => r.id === own.id) }, `Arabic Name = ${own.arabicName} (English Name cleared)`).toEqual({ diff: NO_DIFF, suiteItemShown: true });
    });
  });

  test(`TC-${CASES.byPredefined.azureId}: should show only predefined items, then only admin-added items, when the Predefined filter is Yes then No`, async ({
    page,
    steps,
    suiteLookupItems,
    itemsView,
  }) => {
    const own = await suiteLookupItems.create(HOME_LIST);
    await openItems(steps, itemsView);

    await steps.step('Open Advance Search and set the Predefined filter to Yes - the grid shows only system-provided (predefined) items', async () => {
      const filters: ItemFilters = { predefined: OPTION.yes };
      const expected = (await readLookupItems(page, HOME_LIST)).filter((i) => matchesFilters(i, filters));
      await itemsView.advancedSearch(filters);
      const shown = await itemsView.readResult(expected);
      expect({
        diff: resultDiff(shown, expected),
        otherBadges: shown.filter((r) => r.predefined !== BADGE.yes.en).map((r) => `${r.code}: ${r.predefined}`),
      }, 'Predefined = Yes').toEqual({ diff: NO_DIFF, otherBadges: [] });
    });

    await steps.step('Change the Predefined filter to No - the grid shows only admin-added (non-predefined) items', async () => {
      const filters: ItemFilters = { predefined: OPTION.no };
      const expected = (await readLookupItems(page, HOME_LIST)).filter((i) => matchesFilters(i, filters));
      await itemsView.advancedSearch(filters);
      const shown = await itemsView.readResult(expected);
      expect({
        diff: resultDiff(shown, expected),
        otherBadges: shown.filter((r) => r.predefined !== BADGE.no.en).map((r) => `${r.code}: ${r.predefined}`),
        suiteItemShown: shown.some((r) => r.id === own.id),
      }, 'Predefined = No').toEqual({ diff: NO_DIFF, otherBadges: [], suiteItemShown: true });
    });
  });

  test(`TC-${CASES.combined.azureId}: should show only items satisfying every filter when Active and Predefined No are combined`, async ({
    page,
    steps,
    suiteLookupItems,
    itemsView,
  }) => {
    const active = await suiteLookupItems.create(HOME_LIST);
    const inactive = await suiteLookupItems.create(HOME_LIST, { isActive: false });
    await openItems(steps, itemsView);

    await steps.step('Open Advance Search and set Active status to Active and Predefined to No together - the grid shows only items that are both Active and non-predefined', async () => {
      const expected = (await readLookupItems(page, HOME_LIST)).filter((i) => matchesFilters(i, COMBINED_FILTERS));
      await itemsView.advancedSearch(COMBINED_FILTERS);
      const shown = await itemsView.readResult(expected);
      expect({
        diff: resultDiff(shown, expected),
        suiteActiveShown: shown.some((r) => r.id === active.id),
        suiteInactiveShown: shown.some((r) => r.id === inactive.id),
      }, `filters ${JSON.stringify(COMBINED_FILTERS)}`).toEqual({ diff: NO_DIFF, suiteActiveShown: true, suiteInactiveShown: false });
    });
  });
});
