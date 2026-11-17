import { test, expect } from '../../../fixtures';
import { notificationUnreadCount, type InboxNotification } from '../../../utils/notification/notificationApi';
import {
  ReviewScreen,
  approvalDefinitions,
  audienceOf,
  badgeFor,
  currentUser,
  discardSubmittedNetworks,
  hasArabic,
  itemSeen,
  minutesFrom,
  submitNetwork,
  waitForRequestNotification,
  type ApprovalDefs,
  type Submission,
} from '../../../utils/notification/writerEHelpers';
import { awaitLiveConnection } from '../../../utils/notification/writerFHelpers';
import {
  ACTIVE_TAB,
  ADMIN_AUDIENCE_NAME,
  CASES,
  DASHBOARD_PATH,
  NEW_NOTIFICATION_TITLE,
  PENDING_LABEL,
  REQUESTED_ON_TOLERANCE_MIN,
  STORY,
  UNREAD_CLASS,
} from '../../../data/notification/reviewNotificationApprovalRequest.data';

/**
 * US 21009 - a "Need to Approve" notification arriving (pop-up, count, newest
 * on top), opening its Notification Detail, and what the detail shows for a
 * pending request (Requested By / On, the message in the reviewer's language).
 * The request is a suite network submission; the notification comes from the
 * case's own ACTIVE "Need to Approve - Network" definition. See
 * data/notification/reviewNotificationApprovalRequest.data.ts.
 */
