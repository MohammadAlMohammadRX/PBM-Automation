import { test, expect, AppScreen, armPopupRecorder, markPage, orderProblems, pageKept, popupWith, shownIds, topRowText } from '../../../utils/notification/writerFHelpers';
import type { TestSteps } from '../../../fixtures/testStatus.fixture';
import type { SecondUser } from '../../../fixtures/notificationModule.fixture';
import { AppRoutes } from '../../../constants/AppRoutes';
import { inboxAction, myNotifications, notificationUnreadCount } from '../../../utils/notification/notificationApi';
import { BADGE, CASES, LIVE_TIMEOUT_MS, PAGE_SIZE, POPUP_ROUTES, TEXT } from '../../../data/notification/notificationsBell.data';

/** Azure step 1: the module, in the second user's session. */
async function openModule(steps: TestSteps, user: SecondUser, expected: string): Promise<void> {
  await steps.critical(`Navigate to the Notification Center Management module - ${expected}`, async () => {
    await user.center.open();
    await expect(user.notificationBell.bellButton(), 'the Notifications bell in the top bar').toBeVisible();
  });
}

/**
 * User story 21010: Notifications bell - live arrival. The second user keeps
 * its page open; "another session" (the admin page) submits a suite network,
 * which fires the suite definitions aimed at the second user. "Without a
 * refresh" = the window marker set before the event is still there after it.
 */
