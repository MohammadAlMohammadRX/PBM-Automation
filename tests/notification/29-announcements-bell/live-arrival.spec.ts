import { test, expect, AppScreen, armPopupRecorder, awaitLiveConnection, controlLiveConnection, isOnline, markPage, orderProblems, pageKept, popupWith, shownIds, topRowText } from '../../../utils/notification/writerFHelpers';
import type { TestSteps } from '../../../fixtures/testStatus.fixture';
import type { SecondUser } from '../../../fixtures/notificationModule.fixture';
import { AppRoutes } from '../../../constants/AppRoutes';
import { announcementUnreadCount, myAnnouncements } from '../../../utils/notification/notificationApi';
import { BADGE, CASES, LIVE_TIMEOUT_MS, TEXT, UNREAD_LABEL } from '../../../data/notification/announcementsBell.data';

/** Azure step 1: the module, in the second user's session. */
async function openModule(steps: TestSteps, user: SecondUser, expected: string): Promise<void> {
  await steps.critical(`Navigate to the Notification Center Management module - ${expected}`, async () => {
    await user.center.open();
    await expect(user.announcementBell.bellButton(), 'the Announcements bell in the top bar').toBeVisible();
  });
}

/**
 * User story 21018: Announcements bell - live arrival: the pop-up, the new row
 * on top, the count, and the refresh after a reconnection. The publisher is
 * the admin session (suite announcement, Publish at now, audience the second
 * user); "without a refresh" = the window marker is still there.
 */
