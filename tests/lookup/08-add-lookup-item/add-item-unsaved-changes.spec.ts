import { test, expect, englishNameFor, itemsNamed, itemsWithCode, norm, openAddForm, pick, uniform } from '../../../utils/lookup/writerEHelpers';
import { CASES, DIALOG_LABELS, EMPTY_FIELDS, HOME_LIST, MESSAGES } from '../../../data/lookup/addLookupItem.data';

/**
 * User story 20860: Add Lookup Item - leaving the drawer with unsaved
 * changes (Cancel, and the close X with Keep Editing / Discard Changes).
 * Nothing is saved; the home list is watched anyway, so a save by mistake is
 * deleted at teardown.
 */
test.describe('US 20860 - Add Lookup Item', () => {
  test.describe.configure({ timeout: 4 * 60_000 });

  test(`TC-${CASES.cancelUnsaved.azureId}: should warn about unsaved changes when Cancel is clicked after typing a value`, async ({ page, steps, suiteLookupItems, addItems, addDrawer }) => {
    await suiteLookupItems.watch(HOME_LIST);
    const code = suiteLookupItems.newCode();

    await steps.critical('Navigate to the Lookups Management module - the module loads', async () => {
      await addItems.open(HOME_LIST);
      await expect(addItems.control('addButton'), 'the Add Item action on the list').toBeVisible();
    });

    await steps.critical('Open the "Add Lookup Item" form - an empty form is displayed', async () => {
      await openAddForm(addItems, addDrawer);
      expect(pick(await addDrawer.values(), EMPTY_FIELDS), 'the Code / English / Arabic boxes').toEqual(uniform(EMPTY_FIELDS, ''));
    });

    await steps.step('Enter a value into Code - the field shows the entered text and the form has unsaved changes', async () => {
      await addDrawer.fill({ code });
      await expect(addDrawer.field('code'), 'the Code box').toHaveValue(code);
    });

    await steps.step(`Click Cancel - "${MESSAGES.unsaved}" is displayed`, async () => {
      await addDrawer.pressCancel();
      const open = await addDrawer.isUnsavedDialogOpen();
      const drawerOpen = await addDrawer.isOpen(500);
      expect(open, `the unsaved-changes dialog after Cancel (the drawer is ${drawerOpen ? 'still open' : 'closed'})`).toBe(true);
      expect(await addDrawer.unsavedDialogText(), 'the dialog text').toContain(norm(MESSAGES.unsaved));
      expect(await itemsWithCode(page, HOME_LIST, code), `items stored with code ${code}`).toEqual([]);
    });
  });

  test(`TC-${CASES.closeUnsaved.azureId}: should ask Keep Editing or Discard Changes when the panel is closed with unsaved changes`, async ({ page, steps, suiteLookupItems, addItems, addDrawer }) => {
    await suiteLookupItems.watch(HOME_LIST);
    const englishName = englishNameFor(suiteLookupItems.newCode());

    await steps.critical('Navigate to the Lookups Management module - the module loads', async () => {
      await addItems.open(HOME_LIST);
      await expect(addItems.control('addButton'), 'the Add Item action on the list').toBeVisible();
    });

    await steps.critical('Open the "Add Lookup Item" form - an empty form is displayed', async () => {
      await openAddForm(addItems, addDrawer);
      expect(pick(await addDrawer.values(), EMPTY_FIELDS), 'the Code / English / Arabic boxes').toEqual(uniform(EMPTY_FIELDS, ''));
    });

    await steps.step('Enter a value into English Name - the field shows the entered text and the form has unsaved changes', async () => {
      await addDrawer.fill({ englishName });
      await expect(addDrawer.field('englishName'), 'the English Name box').toHaveValue(englishName);
    });

    await steps.critical(`Close the panel with the close icon - a dialog offers "${DIALOG_LABELS.keepEditing}" and "${DIALOG_LABELS.discard}"`, async () => {
      await addDrawer.pressClose();
      const open = await addDrawer.isUnsavedDialogOpen();
      const drawerOpen = await addDrawer.isOpen(500);
      expect(open, `the unsaved-changes dialog after the close icon (the drawer is ${drawerOpen ? 'still open' : 'closed'})`).toBe(true);
      await expect(addDrawer.keepEditingButton(), 'the Keep Editing button').toHaveText(DIALOG_LABELS.keepEditing);
      await expect(addDrawer.discardButton(), 'the Discard Changes button').toHaveText(DIALOG_LABELS.discard);
    });

    await steps.step(`Select "${DIALOG_LABELS.keepEditing}" - the panel stays open with the entered data intact`, async () => {
      await addDrawer.keepEditing();
      expect(await addDrawer.isUnsavedDialogOpen(1_000), 'the dialog after Keep Editing').toBe(false);
      await expect(addDrawer.title(), 'the drawer after Keep Editing').toBeVisible();
      await expect(addDrawer.field('englishName'), 'the English Name box after Keep Editing').toHaveValue(englishName);
    });

    await steps.step(`Close the panel again and select "${DIALOG_LABELS.discard}" - the panel closes and the entered data is discarded`, async () => {
      await addDrawer.pressClose();
      expect(await addDrawer.isUnsavedDialogOpen(), 'the unsaved-changes dialog on the second close').toBe(true);
      await addDrawer.discardChanges();
      expect(await addDrawer.waitForClosed(), 'the drawer closed after Discard Changes').toBe(true);
      expect(await itemsNamed(page, HOME_LIST, englishName), `items stored as "${englishName}"`).toEqual([]);
    });
  });
});
