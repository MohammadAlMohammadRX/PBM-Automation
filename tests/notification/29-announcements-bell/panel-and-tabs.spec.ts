import {
  test,
  expect,
  AppScreen,
  archiveSuiteAnnouncementsOnMainTabs,
  nonSuiteAnnouncementsOnMainTabs,
  messagesContaining,
  openCapturingStatus,
  orderProblems,
  presenceByTab,
  requireOrBlock,
  shownIds,
  unauthenticated,
  unreadOnlyClasses,
} from '../../../utils/notification/writerFHelpers';
import type { TestSteps } from '../../../fixtures/testStatus.fixture';
import type { SecondUser } from '../../../fixtures/notificationModule.fixture';
import { AppRoutes } from '../../../constants/AppRoutes';
import { NC_ROUTE } from '../../../constants/notification/notificationIds';
import { NC_API, inboxAction, myAnnouncements } from '../../../utils/notification/notificationApi';
import type { InboxTab } from '../../../utils/notification/notificationApi';
import { CASES, NOT_EMPTIABLE, REJECTED_STATUSES, SEARCH_AR, SEARCH_EN, SEARCH_MESSAGES, TEXT } from '../../../data/notification/announcementsBell.data';

/** Azure step 1: the module, in the second user's session. */
async function openModule(steps: TestSteps, user: SecondUser, expected: string): Promise<void> {
  await steps.critical(`Navigate to the Notification Center Management module - ${expected}`, async () => {
    await user.center.open();
    await expect(user.announcementBell.bellButton(), 'the Announcements bell in the top bar').toBeVisible();
  });
}

const sortedIds = (items: readonly { id: string }[]): string[] => items.map((i) => i.id).sort();

/** The API's own items for a status tab, in its order. */
async function apiTab(user: SecondUser, status: InboxTab): Promise<string[]> {
  return (await myAnnouncements(user.page, { status, rows: 200 })).items.map((a) => a.id);
}

/**
 * User story 21018: Announcements bell - the panel: unread highlight, the bell
 * for every user, search in both languages, the four tabs, the empty state,
 * the tab decision table and a signed-out visitor. Reads run on the second
 * user's own small inbox; only suite announcements are read or archived.
 */
