import { test, expect } from '../../../fixtures';
import { NotificationSettingsView } from '../../../utils/notification/writerBHelpers';
import { CASES, REMIND_EVERY_OPTIONS, SCHEDULE_STORY } from '../../../data/notification/configureExpiryReminderSchedule.data';

/**
 * US 21006 - Configure Expiry Reminder Schedule: the Remind Every drop-down
 * offers exactly four cadences. Read only (the drawer is cancelled); the guard
 * is held anyway, as for every case touching the section.
 */
test.describe(`US ${SCHEDULE_STORY.id} - ${SCHEDULE_STORY.title}`, () => {
  test(`TC-${CASES.fourOptions.azureId}: should offer exactly Every day, Every two days, Every three days and Every week in Remind Every`, async ({ steps, page, notificationSettingsGuard }) => {
    const view = new NotificationSettingsView(page);

    await steps.critical('Navigate to the Notification Center Management module - the module home page is displayed', async () => {
      await view.openHub();
      await expect(view.editButton(), 'the Edit button of the settings').toBeVisible();
    });

    await steps.step('Open the Notifications & Announcements Archiving settings section - the section loads', async () => {
      await view.openEdit();
      await expect(view.field('remindEverySelect'), 'Remind Every').toBeVisible();
    });

    await steps.step('Open the Remind Every dropdown - it expands showing exactly the four options, none extra or missing', async () => {
      const options = await view.remindEveryOptions();
      await view.cancelIfOpen();
      expect.soft(await notificationSettingsGuard.current(), 'nothing changed').toEqual(notificationSettingsGuard.original);
      expect(options, 'the Remind Every options').toEqual([...REMIND_EVERY_OPTIONS]);
    });
  });
});
