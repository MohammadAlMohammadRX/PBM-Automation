import { test, expect } from '../../../fixtures';
import type { TestSteps } from '../../../fixtures/testStatus.fixture';
import type { NotificationCenterPage } from '../../../pages/notification/NotificationCenterPage';
import type { AnnouncementRecord } from '../../../utils/notification/notificationApi';
import { roleAudience } from '../../../utils/notification/notificationApi';
import {
  ACTIONS,
  AUDIENCE,
  AUTO_REFRESH,
  CASES,
  COLUMN_KEYS,
  COUNTDOWN,
  HEADERS,
  HEADERS_CASE_SENSITIVE,
  REUSE_CANCELLED,
  ROLE_AUDIENCE_RIGHTS,
  STATUS,
} from '../../../data/notification/searchAndFilterAnnouncements.data';
import {
  WriterDAnnouncements,
  cancelledSuiteAnnouncement,
  countdownVerdict,
  foldCase,
  markPage,
  minutesAhead,
  present,
  publishedSuiteAnnouncement,
  stampWord,
  stillSamePage,
  waitForStatus,
  waitUntil,
} from '../../../utils/notification/writerDHelpers';

/** Step 1: the Notification Center (its first tab). */
async function openModule(steps: TestSteps, center: NotificationCenterPage): Promise<void> {
  await steps.critical('Navigate to the Notification Center Management module - the dashboard loads', async () => {
    await center.open();
    await expect(center.tabButton('announcements'), 'the Announcements tab').toBeVisible();
  });
}

/**
 * User story 21011: Search and Filter Announcements - the list's columns, the
 * Audiences chips, the "Next job" countdown, the automatic refresh and the row
 * actions per status. See the data file for the readings.
 */
