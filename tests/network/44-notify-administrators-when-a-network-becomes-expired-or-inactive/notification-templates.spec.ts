import { test, expect } from '../../../fixtures';
import {
  ARABIC_REQUIRED,
  CASES,
  CASE_TIMEOUT_MS,
  DEFINITION_SAVED,
  DEFINITION_UPDATED,
  ENGLISH_LIMIT,
  EXPECTED_PRIORITY,
  EXPIRY_CASE_TIMEOUT_MS,
  NOTIFICATION_WAIT_MS,
  QUIET_WINDOW_MS,
  TEMPLATE,
  repeatTo,
} from '../../../data/networks/expiredInactiveNotifications.data';
import { changeNetworkExpiry, inactivateSuiteNetwork, waitForNetworkStatus } from '../../../utils/jobDriven/lifecycle';
import { readNetwork } from '../../../utils/NetworkProvisioning';
import { waitUntilInstant } from '../../../utils/JobClock';
import {
  NOTIFICATION_ACTION,
  SUITE_DEFINITION_PREFIX,
  appNotificationsAudit,
  deleteSuiteDefinition,
  listDefinitions,
  readDefinition,
  triggerExecutions,
  type InboxNotification,
} from '../../../utils/jobDriven/notifications';
import {
  NETWORK_JOB,
  NotificationDefinitionsScreen,
  activeSuiteNetwork,
  cleanupDefinitions,
  createNetworkDefinition,
  expiredByJob,
  fireNetworkJobAfter,
  foreignDefinitionsFor,
  hasArabic,
  notificationActionOptions,
  notificationsFor,
  priorityOf,
  updateDefinitionTemplates,
  waitForNotification,
  type ExpiredByJob,
  type SuiteDefinition,
} from '../../../utils/jobDriven/writerN2Helpers';

/**
 * User story 14323: Notify administrators when a network becomes Expired or
 * Inactive - the bilingual templates (Notification Center > Definitions) and
 * how their configuration shapes what is sent.
 *
 * The cases that must configure a template BEFORE the Expired transition
 * (18303, 18305, 18310) take a fresh suite network Future -> Active -> Expired
 * with two short moves of the network job (`expiredByJob`, administrator's
 * jobClock - restored after each firing and again in teardown). Suite
 * definitions are deleted after every case.
 */
const render = (template: string, name: string): string => template.replace('{{NetworkName}}', name);
const sinceFiring = (run: ExpiredByJob): Date => new Date(run.f2.getTime() - 60_000);

