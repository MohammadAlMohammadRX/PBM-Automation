import {
  test,
  expect,
  announcementsOf,
  clickRowAndLeave,
  presenceByTab,
  restoreControlCount,
  rowButtonCount,
  shownIds,
} from '../../../utils/notification/writerFHelpers';
import type { TestSteps } from '../../../fixtures/testStatus.fixture';
import type { SecondUser } from '../../../fixtures/notificationModule.fixture';
import { announcementUnreadCount, inboxAction } from '../../../utils/notification/notificationApi';
import type { InboxAnnouncement } from '../../../utils/notification/notificationApi';
import { BADGE, CASES, LIVE_TIMEOUT_MS, RESTORE_ID_FRAGMENTS } from '../../../data/notification/announcementsBell.data';

/** Azure step 1: the module, in the second user's session. */
async function openModule(steps: TestSteps, user: SecondUser, expected: string): Promise<void> {
  await steps.critical(`Navigate to the Notification Center Management module - ${expected}`, async () => {
    await user.center.open();
    await expect(user.announcementBell.bellButton(), 'the Announcements bell in the top bar').toBeVisible();
  });
}

/**
 * User story 21018: Announcements bell - reading a row (detail page), Mark all
 * as read, archiving (permanent - suite announcements only), no way back from
 * Archived, and per-user isolation (User A = the second user, User B =
 * careconnect, one suite announcement published to both).
 */
