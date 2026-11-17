import { test, expect } from '../../../fixtures';
import type { TestSteps } from '../../../fixtures/testStatus.fixture';
import type { NotificationCenterPage } from '../../../pages/notification/NotificationCenterPage';
import type { AnnouncementRecord } from '../../../utils/notification/notificationApi';
import { readAnnouncement } from '../../../utils/notification/notificationApi';
import {
  CASES,
  DAYS,
  DEFAULT_NOW_TOLERANCE_SECONDS,
  RESCHEDULE_ACTION,
  REQUIRED,
  REUSE_CANCELLED_FOR_READ_ONLY,
  STATUS,
} from '../../../data/notification/rescheduleAnnouncement.data';
import {
  WriterDAnnouncements,
  cancelledSuiteAnnouncement,
  countRequests,
  daysAhead,
  openReschedule,
  pickerText,
  publishedSuiteAnnouncement,
  secondsFromNow,
  waitForInboxCopies,
  waitForStatus,
} from '../../../utils/notification/writerDHelpers';

async function openModule(steps: TestSteps, center: NotificationCenterPage): Promise<void> {
  await steps.critical('Navigate to the Notification Center Management module - the announcements list is displayed', async () => {
    await center.open('announcements');
    await expect(center.tabButton('announcements'), 'the Announcements tab').toBeVisible();
  });
}

/**
 * User story 21016: Reschedule Announcement. Only suite announcements; see the
 * data file for which cases reuse a listed Cancelled suite announcement (read
 * only) and which make their own.
 */