test.describe(STORY, () => {
  test.describe.configure({ timeout: 10 * 60_000 });

  test.afterEach(async ({ page }) => {
    await discardSubmittedNetworks(page);
  });

  test(`TC-${CASES.popupAndCount.azureId}: should show a New notification pop-up and raise the bell count when a request needing the reviewer arrives`, async ({ steps, page, secondUser, suiteDefinitions }) => {
    let defs!: ApprovalDefs;
    let review!: ReviewScreen;
    let before = 0;
    let popups: Promise<string[]> = Promise.resolve([]);
    let n: InboxNotification | null = null;
    // Armed before the dashboard navigation: the app's live connection (WebSocket + first server frame).
    let live: Promise<string> = Promise.resolve('');
    let connection = '';

    await steps.critical('Precondition: the reviewer (maalmohammad) is the audience of an active "Need to Approve - Network" definition', async () => {
      defs = await approvalDefinitions(page, suiteDefinitions, 'network', ['needApprove'], [secondUser.audience()]);
      review = new ReviewScreen(secondUser.page);
      expect(defs.needApprove.id).toBeTruthy();
    });

    await steps.step('Navigate to the Notification Center Management module - the dashboard loads with the notification bell', async () => {
      live = awaitLiveConnection(secondUser.page);
      await secondUser.notificationBell.goto(DASHBOARD_PATH);
      await expect(secondUser.notificationBell.bellButton()).toBeVisible();
      before = await notificationUnreadCount(secondUser.page);
      expect(before).toBeGreaterThanOrEqual(0);
    });

    await steps.step('Have another user submit a request that needs this reviewer - a Need to Approve notification is generated', async () => {
      // Submitted only once the reviewer's page is live - a request raised before its live connection is up is
      // never pushed to it (rerun1 2026-11-12: submitted 3 s after the navigation, no pop-up; writer F's 21821).
      connection = await live;
      popups = review.collectPopups(defs.needApprove.marker);
      const sub = await submitNetwork(page, page);
      n = await waitForRequestNotification(secondUser.page, defs.needApprove, sub.requestId, [sub.network.name]);
      expect(n, `no "${defs.needApprove.name}" notification about request ${sub.requestId} reached the reviewer`).not.toBeNull();
    });

    await steps.step('Watch the reviewer\'s screen without interacting - a New notification pop-up shows the request message', async () => {
      const seen = await popups;
      const ours = seen.find((t) => t.includes(defs.needApprove.marker)) ?? '';
      expect(ours, `pop-ups seen: ${JSON.stringify(seen)} (reviewer page: ${connection})`).toContain(defs.needApprove.marker);
      expect(ours).toContain(NEW_NOTIFICATION_TITLE);
    });

    await steps.step('Check the bell - the unread count rose by one', async () => {
      const after = await notificationUnreadCount(secondUser.page);
      expect(after, `unread before ${before}`).toBe(before + 1);
      await expect(secondUser.notificationBell.badge()).toHaveText(badgeFor(after));
    });
  });

  test(`TC-${CASES.newestOnTop.azureId}: should open the bell on All with the newest request on top marked unread`, async ({ steps, page, secondUser, suiteDefinitions }) => {
    let defs!: ApprovalDefs;
    let n: InboxNotification | null = null;

    await steps.critical('Precondition: the reviewer (maalmohammad) has an unread Need to Approve notification (suite network submitted by careconnect)', async () => {
      defs = await approvalDefinitions(page, suiteDefinitions, 'network', ['needApprove'], [secondUser.audience()]);
      const sub = await submitNetwork(page, page);
      n = await waitForRequestNotification(secondUser.page, defs.needApprove, sub.requestId, [sub.network.name]);
      expect(n, 'the Need to Approve notification reached the reviewer').not.toBeNull();
    });

    await steps.step('Navigate to the Notification Center Management module - the dashboard shows the bell with an unread count', async () => {
      await secondUser.notificationBell.goto(DASHBOARD_PATH);
      const unread = await notificationUnreadCount(secondUser.page);
      expect(unread).toBeGreaterThan(0);
      await expect(secondUser.notificationBell.badge()).toHaveText(badgeFor(unread));
    });

    await steps.step('Click the bell - the panel opens on the All tab', async () => {
      await secondUser.notificationBell.open();
      await expect(secondUser.notificationBell.control('title')).toBeVisible();
      await expect(secondUser.notificationBell.tab('all')).toHaveClass(ACTIVE_TAB);
    });

    await steps.step('Look at the top of the list - the newest notification is first and marked unread', async () => {
      const rows = await secondUser.notificationBell.readRows();
      expect(rows[0]?.id, `top row "${rows[0]?.type}: ${rows[0]?.text}"`).toBe(n?.id);
      expect(rows[0]?.classes ?? '', 'the unread mark (row class)').toMatch(UNREAD_CLASS);
      expect(await itemSeen(secondUser.page, n?.id ?? ''), 'the inbox item is unread').toBe(false);
    });
  });

  test(`TC-${CASES.clickOpensDetail.azureId}: should mark the notification read, close the panel and open Notification Detail when it is clicked`, async ({ steps, page, secondUser, suiteDefinitions }) => {
    let defs!: ApprovalDefs;
    let sub!: Submission;
    let n: InboxNotification | null = null;

    await steps.critical('Precondition: the reviewer (maalmohammad) has an unread approval-request notification', async () => {
      defs = await approvalDefinitions(page, suiteDefinitions, 'network', ['needApprove'], [secondUser.audience()]);
      sub = await submitNetwork(page, page);
      n = await waitForRequestNotification(secondUser.page, defs.needApprove, sub.requestId, [sub.network.name]);
      expect(n, 'the Need to Approve notification reached the reviewer').not.toBeNull();
    });

    await steps.step('Navigate to the Notification Center Management module - the dashboard loads', async () => {
      await secondUser.notificationBell.goto(DASHBOARD_PATH);
      await expect(secondUser.notificationBell.bellButton()).toBeVisible();
    });

    await steps.step('Open the bell and click the unread approval-request notification - it is marked read and the panel closes', async () => {
      await secondUser.notificationBell.open();
      await secondUser.notificationBell.clickRow(n?.id ?? '');
      await expect(secondUser.notificationBell.control('title'), 'the panel closes').toBeHidden();
      await expect.poll(() => itemSeen(secondUser.page, n?.id ?? ''), { message: 'the inbox item is read', timeout: 15_000 }).toBe(true);
    });

    await steps.step('Look at the resulting page - Notification Detail shows the request', async () => {
      await secondUser.notificationDetail.waitForLoaded();
      expect(secondUser.notificationDetail.requestIdFromUrl()).toBe(sub.requestId);
      expect(await secondUser.notificationDetail.text('action')).not.toBe('');
      expect(await secondUser.notificationDetail.text('message')).toContain(defs.needApprove.marker);
    });
  });

  test(`TC-${CASES.requestedByOn.azureId}: should show who submitted the pending request and when`, async ({ steps, page, suiteDefinitions, notificationBell, notificationDetail }) => {
    let sub!: Submission;
    let submitter: string[] = [];

    await steps.critical('Precondition: a pending approval request (suite network submitted by careconnect) and an active Need to Approve definition', async () => {
      await approvalDefinitions(page, suiteDefinitions, 'network', ['needApprove'], [await audienceOf(page, ADMIN_AUDIENCE_NAME)]);
      submitter = (await currentUser(page)).names;
      sub = await submitNetwork(page, page);
      expect(sub.requestId).toBeTruthy();
    });

    await steps.step('Navigate to the Notification Center Management module - the dashboard loads', async () => {
      await notificationBell.goto(DASHBOARD_PATH);
      await expect(notificationBell.bellButton()).toBeVisible();
    });

    await steps.step('Open the Notification Detail page for the pending request - it shows the request', async () => {
      await notificationDetail.open(sub.requestId);
      await expect(notificationDetail.el('statusBadge')).toHaveText(PENDING_LABEL);
    });

    await steps.step('Locate Requested By and Requested On - they show the submitter and the submission time', async () => {
      const by = await notificationDetail.text('requestedBy');
      const on = await notificationDetail.text('requestedOn');
      expect(submitter, `Requested By "${by}" should name the submitter`).toContain(by);
      expect(minutesFrom(on, sub.at), `Requested On "${on}" vs the submission at ${sub.at.toISOString()}`).toBeLessThanOrEqual(REQUESTED_ON_TOLERANCE_MIN);
    });
  });

  test(`TC-${CASES.messageInUserLanguage.azureId}: should show the request message in the reviewer's interface language`, async ({ steps, page, secondUser, suiteDefinitions }) => {
    let defs!: ApprovalDefs;
    let sub!: Submission;
    let n: InboxNotification | null = null;

    await steps.critical('Precondition: the reviewer\'s interface is Arabic and a request message exists in both languages', async () => {
      defs = await approvalDefinitions(page, suiteDefinitions, 'network', ['needApprove'], [secondUser.audience()]);
      sub = await submitNetwork(page, page);
      n = await waitForRequestNotification(secondUser.page, defs.needApprove, sub.requestId, [sub.network.name]);
      await secondUser.setLanguage('ar');
      expect(hasArabic(n?.arabicMessage ?? ''), `the Arabic text "${n?.arabicMessage}"`).toBe(true);
    });

    await steps.step('Navigate to the Notification Center Management module - the dashboard loads in the reviewer\'s language', async () => {
      await secondUser.notificationBell.goto(DASHBOARD_PATH);
      await expect(new ReviewScreen(secondUser.page).html()).toHaveAttribute('lang', 'ar');
    });

    await steps.step('Open the Notification Detail page for the request - it loads', async () => {
      await secondUser.notificationDetail.open(sub.requestId);
      await expect(secondUser.notificationDetail.el('message')).toBeVisible();
    });

    await steps.step('Review the Notification field - the message is in the reviewer\'s language (Arabic)', async () => {
      const shown = await secondUser.notificationDetail.text('message');
      expect(shown).toBe((n?.arabicMessage ?? '').replace(/\s+/g, ' ').trim());
      expect(hasArabic(shown)).toBe(true);
    });
  });
});
