import { test, expect, WriterDLookups, quoteParts, storedItem, suiteNames, type CloseOutcome } from '../../../utils/lookup/writerDHelpers';
import type { LookupItem } from '../../../utils/lookup/lookupApi';
import { CASES, HOME_LIST, MESSAGE } from '../../../data/lookup/editLookupItem.data';

/** What the close showed, as a record to compare with the quoted dialog. */
function dialogReport(close: CloseOutcome): Record<string, boolean | string> {
  const { summary, detail } = quoteParts(MESSAGE.unsaved);
  return {
    dialog: close.dialogShown ? 'shown' : `NOT shown - the drawer ${close.drawerOpen ? 'stayed open' : 'closed at once'}`,
    title: close.dialogText.includes(summary),
    message: close.dialogText.includes(detail),
    keepEditing: close.dialogText.includes(MESSAGE.keepEditing),
    discardChanges: close.dialogText.includes(MESSAGE.discardChanges),
  };
}

const ALL_SHOWN = { dialog: 'shown', title: true, message: true, keepEditing: true, discardChanges: true };

/**
 * User story 20858: Edit Lookup Item - closing the Edit drawer (its X) with an
 * unsaved change: the "Unsaved Changes" dialog, Keep Editing and Discard
 * Changes. Nothing is saved; the suite item is deleted at teardown.
 */
test.describe('US 20858 - Edit Lookup Item', () => {
  test.describe.configure({ timeout: 4 * 60_000 });

  test(`TC-${CASES.keepEditing.azureId}: should keep the panel open with the unsaved change when Keep Editing is chosen`, async ({ page, steps, suiteLookupItems, lookupRegister }) => {
    const d = CASES.keepEditing;
    const view = new WriterDLookups(page);
    let item!: LookupItem;

    await steps.critical('Navigate to the Lookups Management module - the list of lookups is displayed', async () => {
      item = await suiteLookupItems.create(HOME_LIST, suiteNames());
      await lookupRegister.open();
      await expect(lookupRegister.control('searchInput'), 'the Lookups register search').toBeVisible();
    });

    await steps.critical('Open Edit on an item and change a field without saving - the field shows the unsaved change', async () => {
      await view.openList(HOME_LIST);
      await view.openEdit(HOME_LIST, item);
      await view.drawer.fill({ englishName: d.englishName });
      await expect(view.drawer.field('englishName'), 'Name (English)').toHaveValue(d.englishName);
    });

    await steps.critical('Attempt to close the panel - a confirmation appears: "Unsaved Changes — You have unsaved changes. If you leave now, your edits will be lost." with "Keep Editing" and "Discard Changes"', async () => {
      const close = await view.closeWithX();
      expect(dialogReport(close), `the dialog text "${close.dialogText}"`).toEqual(ALL_SHOWN);
    });

    await steps.step('Select "Keep Editing" - the panel stays open with the unsaved change still present and no data is lost', async () => {
      await view.chooseUnsaved('keep', MESSAGE.keepEditing);
      expect.soft(await view.unsavedDialogGone(), 'the dialog after Keep Editing').toBe(true);
      await expect(view.drawer.field('title'), 'the Edit drawer').toBeVisible();
      await expect(view.drawer.field('englishName'), 'Name (English)').toHaveValue(d.englishName);
    });
  });

  test(`TC-${CASES.discardChanges.azureId}: should close the panel and keep the original values when Discard Changes is chosen`, async ({ page, steps, suiteLookupItems, lookupRegister }) => {
    const d = CASES.discardChanges;
    const view = new WriterDLookups(page);
    let item!: LookupItem;

    await steps.critical('Navigate to the Lookups Management module - the list of lookups is displayed', async () => {
      item = await suiteLookupItems.create(HOME_LIST, suiteNames());
      await lookupRegister.open();
      await expect(lookupRegister.control('searchInput'), 'the Lookups register search').toBeVisible();
    });

    await steps.critical('Open Edit on an item and change a field without saving - the field shows the unsaved change', async () => {
      await view.openList(HOME_LIST);
      await view.openEdit(HOME_LIST, item);
      await view.drawer.fill({ englishName: d.englishName });
      await expect(view.drawer.field('englishName'), 'Name (English)').toHaveValue(d.englishName);
    });

    await steps.critical('Attempt to close the panel - the "Unsaved Changes" confirmation appears with "Keep Editing" and "Discard Changes"', async () => {
      const close = await view.closeWithX();
      expect(dialogReport(close), `the dialog text "${close.dialogText}"`).toEqual(ALL_SHOWN);
    });

    await steps.step('Select "Discard Changes" - the panel closes without saving and the item\'s original values remain unchanged', async () => {
      await view.chooseUnsaved('discard', MESSAGE.discardChanges);
      await expect(view.drawer.field('title'), 'the Edit drawer').toBeHidden();
      expect.soft((await view.rowCells(item.id)).englishName, 'the English name in the grid').toBe(item.englishName);
      expect((await storedItem(page, HOME_LIST, item.id))?.englishName, 'the stored English name').toBe(item.englishName);
    });
  });
});
