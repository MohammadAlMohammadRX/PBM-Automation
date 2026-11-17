import { test, expect, awaitLiveConnection, clickRowAndLeave } from '../../../utils/notification/writerFHelpers';
import type { TestSteps } from '../../../fixtures/testStatus.fixture';
import type { SecondUser } from '../../../fixtures/notificationModule.fixture';
import { announcementUnreadCount, inboxAction } from '../../../utils/notification/notificationApi';
import { BADGE, CASES, FIVE, LIVE_TIMEOUT_MS, NINE, TEXT, THREE, UNREAD_LABEL } from '../../../data/notification/announcementsBell.data';

/** Azure step 1: the module, in the second user's session (its small inbox). */
async function openModule(steps: TestSteps, user: SecondUser, expected: string): Promise<void> {
  await steps.critical(`Navigate to the Notification Center Management module - ${expected}`, async () => {
    await user.center.open();
    await expect(user.announcementBell.bellButton(), 'the Announcements bell in the top bar').toBeVisible();
  });
}

/** Precondition of the counting cases: nothing unread (Mark all as read - allowed on this account). */
async function clearUnread(steps: TestSteps, user: SecondUser): Promise<void> {
  await steps.critical('Precondition: the second user has no unread announcement (Mark all as read through the API)', async () => {
    const answer = await inboxAction.markAllAnnouncementsRead(user.page);
    expect(answer.status, `MarkAllAsRead answered ${answer.status} ${answer.text.slice(0, 160)}`).toBeLessThan(300);
    expect(await announcementUnreadCount(user.page)).toBe(0);
  });
}

/**
 * User story 21018: Announcements bell - the badge count, its "9+" form, the
 * step-down as rows are read, the Unread tab label and the disabled Mark all
 * as read. Suite announcements are published now to the second user by the
 * `bellFeed` (see data/notification/announcementsBell.data.ts).
 */
