import { test, expect } from '../../../fixtures';
import type { UserFormDrawer, UserSaveAnswer } from '../../../pages/user/UserFormDrawer';
import { clickDialogAction, readDialog } from '../../../pages/user/userCommon';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import { NetworkUtils } from '../../../utils/NetworkUtils';
import { ACTIVATION_EMAIL, BLOCKED, CASES, CREATED, FIRST_ACTIVATION } from '../../../data/user/createUser.data';
import { findUserByEmail, readUser, userSearchKey, waitForEmail } from '../../../utils/UserProvisioning';
import {
  drawerClosed,
  drawerUser,
  errorsShown,
  navigateToUser,
  navigateToUsers,
  passContact,
  passUserInfo,
  plainQuotes,
  refused,
  said,
  saved,
} from '../../../utils/user/writerBHelpers';

const LIST_SHOWN = 'the user list is displayed';
const NO_ANSWER: UserSaveAnswer = { status: -1, text: '', body: {}, messages: [], errors: [] };

/**
 * User story 20411: Create User - the three-step flow, the Roles and
 * Privileges step, the unsaved-changes guard, Active / Inactive creation and
 * first activation. Field rules are in create-user-fields.spec.ts, the
 * nationality / identity / document-ID rules in create-user-identity.spec.ts.
 * See data/user/createUser.data.ts for the literal readings.
 */
