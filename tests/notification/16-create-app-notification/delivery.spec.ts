import { test, expect } from '../../../fixtures';
import type { TestSteps } from '../../../fixtures/testStatus.fixture';
import type { DefinitionsTab } from '../../../pages/notification/NotificationCenterPage';
import { DEF_ACTION, DEF_MODULE } from '../../../constants/notification/writerCIds';
import { approvePending, provisionNetwork, waitForNetworkStatusCode } from '../../../utils/NetworkProvisioning';
import { inactivateSuiteNetwork } from '../../../utils/jobDriven/lifecycle';
import {
  ADMIN_DISPLAY,
  APPROVAL_MODULE,
  CASES,
  DELIVERY_WAIT_MS,
  DUPLICATE_GRACE_MS,
  INBOX_ONLY_RIGHTS,
  NETWORK_APPROVED,
  NETWORK_EXPIRING,
  NETWORK_INACTIVE,
  NETWORK_MODULE,
  NETWORK_NEED_APPROVE,
  NOTES_API_ANNOTATION,
  NOTES_TEXT,
  REMINDER_A_DAYS,
  REMINDER_B_MINUTES,
  ROLES,
  STORY,
  TEXT,
  USERS,
} from '../../../data/notification/createAppNotification.data';
import {
  activeSuiteNetworks,
  addAudienceWith,
  anyContains,
  audiencePickerShown,
  audienceSummary,
  contentShown,
  definitionIdByName,
  describeAttempt,
  fillToAudiences,
  fireNetworkJob,
  forwardTo,
  inboxOfType,
  makeSuiteDefinition,
  messagesFor,
  minutesPast,
  normText,
  openEdit,
  orBlockInStep,
  saveFromHere,
  waitForDelivered,
} from '../../../utils/notification/writerCHelpers';
import { ncStamp } from '../../../utils/notification/notificationApi';

/** Step 1: the Notification Center, App Notification tab. */
async function openModule(steps: TestSteps, tab: DefinitionsTab): Promise<void> {
  await steps.critical('Navigate to the Notification Center Management module - the module home page is displayed', async () => {
    const answer = await tab.open();
    expect(answer?.status, 'GetDefinitions should answer the App Notification tab').toBe(200);
  });
}

/**
 * User story 21000: Create App Notification - the rules that only show when a
 * notification is DELIVERED. Every event is raised on the suite's own record
 * (an "Automation Network ..." it creates): submit -> Need to Approve, approve
 * -> Approved, inactivate an Active one -> Inactive (Active after a
 * network-job move through `jobClock`, restored at teardown). Recipients are
 * careconnect and maalmohammad (secondUser) only; their inboxes are read
 * through GetMyNotifications and the bell. See the data file for the readings.
 */