test.describe('US 21018 - Announcements bell (counts)', () => {
  test.describe.configure({ timeout: 15 * 60_000 });

  test(`TC-${CASES.exactCount.azureId}: should show the exact number of unread announcements on the bell`, async ({ steps, secondUser, bellFeed }) => {
    await clearUnread(steps, secondUser);
    await steps.critical(`Precondition: exactly ${FIVE} unread announcements are published to the user`, async () => {
      const { items } = await bellFeed.announcements(FIVE);
      expect(items.filter((i) => !i.isSeen)).toHaveLength(FIVE);
    });
    await openModule(steps, secondUser, 'the top bar with the Announcements bell icon is displayed');

    await steps.step(`Observe the Announcements bell icon in the top bar - a badge showing "${FIVE}" is displayed`, async () => {
      await expect.poll(() => secondUser.announcementBell.badgeText(), { timeout: LIVE_TIMEOUT_MS }).toBe(String(FIVE));
    });

    await steps.step(`Compare the badge count against the number of unread announcements - it matches the actual unread count of ${FIVE}`, async () => {
      const api = await announcementUnreadCount(secondUser.page);
      expect({ badge: await secondUser.announcementBell.badgeText(), api }).toEqual({ badge: String(FIVE), api: FIVE });
    });
  });

  test(`TC-${CASES.ninePlus.azureId}: should show '9+' once the unread announcement count passes nine`, async ({ steps, secondUser, bellFeed }) => {
    await clearUnread(steps, secondUser);
    await openModule(steps, secondUser, 'the top bar with the Announcements bell icon is displayed');

    await steps.step(`Observe the bell badge with exactly ${NINE} unread announcements - it shows "${NINE}"`, async () => {
      await bellFeed.announcements(NINE);
      await secondUser.center.open();
      await expect.poll(() => secondUser.announcementBell.badgeText(), { message: `the badge at ${NINE} unread`, timeout: LIVE_TIMEOUT_MS }).toBe(String(NINE));
    });

    await steps.step('Add one more unread announcement so the total becomes 10 - the badge shows "9+"', async () => {
      await bellFeed.announcements(1);
      await secondUser.center.open();
      const api = await announcementUnreadCount(secondUser.page);
      await expect.poll(() => secondUser.announcementBell.badgeText(), { message: `the badge at ${NINE + 1} unread (GetUnreadCount ${api})`, timeout: LIVE_TIMEOUT_MS }).toBe(BADGE(NINE + 1));
    });
  });

  test(`TC-${CASES.stepDown.azureId}: should step the unread announcement count down as the user reads them one by one`, async ({ steps, secondUser, bellFeed }) => {
    const bell = (): typeof secondUser.announcementBell => secondUser.announcementBell;
    let ids: string[] = [];
    await clearUnread(steps, secondUser);
    await steps.critical(`Precondition: exactly ${THREE} unread announcements are published to the user`, async () => {
      ids = (await bellFeed.announcements(THREE)).items.map((i) => i.id);
      expect(ids).toHaveLength(THREE);
    });
    await openModule(steps, secondUser, 'the module loads successfully');

    await steps.step(`Note the current unread count on the bell and the Unread tab label - both show ${THREE}`, async () => {
      await expect.poll(() => bell().badgeText(), { timeout: LIVE_TIMEOUT_MS }).toBe(String(THREE));
      await bell().open();
      await expect(bell().control('unreadTabBadge')).toHaveText(String(THREE));
    });

    const readOne = async (index: number, left: number): Promise<void> => {
      await bell().open();
      await bell().openTab('unread');
      const path = await clickRowAndLeave(secondUser.page, bell(), ids[index], '/announcements/');
      expect(path, 'the row opens the announcement detail page').toContain('/announcements/');
      const settled = await expect.poll(() => bell().badgeText(), { timeout: LIVE_TIMEOUT_MS }).toBe(BADGE(left)).then(() => true, () => false);
      if (!settled) {
        // Say what the server holds at that moment, so a wrong badge is told apart from a wrong count.
        const api = await announcementUnreadCount(secondUser.page);
        const badge = await bell().badgeText();
        expect(badge, `the bell badge after reading ${index + 1} of ${THREE} (waited ${LIVE_TIMEOUT_MS / 1000} s; GetUnreadCount answers ${api}; badge shown "${badge || 'none'}")`).toBe(BADGE(left));
      }
      await bell().open();
      await expect.poll(() => bell().unreadTabBadge(), { message: `the Unread tab label after reading ${index + 1}` }).toMatch(UNREAD_LABEL(left));
    };

    await steps.step('Click one unread announcement row - it moves to the Read tab and the count drops to 2 on the bell and the Unread tab', async () => {
      await readOne(0, THREE - 1);
      await bell().openTab('read');
      expect((await bell().readRows()).map((r) => r.id), 'the read announcement is on the Read tab').toContain(ids[0]);
    });

    await steps.step('Click a second unread announcement row - the count drops to 1 on the bell and the Unread tab', async () => {
      await readOne(1, THREE - 2);
      await bell().openTab('read');
      expect((await bell().readRows()).map((r) => r.id), 'the second read announcement is on the Read tab').toContain(ids[1]);
    });

    await steps.step("Click the last unread announcement row - the count drops to 0, the badge clears and the Unread tab shows \"You're all caught up.\"", async () => {
      await readOne(2, 0);
      await bell().openTab('unread');
      await expect(bell().control('empty')).toHaveText(TEXT.caughtUp);
    });
  });

  test(`TC-${CASES.unreadLabelSync.azureId}: should keep the Unread tab label in step with the real unread announcement total`, async ({ steps, secondUser, bellFeed }) => {
    const bell = (): typeof secondUser.announcementBell => secondUser.announcementBell;
    let start = 0;
    let liveId = '';
    await steps.critical('Precondition: a mix of unread and read announcements (two suite announcements, one of them read)', async () => {
      // Without this the account may hold nothing unread (the cases before mark all read), and step 5's
      // Mark all as read is then rightly disabled (21824) - full run 2026-11-12.
      const { items } = await bellFeed.announcements(2);
      expect((await inboxAction.markAnnouncementRead(secondUser.page, items[1].id)).status).toBeLessThan(300);
      expect(await announcementUnreadCount(secondUser.page), 'unread announcements after the precondition').toBeGreaterThan(0);
    });
    // "Receive a live announcement" needs the page's live connection up first - publishing before it is
    // simply missed by the page (re-run 2 2026-11-12: the label never moved; 21833 waits the same way).
    const connected = awaitLiveConnection(secondUser.page);
    let live = '';
    await openModule(steps, secondUser, 'the module loads successfully');

    await steps.step('Open the Announcements panel and check the Unread tab label - it matches the bell unread count', async () => {
      start = await announcementUnreadCount(secondUser.page);
      await bell().open();
      await expect.poll(() => bell().unreadTabBadge(), { message: `the Unread label for GetUnreadCount ${start}` }).toMatch(UNREAD_LABEL(start));
      expect(await bell().badgeText(), 'the bell badge').toBe(BADGE(start));
    });

    await steps.step('Receive a new live announcement - the Unread tab label increments immediately', async () => {
      live = await connected;
      const batch = await bellFeed.publishAnnouncements(1);
      await expect.poll(() => bell().unreadTabBadge(), { message: `the Unread label after the live announcement (${live})`, timeout: LIVE_TIMEOUT_MS }).toMatch(UNREAD_LABEL(start + 1));
      liveId = (await bellFeed.awaitAnnouncements(batch, 1))[0]?.id ?? '';
      expect(liveId, 'the live suite announcement is in the inbox').not.toBe('');
    });

    await steps.step('Mark one announcement as read - the Unread tab label decrements immediately', async () => {
      await bell().open();
      await bell().openTab('unread');
      await clickRowAndLeave(secondUser.page, bell(), liveId, '/announcements/');
      await bell().open();
      await expect.poll(() => bell().unreadTabBadge(), { message: 'the Unread label after reading the live announcement', timeout: LIVE_TIMEOUT_MS }).toMatch(UNREAD_LABEL(start));
    });

    await steps.step('Click Mark all as read - the Unread tab label shows no remaining unread announcements', async () => {
      await bell().open();
      expect(await bell().markAllRead(), 'MarkAllAsRead answer').toBeLessThan(300);
      await expect.poll(() => bell().unreadTabBadge(), { message: 'the Unread label after Mark all as read', timeout: LIVE_TIMEOUT_MS }).toMatch(UNREAD_LABEL(0));
    });
  });

  test(`TC-${CASES.markAllReadDisabled.azureId}: should disable Mark all as read when the user has no unread announcements`, async ({ steps, secondUser }) => {
    const bell = (): typeof secondUser.announcementBell => secondUser.announcementBell;
    await clearUnread(steps, secondUser);
    await steps.critical('Navigate to the Notification Center Management module - the Announcements bell is displayed with no unread count', async () => {
      await secondUser.center.open();
      await expect(bell().bellButton()).toBeVisible();
      expect(await bell().badgeText(), 'the bell badge').toBe('');
    });

    await steps.step("Open the Announcements panel - it loads with the 'Mark all as read' control visible", async () => {
      await bell().open();
      await expect(bell().control('markAllRead')).toBeVisible();
    });

    await steps.step("Inspect the 'Mark all as read' control - it is disabled and cannot be clicked", async () => {
      await expect(bell().control('markAllRead')).toBeDisabled();
    });
  });
});
