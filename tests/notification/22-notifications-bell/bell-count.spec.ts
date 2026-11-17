import { test, expect, clickRowAndLeave } from '../../../utils/notification/writerFHelpers';
import type { TestSteps } from '../../../fixtures/testStatus.fixture';
import type { SecondUser } from '../../../fixtures/notificationModule.fixture';
import { inboxAction, notificationUnreadCount } from '../../../utils/notification/notificationApi';
import { BADGE, CASES, EXACT_COUNTS, HEADER_COUNT, LIVE_TIMEOUT_MS, NINE, TEXT, THREE, UNREAD_LABEL } from '../../../data/notification/notificationsBell.data';

/** Azure step 1 of every case: the module, in the second user's session (its small inbox). */
async function openModule(steps: TestSteps, user: SecondUser, expected: string): Promise<void> {
  await steps.critical(`Navigate to the Notification Center Management module - ${expected}`, async () => {
    await user.center.open();
    await expect(user.notificationBell.bellButton(), 'the Notifications bell in the top bar').toBeVisible();
  });
}

/** Precondition of the counting cases: nothing unread for the second user (Mark all as read - allowed on this account). */
async function clearUnread(steps: TestSteps, user: SecondUser): Promise<void> {
  await steps.critical('Precondition: the second user has no unread notification (Mark all as read through the API)', async () => {
    const answer = await inboxAction.markAllNotificationsRead(user.page);
    expect(answer.status, `MarkAllAsRead answered ${answer.status} ${answer.text.slice(0, 160)}`).toBeLessThan(300);
    expect(await notificationUnreadCount(user.page)).toBe(0);
  });
}

/**
 * User story 21010: Notifications bell - the badge count, the panel title count
 * and the Unread tab label, in the second user's session with suite
 * notifications produced by the `bellFeed` (see data/notification/notificationsBell.data.ts).
 */