test.describe('US 21016 - Reschedule Announcement', () => {
  test.describe.configure({ timeout: 8 * 60_000 });

  test(`TC-${CASES.notWhilePublished.azureId}: should not offer Reschedule on a Published announcement`, async ({
    page,
    steps,
    ncCenter,
    ncAnnouncements,
    suiteAnnouncements,
  }) => {
    let published: AnnouncementRecord | null = null;
    await steps.critical('Precondition: a suite announcement Published to careconnect', async () => {
      published = await publishedSuiteAnnouncement(page, steps, suiteAnnouncements);
      expect(published.status).toBe(STATUS.published);
    });
    await openModule(steps, ncCenter);

    await steps.step('Locate the Published announcement and inspect its actions - Reschedule is not shown', async () => {
      const id = await ncAnnouncements.rowIdByName(published?.name ?? '');
      expect(id, 'the Published row').toBe(published?.id);
      await expect(ncAnnouncements.cell(id, 'status')).toHaveText(STATUS.published);
      const actions = await ncAnnouncements.rowActions(id);
      expect(actions, `the row offers [${actions.join(', ')}]`).not.toContain(RESCHEDULE_ACTION);
    });
  });

  test(`TC-${CASES.notWhileScheduled.azureId}: should not offer Reschedule on a Scheduled announcement`, async ({
    steps,
    ncCenter,
    ncAnnouncements,
    suiteAnnouncements,
  }) => {
    const seed = await suiteAnnouncements.create();
    await openModule(steps, ncCenter);

    await steps.step('Locate the Scheduled announcement and inspect its actions - Reschedule is not shown', async () => {
      const id = await ncAnnouncements.rowIdByName(seed.name);
      expect(id, 'the Scheduled row').toBe(seed.id);
      await expect(ncAnnouncements.cell(id, 'status')).toHaveText(STATUS.scheduled);
      const actions = await ncAnnouncements.rowActions(id);
      expect(actions, `the row offers [${actions.join(', ')}]`).not.toContain(RESCHEDULE_ACTION);
    });
  });

  test(`TC-${CASES.defaultsToNow.azureId}: should open the Reschedule drawer with only Publish at, defaulted to now`, async ({
    page,
    steps,
    ncCenter,
    ncAnnouncements,
    ncRescheduleDrawer: drawer,
    suiteAnnouncements,
  }) => {
    let cancelled: AnnouncementRecord | null = null;
    const screen = new WriterDAnnouncements(page);
    await steps.critical('Precondition: a Cancelled suite announcement', async () => {
      cancelled = await cancelledSuiteAnnouncement(page, steps, suiteAnnouncements, REUSE_CANCELLED_FOR_READ_ONLY);
      expect(cancelled.status).toBe(STATUS.cancelled);
    });
    await openModule(steps, ncCenter);

    await steps.step('Select Reschedule on the Cancelled announcement - the drawer opens showing only the Publish at field', async () => {
      const id = await ncAnnouncements.rowIdByName(cancelled?.name ?? '');
      await openReschedule(ncAnnouncements, drawer, id);
      await expect(drawer.input()).toBeVisible();
      expect(await screen.rescheduleFieldCount(), `editable fields in the drawer: ${await screen.rescheduleText()}`).toBe(1);
    });

    await steps.step('Inspect the Publish at value without changing it - it holds the current date and time', async () => {
      const value = await drawer.value();
      expect(Math.abs(secondsFromNow(value) ?? 1e9), `Publish at "${value}" vs now`).toBeLessThanOrEqual(DEFAULT_NOW_TOLERANCE_SECONDS);
    });
  });

  test(`TC-${CASES.exactlyOneYear.azureId}: should accept a reschedule exactly one year from now`, async ({
    page,
    steps,
    ncCenter,
    ncAnnouncements,
    ncRescheduleDrawer: drawer,
    suiteAnnouncements,
  }) => {
    let cancelled: AnnouncementRecord | null = null;
    const screen = new WriterDAnnouncements(page);
    const at = daysAhead(DAYS.oneYear);
    await steps.critical('Precondition: a Cancelled suite announcement of the case\'s own', async () => {
      cancelled = await cancelledSuiteAnnouncement(page, steps, suiteAnnouncements, false);
      expect(cancelled.status).toBe(STATUS.cancelled);
    });
    await openModule(steps, ncCenter);

    await steps.step('Select Reschedule on the Cancelled announcement - the drawer opens with Publish at defaulted to now', async () => {
      const id = await ncAnnouncements.rowIdByName(cancelled?.name ?? '');
      await openReschedule(ncAnnouncements, drawer, id);
      const value = await drawer.value();
      expect(Math.abs(secondsFromNow(value) ?? 1e9), `Publish at "${value}"`).toBeLessThanOrEqual(DEFAULT_NOW_TOLERANCE_SECONDS);
    });

    await steps.step('Set Publish at to exactly one year from now and save - accepted, the drawer closes without validation errors', async () => {
      await drawer.setPublishAt(at);
      await expect(drawer.input()).toHaveValue(pickerText(at));
      const shown = await screen.rescheduleText();
      const result = await drawer.confirm();
      expect(result.status, `RescheduleAnnouncement answered ${result.status ?? 'nothing'}, toast "${result.toast}", drawer: ${shown}`).toBeLessThan(300);
      await expect(screen.rescheduleTitle(), 'the Reschedule drawer').toBeHidden();
      const stored = await readAnnouncement(page, cancelled?.id ?? '');
      expect({ status: stored?.status, publishAt: pickerText(stored?.publishAt ?? 0) }).toEqual({ status: STATUS.scheduled, publishAt: pickerText(at) });
    });
  });

  test(`TC-${CASES.requiredWhenBlank.azureId}: should show "This field is required." and keep the drawer open when Publish at is emptied`, async ({
    page,
    steps,
    ncCenter,
    ncAnnouncements,
    ncRescheduleDrawer: drawer,
    suiteAnnouncements,
  }) => {
    let cancelled: AnnouncementRecord | null = null;
    const screen = new WriterDAnnouncements(page);
    await steps.critical('Precondition: a Cancelled suite announcement', async () => {
      cancelled = await cancelledSuiteAnnouncement(page, steps, suiteAnnouncements, REUSE_CANCELLED_FOR_READ_ONLY);
      expect(cancelled.status).toBe(STATUS.cancelled);
    });
    await openModule(steps, ncCenter);

    await steps.step('Select Reschedule on the Cancelled announcement - the drawer opens with Publish at defaulted to now', async () => {
      const id = await ncAnnouncements.rowIdByName(cancelled?.name ?? '');
      await openReschedule(ncAnnouncements, drawer, id);
      const value = await drawer.value();
      expect(Math.abs(secondsFromNow(value) ?? 1e9), `Publish at "${value}"`).toBeLessThanOrEqual(DEFAULT_NOW_TOLERANCE_SECONDS);
    });

    await steps.step(`Clear Publish at entirely and try to save - "${REQUIRED}" is displayed and the drawer does not close`, async () => {
      await drawer.setPublishAt('');
      await expect(drawer.input()).toHaveValue('');
      const result = await drawer.confirm();
      const shown = await screen.rescheduleText();
      expect(shown, `RescheduleAnnouncement ${result.status ?? 'not sent'}, toast "${result.toast}"`).toContain(REQUIRED);
      await expect(screen.rescheduleTitle(), 'the Reschedule drawer').toBeVisible();
      expect(result.status, 'RescheduleAnnouncement status (null = not sent)').toBeNull();
    });
  });

  test(`TC-${CASES.resendNow.azureId}: should send the announcement again at once, unread and unchanged, when rescheduled to now`, async ({
    page,
    steps,
    ncCenter,
    ncAnnouncements,
    ncRescheduleDrawer: drawer,
    suiteAnnouncements,
  }) => {
    let cancelled: AnnouncementRecord | null = null;
    const screen = new WriterDAnnouncements(page);
    await steps.critical('Precondition: a Cancelled suite announcement of the case\'s own (sent to careconnect, then cancelled)', async () => {
      cancelled = await cancelledSuiteAnnouncement(page, steps, suiteAnnouncements, false);
      expect(cancelled.status).toBe(STATUS.cancelled);
    });
    await openModule(steps, ncCenter);

    await steps.step('Select Reschedule on the Cancelled announcement - the drawer opens with Publish at defaulted to now', async () => {
      const id = await ncAnnouncements.rowIdByName(cancelled?.name ?? '');
      await openReschedule(ncAnnouncements, drawer, id);
      const value = await drawer.value();
      expect(Math.abs(secondsFromNow(value) ?? 1e9), `Publish at "${value}"`).toBeLessThanOrEqual(DEFAULT_NOW_TOLERANCE_SECONDS);
    });

    await steps.step('Save without changing the default Publish at - the drawer closes and the announcement is sent at once', async () => {
      const result = await drawer.confirm();
      expect(result.status, `RescheduleAnnouncement answered ${result.status ?? 'nothing'}, toast "${result.toast}"`).toBeLessThan(300);
      await expect(screen.rescheduleTitle(), 'the Reschedule drawer').toBeHidden();
      expect((await waitForStatus(page, cancelled?.id ?? '', STATUS.published))?.status, 'the status after the reschedule').toBe(STATUS.published);
    });

    await steps.step('Open a recipient\'s inbox (careconnect) - the announcement is there once, unread, with its original wording', async () => {
      const copies = await waitForInboxCopies(page, cancelled?.name ?? '');
      expect(copies.map((c) => ({ seen: c.isSeen, english: c.englishMessage, arabic: c.arabicMessage })), 'careconnect\'s inbox copies')
        .toEqual([{ seen: false, english: cancelled?.englishMessage, arabic: cancelled?.arabicMessage }]);
    });
  });

  test(`TC-${CASES.closeWithoutSaving.azureId}: should leave the announcement unchanged when the Reschedule drawer is closed without saving`, async ({
    page,
    steps,
    ncCenter,
    ncAnnouncements,
    ncRescheduleDrawer: drawer,
    suiteAnnouncements,
  }) => {
    let cancelled: AnnouncementRecord | null = null;
    let id = '';
    const screen = new WriterDAnnouncements(page);
    await steps.critical('Precondition: a Cancelled suite announcement', async () => {
      cancelled = await cancelledSuiteAnnouncement(page, steps, suiteAnnouncements, REUSE_CANCELLED_FOR_READ_ONLY);
      expect(cancelled.status).toBe(STATUS.cancelled);
    });
    await openModule(steps, ncCenter);

    await steps.step('Select Reschedule on the Cancelled announcement - the drawer opens with Publish at defaulted to now', async () => {
      id = await ncAnnouncements.rowIdByName(cancelled?.name ?? '');
      await openReschedule(ncAnnouncements, drawer, id);
      const value = await drawer.value();
      expect(Math.abs(secondsFromNow(value) ?? 1e9), `Publish at "${value}"`).toBeLessThanOrEqual(DEFAULT_NOW_TOLERANCE_SECONDS);
    });

    await steps.step('Change Publish at, then close the drawer with its close control without saving - it closes and nothing is applied', async () => {
      const sent = countRequests(page, '/RescheduleAnnouncement');
      await drawer.setPublishAt(daysAhead(DAYS.changedBeforeClose));
      await screen.closeReschedule();
      sent.stop();
      expect(sent.count(), 'RescheduleAnnouncement requests sent').toBe(0);
      const stored = await readAnnouncement(page, cancelled?.id ?? '');
      expect({ status: stored?.status, publishAt: stored?.publishAt }).toEqual({ status: STATUS.cancelled, publishAt: cancelled?.publishAt });
    });

    await steps.step('Reopen Reschedule on the same announcement - Publish at again defaults to now', async () => {
      await openReschedule(ncAnnouncements, drawer, id);
      const value = await drawer.value();
      expect(Math.abs(secondsFromNow(value) ?? 1e9), `Publish at "${value}" vs now (the changed value was not kept)`).toBeLessThanOrEqual(DEFAULT_NOW_TOLERANCE_SECONDS);
    });
  });
});
