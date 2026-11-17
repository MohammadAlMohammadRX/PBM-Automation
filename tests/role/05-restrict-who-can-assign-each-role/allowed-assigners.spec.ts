import { test, expect } from '../../../fixtures';
import { ROLE_MESSAGES, ROLE_STATUS } from '../../../data/role/common.data';
import { CASES, CREATE_USER_RIGHT, DEACTIVATION_REASON, DIRECT_CREATE_GATE, ROLE_NAMES, SUITE_ROLE_RIGHTS } from '../../../data/role/restrictWhoCanAssignEachRole.data';
import {
  addUserRoleOptions,
  createUserAsSession,
  invitationRoleOptions,
  openAddUserForScopedRole,
  plainText,
  requireGate,
  roleIdByName,
  saveNewUserWithPayer,
  userRolesOf,
  type AddUserAtRoles,
} from '../../../utils/role/writerEHelpers';

/**
 * US 21284 - Restrict Who Can Assign Each Role: configuring "Allowed To Assign By" and what it enforces -
 * a role created with one allowed assigner, a deactivated role leaving the drop-downs, the server refusing a
 * forged CreateUser, and a Payer Administrator creating a Payer Officer inside its own payer. careconnect = the
 * System Administrator; the role holder plays the other accounts. See data/role/restrictWhoCanAssignEachRole.data.ts.
 */
