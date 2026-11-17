import { test, expect, unauthenticated } from '../../../utils/notification/writerFHelpers';
import type { TestSteps } from '../../../fixtures/testStatus.fixture';
import type { SecondUser } from '../../../fixtures/notificationModule.fixture';
import { NC_ROUTE } from '../../../constants/notification/notificationIds';
import { NC_API } from '../../../utils/notification/notificationApi';
import { CASES, LAYOUT_MINIMUM, LOAD_MORE_15, PAGE_SIZE, PAGING_MINIMUM, REJECTED_STATUSES, TEXT } from '../../../data/notification/notificationsBell.data';

/** Azure step 1: the module, in the second user's session. */
async function openModule(steps: TestSteps, user: SecondUser, expected: string): Promise<void> {
  await steps.critical(`Navigate to the Notification Center Management module - ${expected}`, async () => {
    await user.center.open();
    await expect(user.notificationBell.bellButton(), 'the Notifications bell in the top bar').toBeVisible();
  });
}

/**
 * User story 21010: Notifications bell - the panel's parts, paging by ten with
 * Load more, and a signed-out visitor. Counting runs on the second user's
 * inbox (topped up with suite notifications when it is too small); 21702
 * searches its own 15 suite notifications so the list holds exactly 15.
 */
test.describe('US 21010 - Notifications bell (panel and paging)', () => {
  test.describe.configure({ timeout: 15 * 60_000 });

  test(`TC-${CASES.panelLayout.azureId}: should bring together search, the four tabs, the list, Load more and Mark all as read in the panel`, async ({ steps, secondUser, bellFeed }) => {
    const bell = (): typeof secondUser.notificationBell => secondUser.notificationBell;
    await steps.critical(`Precondition: the user has notifications across states - at least ${LAYOUT_MINIMUM} listed, so Load more is offered`, async () => {
      expect(await bellFeed.ensureNotificationTotal(LAYOUT_MINIMUM)).toBeGreaterThanOrEqual(LAYOUT_MINIMUM);
    });
    await openModule(steps, secondUser, 'the dashboard loads');

    await steps.step('Click the bell icon - the panel opens', async () => {
      await bell().open();
      await expect(bell().control('title')).toHaveText(TEXT.panelTitle);
    });

    await steps.step('Inspect the panel layout - Search, the All / Unread / Read / Archived tabs, the list, Load more and Mark all as read are shown together', async () => {
      const parts = {
        search: await bell().control('search').isVisible(),
        all: await bell().tab('all').isVisible(),
        unread: await bell().tab('unread').isVisible(),
        read: await bell().tab('read').isVisible(),
        archived: await bell().tab('archived').isVisible(),
        list: await bell().control('list').isVisible(),
        loadMore: await bell().control('loadMore').isVisible(),
        markAllRead: await bell().control('markAllRead').isVisible(),
      };
      expect(parts).toEqual({ search: true, all: true, unread: true, read: true, archived: true, list: true, loadMore: true, markAllRead: true });
    });
  });

  test(`TC-${CASES.loadMoreTens.azureId}: should load ten notifications at a time and add the next ten on each Load more`, async ({ steps, secondUser, bellFeed }) => {
    const bell = (): typeof secondUser.notificationBell => secondUser.notificationBell;
    let total = 0;
    await steps.critical(`Precondition: more than twenty notifications are listed (topped up to ${PAGING_MINIMUM} with suite notifications when fewer)`, async () => {
      total = await bellFeed.ensureNotificationTotal(PAGING_MINIMUM);
      expect(total).toBeGreaterThan(2 * PAGE_SIZE);
    });
    await openModule(steps, secondUser, 'the dashboard loads');

    await steps.step(`Open the bell panel on the All tab - exactly ${PAGE_SIZE} notifications are displayed`, async () => {
      await bell().open();
      await expect(bell().rowElements()).toHaveCount(PAGE_SIZE);
    });

    await steps.step(`Click 'Load more' - ${PAGE_SIZE} more are appended, ${2 * PAGE_SIZE} in total`, async () => {
      expect(await bell().loadMore(), 'Load more is offered').toBe(true);
      await expect(bell().rowElements()).toHaveCount(2 * PAGE_SIZE);
    });

    await steps.step('Click \'Load more\' again - the next batch is appended', async () => {
      expect(await bell().loadMore(), 'Load more is offered again').toBe(true);
      await expect(bell().rowElements()).toHaveCount(Math.min(3 * PAGE_SIZE, total));
    });
  });

  test(`TC-${CASES.loadMoreDisappears.azureId}: should hide Load more once every notification has loaded`, async ({ steps, secondUser, bellFeed }) => {
    const bell = (): typeof secondUser.notificationBell => secondUser.notificationBell;
    let word = '';
    await steps.critical(`Precondition: the user has ${LOAD_MORE_15} notifications in the list (${LOAD_MORE_15} suite notifications, listed by searching their word)`, async () => {
      const { batch, items } = await bellFeed.notifications(LOAD_MORE_15);
      word = batch.word;
      expect(items).toHaveLength(LOAD_MORE_15);
    });
    await openModule(steps, secondUser, 'the module loads successfully');

    await steps.step(`Open the bell panel on the All tab - the first ${PAGE_SIZE} notifications display with Load more visible`, async () => {
      await bell().open();
      await bell().search(word);
      await expect(bell().rowElements()).toHaveCount(PAGE_SIZE);
      await expect(bell().control('loadMore')).toBeVisible();
    });

    await steps.step(`Click Load more - the remaining ${LOAD_MORE_15 - PAGE_SIZE} load, ${LOAD_MORE_15} shown in total`, async () => {
      expect(await bell().loadMore(), 'Load more is offered').toBe(true);
      await expect(bell().rowElements()).toHaveCount(LOAD_MORE_15);
    });

    await steps.step('Check whether the Load more control is still present - it is no longer shown', async () => {
      await expect(bell().control('loadMore')).toBeHidden();
    });
  });

  test(`TC-${CASES.signedOut.azureId}: should give a signed-out visitor neither the bell nor any notification data`, async ({ steps, visitor }) => {
    await steps.step('Navigate to the Notification Center Management module while signed out - the sign-in page is shown, not the dashboard', async () => {
      await visitor.screen.visit(NC_ROUTE);
      await expect(visitor.screen.loginForm()).toBeVisible();
      await expect(visitor.screen.header()).toBeHidden();
    });

    await steps.step('Look in the top bar for the Notifications bell - the bell icon is not present', async () => {
      await expect(visitor.notificationBell.bellButton()).toBeHidden();
    });

    await steps.step('Request the notification panel data without a valid session - the request is rejected and no data is returned', async () => {
      const list = await unauthenticated(visitor.page, 'POST', NC_API.myNotifications, { pageNumber: 1, rowsPerPage: 10, status: 'all' });
      const count = await unauthenticated(visitor.page, 'GET', NC_API.notificationUnreadCount);
      const rejected = REJECTED_STATUSES as readonly number[];
      expect({ list: rejected.includes(list.status), count: rejected.includes(count.status) }, `GetMyNotifications ${list.status} ${list.text}; GetUnreadCount ${count.status} ${count.text}`)
        .toEqual({ list: true, count: true });
      expect({ list: list.hasPayload, count: count.hasPayload }).toEqual({ list: false, count: false });
    });
  });
});
