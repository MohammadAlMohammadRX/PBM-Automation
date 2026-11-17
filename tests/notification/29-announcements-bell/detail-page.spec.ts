import { test, expect, AppScreen, announcementsOf, clickRowAndLeave, riyadhDayForms, screenContentText, wordRowsByTab } from '../../../utils/notification/writerFHelpers';
import type { TestSteps } from '../../../fixtures/testStatus.fixture';
import type { SecondUser } from '../../../fixtures/notificationModule.fixture';
import { AppRoutes } from '../../../constants/AppRoutes';
import { cancelSuiteAnnouncement, readAnnouncement } from '../../../utils/notification/notificationApi';
import type { AnnouncementRecord, InboxAnnouncement } from '../../../utils/notification/notificationApi';
import { CASES, DASHBOARD_URL, DETAIL_DATE, TEXT } from '../../../data/notification/announcementsBell.data';

/** Azure step 1: the module, in the second user's session. */
async function openModule(steps: TestSteps, user: SecondUser, expected: string): Promise<void> {
  await steps.critical(`Navigate to the Notification Center Management module - ${expected}`, async () => {
    await user.center.open();
    await expect(user.announcementBell.bellButton(), 'the Announcements bell in the top bar').toBeVisible();
  });
}

/**
 * User story 21018: Announcements bell - the detail page (/announcements/<id>):
 * name, published date and message in the interface language with Back to the
 * dashboard; "Announcement not found." for a cancelled announcement and for one
 * never published to the user (User C = the second user, the announcement sent
 * to careconnect only).
 */
