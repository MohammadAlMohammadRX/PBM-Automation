import { test, expect, NO_DIFF, openFromRegister, readInBothLanguages, requirePredefined, resultDiff } from '../../../utils/lookup/writerBHelpers';
import type { TestSteps } from '../../../fixtures/testStatus.fixture';
import type { LookupRegisterPage } from '../../../pages/lookup/LookupPages';
import { LOOKUP_ITEMS } from '../../../constants/lookup/lookupIds';
import { readLookupItems } from '../../../utils/lookup/lookupApi';
import {
  BADGE,
  CASES,
  GRID_COLUMNS,
  HOME_LIST,
  NO_PREDEFINED_BLOCKED,
  ORDER_BOUNDARY,
  SCREEN_TITLE,
  VIEW_ITEM_ORDER,
} from '../../../data/lookup/viewLookupItemList.data';

/**
 * User story 20854: View Lookup Item List - what the grid shows for an item
 * (columns, badges in English and Arabic, display-order boundaries) and the
 * full set of values a form can offer. Suite items only (see the data file).
 */

async function navigate(steps: TestSteps, register: LookupRegisterPage, expected: string): Promise<void> {
  await steps.critical(`Navigate to the Lookups Management module - ${expected}`, async () => {
    await register.open();
    await expect(register.control('searchInput'), 'the Lookups register toolbar').toBeVisible();
  });
}

const statusLabel = (isActive: boolean): string => (isActive ? BADGE.active.en : BADGE.inactive.en);