test.describe('US 21018 - Announcements bell (read and archive)', () => {
  test.describe.configure({ timeout: 12 * 60_000 });

  test(`TC-${CASES.clickOpensDetail.azureId}: should mark an announcement read and open its detail page when its row is clicked`, async ({ steps, secondUser, bellFeed }) => {
    const bell = (): typeof secondUser.announcementBell => secondUser.announcementBell;
    let item: InboxAnnouncement | undefined;
    let word = '';
    await steps.critical('Precondition: the user has an unread announcement (a suite announcement)', async () => {
      const { batch, items } = await bellFeed.announcements(1);
      item = items[0];
      word = batch.word;
      expect(item?.isSeen).toBe(false);
    });
    await steps.critical('Navigate to the Notification Center Management module - the Announcements bell shows an unread count', async () => {
      await secondUser.center.open();
      await expect.poll(() => bell().badgeText(), { timeout: LIVE_TIMEOUT_MS }).not.toBe('');
    });

    await steps.step('Click the Announcements bell icon - the panel opens with the unread announcement listed', async () => {
      await bell().open();
      await bell().search(word);
      expect(await shownIds(bell())).toContain(item?.id ?? '');
    });

    await steps.step("Click the unread announcement row - the announcement's detail page opens", async () => {
      const path = await clickRowAndLeave(secondUser.page, bell(), item?.id ?? '', '/announcements/');
      expect(path).toBe(`/announcements/${item?.announcementId ?? ''}`);
      await secondUser.announcementDetail.waitForLoaded();
    });

    await steps.step('Return to the panel and check the Unread tab - the announcement no longer appears there', async () => {
      const presence = await presenceByTab(bell(), word, [item?.id ?? '']);
      expect(presence.unread).toEqual([]);
    });

    await steps.step('Check the Read tab - the announcement now appears there', async () => {
      await bell().openTab('read');
      expect(await shownIds(bell())).toContain(item?.id ?? '');
    });
  });

  test(`TC-${CASES.markAllRead.azureId}: should move every unread announcement to Read and clear the badge with Mark all as read`, async ({ steps, secondUser, bellFeed }) => {
    const bell = (): typeof secondUser.announcementBell => secondUser.announcementBell;
    let mine: string[] = [];
    let word = '';
    await steps.critical('Precondition: multiple unread announcements and a non-zero count (two suite announcements)', async () => {
      const { batch, items } = await bellFeed.announcements(2);
      mine = items.map((i) => i.id);
      word = batch.word;
      expect(items.every((i) => !i.isSeen)).toBe(true);
    });
    await steps.critical('Navigate to the Notification Center Management module - the Announcements bell shows a non-zero unread count', async () => {
      await secondUser.center.open();
      await expect.poll(() => bell().badgeText(), { timeout: LIVE_TIMEOUT_MS }).not.toBe('');
    });

    await steps.step("Click the Announcements bell icon - the panel shows unread announcements and an enabled 'Mark all as read'", async () => {
      await bell().open();
      await bell().openTab('unread');
      expect(await shownIds(bell())).toEqual(expect.arrayContaining(mine));
      await expect(bell().control('markAllRead')).toBeEnabled();
    });

    await steps.step("Click 'Mark all as read' - every announcement in the Unread tab moves to the Read tab", async () => {
      expect(await bell().markAllRead(), 'MarkAllAsRead answer').toBeLessThan(300);
      // The open Unread tab (not searched) must be left with no row at all. Its empty-state WORDING is not
      // part of this case (21827 / 21823 assert "You're all caught up." where their test cases quote it).
      await expect.poll(async () => (await bell().readRows()).map((r) => r.type), { message: 'rows still listed on the Unread tab after Mark all as read' }).toEqual([]);
      const presence = await presenceByTab(bell(), word, mine);
      expect({ unread: presence.unread, read: presence.read.slice().sort() }).toEqual({ unread: [], read: mine.slice().sort() });
    });

    await steps.step('Observe the bell icon - the unread count badge is no longer displayed', async () => {
      await expect.poll(() => bell().badgeText(), { timeout: LIVE_TIMEOUT_MS }).toBe('');
      expect(await announcementUnreadCount(secondUser.page)).toBe(0);
    });
  });

  test(`TC-${CASES.archiveMoves.azureId}: should move an archived announcement from the main lists to the Archived tab`, async ({ steps, secondUser, bellFeed }) => {
    const bell = (): typeof secondUser.announcementBell => secondUser.announcementBell;
    let id = '';
    let word = '';
    await steps.critical('Precondition: an announcement in the All tab (a suite announcement, read)', async () => {
      const { batch, items } = await bellFeed.announcements(1);
      id = items[0]?.id ?? '';
      word = batch.word;
      expect((await inboxAction.markAnnouncementRead(secondUser.page, id)).status).toBeLessThan(300);
    });
    await openModule(steps, secondUser, 'the top bar with the Announcements bell is displayed');

    await steps.step('Open the Announcements panel and locate the announcement in the All tab - the Archive action is available on the row', async () => {
      await bell().open();
      await bell().search(word);
      await expect(bell().rowPart(id, 'archive-button')).toBeVisible();
    });

    await steps.step('Click Archive on the announcement - it disappears from the All and Read tabs', async () => {
      expect(await bell().archive(id), 'ArchiveForMe answer').toBeLessThan(300);
      const presence = await presenceByTab(bell(), word, [id]);
      expect({ all: presence.all, read: presence.read }).toEqual({ all: [], read: [] });
    });

    await steps.step('Click the Archived tab - the archived announcement is listed there', async () => {
      await bell().openTab('archived');
      expect(await shownIds(bell())).toContain(id);
    });
  });

  test(`TC-${CASES.archiveMarksRead.azureId}: should mark an unread announcement read when it is archived`, async ({ steps, secondUser, bellFeed }) => {
    const bell = (): typeof secondUser.announcementBell => secondUser.announcementBell;
    let id = '';
    let word = '';
    let before = 0;
    await steps.critical('Precondition: an unread, non-archived announcement (a suite announcement)', async () => {
      const { batch, items } = await bellFeed.announcements(1);
      id = items[0]?.id ?? '';
      word = batch.word;
      expect(items[0]?.isSeen).toBe(false);
    });
    await openModule(steps, secondUser, 'the module loads successfully');

    await steps.step('Open the Announcements panel and confirm the target announcement is unread - it is listed in the Unread tab', async () => {
      before = await announcementUnreadCount(secondUser.page);
      await bell().open();
      await bell().openTab('unread');
      await bell().search(word);
      expect(await shownIds(bell())).toContain(id);
    });

    await steps.step('Click Archive on it directly, without opening it - it disappears from the All, Unread and Read tabs', async () => {
      expect(await bell().archive(id), 'ArchiveForMe answer').toBeLessThan(300);
      const presence = await presenceByTab(bell(), word, [id]);
      expect({ all: presence.all, unread: presence.unread, read: presence.read }).toEqual({ all: [], unread: [], read: [] });
    });

    await steps.step('Open the Archived tab and inspect its state - it is listed as read and the unread bell count has decreased', async () => {
      await bell().openTab('archived');
      expect(await shownIds(bell())).toContain(id);
      const stored = (await announcementsOf(secondUser.page, word, 'archived')).find((a) => a.id === id);
      expect({ archived: stored?.isArchived, read: stored?.isSeen }, 'the inbox record').toEqual({ archived: true, read: true });
      expect(await announcementUnreadCount(secondUser.page), `GetUnreadCount (was ${before})`).toBe(before - 1);
      await expect.poll(() => bell().badgeText(), { timeout: LIVE_TIMEOUT_MS }).toBe(BADGE(before - 1));
    });
  });

  test(`TC-${CASES.noRestore.azureId}: should offer neither Archive nor any restore control for an archived announcement`, async ({ steps, secondUser, bellFeed }) => {
    const bell = (): typeof secondUser.announcementBell => secondUser.announcementBell;
    let id = '';
    let word = '';
    await steps.critical('Precondition: an archived announcement (a suite announcement, archived)', async () => {
      const { batch, items } = await bellFeed.announcements(1);
      id = items[0]?.id ?? '';
      word = batch.word;
      expect((await inboxAction.archiveAnnouncement(secondUser.page, id)).status).toBeLessThan(300);
    });
    await openModule(steps, secondUser, 'the module loads successfully');

    await steps.step('Open the Announcements panel and select the Archived tab - the archived announcement is listed', async () => {
      await bell().open();
      await bell().openTab('archived');
      await bell().search(word);
      await expect(bell().row(id)).toBeVisible();
    });

    await steps.step('Inspect the row for an Archive action - none is shown on the Archived tab', async () => {
      await expect(bell().rowPart(id, 'archive-button')).toHaveCount(0);
    });

    await steps.step("Search the panel and the row for any 'restore' or 'move back' control - none exists", async () => {
      expect({ restoreControls: await restoreControlCount(bell(), RESTORE_ID_FRAGMENTS), rowButtons: await rowButtonCount(bell(), id) })
        .toEqual({ restoreControls: 0, rowButtons: 0 });
    });
  });

  test(`TC-${CASES.ownAnnouncementsOnly.azureId}: should let each user manage only their own announcements without affecting another user`, async ({ steps, page, secondUser, bellFeed, announcementBell, ncCenter }) => {
    const bell = (): typeof secondUser.announcementBell => secondUser.announcementBell;
    const a = { word: '', mine: '', theirs: '' };
    await steps.critical('Precondition: users A (the second user) and B (careconnect) each hold their own copy of one suite announcement', async () => {
      const { batch, items } = await bellFeed.announcements(1, { to: 'both' });
      const adminCopy = (await bellFeed.awaitAnnouncements(batch, 1, { page }))[0];
      Object.assign(a, { word: batch.word, mine: items[0]?.id ?? '', theirs: adminCopy?.id ?? '' });
      expect({ mine: a.mine !== '', theirs: a.theirs !== '', distinct: a.mine !== a.theirs }).toEqual({ mine: true, theirs: true, distinct: true });
    });
    await openModule(steps, secondUser, 'the top bar with the Announcements bell is displayed for User A');

    await steps.step("Sign in as User A and archive one of User A's announcements - it moves to User A's Archived tab", async () => {
      await bell().open();
      await bell().search(a.word);
      expect(await bell().archive(a.mine), 'ArchiveForMe answer').toBeLessThan(300);
      await bell().openTab('archived');
      expect(await shownIds(bell())).toContain(a.mine);
    });

    await steps.step('Sign in as User B - the top bar with the Announcements bell is displayed for User B', async () => {
      await ncCenter.open();
      await expect(announcementBell.bellButton()).toBeVisible();
    });

    await steps.step("Open User B's Announcements panel - User B's own copy is unaffected, with none of User A's actions reflected", async () => {
      await announcementBell.open();
      await announcementBell.search(a.word);
      const shown = await shownIds(announcementBell);
      const copy = (await announcementsOf(page, a.word)).find((x) => x.id === a.theirs);
      expect({ shown, seen: copy?.isSeen, archived: copy?.isArchived }).toEqual({ shown: [a.theirs], seen: false, archived: false });
    });
  });
});