test.describe('US 14323 - Expired / Inactive notification templates', () => {
  test.afterEach(async ({ page }) => {
    await cleanupDefinitions(page);
  });

  test(`TC-${CASES.editTemplate.azureId}: should send the updated template text when an administrator edits the Expired template`, async ({
    page,
    networkManagementPage,
    jobClock,
    steps,
  }) => {
    test.setTimeout(EXPIRY_CASE_TIMEOUT_MS);
    const screen = new NotificationDefinitionsScreen(page);
    let def!: SuiteDefinition;
    let updated = { status: 0, text: '', validationErrors: [] as string[] };
    let run: ExpiredByJob | null = null;
    let notification: InboxNotification | null = null;

    await steps.critical('Navigate to the Network Management module - the module loads', async () => {
      await networkManagementPage.openList();
      def = await createNetworkDefinition(page, 'expired', TEMPLATE.expired);
      expect(def.id, `the existing Expired template (${def.answer.status})`).toBeTruthy();
    });

    await steps.critical('Open Notification Centre > Templates and select it - the editor holds the current English and Arabic content', async () => {
      await screen.openDefinitions();
      await screen.search(def.name);
      expect(await screen.isListed(def.id), 'the template is listed').toBe(true);
      const current = await readDefinition(page, def.id);
      expect(current?.englishMessageTemplate).toBe(TEMPLATE.expired.english);
      expect(current?.arabicMessageTemplate).toBe(TEMPLATE.expired.arabic);
    });

    await steps.critical('Modify the English and the Arabic body text - both hold the new text', async () => {
      updated = await updateDefinitionTemplates(page, def, TEMPLATE.updated.english, TEMPLATE.updated.arabic);
      expect(updated.status, `UpdateDefinition answered ${updated.status} ${updated.text.slice(0, 200)}`).toBeLessThan(300);
      const after = await readDefinition(page, def.id);
      expect(after?.englishMessageTemplate).toBe(TEMPLATE.updated.english);
      expect(after?.arabicMessageTemplate).toBe(TEMPLATE.updated.arabic);
    });

    await steps.step('Saving confirms the template was updated', async () => {
      expect(updated.text, 'the confirmation').toMatch(DEFINITION_UPDATED);
    });

    await steps.critical('A network\'s status changes to Expired - a notification is generated', async () => {
      run = await expiredByJob(page, jobClock);
      expect(run.reachedExpired, `the network reads ${run.expiredAfterF2?.status} after the expiry run`).toBe(true);
      notification = await waitForNotification(page, run.network.id, sinceFiring(run), { types: [def.name], timeoutMs: NOTIFICATION_WAIT_MS });
      expect(notification, 'the Expired notification').not.toBeNull();
    });

    await steps.step('The notification shows the updated text in both languages', async () => {
      const name = run?.network.name ?? '';
      const nameAr = run ? (await readNetwork(page, run.network.id)).networkNameAr : '';
      expect(notification?.englishMessage).toBe(render(TEMPLATE.updated.english, name));
      expect([render(TEMPLATE.updated.arabic, name), render(TEMPLATE.updated.arabic, nameAr)]).toContain(notification?.arabicMessage);
    });
  });

  test(`TC-${CASES.authorTemplate.azureId}: should save a new bilingual template for the Expired / Inactive event when an administrator authors it`, async ({
    page,
    networkManagementPage,
    steps,
  }) => {
    test.setTimeout(CASE_TIMEOUT_MS);
    const screen = new NotificationDefinitionsScreen(page);
    let def!: SuiteDefinition;
    let stored: Record<string, unknown> | null = null;

    await steps.critical('Navigate to the Network Management module - the module loads', async () => {
      await networkManagementPage.openList();
      expect(await notificationActionOptions(page), 'the event types offered').toContain(NOTIFICATION_ACTION.networkExpired);
    });

    await steps.step('Create New Template opens the editor with the event-type and priority selectors', async () => {
      await screen.openDefinitions();
      const shown = await screen.openAddDrawer();
      expect(shown.name, 'the template name').toBe(true);
      expect(shown.action, 'the event-type selector').toBe(true);
      await screen.closeDrawer();
      expect(shown.priority, 'a priority selector').toBe(true);
    });

    await steps.critical('The English text is held as entered', async () => {
      def = await createNetworkDefinition(page, 'expired', TEMPLATE.authored);
      stored = await readDefinition(page, def.id);
      expect(def.id, `the template was created (${def.answer.status} ${def.answer.text.slice(0, 160)})`).toBeTruthy();
      expect(stored?.englishMessageTemplate).toBe(TEMPLATE.authored.english);
    });

    await steps.step('The Arabic text is held as entered, in Arabic', async () => {
      expect(stored?.arabicMessageTemplate).toBe(TEMPLATE.authored.arabic);
      expect(hasArabic(String(stored?.arabicMessageTemplate ?? ''))).toBe(true);
    });

    await steps.step('The event type is Network Expired and the priority High', async () => {
      expect(stored?.moduleActionId, 'the event type').toBe(NOTIFICATION_ACTION.networkExpired);
      const priorityKey = Object.keys(stored ?? {}).find((k) => /priority/i.test(k));
      expect(priorityKey ? String(stored?.[priorityKey]) : '(the template has no priority)', 'the priority').toMatch(EXPECTED_PRIORITY);
    });

    await steps.step('Saved with a confirmation, the template appears in the templates list', async () => {
      expect(def.answer.text, 'the confirmation').toMatch(DEFINITION_SAVED);
      await screen.openDefinitions();
      await screen.search(def.name);
      expect(await screen.isListed(def.id), 'listed').toBe(true);
    });
  });

  test(`TC-${CASES.decisionTable.azureId}: should notify only on transitions into Expired or Inactive using the available templates when each combination occurs`, async ({
    page,
    networkManagementPage,
    jobClock,
    steps,
  }, testInfo) => {
    test.setTimeout(EXPIRY_CASE_TIMEOUT_MS);
    let expiredFull!: SuiteDefinition;
    let inactiveFull!: SuiteDefinition;
    let englishOnly!: SuiteDefinition;
    let run: ExpiredByJob | null = null;
    let caseB!: { id: string; name: string };
    const seen: Record<'A' | 'B' | 'D', InboxNotification | null> = { A: null, B: null, D: null };

    await steps.critical('Navigate to the Network Management module - the module loads', async () => {
      await networkManagementPage.openList();
      expiredFull = await createNetworkDefinition(page, 'expired', TEMPLATE.expired);
      inactiveFull = await createNetworkDefinition(page, 'inactive', TEMPLATE.inactive);
      englishOnly = await createNetworkDefinition(page, 'expired', { english: TEMPLATE.expired.english, arabic: '' });
      expect(expiredFull.id && inactiveFull.id, 'the EN + AR templates are configured').toBeTruthy();
    });

    await steps.step('Case A: Active -> Expired with EN and AR templates - a high-priority bilingual notification is delivered', async () => {
      run = await expiredByJob(page, jobClock);
      expect(run.reachedExpired, `the network reads ${run.expiredAfterF2?.status}`).toBe(true);
      seen.A = await waitForNotification(page, run.network.id, sinceFiring(run), { types: [expiredFull.name], timeoutMs: NOTIFICATION_WAIT_MS });
      expect(seen.A, 'the Expired notification').not.toBeNull();
      expect(seen.A?.englishMessage).toBe(render(TEMPLATE.expired.english, run.network.name));
      expect(hasArabic(seen.A?.arabicMessage ?? '')).toBe(true);
      expect(priorityOf(seen.A) ?? '(the notification carries no priority)', 'the priority').toMatch(EXPECTED_PRIORITY);
    });

    await steps.step('Case B: Active -> Inactive with EN and AR templates - a high-priority bilingual notification is delivered', async () => {
      caseB = await activeSuiteNetwork(page, jobClock, testInfo);
      const since = new Date();
      await inactivateSuiteNetwork(page, caseB);
      seen.B = await waitForNotification(page, caseB.id, since, { types: [inactiveFull.name], timeoutMs: NOTIFICATION_WAIT_MS });
      expect(seen.B, 'the Inactive notification').not.toBeNull();
      expect(seen.B?.englishMessage).toBe(render(TEMPLATE.inactive.english, caseB.name));
      expect(hasArabic(seen.B?.arabicMessage ?? '')).toBe(true);
      expect(priorityOf(seen.B) ?? '(the notification carries no priority)', 'the priority').toMatch(EXPECTED_PRIORITY);
    });

    await steps.step('Case C: Expired -> Active (recovery) - no Expired / Inactive notification is generated', async () => {
      expect(run, 'case A produced an Expired network').not.toBeNull();
      const network = (run as ExpiredByJob).network;
      const since = new Date();
      const extended = await changeNetworkExpiry(page, network, new Date(Date.now() + 30 * 86_400_000));
      expect(extended.approved, `the expiry extension was approved (${extended.update.status})`).toBe(true);
      let back = await waitForNetworkStatus(page, network.id, 'Active', { timeoutMs: 60_000 });
      if (!back.ok) {
        const move = await fireNetworkJobAfter(jobClock, new Date());
        await waitUntilInstant(page, move.firesAt, 0);
        back = await waitForNetworkStatus(page, network.id, 'Active', { timeoutMs: 3 * 60_000 });
        await jobClock.restore(NETWORK_JOB);
      }
      expect(back.value.status, 'the network recovered to Active').toBe('Active');
      await page.waitForTimeout(QUIET_WINDOW_MS);
      const after = await notificationsFor(page, network.id, since, [expiredFull.name, inactiveFull.name, englishOnly.name].filter(Boolean));
      expect(after.map((n) => `${n.type}: ${n.englishMessage}`), 'Expired / Inactive notifications for the recovery').toEqual([]);
    });

    await steps.step('Case D: Expired with only the English template - English fallback or a configuration warning', async () => {
      if (!englishOnly.id) {
        expect(englishOnly.answer.status, 'an English-only template is refused').toBeGreaterThanOrEqual(400);
        expect(`${englishOnly.answer.validationErrors.join(' ')} ${englishOnly.answer.text}`, 'the configuration warning names the Arabic template').toMatch(ARABIC_REQUIRED);
        return;
      }
      expect(run, 'case A produced an Expired network').not.toBeNull();
      seen.D = await waitForNotification(page, (run as ExpiredByJob).network.id, sinceFiring(run as ExpiredByJob), { types: [englishOnly.name], timeoutMs: 30_000 });
      expect(seen.D, 'the English-only template produced a notification').not.toBeNull();
      expect((seen.D?.arabicMessage ?? '').trim(), 'the Arabic text falls back to English').toBe(seen.D?.englishMessage);
    });

    await steps.step('The notification log matches the expected outcome of every case', async () => {
      const log = JSON.stringify(await appNotificationsAudit(page, 100));
      expect(log, 'case A logged').toContain(expiredFull.name);
      expect(log, 'case B logged').toContain(inactiveFull.name);
      expect([seen.A?.relatedEntityId, seen.B?.relatedEntityId]).toEqual([run?.network.id, caseB?.id]);
    });
  });

  test(`TC-${CASES.noTemplate.azureId}: should send no broken notification and log a configuration warning when no Expired template is configured`, async ({
    page,
    networkManagementPage,
    jobClock,
    steps,
  }) => {
    test.setTimeout(EXPIRY_CASE_TIMEOUT_MS);
    const screen = new NotificationDefinitionsScreen(page);
    let run: ExpiredByJob | null = null;

    await steps.critical('Navigate to the Network Management module - the module loads', async () => {
      await networkManagementPage.openList();
      const foreign = [...(await foreignDefinitionsFor(page, 'expired')), ...(await foreignDefinitionsFor(page, 'inactive'))];
      if (foreign.length > 0) {
        steps.blocked(
          `Needs NO template for the Expired / Inactive network events, but the team's own definitions are active: ${foreign.map((d) => `"${d.name}"`).join(', ')} - `
            + 'the suite may not delete or deactivate configuration it did not create.',
        );
      }
      expect(foreign).toEqual([]);
    });

    await steps.critical('Notification Centre > Templates shows no entry for the Expired / Inactive event', async () => {
      for (const leftover of (await listDefinitions(page)).filter((d) => d.name.startsWith(SUITE_DEFINITION_PREFIX) && /(expired|inactive)\s*-\s*network/i.test(d.moduleActionEn ?? ''))) {
        await deleteSuiteDefinition(page, leftover.id);
      }
      const matching = (await listDefinitions(page)).filter((d) => d.isActive && /(expired|inactive)\s*-\s*network/i.test(d.moduleActionEn ?? ''));
      expect(matching.map((d) => d.name), 'active Expired / Inactive network templates').toEqual([]);
      await screen.openDefinitions();
    });

    await steps.critical('A network\'s status changes to Expired - saved successfully', async () => {
      run = await expiredByJob(page, jobClock);
      expect(run.reachedExpired, `the network reads ${run.expiredAfterF2?.status}`).toBe(true);
    });

    await steps.step('No malformed notification is delivered and a configuration-missing warning is logged', async () => {
      await page.waitForTimeout(QUIET_WINDOW_MS);
      const network = (run as ExpiredByJob).network;
      const delivered = (await notificationsFor(page, network.id, sinceFiring(run as ExpiredByJob))).filter((n) => /expir/i.test(`${n.type} ${n.englishMessage}`) || /\{\{/.test(n.englishMessage));
      expect(delivered.map((n) => n.englishMessage), 'Expired notifications delivered without a template').toEqual([]);
      const logs = JSON.stringify([...(await triggerExecutions(page, 100)), ...(await appNotificationsAudit(page, 100))]);
      expect(logs, 'a warning that no template is configured for the Expired event').toMatch(/(template|definition)[^"]{0,60}(missing|not (configured|found)|no )|no (active )?(template|definition)/i);
    });
  });

  test(`TC-${CASES.templateValidation.azureId}: should enforce the required English text and its length limit when a template is saved`, async ({
    page,
    networkManagementPage,
    steps,
  }) => {
    test.setTimeout(CASE_TIMEOUT_MS);

    await steps.critical('Navigate to the Network Management module - the module loads', async () => {
      await networkManagementPage.openList();
      expect(await notificationActionOptions(page)).toContain(NOTIFICATION_ACTION.networkExpired);
    });

    await steps.step('A blank English text is refused with "English ... is required" and nothing is saved', async () => {
      const blank = await createNetworkDefinition(page, 'expired', { english: '', arabic: TEMPLATE.expired.arabic });
      expect(blank.answer.status, `${blank.answer.status} ${blank.answer.text.slice(0, 200)}`).toBeGreaterThanOrEqual(400);
      expect(`${blank.answer.validationErrors.join(' ')} ${blank.answer.text}`).toMatch(/english/i);
      expect(blank.id, 'not saved').toBe('');
    });

    await steps.step(`An English text of ${ENGLISH_LIMIT + 1} characters is refused for the character limit and not saved`, async () => {
      const over = await createNetworkDefinition(page, 'expired', { english: repeatTo(ENGLISH_LIMIT + 1), arabic: TEMPLATE.expired.arabic });
      expect(over.answer.status, `${over.answer.status} ${over.answer.text.slice(0, 200)}`).toBeGreaterThanOrEqual(400);
      expect(`${over.answer.validationErrors.join(' ')} ${over.answer.text}`).toMatch(/length|characters|maximum|exceed|255/i);
      expect(over.id, 'not saved').toBe('');
    });

    await steps.step(`An English text of exactly ${ENGLISH_LIMIT} characters saves with no validation error`, async () => {
      const at = await createNetworkDefinition(page, 'expired', { english: repeatTo(ENGLISH_LIMIT), arabic: TEMPLATE.expired.arabic });
      expect(at.answer.status, `${at.answer.status} ${at.answer.text.slice(0, 200)}`).toBeLessThan(300);
      expect(at.id, 'saved').toBeTruthy();
      expect(String((await readDefinition(page, at.id))?.englishMessageTemplate ?? '').length).toBe(ENGLISH_LIMIT);
    });
  });
});

