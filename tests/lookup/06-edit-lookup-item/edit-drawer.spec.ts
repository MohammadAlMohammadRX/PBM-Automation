import { test, expect, WriterDLookups, asShown, normalise, storedItem, suiteNames, type SaveReport } from '../../../utils/lookup/writerDHelpers';
import type { LookupItem } from '../../../utils/lookup/lookupApi';
import { CASES, DUPLICATE_CODE_MESSAGE, HOME_LIST, MESSAGE } from '../../../data/lookup/editLookupItem.data';

/**
 * User story 20858: Edit Lookup Item - the Edit drawer: pre-filled values, a new
 * unique code, a duplicate code, and a valid save. Every item edited is a suite
 * item of the home list made in the test (deleted at teardown).
 */
test.describe('US 20858 - Edit Lookup Item', () => {
  test.describe.configure({ timeout: 4 * 60_000 });

  test(`TC-${CASES.prefilled.azureId}: should open the Edit Lookup Item panel pre-filled with the item's current values when Edit is selected`, async ({ page, steps, suiteLookupItems, lookupRegister }) => {
    const view = new WriterDLookups(page);
    let item!: LookupItem;

    await steps.critical('Navigate to the Lookups Management module - the list of lookups is displayed', async () => {
      item = await suiteLookupItems.create(HOME_LIST, { ...suiteNames(), index: CASES.prefilled.order });
      await lookupRegister.open();
      await expect(lookupRegister.control('searchInput'), 'the Lookups register search').toBeVisible();
    });

    await steps.step('Open a lookup and select Edit on an existing item - the Edit Lookup Item side panel opens', async () => {
      await view.openList(HOME_LIST);
      await view.openEdit(HOME_LIST, item);
      await expect(view.drawer.field('title'), 'the drawer title').toHaveText(MESSAGE.editTitle);
    });

    await steps.step('Inspect the panel fields - Code, Name (English), Name (Arabic), Display Order and Is Active are pre-filled with the item\'s current values', async () => {
      const shown = await view.readDrawer();
      expect({ code: shown.code, englishName: shown.englishName, arabicName: shown.arabicName, order: shown.order, isActive: shown.isActive }, `the Edit drawer of ${item.code}`).toEqual({
        code: item.code,
        englishName: item.englishName,
        arabicName: item.arabicName,
        order: String(item.index),
        isActive: item.isActive,
      });
    });
  });

  test(`TC-${CASES.changeCode.azureId}: should save a new unique code and show "Item Updated" when the code is changed to an unused value`, async ({ page, steps, suiteLookupItems, lookupRegister }) => {
    const view = new WriterDLookups(page);
    const newCode = suiteLookupItems.newCode();
    let item!: LookupItem;

    await steps.critical('Navigate to the Lookups Management module - the list of lookups is displayed', async () => {
      item = await suiteLookupItems.create(HOME_LIST, suiteNames());
      await lookupRegister.open();
      await expect(lookupRegister.control('searchInput'), 'the Lookups register search').toBeVisible();
    });

    await steps.step('Open Edit on the item and change Code to a value not used elsewhere in the list - the new code is accepted in the field', async () => {
      await view.openList(HOME_LIST);
      await view.openEdit(HOME_LIST, item);
      await view.typeAndLeave('code', newCode);
      await expect(view.drawer.field('code'), 'the Code box').toHaveValue(newCode);
      expect(await view.drawerErrors(), `field errors for the unused code ${newCode}`).toEqual([]);
    });

    await steps.step('Save the item - the panel closes and the system shows "Item Updated — The lookup item was updated."', async () => {
      const save = await view.save();
      const shown = `UpdateLookupItem ${save.status ?? 'not sent'} ${save.answer.slice(0, 160)}; toast "${save.toast}"; errors ${JSON.stringify(save.errors)}`;
      expect.soft(save.drawerOpen, `the drawer after Save (${shown})`).toBe(false);
      expect.soft(normalise(save.toast), `the toast (${shown})`).toContain(asShown(MESSAGE.updated));
      expect((await storedItem(page, HOME_LIST, item.id))?.code, `the stored code (${shown})`).toBe(newCode);
    });
  });

  test(`TC-${CASES.duplicateCode.azureId}: should refuse the save and keep the code when it duplicates another item's code in the same list`, async ({ page, steps, suiteLookupItems, lookupRegister }) => {
    const view = new WriterDLookups(page);
    let first!: LookupItem;
    let second!: LookupItem;

    await steps.critical('Navigate to the Lookups Management module - the list of lookups is displayed', async () => {
      first = await suiteLookupItems.create(HOME_LIST, suiteNames());
      second = await suiteLookupItems.create(HOME_LIST, suiteNames());
      await lookupRegister.open();
      await expect(lookupRegister.control('searchInput'), 'the Lookups register search').toBeVisible();
    });

    await steps.step('Open Edit on an item and change its Code to one already used by another item in the same list - a validation message indicates the code is not unique', async () => {
      await view.openList(HOME_LIST);
      await view.openEdit(HOME_LIST, second);
      await view.typeAndLeave('code', first.code);
      await expect(view.drawer.field('code'), 'the Code box').toHaveValue(first.code);
      const errors = await view.drawerErrors();
      expect(errors.join(' | '), `a message about the code ${first.code} (already held by ${first.englishName}) before Save; field errors ${JSON.stringify(errors)}`).toMatch(DUPLICATE_CODE_MESSAGE);
    });

    await steps.step('Attempt to Save - save is blocked; the system refuses the save and the item\'s code is not changed', async () => {
      const save = await view.save();
      const shown = `UpdateLookupItem ${save.status ?? 'not sent'} ${save.answer.slice(0, 200)}; toast "${save.toast}"; errors ${JSON.stringify(save.errors)}; drawer ${save.drawerOpen ? 'open' : 'closed'}`;
      expect.soft(save.status === null || save.status >= 400, `the save of a duplicate code (${shown})`).toBe(true);
      expect.soft(WriterDLookups.messagesOf(save), `a message naming the code as taken (${shown})`).toMatch(DUPLICATE_CODE_MESSAGE);
      expect((await storedItem(page, HOME_LIST, second.id))?.code, `the stored code of the edited item (${shown})`).toBe(second.code);
    });
  });

  test(`TC-${CASES.validSave.azureId}: should persist the new names and display order and show "Item Updated" when valid changes are saved`, async ({ page, steps, suiteLookupItems, lookupRegister }) => {
    const d = CASES.validSave;
    const view = new WriterDLookups(page);
    let item!: LookupItem;
    let save = null as SaveReport | null;

    await steps.critical('Navigate to the Lookups Management module - the list of lookups is displayed', async () => {
      item = await suiteLookupItems.create(HOME_LIST, suiteNames());
      await lookupRegister.open();
      await expect(lookupRegister.control('searchInput'), 'the Lookups register search').toBeVisible();
    });

    await steps.step('Open Edit on an editable non predefined item and update Name (English), Name (Arabic) and Display Order with valid values - the fields show the new values', async () => {
      await view.openList(HOME_LIST);
      await view.openEdit(HOME_LIST, item);
      await view.drawer.fill({ englishName: d.englishName, arabicName: d.arabicName, order: d.order });
      await expect(view.drawer.field('englishName'), 'Name (English)').toHaveValue(d.englishName);
      await expect(view.drawer.field('arabicName'), 'Name (Arabic)').toHaveValue(d.arabicName);
      await expect(view.drawer.field('order'), 'Display Order').toHaveValue(d.order);
    });

    await steps.step('Save the item - the panel closes', async () => {
      save = await view.save();
      expect(save.drawerOpen, `the drawer after Save (UpdateLookupItem ${save.status ?? 'not sent'} ${save.answer.slice(0, 160)}; toast "${save.toast}"; errors ${JSON.stringify(save.errors)})`).toBe(false);
    });

    await steps.step('Reopen the item - the grid and the item reflect the saved changes; the changes persist and the system shows "Item Updated — The lookup item was updated."', async () => {
      expect.soft(normalise(save?.toast ?? ''), 'the toast shown by the Save').toContain(asShown(MESSAGE.updated));
      await view.openList(HOME_LIST);
      await view.revealItem(HOME_LIST, item);
      const row = await view.rowCells(item.id);
      expect.soft({ englishName: row.englishName, arabicName: row.arabicName, order: row.order }, 'the row in the grid').toEqual({ englishName: d.englishName, arabicName: d.arabicName, order: d.order });
      await view.openEdit(HOME_LIST, item);
      const reopened = await view.readDrawer();
      expect({ englishName: reopened.englishName, arabicName: reopened.arabicName, order: reopened.order }, 'the reopened Edit drawer').toEqual({ englishName: d.englishName, arabicName: d.arabicName, order: d.order });
    });
  });
});
