import { test, expect, quoteParts, type CloseOutcome } from '../../../utils/settings/writerBHelpers';
import { CASES, MESSAGE } from '../../../data/settings/editSettingsGeneralTab.data';
import { VIEW_LABEL } from '../../../data/settings/viewSettingsGeneralTab.data';

/** What a close attempt should have shown, as a record to compare (the dialog's title, message and - in English - its two choices). */
function dialogReport(close: CloseOutcome, quote: string, withChoices: boolean): Record<string, boolean | string> {
  const { summary, detail } = quoteParts(quote);
  const report: Record<string, boolean | string> = {
    dialog: close.dialogShown ? 'shown' : `NOT shown - the drawer ${close.drawerOpen ? 'stayed open' : 'closed at once'}`,
    title: close.dialogText.includes(summary),
    message: close.dialogText.includes(detail),
  };
  return withChoices ? { ...report, keepEditing: close.dialogText.includes(MESSAGE.keepEditing), discardChanges: close.dialogText.includes(MESSAGE.discardChanges) } : report;
}

/**
 * User story 20866: Edit Settings - General Tab - closing the drawer with
 * unsaved changes. The cases expect an "Unsaved Changes" dialog with Keep
 * Editing / Discard Changes; the foundation saw the drawer close at once with
 * NO dialog (q6), so each failure states what the drawer did. "Close the
 * panel" = the drawer's X. Nothing is saved (settingsGuard still guards).
 */
test.describe('US 20866 - Edit Settings - General Tab', () => {
  test.describe.configure({ timeout: 3 * 60_000 });

  test(`TC-${CASES.unsavedPrompt.azureId}: should ask to keep editing or discard with the bilingual message when the panel is closed with unsaved changes`, async ({ steps, settingsGuard, settingsView, languageSwitcher }) => {
    const d = CASES.unsavedPrompt;

    await steps.critical('Navigate to the System Setting Management module - the module landing page loads', async () => {
      await settingsView.open();
      await expect(settingsView.editButton(), 'the Edit button').toBeVisible();
    });

    await steps.critical('Open System Settings > Settings > General tab and select Edit - the Edit Setting side panel opens', async () => {
      await settingsView.openEdit();
      await expect(settingsView.drawerTitle(), 'the Edit Setting drawer').toBeVisible();
    });

    await steps.critical('Change the Site Title field without saving - the field shows the new unsaved value', async () => {
      await settingsView.setSiteTitle(d.title);
      await expect(settingsView.control('siteTitleInput'), 'the site title box').toHaveValue(d.title);
    });

    await steps.step('Attempt to close the panel - a dialog offers Keep Editing or Discard Changes with "Unsaved Changes — You have unsaved changes. If you leave now, your edits will be lost." / its Arabic text', async () => {
      const english = await settingsView.closeWithX();
      // The Arabic message: the same close repeated with the UI in Arabic, then back to English.
      await settingsView.reloadHub();
      await languageSwitcher.switchTo('ar');
      await settingsView.openEdit();
      await settingsView.setSiteTitle(d.title);
      const arabic = await settingsView.closeWithX();
      await settingsView.reloadHub();
      await languageSwitcher.switchTo('en');
      expect.soft(dialogReport(english, MESSAGE.unsavedEn, true), `English close: dialog text "${english.dialogText}"`).toEqual({ dialog: 'shown', title: true, message: true, keepEditing: true, discardChanges: true });
      expect(dialogReport(arabic, MESSAGE.unsavedAr, false), `Arabic close: dialog text "${arabic.dialogText}"`).toEqual({ dialog: 'shown', title: true, message: true });
    });

    // Back to English even when a step above stopped early (no-op when already English).
    await languageSwitcher.switchTo('en');
  });

  test(`TC-${CASES.keepEditing.azureId}: should return to the open panel with the unsaved title intact when Keep Editing is chosen`, async ({ steps, settingsGuard, settingsView }) => {
    const d = CASES.keepEditing;

    await steps.critical('Navigate to the System Setting Management module - the module landing page loads', async () => {
      await settingsView.open();
      await expect(settingsView.editButton(), 'the Edit button').toBeVisible();
    });

    await steps.critical('Open General, select Edit, change the Site Title without saving and attempt to close - the unsaved-changes confirmation dialog is triggered', async () => {
      await settingsView.openEdit();
      await settingsView.setSiteTitle(d.title);
      const close = await settingsView.closeWithX();
      expect(close.dialogShown, `the unsaved-changes dialog (the drawer ${close.drawerOpen ? 'stayed open' : 'closed at once with no dialog'})`).toBe(true);
    });

    await steps.step('Select Keep Editing - the confirmation dialog closes', async () => {
      await settingsView.chooseUnsaved('keep', MESSAGE.keepEditing);
      expect(await settingsView.unsavedDialogGone(), 'the dialog after Keep Editing').toBe(true);
    });

    await steps.step('Inspect the Edit Setting panel - it remains open with the unsaved Site Title change still present', async () => {
      await expect(settingsView.drawerTitle(), 'the Edit Setting drawer').toBeVisible();
      await expect(settingsView.control('siteTitleInput'), 'the site title box').toHaveValue(d.title);
    });
  });

  test(`TC-${CASES.discardChanges.azureId}: should close the panel and keep the saved title when Discard Changes is chosen`, async ({ steps, settingsGuard, settingsView }) => {
    const d = CASES.discardChanges;
    const title = settingsGuard.original['Site.Title'];

    await steps.critical('Navigate to the System Setting Management module - the module landing page loads', async () => {
      await settingsView.open();
      await expect(settingsView.editButton(), 'the Edit button').toBeVisible();
    });

    await steps.critical('Open General, select Edit, change the Site Title without saving and attempt to close - the unsaved-changes confirmation dialog is triggered', async () => {
      await settingsView.openEdit();
      await settingsView.setSiteTitle(d.title);
      const close = await settingsView.closeWithX();
      expect(close.dialogShown, `the unsaved-changes dialog (the drawer ${close.drawerOpen ? 'stayed open' : 'closed at once with no dialog'})`).toBe(true);
    });

    await steps.step('Select Discard Changes - the confirmation dialog and the Edit Setting panel both close', async () => {
      await settingsView.chooseUnsaved('discard', MESSAGE.discardChanges);
      expect.soft(await settingsView.unsavedDialogGone(), 'the dialog after Discard Changes').toBe(true);
      await expect(settingsView.drawerTitle(), 'the Edit Setting drawer').toBeHidden();
    });

    await steps.step('Inspect the General tab - it shows the original, previously saved Site Title, not the discarded edit', async () => {
      expect.soft(await settingsView.labelValue(VIEW_LABEL.siteTitle), 'the site title shown').toBe(title);
      expect((await settingsGuard.current())['Site.Title'], 'the stored site title').toBe(title);
    });
  });
});
