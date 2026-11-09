import { test, expect } from '../../../fixtures';
import { NotificationCentre } from '../../../pages/components/NotificationCentre';
import { CASES, CASE_TIMEOUT_MS, EXPECTED_PRIORITY, QUIET_WINDOW_MS } from '../../../data/networks/expiredInactiveNotifications.data';
import { networkSnapshot } from '../../../utils/jobDriven/lifecycle';
import { requireJobSeed, type ClaimedJobSeed } from '../../../utils/jobDriven/jobSeeds';
import { readInbox, type InboxNotification } from '../../../utils/jobDriven/notifications';
import { hasArabic, notificationsFor, priorityOf, resaveUnchanged, seedExpiredNotification } from '../../../utils/jobDriven/writerN2Helpers';

/**
 * User story 14323: Notify administrators when a network becomes Expired or
 * Inactive - the EXPIRED transition, which only the daily network job applies.
 *
 * SEED-THEN-CHECK: the network job seeder (`npm run seed:network-jobs`, the same
 * Riyadh day) made suite networks Active (F1) and, after their expiry, Expired
 * (F2). These cases claim those seeds and read the notification the F2 run
 * produced. BLOCKED (never failed) when there is no seed today, or when the
 * seed run produced no Expired notification for any seed - no "Expired -
 * Network" template was configured at F2. See
 * data/networks/expiredInactiveNotifications.data.ts.
 */
const sinceF2 = (seed: ClaimedJobSeed): Date => new Date(seed.firings?.f2 ? Date.parse(seed.firings.f2) - 60_000 : Date.now() - 24 * 60 * 60_000);
const ARABIC_DIGITS = /[٠-٩]/;

