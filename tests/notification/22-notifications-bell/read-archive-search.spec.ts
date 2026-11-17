import {
  test,
  expect,
  clickRowAndLeave,
  messagesContaining,
  notificationsOf,
  presenceByTab,
  restoreControlCount,
  rowButtonCount,
  shownIds,
  unreadOnlyClasses,
} from '../../../utils/notification/writerFHelpers';
import type { TestSteps } from '../../../fixtures/testStatus.fixture';
import type { SecondUser } from '../../../fixtures/notificationModule.fixture';
import { SUITE_DEFINITION_PREFIX, inboxAction, myNotifications, notificationUnreadCount } from '../../../utils/notification/notificationApi';
import type { InboxNotification } from '../../../utils/notification/notificationApi';
import { CASES, LIVE_TIMEOUT_MS, NO_MATCH_WORD, RESTORE_ID_FRAGMENTS, SEVERAL, TEXT, TIME_AGO } from '../../../data/notification/notificationsBell.data';

/** Azure step 1: the module, in the second user's session. */
async function openModule(steps: TestSteps, user: SecondUser, expected: string): Promise<void> {
  await steps.critical(`Navigate to the Notification Center Management module - ${expected}`, async () => {
    await user.center.open();
    await expect(user.notificationBell.bellButton(), 'the Notifications bell in the top bar').toBeVisible();
  });
}

const ids = (items: readonly { id: string }[]): string[] => items.map((i) => i.id).sort();
const norm = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** Every non-archived item of the account (what a search on All may show). */
async function listedInbox(user: SecondUser): Promise<InboxNotification[]> {
  return (await myNotifications(user.page, { status: 'all', rows: 500 })).items;
}

/**
 * User story 21010: Notifications bell - Mark all as read, reading, archiving,
 * searching, the tab decision table, the row's parts and per-user isolation.
 * Only SUITE notifications are read or archived; the bell is searched by the
 * batch's unique word to reach them.
 */
