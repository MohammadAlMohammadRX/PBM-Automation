import { test, expect, WriterDLookups, storedItem, suiteNames, type SaveReport } from '../../../utils/lookup/writerDHelpers';
import type { LookupItem } from '../../../utils/lookup/lookupApi';
import { CASES, HOME_LIST, MESSAGE } from '../../../data/lookup/editLookupItem.data';

/** What one Save showed, for failure messages. */
function shownBy(save: SaveReport): string {
  return `UpdateLookupItem ${save.status ?? 'not sent'} ${save.answer.slice(0, 200)}; toast "${save.toast}"; field errors ${JSON.stringify(save.errors)}; drawer ${save.drawerOpen ? 'open' : 'closed'}`;
}

/**
 * User story 20858: Edit Lookup Item - Save validation: a required name left
 * empty, digits / symbols in the Arabic name, and the Display Order range
 * (lowest valid 0 - lead decision 8). Suite items of the home list only.
 */
test.describe('US 20858 - Edit Lookup Item', () => {
  test.describe.configure({ timeout: 4 * 60_000 });

  test(`TC-${CASES.requiredField.azureId}: should block the save with "This field is required." when Name (English) is cleared`, async ({ page, steps, suiteLookupItems, lookupRegister }) => {
    const view = new WriterDLookups(page);
    let item!: LookupItem;

    await steps.critical('Navigate to the Lookups Management module - the list of lookups is displayed', async () => {
      item = await suiteLookupItems.create(HOME_LIST, suiteNames());
      await lookupRegister.open();
      await expect(lookupRegister.control('searchInput'), 'the Lookups register search').toBeVisible();
    });

    await steps.step('Open Edit on an editable (non predefined) item and clear a required field (Name (English)) - the field is now empty', async () => {
      await view.openList(HOME_LIST);
      await view.openEdit(HOME_LIST, item);
      await view.typeAndLeave('englishName', '');
      await expect(view.drawer.field('englishName'), 'Name (English)').toHaveValue('');
    });

    await steps.step('Attempt to Save - a required-field validation message appears; the save is blocked and the item is not updated', async () => {
      const save = await view.save();
      expect.soft(save.status === null || save.status >= 400, `the save with an empty English name (${shownBy(save)})`).toBe(true);
      expect.soft(save.drawerOpen, `the drawer stays open (${shownBy(save)})`).toBe(true);
      expect.soft(WriterDLookups.messagesOf(save), `the required-field message (${shownBy(save)})`).toContain(MESSAGE.required);
      expect((await storedItem(page, HOME_LIST, item.id))?.englishName, 'the stored English name').toBe(item.englishName);
    });
  });

  test(`TC-${CASES.lettersOnly.azureId}: should block the save with "Arabic letters only." when Name (Arabic) holds digits and symbols`, async ({ page, steps, suiteLookupItems, lookupRegister }) => {
    const d = CASES.lettersOnly;
    const view = new WriterDLookups(page);
    let item!: LookupItem;

    await steps.critical('Navigate to the Lookups Management module - the list of lookups is displayed', async () => {
      item = await suiteLookupItems.create(HOME_LIST, suiteNames());
      await lookupRegister.open();
      await expect(lookupRegister.control('searchInput'), 'the Lookups register search').toBeVisible();
    });

    await steps.step(`Open Edit on an editable item and enter digits/symbols into Name (Arabic), "${d.arabicName}" - the invalid value is shown in the field`, async () => {
      await view.openList(HOME_LIST);
      await view.openEdit(HOME_LIST, item);
      await view.typeAndLeave('arabicName', d.arabicName);
      await expect(view.drawer.field('arabicName'), 'Name (Arabic)').toHaveValue(d.arabicName);
    });

    await steps.step('Attempt to Save - a validation message about invalid characters appears; the save is blocked until the name contains only valid letters', async () => {
      const save = await view.save();
      expect.soft(save.status === null || save.status >= 400, `the save with "${d.arabicName}" (${shownBy(save)})`).toBe(true);
      expect.soft(save.drawerOpen, `the drawer stays open (${shownBy(save)})`).toBe(true);
      expect.soft(WriterDLookups.messagesOf(save), `the invalid-characters message (${shownBy(save)})`).toContain(MESSAGE.arabicOnly);
      expect((await storedItem(page, HOME_LIST, item.id))?.arabicName, 'the stored Arabic name').toBe(item.arabicName);
    });
  });

  test(`TC-${CASES.displayOrderRange.azureId}: should accept the lowest Display Order and refuse a value below it`, async ({ page, steps, suiteLookupItems, lookupRegister }) => {
    const d = CASES.displayOrderRange;
    const view = new WriterDLookups(page);
    let item!: LookupItem;

    await steps.critical('Navigate to the Lookups Management module - the list of lookups is displayed', async () => {
      item = await suiteLookupItems.create(HOME_LIST, { ...suiteNames(), index: d.startOrder });
      await lookupRegister.open();
      await expect(lookupRegister.control('searchInput'), 'the Lookups register search').toBeVisible();
    });

    await steps.step(`Open Edit on an editable item, set Display Order to the minimum allowed value (${d.minimum}) and save - the save succeeds`, async () => {
      await view.openList(HOME_LIST);
      await view.openEdit(HOME_LIST, item);
      await view.drawer.fill({ order: d.minimum });
      const save = await view.save();
      expect.soft(save.drawerOpen, `the drawer after saving ${d.minimum} (${shownBy(save)})`).toBe(false);
      expect((await storedItem(page, HOME_LIST, item.id))?.index, `the stored Display Order (${shownBy(save)})`).toBe(Number(d.minimum));
    });

    await steps.step(`Reopen the item, set Display Order below the minimum (${d.belowMinimum}) and attempt to save - a validation message appears and the save is blocked`, async () => {
      await view.openList(HOME_LIST);
      await view.openEdit(HOME_LIST, item);
      await view.drawer.fill({ order: d.belowMinimum });
      const typed = await view.drawer.field('order').inputValue();
      const save = await view.save();
      const shown = `the box read "${typed}" after typing ${d.belowMinimum}; ${shownBy(save)}`;
      expect.soft(save.status === null || save.status >= 400, `the save of ${d.belowMinimum} (${shown})`).toBe(true);
      expect.soft([...save.errors, save.toast].filter((m) => m !== '').length, `a validation message (${shown})`).toBeGreaterThan(0);
      expect((await storedItem(page, HOME_LIST, item.id))?.index, `the stored Display Order (${shown})`).toBe(Number(d.minimum));
    });
  });
});