test.describe('US 21018 - Announcements bell (live arrival)', () => {
  test.describe.configure({ timeout: 15 * 60_000 });

  test(`TC-${CASES.reconnectRefresh.azureId}: should refresh the announcement list and unread count after the connection comes back`, async ({ steps, secondUser, bellFeed }) => {
    const bell = (): typeof secondUser.announcementBell => secondUser.announcementBell;
    let before = 0;
    let mark = '';
    let word = '';
    let openedBefore = 0;
    await steps.critical('Precondition: the user has unread announcements (a suite announcement)', async () => {
      await bellFeed.announcements(1);
      expect(await announcementUnreadCount(secondUser.page)).toBeGreaterThan(0);
    });
    // The live connection is routed from here on (installed before the module page loads), so the
    // interruption can really drop it: setOffline alone leaves an open WebSocket connected (full run
    // 2026-11-12 - the badge then never moved, and "the connection is lost" was never shown).
    const link = await controlLiveConnection(secondUser.context);
    await openModule(steps, secondUser, 'the Announcements bell shows the current unread count');
    await steps.critical('Precondition: the live connection is active, the current unread count is read and the window is marked (to prove no reload)', async () => {
      expect(await link.waitForLive(20_000), `an open live (WebSocket) connection answered by the server (sockets opened: ${link.opened()})`).toBe(true);
      before = await announcementUnreadCount(secondUser.page);
      await expect.poll(() => bell().badgeText()).toBe(BADGE(before));
      mark = await markPage(secondUser.page);
    });

    await steps.step('Simulate a temporary network interruption that drops the live connection - the connection is lost', async () => {
      await secondUser.context.setOffline(true);
      openedBefore = link.opened();
      const dropped = await link.drop();
      expect({ offline: !(await isOnline(secondUser.page)), droppedLive: dropped > 0, liveOpen: link.openNow() }, `live sockets dropped: ${dropped}`)
        .toEqual({ offline: true, droppedLive: true, liveOpen: 0 });
    });

    await steps.step('Publish a new announcement for the user while the connection is down - it is not yet reflected in the session', async () => {
      const batch = await bellFeed.publishAnnouncements(1);
      word = batch.word;
      expect(await bellFeed.waitPublished(batch.records[0].id), 'the announcement status (admin)').toMatch(/publish/i);
      expect(await bell().badgeText(), 'the badge while offline').toBe(BADGE(before));
    });

    await steps.step('Restore the network connection - the live connection reconnects', async () => {
      link.restore();
      await secondUser.context.setOffline(false);
      expect(await isOnline(secondUser.page), 'the browser reports online').toBe(true);
      expect(await link.waitForNew(openedBefore, 90_000), `the app opened a new live connection within 90 s of the network coming back (sockets opened: ${link.opened()}, open: ${link.openNow()})`).toBe(true);
    });

    await steps.step('Observe the Announcements bell and panel - the unread count and list now include the announcement published during the outage', async () => {
      const settled = await expect.poll(() => bell().badgeText(), { timeout: LIVE_TIMEOUT_MS }).toBe(BADGE(before + 1)).then(() => true, () => false);
      if (!settled) {
        const api = await announcementUnreadCount(secondUser.page);
        const badge = await bell().badgeText();
        expect(badge, `the badge after reconnecting (waited ${LIVE_TIMEOUT_MS / 1000} s; GetUnreadCount answers ${api}; live sockets open ${link.openNow()})`).toBe(BADGE(before + 1));
      }
      await bell().open();
      expect(await topRowText(bell()), 'the top row after reconnecting').toContain(word);
      expect(await pageKept(secondUser.page, mark), 'the page was not reloaded').toBe(true);
    });
  });

  test(`TC-${CASES.livePopup.azureId}: should pop up a new announcement live on whichever page the recipient is`, async ({ steps, secondUser, bellFeed }) => {
    const screen = (): AppScreen => new AppScreen(secondUser.page);
    let mark = '';
    let english = '';
    let live = '';
    await openModule(steps, secondUser, 'the Announcements bell is displayed for the recipient');

    await steps.step('Navigate the recipient session to another page (the dashboard) - the page loads normally', async () => {
      // A recipient "online on any page" has a live connection: wait for it after the full navigation
      // (armed before it) - publishing earlier is simply missed by the page (full run 2026-11-12).
      const connected = awaitLiveConnection(secondUser.page);
      await screen().visit(AppRoutes.dashboard);
      await expect(screen().header()).toBeVisible();
      live = await connected;
      await armPopupRecorder(secondUser.page);
      mark = await markPage(secondUser.page);
    });

    await steps.step('Publish a new announcement targeted at the recipient from the publisher session - it is published', async () => {
      const batch = await bellFeed.publishAnnouncements(1);
      english = batch.english[0];
      expect(await bellFeed.waitPublished(batch.records[0].id)).toMatch(/publish/i);
    });

    await steps.step(`Observe the recipient's session - a '${TEXT.popupTitle}' pop-up shows the message without the page being refreshed`, async () => {
      await expect.poll(() => popupWith(secondUser.page, english), { message: `a pop-up showing "${english}" (${live})`, timeout: LIVE_TIMEOUT_MS }).not.toBe('');
      expect(await popupWith(secondUser.page, english)).toContain(TEXT.popupTitle);
      expect(await pageKept(secondUser.page, mark), 'the page was not reloaded').toBe(true);
    });
  });

  test(`TC-${CASES.newestFirst.azureId}: should list every active announcement newest first and put a freshly published one on top`, async ({ steps, secondUser, bellFeed }) => {
    const bell = (): typeof secondUser.announcementBell => secondUser.announcementBell;
    const mine: string[] = [];
    let shown: string[] = [];
    await steps.critical('Precondition: announcements published at different times (two suite announcements, one after the other arrived)', async () => {
      mine.push(...(await bellFeed.announcements(1)).items.map((i) => i.id));
      mine.push(...(await bellFeed.announcements(1)).items.map((i) => i.id));
      expect(mine).toHaveLength(2);
    });
    await openModule(steps, secondUser, 'the module loads successfully');

    await steps.step('Open the Announcements panel on the All tab - every non-archived announcement is listed', async () => {
      await bell().open();
      shown = await shownIds(bell());
      const api = (await myAnnouncements(secondUser.page, { status: 'all', rows: 200 })).items;
      expect(shown, 'the All tab lists the non-archived inbox').toEqual(api.map((a) => a.id).slice(0, shown.length));
      expect(shown).toEqual(expect.arrayContaining(mine));
    });

    await steps.step('Compare the publish times from top to bottom - most recent to oldest', async () => {
      const api = (await myAnnouncements(secondUser.page, { status: 'all', rows: 200 })).items;
      expect(orderProblems(shown, api)).toEqual([]);
    });

    await steps.step('Trigger a brand-new announcement to be published - it appears at the very top of the All tab list', async () => {
      const batch = await bellFeed.publishAnnouncements(1);
      await expect.poll(() => topRowText(bell()), { message: `the top row of the open All tab carries "${batch.word}"`, timeout: LIVE_TIMEOUT_MS }).toContain(batch.word);
    });
  });

  test(`TC-${CASES.liveArrival.azureId}: should pop up, top the list and raise the count together when an announcement arrives live`, async ({ steps, secondUser, bellFeed }) => {
    const bell = (): typeof secondUser.announcementBell => secondUser.announcementBell;
    let before = 0;
    let mark = '';
    const batch = { word: '', english: '' };
    await openModule(steps, secondUser, 'the module loads successfully');

    await steps.step('With the panel open on the All tab, have an announcement published to this user - a pop-up announces the new item', async () => {
      before = await announcementUnreadCount(secondUser.page);
      await bell().open();
      await armPopupRecorder(secondUser.page);
      mark = await markPage(secondUser.page);
      const made = await bellFeed.publishAnnouncements(1);
      Object.assign(batch, { word: made.word, english: made.english[0] });
      await expect.poll(() => popupWith(secondUser.page, batch.english), { message: `a pop-up showing "${batch.english}"`, timeout: LIVE_TIMEOUT_MS }).not.toBe('');
      expect(await popupWith(secondUser.page, batch.english)).toContain(TEXT.popupTitle);
    });

    await steps.step('Without refreshing, check the top of the All tab list - the new announcement is at the very top', async () => {
      await expect.poll(() => topRowText(bell()), { timeout: LIVE_TIMEOUT_MS }).toContain(batch.word);
      expect(await pageKept(secondUser.page, mark), 'the page was not reloaded').toBe(true);
    });

    await steps.step('At the same time, check the bell and the Unread tab count - both went up by one', async () => {
      await expect.poll(() => bell().badgeText(), { timeout: LIVE_TIMEOUT_MS }).toBe(BADGE(before + 1));
      await expect.poll(() => bell().unreadTabBadge()).toMatch(UNREAD_LABEL(before + 1));
    });
  });
});
