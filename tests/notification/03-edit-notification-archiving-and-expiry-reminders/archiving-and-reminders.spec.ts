import { test, expect } from '../../../fixtures';
import {
  FIELD_KEY,
  NotificationSettingsView,
  REMIND_EVERY_KEY,
  changedKeys,
  rawUpsert,
  refused,
  refusedOrPrevented,
} from '../../../utils/notification/writerBHelpers';
import { ARCHIVING_STORY, CASES, LABEL, MESSAGE, REMIND_EVERY_MESSAGE, REMIND_EVERY_OPTIONS } from '../../../data/notification/editNotificationArchivingAndExpiryReminders.data';

/**
 * US 20868 - Edit Notification Archiving and Expiry Reminders: the values,
 * ranges and required fields of the section in System Settings > General >
 * Edit Setting. Every case holds notificationSettingsGuard: whatever a save
 * stores is restored and read back at teardown. "Nothing stored" is checked
 * against the guarded keys before / after the attempt.
 */
test.describe(`US ${ARCHIVING_STORY.id} - ${ARCHIVING_STORY.title}`, () => {
  test.describe.configure({ timeout: 4 * 60_000 });

  const reminderKey = FIELD_KEY.reminderBeforeDays;

  test(`TC-${CASES.validCustom.azureId}: should save and keep custom archiving and reminder values after a reload`, async ({ steps, page, notificationSettingsGuard }) => {
    const view = new NotificationSettingsView(page);
    const d = CASES.validCustom;
    const original = notificationSettingsGuard.original;

    await steps.critical('Navigate to the Notification Center Management module - the module landing page loads', async () => {
      await view.openHub();
      await expect(view.editButton(), 'the Edit button of the settings').toBeVisible();
    });

    await steps.step('Open the Notice Archiving and Expiry Reminders settings screen - the current settings are displayed', async () => {
      await view.openEdit();
      await expect.soft(view.field('autoArchiveAnnouncements'), 'Auto-archive announcements').toHaveValue(original[FIELD_KEY.autoArchiveAnnouncements]);
      await expect.soft(view.field('autoArchiveNotifications'), 'Auto-archive notifications').toHaveValue(original[FIELD_KEY.autoArchiveNotifications]);
      await expect(view.field('reminderBeforeDays'), 'Reminder before').toHaveValue(original[reminderKey]);
    });

    await steps.step(`Enter ${d.announcements} / ${d.notifications} / ${d.reminderBefore} and select ${d.remindEvery} - the entered values display in their fields`, async () => {
      await view.typeNumber('autoArchiveAnnouncements', d.announcements);
      await view.typeNumber('autoArchiveNotifications', d.notifications);
      await view.typeNumber('reminderBeforeDays', d.reminderBefore);
      await view.chooseRemindEvery(d.remindEvery);
      expect({
        announcements: await view.value('autoArchiveAnnouncements'),
        notifications: await view.value('autoArchiveNotifications'),
        reminderBefore: await view.value('reminderBeforeDays'),
        remindEvery: await view.remindEvery(),
      }, 'what the fields show').toEqual({ announcements: d.announcements, notifications: d.notifications, reminderBefore: d.reminderBefore, remindEvery: d.remindEvery });
    });

    await steps.step(`Click Save - "${MESSAGE.updated}" is displayed`, async () => {
      const s = await view.save();
      expect.soft(refused(s), `the save should go through - ${s.said}`).toBe(false);
      expect(s.messages, s.said).toContain(MESSAGE.updated);
    });

    await steps.step('Reload the settings screen - the newly saved values are retained', async () => {
      await view.openHub();
      expect.soft({
        announcements: await view.readView(LABEL.announcements),
        notifications: await view.readView(LABEL.notifications),
        reminderBefore: await view.readView(LABEL.reminderBefore),
        remindEvery: await view.readView(LABEL.remindEvery),
      }, 'the read view after the reload').toEqual({ announcements: d.announcements, notifications: d.notifications, reminderBefore: d.reminderBefore, remindEvery: d.remindEvery });
      const stored = await notificationSettingsGuard.current();
      expect([stored[FIELD_KEY.autoArchiveAnnouncements], stored[FIELD_KEY.autoArchiveNotifications], stored[reminderKey], stored[REMIND_EVERY_KEY]], 'the stored values')
        .toEqual([d.announcements, d.notifications, d.reminderBefore, d.remindEveryStored]);
    });
  });

  test(`TC-${CASES.reminderRange.azureId}: should accept Reminder before 0 and 365 and refuse -1 and 366 with the bilingual range message`, async ({ steps, page, notificationSettingsGuard }) => {
    const view = new NotificationSettingsView(page);
    const d = CASES.reminderRange;

    await steps.critical('Navigate to the Notification Center Management module - the module landing page loads', async () => {
      await view.openHub();
      await expect(view.editButton(), 'the Edit button of the settings').toBeVisible();
    });

    // Each language attempt starts from the ORIGINAL stored value (restoreAndReload): when the English attempt
    // stored something (run 2026-11-12: -1 became 1 and saved), the Arabic attempt would otherwise send nothing
    // and show nothing - a different situation from the one the step describes.
    await steps.step(`Enter ${d.below} in Reminder before and click Save - the save is refused with "${MESSAGE.reminderRangeEn}" / "${MESSAGE.reminderRangeAr}"`, async () => {
      const before = await notificationSettingsGuard.current();
      const en = await view.attemptNumber('reminderBeforeDays', d.below);
      expect.soft(refused(en), `the save should be refused - ${en.said}`).toBe(true);
      expect.soft(await notificationSettingsGuard.current(), `nothing stored - ${en.said}`).toEqual(before);
      expect.soft(en.messages, `English message - ${en.said}`).toContain(MESSAGE.reminderRangeEn);
      await view.restoreAndReload(notificationSettingsGuard);
      await view.switchLanguage('ar');
      const ar = await view.attemptNumber('reminderBeforeDays', d.below);
      await view.switchLanguage('en');
      expect(ar.messages, `Arabic message - ${ar.said} (English attempt: ${en.said.slice(0, 220)})`).toContain(MESSAGE.reminderRangeAr);
    });

    await steps.step(`Enter ${d.min} in Reminder before and click Save - the minimum is accepted and "${MESSAGE.updated}" is shown`, async () => {
      const s = await view.attemptNumber('reminderBeforeDays', d.min);
      expect.soft(s.messages, s.said).toContain(MESSAGE.updated);
      expect((await notificationSettingsGuard.current())[reminderKey], `stored - ${s.said}`).toBe(d.min);
    });

    await steps.step(`Enter ${d.max} in Reminder before and click Save - the maximum is accepted and "${MESSAGE.updated}" is shown`, async () => {
      const s = await view.attemptNumber('reminderBeforeDays', d.max);
      expect.soft(s.messages, s.said).toContain(MESSAGE.updated);
      expect((await notificationSettingsGuard.current())[reminderKey], `stored - ${s.said}`).toBe(d.max);
    });

    // From the ORIGINAL stored value again: step 4 left 365 stored, so a box that turns 366 into 365 would send
    // nothing and hide whether the app clamps and SAVES a different value (run 2026-11-12).
    await steps.step(`Enter ${d.above} in Reminder before and click Save - the save is refused with the same bilingual out-of-range message`, async () => {
      await view.restoreAndReload(notificationSettingsGuard);
      const before = await notificationSettingsGuard.current();
      const en = await view.attemptNumber('reminderBeforeDays', d.above);
      expect.soft(refused(en), `the save should be refused - ${en.said}`).toBe(true);
      expect.soft(await notificationSettingsGuard.current(), `nothing stored - ${en.said}`).toEqual(before);
      expect.soft(en.messages, `English message - ${en.said}`).toContain(MESSAGE.reminderRangeEn);
      await view.restoreAndReload(notificationSettingsGuard);
      await view.switchLanguage('ar');
      const ar = await view.attemptNumber('reminderBeforeDays', d.above);
      await view.switchLanguage('en');
      expect(ar.messages, `Arabic message - ${ar.said} (English attempt: ${en.said.slice(0, 220)})`).toContain(MESSAGE.reminderRangeAr);
    });

    // Back to English even when a step stopped early (no-op when already English).
    await view.switchLanguage('en');
  });

  test(`TC-${CASES.fourCadences.azureId}: should offer exactly the four cadences and save and keep each one`, async ({ steps, page, notificationSettingsGuard }) => {
    const view = new NotificationSettingsView(page);
    const d = CASES.fourCadences;
    const [first, ...rest] = d.saves;

    await steps.critical('Navigate to the Notification Center Management module - the module landing page loads', async () => {
      await view.openHub();
      await expect(view.editButton(), 'the Edit button of the settings').toBeVisible();
    });

    await steps.step('Open the Remind every drop-down - only Every day, Every two days, Every three days and Every week are listed', async () => {
      await view.openEdit();
      expect(await view.remindEveryOptions(), 'the Remind every options').toEqual([...REMIND_EVERY_OPTIONS]);
    });

    await steps.step(`Select ${first.label} and click Save - "${MESSAGE.updated}" is shown and the value persists on reload`, async () => {
      const s = await view.attemptRemindEvery(first.label);
      expect.soft(s.messages, s.said).toContain(MESSAGE.updated);
      await view.openHub();
      expect.soft(await view.readView(LABEL.remindEvery), 'the read view after the reload').toBe(first.label);
      expect((await notificationSettingsGuard.current())[REMIND_EVERY_KEY], 'stored').toBe(first.stored);
    });

    await steps.step(`Repeat for ${rest.map((r) => r.label).join(' and ')} in turn - each selection saves and persists`, async () => {
      const seen: { label: string; toast: boolean; shown: string; stored: string }[] = [];
      for (const r of rest) {
        const s = await view.attemptRemindEvery(r.label);
        await view.openHub();
        seen.push({ label: r.label, toast: s.messages.includes(MESSAGE.updated), shown: await view.readView(LABEL.remindEvery), stored: (await notificationSettingsGuard.current())[REMIND_EVERY_KEY] });
      }
      expect(seen, 'each cadence: toast, read view after reload, stored').toEqual(rest.map((r) => ({ label: r.label, toast: true, shown: r.label, stored: r.stored })));
    });
  });

  test(`TC-${CASES.invalidCadenceRaw.azureId}: should refuse a Remind every value other than 1, 2, 3 or 7 sent outside the drop-down with the bilingual message`, async ({ steps, page, notificationSettingsGuard }) => {
    const view = new NotificationSettingsView(page);
    const d = CASES.invalidCadenceRaw;

    await steps.critical('Navigate to the Notification Center Management module - the module landing page loads', async () => {
      await view.openHub();
      await expect(view.editButton(), 'the Edit button of the settings').toBeVisible();
    });

    await steps.step(`Submit a save request with Remind every ${d.values.join(' / ')} bypassing the drop-down - refused with "${MESSAGE.remindEveryEn}" / "${MESSAGE.remindEveryAr}"`, async () => {
      const seen: { value: string; lang: 'en' | 'ar'; status: number; reasons: string }[] = [];
      for (const value of d.values) {
        for (const lang of ['en', 'ar'] as const) {
          const a = await rawUpsert(page, notificationSettingsGuard, [{ key: REMIND_EVERY_KEY, value }], lang);
          seen.push({ value, lang, status: a.status, reasons: a.reasons.join(' | ') });
        }
      }
      expect.soft(await changedKeys(notificationSettingsGuard, [REMIND_EVERY_KEY]), 'Remind every stored afterwards').toEqual([]);
      expect.soft(seen.filter((s) => s.status < 400), 'values the server accepted').toEqual([]);
      expect(seen.map((s) => ({ value: s.value, lang: s.lang, quoted: s.reasons.includes(REMIND_EVERY_MESSAGE[s.lang]) })), `answers: ${JSON.stringify(seen)}`)
        .toEqual(seen.map((s) => ({ value: s.value, lang: s.lang, quoted: true })));
    });
  });

  test(`TC-${CASES.wholeNumbers.azureId}: should refuse a decimal and a non-numeric Reminder before with the whole-number message`, async ({ steps, page, notificationSettingsGuard }) => {
    const view = new NotificationSettingsView(page);
    const d = CASES.wholeNumbers;

    await steps.critical('Navigate to the Notification Center Management module - the module landing page loads', async () => {
      await view.openHub();
      await expect(view.editButton(), 'the Edit button of the settings').toBeVisible();
    });

    await steps.step(`Enter ${d.decimal} in Reminder before and click Save - the save is refused with the whole-number message`, async () => {
      const s = await view.attemptNumber('reminderBeforeDays', d.decimal);
      expect.soft(await changedKeys(notificationSettingsGuard, [reminderKey]), `stored afterwards - ${s.said}`).toEqual([]);
      expect(refusedOrPrevented(s, MESSAGE.reminderRangeEn), `refused with "${MESSAGE.reminderRangeEn}" or never let through - ${s.said}`).toBe(true);
    });

    // From the ORIGINAL stored value: whatever step 2 stored (run 2026-11-12: 75) must not count against this step.
    await steps.step(`Clear the field, enter "${d.text}" and click Save - the save is refused with the same whole-number message`, async () => {
      await view.restoreAndReload(notificationSettingsGuard);
      const s = await view.attemptNumber('reminderBeforeDays', d.text);
      expect.soft(await changedKeys(notificationSettingsGuard, [reminderKey]), `stored afterwards - ${s.said}`).toEqual([]);
      expect(refusedOrPrevented(s, MESSAGE.reminderRangeEn), `refused with "${MESSAGE.reminderRangeEn}" or never let through - ${s.said}`).toBe(true);
    });
  });

  test(`TC-${CASES.announcementsBlank.azureId}: should block the save with a required-field message when Auto-archive announcements is blank`, async ({ steps, page, notificationSettingsGuard }) => {
    const view = new NotificationSettingsView(page);

    await steps.critical('Navigate to the Notification Center Management module - the module landing page loads', async () => {
      await view.openHub();
      await expect(view.editButton(), 'the Edit button of the settings').toBeVisible();
    });

    await steps.step('Clear the Auto-archive announcements field entirely and click Save - a required-field validation message is displayed and the save is blocked', async () => {
      const s = await view.attemptNumber('autoArchiveAnnouncements', '');
      expect.soft(refused(s), `the save should be blocked - ${s.said}`).toBe(true);
      expect.soft(s.outcome.drawerOpen, `the drawer stays open - ${s.said}`).toBe(true);
      expect.soft(await changedKeys(notificationSettingsGuard, [FIELD_KEY.autoArchiveAnnouncements]), 'stored afterwards').toEqual([]);
      expect(s.messages, `a required-field message - ${s.said}`).toMatch(MESSAGE.required);
    });
  });

  test(`TC-${CASES.notificationsBlank.azureId}: should block the save with a required-field message when Auto-archive notifications is blank`, async ({ steps, page, notificationSettingsGuard }) => {
    const view = new NotificationSettingsView(page);

    await steps.critical('Navigate to the Notification Center Management module - the module landing page loads', async () => {
      await view.openHub();
      await expect(view.editButton(), 'the Edit button of the settings').toBeVisible();
    });

    await steps.step('Clear the Auto-archive notifications field entirely and click Save - a required-field validation message is displayed and the save is blocked', async () => {
      const s = await view.attemptNumber('autoArchiveNotifications', '');
      expect.soft(refused(s), `the save should be blocked - ${s.said}`).toBe(true);
      expect.soft(s.outcome.drawerOpen, `the drawer stays open - ${s.said}`).toBe(true);
      expect.soft(await changedKeys(notificationSettingsGuard, [FIELD_KEY.autoArchiveNotifications]), 'stored afterwards').toEqual([]);
      expect(s.messages, `a required-field message - ${s.said}`).toMatch(MESSAGE.required);
    });
  });
});
