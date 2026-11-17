import { test, expect } from '../../../fixtures';
import {
  FIELD_KEY,
  NotificationSettingsView,
  REMIND_EVERY_KEY,
  awaitExpiringSoon,
  blockIfAnyMissing,
  blockWhen,
  expiringRecords,
  expiringSoonDefinition,
  expiringSoonReport,
  networkJobWithoutReminder,
  networkReminderControl,
  refused,
  type ExpiringRecord,
} from '../../../utils/notification/writerBHelpers';
import { ARCHIVING_STORY, CASES, LABEL, MESSAGE, NO_RECORD_BLOCKED, REMINDERS_NOT_ACTIVE, REMINDER_CONTROL_IDS } from '../../../data/notification/editNotificationArchivingAndExpiryReminders.data';

/**
 * US 20868 - Edit Notification Archiving and Expiry Reminders: the schedule's
 * effect on real "Expiring Soon" notifications (AUTO_JOB). The settings are
 * guarded; the lifecycle jobs move only through jobClock (restored + read
 * back); records are the suite's own or only READ; the app notifications are
 * the suite's own (careconnect only) and deleted at teardown.
 */
test.describe(`US ${ARCHIVING_STORY.id} - ${ARCHIVING_STORY.title}`, () => {
  test.describe.configure({ timeout: 35 * 60_000 });

  test(`TC-${CASES.zeroSwitchesOff.azureId}: should send no expiry reminder for any record once Reminder before is set to 0`, async ({ steps, page, notificationSettingsGuard, suiteDefinitions, jobClock, publishPayer, policyIn }) => {
    const view = new NotificationSettingsView(page);
    const d = CASES.zeroSwitchesOff;
    const make = { publishPayer, policyIn };
    let records: ExpiringRecord[] = [];
    let definition = { id: '', name: '' };

    await steps.critical(`Precondition: Reminder before is a non-zero value other than 7 (${d.precondition}) and expiry reminders are active - a network expiring in ${d.expiresInDays} days gets its "Expiring Soon" notification`, async () => {
      const answer = await notificationSettingsGuard.set({ [FIELD_KEY.reminderBeforeDays]: d.precondition });
      expect(answer.status, `UpsertSystemSettings ${answer.text.slice(0, 160)}`).toBeLessThan(300);
      const control = await expiringRecords(page, ['network'], d.expiresInDays, make);
      blockIfAnyMissing(steps, control, NO_RECORD_BLOCKED);
      definition = await expiringSoonDefinition(page, suiteDefinitions, 'network');
      const seen = await networkReminderControl(page, jobClock, control[0], definition);
      blockWhen(steps, seen.notification === null, REMINDERS_NOT_ACTIVE(d.precondition, seen.firings, seen.status));
      expect(seen.notification?.type, `the control reminder for "${control[0].name}"`).toBe(definition.name);
    });

    await steps.critical('Navigate to the Notification Center Management module - the module landing page loads', async () => {
      await view.openHub();
      await expect(view.editButton(), 'the Edit button of the settings').toBeVisible();
    });

    await steps.step(`Set Reminder before to ${d.seven} and click Save - "${MESSAGE.updated}" is shown and the read-back line reads "${MESSAGE.hint(d.seven)}"`, async () => {
      const s = await view.attemptNumber('reminderBeforeDays', d.seven);
      expect.soft(s.messages, s.said).toContain(MESSAGE.updated);
      await view.openEdit();
      expect.soft(await view.reminderHint(), 'the line under Reminder before').toBe(MESSAGE.hint(d.seven));
      expect((await notificationSettingsGuard.current())[FIELD_KEY.reminderBeforeDays], 'stored').toBe(d.seven);
    });

    await steps.step(`Change Reminder before to ${d.zero} and click Save - "${MESSAGE.updated}" is shown and the line reads "${MESSAGE.hintOff}"`, async () => {
      const s = await view.attemptNumber('reminderBeforeDays', d.zero);
      expect.soft(s.messages, s.said).toContain(MESSAGE.updated);
      await view.openEdit();
      expect.soft(await view.reminderHint(), 'the line under Reminder before').toBe(MESSAGE.hintOff);
      await view.cancelIfOpen();
      expect((await notificationSettingsGuard.current())[FIELD_KEY.reminderBeforeDays], 'stored').toBe(d.zero);
    });

    await steps.step('Check a record approaching its end date for expiry reminders - no expiry reminder is generated while Reminder before is 0', async () => {
      records = await expiringRecords(page, ['network'], d.expiresInDays, make);
      blockIfAnyMissing(steps, records, NO_RECORD_BLOCKED);
      const run = await networkJobWithoutReminder(page, jobClock, records[0], definition);
      expect.soft(run.jobRan, `the network job ran (fires ${run.firesAt}); the network reads "${run.status}"`).toBe(true);
      expect(run.items.map((n) => `${n.type}: ${n.englishMessage}`), `new "${definition.name}" notifications after the job (record "${records[0].name}" or the control)`).toEqual([]);
    });
  });

  test(`TC-${CASES.oneSchedule.azureId}: should offer one global reminder schedule and apply it to every kind of record`, async ({ steps, page, notificationSettingsGuard, suiteDefinitions, jobClock, publishPayer, policyIn }) => {
    const view = new NotificationSettingsView(page);
    const d = CASES.oneSchedule;
    let records: ExpiringRecord[] = [];

    await steps.critical(`Precondition: records of several modules nearing expiry exist (${d.kinds.join(', ')} - within ${d.withinDays} days)`, async () => {
      records = await expiringRecords(page, d.kinds, d.withinDays, { publishPayer, policyIn });
      blockIfAnyMissing(steps, records, NO_RECORD_BLOCKED);
      expect(records.map((r) => r.kind), 'one record per kind').toEqual([...d.kinds]);
    });

    await steps.critical('Navigate to the Notification Center Management module - the module landing page loads', async () => {
      await view.openHub();
      await expect(view.editButton(), 'the Edit button of the settings').toBeVisible();
    });

    await steps.step('Explore the settings screen for module- or payer-specific schedule options - none exist, only one global schedule', async () => {
      expect.soft({ reminderBefore: await view.labelCount(LABEL.reminderBefore), remindEvery: await view.labelCount(LABEL.remindEvery) }, 'schedule labels in the read view').toEqual({ reminderBefore: 1, remindEvery: 1 });
      await view.openEdit();
      expect([...(await view.reminderControlIds())].sort(), 'the reminder controls in the Edit drawer').toEqual([...REMINDER_CONTROL_IDS].sort());
    });

    await steps.step(`Save Reminder before ${d.reminderBefore} / Remind every ${d.remindEvery} and check reminder behaviour across the modules - the same schedule applies to all of them`, async () => {
      await view.chooseRemindEvery(d.remindEvery);
      const s = await view.attemptNumber('reminderBeforeDays', d.reminderBefore);
      expect.soft(refused(s), `the save should go through - ${s.said}`).toBe(false);
      const stored = await notificationSettingsGuard.current();
      expect.soft([stored[FIELD_KEY.reminderBeforeDays], stored[REMIND_EVERY_KEY]], 'the stored schedule').toEqual([d.reminderBefore, d.remindEveryStored]);
      const runs = [];
      for (const record of records) runs.push({ record, definition: await expiringSoonDefinition(page, suiteDefinitions, record.kind) });
      const results = await awaitExpiringSoon(page, jobClock, runs);
      // Plain words per kind (record, expiry, job firing, arrival) - no JSON, which the failure narrator cuts off.
      const report = expiringSoonReport(d.kinds, records, results);
      expect(report.notArrived, `kinds without an Expiring Soon notification - per kind: ${report.summary}`).toEqual([]);
    });
  });
});