test.describe('US 21010 - Notifications bell (counts)', () => {
  test.describe.configure({ timeout: 12 * 60_000 });

  test(`TC-${CASES.badgeForEveryUser.azureId}: should show the bell with the user's own unread count when the user is signed in`, async ({ steps, secondUser, bellFeed }) => {
    await steps.critical('Precondition: the signed-in user has unread notifications (a suite notification is produced)', async () => {
      const { items } = await bellFeed.notifications(1);
      expect(items[0]?.isSeen, 'the produced suite notification is unread').toBe(false);
      expect(await notificationUnreadCount(secondUser.page)).toBeGreaterThan(0);
    });
    await openModule(steps, secondUser, 'the dashboard loads with the top bar visible');

    await steps.step('Observe the top bar - the Notifications bell is shown with the count of unread notifications', async () => {
      const unread = await notificationUnreadCount(secondUser.page);
      await expect(secondUser.notificationBell.bellButton()).toBeVisible();
      await expect.poll(() => secondUser.notificationBell.badgeText(), { message: `the badge for GetUnreadCount ${unread}`, timeout: LIVE_TIMEOUT_MS }).toBe(BADGE(unread));
    });
  });

  test(`TC-${CASES.exactUpToNine.azureId}: should show the exact unread number when nine or fewer notifications are unread`, async ({ steps, secondUser, bellFeed }) => {
    await clearUnread(steps, secondUser);
    await openModule(steps, secondUser, 'the dashboard loads');

    await steps.step(`Set the unread count to ${EXACT_COUNTS.join(', ')} in turn and check the bell each time - the exact number is shown each time`, async () => {
      let reached = 0;
      for (const count of EXACT_COUNTS) {
        await bellFeed.notifications(count - reached);
        reached = count;
        await secondUser.center.open();
        const api = await notificationUnreadCount(secondUser.page);
        await expect.poll(() => secondUser.notificationBell.badgeText(), { message: `the badge at ${count} unread (GetUnreadCount ${api})`, timeout: LIVE_TIMEOUT_MS }).toBe(String(count));
      }
    });
  });

  test(`TC-${CASES.ninePlus.azureId}: should switch the unread count to '9+' once it passes nine`, async ({ steps, secondUser, bellFeed }) => {
    await clearUnread(steps, secondUser);
    await openModule(steps, secondUser, 'the dashboard loads');

    await steps.step(`Set the unread notification count to exactly ${NINE} and check the bell - it shows '${NINE}'`, async () => {
      await bellFeed.notifications(NINE);
      await secondUser.center.open();
      await expect.poll(() => secondUser.notificationBell.badgeText(), { message: `the badge at ${NINE} unread`, timeout: LIVE_TIMEOUT_MS }).toBe(String(NINE));
    });

    await steps.step("Add one more unread notification so the count reaches 10 and check the bell - it shows '9+'", async () => {
      await bellFeed.notifications(1);
      await secondUser.center.open();
      const api = await notificationUnreadCount(secondUser.page);
      await expect.poll(() => secondUser.notificationBell.badgeText(), { message: `the badge at ${NINE + 1} unread (GetUnreadCount ${api})`, timeout: LIVE_TIMEOUT_MS }).toBe(BADGE(NINE + 1));
    });
  });

  test(`TC-${CASES.titleCount.azureId}: should read '${HEADER_COUNT(THREE)}' in the panel title when three notifications are unread`, async ({ steps, secondUser, bellFeed }) => {
    await clearUnread(steps, secondUser);
    await steps.critical(`Precondition: exactly ${THREE} unread suite notifications are produced`, async () => {
      const { items } = await bellFeed.notifications(THREE);
      expect(items.filter((i) => !i.isSeen)).toHaveLength(THREE);
    });
    await openModule(steps, secondUser, `the dashboard loads with ${THREE} unread notifications`);

    await steps.step('Open the bell panel - the panel opens', async () => {
      await secondUser.notificationBell.open();
      await expect(secondUser.notificationBell.control('title')).toHaveText(TEXT.panelTitle);
    });

    await steps.step(`Check the panel title - it reads '${HEADER_COUNT(THREE)}'`, async () => {
      await expect(secondUser.notificationBell.control('unreadCount')).toHaveText(HEADER_COUNT(THREE));
    });
  });

  test(`TC-${CASES.stepDown.azureId}: should step the unread count down on the bell and the Unread tab as notifications are read one by one`, async ({ steps, secondUser, bellFeed }) => {
    const bell = (): typeof secondUser.notificationBell => secondUser.notificationBell;
    let ids: string[] = [];
    await clearUnread(steps, secondUser);
    await steps.critical(`Precondition: exactly ${THREE} unread suite notifications are produced`, async () => {
      ids = (await bellFeed.notifications(THREE)).items.map((i) => i.id);
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
      const path = await clickRowAndLeave(secondUser.page, bell(), ids[index], '/notifications/');
      expect(path, 'the row opens its detail page').toContain('/notifications/');
      await expect.poll(() => bell().badgeText(), { message: `the badge after reading ${index + 1}`, timeout: LIVE_TIMEOUT_MS }).toBe(BADGE(left));
      await bell().open();
      await expect.poll(() => bell().unreadTabBadge(), { message: `the Unread tab label after reading ${index + 1}` }).toMatch(UNREAD_LABEL(left));
    };

    await steps.step('Click one unread notification row - it moves to the Read tab and the count drops to 2 on the bell and the Unread tab', async () => {
      await readOne(0, THREE - 1);
      await bell().openTab('read');
      expect((await bell().readRows()).map((r) => r.id), 'the read notification is on the Read tab').toContain(ids[0]);
    });

    await steps.step('Click a second unread notification row - the count drops to 1 on the bell and the Unread tab', async () => {
      await readOne(1, THREE - 2);
      await bell().openTab('read');
      expect((await bell().readRows()).map((r) => r.id), 'the second read notification is on the Read tab').toContain(ids[1]);
    });

    await steps.step("Click the last unread notification row - the count drops to 0, the badge clears and the Unread tab shows \"You're all caught up.\"", async () => {
      await readOne(2, 0);
      await bell().openTab('unread');
      await expect(bell().control('empty')).toHaveText(TEXT.caughtUp);
    });
  });

  test(`TC-${CASES.unreadLabelSync.azureId}: should keep the Unread tab label in step with the real unread total at every checkpoint`, async ({ steps, secondUser, bellFeed }) => {
    const bell = (): typeof secondUser.notificationBell => secondUser.notificationBell;
    let start = 0;
    await steps.critical('Precondition: the user has a mix of unread and read notifications (one unread suite notification is produced)', async () => {
      const { items } = await bellFeed.notifications(1);
      expect(items[0]?.isSeen).toBe(false);
    });
    await openModule(steps, secondUser, 'the module loads successfully');

    await steps.step('Open the panel and check the Unread tab label - it matches the bell unread count', async () => {
      start = await notificationUnreadCount(secondUser.page);
      await bell().open();
      await expect.poll(() => bell().unreadTabBadge(), { message: `the Unread label for GetUnreadCount ${start}` }).toBe(String(start));
      expect(await bell().badgeText(), 'the bell badge').toBe(BADGE(start));
    });

    let liveId = '';
    await steps.step('Receive a new live notification - the Unread tab label increments immediately', async () => {
      const batch = await bellFeed.prepareNotifications(1);
      await bellFeed.fireNotificationEvent();
      await expect.poll(() => bell().unreadTabBadge(), { message: 'the Unread label after the live notification', timeout: LIVE_TIMEOUT_MS }).toBe(String(start + 1));
      liveId = (await bellFeed.awaitNotifications(batch, 1))[0]?.id ?? '';
      expect(liveId, 'the live suite notification is in the inbox').not.toBe('');
    });

    await steps.step('Mark one notification as read - the Unread tab label decrements immediately', async () => {
      await bell().open();
      await bell().openTab('unread');
      await clickRowAndLeave(secondUser.page, bell(), liveId, '/notifications/');
      await bell().open();
      await expect.poll(() => bell().unreadTabBadge(), { message: 'the Unread label after reading the live notification', timeout: LIVE_TIMEOUT_MS }).toBe(String(start));
    });

    await steps.step('Click Mark all as read - the Unread tab label shows no remaining unread notifications', async () => {
      const status = await bell().markAllRead();
      expect(status, 'MarkAllAsRead answer').toBeLessThan(300);
      await expect.poll(() => bell().unreadTabBadge(), { message: 'the Unread label after Mark all as read', timeout: LIVE_TIMEOUT_MS }).toMatch(UNREAD_LABEL(0));
    });
  });
});
