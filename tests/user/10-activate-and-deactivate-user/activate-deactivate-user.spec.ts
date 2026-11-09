import { test, expect } from '../../../fixtures';
import type { UserDeactivateDrawer } from '../../../pages/user/UserDeactivateDrawer';
import type { UserListPage } from '../../../pages/user/UserListPage';
import type { SignInOutcome } from '../../../pages/user/SignInPage';
import { clickDialogAction, readDialog, toastMessages } from '../../../pages/user/userCommon';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import { CASES, MESSAGES, REASONS, REASON_KEY, warningFor } from '../../../data/user/activateAndDeactivateUser.data';
import { NetworkUtils } from '../../../utils/NetworkUtils';
import {
  USER_LOOKUP,
  activateUser as activateThroughApi,
  deactivateUser as deactivateThroughApi,
  readUser,
  readUserDashboard,
  type UserDashboard,
} from '../../../utils/UserProvisioning';
import {
  CONFIRM_IDS,
  burstClick,
  clickOutsideDrawer,
  countWrites,
  deactivateDrawerControls,
  deactivationEntriesSince,
  typeDeactivationDetails,
} from '../../../utils/user/writerCHelpers';

/** "Navigate to the User Management module": opens Users Administration and answers whether it lists the case's user. */
async function openList(list: UserListPage, displayName: string): Promise<boolean> {
  await list.openTable();
  return list.isListed(displayName);
}

/** The reason id ToggleUserActivation sends for a reason label. */
const reasonId = (label: keyof typeof REASON_KEY): string => USER_LOOKUP.deactivationReason[REASON_KEY[label]];

/** `n` readable characters for the Details box. */
const detailsOf = (n: number): string => 'Deactivation details typed by the automation suite. '.repeat(Math.ceil(n / 50)).slice(0, n);

/**
 * User story 20416: Activate and Deactivate User - the administrator's cases
 * (and the deactivated user's sign-in). Every user is the case's own suite
 * user; sign-in cases use a password the suite set (`userWithPassword`) in a
 * window with no session. The restricted account lives in
 * activate-deactivate-access.spec.ts. See the data file for the readings.
 */