test.describe('US 14323 - Notify administrators when a network becomes Expired', () => {
  test.afterEach(async ({ languageSwitcher }) => {
    if ((await languageSwitcher.currentLanguage().catch(() => 'en')) === 'ar') await languageSwitcher.switchTo('en').catch(() => undefined);
  });

  test(`TC-${CASES.expiredHighPriority.azureId}: should send administrators a high-priority templated notification when a network becomes Expired`, async ({
    page,
    networkManagementPage,
    steps,
  }, testInfo) => {
    test.setTimeout(CASE_TIMEOUT_MS);
    let seed!: ClaimedJobSeed;
    let notification: InboxNotification | null = null;

    await steps.critical('Navigate to the Network Management module - the network list loads', async () => {
      await networkManagementPage.openList();
      seed = await requireJobSeed(page, testInfo, 'ExpireAfterExpiry');
      expect(seed.id).toBeTruthy();
    });

    await steps.step('The network record was Active', async () => {
      expect(seed.afterF1?.status, 'Active before its expiry').toBe('Active');
    });

    await steps.critical('Its expiry condition is met and the status updates to Expired', async () => {
      expect(seed.now?.status ?? seed.after?.status).toBe('Expired');
    });

    await steps.critical('The administrator\'s Notification Centre lists the received notifications', async () => {
      notification = await seedExpiredNotification(page, testInfo, seed);
      expect(notification, `an Expired notification about "${seed.name}" reached the administrator`).not.toBeNull();
      const centre = new NotificationCentre(page);
      await centre.open();
      expect((await centre.readText()).length, 'the inbox lists entries').toBeGreaterThan(0);
      await centre.close();
    });

    await steps.step('The newest entry references the expired network', async () => {
      expect(notification?.relatedEntityId, 'the entry is about the expired network').toBe(seed.id);
      expect(notification?.englishMessage, 'the entry names the network').toContain(seed.name);
    });

    await steps.step('Opened, it shows priority High and content rendered from the configured template', async () => {
      expect(notification?.englishMessage ?? '', 'rendered (no {{variables}} left)').not.toMatch(/\{\{\s*\w+\s*\}\}/);
      expect(hasArabic(notification?.arabicMessage ?? ''), 'the Arabic variant is present').toBe(true);
      expect(priorityOf(notification) ?? '(the notification carries no priority)', 'the priority').toMatch(EXPECTED_PRIORITY);
    });
  });

  test(`TC-${CASES.englishLocale.azureId}: should render the English template when the administrator works in English`, async ({
    page,
    networkManagementPage,
    languageSwitcher,
    steps,
  }, testInfo) => {
    test.setTimeout(CASE_TIMEOUT_MS);
    let seed!: ClaimedJobSeed;
    let notification: InboxNotification | null = null;

    await steps.critical('Navigate to the Network Management module - the module loads', async () => {
      await networkManagementPage.openList();
      seed = await requireJobSeed(page, testInfo, 'ExpireAfterExpiry');
      expect(seed.id).toBeTruthy();
    });

    await steps.critical('Set the administrator\'s language to English - the preference shows English', async () => {
      await languageSwitcher.switchTo('en');
      expect(await languageSwitcher.currentLanguage()).toBe('en');
    });

    await steps.critical('A network\'s status changes to Expired - saved as Expired', async () => {
      expect(seed.now?.status ?? seed.after?.status).toBe('Expired');
    });

    await steps.step('The notification shows the English template, English formatting and the High priority flag', async () => {
      notification = await seedExpiredNotification(page, testInfo, seed);
      expect(notification, 'the Expired notification arrived').not.toBeNull();
      const centre = new NotificationCentre(page);
      await centre.open();
      const text = await centre.readTextIncluding(notification?.englishMessage ?? '');
      expect(text, 'the bell shows the English text').toContain(notification?.englishMessage ?? '');
      expect(text, 'and not the Arabic one').not.toContain(notification?.arabicMessage ?? '\u0000');
      await centre.close();
      expect(hasArabic(notification?.englishMessage ?? ''), 'the English variant holds no Arabic').toBe(false);
      expect(ARABIC_DIGITS.test(notification?.englishMessage ?? ''), 'English (Latin) digits').toBe(false);
      expect(priorityOf(notification) ?? '(the notification carries no priority)', 'the priority').toMatch(EXPECTED_PRIORITY);
    });
  });

  test(`TC-${CASES.noDuplicate.azureId}: should send one notification for the Expired transition when the record is saved again unchanged`, async ({
    page,
    networkManagementPage,
    steps,
  }, testInfo) => {
    test.setTimeout(CASE_TIMEOUT_MS);
    let seed!: ClaimedJobSeed;
    let first: InboxNotification | null = null;

    await steps.critical('Navigate to the Network Management module - the module loads', async () => {
      await networkManagementPage.openList();
      // Claimed EXCLUSIVELY: the case saves the record again.
      seed = await requireJobSeed(page, testInfo, 'ExpireAfterExpiry', { exclusive: true });
      expect(seed.id).toBeTruthy();
    });

    await steps.critical('The network went from Active to Expired and a notification was generated', async () => {
      expect(seed.afterF1?.status).toBe('Active');
      expect(seed.now?.status).toBe('Expired');
      first = await seedExpiredNotification(page, testInfo, seed);
      expect(first, 'the transition\'s notification').not.toBeNull();
    });

    await steps.step('Re-opened and saved again unchanged, the record saves with its status still Expired', async () => {
      const answer = await resaveUnchanged(page, { id: seed.id, name: seed.name });
      expect(answer.status, `the unchanged save answered ${answer.status} ${answer.text.slice(0, 200)}`).toBeLessThan(300);
      expect((await networkSnapshot(page, seed.id)).status).toBe('Expired');
    });

    await steps.step('The administrator\'s inbox shows the notification history for the network', async () => {
      const centre = new NotificationCentre(page);
      await centre.open();
      expect((await centre.readText()).length).toBeGreaterThan(0);
      await centre.close();
    });

    await steps.step('Exactly one notification exists for the single Expired transition', async () => {
      await page.waitForTimeout(QUIET_WINDOW_MS);
      const all = await notificationsFor(page, seed.id, sinceF2(seed), first ? [first.type] : undefined);
      expect(all.map((n) => n.createdOn), 'Expired notifications about the network').toHaveLength(1);
    });
  });

  test(`TC-${CASES.expiryBoundary.azureId}: should notify only when the expiry date is reached or passed when the job evaluates expiry`, async ({
    page,
    networkManagementPage,
    steps,
  }, testInfo) => {
    test.setTimeout(CASE_TIMEOUT_MS);
    let tomorrow!: ClaimedJobSeed;
    let today!: ClaimedJobSeed;
    let past!: ClaimedJobSeed;
    let todayNotice: InboxNotification | null = null;
    let pastNotice: InboxNotification | null = null;

    await steps.critical('Navigate to the Network Management module - the module loads', async () => {
      await networkManagementPage.openList();
      tomorrow = await requireJobSeed(page, testInfo, 'ActiveExpiryTomorrow');
      today = await requireJobSeed(page, testInfo, 'ExpireAfterExpiry', { index: 0 });
      past = await requireJobSeed(page, testInfo, 'ExpireAfterExpiry', { index: 1 });
      expect(new Set([tomorrow.id, today.id, past.id]).size).toBe(3);
    });

    await steps.step('Expiry one day ahead: after the evaluation the network stays Active with no notification', async () => {
      expect(Date.parse(String(tomorrow.now?.expiryDate)), 'its expiry is still ahead').toBeGreaterThan(Date.now());
      expect(tomorrow.now?.status).toBe('Active');
      const expiredNotices = (await notificationsFor(page, tomorrow.id, sinceF2(tomorrow))).filter((n) => /expir/i.test(n.englishMessage));
      expect(expiredNotices.map((n) => n.englishMessage), 'no Expired notification about it').toEqual([]);
    });

    await steps.step('Expiry reached (today): the network becomes Expired and a notification is generated', async () => {
      expect(today.now?.status).toBe('Expired');
      todayNotice = await seedExpiredNotification(page, testInfo, today);
      expect(todayNotice, `an Expired notification about "${today.name}"`).not.toBeNull();
    });

    await steps.step('Expiry passed before the run: the network becomes Expired and a notification is generated', async () => {
      expect(past.now?.status).toBe('Expired');
      pastNotice = await seedExpiredNotification(page, testInfo, past);
      expect(pastNotice, `an Expired notification about "${past.name}"`).not.toBeNull();
    });

    await steps.step('The inbox holds notifications for the reached and passed cases only, not the future one', async () => {
      const type = (todayNotice ?? pastNotice)?.type;
      expect(type, 'the Expired notifications\' definition').toBeTruthy();
      const future = await notificationsFor(page, tomorrow.id, sinceF2(tomorrow), type ? [type] : undefined);
      expect(future.map((n) => n.englishMessage), 'Expired notifications about the network whose expiry is ahead').toEqual([]);
      expect([todayNotice?.relatedEntityId, pastNotice?.relatedEntityId]).toEqual([today.id, past.id]);
    });
  });

  test(`TC-${CASES.adminOnly.azureId}: should deliver the Expired notification to administrators only when a non-administrator checks the inbox`, async ({
    page,
    networkManagementPage,
    nonAdminSession,
    steps,
  }, testInfo) => {
    test.setTimeout(CASE_TIMEOUT_MS);
    let seed!: ClaimedJobSeed;
    let notification: InboxNotification | null = null;

    await steps.critical('Navigate to the Network Management module - the module loads', async () => {
      await networkManagementPage.openList();
      seed = await requireJobSeed(page, testInfo, 'ExpireAfterExpiry');
      expect(seed.id).toBeTruthy();
    });

    await steps.critical('A network\'s status changes to Expired - the notification event is triggered', async () => {
      expect(seed.now?.status).toBe('Expired');
    });

    await steps.step('The administrator\'s inbox shows the new Expired notification', async () => {
      notification = await seedExpiredNotification(page, testInfo, seed);
      expect(notification, 'the administrator received it').not.toBeNull();
      const centre = new NotificationCentre(page);
      await centre.open();
      expect(await centre.readTextIncluding(notification?.englishMessage ?? seed.name)).toContain(notification?.englishMessage ?? seed.name);
      await centre.close();
    });

    await steps.step('The non-administrator\'s inbox does not show the Expired network notification', async () => {
      const theirs = (await readInbox(nonAdminSession.page, 200)).filter((n) => n.relatedEntityId === seed.id && (!notification || n.type === notification.type));
      expect(theirs.map((n) => n.englishMessage), 'Expired notifications in the non-administrator\'s inbox').toEqual([]);
      const centre = new NotificationCentre(nonAdminSession.page);
      await centre.open();
      expect(await centre.readText()).not.toContain(notification?.englishMessage ?? seed.name);
      await centre.close();
    });
  });
});