test.describe('US 21018 - Announcements bell (panel and tabs)', () => {
  test.describe.configure({ timeout: 12 * 60_000 });

  test(`TC-${CASES.unreadHighlighted.azureId}: should highlight unread announcements in the open panel`, async ({ steps, secondUser, bellFeed }) => {
    const bell = (): typeof secondUser.announcementBell => secondUser.announcementBell;
    const a = { word: '', unread: '', read: '' };
    await steps.critical('Precondition: a mix of read and unread announcements (two suite announcements, one of them read)', async () => {
      const { batch, items } = await bellFeed.announcements(2);
      Object.assign(a, { word: batch.word, unread: items[0].id, read: items[1].id });
      expect((await inboxAction.markAnnouncementRead(secondUser.page, a.read)).status).toBeLessThan(300);
    });
    await openModule(steps, secondUser, 'the top bar with the Announcements bell is displayed');

    await steps.step('Click the Announcements bell icon - the panel opens showing the list of announcements', async () => {
      await bell().open();
      await expect(bell().control('title')).toHaveText(TEXT.panelTitle);
      expect(await shownIds(bell())).toEqual(expect.arrayContaining([a.unread, a.read]));
    });

    await steps.step('Review the rows in the panel - unread announcements are visually highlighted and distinguishable from read ones', async () => {
      const rows = await bell().readRows();
      const u = rows.find((r) => r.id === a.unread);
      const r = rows.find((x) => x.id === a.read);
      expect(unreadOnlyClasses(u, r).length, `the unread row's classes "${u?.classes}" vs the read row's "${r?.classes}"`).toBeGreaterThan(0);
    });
  });

  test(`TC-${CASES.everyUserHasBell.azureId}: should give every signed-in user the Announcements bell without any permission`, async ({ steps, page, secondUser, announcementBell }) => {
    await steps.critical('Navigate to the Notification Center Management module - the top bar is displayed for the signed-in session', async () => {
      await new AppScreen(page).visit(AppRoutes.dashboard);
      await expect(new AppScreen(page).header()).toBeVisible();
    });

    await steps.step('Sign in as a user with no roles or permissions beyond basic sign-in - the Announcements bell icon is visible in the top bar', async () => {
      const role = await secondUser.withRights([]);
      const screen = new AppScreen(secondUser.page);
      await screen.visit(AppRoutes.dashboard);
      expect(role.name, 'the suite role holding no rights').not.toBe('');
      await expect(secondUser.announcementBell.bellButton()).toBeVisible();
    });

    await steps.step('Sign in as a user holding an administrator role - the Announcements bell icon is likewise visible', async () => {
      await new AppScreen(page).visit(AppRoutes.dashboard);
      await expect(announcementBell.bellButton()).toBeVisible();
    });
  });

  test(`TC-${CASES.searchBothLanguages.azureId}: should list only the announcements whose English or Arabic message contains the searched word`, async ({ steps, secondUser, bellFeed }) => {
    const bell = (): typeof secondUser.announcementBell => secondUser.announcementBell;
    const a = { en: '', ar: '' };
    await steps.critical(`Precondition: one announcement whose English message holds "${SEARCH_EN}" and another whose Arabic message holds "${SEARCH_AR}"`, async () => {
      const { batch } = await bellFeed.announcements(2, {
        english: (word, i) => SEARCH_MESSAGES.english(word)[i],
        arabic: (arWord, i) => SEARCH_MESSAGES.arabic(arWord)[i],
      });
      const mine = await bellFeed.awaitAnnouncements(batch, 2);
      a.en = mine.find((m) => m.announcementId === batch.records[0].id)?.id ?? '';
      a.ar = mine.find((m) => m.announcementId === batch.records[1].id)?.id ?? '';
      expect({ en: a.en !== '', ar: a.ar !== '' }).toEqual({ en: true, ar: true });
    });
    await openModule(steps, secondUser, 'the top bar with the Announcements bell is displayed');

    await steps.step('Click the Announcements bell icon - the panel opens with the Search field visible', async () => {
      await bell().open();
      await expect(bell().control('search')).toBeVisible();
    });

    await steps.step(`Type an English word known to exist in one announcement's message ("${SEARCH_EN}") - only announcements whose message contains it are displayed`, async () => {
      await bell().search(SEARCH_EN);
      const expected = sortedIds(messagesContaining((await myAnnouncements(secondUser.page, { status: 'all', rows: 200 })).items, SEARCH_EN));
      const shown = await shownIds(bell());
      expect(shown.slice().sort(), `rows for "${SEARCH_EN}"`).toEqual(expected);
      expect({ hasEnglish: shown.includes(a.en), hasArabicOnly: shown.includes(a.ar) }).toEqual({ hasEnglish: true, hasArabicOnly: false });
    });

    await steps.step(`Clear the search and type an Arabic word known to exist in another announcement's message ("${SEARCH_AR}") - only those announcements are displayed`, async () => {
      await bell().search('');
      await bell().search(SEARCH_AR);
      const expected = sortedIds(messagesContaining((await myAnnouncements(secondUser.page, { status: 'all', rows: 200 })).items, SEARCH_AR));
      const shown = await shownIds(bell());
      expect(shown.slice().sort(), `rows for "${SEARCH_AR}"`).toEqual(expected);
      expect({ hasArabic: shown.includes(a.ar), hasEnglishOnly: shown.includes(a.en) }).toEqual({ hasArabic: true, hasEnglishOnly: false });
    });
  });

  test(`TC-${CASES.tabsSwitch.azureId}: should list on each of All, Unread, Read and Archived only the announcements of that state`, async ({ steps, secondUser, bellFeed }) => {
    const bell = (): typeof secondUser.announcementBell => secondUser.announcementBell;
    const a = { unread: '', read: '', archived: '' };
    await steps.critical('Precondition: one announcement in each state - unread, read, archived (three suite announcements)', async () => {
      const { items } = await bellFeed.announcements(3);
      Object.assign(a, { unread: items[0].id, read: items[1].id, archived: items[2].id });
      expect((await inboxAction.markAnnouncementRead(secondUser.page, a.read)).status).toBeLessThan(300);
      expect((await inboxAction.archiveAnnouncement(secondUser.page, a.archived)).status).toBeLessThan(300);
    });
    await openModule(steps, secondUser, 'the top bar with the Announcements bell is displayed');

    await steps.step('Click the Announcements bell icon - the panel opens with the four tabs All, Unread, Read and Archived, All selected by default', async () => {
      const status = await openCapturingStatus(secondUser.page, bell(), NC_API.myAnnouncements);
      const tabs = await Promise.all((['all', 'unread', 'read', 'archived'] as const).map((t) => bell().tab(t).isVisible()));
      expect({ status, tabs }).toEqual({ status: 'all', tabs: [true, true, true, true] });
    });

    await steps.step('Click the Unread tab - only unread announcements are listed', async () => {
      await bell().openTab('unread');
      const shown = await shownIds(bell());
      expect(shown).toEqual((await apiTab(secondUser, 'unread')).slice(0, shown.length));
      expect({ unread: shown.includes(a.unread), read: shown.includes(a.read), archived: shown.includes(a.archived) }).toEqual({ unread: true, read: false, archived: false });
    });

    await steps.step('Click the Read tab - only announcements marked as read are listed', async () => {
      await bell().openTab('read');
      const shown = await shownIds(bell());
      expect(shown).toEqual((await apiTab(secondUser, 'read')).slice(0, shown.length));
      expect({ unread: shown.includes(a.unread), read: shown.includes(a.read), archived: shown.includes(a.archived) }).toEqual({ unread: false, read: true, archived: false });
    });

    await steps.step('Click the Archived tab - only archived announcements are listed', async () => {
      await bell().openTab('archived');
      const shown = await shownIds(bell());
      expect(shown).toEqual((await apiTab(secondUser, 'archived')).slice(0, shown.length));
      expect({ unread: shown.includes(a.unread), read: shown.includes(a.read), archived: shown.includes(a.archived) }).toEqual({ unread: false, read: false, archived: true });
    });

    await steps.step('Click the All tab - every non-archived announcement is listed, newest first', async () => {
      await bell().openTab('all');
      const shown = await shownIds(bell());
      const api = (await myAnnouncements(secondUser.page, { status: 'all', rows: 200 })).items;
      expect(shown).toEqual(api.map((x) => x.id).slice(0, shown.length));
      expect({ unread: shown.includes(a.unread), read: shown.includes(a.read), archived: shown.includes(a.archived) }).toEqual({ unread: true, read: true, archived: false });
      expect(orderProblems(shown, api)).toEqual([]);
    });
  });

  test(`TC-${CASES.caughtUp.azureId}: should say "${TEXT.caughtUp}" when no announcement is left on the main tabs`, async ({ steps, secondUser }) => {
    const bell = (): typeof secondUser.announcementBell => secondUser.announcementBell;
    await steps.critical('Precondition: no announcement on the All, Unread or Read tabs (suite ones archived; nothing unread)', async () => {
      // Look first: real announcements cannot be archived (permanent, not the suite's), so block before
      // changing anything when any is listed.
      const others = await nonSuiteAnnouncementsOnMainTabs(secondUser.page);
      requireOrBlock(steps, others.length === 0, NOT_EMPTIABLE(others));
      const read = await inboxAction.markAllAnnouncementsRead(secondUser.page);
      expect(read.status).toBeLessThan(300);
      const left = await archiveSuiteAnnouncementsOnMainTabs(secondUser.page);
      requireOrBlock(steps, left.others.length === 0, NOT_EMPTIABLE(left.others));
      expect((await myAnnouncements(secondUser.page, { status: 'all', rows: 1 })).totalRows).toBe(0);
    });
    await steps.critical('Navigate to the Notification Center Management module - the Announcements bell is displayed with no unread count', async () => {
      await secondUser.center.open();
      await expect(bell().bellButton()).toBeVisible();
      expect(await bell().badgeText()).toBe('');
    });

    await steps.step('Open the Announcements panel - the All tab is selected by default', async () => {
      expect(await openCapturingStatus(secondUser.page, bell(), NC_API.myAnnouncements), 'the first list request asks status').toBe('all');
    });

    await steps.step(`Review the list area - the message "${TEXT.caughtUp}" is displayed`, async () => {
      await expect(bell().control('empty')).toHaveText(TEXT.caughtUp);
    });
  });

  test(`TC-${CASES.tabDecisionTable.azureId}: should show each announcement only on the tabs that match its read and archive state`, async ({ steps, secondUser, bellFeed }) => {
    const bell = (): typeof secondUser.announcementBell => secondUser.announcementBell;
    const a = { word: '', a: '', b: '', c: '' };
    let presence: Record<InboxTab, string[]> = { all: [], unread: [], read: [], archived: [] };
    await steps.critical('Precondition: announcement A unread, B read, C archived (three suite announcements)', async () => {
      const { batch, items } = await bellFeed.announcements(3);
      Object.assign(a, { word: batch.word, a: items[0].id, b: items[1].id, c: items[2].id });
      expect((await inboxAction.markAnnouncementRead(secondUser.page, a.b)).status).toBeLessThan(300);
      expect((await inboxAction.archiveAnnouncement(secondUser.page, a.c)).status).toBeLessThan(300);
    });
    await openModule(steps, secondUser, 'the module loads successfully');

    const where = (id: string): string[] => (['all', 'unread', 'read', 'archived'] as const).filter((t) => presence[t].includes(id));

    await steps.step('Open the Announcements panel and locate the unread, not-archived announcement across the tabs - it appears in All and Unread only', async () => {
      presence = await presenceByTab(bell(), a.word, [a.a, a.b, a.c]);
      expect(where(a.a)).toEqual(['all', 'unread']);
    });

    await steps.step('Locate the read, not-archived announcement across the tabs - it appears in All and Read only', async () => {
      expect(where(a.b)).toEqual(['all', 'read']);
    });

    await steps.step('Locate the archived announcement across the tabs - it appears only in Archived', async () => {
      expect(where(a.c)).toEqual(['archived']);
    });
  });

  test(`TC-${CASES.signedOut.azureId}: should give a signed-out visitor neither the Announcements bell nor any announcement data`, async ({ steps, visitor }) => {
    await steps.step('Navigate to the Notification Center Management module while signed out - the sign-in page is shown, not the dashboard', async () => {
      await visitor.screen.visit(NC_ROUTE);
      await expect(visitor.screen.loginForm()).toBeVisible();
      await expect(visitor.screen.header()).toBeHidden();
    });

    await steps.step('Look in the top bar for the Announcements (megaphone) bell - the bell icon is not present', async () => {
      await expect(visitor.announcementBell.bellButton()).toBeHidden();
    });

    await steps.step('Request the Announcements panel data without a valid session - the request is rejected and no data is returned', async () => {
      const list = await unauthenticated(visitor.page, 'POST', NC_API.myAnnouncements, { pageNumber: 1, rowsPerPage: 10, status: 'all' });
      const count = await unauthenticated(visitor.page, 'GET', NC_API.announcementUnreadCount);
      const rejected = REJECTED_STATUSES as readonly number[];
      expect({ list: rejected.includes(list.status), count: rejected.includes(count.status) }, `GetMyAnnouncements ${list.status} ${list.text}; GetUnreadCount ${count.status} ${count.text}`)
        .toEqual({ list: true, count: true });
      expect({ list: list.hasPayload, count: count.hasPayload }).toEqual({ list: false, count: false });
    });
  });
});