test.describe('US 20416 - Activate and Deactivate User', () => {
  test.describe.configure({ timeout: 6 * 60_000 });

  test(`TC-${CASES.deactivateRoleChanged.azureId}: should deactivate a user with reason Role Changed and refresh the list and tiles`, async ({
    page,
    userIn,
    userListPage,
    steps,
  }) => {
    const user = await userIn('Active');
    let before!: UserDashboard;
    let drawer!: UserDeactivateDrawer;

    await steps.critical('Navigate to the User Management module - the user list loads with active and inactive users shown', async () => {
      before = await readUserDashboard(page);
      expect(await openList(userListPage, user.displayNameEn), 'the active target user in the list').toBe(true);
      expect((await userListPage.readRowById(user.id)).status, 'the row\'s status').toMatch(/^Active/i);
    });

    await steps.step('Locate the active user and select Inactivate - the Deactivate User drawer opens with the warning', async () => {
      drawer = await userListPage.openDeactivate(user.id);
      expect(await drawer.getWarning(), 'the drawer\'s warning').toBe(warningFor(user.displayNameEn));
    });

    await steps.step(`Select Deactivation Reason "${CASES.deactivateRoleChanged.reason}" - the reason is selected and Details remains optional`, async () => {
      await drawer.selectReason(CASES.deactivateRoleChanged.reason);
      expect(await drawer.readReason(), 'the reason shown').toContain(CASES.deactivateRoleChanged.reason);
      expect(await drawer.getFieldErrors(), 'errors with the reason chosen and Details empty').toEqual([]);
    });

    await steps.step('Leave Details empty and select Confirm - the drawer closes and "User deactivated" is displayed', async () => {
      const a = await drawer.attemptConfirm();
      expect(a.status, `ToggleUserActivation answered ${a.text.slice(0, 200)} ${a.errors.join(' | ')}`).toBe(200);
      expect(a.messages.join(' | '), 'the confirmation').toMatch(MESSAGES.deactivated);
      expect(a.body.inactivationReasonId, 'the reason recorded').toBe(reasonId(CASES.deactivateRoleChanged.reason));
      // read once the drawer's slide-out is over (read at once it still reported open: full run 20612 / 20613)
      expect(await drawer.waitForClosed(), 'the drawer closed after Confirm').toBe(true);
    });

    await steps.step('Review the user list and tiles - they refresh, showing the user as Inactive', async () => {
      await expect.poll(async () => (await userListPage.readRowById(user.id)).status, { timeout: 15_000, message: 'the row\'s status' }).toMatch(/Inactive/i);
      await expect.poll(async () => ({ active: await userListPage.readKpi('active'), inactive: await userListPage.readKpi('inactive') }), { timeout: 15_000, message: `the tiles (before: Active ${before.active}, Inactive ${before.inactive})` })
        .toEqual({ active: before.active - 1, inactive: before.inactive + 1 });
      expect((await readUser(page, user.id)).isActive, 'the user record').toBe(false);
    });
  });

  test(`TC-${CASES.deactivateOther.azureId}: should deactivate a user with reason Other once the mandatory details are given`, async ({
    page,
    userIn,
    userListPage,
    steps,
  }) => {
    const user = await userIn('Active');
    let drawer!: UserDeactivateDrawer;

    await steps.critical('Navigate to the User Management module - the user list loads showing active users', async () => {
      expect(await openList(userListPage, user.displayNameEn), 'the active target user in the list').toBe(true);
    });

    await steps.critical('Select Inactivate on the active user - the Deactivate User drawer opens with the deactivation warning', async () => {
      drawer = await userListPage.openDeactivate(user.id);
      expect(await drawer.getWarning(), 'the drawer\'s warning').toContain(user.displayNameEn);
    });

    await steps.step('Select Deactivation Reason "Other" - the Details field becomes mandatory', async () => {
      await drawer.selectReason(CASES.deactivateOther.reason);
      const empty = await drawer.attemptConfirm();
      expect(empty.status, 'Deactivate with reason Other and no details must send nothing').toBe(-1);
      expect(empty.errors, 'the Details rule under Other').toContain(MESSAGES.otherNeedsDetails);
    });

    await steps.step(`Enter "${CASES.deactivateOther.details}" and select Confirm - the drawer closes and "User deactivated" is displayed`, async () => {
      await drawer.fillDetails(CASES.deactivateOther.details);
      const a = await drawer.attemptConfirm();
      expect(a.status, `ToggleUserActivation answered ${a.text.slice(0, 200)} ${a.errors.join(' | ')}`).toBe(200);
      expect(a.messages.join(' | '), 'the confirmation').toMatch(MESSAGES.deactivated);
      expect({ reason: a.body.inactivationReasonId, details: a.body.inactivationDetails }, 'the reason and details recorded').toEqual({ reason: reasonId('Other'), details: CASES.deactivateOther.details });
      // read once the drawer's slide-out is over (read at once it still reported open: full run 20612 / 20613)
      expect(await drawer.waitForClosed(), 'the drawer closed after Confirm').toBe(true);
      expect((await readUser(page, user.id)).isActive, 'the user record').toBe(false);
    });
  });

  test(`TC-${CASES.otherNeedsDetails.azureId}: should block a deactivation with reason Other and no details`, async ({
    page,
    userIn,
    userListPage,
    steps,
  }) => {
    const user = await userIn('Active');
    let drawer!: UserDeactivateDrawer;

    await steps.critical('Navigate to the User Management module - the user list loads', async () => {
      expect(await openList(userListPage, user.displayNameEn), 'the active target user in the list').toBe(true);
    });

    await steps.critical('Select Inactivate on the active user - the Deactivate User drawer opens', async () => {
      drawer = await userListPage.openDeactivate(user.id);
      expect(await drawer.isOpen(), 'the drawer').toBe(true);
    });

    await steps.step('Select reason "Other", leave Details empty and select Confirm - it is blocked with the Other message and the user remains active', async () => {
      await drawer.selectReason(CASES.otherNeedsDetails.reason);
      const a = await drawer.attemptConfirm();
      expect(a.status, `nothing should be sent (ToggleUserActivation answered ${a.text.slice(0, 200)})`).toBe(-1);
      expect(a.errors, 'the validation message').toContain(MESSAGES.otherNeedsDetails);
      expect(await drawer.isOpen(), 'the drawer after Confirm').toBe(true);
      expect((await readUser(page, user.id)).isActive, 'the user record').toBe(true);
    });
  });

  test(`TC-${CASES.cancelDrawer.azureId}: should leave the user active when the deactivation drawer is cancelled`, async ({
    page,
    userIn,
    userListPage,
    steps,
  }) => {
    const user = await userIn('Active');
    let drawer!: UserDeactivateDrawer;

    await steps.critical('Navigate to the User Management module - the user list loads showing the active user', async () => {
      expect(await openList(userListPage, user.displayNameEn), 'the active target user in the list').toBe(true);
    });

    await steps.critical('Select Inactivate on the user - the Deactivate User drawer opens with reason and details fields', async () => {
      drawer = await userListPage.openDeactivate(user.id);
      const controls = await deactivateDrawerControls(page);
      expect({ reason: controls.reasonSelect, details: controls.detailsInput }, 'the reason and details fields').toEqual({ reason: true, details: true });
    });

    await steps.step(`Select "${CASES.cancelDrawer.reason}", enter "${CASES.cancelDrawer.details}" and select Cancel - the drawer closes without a confirmation message`, async () => {
      await drawer.selectReason(CASES.cancelDrawer.reason);
      await drawer.fillDetails(CASES.cancelDrawer.details);
      const sent = await countWrites(page, ApiEndpoints.userToggleActivation, () => drawer.cancel(), 1_500);
      expect(await drawer.isOpen(), 'the drawer after Cancel').toBe(false);
      expect(sent, 'ToggleUserActivation requests sent').toBe(0);
      expect((await toastMessages(page)).filter((m) => MESSAGES.deactivated.test(m)), 'confirmation messages').toEqual([]);
    });

    await steps.step('Review the user\'s status in the list - the user still shows as Active with no reason recorded', async () => {
      expect((await userListPage.readRowById(user.id)).status, 'the row\'s status').toMatch(/^Active/i);
      expect((await readUser(page, user.id)).isActive, 'the user record').toBe(true);
    });
  });

  test(`TC-${CASES.deactivatedCannotSignIn.azureId}: should refuse the sign-in of a deactivated user`, async ({
    page,
    userWithPassword,
    userListPage,
    signedOut,
    steps,
  }) => {
    const { user, password } = await userWithPassword();
    await deactivateThroughApi(page, user.id, 'other', 'Deactivated by the automation suite for a sign-in case.')
      .catch((e: Error) => steps.blocked(`the deactivation precondition of "${user.displayNameEn}": ${e.message}`));
    let outcome: SignInOutcome | null = null;

    await steps.critical('Navigate to the User Management module - the target user\'s status is shown as Inactive', async () => {
      expect(await openList(userListPage, user.displayNameEn), 'the deactivated user in the list').toBe(true);
      expect((await userListPage.readRowById(user.id)).status, 'the row\'s status').toMatch(/Inactive/i);
    });

    await steps.step('Open the sign-in page as the deactivated user and enter valid credentials - sign-in is rejected with an access-denied message', async () => {
      const w = await signedOut();
      await w.signIn.openSignedOut();
      const o = await w.signIn.attempt(user.email, password);
      outcome = o;
      expect(o.status, 'Account/Login').not.toBe(200);
      expect(`${o.alert} ${o.serverMessage}`, 'the message shown').toMatch(MESSAGES.accessDenied);
    });

    await steps.step('Confirm the user is not redirected to any authenticated page - the user remains on the sign-in page', async () => {
      expect(outcome?.path ?? '', 'the page after the attempt').toMatch(/\/login/);
    });
  });

  test(`TC-${CASES.reactivatedSignsIn.azureId}: should let a reactivated user sign in with the existing password`, async ({
    page,
    userWithPassword,
    userListPage,
    userConfirmDialog,
    signedOut,
    steps,
  }) => {
    const { user, password } = await userWithPassword();
    await deactivateThroughApi(page, user.id, 'other', 'Deactivated by the automation suite for a reactivation case.')
      .catch((e: Error) => steps.blocked(`the deactivation precondition of "${user.displayNameEn}": ${e.message}`));

    await steps.critical('Navigate to the User Management module - the deactivated user shows status Inactive', async () => {
      expect(await openList(userListPage, user.displayNameEn), 'the deactivated user in the list').toBe(true);
      expect((await userListPage.readRowById(user.id)).status, 'the row\'s status').toMatch(/Inactive/i);
    });

    await steps.critical('Select Activate on the user - a Yes / No confirmation prompt is displayed', async () => {
      const prompt = await userListPage.requestActivate(user.id);
      expect(`${prompt.title} ${prompt.message}`, 'the prompt').toMatch(MESSAGES.activatePrompt);
      expect(await userConfirmDialog.getActionKeys(), `the prompt's answers (${prompt.actions.join(' / ')})`).toEqual(expect.arrayContaining(['confirm', 'cancel']));
    });

    await steps.critical('Select Yes - "User activated" is displayed and the status changes to Active', async () => {
      const answer = await NetworkUtils.captureResponse(page, ApiEndpoints.userToggleActivation, () => clickDialogAction(page, 'confirm'));
      const messages = await toastMessages(page);
      expect(answer?.status ?? -1, `ToggleUserActivation answered ${answer?.text.slice(0, 200) ?? 'nothing'}`).toBe(200);
      expect(messages.join(' | '), 'the confirmation').toMatch(MESSAGES.activated);
      await expect.poll(async () => (await userListPage.readRowById(user.id)).status, { timeout: 15_000, message: 'the row\'s status' }).toMatch(/^Active/i);
    });

    await steps.step('Sign in as the reactivated user with the password used before the deactivation - sign-in succeeds and reaches the authenticated landing page', async () => {
      const w = await signedOut();
      await w.signIn.openSignedOut();
      const outcome = await w.signIn.attempt(user.email, password);
      expect(outcome.status, `Account/Login: ${outcome.serverMessage} ${outcome.alert}`).toBe(200);
      expect(outcome.path, 'the page after signing in').not.toMatch(/\/login/);
    });
  });

  test(`TC-${CASES.details500.azureId}: should accept deactivation details of exactly 500 characters`, async ({
    page,
    userIn,
    userListPage,
    steps,
  }) => {
    const user = await userIn('Active');
    const text = detailsOf(CASES.details500.length);
    let drawer!: UserDeactivateDrawer;

    await steps.critical('Navigate to the User Management module - the user list loads', async () => {
      expect(await openList(userListPage, user.displayNameEn), 'the active target user in the list').toBe(true);
    });

    await steps.critical('Select Inactivate on the active user - the Deactivate User drawer opens', async () => {
      drawer = await userListPage.openDeactivate(user.id);
      expect(await drawer.isOpen(), 'the drawer').toBe(true);
    });

    await steps.step('Select a reason, enter exactly 500 characters in Details and Confirm - the full text is accepted and "User deactivated" is displayed', async () => {
      await drawer.selectReason(CASES.details500.reason);
      await typeDeactivationDetails(page, text);
      expect((await drawer.readDetails()).length, 'characters held by Details').toBe(CASES.details500.length);
      const a = await drawer.attemptConfirm();
      expect(a.status, `ToggleUserActivation answered ${a.text.slice(0, 200)} ${a.errors.join(' | ')}`).toBe(200);
      expect(a.body.inactivationDetails, 'the details sent').toBe(text);
      expect(a.messages.join(' | '), 'the confirmation').toMatch(MESSAGES.deactivated);
    });
  });

  test(`TC-${CASES.reasonList.azureId}: should offer only the maintained deactivation reasons with Details optional except for Other`, async ({
    page,
    userIn,
    userListPage,
    steps,
  }) => {
    const user = await userIn('Active');
    let drawer!: UserDeactivateDrawer;
    let options: string[] = [];

    await steps.critical('Navigate to the User Management module - the user list loads', async () => {
      expect(await openList(userListPage, user.displayNameEn), 'the active target user in the list').toBe(true);
    });

    await steps.critical('Select Inactivate on the active user - the Deactivate User drawer opens', async () => {
      drawer = await userListPage.openDeactivate(user.id);
      expect(await drawer.isOpen(), 'the drawer').toBe(true);
    });

    await steps.step('Open the Deactivation Reason dropdown - only the maintained options are listed', async () => {
      options = await drawer.getReasonOptions();
      expect(options, 'the Deactivation Reason options').toEqual([...REASONS]);
    });

    await steps.step('Select each reason other than Other and confirm Details remains optional for each', async () => {
      await drawer.cancel();
      const outcome: Record<string, string> = {};
      for (const reason of REASONS.filter((r) => r !== 'Other')) {
        if (!options.includes(reason)) {
          outcome[reason] = 'not offered';
          continue;
        }
        await userListPage.openTable();
        await userListPage.revealRow(user.displayNameEn);
        const d = await userListPage.openDeactivate(user.id);
        await d.selectReason(reason);
        const a = await d.attemptConfirm();
        outcome[reason] = a.status === 200 ? 'optional' : `refused (${a.status}: ${[...a.errors, a.text.slice(0, 120)].join(' | ')})`;
        if (a.status === 200) await activateThroughApi(page, user.id);
        else if (await d.isOpen()) await d.cancel();
      }
      const expected = Object.fromEntries(Object.keys(outcome).map((r) => [r, 'optional']));
      expect(outcome, 'Details with each reason (deactivated with empty Details)').toEqual(expected);
      expect(Object.keys(outcome).length, 'reasons checked').toBe(REASONS.length - 1);
    });
  });

  test(`TC-${CASES.details501.azureId}: should not accept deactivation details longer than 500 characters`, async ({
    page,
    userIn,
    userListPage,
    steps,
  }) => {
    const user = await userIn('Active');
    let drawer!: UserDeactivateDrawer;

    await steps.critical('Navigate to the User Management module - the user list loads', async () => {
      expect(await openList(userListPage, user.displayNameEn), 'the active target user in the list').toBe(true);
    });

    await steps.critical('Select Inactivate on the active user - the Deactivate User drawer opens', async () => {
      drawer = await userListPage.openDeactivate(user.id);
      expect(await drawer.isOpen(), 'the drawer').toBe(true);
    });

    await steps.step('Select a reason and try to enter 501 characters in Details - entry stops at 500 or a length message is shown, and Confirm cannot proceed with the excess', async () => {
      await drawer.selectReason(CASES.details501.reason);
      await typeDeactivationDetails(page, detailsOf(CASES.details501.length));
      const held = (await drawer.readDetails()).length;
      const lengthError = (await drawer.getFieldErrors()).some((e) => MESSAGES.lengthError.test(e));
      expect(held <= 500 || lengthError, `Details holds ${held} characters (maxlength ${await drawer.getDetailsMaxLength()}); length error shown: ${lengthError}`).toBe(true);
      const a = await drawer.attemptConfirm();
      const sent = String(a.body.inactivationDetails ?? '').length;
      expect(sent, `characters sent with the deactivation (status ${a.status})`).toBeLessThanOrEqual(500);
    });
  });

  test(`TC-${CASES.activationNeedsYes.azureId}: should activate a user only after an explicit Yes`, async ({
    page,
    userIn,
    userListPage,
    userConfirmDialog,
    steps,
  }) => {
    const user = await userIn('Deactivated');

    await steps.critical('Navigate to the User Management module - the deactivated user shows status Inactive', async () => {
      expect(await openList(userListPage, user.displayNameEn), 'the deactivated user in the list').toBe(true);
      expect((await userListPage.readRowById(user.id)).status, 'the row\'s status').toMatch(/Inactive/i);
    });

    await steps.critical('Select Activate on the user - a Yes / No confirmation prompt is displayed', async () => {
      const prompt = await userListPage.requestActivate(user.id);
      expect(`${prompt.title} ${prompt.message}`, 'the prompt').toMatch(MESSAGES.activatePrompt);
      expect(await userConfirmDialog.getActionKeys(), `the prompt's answers (${prompt.actions.join(' / ')})`).toEqual(expect.arrayContaining(['confirm', 'cancel']));
    });

    await steps.step('Select No - the prompt closes and the user remains Inactive', async () => {
      const sent = await countWrites(page, ApiEndpoints.userToggleActivation, () => clickDialogAction(page, 'cancel'), 1_500);
      expect((await readDialog(page)).visible, 'the prompt after No').toBe(false);
      expect(sent, 'ToggleUserActivation requests sent').toBe(0);
      expect((await readUser(page, user.id)).isActive, 'the user record').toBe(false);
      expect((await userListPage.readRowById(user.id)).status, 'the row\'s status').toMatch(/Inactive/i);
    });

    await steps.step('Select Activate again and select Yes - the account is activated and "User activated" is displayed', async () => {
      const a = await userListPage.activateUser(user.id);
      expect(a.status, `ToggleUserActivation answered ${a.text.slice(0, 200)}`).toBe(200);
      expect(a.messages.join(' | '), 'the confirmation').toMatch(MESSAGES.activated);
      expect((await readUser(page, user.id)).isActive, 'the user record').toBe(true);
    });
  });

  test(`TC-${CASES.rapidConfirm.azureId}: should record a single deactivation when Confirm is clicked rapidly several times`, async ({
    page,
    userIn,
    userListPage,
    steps,
  }) => {
    const user = await userIn('Active');
    const since = new Date(Date.now() - 60_000).toISOString();
    let drawer!: UserDeactivateDrawer;

    await steps.critical('Navigate to the User Management module - the user list loads', async () => {
      expect(await openList(userListPage, user.displayNameEn), 'the active target user in the list').toBe(true);
    });

    await steps.critical(`Select Inactivate on the active user and select "${CASES.rapidConfirm.reason}" - the drawer is ready to confirm`, async () => {
      drawer = await userListPage.openDeactivate(user.id);
      await drawer.selectReason(CASES.rapidConfirm.reason);
      expect(await drawer.readReason(), 'the reason shown').toContain(CASES.rapidConfirm.reason);
    });

    await steps.step('Select Confirm several times in rapid succession - one "User deactivated" is shown and the drawer closes after the first submission', async () => {
      const sent = await countWrites(page, ApiEndpoints.userToggleActivation, () => burstClick(page, CONFIRM_IDS.deactivate, CASES.rapidConfirm.clicks));
      const messages = await toastMessages(page);
      expect(sent, `ToggleUserActivation requests after ${CASES.rapidConfirm.clicks} rapid confirmations`).toBe(1);
      expect(messages.filter((m) => MESSAGES.deactivated.test(m)).length, `"User deactivated" messages (${messages.join(' | ')})`).toBe(1);
      expect(await drawer.isOpen(), 'the drawer').toBe(false);
    });

    await steps.step('Review the user\'s history for duplicate deactivation entries - only one deactivation record exists', async () => {
      const trail = await deactivationEntriesSince(page, user.id, since);
      test.info().annotations.push({ type: 'observation', description: `20623 audit trail: ${trail.note}; Active -> Inactive entries: ${trail.count ?? 'unreadable'}` });
      expect(trail.count ?? 0, `Active -> Inactive audit entries (${trail.note})`).toBeLessThanOrEqual(1);
      expect((await readUser(page, user.id)).isActive, 'the user record').toBe(false);
    });
  });

  test(`TC-${CASES.listAndTilesRefresh.azureId}: should refresh the list row and the tiles at once after a deactivation`, async ({
    page,
    userIn,
    userListPage,
    steps,
  }) => {
    const user = await userIn('Active');
    let before = { active: NaN, inactive: NaN };

    await steps.critical('Navigate to the User Management module - the Active / Inactive tiles display current counts', async () => {
      await userListPage.openTable();
      const kpis = await userListPage.readKpis();
      expect(Number.isFinite(kpis.active.value) && Number.isFinite(kpis.inactive.value), `the tiles (${kpis.active.text} | ${kpis.inactive.text})`).toBe(true);
    });

    await steps.critical('Note the current Active and Inactive tile counts - they are recorded for comparison', async () => {
      before = { active: await userListPage.readKpi('active'), inactive: await userListPage.readKpi('inactive') };
      const api = await readUserDashboard(page);
      expect(before, 'the tiles against GetUsersDashboard').toEqual({ active: api.active, inactive: api.inactive });
    });

    await steps.step(`Deactivate an active user with reason "${CASES.listAndTilesRefresh.reason}" and confirm - "User deactivated" is displayed`, async () => {
      await userListPage.revealRow(user.displayNameEn);
      const drawer = await userListPage.openDeactivate(user.id);
      await drawer.selectReason(CASES.listAndTilesRefresh.reason);
      const a = await drawer.attemptConfirm();
      expect(a.status, `ToggleUserActivation answered ${a.text.slice(0, 200)} ${a.errors.join(' | ')}`).toBe(200);
      expect(a.messages.join(' | '), 'the confirmation').toMatch(MESSAGES.deactivated);
    });

    await steps.step('Review the list and the tiles - the row shows Inactive, Active decreases by one and Inactive increases by one', async () => {
      await expect.poll(async () => (await userListPage.readRowById(user.id)).status, { timeout: 15_000, message: 'the row\'s status' }).toMatch(/Inactive/i);
      await expect.poll(async () => ({ active: await userListPage.readKpi('active'), inactive: await userListPage.readKpi('inactive') }), { timeout: 15_000, message: `the tiles without a reload (before: Active ${before.active}, Inactive ${before.inactive})` })
        .toEqual({ active: before.active - 1, inactive: before.inactive + 1 });
    });
  });

  test(`TC-${CASES.exploratoryReasons.azureId}: should re-apply the Other rule when reasons are switched and reopen the drawer fresh`, async ({
    page,
    userIn,
    userListPage,
    steps,
  }) => {
    const user = await userIn('Active');
    const details = CASES.exploratoryReasons.details;
    let drawer!: UserDeactivateDrawer;

    await steps.critical('Navigate to the User Management module - the user list loads', async () => {
      expect(await openList(userListPage, user.displayNameEn), 'the active target user in the list').toBe(true);
    });

    await steps.step('Select Inactivate, choose Other, type details, then switch to Policy Violation - Details becomes optional and the typed text is kept or cleared consistently', async () => {
      drawer = await userListPage.openDeactivate(user.id);
      await drawer.selectReason('Other');
      await drawer.fillDetails(details);
      await drawer.selectReason('Policy Violation');
      const kept = await drawer.readDetails();
      test.info().annotations.push({ type: 'observation', description: `20625: Details after switching to Policy Violation: ${kept === details ? 'kept' : kept === '' ? 'cleared' : `changed to "${kept}"`}` });
      expect([details, ''], 'Details after the switch (kept or cleared)').toContain(kept);
      expect(await drawer.getFieldErrors(), 'errors under Policy Violation').not.toContain(MESSAGES.otherNeedsDetails);
    });

    await steps.step('Switch back to Other without re-entering Details and select Confirm - the Other details rule is enforced again', async () => {
      await drawer.selectReason('Other');
      const a = await drawer.attemptConfirm();
      if (a.status === 200) await activateThroughApi(page, user.id);
      expect(a.status, `Deactivate under Other without re-entered details answered ${a.status} (details held: "${String(a.body.inactivationDetails ?? '')}")`).toBe(-1);
      expect(a.errors, 'the validation message').toContain(MESSAGES.otherNeedsDetails);
    });

    await steps.step('Close the drawer with an outside click (or the browser back action) and reopen Inactivate - it opens fresh with no leftover reason or details', async () => {
      if (await drawer.isOpen()) await clickOutsideDrawer(page);
      if (await drawer.isOpen()) await page.goBack().catch(() => undefined);
      const closed = !(await drawer.isOpen());
      if (!closed) await drawer.cancel();
      await userListPage.openTable();
      await userListPage.revealRow(user.displayNameEn);
      const again = await userListPage.openDeactivate(user.id);
      const reason = await again.readReason();
      expect({ closedByOutsideClickOrBack: closed, leftoverReason: REASONS.find((r) => reason.includes(r)) ?? '', details: await again.readDetails() }, 'the drawer reopened')
        .toEqual({ closedByOutsideClickOrBack: true, leftoverReason: '', details: '' });
    });
  });

  test(`TC-${CASES.drawerChecklist.azureId}: should present the required warning text and controls in the Deactivate User drawer`, async ({
    page,
    userIn,
    userListPage,
    steps,
  }) => {
    const user = await userIn('Active');
    let drawer!: UserDeactivateDrawer;

    await steps.critical('Navigate to the User Management module - the user list loads', async () => {
      expect(await openList(userListPage, user.displayNameEn), 'the active target user in the list').toBe(true);
    });

    await steps.critical('Select Inactivate on the active user - the Deactivate User drawer opens', async () => {
      drawer = await userListPage.openDeactivate(user.id);
      expect(await drawer.isOpen(), 'the drawer').toBe(true);
    });

    await steps.step('Verify the drawer against the checklist - warning text, Deactivation Reason dropdown, Details field, Confirm and Cancel buttons are present and labelled', async () => {
      const controls = await deactivateDrawerControls(page);
      const text = await drawer.getText();
      expect(await drawer.getWarning(), 'the warning').toBe(warningFor(user.displayNameEn));
      expect({ reason: controls.reasonSelect, details: controls.detailsInput }, 'the Deactivation Reason dropdown and Details field').toEqual({ reason: true, details: true });
      expect(text, 'the field labels').toMatch(/Deactivation Reason/i);
      expect(text, 'the field labels').toMatch(/Details/i);
      expect(controls.confirm, 'the Confirm button').toMatch(/confirm|deactivate/i);
      expect(controls.cancel, 'the Cancel button').toMatch(/cancel/i);
    });
  });
});