test.describe('US 21010 - Notifications bell (read, archive, search)', () => {
  test.describe.configure({ timeout: 12 * 60_000 });

  test(`TC-${CASES.markAllRead.azureId}: should clear every unread notification and zero the count with Mark all as read`, async ({ steps, secondUser, bellFeed }) => {
    const bell = (): typeof secondUser.notificationBell => secondUser.notificationBell;
    let mine: string[] = [];
    let word = '';
    await steps.critical(`Precondition: the user has multiple unread notifications (${SEVERAL} suite notifications)`, async () => {
      const { batch, items } = await bellFeed.notifications(SEVERAL);
      mine = items.map((i) => i.id);
      word = batch.word;
      expect(items.every((i) => !i.isSeen)).toBe(true);
    });
    await openModule(steps, secondUser, 'the dashboard loads');

    await steps.step('Open the bell panel - it shows several unread notifications', async () => {
      await bell().open();
      await bell().openTab('unread');
      expect(await shownIds(bell()), 'the Unread tab lists the suite notifications').toEqual(expect.arrayContaining(mine));
    });

    await steps.step("Click 'Mark all as read' - every unread notification becomes read", async () => {
      expect(await bell().markAllRead(), 'MarkAllAsRead answer').toBeLessThan(300);
      expect((await notificationsOf(secondUser.page, word, 'unread')).map((i) => i.id), 'suite notifications still unread').toEqual([]);
      await expect(bell().control('empty')).toHaveText(TEXT.caughtUp);
    });

    await steps.step('Check the bell count - the unread bell count goes to zero', async () => {
      await expect.poll(() => bell().badgeText(), { message: 'the bell badge after Mark all as read', timeout: LIVE_TIMEOUT_MS }).toBe('');
      expect(await notificationUnreadCount(secondUser.page), 'GetUnreadCount').toBe(0);
    });
  });

  test(`TC-${CASES.markAllReadDisabled.azureId}: should disable Mark all as read when nothing is unread`, async ({ steps, secondUser }) => {
    const bell = (): typeof secondUser.notificationBell => secondUser.notificationBell;
    await steps.critical('Precondition: the user has zero unread notifications (Mark all as read through the API)', async () => {
      const answer = await inboxAction.markAllNotificationsRead(secondUser.page);
      expect(answer.status).toBeLessThan(300);
      expect(await notificationUnreadCount(secondUser.page)).toBe(0);
    });
    await steps.critical('Navigate to the Notification Center Management module - the dashboard loads with an unread count of zero', async () => {
      await secondUser.center.open();
      await expect(bell().bellButton()).toBeVisible();
      expect(await bell().badgeText(), 'the bell badge').toBe('');
    });

    await steps.step('Open the bell panel - the panel loads', async () => {
      await bell().open();
      await expect(bell().control('title')).toHaveText(TEXT.panelTitle);
    });

    await steps.step("Check the 'Mark all as read' control - it is disabled", async () => {
      await expect(bell().control('markAllRead')).toBeDisabled();
    });
  });

  test(`TC-${CASES.archiveMarksRead.azureId}: should move an archived notification out of All and Read into Archived, as read`, async ({ steps, secondUser, bellFeed }) => {
    const bell = (): typeof secondUser.notificationBell => secondUser.notificationBell;
    let item: InboxNotification | undefined;
    let word = '';
    await steps.critical('Precondition: the user has an unread notification in the All tab (a suite notification)', async () => {
      const { batch, items } = await bellFeed.notifications(1);
      item = items[0];
      word = batch.word;
      expect(item?.isSeen).toBe(false);
    });
    await openModule(steps, secondUser, 'the dashboard loads');

    await steps.step('Open the bell panel and click Archive on the unread notification - it disappears from the All and Read tabs', async () => {
      const id = item?.id ?? '';
      await bell().open();
      await bell().search(word);
      expect(await bell().archive(id), 'ArchiveForMe answer').toBeLessThan(300);
      const presence = await presenceByTab(bell(), word, [id]);
      expect({ all: presence.all, read: presence.read }).toEqual({ all: [], read: [] });
    });

    await steps.step('Open the Archived tab - the archived notification is listed there, marked as read', async () => {
      const id = item?.id ?? '';
      await bell().openTab('archived');
      expect(await shownIds(bell())).toContain(id);
      const stored = (await notificationsOf(secondUser.page, word, 'archived')).find((n) => n.id === id);
      expect({ archived: stored?.isArchived, read: stored?.isSeen }, 'the inbox record of the archived notification').toEqual({ archived: true, read: true });
    });
  });

  test(`TC-${CASES.searchKeyword.azureId}: should show only the notifications whose message contains the searched keyword`, async ({ steps, secondUser, bellFeed }) => {
    const bell = (): typeof secondUser.notificationBell => secondUser.notificationBell;
    let word = '';
    let mine: string[] = [];
    await steps.critical('Precondition: the user has notifications with varied text (two suite notifications carrying a unique keyword)', async () => {
      const { batch, items } = await bellFeed.notifications(2);
      word = batch.word;
      mine = ids(items);
      expect(mine).toHaveLength(2);
    });
    await openModule(steps, secondUser, 'the dashboard loads');

    await steps.step('Open the bell panel - the panel shows all notifications', async () => {
      await bell().open();
      await expect(bell().rowElements().first()).toBeVisible();
    });

    await steps.step('Type a keyword known to appear in some messages into Search - only the matching notifications are listed', async () => {
      await bell().search(word);
      const expected = ids(messagesContaining(await listedInbox(secondUser), word));
      expect((await shownIds(bell())).sort(), `rows for "${word}"`).toEqual(expected);
      expect(expected).toEqual(mine);
    });

    await steps.step('Type a keyword that matches no message - the list shows no results', async () => {
      await bell().search(NO_MATCH_WORD);
      expect(messagesContaining(await listedInbox(secondUser), NO_MATCH_WORD)).toEqual([]);
      expect(await shownIds(bell()), `rows for "${NO_MATCH_WORD}"`).toEqual([]);
    });
  });

  test(`TC-${CASES.searchBothLanguages.azureId}: should match the keyword in the English and in the Arabic message text`, async ({ steps, secondUser, bellFeed }) => {
    const bell = (): typeof secondUser.notificationBell => secondUser.notificationBell;
    let english = '';
    let arabic = '';
    let id = '';
    await steps.critical('Precondition: a notification whose English message holds a unique English word and whose Arabic message holds a unique Arabic word', async () => {
      const { batch, items } = await bellFeed.notifications(1);
      english = batch.word;
      arabic = batch.arabicWord;
      id = items[0]?.id ?? '';
      expect({ en: items[0]?.englishMessage.includes(english), ar: items[0]?.arabicMessage.includes(arabic), enInAr: items[0]?.arabicMessage.includes(english) })
        .toEqual({ en: true, ar: true, enInAr: false });
    });
    await openModule(steps, secondUser, 'the dashboard loads');

    await steps.step('Open the bell panel - the panel shows notifications', async () => {
      await bell().open();
      await expect(bell().control('search')).toBeVisible();
    });

    await steps.step('Type a keyword known to appear only in an English message - the matching notification is shown', async () => {
      await bell().search(english);
      expect((await shownIds(bell())).sort()).toEqual(ids(messagesContaining(await listedInbox(secondUser), english)));
      expect(await shownIds(bell())).toContain(id);
    });

    await steps.step('Clear the search and type a keyword known to appear only in an Arabic message - the matching notification is shown', async () => {
      await bell().search('');
      await bell().search(arabic);
      expect((await shownIds(bell())).sort()).toEqual(ids(messagesContaining(await listedInbox(secondUser), arabic)));
      expect(await shownIds(bell())).toContain(id);
    });
  });

  test(`TC-${CASES.archiveAvailability.azureId}: should offer Archive only on the main tabs and no way to restore an archived notification`, async ({ steps, secondUser, bellFeed }) => {
    const bell = (): typeof secondUser.notificationBell => secondUser.notificationBell;
    const state = { word: '', unread: '', read: '', archived: '' };
    await steps.critical('Precondition: suite notifications in every state - one unread, one read, one archived', async () => {
      const { batch, items } = await bellFeed.notifications(3);
      Object.assign(state, { word: batch.word, unread: items[0].id, read: items[1].id, archived: items[2].id });
      expect((await inboxAction.markNotificationRead(secondUser.page, state.read)).status).toBeLessThan(300);
      expect((await inboxAction.archiveNotification(secondUser.page, state.archived)).status).toBeLessThan(300);
    });
    await openModule(steps, secondUser, 'the dashboard loads');

    await steps.step('Open the bell panel and check the All, Unread and Read tabs - each row shows an Archive action', async () => {
      await bell().open();
      await bell().search(state.word);
      const offered: Record<string, boolean> = {};
      offered.allUnread = await bell().rowPart(state.unread, 'archive-button').isVisible();
      offered.allRead = await bell().rowPart(state.read, 'archive-button').isVisible();
      await bell().openTab('unread');
      offered.unreadTab = await bell().rowPart(state.unread, 'archive-button').isVisible();
      await bell().openTab('read');
      offered.readTab = await bell().rowPart(state.read, 'archive-button').isVisible();
      expect(offered).toEqual({ allUnread: true, allRead: true, unreadTab: true, readTab: true });
    });

    await steps.step('Open the Archived tab - rows in this tab show no Archive action', async () => {
      await bell().openTab('archived');
      await expect(bell().row(state.archived)).toBeVisible();
      await expect(bell().rowPart(state.archived, 'archive-button')).toHaveCount(0);
    });

    await steps.step("Check the Archived tab for any 'restore' or 'unarchive' control - no such action exists", async () => {
      expect({ restoreControls: await restoreControlCount(bell(), RESTORE_ID_FRAGMENTS), rowButtons: await rowButtonCount(bell(), state.archived) })
        .toEqual({ restoreControls: 0, rowButtons: 0 });
    });
  });

  test(`TC-${CASES.unreadToRead.azureId}: should move a notification from the Unread tab to the Read tab once it is opened`, async ({ steps, secondUser, bellFeed }) => {
    const bell = (): typeof secondUser.notificationBell => secondUser.notificationBell;
    let id = '';
    let word = '';
    await steps.critical('Precondition: an unread notification is visible in the Unread tab (a suite notification)', async () => {
      const { batch, items } = await bellFeed.notifications(1);
      id = items[0]?.id ?? '';
      word = batch.word;
      expect(items[0]?.isSeen).toBe(false);
    });
    await openModule(steps, secondUser, 'the dashboard loads');

    await steps.step('Open the bell panel and view the Unread tab - the notification is listed there', async () => {
      await bell().open();
      await bell().openTab('unread');
      expect(await shownIds(bell())).toContain(id);
    });

    await steps.step('Click the notification row - it is marked read', async () => {
      const path = await clickRowAndLeave(secondUser.page, bell(), id, '/notifications/');
      expect(path, 'the row opens the notification detail page').toContain('/notifications/');
      await expect.poll(async () => (await notificationsOf(secondUser.page, word)).find((n) => n.id === id)?.isSeen, { message: 'the inbox record reads seen', timeout: LIVE_TIMEOUT_MS }).toBe(true);
    });

    await steps.step('Check the Unread tab, then the Read tab - it no longer appears under Unread and now appears under Read', async () => {
      const presence = await presenceByTab(bell(), word, [id]);
      expect({ unread: presence.unread, read: presence.read }).toEqual({ unread: [], read: [id] });
    });
  });

  test(`TC-${CASES.rowAnatomy.azureId}: should show the unread dot, the type, the time since arrival and the message on each row`, async ({ steps, secondUser, bellFeed }) => {
    const bell = (): typeof secondUser.notificationBell => secondUser.notificationBell;
    let unread: InboxNotification | undefined;
    let read: InboxNotification | undefined;
    let word = '';
    await steps.critical('Precondition: at least one unread notification (two suite notifications, one of them read for comparison)', async () => {
      const { batch, items } = await bellFeed.notifications(2);
      [unread, read] = items;
      word = batch.word;
      expect((await inboxAction.markNotificationRead(secondUser.page, read?.id ?? '')).status).toBeLessThan(300);
    });
    await openModule(steps, secondUser, 'the dashboard loads');

    await steps.step('Open the bell panel - the list displays', async () => {
      await bell().open();
      await bell().search(word);
      await expect(bell().row(unread?.id ?? '')).toBeVisible();
    });

    await steps.step('Inspect an unread notification row - it shows an unread dot, the type label, how long ago it arrived and the message', async () => {
      const rows = await bell().readRows();
      const u = rows.find((r) => r.id === unread?.id);
      const r = rows.find((x) => x.id === read?.id);
      expect(u && r, 'both suite rows are listed').toBeTruthy();
      const marker = unreadOnlyClasses(u, r);
      expect(marker.length, `the unread row's classes "${u?.classes}" vs the read row's "${r?.classes}"`).toBeGreaterThan(0);
      expect({ type: u?.type, typeIsSuite: (u?.type ?? '').startsWith(SUITE_DEFINITION_PREFIX), message: u?.text })
        .toEqual({ type: norm(unread?.type ?? ''), typeIsSuite: true, message: norm(unread?.englishMessage ?? '') });
      expect(u?.time ?? '', 'how long ago it arrived').toMatch(TIME_AGO);
    });
  });

  test(`TC-${CASES.ownNotificationsOnly.azureId}: should keep reading and archiving separate per user and refuse another user's notification`, async ({ steps, page, secondUser, bellFeed, notificationBell, ncCenter }) => {
    const bell = (): typeof secondUser.notificationBell => secondUser.notificationBell;
    const a = { word: '', read: '', archived: '', untouched: '' };
    let adminCopies: InboxNotification[] = [];
    await steps.critical('Precondition: users A (the second user) and B (careconnect) each have their own copies of three suite notifications', async () => {
      const { batch, items } = await bellFeed.notifications(3, { alsoAdmin: true });
      Object.assign(a, { word: batch.word, read: items[0].id, archived: items[1].id, untouched: items[2].id });
      adminCopies = await bellFeed.awaitNotifications(batch, 3, { page });
      expect(adminCopies).toHaveLength(3);
    });
    await openModule(steps, secondUser, 'the dashboard loads as User A');

    await steps.step("Open the bell panel and mark a notification as read, then archive another - User A's notifications update", async () => {
      await bell().open();
      await bell().openTab('unread');
      await clickRowAndLeave(secondUser.page, bell(), a.read, '/notifications/');
      await bell().open();
      await bell().search(a.word);
      expect(await bell().archive(a.archived), 'ArchiveForMe answer').toBeLessThan(300);
      const listed = await notificationsOf(secondUser.page, a.word);
      const archived = await notificationsOf(secondUser.page, a.word, 'archived');
      expect({ read: listed.find((n) => n.id === a.read)?.isSeen, archived: archived.some((n) => n.id === a.archived) }).toEqual({ read: true, archived: true });
    });

    await steps.step("Sign in as User B and open the bell panel - User B sees only their own notifications, unaffected by User A's actions", async () => {
      await ncCenter.open();
      await notificationBell.open();
      await notificationBell.search(a.word);
      expect((await shownIds(notificationBell)).sort(), "User B's rows are User B's own copies").toEqual(ids(adminCopies));
      const now = await notificationsOf(page, a.word);
      expect(now.map((n) => ({ id: n.id, seen: n.isSeen, archived: n.isArchived })).sort((x, y) => x.id.localeCompare(y.id)))
        .toEqual(ids(adminCopies).map((id) => ({ id, seen: false, archived: false })));
    });

    await steps.step("Attempt to access User A's notification by altering the identifier - access is denied or nothing is changed", async () => {
      const markRead = await inboxAction.markNotificationRead(page, a.untouched);
      const archive = await inboxAction.archiveNotification(page, a.untouched);
      const after = (await notificationsOf(secondUser.page, a.word)).find((n) => n.id === a.untouched);
      expect({ seen: after?.isSeen, archived: after?.isArchived ?? true },
        `as User B: MarkAsRead ${markRead.status} ${markRead.text.slice(0, 120)}; ArchiveForMe ${archive.status} ${archive.text.slice(0, 120)}`)
        .toEqual({ seen: false, archived: false });
    });
  });

  test(`TC-${CASES.tabDecisionTable.azureId}: should show each notification only on the tabs that match its read and archive state`, async ({ steps, secondUser, bellFeed }) => {
    const bell = (): typeof secondUser.notificationBell => secondUser.notificationBell;
    const n = { word: '', a: '', b: '', c: '' };
    let presence = { all: [] as string[], unread: [] as string[], read: [] as string[], archived: [] as string[] };
    await steps.critical('Precondition: notification A unread, B read, C archived (three suite notifications)', async () => {
      const { batch, items } = await bellFeed.notifications(3);
      Object.assign(n, { word: batch.word, a: items[0].id, b: items[1].id, c: items[2].id });
      expect((await inboxAction.markNotificationRead(secondUser.page, n.b)).status).toBeLessThan(300);
      expect((await inboxAction.archiveNotification(secondUser.page, n.c)).status).toBeLessThan(300);
    });
    await openModule(steps, secondUser, 'the module loads successfully');

    const where = (id: string): string[] => (['all', 'unread', 'read', 'archived'] as const).filter((t) => presence[t].includes(id));

    await steps.step('Open the panel and locate the unread, not-archived notification across the tabs - it appears in All and Unread only', async () => {
      presence = await presenceByTab(bell(), n.word, [n.a, n.b, n.c]);
      expect(where(n.a)).toEqual(['all', 'unread']);
    });

    await steps.step('Locate the read, not-archived notification across the tabs - it appears in All and Read only', async () => {
      expect(where(n.b)).toEqual(['all', 'read']);
    });

    await steps.step('Locate the archived notification across the tabs - it appears only in Archived', async () => {
      expect(where(n.c)).toEqual(['archived']);
    });
  });
});