test.describe(`US ${STORY.id} - ${STORY.title} (delivery)`, () => {
  test.describe.configure({ timeout: 20 * 60_000 });

  test(`TC-${CASES.notesHidden.azureId}: should save internal Notes with the notification but never show them to its recipients`, async ({ page, steps, suiteDefinitions, ncDefinitions, ncDefinitionDrawer: drawer, notificationBell, notificationDetail, networkIn }) => {
    await suiteDefinitions.watch();
    const marker = ncStamp();
    const name = suiteDefinitions.newName('notes');
    const messages = await messagesFor(page, DEF_ACTION.networkNeedApprove, marker);
    let id = '';
    await openModule(steps, ncDefinitions);

    await steps.step('On the Content step enter text in the Notes field - the text is accepted', async () => {
      await drawer.openCreate();
      await drawer.fillGeneral({ name, module: APPROVAL_MODULE, action: NETWORK_NEED_APPROVE });
      await forwardTo(page, drawer, 'content');
      await drawer.fillContent({ english: messages.english, arabic: messages.arabic, notes: NOTES_TEXT });
      expect((await contentShown(drawer)).notes).toBe(NOTES_TEXT);
    });

    await steps.critical(`Complete the remaining mandatory fields and click Save - "${TEXT.saved.en}" is displayed`, async () => {
      await forwardTo(page, drawer, 'audiences');
      const saved = await saveFromHere(page, drawer);
      expect(saved.status !== null && saved.status < 300 && anyContains(saved.toasts, TEXT.saved.en), describeAttempt(saved)).toBe(true);
      id = await definitionIdByName(page, name);
      expect(id, `"${name}" is stored`).not.toBe('');
    });

    await steps.step('Reopen the saved notification for edit - the Notes text is displayed in the Notes field', async () => {
      await ncDefinitions.search(name);
      await openEdit(page, ncDefinitions, drawer, id, name);
      await forwardTo(page, drawer, 'content');
      expect((await contentShown(drawer)).notes).toBe(NOTES_TEXT);
      await drawer.close('discard');
    });

    await steps.step('Trigger the related module event (submit a suite network) and check the delivered bell notification - it shows only the English / Arabic message and no Notes content', async () => {
      const network = await networkIn('PendingApproval');
      const [item] = await waitForDelivered(page, name, marker, DELIVERY_WAIT_MS);
      expect(item, `a "${name}" notification for the submitted "${network.name}" reaches careconnect`).toBeTruthy();
      expect(`${item.englishMessage} ${item.arabicMessage}`, 'the delivered messages carry no Notes').not.toContain(NOTES_TEXT);
      // The TC judges what the recipient SEES (bell row + the opened notification); the inbox API's own
      // `notes` field is not shown to anyone - it is reported, not judged.
      test.info().annotations.push({ type: NOTES_API_ANNOTATION, description: `GetMyNotifications "notes" of the delivered item (not displayed; not judged): ${JSON.stringify(item.notes ?? null)}` });
      await notificationBell.search(marker);
      const row = await notificationBell.findRow(marker);
      expect(row, `the bell lists the notification (searched "${marker}", its English message carries it)`).not.toBeNull();
      expect(`${row?.type} ${row?.text}`, 'the bell row shows no Notes').not.toContain(NOTES_TEXT);
      await notificationBell.clickRow(row?.id ?? '');
      await notificationDetail.waitForLoaded();
      expect(await notificationDetail.text('message'), 'the opened notification shows its message').toContain(marker);
      expect(await notificationDetail.text('root'), 'the opened notification shows no Notes').not.toContain(NOTES_TEXT);
    });
  });

  test(`TC-${CASES.approvedToSubmitter.azureId}: should deliver an Approved notification only to the user who submitted the record`, async ({ page, steps, suiteDefinitions, ncDefinitions, ncDefinitionDrawer: drawer, secondUser }) => {
    await suiteDefinitions.watch();
    const marker = ncStamp();
    const name = suiteDefinitions.newName('approved');
    const messages = await messagesFor(page, DEF_ACTION.networkApproved, marker);
    await openModule(steps, ncDefinitions);

    await steps.step(`On the General step select Module "${APPROVAL_MODULE}" and Action "${NETWORK_APPROVED}" - no Audience picker is shown`, async () => {
      await drawer.openCreate();
      await fillToAudiences(page, drawer, { name, module: APPROVAL_MODULE, action: NETWORK_APPROVED }, { english: messages.english, arabic: messages.arabic });
      expect(await audiencePickerShown(drawer), 'an Approval Management event offers no audience picker').toBe(false);
    });

    await steps.critical('Complete the remaining steps and Save - the notification saves successfully', async () => {
      const saved = await saveFromHere(page, drawer);
      expect(saved.status !== null && saved.status < 300 && anyContains(saved.toasts, TEXT.saved.en), describeAttempt(saved)).toBe(true);
    });

    await steps.step('Trigger the Approved event for a record submitted by a specific user (maalmohammad submits a suite network, careconnect approves it) - only that submitting user receives the bell notification', async () => {
      const network = await orBlockInStep(steps, 'a suite network submitted by the second user', () => provisionNetwork(secondUser.page, { submitOnly: true, effectiveInMinutes: 2 * 24 * 60 }));
      await approvePending(page, network.name);
      const toSubmitter = await waitForDelivered(secondUser.page, name, marker, DELIVERY_WAIT_MS);
      expect(toSubmitter.length, `maalmohammad (the submitter) receives "${name}" for "${network.name}"`).toBe(1);
      expect(await inboxOfType(page, name, marker), 'careconnect (the approver) receives nothing').toEqual([]);
      await secondUser.notificationBell.search(marker);
      expect(await secondUser.notificationBell.findRow(marker), "the submitter's bell lists it").not.toBeNull();
      await secondUser.notificationBell.close();
    });
  });

  test(`TC-${CASES.onceOnly.azureId}: should deliver one notification to a user who is in two assigned audiences`, async ({ page, steps, suiteDefinitions, ncDefinitions, ncDefinitionDrawer: drawer, secondUser, jobClock }) => {
    await suiteDefinitions.watch();
    const role = await secondUser.withRights(INBOX_ONLY_RIGHTS);
    const marker = ncStamp();
    const name = suiteDefinitions.newName('once only');
    const messages = await messagesFor(page, DEF_ACTION.networkInactive, marker);
    await openModule(steps, ncDefinitions);

    await steps.step('Assign a Role containing User A to the first audience section, then use Add Audience to assign User A directly in a second section - both sections show their selections', async () => {
      await drawer.openCreate();
      await fillToAudiences(page, drawer, { name, module: NETWORK_MODULE, action: NETWORK_INACTIVE }, { english: messages.english, arabic: messages.arabic });
      await addAudienceWith(drawer, ROLES, [role.name]);
      await addAudienceWith(drawer, USERS, [secondUser.displayName]);
      const cards = await audienceSummary(page, drawer);
      expect(cards.length, `cards: ${JSON.stringify(cards)}`).toBe(2);
      expect(cards[0], 'the role section').toContain(role.name);
      expect(cards[1], 'the user section (spaces collapsed as the screen shows them)').toContain(normText(secondUser.displayName));
    });

    await steps.critical(`Save the notification - "${TEXT.saved.en}" is displayed`, async () => {
      const saved = await saveFromHere(page, drawer);
      expect(saved.status !== null && saved.status < 300 && anyContains(saved.toasts, TEXT.saved.en), describeAttempt(saved)).toBe(true);
    });

    await steps.step("Trigger the related event (a suite network made Active, then inactivated) - User A's bell shows exactly one instance of the notification", async () => {
      const [network] = await orBlockInStep(steps, 'an Active suite network (network-job move)', () => activeSuiteNetworks(page, jobClock, [{}]));
      await inactivateSuiteNetwork(page, network);
      const first = await waitForDelivered(secondUser.page, name, marker, DELIVERY_WAIT_MS);
      expect(first.length, `"${name}" reaches maalmohammad after "${network.name}" was inactivated`).toBeGreaterThan(0);
      await page.waitForTimeout(DUPLICATE_GRACE_MS);
      expect((await inboxOfType(secondUser.page, name, marker)).length, 'one inbox item, not one per audience').toBe(1);
      await secondUser.notificationBell.search(marker);
      expect((await secondUser.notificationBell.readRows()).filter((r) => r.type === name).length, 'one bell row').toBe(1);
      await secondUser.notificationBell.close();
    });
  });

  test(`TC-${CASES.sameEventAll.azureId}: should send every active notification configured for the same event, each to its own audience`, async ({ page, steps, suiteDefinitions, ncDefinitions, ncDefinitionDrawer: drawer, secondUser, jobClock }) => {
    await suiteDefinitions.watch();
    const markerA = ncStamp();
    const markerB = ncStamp();
    const nameA = suiteDefinitions.newName('same event A');
    const nameB = suiteDefinitions.newName('same event B');
    const messagesA = await messagesFor(page, DEF_ACTION.networkInactive, markerA);
    const messagesB = await messagesFor(page, DEF_ACTION.networkInactive, markerB);
    await openModule(steps, ncDefinitions);

    await steps.step(`Create and save a first active notification for "${NETWORK_INACTIVE}" with Audience A (careconnect) - it saves successfully`, async () => {
      await drawer.openCreate();
      await fillToAudiences(page, drawer, { name: nameA, module: NETWORK_MODULE, action: NETWORK_INACTIVE }, { english: messagesA.english, arabic: messagesA.arabic });
      await addAudienceWith(drawer, USERS, [ADMIN_DISPLAY]);
      const saved = await saveFromHere(page, drawer);
      expect(saved.status !== null && saved.status < 300 && anyContains(saved.toasts, TEXT.saved.en), describeAttempt(saved)).toBe(true);
    });

    await steps.step(`Create and save a second active notification for the same action with Audience B (${secondUser.displayName}) - it saves successfully`, async () => {
      await drawer.openCreate();
      await fillToAudiences(page, drawer, { name: nameB, module: NETWORK_MODULE, action: NETWORK_INACTIVE }, { english: messagesB.english, arabic: messagesB.arabic });
      await addAudienceWith(drawer, USERS, [secondUser.displayName]);
      const saved = await saveFromHere(page, drawer);
      expect(saved.status !== null && saved.status < 300 && anyContains(saved.toasts, TEXT.saved.en), describeAttempt(saved)).toBe(true);
    });

    await steps.step(`Trigger the "${NETWORK_INACTIVE}" event - both notifications are sent independently, each to its own audience`, async () => {
      const [network] = await orBlockInStep(steps, 'an Active suite network (network-job move)', () => activeSuiteNetworks(page, jobClock, [{}]));
      await inactivateSuiteNetwork(page, network);
      const toA = await waitForDelivered(page, nameA, markerA, DELIVERY_WAIT_MS);
      const toB = await waitForDelivered(secondUser.page, nameB, markerB, DELIVERY_WAIT_MS);
      expect({ a: toA.length, b: toB.length }, `after "${network.name}" was inactivated: A to careconnect, B to maalmohammad`).toEqual({ a: 1, b: 1 });
      expect({ bToAdmin: (await inboxOfType(page, nameB, markerB)).length, aToSecond: (await inboxOfType(secondUser.page, nameA, markerA)).length }, 'each only to its own audience').toEqual({ bToAdmin: 0, aToSecond: 0 });
    });
  });

  test(`TC-${CASES.remindersStop.azureId}: should stop Expiring Soon reminders once a record becomes inactive or passes its expiry date`, async ({ page, steps, suiteDefinitions, ncDefinitions, jobClock }) => {
    test.setTimeout(35 * 60_000);
    const marker = ncStamp();
    const def = await makeSuiteDefinition(page, suiteDefinitions, { label: 'reminders', moduleId: DEF_MODULE.networkManagement, actionId: DEF_ACTION.networkExpiringSoon, isActive: true, marker, allVariables: true });
    let a = { id: '', name: '' };
    let b = { id: '', name: '', expiresAt: new Date() };
    const remindersOf = async (networkName: string): Promise<number> => (await inboxOfType(page, def.name, marker)).filter((i) => i.englishMessage.includes(networkName)).length;
    await openModule(steps, ncDefinitions);

    await steps.critical('While the records are active and approaching expiry, verify scheduled reminders are generated - reminders are sent according to schedule', async () => {
      const [na, nb] = await orBlockInStep(steps, 'two Active suite networks inside the reminder window (network-job move)', () =>
        activeSuiteNetworks(page, jobClock, [{ expiryInMinutes: REMINDER_A_DAYS * 24 * 60 }, { expiryInMinutes: REMINDER_B_MINUTES }]));
      a = na;
      b = { ...nb, expiresAt: nb.expiresAt ?? new Date() };
      // The run that made the records Active may evaluate expiry before activating them, so the
      // reminder process (the network job) runs once more with both records Active and in the window.
      const reminderRun = await fireNetworkJob(page, jobClock, 2);
      await waitForDelivered(page, def.name, marker, DELIVERY_WAIT_MS);
      await page.waitForTimeout(DUPLICATE_GRACE_MS);
      expect(
        { a: await remindersOf(a.name), b: await remindersOf(b.name) },
        `one "${NETWORK_EXPIRING}" reminder in careconnect's inbox for each Active record inside the reminder window (activation run, then a network-job run at ${reminderRun.toISOString()}; "${a.name}" expires in ${REMINDER_A_DAYS} days, "${b.name}" at ${b.expiresAt.toISOString()})`,
      ).toEqual({ a: 1, b: 1 });
    });

    await steps.step('Mark the record as inactive before its expiry date - no further reminders are generated for that record', async () => {
      await inactivateSuiteNetwork(page, a);
      await fireNetworkJob(page, jobClock, 2);
      expect(await remindersOf(a.name), `no new reminder for the inactivated "${a.name}" after the next job run`).toBe(1);
    });

    await steps.step('Let a different active record pass its expiry date - once it has expired, no further reminders are sent for it', async () => {
      await fireNetworkJob(page, jobClock, minutesPast(b.expiresAt));
      await waitForNetworkStatusCode(page, b.id, 'expired', 5 * 60_000);
      expect(await remindersOf(b.name), `no new reminder for the expired "${b.name}"`).toBe(1);
    });
  });
});
