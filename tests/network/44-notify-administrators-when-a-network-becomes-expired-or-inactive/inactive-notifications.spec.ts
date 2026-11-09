import { test, expect } from '../../../fixtures';
import { NotificationCentre } from '../../../pages/components/NotificationCentre';
import {
  CASES,
  CASE_TIMEOUT_MS,
  EXPECTED_PRIORITY,
  NOTIFICATION_WAIT_MS,
  QUIET_WINDOW_MS,
  RAPID_CYCLES,
  TEMPLATE,
} from '../../../data/networks/expiredInactiveNotifications.data';
import { changeNetworkExpiry, inactivateSuiteNetwork, networkSnapshot, waitForNetworkStatus } from '../../../utils/jobDriven/lifecycle';
import { approvePending, readNetwork } from '../../../utils/NetworkProvisioning';
import type { InboxNotification } from '../../../utils/jobDriven/notifications';
import {
  activeSuiteNetwork,
  cleanupDefinitions,
  createNetworkDefinition,
  hasArabic,
  notificationsFor,
  priorityOf,
  reactivateSuiteNetwork,
  waitForNotification,
  type SuiteDefinition,
} from '../../../utils/jobDriven/writerN2Helpers';

/**
 * User story 14323: Notify administrators when a network becomes Expired or
 * Inactive - the INACTIVE transition, which an administrator produces at once
 * by inactivating an Active suite network (stage, send for approval, approve).
 * The network is PROVISIONED fresh (activeSuiteNetwork: a pool of approved
 * networks made Active by one move of the network job, restored at once) -
 * never found in the register, whose long-lived anchors must not be touched.
 *
 * Each case creates its own "Inactive - Network" definition (the bilingual
 * template, audience: the administrator) and deletes it afterwards; the UI
 * language is put back to English. See data/networks/expiredInactiveNotifications.data.ts.
 */
const render = (template: string, name: string): string => template.replace('{{NetworkName}}', name);