test.describe('US 21010 - Notifications bell (live arrival)', () => {
  test.describe.configure({ timeout: 12 * 60_000 });

  test(`TC-${CASES.liveArrival.azureId}: should deliver a new notification live, raise the count and put it on top without a page refresh`, async ({ steps, secondUser, bellFeed }) => {
    const bell = (): typeof secondUser.notificationBell => secondUser.notificationBell;
    let before = 0;
    let mark = '';
    let itemId = '';
    await openModule(steps, secondUser, 'the dashboard loads showing the current unread count');
    await steps.critical('Precondition: the current unread count is read and the window is marked (to prove no refresh)', async () => {
      before = await notificationUnreadCount(secondUser.page);
      await expect.poll(() => bell().badgeText(), { message: `the badge for GetUnreadCount ${before}` }).toBe(BADGE(before));
      mark = await markPage(secondUser.page);
    });

    await steps.step('Trigger a new notification for this user from another session - it is delivered without the user refreshing the page', async () => {
      const batch = await bellFeed.prepareNotifications(1);
      await bellFeed.fireNotificationEvent();
      itemId = (await bellFeed.awaitNotifications(batch, 1))[0]?.id ?? '';
      expect(itemId, 'the suite notification reached the inbox').not.toBe('');
      expect(await pageKept(secondUser.page, mark), 'the page was not reloaded').toBe(true);
    });

    await steps.step('Check the bell count - the unread count increases immediately', async () => {
      await expect.poll(() => bell().badgeText(), { message: `the badge after the live notification (was ${before})`, timeout: LIVE_TIMEOUT_MS }).toBe(BADGE(before + 1));
      expect(await pageKept(secondUser.page, mark), 'the page was not reloaded').toBe(true);
    });

    await steps.step('Open the bell panel - the new notification appears at the top of the list', async () => {
      await bell().open();
      expect((await shownIds(bell()))[0], 'the top row is the new suite notification').toBe(itemId);
      expect(await pageKept(secondUser.page, mark), 'the page was not reloaded').toBe(true);
    });
  });

  test(`TC-${CASES.popupAnyPage.azureId}: should announce an arriving notification with a pop-up on whichever page the user is`, async ({ steps, secondUser, bellFeed }) => {
    const screen = (): AppScreen => new AppScreen(secondUser.page);
    const fireAndCatch = async (): Promise<{ message: string; popup: string }> => {
      await armPopupRecorder(secondUser.page);
      const batch = await bellFeed.prepareNotifications(1);
      await bellFeed.fireNotificationEvent();
      const message = batch.english[0];
      await expect.poll(() => popupWith(secondUser.page, message), { message: `a pop-up showing "${message}"`, timeout: LIVE_TIMEOUT_MS }).not.toBe('');
      return { message, popup: await popupWith(secondUser.page, message) };
    };
    await openModule(steps, secondUser, 'the dashboard loads');

    await steps.step(`Move to a different, unrelated page in the application (${POPUP_ROUTES[0]}) - the new page loads`, async () => {
      await screen().visit(AppRoutes[POPUP_ROUTES[0]]);
      await expect(screen().header()).toBeVisible();
      expect(screen().path()).toBe(AppRoutes[POPUP_ROUTES[0]]);
    });

    await steps.step(`Trigger a notification for this user from another session - a '${TEXT.popupTitle}' pop-up shows the message on the current page`, async () => {
      const seen = await fireAndCatch();
      expect(seen.popup, `the pop-up for "${seen.message}"`).toContain(TEXT.popupTitle);
    });

    await steps.step(`Repeat on ${POPUP_ROUTES.length - 1} other pages (${POPUP_ROUTES.slice(1).join(', ')}) - the pop-up appears each time`, async () => {
      const seen: { route: string; title: boolean; message: boolean }[] = [];
      for (const route of POPUP_ROUTES.slice(1)) {
        await screen().visit(AppRoutes[route]);
        await expect(screen().header()).toBeVisible();
        const caught = await fireAndCatch();
        seen.push({ route, title: caught.popup.includes(TEXT.popupTitle), message: caught.popup.includes(caught.message) });
      }
      expect(seen).toEqual(POPUP_ROUTES.slice(1).map((route) => ({ route, title: true, message: true })));
    });
  });

  test(`TC-${CASES.newestFirst.azureId}: should list every active notification newest first and put a freshly arrived one on top`, async ({ steps, secondUser, bellFeed }) => {
    const bell = (): typeof secondUser.notificationBell => secondUser.notificationBell;
    await steps.critical('Precondition: several notifications, a mix of read and unread, none archived (two suite notifications, one read)', async () => {
      const { items } = await bellFeed.notifications(2);
      const answer = await inboxAction.markNotificationRead(secondUser.page, items[1].id);
      expect(answer.status, `MarkAsRead answered ${answer.status}`).toBeLessThan(300);
    });
    await openModule(steps, secondUser, 'the module loads successfully');

    let shown: string[] = [];
    await steps.step('Open the bell panel and select the All tab - every non-archived notification is listed', async () => {
      // The panel opens on All (its first GetMyNotifications asks status "all").
      await bell().open();
      shown = await shownIds(bell());
      const api = (await myNotifications(secondUser.page, { status: 'all', rows: PAGE_SIZE })).items;
      expect(shown, 'the All tab lists the first page of the non-archived inbox').toEqual(api.map((i) => i.id).slice(0, shown.length));
      expect(api.every((i) => !i.isArchived), 'no archived item among them').toBe(true);
    });

    await steps.step('Compare the arrival times of the listed notifications from top to bottom - most recent to oldest', async () => {
      const api = (await myNotifications(secondUser.page, { status: 'all', rows: 50 })).items;
      expect(orderProblems(shown, api)).toEqual([]);
    });

    await steps.step('Trigger a brand-new notification to arrive - it appears at the very top of the All tab list', async () => {
      const batch = await bellFeed.prepareNotifications(1);
      await bellFeed.fireNotificationEvent();
      // Delivery is proven first, so a failure below can only mean the OPEN list did not show the arrival.
      const arrived = (await bellFeed.awaitNotifications(batch, 1))[0]?.id ?? '';
      expect(arrived, `the new suite notification "${batch.word}" reached the inbox (GetMyNotifications)`).not.toBe('');
      await expect.poll(() => topRowText(bell()), { message: `the top row of the open All tab carries "${batch.word}" (delivered as inbox item ${arrived}; the panel stayed open)`, timeout: LIVE_TIMEOUT_MS }).toContain(batch.word);
    });
  });
});
