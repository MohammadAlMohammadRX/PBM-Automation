import { test, expect } from '../../../fixtures';
import { readAllSettings } from '../../../utils/settings/systemSettingsApi';
import { FIELD_KEY, NotificationSettingsView, refused } from '../../../utils/notification/writerBHelpers';
import { CASES, MESSAGE, PASSWORD_WORD, SMTP_FIELDS, SMTP_LABELS, SMTP_SECTION, SMTP_SECTION_END, SMTP_STORY } from '../../../data/notification/editEmailProviderSettings.data';

/**
 * US 21022 - Edit Email Provider Settings: the SMTP values in System Settings >
 * General (read view + Edit Setting drawer). Values are not checked on save, so
 * blank / non-numeric / malformed values must SAVE. Every case holds
 * notificationSettingsGuard: the SMTP values are restored and read back at
 * teardown. No password value is ever read or printed - only ids, input types
 * and key NAMES are looked at.
 */
test.describe(`US ${SMTP_STORY.id} - ${SMTP_STORY.title}`, () => {
  test.describe.configure({ timeout: 4 * 60_000 });

  test(`TC-${CASES.arabicToast.azureId}: should confirm a saved SMTP change in Arabic when the interface is Arabic`, async ({ steps, page, notificationSettingsGuard }) => {
    const view = new NotificationSettingsView(page);
    const d = CASES.arabicToast;
    let messages = '';

    await steps.critical('Navigate to the Notification Center Management module - the module home page is displayed (application language Arabic)', async () => {
      await view.openHub();
      await view.switchLanguage('ar');
      await expect(view.editButton(), 'the Edit button of the settings').toBeVisible();
    });

    await steps.step('Open the SMS & Mail provider section and select Edit - the SMTP settings drawer opens', async () => {
      await view.openEdit();
      await expect(view.field('smtpFromEmail'), 'From email').toHaveValue(notificationSettingsGuard.original[FIELD_KEY.smtpFromEmail]);
    });

    await steps.step('Update the From email value, then select Save - the save is confirmed', async () => {
      await view.setText('smtpFromEmail', d.fromEmail);
      const s = await view.save();
      messages = s.messages;
      expect.soft(refused(s), `the save should go through - ${s.said}`).toBe(false);
      expect.soft(s.outcome.drawerOpen, `the drawer after the save - ${s.said}`).toBe(false);
      expect((await notificationSettingsGuard.current())[FIELD_KEY.smtpFromEmail], `stored - ${s.said}`).toBe(d.fromEmail);
    });

    await steps.step(`Observe the confirmation message - "${MESSAGE.updatedAr}" is displayed`, async () => {
      expect(messages, 'the confirmation shown after the save').toContain(MESSAGE.updatedAr);
    });

    // Back to English even when a step stopped early (no-op when already English).
    await view.switchLanguage('en');
  });

  test(`TC-${CASES.blankServer.azureId}: should save a blank SMTP server without a validation error`, async ({ steps, page, notificationSettingsGuard }) => {
    const view = new NotificationSettingsView(page);
    let messages = '';

    await steps.critical('Navigate to the Notification Center Management module - the module home page is displayed', async () => {
      await view.openHub();
      await expect(view.editButton(), 'the Edit button of the settings').toBeVisible();
    });

    await steps.step('Open the SMS & Mail provider section and select Edit - the SMTP settings drawer opens', async () => {
      await view.openEdit();
      await expect(view.field('smtpServer'), 'SMTP server').toHaveValue(notificationSettingsGuard.original[FIELD_KEY.smtpServer]);
    });

    await steps.step('Clear the SMTP server field and select Save - the setting is saved with the server blank and no validation error', async () => {
      await view.setText('smtpServer', '');
      const s = await view.save();
      messages = s.messages;
      expect.soft(refused(s), `the save should go through - ${s.said}`).toBe(false);
      expect.soft(s.messages, `no validation error - ${s.said}`).not.toMatch(MESSAGE.validation);
      expect((await notificationSettingsGuard.current())[FIELD_KEY.smtpServer], `stored - ${s.said}`).toBe('');
    });

    await steps.step('Observe the confirmation message - the success message is displayed', async () => {
      expect(messages, 'the confirmation shown after the save').toContain(MESSAGE.updatedEn);
    });
  });

  test(`TC-${CASES.blankFromEmail.azureId}: should save a blank From email without a validation error`, async ({ steps, page, notificationSettingsGuard }) => {
    const view = new NotificationSettingsView(page);
    let messages = '';

    await steps.critical('Navigate to the Notification Center Management module - the module home page is displayed', async () => {
      await view.openHub();
      await expect(view.editButton(), 'the Edit button of the settings').toBeVisible();
    });

    await steps.step('Open the SMS & Mail provider section and select Edit - the SMTP settings drawer opens', async () => {
      await view.openEdit();
      await expect(view.field('smtpFromEmail'), 'From email').toHaveValue(notificationSettingsGuard.original[FIELD_KEY.smtpFromEmail]);
    });

    await steps.step('Clear the From email field and select Save - the setting is saved with From email blank and no validation error', async () => {
      await view.setText('smtpFromEmail', '');
      const s = await view.save();
      messages = s.messages;
      expect.soft(refused(s), `the save should go through - ${s.said}`).toBe(false);
      expect.soft(s.messages, `no validation error - ${s.said}`).not.toMatch(MESSAGE.validation);
      expect((await notificationSettingsGuard.current())[FIELD_KEY.smtpFromEmail], `stored - ${s.said}`).toBe('');
    });

    await steps.step('Observe the confirmation message - the success message is displayed', async () => {
      expect(messages, 'the confirmation shown after the save').toContain(MESSAGE.updatedEn);
    });
  });

  test(`TC-${CASES.nonNumericPort.azureId}: should save a non-numeric SMTP port without a validation error`, async ({ steps, page, notificationSettingsGuard }) => {
    const view = new NotificationSettingsView(page);
    const d = CASES.nonNumericPort;
    let messages = '';

    await steps.critical('Navigate to the Notification Center Management module - the module home page is displayed', async () => {
      await view.openHub();
      await expect(view.editButton(), 'the Edit button of the settings').toBeVisible();
    });

    await steps.step('Open the SMS & Mail provider section and select Edit - the SMTP settings drawer opens', async () => {
      await view.openEdit();
      await expect(view.field('smtpPort'), 'SMTP port').toHaveValue(notificationSettingsGuard.original[FIELD_KEY.smtpPort]);
    });

    await steps.step(`Enter a non-numeric value ("${d.port}") into the SMTP port field and select Save - it is saved with no validation error`, async () => {
      await view.setText('smtpPort', d.port);
      const s = await view.save();
      messages = s.messages;
      expect.soft(refused(s), `the save should go through - ${s.said}`).toBe(false);
      expect.soft(s.messages, `no validation error - ${s.said}`).not.toMatch(MESSAGE.validation);
      expect((await notificationSettingsGuard.current())[FIELD_KEY.smtpPort], `stored - ${s.said}`).toBe(d.port);
    });

    await steps.step('Observe the confirmation message - the success message is displayed', async () => {
      expect(messages, 'the confirmation shown after the save').toContain(MESSAGE.updatedEn);
    });
  });

  test(`TC-${CASES.passwordHidden.azureId}: should show no SMTP password value or field on the settings screen or in the Edit drawer`, async ({ steps, page, notificationSettingsGuard }) => {
    const view = new NotificationSettingsView(page);

    await steps.critical('Navigate to the Notification Center Management module - the module home page is displayed', async () => {
      await view.openHub();
      await expect(view.editButton(), 'the Edit button of the settings').toBeVisible();
    });

    await steps.step('Open the SMS & Mail provider section - the SMTP settings are displayed without any password value or field', async () => {
      const text = await view.readViewSection(SMTP_SECTION, SMTP_SECTION_END);
      const smtpKeys = (await readAllSettings(page)).map((r) => r.key).filter((k) => k.startsWith(`${SMTP_SECTION}.`));
      expect.soft(text, 'the SMTP section').toContain(SMTP_SECTION);
      for (const label of SMTP_LABELS) expect.soft(text, `the "${label}" value`).toContain(label);
      expect.soft(smtpKeys.filter((k) => PASSWORD_WORD.test(k)), 'SMTP keys naming a password (key names only)').toEqual([]);
      expect(PASSWORD_WORD.test(text), 'a password label on the settings screen').toBe(false);
    });

    await steps.step('Open the Edit drawer - it shows editable server, port, user and From email, with no password field present or editable', async () => {
      await view.openEdit();
      for (const key of SMTP_FIELDS) await expect.soft(view.field(key), `${key} is editable`).toBeEditable();
      const pw = await view.passwordControls();
      await view.cancelIfOpen();
      expect.soft(await notificationSettingsGuard.current(), 'nothing changed').toEqual(notificationSettingsGuard.original);
      expect(pw, 'password controls in the drawer (ids / password inputs)').toEqual({ ids: [], passwordInputs: 0 });
    });
  });

  test(`TC-${CASES.cancelDiscards.azureId}: should keep the saved SMTP values when the edit is cancelled`, async ({ steps, page, notificationSettingsGuard }) => {
    const view = new NotificationSettingsView(page);
    const d = CASES.cancelDiscards;
    const original = notificationSettingsGuard.original;

    await steps.critical('Navigate to the Notification Center Management module - the module home page is displayed', async () => {
      await view.openHub();
      await expect(view.editButton(), 'the Edit button of the settings').toBeVisible();
    });

    await steps.step('Open the SMS & Mail provider section and select Edit - the SMTP settings drawer opens with the current values', async () => {
      await view.openEdit();
      await expect.soft(view.field('smtpServer'), 'SMTP server').toHaveValue(original[FIELD_KEY.smtpServer]);
      await expect(view.field('smtpFromEmail'), 'From email').toHaveValue(original[FIELD_KEY.smtpFromEmail]);
    });

    await steps.step('Modify several fields without saving, then cancel the drawer - it closes without a success message', async () => {
      await view.setText('smtpFromEmail', d.fromEmail);
      await view.setText('smtpPort', d.port);
      await view.setText('smtpServer', d.server);
      await view.setText('smtpUser', d.user);
      await view.cancel();
      expect.soft(await view.hub.readToast(1_500), 'a message after Cancel').toBe('');
      await expect(view.drawerTitle(), 'the drawer').toBeHidden();
    });

    await steps.step('Reopen the SMS & Mail provider section - the original, unmodified values are still displayed', async () => {
      await view.openEdit();
      expect.soft(await notificationSettingsGuard.current(), 'the stored values').toEqual(original);
      expect({
        fromEmail: await view.value('smtpFromEmail'),
        port: await view.value('smtpPort'),
        server: await view.value('smtpServer'),
        user: await view.value('smtpUser'),
      }, 'the drawer opened again').toEqual({
        fromEmail: original[FIELD_KEY.smtpFromEmail],
        port: original[FIELD_KEY.smtpPort],
        server: original[FIELD_KEY.smtpServer],
        user: original[FIELD_KEY.smtpUser],
      });
      await view.cancelIfOpen();
    });
  });

  test(`TC-${CASES.invalidFromEmail.azureId}: should save a malformed From email without an error and keep the drawer usable`, async ({ steps, page, notificationSettingsGuard }) => {
    const view = new NotificationSettingsView(page);
    const d = CASES.invalidFromEmail;
    let messages = '';

    await steps.critical('Navigate to the Notification Center Management module - the module home page is displayed', async () => {
      await view.openHub();
      await expect(view.editButton(), 'the Edit button of the settings').toBeVisible();
    });

    await steps.step('Open the SMS & Mail provider section and select Edit - the SMTP settings drawer opens', async () => {
      await view.openEdit();
      await expect(view.field('smtpFromEmail'), 'From email').toBeEditable();
    });

    await steps.step(`Enter "${d.fromEmail}" into From email and select Save - it is accepted and saved without an application error`, async () => {
      await view.setText('smtpFromEmail', d.fromEmail);
      const s = await view.save();
      messages = s.messages;
      expect.soft(refused(s), `the save should go through - ${s.said}`).toBe(false);
      expect.soft(s.messages, `no error - ${s.said}`).not.toMatch(MESSAGE.validation);
      expect((await notificationSettingsGuard.current())[FIELD_KEY.smtpFromEmail], `stored - ${s.said}`).toBe(d.fromEmail);
    });

    await steps.step('Observe the confirmation message - the success message is displayed and the drawer still works', async () => {
      await view.openEdit();
      await expect.soft(view.field('smtpFromEmail'), 'the drawer opens again with the saved value').toHaveValue(d.fromEmail);
      await view.cancelIfOpen();
      expect(messages, 'the confirmation shown after the save').toContain(MESSAGE.updatedEn);
    });
  });
});