test.describe('US 21018 - Announcements bell (detail page)', () => {
  test.describe.configure({ timeout: 12 * 60_000 });

  test(`TC-${CASES.detailLanguage.azureId}: should show the announcement in the interface language and return to the dashboard with Back`, async ({ steps, page, secondUser, bellFeed }) => {
    const bell = (): typeof secondUser.announcementBell => secondUser.announcementBell;
    let item: InboxAnnouncement | undefined;
    let record: AnnouncementRecord | null = null;
    let word = '';
    await steps.critical('Precondition: one announcement with content in both languages (a suite announcement)', async () => {
      const { batch, items } = await bellFeed.announcements(1);
      item = items[0];
      word = batch.word;
      record = await readAnnouncement(page, batch.records[0].id);
      expect(record?.publishedOn ?? '', 'the announcement was published').not.toBe('');
    });
    await openModule(steps, secondUser, 'the top bar with the Announcements bell is displayed');

    await steps.step('Click the Announcements bell icon, then click the announcement row - the detail page opens', async () => {
      await bell().open();
      await bell().search(word);
      const path = await clickRowAndLeave(secondUser.page, bell(), item?.id ?? '', '/announcements/');
      expect(path).toBe(`/announcements/${item?.announcementId ?? ''}`);
      await secondUser.announcementDetail.waitForLoaded();
    });

    await steps.step("Review the detail page content - the name, published date and message are shown in the user's interface language", async () => {
      const english = await secondUser.announcementDetail.read();
      expect({ title: english.title, message: english.message, dir: english.dir }).toEqual({ title: record?.name, message: record?.englishMessage, dir: 'ltr' });
      expect(english.date).toMatch(DETAIL_DATE);
      expect(riyadhDayForms(record?.publishedOn ?? '').some((d) => english.date.includes(d)), `the date "${english.date}" names the publish day (${record?.publishedOn})`).toBe(true);
      await secondUser.language.switchTo('ar');
      await expect.poll(async () => (await secondUser.announcementDetail.read()).message, { message: 'the message after switching to Arabic' }).toBe(record?.arabicMessage);
      expect((await secondUser.announcementDetail.read()).dir).toBe('rtl');
      await secondUser.language.switchTo('en');
    });

    await steps.step('Click the Back button - the user is returned to the dashboard', async () => {
      await secondUser.announcementDetail.back();
      await expect(secondUser.page).toHaveURL(DASHBOARD_URL);
    });
  });

  test(`TC-${CASES.cancelledNotFound.azureId}: should show "${TEXT.notFound}" when a cancelled announcement is opened from the panel`, async ({ steps, page, secondUser, bellFeed }) => {
    const bell = (): typeof secondUser.announcementBell => secondUser.announcementBell;
    let item: InboxAnnouncement | undefined;
    let announcementId = '';
    let word = '';
    let english = '';
    await steps.critical('Precondition: the user has an announcement row that is about to be cancelled (a suite announcement)', async () => {
      const { batch, items } = await bellFeed.announcements(1);
      item = items[0];
      word = batch.word;
      english = batch.english[0];
      announcementId = batch.records[0].id;
      expect(item?.announcementId).toBe(announcementId);
    });
    await openModule(steps, secondUser, 'the top bar with the Announcements bell is displayed');

    await steps.step('Open the Announcements panel and note the announcement about to be cancelled - it is listed normally', async () => {
      await bell().open();
      await bell().search(word);
      await expect(bell().row(item?.id ?? '')).toBeVisible();
    });

    await steps.step('Have the announcement cancelled by an administrator - the panel list stays unchanged until refreshed', async () => {
      const answer = await cancelSuiteAnnouncement(page, announcementId);
      expect(answer.status, `CancelAnnouncement answered ${answer.status} ${answer.text.slice(0, 160)}`).toBeLessThan(300);
      expect((await readAnnouncement(page, announcementId))?.status).toMatch(/cancel/i);
      await expect(bell().row(item?.id ?? '')).toBeVisible();
    });

    await steps.step(`Click the now-cancelled announcement's row - "${TEXT.notFound}" is shown instead of the announcement content`, async () => {
      await clickRowAndLeave(secondUser.page, bell(), item?.id ?? '', '/announcements/');
      await expect.poll(() => screenContentText(secondUser.page), { message: 'the text on the screen' }).toContain(TEXT.notFound);
      expect(await screenContentText(secondUser.page), 'the announcement content must not be shown').not.toContain(english);
    });
  });

  test(`TC-${CASES.notARecipient.azureId}: should refuse the detail page of an announcement that was not published to the user`, async ({ steps, page, secondUser, bellFeed, ncCenter }) => {
    let announcementId = '';
    let word = '';
    let english = '';
    await steps.critical('Precondition: an announcement published only to another user (a suite announcement for careconnect, received)', async () => {
      const { batch, items } = await bellFeed.announcements(1, { to: 'admin' });
      announcementId = batch.records[0].id;
      word = batch.word;
      english = batch.english[0];
      expect(items[0]?.announcementId).toBe(announcementId);
    });
    await steps.critical('Navigate to the Notification Center Management module - the module loads successfully', async () => {
      await ncCenter.open();
      await expect(new AppScreen(page).header()).toBeVisible();
    });

    await steps.step('Sign in as a user who is not a recipient of the announcement - the dashboard loads normally', async () => {
      const screen = new AppScreen(secondUser.page);
      await screen.visit(AppRoutes.dashboard);
      await expect(screen.header()).toBeVisible();
    });

    await steps.step(`Open that announcement's detail page directly by its identifier - access is denied and "${TEXT.notFound}" is shown`, async () => {
      await secondUser.announcementDetail.open(announcementId);
      await expect.poll(() => screenContentText(secondUser.page), { message: 'the text on the screen' }).toContain(TEXT.notFound);
      expect(await screenContentText(secondUser.page), 'the message must not be shown').not.toContain(english);
    });

    await steps.step("Check the user's own Announcements panel tabs (All, Unread, Read, Archived) - the announcement appears in none of them", async () => {
      const rows = await wordRowsByTab(secondUser.announcementBell, word);
      const api = [...(await announcementsOf(secondUser.page, word)), ...(await announcementsOf(secondUser.page, word, 'archived'))];
      expect({ tabs: rows, inbox: api.map((x) => x.announcementId) }).toEqual({ tabs: { all: 0, unread: 0, read: 0, archived: 0 }, inbox: [] });
    });
  });
});