test.describe('US 14323 - Notify administrators when a network becomes Inactive', () => {
  test.afterEach(async ({ page, languageSwitcher }) => {
    await cleanupDefinitions(page);
    if ((await languageSwitcher.currentLanguage().catch(() => 'en')) === 'ar') await languageSwitcher.switchTo('en').catch(() => undefined);
  });

  test(`TC-${CASES.inactiveHighPriority.azureId}: should send administrators a high-priority templated notification when a network becomes Inactive`, async ({
    page,
    networkManagementPage,
    jobClock,
    steps,
  }, testInfo) => {
    test.setTimeout(CASE_TIMEOUT_MS);
    let def!: SuiteDefinition;
    let network!: { id: string; name: string };
    let since = new Date();
    let notification: InboxNotification | null = null;

    await steps.critical('Navigate to the Network Management module - the network list loads', async () => {
      await networkManagementPage.openList();
      def = await createNetworkDefinition(page, 'inactive', TEMPLATE.inactive);
      expect(def.id, `the "Inactive - Network" template is configured (${def.answer.status} ${def.answer.text.slice(0, 160)})`).toBeTruthy();
    });

    await steps.critical('Open an Active network record - its status is Active', async () => {
      network = await activeSuiteNetwork(page, jobClock, testInfo);
      expect((await networkSnapshot(page, network.id)).status).toBe('Active');
    });

    await steps.critical('Set the network to Inactive and save - the status updates to Inactive', async () => {
      since = new Date();
      await inactivateSuiteNetwork(page, network);
      expect((await networkSnapshot(page, network.id)).status).toBe('Inactive');
    });

    await steps.step('The administrator\'s Notification Centre lists the new notification', async () => {
      notification = await waitForNotification(page, network.id, since, { types: [def.name], timeoutMs: NOTIFICATION_WAIT_MS });
      expect(notification, `an Inactive notification about "${network.name}" reached the administrator`).not.toBeNull();
      const centre = new NotificationCentre(page);
      await centre.open();
      expect(await centre.readTextIncluding(notification?.englishMessage ?? network.name), 'the bell lists it').toContain(notification?.englishMessage ?? network.name);
      await centre.close();
    });

    await steps.step('The newest entry shows priority High and bilingual content from the configured template', async () => {
      const nameAr = (await readNetwork(page, network.id)).networkNameAr;
      expect(notification?.englishMessage).toBe(render(TEMPLATE.inactive.english, network.name));
      expect([render(TEMPLATE.inactive.arabic, network.name), render(TEMPLATE.inactive.arabic, nameAr)]).toContain(notification?.arabicMessage);
      expect(priorityOf(notification) ?? '(the notification carries no priority)', 'the priority').toMatch(EXPECTED_PRIORITY);
    });
  });

  test(`TC-${CASES.arabicLocale.azureId}: should show the Arabic template right-to-left when the administrator works in Arabic`, async ({
    page,
    networkManagementPage,
    languageSwitcher,
    jobClock,
    steps,
  }, testInfo) => {
    test.setTimeout(CASE_TIMEOUT_MS);
    let def!: SuiteDefinition;
    let network!: { id: string; name: string };
    let since = new Date();
    let notification: InboxNotification | null = null;

    await steps.critical('Navigate to the Network Management module - the module loads', async () => {
      await networkManagementPage.openList();
      def = await createNetworkDefinition(page, 'inactive', TEMPLATE.inactive);
      expect(def.id, `the bilingual template is configured (${def.answer.status})`).toBeTruthy();
      network = await activeSuiteNetwork(page, jobClock, testInfo);
    });

    await steps.critical('Set the administrator\'s language to Arabic - the preference shows Arabic', async () => {
      await languageSwitcher.switchTo('ar');
      expect(await languageSwitcher.currentLanguage()).toBe('ar');
    });

    await steps.critical('Change a network\'s status to Inactive - it is saved as Inactive', async () => {
      since = new Date();
      await inactivateSuiteNetwork(page, network);
      expect((await networkSnapshot(page, network.id)).status).toBe('Inactive');
    });

    await steps.step('The notification shows the Arabic template right-to-left with the High priority flag', async () => {
      notification = await waitForNotification(page, network.id, since, { types: [def.name], timeoutMs: NOTIFICATION_WAIT_MS });
      expect(notification, 'the Inactive notification arrived').not.toBeNull();
      expect(hasArabic(notification?.arabicMessage ?? ''), 'the Arabic variant is Arabic text').toBe(true);
      await page.reload();
      const centre = new NotificationCentre(page);
      await centre.open();
      const text = await centre.readTextIncluding(notification?.arabicMessage ?? '');
      expect(text, 'the bell shows the Arabic text in Arabic').toContain(notification?.arabicMessage ?? '');
      expect(text, 'and not the English one').not.toContain(notification?.englishMessage ?? '\u0000');
      await languageSwitcher.expectRightToLeft();
      await centre.close();
      expect(priorityOf(notification) ?? '(the notification carries no priority)', 'the priority').toMatch(EXPECTED_PRIORITY);
    });
  });

  test(`TC-${CASES.noNotificationOtherTransition.azureId}: should send no Expired or Inactive notification when a network moves between other statuses`, async ({
    page,
    networkManagementPage,
    jobClock,
    steps,
  }, testInfo) => {
    test.setTimeout(CASE_TIMEOUT_MS);
    const defs: SuiteDefinition[] = [];
    let network!: { id: string; name: string };
    let since = new Date();

    await steps.critical('Navigate to the Network Management module - the module loads', async () => {
      await networkManagementPage.openList();
      defs.push(await createNetworkDefinition(page, 'expired', TEMPLATE.expired));
      defs.push(await createNetworkDefinition(page, 'inactive', TEMPLATE.inactive));
      expect(defs.every((d) => d.id), 'templates exist for the Expired and Inactive events only').toBe(true);
    });

    await steps.critical('Change an Active network to Pending Review (an edit sent for approval) and back - it saves', async () => {
      network = await activeSuiteNetwork(page, jobClock, testInfo);
      since = new Date();
      const record = await readNetwork(page, network.id);
      const staged = await changeNetworkExpiry(page, network, new Date(Date.parse(record.expiryDate) + 86_400_000), { approve: false });
      expect(staged.update.status, `the edit saved: ${staged.update.text.slice(0, 160)}`).toBeLessThan(300);
      expect(staged.submitted).toBe(true);
      expect((await readNetwork(page, network.id)).hasPendingVersion, 'pending review').toBe(true);
      await approvePending(page, network.name);
      expect((await networkSnapshot(page, network.id)).status, 'still Active after the review').toBe('Active');
    });

    await steps.step('The administrator\'s inbox loads with its existing notifications', async () => {
      const centre = new NotificationCentre(page);
      await centre.open();
      expect((await centre.readText()).length).toBeGreaterThan(0);
      await centre.close();
    });

    await steps.step('No new Expired or Inactive notification exists for this status change', async () => {
      await page.waitForTimeout(QUIET_WINDOW_MS);
      const found = await notificationsFor(page, network.id, since, defs.map((d) => d.name));
      expect(found.map((n) => n.englishMessage), 'Expired / Inactive notifications about the network').toEqual([]);
    });
  });

  test(`TC-${CASES.rapidToggles.azureId}: should notify once per genuine Inactive transition in order when a network's status is toggled rapidly`, async ({
    page,
    networkManagementPage,
    jobClock,
    steps,
  }, testInfo) => {
    test.setTimeout(CASE_TIMEOUT_MS);
    let def!: SuiteDefinition;
    let network!: { id: string; name: string };
    let since = new Date();
    const transitions: Date[] = [];

    await steps.critical('Navigate to the Network Management module - the module loads', async () => {
      await networkManagementPage.openList();
      def = await createNetworkDefinition(page, 'inactive', TEMPLATE.inactive);
      expect(def.id).toBeTruthy();
      network = await activeSuiteNetwork(page, jobClock, testInfo);
    });

    await steps.step('Toggling Active / Inactive in quick succession saves each change and reflects the latest status', async () => {
      since = new Date();
      for (let cycle = 1; cycle <= RAPID_CYCLES; cycle += 1) {
        transitions.push(new Date());
        await inactivateSuiteNetwork(page, network);
        expect((await networkSnapshot(page, network.id)).status, `cycle ${cycle}: Inactive`).toBe('Inactive');
        const staged = await reactivateSuiteNetwork(page, network);
        expect(staged.status, `cycle ${cycle}: reactivation saved (${staged.text.slice(0, 120)})`).toBeLessThan(300);
        const back = await waitForNetworkStatus(page, network.id, 'Active', { timeoutMs: 60_000 });
        expect(back.value.status, `cycle ${cycle}: Active again`).toBe('Active');
      }
    });

    await steps.step('The administrator\'s inbox loads its notification entries', async () => {
      const centre = new NotificationCentre(page);
      await centre.open();
      expect(await centre.readText()).toContain(network.name);
      await centre.close();
    });

    await steps.step('One correct notification per Inactive transition, none duplicated, missing or out of order', async () => {
      await page.waitForTimeout(QUIET_WINDOW_MS);
      const found = await notificationsFor(page, network.id, since, [def.name]);
      expect(found.length, `Inactive notifications about the network: ${found.map((n) => n.createdOn).join(', ')}`).toBe(RAPID_CYCLES);
      found.forEach((n, i) => {
        expect(n.englishMessage).toBe(render(TEMPLATE.inactive.english, network.name));
        expect(Date.parse(n.createdOn), `notification ${i + 1} follows transition ${i + 1}`).toBeGreaterThanOrEqual(transitions[i].getTime() - 5_000);
        if (transitions[i + 1]) expect(Date.parse(n.createdOn)).toBeLessThan(transitions[i + 1].getTime() + 60_000);
      });
      expect(priorityOf(found[0] ?? null) ?? '(the notification carries no priority)', 'the priority').toMatch(EXPECTED_PRIORITY);
    });
  });
});
