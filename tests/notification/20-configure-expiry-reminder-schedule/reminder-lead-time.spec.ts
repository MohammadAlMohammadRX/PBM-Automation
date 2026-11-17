import { test, expect } from '../../../fixtures';
import {
  FIELD_KEY,
  NotificationSettingsView,
  REMIND_EVERY_KEY,
  blockUnlessDefaults,
  changedKeys,
  refused,
  refusedOrPrevented,
} from '../../../utils/notification/writerBHelpers';
import { CASES, MESSAGE, NOT_DEFAULT_BLOCKED, SCHEDULE_STORY } from '../../../data/notification/configureExpiryReminderSchedule.data';

/**
 * US 21006 - Configure Expiry Reminder Schedule: Reminder Before (Days) - its
 * default, range, required entry, whole numbers and the helper line. Every case
 * holds notificationSettingsGuard (restore + read-back at teardown).
 */
test.describe(`US ${SCHEDULE_STORY.id} - ${SCHEDULE_STORY.title}`, () => {
  test.describe.configure({ timeout: 4 * 60_000 });

  const reminderKey = FIELD_KEY.reminderBeforeDays;

  test(`TC-${CASES.defaults.azureId}: should show Reminder Before 7 and Remind Every "Every day" when no custom schedule was configured`, async ({ steps, page, notificationSettingsGuard }) => {
    const view = new NotificationSettingsView(page);
    const d = CASES.defaults;

    await steps.critical('Navigate to the Notification Center Management module - the module home page is displayed', async () => {
      blockUnlessDefaults(steps, notificationSettingsGuard.original, d, NOT_DEFAULT_BLOCKED);
      await view.openHub();
      await expect(view.editButton(), 'the Edit button of the settings').toBeVisible();
    });

    await steps.step('Open the Notifications & Announcements Archiving settings section - it shows the Reminder Before (Days) and Remind Every fields', async () => {
      await view.openEdit();
      await expect.soft(view.field('reminderBeforeDays'), 'Reminder Before (Days)').toBeVisible();
      await expect(view.field('remindEverySelect'), 'Remind Every').toBeVisible();
    });

    await steps.step(`Review the pre-populated values - Reminder Before (Days) shows ${d.reminderBefore} and Remind Every shows "${d.remindEvery}"`, async () => {
      expect({ reminderBefore: await view.value('reminderBeforeDays'), remindEvery: await view.remindEvery() }, 'the pre-populated values')
        .toEqual({ reminderBefore: d.reminderBefore, remindEvery: d.remindEvery });
    });
  });

  test(`TC-${CASES.maxValue.azureId}: should accept and save the maximum Reminder Before of 365 days`, async ({ steps, page, notificationSettingsGuard }) => {
    const view = new NotificationSettingsView(page);
    const d = CASES.maxValue;

    await steps.critical('Navigate to the Notification Center Management module - the module home page is displayed', async () => {
      await view.openHub();
      await expect(view.editButton(), 'the Edit button of the settings').toBeVisible();
    });

    await steps.step('Open the Notifications & Announcements Archiving settings section - the section loads', async () => {
      await view.openEdit();
      await expect(view.field('reminderBeforeDays'), 'Reminder Before (Days)').toBeVisible();
    });

    await steps.step(`Enter ${d.value} in the Reminder Before (Days) field - the field accepts the value`, async () => {
      await view.typeNumber('reminderBeforeDays', d.value);
      expect(await view.value('reminderBeforeDays'), 'the field').toBe(d.value);
    });

    await steps.step('Save the settings - a success confirmation is shown', async () => {
      const s = await view.save();
      expect.soft(s.messages, s.said).toContain(MESSAGE.updated);
      expect((await notificationSettingsGuard.current())[reminderKey], `stored - ${s.said}`).toBe(d.value);
    });
  });

  test(`TC-${CASES.aboveMax.azureId}: should reject a Reminder Before above 365 with a validation error and save nothing`, async ({ steps, page, notificationSettingsGuard }) => {
    const view = new NotificationSettingsView(page);
    const d = CASES.aboveMax;

    await steps.critical('Navigate to the Notification Center Management module - the module home page is displayed', async () => {
      await view.openHub();
      await expect(view.editButton(), 'the Edit button of the settings').toBeVisible();
    });

    await steps.step('Open the Notifications & Announcements Archiving settings section - the section loads', async () => {
      await view.openEdit();
      await expect(view.field('reminderBeforeDays'), 'Reminder Before (Days)').toBeVisible();
    });

    await steps.step(`Enter ${d.value} in the Reminder Before (Days) field and attempt to save - the value is rejected with a validation error and not saved`, async () => {
      const s = await view.attemptNumber('reminderBeforeDays', d.value);
      expect.soft(await changedKeys(notificationSettingsGuard, [reminderKey]), `stored afterwards - ${s.said}`).toEqual([]);
      expect.soft(refused(s), `the save should be refused - ${s.said}`).toBe(true);
      expect(s.messages, `a validation error - ${s.said}`).toMatch(MESSAGE.validation);
    });
  });

  test(`TC-${CASES.negative.azureId}: should reject a negative Reminder Before with a validation error and save nothing`, async ({ steps, page, notificationSettingsGuard }) => {
    const view = new NotificationSettingsView(page);
    const d = CASES.negative;

    await steps.critical('Navigate to the Notification Center Management module - the module home page is displayed', async () => {
      await view.openHub();
      await expect(view.editButton(), 'the Edit button of the settings').toBeVisible();
    });

    await steps.step('Open the Notifications & Announcements Archiving settings section - the section loads', async () => {
      await view.openEdit();
      await expect(view.field('reminderBeforeDays'), 'Reminder Before (Days)').toBeVisible();
    });

    await steps.step(`Enter ${d.value} in the Reminder Before (Days) field and attempt to save - the value is rejected with a validation error and not saved`, async () => {
      const s = await view.attemptNumber('reminderBeforeDays', d.value);
      expect.soft(await changedKeys(notificationSettingsGuard, [reminderKey]), `stored afterwards - ${s.said}`).toEqual([]);
      expect.soft(refused(s), `the save should be refused - ${s.said}`).toBe(true);
      expect(s.messages, `a validation error - ${s.said}`).toMatch(MESSAGE.validation);
    });
  });

  test(`TC-${CASES.zero.azureId}: should accept 0 days, update the helper line and save it`, async ({ steps, page, notificationSettingsGuard }) => {
    const view = new NotificationSettingsView(page);
    const d = CASES.zero;

    await steps.critical('Navigate to the Notification Center Management module - the module home page is displayed', async () => {
      await view.openHub();
      await expect(view.editButton(), 'the Edit button of the settings').toBeVisible();
    });

    await steps.step('Open the Notifications & Announcements Archiving settings section - the section loads', async () => {
      await view.openEdit();
      await expect(view.field('reminderBeforeDays'), 'Reminder Before (Days)').toBeVisible();
    });

    await steps.step(`Enter ${d.value} in the Reminder Before (Days) field - the field accepts it and the helper message updates`, async () => {
      await view.typeNumber('reminderBeforeDays', d.value);
      expect.soft(await view.value('reminderBeforeDays'), 'the field').toBe(d.value);
      expect(await view.reminderHint(), 'the helper message').toBe(MESSAGE.hintOffEn);
    });

    await steps.step('Save the settings - a success confirmation is shown', async () => {
      const s = await view.save();
      expect.soft(s.messages, s.said).toContain(MESSAGE.updated);
      expect((await notificationSettingsGuard.current())[reminderKey], `stored - ${s.said}`).toBe(d.value);
    });
  });

  test(`TC-${CASES.nonNumeric.azureId}: should reject non-numeric text as the Reminder Before and save nothing`, async ({ steps, page, notificationSettingsGuard }) => {
    const view = new NotificationSettingsView(page);
    const d = CASES.nonNumeric;

    await steps.critical('Navigate to the Notification Center Management module - the module home page is displayed', async () => {
      await view.openHub();
      await expect(view.editButton(), 'the Edit button of the settings').toBeVisible();
    });

    await steps.step('Open the Notifications & Announcements Archiving settings section - the section loads', async () => {
      await view.openEdit();
      await expect(view.field('reminderBeforeDays'), 'Reminder Before (Days)').toBeVisible();
    });

    await steps.step(`Enter "${d.value}" in the Reminder Before (Days) field and attempt to save - the input is rejected with a validation error and not saved`, async () => {
      const s = await view.attemptNumber('reminderBeforeDays', d.value);
      expect.soft(await changedKeys(notificationSettingsGuard, [reminderKey]), `stored afterwards - ${s.said}`).toEqual([]);
      expect(refusedOrPrevented(s, MESSAGE.validation), `refused with a validation error or never let through - ${s.said}`).toBe(true);
    });
  });

  test(`TC-${CASES.blank.azureId}: should require a Reminder Before value before saving`, async ({ steps, page, notificationSettingsGuard }) => {
    const view = new NotificationSettingsView(page);

    await steps.critical('Navigate to the Notification Center Management module - the module home page is displayed', async () => {
      await view.openHub();
      await expect(view.editButton(), 'the Edit button of the settings').toBeVisible();
    });

    await steps.step('Open the Notifications & Announcements Archiving settings section - the section loads', async () => {
      await view.openEdit();
      await expect(view.field('reminderBeforeDays'), 'Reminder Before (Days)').toBeVisible();
    });

    await steps.step('Clear the Reminder Before (Days) field and attempt to save - a mandatory-field validation error shows and nothing is saved', async () => {
      const s = await view.attemptNumber('reminderBeforeDays', '');
      expect.soft(await changedKeys(notificationSettingsGuard, [reminderKey, REMIND_EVERY_KEY]), `stored afterwards - ${s.said}`).toEqual([]);
      expect.soft(refused(s), `the save should be refused - ${s.said}`).toBe(true);
      expect(s.messages, `a mandatory-field error - ${s.said}`).toMatch(MESSAGE.validation);
    });
  });

  test(`TC-${CASES.fraction.azureId}: should reject a fractional Reminder Before and require a whole number`, async ({ steps, page, notificationSettingsGuard }) => {
    const view = new NotificationSettingsView(page);
    const d = CASES.fraction;

    await steps.critical('Navigate to the Notification Center Management module - the module home page is displayed', async () => {
      await view.openHub();
      await expect(view.editButton(), 'the Edit button of the settings').toBeVisible();
    });

    await steps.step('Open the Notifications & Announcements Archiving settings section - the section loads', async () => {
      await view.openEdit();
      await expect(view.field('reminderBeforeDays'), 'Reminder Before (Days)').toBeVisible();
    });

    await steps.step(`Enter ${d.value} in the Reminder Before (Days) field and attempt to save - the decimal is rejected with a whole-number validation error`, async () => {
      const s = await view.attemptNumber('reminderBeforeDays', d.value);
      expect.soft(await changedKeys(notificationSettingsGuard, [reminderKey]), `stored afterwards - ${s.said}`).toEqual([]);
      expect(refusedOrPrevented(s, MESSAGE.validation), `refused with a validation error or never let through - ${s.said}`).toBe(true);
    });
  });

  test(`TC-${CASES.hintLive.azureId}: should update the helper line at once for 0 and show it in Arabic too`, async ({ steps, page, notificationSettingsGuard }) => {
    const view = new NotificationSettingsView(page);
    const d = CASES.hintLive;

    await steps.critical('Navigate to the Notification Center Management module - the module home page is displayed', async () => {
      await view.openHub();
      await expect(view.editButton(), 'the Edit button of the settings').toBeVisible();
    });

    await steps.step('Open the Notifications & Announcements Archiving settings section - it loads with the helper message below Reminder Before (Days)', async () => {
      await view.openEdit();
      await expect(view.field('reminderBeforeHint'), 'the helper message').toBeVisible();
    });

    await steps.step(`Change Reminder Before (Days) to ${d.value} without saving - the helper message reads "${MESSAGE.hintOffEn}"`, async () => {
      await view.typeNumber('reminderBeforeDays', d.value);
      expect(await view.reminderHint(), 'the helper message').toBe(MESSAGE.hintOffEn);
    });

    await steps.step(`Switch the application language to Arabic and reload the section - the helper message reads "${MESSAGE.hintOffAr}"`, async () => {
      await view.switchLanguage('ar');
      await view.openEdit();
      await view.typeNumber('reminderBeforeDays', d.value);
      const arabic = await view.reminderHint();
      await view.switchLanguage('en');
      expect.soft(await changedKeys(notificationSettingsGuard, [FIELD_KEY.reminderBeforeDays]), 'nothing saved').toEqual([]);
      expect(arabic, 'the helper message in Arabic').toBe(MESSAGE.hintOffAr);
    });

    // Back to English even when a step stopped early (no-op when already English).
    await view.switchLanguage('en');
  });
});
