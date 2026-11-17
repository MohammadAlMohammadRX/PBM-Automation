import { test, expect } from '../../../fixtures';
import {
  FIELD_KEY,
  NotificationSettingsView,
  REMIND_EVERY_KEY,
  awaitExpiringSoon,
  blockIfAnyMissing,
  expiringRecords,
  expiringSoonDefinition,
  expiringSoonReport,
  refused,
  type ExpiringRecord,
} from '../../../utils/notification/writerBHelpers';
import { NO_RECORD_BLOCKED } from '../../../data/notification/editNotificationArchivingAndExpiryReminders.data';
import { CASES, MESSAGE, SCHEDULE_STORY } from '../../../data/notification/configureExpiryReminderSchedule.data';

/**
 * US 21006 - Configure Expiry Reminder Schedule: one schedule drives the
 * "Expiring Soon" notifications of payers, networks, plans, policies and
 * formularies (AUTO_JOB). Settings guarded, jobs moved only through jobClock,
 * records the suite's own (payer / policy through the payer and policy module
 * fixtures, removed at teardown), app notifications the suite's own
 * (careconnect only, deleted at teardown).
 */
test.describe(`US ${SCHEDULE_STORY.id} - ${SCHEDULE_STORY.title}`, () => {
  test.describe.configure({ timeout: 35 * 60_000 });

  test(`TC-${CASES.fiveKinds.azureId}: should send an Expiring Soon notification for a payer, network, plan, policy and formulary under the one configured schedule`, async ({ steps, page, notificationSettingsGuard, suiteDefinitions, jobClock, publishPayer, policyIn }) => {
    const view = new NotificationSettingsView(page);
    const d = CASES.fiveKinds;
    let records: ExpiringRecord[] = [];

    await steps.critical('Navigate to the Notification Center Management module - the module home page is displayed', async () => {
      await view.openHub();
      await expect(view.editButton(), 'the Edit button of the settings').toBeVisible();
    });

    await steps.step(`Configure Reminder Before (Days) = ${d.reminderBefore} and Remind Every = "${d.remindEvery}" and save - a confirmation is shown`, async () => {
      await view.openEdit();
      await view.chooseRemindEvery(d.remindEvery);
      const s = await view.attemptNumber('reminderBeforeDays', d.reminderBefore);
      expect.soft(refused(s), `the save should go through - ${s.said}`).toBe(false);
      const stored = await notificationSettingsGuard.current();
      expect.soft([stored[FIELD_KEY.reminderBeforeDays], stored[REMIND_EVERY_KEY]], 'the stored schedule').toEqual([d.reminderBefore, d.remindEveryStored]);
      expect(s.messages, s.said).toContain(MESSAGE.updated);
    });

    await steps.step(`Create or identify a payer, network, plan, policy and formulary each expiring within ${d.withinDays} days - each record is there with its expiry date`, async () => {
      records = await expiringRecords(page, d.kinds, d.withinDays, { publishPayer, policyIn });
      blockIfAnyMissing(steps, records, NO_RECORD_BLOCKED);
      const listed = records.map((r) => `${r.kind} "${r.name}" expiring ${r.expiryDate || '(none)'}${r.state ? ` (${r.state})` : ''}`).join('; ');
      expect(d.kinds.filter((kind) => !records.some((r) => r.kind === kind && r.name !== '' && r.expiryDate !== '')), `kinds without a named record and expiry date - records: ${listed}`).toEqual([]);
    });

    await steps.step('Wait for or trigger the scheduled expiry check - an "Expiring Soon" notification is generated for each of the five entity types', async () => {
      const runs = [];
      for (const record of records) runs.push({ record, definition: await expiringSoonDefinition(page, suiteDefinitions, record.kind) });
      const results = await awaitExpiringSoon(page, jobClock, runs);
      // Plain words per kind (record, expiry, job firing, arrival) - no JSON, which the failure narrator cuts off.
      const report = expiringSoonReport(d.kinds, records, results);
      expect(report.notArrived, `kinds without an Expiring Soon notification - per kind: ${report.summary}`).toEqual([]);
    });
  });
});