test.describe('US 20854 - View Lookup Item List', () => {
  test.describe.configure({ timeout: 4 * 60_000 });

  test(`TC-${CASES.allDetails.azureId}: should show every configured detail of an item with the list's breadcrumb and title when its items screen is opened`, async ({
    page,
    steps,
    suiteLookupItems,
    lookupRegister,
    itemsView,
  }) => {
    const item = await suiteLookupItems.create(HOME_LIST, { index: VIEW_ITEM_ORDER });
    let listName = '';
    await navigate(steps, lookupRegister, 'the Lookups Management screen loads with the list of lookup lists');

    await steps.critical('Select a lookup list and open its items screen - the "Lookup Items" screen opens showing the selected list\'s items', async () => {
      listName = (await openFromRegister(page, lookupRegister, itemsView, HOME_LIST)).englishName;
      await expect(page, 'the items screen of the selected list').toHaveURL(new RegExp(`/lookup-management/${HOME_LIST}$`));
      expect(await itemsView.findRow(item.id), `the suite item ${item.code} on the grid`).toBe(true);
    });

    await steps.step('Review the grid columns for an item - the grid shows Code, English Name, Arabic Name, Display Order, Active/Inactive status and Predefined for the item', async () => {
      const keys = await itemsView.columnKeys();
      await itemsView.findRow(item.id);
      const row = (await itemsView.rowsOnScreen()).find((r) => r.id === item.id);
      expect({
        missingColumns: GRID_COLUMNS.map((c) => LOOKUP_ITEMS.column[c]).filter((key) => !keys.includes(key)),
        row,
      }, `columns rendered: ${keys.join(', ')}`).toEqual({
        missingColumns: [],
        row: {
          id: item.id,
          code: item.code,
          englishName: item.englishName,
          arabicName: item.arabicName,
          order: String(VIEW_ITEM_ORDER),
          status: BADGE.active.en,
          predefined: BADGE.no.en,
        },
      });
    });

    await steps.step(`Check the breadcrumb at the top of the screen - it shows the list's name in the current language (English), under the title "${SCREEN_TITLE}"`, async () => {
      await expect(itemsView.lookupsCrumb(), 'the "Lookups" crumb').toBeVisible();
      await expect
        .poll(async () => ({ breadcrumb: await itemsView.breadcrumbText(), title: (await itemsView.headerTitle().innerText()).trim() }), {
          message: 'the breadcrumb (last crumb) and the screen title',
        })
        .toEqual({ breadcrumb: listName, title: SCREEN_TITLE });
    });
  });

  test(`TC-${CASES.predefinedLabel.azureId}: should label a system-provided item Predefined "Yes (نعم)" and an admin-added item "No (لا)"`, async ({
    page,
    steps,
    suiteLookupItems,
    lookupRegister,
    itemsView,
  }) => {
    const system = requirePredefined(steps, await readLookupItems(page, HOME_LIST), NO_PREDEFINED_BLOCKED);
    const systemId = system?.id ?? '';
    const own = await suiteLookupItems.create(HOME_LIST);
    await navigate(steps, lookupRegister, 'the Lookups Management screen loads');

    await steps.critical('Open the "Lookup Items" screen for the list - the grid displays both items', async () => {
      await itemsView.openList(HOME_LIST);
      expect({ system: await itemsView.findRow(systemId), admin: await itemsView.findRow(own.id) }, `${system?.code} and ${own.code}`).toEqual({ system: true, admin: true });
    });

    await steps.step('Check the Predefined column for the system-provided item - the column shows "Yes (نعم)"', async () => {
      const shown = await readInBothLanguages(page, itemsView, HOME_LIST, () => itemsView.badgeText(systemId, 'predefined'));
      expect(shown, `the Predefined badge of ${system?.code} in English / Arabic`).toEqual({ ...BADGE.yes });
    });

    await steps.step('Check the Predefined column for the admin-added item - the column shows "No (لا)"', async () => {
      const shown = await readInBothLanguages(page, itemsView, HOME_LIST, () => itemsView.badgeText(own.id, 'predefined'));
      expect(shown, `the Predefined badge of ${own.code} in English / Arabic`).toEqual({ ...BADGE.no });
    });
  });

  test(`TC-${CASES.statusBadge.azureId}: should show "Active (نشط)" for an active value and "Inactive (غير نشط)" for an inactive one`, async ({
    page,
    steps,
    suiteLookupItems,
    lookupRegister,
    itemsView,
  }) => {
    const active = await suiteLookupItems.create(HOME_LIST);
    const inactive = await suiteLookupItems.create(HOME_LIST, { isActive: false });
    await navigate(steps, lookupRegister, 'the screen loads');

    await steps.critical('Open the "Lookup Items" screen - the grid shows both items', async () => {
      await itemsView.openList(HOME_LIST);
      expect({ active: await itemsView.findRow(active.id), inactive: await itemsView.findRow(inactive.id) }, `${active.code} and ${inactive.code}`).toEqual({ active: true, inactive: true });
    });

    await steps.step('Check the Active column for the active item - the badge shows "Active (نشط)"', async () => {
      const shown = await readInBothLanguages(page, itemsView, HOME_LIST, () => itemsView.badgeText(active.id, 'status'));
      expect(shown, `the status badge of ${active.code} in English / Arabic`).toEqual({ ...BADGE.active });
    });

    await steps.step('Check the Active column for the inactive item - the badge shows "Inactive (غير نشط)"', async () => {
      const shown = await readInBothLanguages(page, itemsView, HOME_LIST, () => itemsView.badgeText(inactive.id, 'status'));
      expect(shown, `the status badge of ${inactive.code} in English / Arabic`).toEqual({ ...BADGE.inactive });
    });
  });

  test(`TC-${CASES.orderBoundaries.azureId}: should render the lowest and the highest display order in full when items hold the boundary values`, async ({
    steps,
    suiteLookupItems,
    lookupRegister,
    itemsView,
  }) => {
    const lowest = await suiteLookupItems.create(HOME_LIST, { index: ORDER_BOUNDARY.lowest });
    const highest = await suiteLookupItems.create(HOME_LIST, { index: ORDER_BOUNDARY.highest });
    await navigate(steps, lookupRegister, 'the screen loads');

    await steps.critical('Open the items screen for the list - the grid loads', async () => {
      await itemsView.openList(HOME_LIST);
      await itemsView.expectRowsRendered();
    });

    await steps.step(`Check the Display Order column for the item at the lowest boundary value (${ORDER_BOUNDARY.lowest}) - the value displays correctly without truncation or error`, async () => {
      expect(await itemsView.findRow(lowest.id), `the row of ${lowest.code}`).toBe(true);
      await expect(itemsView.cellOf(lowest.id, 'order'), `Display Order of ${lowest.code} (stored ${lowest.index})`).toHaveText(String(ORDER_BOUNDARY.lowest));
      expect(await itemsView.cellTruncated(lowest.id, 'order'), 'the Display Order cell is cut').toBe(false);
    });

    await steps.step(`Check the Display Order column for the item at the highest boundary value (${ORDER_BOUNDARY.highest}) - the value displays correctly without truncation or error`, async () => {
      expect(await itemsView.findRow(highest.id), `the row of ${highest.code}`).toBe(true);
      await expect(itemsView.cellOf(highest.id, 'order'), `Display Order of ${highest.code} (stored ${highest.index})`).toHaveText(String(ORDER_BOUNDARY.highest));
      expect(await itemsView.cellTruncated(highest.id, 'order'), 'the Display Order cell is cut').toBe(false);
    });
  });

  test(`TC-${CASES.formValues.azureId}: should show every value of a form's list with its Active status when the Lookup Administrator opens it`, async ({
    page,
    steps,
    suiteLookupItems,
    lookupRegister,
    itemsView,
  }) => {
    const active = await suiteLookupItems.create(HOME_LIST);
    const inactive = await suiteLookupItems.create(HOME_LIST, { isActive: false });
    await navigate(steps, lookupRegister, 'the screen loads');

    await steps.critical(`Select the lookup list used by a form (${HOME_LIST}, the user Deactivate drawer) - the items screen opens for that list`, async () => {
      await openFromRegister(page, lookupRegister, itemsView, HOME_LIST);
      await expect(page, 'the items screen of the selected list').toHaveURL(new RegExp(`/lookup-management/${HOME_LIST}$`));
    });

    await steps.step('Review the full set of values and their Active status - the administrator can confirm exactly which values are currently available to forms', async () => {
      const stored = await readLookupItems(page, HOME_LIST);
      const shown = await itemsView.readAllPages();
      const byId = new Map(stored.map((i) => [i.id, i]));
      const wrongStatus = shown
        .filter((r) => byId.has(r.id) && r.status !== statusLabel(byId.get(r.id)!.isActive))
        .map((r) => `${r.code}: shown "${r.status}", stored ${byId.get(r.id)!.isActive ? 'active' : 'inactive'}`);
      expect({ diff: resultDiff(shown, stored), wrongStatus }, `the grid against GET Items (suite items ${active.code} active, ${inactive.code} inactive)`).toEqual({ diff: NO_DIFF, wrongStatus: [] });
    });
  });
});