test.describe('US 20411 - Create User', () => {
  test.describe.configure({ timeout: 6 * 60_000 });

  test(`TC-${CASES.threeSteps.azureId}: should create the user when the administrator completes User Information, Contact Information and Roles and Privileges in order`, async ({
    page,
    steps,
    userListPage: list,
    suiteRole,
    newSuiteUserName,
    discardUserEmail,
  }) => {
    const role = await suiteRole();
    const name = newSuiteUserName();
    discardUserEmail(name.email);
    const user = await drawerUser(page, name);
    let drawer!: UserFormDrawer;

    await navigateToUsers(steps, list, LIST_SHOWN);

    await steps.critical('Click "Add User" - a three-step drawer opens on the User Information step', async () => {
      drawer = await list.openAddForm();
      expect({ title: await drawer.getTitle(), steps: await drawer.getStepLabels(), current: await drawer.currentStep() }, 'the Add User drawer').toEqual({
        title: expect.stringMatching(/add new user/i),
        steps: ['User Information', 'Contact Information', 'Roles and Privileges'],
        current: 1,
      });
    });

    await steps.step('Complete all mandatory User Information fields and click Next - the Contact Information step is displayed', async () => {
      const moved = await passUserInfo(drawer, user);
      expect(moved, `step 1 errors: ${await errorsShown(drawer)}`).toBe(true);
    });

    await steps.step('Complete all mandatory Contact Information fields and click Next - the Roles and Privileges step is displayed, and Next is replaced by Save', async () => {
      const moved = await passContact(drawer, user);
      const footer = await drawer.getFooterLabels();
      expect({ moved, save: footer.includes('Save'), next: footer.includes('Next') }, `step 2 errors: ${await errorsShown(drawer)}; footer ${JSON.stringify(footer)}`)
        .toEqual({ moved: true, save: true, next: false });
    });

    await steps.step(`Add a valid role ("${role.name}") and click Save - the user is created and "User created" confirmation is shown`, async () => {
      await drawer.addRole(role.name);
      const answer = await drawer.attemptSave();
      expect(saved(answer), said(answer)).toBe(true);
      expect(answer.messages.join(' | '), 'the confirmation').toMatch(CREATED);
      expect(await findUserByEmail(page, name.email), `"${name.displayNameEn}" stored`).not.toBeNull();
    });
  });

  test(`TC-${CASES.noRolesPrompt.azureId}: should prompt to add a role on Roles and Privileges and replace the prompt with a role card once one is added`, async ({
    page,
    steps,
    userListPage: list,
    newSuiteUserName,
  }) => {
    const c = CASES.noRolesPrompt;
    const user = await drawerUser(page, newSuiteUserName());
    let drawer!: UserFormDrawer;

    await navigateToUsers(steps, list, LIST_SHOWN);

    await steps.step(`Click "Add User" and proceed to Roles and Privileges - the step shows "${c.text}"`, async () => {
      drawer = await list.openAddForm();
      expect(await passUserInfo(drawer, user), `step 1 errors: ${await errorsShown(drawer)}`).toBe(true);
      expect(await passContact(drawer, user), `step 2 errors: ${await errorsShown(drawer)}`).toBe(true);
      expect({ cards: await drawer.countRoleCards(), prompt: plainQuotes(await drawer.getRolesEmptyText()) }).toEqual({ cards: 0, prompt: c.text });
    });

    await steps.step('Click "Add New User Roles" - a role card is added and the empty-state message disappears', async () => {
      await drawer.addRoleCard();
      expect({ cards: await drawer.countRoleCards(), prompt: await drawer.getRolesEmptyText() }).toEqual({ cards: 1, prompt: '' });
    });
  });

  test(`TC-${CASES.removeRoleCard.azureId}: should save the new user with only the remaining role when a role card is deleted before saving`, async ({
    page,
    steps,
    userListPage: list,
    suiteRole,
    newSuiteUserName,
    discardUserEmail,
  }) => {
    const removed = await suiteRole();
    const kept = await suiteRole();
    const name = newSuiteUserName();
    discardUserEmail(name.email);
    const user = await drawerUser(page, name);
    let drawer!: UserFormDrawer;

    await navigateToUsers(steps, list, LIST_SHOWN);

    await steps.critical(`Click "Add User" and proceed to Roles and Privileges (one role card, "${removed.name}") - the step shows one or more role cards`, async () => {
      drawer = await list.openAddForm();
      expect(await passUserInfo(drawer, user), `step 1 errors: ${await errorsShown(drawer)}`).toBe(true);
      expect(await passContact(drawer, user), `step 2 errors: ${await errorsShown(drawer)}`).toBe(true);
      await drawer.addRole(removed.name);
      expect(await drawer.countRoleCards(), 'role cards').toBeGreaterThanOrEqual(1);
    });

    await steps.step('Click the Delete Role button on a role card - the card is removed from the step', async () => {
      const before = await drawer.countRoleCards();
      await drawer.removeRole(removed.id);
      expect({ cards: await drawer.countRoleCards(), roles: await drawer.readRoles() }).toEqual({ cards: before - 1, roles: expect.not.arrayContaining([removed.name]) });
    });

    await steps.step(`Add a different valid role ("${kept.name}") and click Save - the user is created with only the remaining role`, async () => {
      await drawer.addRole(kept.name);
      const answer = await drawer.attemptSave();
      expect(saved(answer), said(answer)).toBe(true);
      const created = await findUserByEmail(page, name.email);
      expect(created, 'the new user').not.toBeNull();
      const roles = (await readUser(page, created?.id as string)).assignedRoles.map((r) => r.id);
      expect({ sent: answer.body.assignedRoles, stored: roles }).toEqual({ sent: [{ roleId: kept.id, payerIds: [] }], stored: [kept.id] });
    });
  });

  test(`TC-${CASES.payerRoleWithoutPayer.azureId}: should refuse to save a new user whose payer-scoped role has no payer selected`, async ({
    page,
    steps,
    userListPage: list,
    suiteRole,
    newSuiteUserName,
    discardUserEmail,
  }) => {
    const c = CASES.payerRoleWithoutPayer;
    const payerRole = await suiteRole({ hasAssignedPayers: true });
    const name = newSuiteUserName();
    discardUserEmail(name.email);
    const user = await drawerUser(page, name);
    let drawer!: UserFormDrawer;
    let answer = NO_ANSWER;

    await navigateToUsers(steps, list, LIST_SHOWN);

    await steps.critical('Click "Add User" and proceed to Roles and Privileges - the step is displayed', async () => {
      drawer = await list.openAddForm();
      expect(await passUserInfo(drawer, user), `step 1 errors: ${await errorsShown(drawer)}`).toBe(true);
      expect(await passContact(drawer, user), `step 2 errors: ${await errorsShown(drawer)}`).toBe(true);
      expect(await drawer.currentStep()).toBe(3);
    });

    await steps.step(`Click "Add New User Roles" and select a role marked "Has Assigned Payers?" ("${payerRole.name}") without selecting any payer - the role card shows no payer chips`, async () => {
      await drawer.addRole(payerRole.name);
      const offered = await drawer.isAssignPayersOffered(payerRole.id);
      let selected: string[] = ['(picker not opened)'];
      if (offered) {
        await drawer.openAssignPayers(payerRole.id);
        selected = await drawer.readPickerPayers('target');
        await drawer.closePicker(false);
      }
      expect({ assignPayersOffered: offered, payersSelected: selected }).toEqual({ assignPayersOffered: true, payersSelected: [] });
    });

    await steps.step('Click Save - the save action is rejected', async () => {
      answer = await drawer.attemptSave();
      expect(refused(answer), said(answer)).toBe(true);
    });

    await steps.step(`Observe the validation message - "${c.message}" is displayed`, async () => {
      expect([...answer.errors, ...answer.messages, ...(await drawer.getDrawerMessages())].join(' | '), said(answer)).toContain(c.message);
    });
  });

  test(`TC-${CASES.unsavedOnAdd.azureId}: should warn before losing unsaved changes and honour Keep Editing and Discard Changes when the Add User drawer is left`, async ({
    page,
    steps,
    userListPage: list,
    newSuiteUserName,
  }) => {
    const c = CASES.unsavedOnAdd;
    const name = newSuiteUserName();
    let drawer!: UserFormDrawer;

    await navigateToUsers(steps, list, LIST_SHOWN);

    await steps.critical(`Click "Add User" and enter data in one or more fields (English First / Last Name "QA ${name.lastName}") - the fields reflect the entered data`, async () => {
      drawer = await list.openAddForm();
      await drawer.type('englishFirstName', 'QA');
      await drawer.type('englishLastName', name.lastName);
      expect({ first: await drawer.getValue('englishFirstName'), last: await drawer.getValue('englishLastName') }).toEqual({ first: 'QA', last: name.lastName });
    });

    await steps.step(`Click Cancel - a warning "${c.message}" is displayed with "Keep Editing" and "Discard Changes" options`, async () => {
      const dialog = await drawer.cancel();
      expect(dialog, 'the Unsaved Changes warning').not.toBeNull();
      expect({ message: dialog?.message, keep: dialog?.actions.some((a) => /keep editing/i.test(a)), discard: dialog?.actions.some((a) => /discard changes/i.test(a)) })
        .toEqual({ message: c.message, keep: true, discard: true });
    });

    await steps.step('Click "Keep Editing" - the drawer remains open with the entered data intact', async () => {
      await drawer.keepEditing();
      expect({ dialog: (await readDialog(page)).visible, open: await drawer.isOpen(), last: await drawer.getValue('englishLastName') })
        .toEqual({ dialog: false, open: true, last: name.lastName });
    });

    await steps.step('Close the drawer again and click "Discard Changes" - the drawer closes and the entered data is discarded', async () => {
      const dialog = await drawer.close();
      if (dialog) await drawer.discardChanges();
      const closed = await drawerClosed(drawer);
      const again = await list.openAddForm();
      const reopened = await again.getValue('englishLastName');
      await again.close();
      expect({ warned: dialog !== null, closed, reopenedLastName: reopened }).toEqual({ warned: true, closed: true, reopenedLastName: '' });
    });
  });

  for (const active of [false, true]) {
    const c = active ? CASES.createActive : CASES.createInactive;
    const state = active ? 'Active' : 'Inactive';
    const title = active
      ? `TC-${c.azureId}: should create the user Active and state that an activation email has been sent when Is Active is ticked`
      : `TC-${c.azureId}: should create the user Inactive without mentioning an activation email when Is Active is left unticked`;

    test(title, async ({ page, steps, userListPage: list, suiteRole, newSuiteUserName, discardUserEmail }) => {
      const role = await suiteRole();
      const name = newSuiteUserName();
      discardUserEmail(name.email);
      const user = await drawerUser(page, name, { info: { isActive: active } });
      let drawer!: UserFormDrawer;
      let answer = NO_ANSWER;

      await navigateToUsers(steps, list, LIST_SHOWN);

      await steps.critical(`Click "Add User" and complete User Information (Is Active ${active ? 'ticked' : 'unticked'} - the checkbox sits on this step), Contact Information and Roles and Privileges - all steps show valid data`, async () => {
        drawer = await list.openAddForm();
        expect(await passUserInfo(drawer, user), `step 1 errors: ${await errorsShown(drawer)}`).toBe(true);
        expect(await passContact(drawer, user), `step 2 errors: ${await errorsShown(drawer)}`).toBe(true);
        await drawer.addRole(role.name);
        expect({ roles: await drawer.readRoles(), errors: await drawer.getFieldErrors() }).toEqual({ roles: [role.name], errors: [] });
      });

      await steps.step(`${active ? 'Tick' : 'Leave'} the "Is Active" checkbox ${active ? '' : 'unticked '}and click Save - the user is created`, async () => {
        answer = await drawer.attemptSave();
        expect(saved(answer), said(answer)).toBe(true);
        expect(answer.body.isActive, 'Is Active as sent').toBe(active);
      });

      await steps.step(active
        ? 'Observe the confirmation message - "User created" is displayed stating that an activation email has been sent'
        : 'Observe the confirmation message - "User created" is displayed with no mention of an activation email', async () => {
        const shown = answer.messages.join(' | ');
        expect(shown, 'the confirmation').toMatch(CREATED);
        if (active) expect(shown, 'the confirmation').toMatch(ACTIVATION_EMAIL);
        else expect(shown, 'the confirmation of an INACTIVE user').not.toMatch(ACTIVATION_EMAIL);
      });

      await steps.step(`Check the user list - the new user appears with Status = ${state}`, async () => {
        const created = await findUserByEmail(page, name.email);
        expect(created, 'the new user').not.toBeNull();
        await list.searchFor(userSearchKey(name.displayNameEn));
        expect((await list.readRowById(created?.id as string)).status, `the row of "${name.displayNameEn}"`).toBe(state);
      });
    });
  }

  test(`TC-${CASES.activateOnStartDate.azureId}: should make the account Active, create a password and send the sign-in details when an inactive user is activated`, async ({
    page,
    steps,
    userListPage: list,
    userIn,
  }) => {
    const user = await userIn('InactiveAtCreate');
    let since = '';

    await navigateToUser(steps, list, user, LIST_SHOWN);

    await steps.step(`Locate the inactive user ("${user.displayNameEn}") and select "Activate" - a confirmation prompt is displayed`, async () => {
      const dialog = await list.requestActivate(user.id);
      expect(dialog.title, `the prompt ${JSON.stringify(dialog)}`).toMatch(/activate user/i);
    });

    await steps.step('Confirm the activation (today - the user has no start date) - the action is processed', async () => {
      since = new Date(Date.now() - 120_000).toISOString();
      const answer = await NetworkUtils.captureResponse(page, ApiEndpoints.userToggleActivation, () => clickDialogAction(page, 'confirm'));
      expect(answer?.status, `ToggleUserActivation answered ${answer?.text.slice(0, 200)}`).toBe(200);
    });

    await steps.step('Check the user\'s status - the account status changes to Active', async () => {
      await list.searchFor(user.lastName);
      expect({ row: (await list.readRowById(user.id)).status, stored: (await readUser(page, user.id)).isActive }).toEqual({ row: 'Active', stored: true });
    });

    await steps.step('Verify delivery of credentials - a password is created and sign-in details are sent to the user (the First Activation e-mail)', async () => {
      const email = await waitForEmail(page, user.email, FIRST_ACTIVATION, since);
      expect({ subject: email.subject ?? '', carriesPassword: /temporary password/i.test(email.body ?? '') }).toEqual({ subject: expect.stringMatching(/activate/i), carriesPassword: true });
    });
  });

  test(`TC-${CASES.noRoleAdded.azureId}: should refuse to save a new user with no role added and ask for at least one role`, async ({
    page,
    steps,
    userListPage: list,
    newSuiteUserName,
    discardUserEmail,
  }) => {
    const c = CASES.noRoleAdded;
    const name = newSuiteUserName();
    discardUserEmail(name.email);
    const user = await drawerUser(page, name);
    let drawer!: UserFormDrawer;
    let answer = NO_ANSWER;

    await navigateToUsers(steps, list, LIST_SHOWN);

    await steps.critical('Click "Add User" and complete User Information and Contact Information - both steps are valid', async () => {
      drawer = await list.openAddForm();
      expect(await passUserInfo(drawer, user), `step 1 errors: ${await errorsShown(drawer)}`).toBe(true);
      expect(await passContact(drawer, user), `step 2 errors: ${await errorsShown(drawer)}`).toBe(true);
    });

    await steps.step('On Roles and Privileges, click Save without adding any role - the save action is rejected', async () => {
      expect(await drawer.countRoleCards(), 'role cards').toBe(0);
      answer = await drawer.attemptSave();
      expect(refused(answer), said(answer)).toBe(true);
    });

    await steps.step(`Observe the validation message - "${c.message}" is displayed`, async () => {
      expect([...answer.errors, ...(await drawer.getDrawerMessages())].join(' | '), said(answer)).toContain(c.message);
    });
  });

  test(`TC-${CASES.deactivationJob.azureId}: should deactivate a user automatically once its Account Deactivation Date arrives`, async ({ page, steps, userListPage: list, userIn }) => {
    const user = await userIn('Active', { deactivationInDays: 0 });

    await navigateToUser(steps, list, user, LIST_SHOWN);

    await steps.step('Confirm the target user\'s Status is Active and Account Deactivation Date is set - both values are visible on the user record', async () => {
      const record = await readUser(page, user.id);
      expect({ row: (await list.readRowById(user.id)).status, active: record.isActive, deactivationDate: !!record.accountDeactivationDate })
        .toEqual({ row: 'Active', active: true, deactivationDate: true });
    });

    await steps.step('Allow the scheduled deactivation job to run on/after the Account Deactivation Date - the job processes the user', async () => {
      steps.blocked(BLOCKED.deactivationJob);
    });

    await steps.step('Refresh the user list - the user\'s Status now shows Inactive', async () => {
      await list.searchFor(user.lastName);
      expect((await list.readRowById(user.id)).status).toBe('Inactive');
    });
  });

  test(`TC-${CASES.backAndForth.azureId}: should keep the entered data consistent when the administrator moves back and forth between the Add User steps`, async ({
    page,
    steps,
    userListPage: list,
    newSuiteUserName,
  }) => {
    const c = CASES.backAndForth;
    const user = await drawerUser(page, newSuiteUserName());
    let drawer!: UserFormDrawer;

    await navigateToUsers(steps, list, LIST_SHOWN);

    await steps.critical('Click "Add User" and fill in User Information, then click Next - Contact Information is displayed', async () => {
      drawer = await list.openAddForm();
      expect(await passUserInfo(drawer, user), `step 1 errors: ${await errorsShown(drawer)}`).toBe(true);
    });

    await steps.step('Click Back to User Information - previously entered data is retained', async () => {
      await drawer.back();
      expect({ step: await drawer.currentStep(), last: await drawer.getValue('englishLastName'), documentId: await drawer.getValue('documentId'), dob: await drawer.getValue('dob') })
        .toEqual({ step: 1, last: user.info.englishLastName, documentId: user.info.documentId, dob: user.info.dob });
    });

    await steps.step(`Change a field value (English Second Name "${c.secondName}"), proceed through Contact Information and Roles and Privileges, then click Back repeatedly to the first step - all step data remains consistent and reflects the latest edits`, async () => {
      await drawer.type('englishSecondName', c.secondName);
      const reachedContact = await drawer.next();
      await drawer.fillContact(user.contact);
      const reachedRoles = await drawer.next();
      await drawer.back();
      const contact = { step: await drawer.currentStep(), email: await drawer.getValue('email'), mobile: await drawer.getValue('phoneNumber') };
      await drawer.back();
      const info = { step: await drawer.currentStep(), second: await drawer.getValue('englishSecondName'), last: await drawer.getValue('englishLastName') };
      expect({ reachedContact, reachedRoles, contact, info }).toEqual({
        reachedContact: true,
        reachedRoles: true,
        contact: { step: 2, email: user.contact.email, mobile: user.contact.phoneNumber },
        info: { step: 1, second: c.secondName, last: user.info.englishLastName },
      });
    });

    await steps.step('Click Cancel and choose Discard Changes - the drawer closes cleanly with no residual state on reopening "Add User"', async () => {
      const dialog = await drawer.cancel();
      if (dialog) await drawer.discardChanges();
      const closed = await drawerClosed(drawer);
      const again = await list.openAddForm();
      const reopened = { step: await again.currentStep(), last: await again.getValue('englishLastName'), second: await again.getValue('englishSecondName'), documentId: await again.getValue('documentId') };
      const cleanClose = (await again.close()) === null;
      expect({ warned: dialog !== null, closed, reopened, cleanClose }).toEqual({ warned: true, closed: true, reopened: { step: 1, last: '', second: '', documentId: '' }, cleanClose: true });
    });
  });

  test(`TC-${CASES.secondNameOptional.azureId}: should accept a blank English Second Name and refuse one holding a digit`, async ({ page, steps, userListPage: list, newSuiteUserName }) => {
    const c = CASES.secondNameOptional;
    const user = await drawerUser(page, newSuiteUserName(), { info: { englishSecondName: '' } });
    let drawer!: UserFormDrawer;

    await navigateToUsers(steps, list, LIST_SHOWN);

    await steps.critical('Click "Add User" - the User Information step is displayed', async () => {
      drawer = await list.openAddForm();
      expect(await drawer.currentStep()).toBe(1);
    });

    await steps.step('Leave English Second Name blank and complete the remaining mandatory fields, then proceed - no validation error is raised for the blank field', async () => {
      const moved = await passUserInfo(drawer, user);
      expect({ moved, secondNameError: await drawer.getFieldError('englishSecondName') }, `step 1 errors: ${await errorsShown(drawer)}`).toEqual({ moved: true, secondNameError: '' });
    });

    await steps.step(`Return and enter "${c.invalid}" (contains a digit) into English Second Name and move focus away - a validation error is shown for the invalid character`, async () => {
      await drawer.back();
      await drawer.type('englishSecondName', c.invalid);
      expect(await drawer.getFieldError('englishSecondName'), 'the English Second Name error').toMatch(c.error);
    });
  });
});