test.describe('US 21284 - Restrict Who Can Assign Each Role', () => {
  test.describe.configure({ timeout: 15 * 60_000 });

  test(`TC-${CASES.createWithPayerAdministrator.azureId}: should save a new role with Payer Administrator as its only allowed assigner when the administrator configures it`, async ({ steps, page, roleAdmin, suiteRoles }) => {
    const data = CASES.createWithPayerAdministrator;
    const nameEn = suiteRoles.newName(data.label);
    const ids = { pa: '', role: '' };

    await steps.critical('Navigate to the Role Management module - the Role Management list page loads', async () => {
      await suiteRoles.watch();
      const answer = await roleAdmin.open();
      expect(answer.status).toBe(200);
      ids.pa = await roleIdByName(page, ROLE_NAMES.payerAdministrator);
      expect(ids.pa).not.toBe('');
    });

    await steps.critical(`Create a new ordinary role ("${nameEn}") and on the "Allowed To Assign By" step select "Payer Administrator" - the selection is recorded against the new role`, async () => {
      const form = await roleAdmin.openAdd();
      await form.fill({ nameEn, nameAr: suiteRoles.newArabicName(), descriptionEn: 'Allowed to be assigned by Payer Administrator only', allowedToAssignBy: data.allowedToAssignBy });
      expect(await form.readAllowedToAssignBy(), 'Allowed To Assign By chips').toEqual([...data.allowedToAssignBy]);
      expect(await form.readAllowedToAssignByIds(), 'Allowed To Assign By value').toEqual([ids.pa]);
    });

    await steps.critical('Save the role - the role is created successfully with Payer Administrator set as its allowed assigner', async () => {
      const form = roleAdmin.form;
      await form.nextToPrivileges();
      await form.tree.tick(SUITE_ROLE_RIGHTS[0]);
      const out = await form.saveExpectingSuccess();
      expect(out.toast, `CreateRole answered ${out.status} "${out.apiMessage}"`).toBe(`${ROLE_MESSAGES.createdSummary} ${ROLE_MESSAGES.createdDetail}`);
      ids.role = await suiteRoles.adopt(nameEn);
      expect((await suiteRoles.read(ids.role))?.assignableRoleIds, 'GetRole assignableRoleIds').toEqual([ids.pa]);
    });

    await steps.step('View the saved role - "Allowed To Assign By" shows Payer Administrator only', async () => {
      await roleAdmin.search(nameEn);
      const view = await roleAdmin.openView(ids.role);
      const values = await view.values();
      await view.close();
      expect(values['Allowed To Assign By'], `View Role values: ${Object.entries(values).map(([k, v]) => `${k}=${v}`).join('; ')}`).toBe(ROLE_NAMES.payerAdministrator);
    });
  });

  test(`TC-${CASES.directRequestRefused.azureId}: should refuse a forged user-creation request assigning a role the Payer Administrator may not grant`, async ({ steps, page, roleAdmin, roleHolder, suitePayers, suiteUsers, suiteApprovals }) => {
    const [payer] = await suitePayers.existing(1);
    const unauthorizedRole = CASES.directRequestRefused.unauthorizedRole;

    await steps.critical('Navigate to the Role Management module - the Role Management list page loads', async () => {
      const answer = await roleAdmin.open();
      expect(answer.status).toBe(200);
      expect(answer.totalRows).toBeGreaterThan(0);
    });

    await steps.critical(`Precondition: Payer Administrator is signed in, may create users (${CREATE_USER_RIGHT}) and is not offered "${unauthorizedRole}"`, async () => {
      await roleHolder.become({ role: ROLE_NAMES.payerAdministrator, payerIds: [payer.id] });
      const me = await roleHolder.permissions();
      expect(me.permissions, 'the Payer Administrator session holds the create-user right (baseline)').toContain(CREATE_USER_RIGHT);
      const options = await addUserRoleOptions(roleHolder.page, page);
      expect(options, `the Payer Administrator's Add User roles: ${options.join(' | ')}`).not.toContain(unauthorizedRole);
    });

    await steps.step(`As Payer Administrator, attempt to submit a user-creation request assigning the "${unauthorizedRole}" role by manipulating the submitted request directly - the system rejects the request`, async () => {
      requireGate(steps, DIRECT_CREATE_GATE);
      const res = await createUserAsSession(roleHolder.page, page, suiteUsers, await roleIdByName(page, unauthorizedRole));
      suiteApprovals.track(res.displayName); // a request routed to approval instead of refused is rejected at teardown
      const said = `CreateUser from the Payer Administrator's session answered ${res.status}: ${res.message}`;
      expect(res.status, said).toBeGreaterThanOrEqual(400);
      expect(res.status, said).toBeLessThan(500);
      expect(res.createdId, `${said} - a user ${res.email} now exists`).toBe('');
    });
  });

  test(`TC-${CASES.deactivatedRoleHidden.azureId}: should remove a deactivated role from the assignment drop-downs`, async ({ steps, page, roleAdmin, roleHolder, suiteRoles }) => {
    const data = CASES.deactivatedRoleHidden;
    const role = await suiteRoles.create({ label: data.label, allowedToAssignBy: data.allowedToAssignBy });

    await steps.critical('Navigate to the Role Management module - the Role Management list page loads', async () => {
      const answer = await roleAdmin.open();
      expect(answer.status).toBe(200);
      expect(answer.totalRows).toBeGreaterThan(0);
    });

    await steps.critical(`Precondition: the active custom role "${role.name}" is offered to an Organization Administrator`, async () => {
      await roleHolder.become({ role: ROLE_NAMES.organizationAdministrator });
      const options = await addUserRoleOptions(roleHolder.page, page);
      expect(options, `the Organization Administrator's Add User roles: ${options.join(' | ')}`).toContain(role.name);
    });

    await steps.critical('Deactivate the ordinary custom role - the role status becomes Inactive', async () => {
      await roleAdmin.open();
      await roleAdmin.search(role.name);
      const drawer = await roleAdmin.openDeactivate(role.id);
      const out = await drawer.deactivate(DEACTIVATION_REASON);
      expect(out.status, `SetActive answered "${out.apiMessage}", toast "${out.toast}"`).toBe(200);
      await expect(roleAdmin.statusBadge(role.id)).toHaveText(ROLE_STATUS.inactive);
      expect((await suiteRoles.read(role.id))?.isActive).toBe(false);
    });

    await steps.step('Sign in as Organization Administrator and open the User form role dropdown - the deactivated role no longer appears (nor on the Invitation form)', async () => {
      const userForm = await addUserRoleOptions(roleHolder.page, page);
      const invitationForm = await invitationRoleOptions(roleHolder.page);
      expect(userForm, `User form roles: ${userForm.join(' | ')}`).not.toContain(role.name);
      expect(invitationForm, `Invitation form roles: ${invitationForm.join(' | ')}`).not.toContain(role.name);
    });
  });

  test(`TC-${CASES.exactlyOneAssigner.azureId}: should enforce a role whose Allowed To Assign By holds exactly one role`, async ({ steps, page, roleAdmin, roleHolder, suiteRoles, suitePayers }) => {
    const data = CASES.exactlyOneAssigner;
    const [payer] = await suitePayers.existing(1);
    const nameEn = suiteRoles.newName(data.label);
    const ids = { pa: '', role: '' };

    await steps.critical('Navigate to the Role Management module - the Role Management list page loads', async () => {
      await suiteRoles.watch();
      const answer = await roleAdmin.open();
      expect(answer.status).toBe(200);
      ids.pa = await roleIdByName(page, ROLE_NAMES.payerAdministrator);
      expect(ids.pa).not.toBe('');
    });

    await steps.critical(`Create a custom role ("${nameEn}") with exactly one role (Payer Administrator) in "Allowed To Assign By", then save - the role saves successfully`, async () => {
      const form = await roleAdmin.openAdd();
      await form.fill({ nameEn, nameAr: suiteRoles.newArabicName(), allowedToAssignBy: data.allowedToAssignBy, hasAssignedPayers: true });
      expect(await form.readAllowedToAssignBy(), 'Allowed To Assign By chips').toEqual([...data.allowedToAssignBy]);
      await form.nextToPrivileges();
      await form.tree.tick(SUITE_ROLE_RIGHTS[0]);
      const out = await form.saveExpectingSuccess();
      expect(out.toast, `CreateRole answered ${out.status} "${out.apiMessage}"`).toBe(`${ROLE_MESSAGES.createdSummary} ${ROLE_MESSAGES.createdDetail}`);
      ids.role = await suiteRoles.adopt(nameEn);
      expect((await suiteRoles.read(ids.role))?.assignableRoleIds, 'GetRole assignableRoleIds').toEqual([ids.pa]);
    });

    await steps.step('Sign in as a user holding only Payer Administrator and check the assignment dropdown - the custom role appears', async () => {
      // The step names no form; the predefined Payer Administrator assigns roles through the Invitation form
      // (it holds Invitations.CreateInvitation, not Users.CreateUser - smoke 2026-11-14).
      await roleHolder.become({ role: ROLE_NAMES.payerAdministrator, payerIds: [payer.id] });
      const options = await invitationRoleOptions(roleHolder.page);
      expect(options, `the Payer Administrator's Invitation roles: ${options.join(' | ')}`).toContain(nameEn);
    });

    await steps.step(`Sign in as a user holding a different role not selected (${data.otherHolderRole}) - the custom role does not appear`, async () => {
      await roleHolder.become({ role: data.otherHolderRole });
      const options = await addUserRoleOptions(roleHolder.page, page);
      expect(options, `the ${data.otherHolderRole}'s Add User roles: ${options.join(' | ')}`).not.toContain(nameEn);
    });
  });

  test(`TC-${CASES.payerAdministratorCreatesPayerOfficer.azureId}: should let a Payer Administrator create a Payer Officer user within its own payer only`, async ({ steps, page, roleAdmin, roleHolder, suitePayers, suiteUsers, suiteApprovals }) => {
    const role = CASES.payerAdministratorCreatesPayerOfficer.roleToAssign;
    const [payer] = await suitePayers.existing(1);
    let opened: (AddUserAtRoles & { options: string[]; payers: string[] }) | null = null;

    await steps.critical('Navigate to the Role Management module - the Role Management list page loads', async () => {
      const answer = await roleAdmin.open();
      expect(answer.status).toBe(200);
      expect(answer.totalRows).toBeGreaterThan(0);
    });

    await steps.critical(`Sign in as the Payer Administrator for Payer X ("${payer.name}") and open Add User - the payer selection is limited to Payer X`, async () => {
      await roleHolder.become({ role: ROLE_NAMES.payerAdministrator, payerIds: [payer.id] }, { payerToChoose: payer.name });
      opened = await openAddUserForScopedRole(roleHolder.page, page, role, await roleIdByName(page, role));
      expect(opened.options, `the Payer Administrator's Add User roles: ${opened.options.join(' | ')}`).toContain(role);
      expect(opened.payers, `payers the Assign Payers picker offers for "${role}"`).toEqual([payer.name]);
    });

    await steps.step(`Select "${role}" as the role and complete the user creation - the new user is created under Payer X with the Payer Officer role`, async () => {
      const current = opened as unknown as AddUserAtRoles;
      suiteApprovals.track(current.displayName); // should the new user wait for approval, the request is rejected at teardown
      const answer = await saveNewUserWithPayer(current, payer.name, page, suiteUsers);
      const said = `CreateUser answered ${answer.status} (${plainText(answer.text, 200)}); shown: ${answer.messages.join(' | ')}; errors: ${answer.errors.join(' | ')}`;
      expect(answer.status, said).toBeGreaterThanOrEqual(200);
      expect(answer.status, said).toBeLessThan(300);
      expect(await userRolesOf(page, current.email), `the roles of ${current.email}`).toEqual([{ role, payerIds: [payer.id] }]);
    });
  });
});