test.describe('US 21011 - Search and Filter Announcements (list)', () => {
  test.describe.configure({ timeout: 8 * 60_000 });

  test(`TC-${CASES.columns.azureId}: should show the Name, Status, Publish At, Audiences and Actions columns`, async ({
    page,
    steps,
    ncCenter,
    ncAnnouncements,
  }) => {
    const screen = new WriterDAnnouncements(page);
    await openModule(steps, ncCenter);

    await steps.step('Open the Announcements list - it loads with records', async () => {
      const answer = await ncCenter.switchTo('announcements');
      expect(answer?.totalRows ?? 0).toBeGreaterThan(0);
      await expect(ncAnnouncements.rows().first()).toBeVisible();
    });

    await steps.step('Inspect the column headers - Name, Status, Publish At, Audiences and Actions are all shown', async () => {
      const shown = await screen.headers(COLUMN_KEYS);
      expect(foldCase(shown, HEADERS_CASE_SENSITIVE), `headers shown: ${shown.join(' | ')}`).toEqual(foldCase(HEADERS, HEADERS_CASE_SENSITIVE));
    });
  });

  test(`TC-${CASES.audienceChips.azureId}: should show the audience type of each announcement as a Users or Roles chip`, async ({
    steps,
    ncCenter,
    ncAnnouncements,
    suiteRole,
    suiteAnnouncements,
  }) => {
    const word = stampWord('aud');
    const role = await suiteRole({ rights: ROLE_AUDIENCE_RIGHTS });
    const forUsers = await suiteAnnouncements.create({ name: suiteAnnouncements.newName(`${word} users`) });
    const forRoles = await suiteAnnouncements.create({ name: suiteAnnouncements.newName(`${word} roles`), audiences: [roleAudience(role.id, role.name)] });
    await openModule(steps, ncCenter);

    await steps.step('Open the Announcements list - the list displays', async () => {
      await ncCenter.switchTo('announcements');
      await ncAnnouncements.search(word);
      await expect(ncAnnouncements.row(forUsers.id)).toBeVisible();
    });

    await steps.step('Inspect the Audiences column of the announcement targeting users - a "Users" chip is shown', async () => {
      await expect(ncAnnouncements.cell(forUsers.id, 'audiences')).toHaveText(AUDIENCE.users);
    });

    await steps.step('Inspect the Audiences column of the announcement targeting roles - a "Roles" chip is shown', async () => {
      await expect(ncAnnouncements.cell(forRoles.id, 'audiences')).toHaveText(AUDIENCE.roles);
    });
  });

  test(`TC-${CASES.nextJobCountdown.azureId}: should show a Next job MM:SS countdown that decreases toward 00:00`, async ({
    page,
    steps,
    ncCenter,
    suiteAnnouncements,
  }) => {
    const screen = new WriterDAnnouncements(page);
    await steps.critical('Precondition: a suite Scheduled announcement due in a few minutes (deleted before it publishes)', async () => {
      const due = await suiteAnnouncements.create({ publishAt: minutesAhead(COUNTDOWN.dueMinutes) });
      expect(due.status).toBe(STATUS.scheduled);
    });
    await openModule(steps, ncCenter);

    await steps.step('Open the Announcements list - the toolbar shows a "Next job" countdown in MM:SS', async () => {
      await ncCenter.switchTo('announcements');
      expect(await screen.nextJobText(), 'the toolbar text').toMatch(/^Next job \d{2}:\d{2}$/);
    });

    await steps.step('Wait and observe the countdown as it nears 00:00 - it decreases correctly toward zero', async () => {
      const samples = await screen.watchCountdown(COUNTDOWN.maxSeconds, COUNTDOWN.floorSeconds);
      expect(countdownVerdict(samples, COUNTDOWN.floorSeconds), `seconds read, one a second: ${samples.join(', ')}`).toEqual({ falls: true, reachedZero: true });
    });
  });

  test(`TC-${CASES.publishedActions.azureId}: should offer only View and Cancel on a Published announcement`, async ({
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

    await steps.step('Locate a Published announcement in the list - the record is shown', async () => {
      await ncCenter.switchTo('announcements');
      expect(await ncAnnouncements.rowIdByName(present(published, 'the Published announcement').name)).toBe(present(published, 'the Published announcement').id);
      await expect(ncAnnouncements.cell(present(published, 'the Published announcement').id, 'status')).toHaveText(STATUS.published);
    });

    await steps.step('Inspect its Actions - only View and Cancel are available', async () => {
      expect([...(await ncAnnouncements.rowActions(present(published, 'the Published announcement').id))].sort()).toEqual([...ACTIONS.published]);
    });
  });

  test(`TC-${CASES.autoRefresh.azureId}: should refresh the list by itself when a Scheduled announcement is published`, async ({
    page,
    steps,
    ncCenter,
    ncAnnouncements,
    suiteAnnouncements,
  }) => {
    const publishAt = minutesAhead(AUTO_REFRESH.dueMinutes);
    const seed = await suiteAnnouncements.create({ publishAt });
    await steps.critical('Navigate to the Notification Center Management module - the list shows the announcement as Scheduled', async () => {
      await ncCenter.open('announcements');
      expect(await ncAnnouncements.rowIdByName(seed.name)).toBe(seed.id);
      await expect(ncAnnouncements.cell(seed.id, 'status')).toHaveText(STATUS.scheduled);
      await markPage(page);
    });

    await steps.step('Wait, without refreshing, until the scheduled publish time passes - the publishing job runs', async () => {
      await waitUntil(page, publishAt.getTime());
      expect((await waitForStatus(page, seed.id, STATUS.published, AUTO_REFRESH.watchAfterSeconds * 1000))?.status, 'GetAnnouncement after the publish time').toBe(STATUS.published);
    });

    await steps.step('Observe the list - it refreshed by itself and the status is Published', async () => {
      await expect(ncAnnouncements.cell(seed.id, 'status'), 'the row\'s status without a manual refresh').toHaveText(STATUS.published, { timeout: AUTO_REFRESH.watchAfterSeconds * 1000 });
      expect(await stillSamePage(page), 'the page was not reloaded or left').toBe(true);
    });
  });

  test(`TC-${CASES.cancelledActions.azureId}: should offer only View, Edit and Reschedule on a Cancelled announcement`, async ({
    page,
    steps,
    ncCenter,
    ncAnnouncements,
    suiteAnnouncements,
  }) => {
    let cancelled: AnnouncementRecord | null = null;
    await steps.critical('Precondition: a Cancelled suite announcement', async () => {
      cancelled = await cancelledSuiteAnnouncement(page, steps, suiteAnnouncements, REUSE_CANCELLED);
      expect(cancelled.status).toBe(STATUS.cancelled);
    });
    await openModule(steps, ncCenter);

    await steps.step('Locate a Cancelled announcement in the list - the record is shown', async () => {
      await ncCenter.switchTo('announcements');
      const record = present(cancelled, 'the Cancelled announcement');
      expect(await ncAnnouncements.rowIdByName(record.name)).toBe(record.id);
      await expect(ncAnnouncements.cell(record.id, 'status')).toHaveText(STATUS.cancelled);
    });

    await steps.step('Inspect its Actions - only View, Edit and Reschedule are available', async () => {
      expect([...(await ncAnnouncements.rowActions(present(cancelled, 'the Cancelled announcement').id))].sort()).toEqual([...ACTIONS.cancelled]);
    });
  });

  test(`TC-${CASES.scheduledActions.azureId}: should offer only View, Edit and Delete on a Scheduled announcement`, async ({
    steps,
    ncCenter,
    ncAnnouncements,
    suiteAnnouncements,
  }) => {
    const seed = await suiteAnnouncements.create();
    await openModule(steps, ncCenter);

    await steps.step('Locate a Scheduled announcement in the list - the record is shown', async () => {
      await ncCenter.switchTo('announcements');
      expect(await ncAnnouncements.rowIdByName(seed.name)).toBe(seed.id);
      await expect(ncAnnouncements.cell(seed.id, 'status')).toHaveText(STATUS.scheduled);
    });

    await steps.step('Inspect its Actions - only View, Edit and Delete are available', async () => {
      expect([...(await ncAnnouncements.rowActions(seed.id))].sort()).toEqual([...ACTIONS.scheduled]);
    });
  });
});
