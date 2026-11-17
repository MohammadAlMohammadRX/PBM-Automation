import { test, expect } from '../../../fixtures';
import type { TestSteps } from '../../../fixtures/testStatus.fixture';
import type { RoleAdministrationPage } from '../../../pages/role/RoleAdministrationPage';
import { UserListPage } from '../../../pages/user/UserListPage';
import { UserFormDrawer } from '../../../pages/user/UserFormDrawer';
import {
  addUserToRolesStep,
  asHolderOnSuiteUser,
  assignmentKey,
  ensureSuiteUser,
  told,
  userAssignments,
} from '../../../utils/role/writerDHelpers';
import { findUserByEmail, readUserOrNull } from '../../../utils/UserProvisioning';
import { said, refused } from '../../../utils/user/writerBHelpers';
import { PREDEFINED_ROLES } from '../../../data/role/common.data';
import { CASES, EDITED_SECOND_NAME, NEEDS_PAYER_TEXT, PAYER_SCOPED_ROLE, PA_ASSIGNS_ROLE } from '../../../data/role/predefinedRoleModuleAccess.data';

const PA = PREDEFINED_ROLES.payerAdministrator;
const PO = PREDEFINED_ROLES.payerOfficer;

/** Azure step 1 of every case: Role Administration as careconnect. */
async function openModule(steps: TestSteps, roleAdmin: RoleAdministrationPage): Promise<void> {
  await steps.critical('Navigate to the Role Management module - the module home page is displayed', async () => {
    const answer = await roleAdmin.open();
    expect(answer.status, 'GetRoles answered').toBe(200);
  });
}

/**
 * User story 21286: Predefined Role Module Access - Users Administration under a payer-scoped role: what a Payer
 * Administrator may do to users of its payers (holder), and the payer a payer-scoped role needs (careconnect).
 */
test.describe('US 21286 - Predefined Role Module Access (users under a payer)', () => {
  test(`TC-${CASES.payerAdminManagesUsers.azureId}: should let a Payer Administrator add, edit, inactivate / activate, reassign and delete a user of its payer`, async ({ steps, roleAdmin, roleHolder, suitePayers, suiteUsers, page, newSuiteUserName, discardUserEmail }) => {
    const ctx = { a: { id: '', name: '' }, a2: { id: '', name: '' }, id: '' };
    const name = newSuiteUserName();
    await openModule(steps, roleAdmin);

    await steps.critical('Sign in as the Payer Administrator scoped to Payer A - the home dashboard loads', async () => {
      const [a, a2] = await suitePayers.existing(2);
      ctx.a = a;
      ctx.a2 = a2;
      const signIn = await roleHolder.become({ role: PA.en, payerIds: [a.id, a2.id] }, { payerToChoose: a.name });
      expect(new URL(signIn.url).pathname).not.toMatch(/\/login/);
    });

    await steps.step('Open Users Administration and add a new user under Payer A - the user is created and listed under Payer A', async () => {
      const list = new UserListPage(roleHolder.page);
      await list.openTable();
      expect(await list.isAddOffered(), 'Add User is offered to the Payer Administrator').toBe(true);
      discardUserEmail(name.email);
      const drawer = await list.openAddForm();
      expect((await addUserToRolesStep(roleHolder.page, drawer, name)).onStep3, 'Add User reached Roles and Privileges').toBe(true);
      await drawer.addRole(PA_ASSIGNS_ROLE);
      await drawer.assignPayers(await drawer.roleIdAt(0), [ctx.a.name]);
      const answer = await drawer.save();
      expect(answer.status, said(answer)).toBeLessThan(300);
      const created = await findUserByEmail(page, name.email);
      expect(created, 'the new user is found').not.toBeNull();
      expect(await userAssignments(page, created?.id ?? '')).toEqual([assignmentKey({ roleId: PO.id, payerIds: [ctx.a.id] })]);
    });

    await steps.critical('Precondition for the next steps: the new user exists under Payer A (careconnect makes it when the Payer Administrator could not)', async () => {
      ctx.id = await ensureSuiteUser(page, suiteUsers, name, { role: PO.en, payerIds: [ctx.a.id] });
      expect(ctx.id).not.toBe('');
    });

    await steps.step("Edit the new user's details and save - the changes are saved and reflected in the list", async () => {
      const list = new UserListPage(roleHolder.page);
      await list.openTable();
      await list.revealRow(name.displayNameEn);
      expect((await list.getActionState(ctx.id, 'edit')).availability, 'Edit offered on the row').toBe('available');
      const answer = await asHolderOnSuiteUser(page, roleHolder.page, ctx.id, { update: { englishSecondName: EDITED_SECOND_NAME } });
      expect(answer.status, `UpdateUser as the Payer Administrator answered ${told(answer)}`).toBeLessThan(300);
      expect((await readUserOrNull(page, ctx.id))?.englishSecondName).toBe(EDITED_SECOND_NAME);
    });

    await steps.step("Activate then inactivate the user - the user's status toggles and is reflected in the list", async () => {
      const list = new UserListPage(roleHolder.page);
      await list.openTable();
      await list.revealRow(name.displayNameEn);
      expect((await list.getActionState(ctx.id, 'toggleActivation')).availability, 'Activate / Inactivate offered on the row').toBe('available');
      const off = await asHolderOnSuiteUser(page, roleHolder.page, ctx.id, { active: false });
      expect(off.status, `inactivate as the Payer Administrator answered ${told(off)}`).toBeLessThan(300);
      expect((await readUserOrNull(page, ctx.id))?.isActive).toBe(false);
      const on = await asHolderOnSuiteUser(page, roleHolder.page, ctx.id, { active: true });
      expect(on.status, `activate as the Payer Administrator answered ${told(on)}`).toBeLessThan(300);
      expect((await readUserOrNull(page, ctx.id))?.isActive).toBe(true);
    });

    await steps.step("Reassign the user's role and payer assignment - the new role and payer assignment are saved", async () => {
      const target = { roleId: PO.id, payerIds: [ctx.a2.id] };
      const answer = await asHolderOnSuiteUser(page, roleHolder.page, ctx.id, { update: { assignedRoles: [target] } });
      expect(answer.status, `UpdateUser (roles) as the Payer Administrator answered ${told(answer)}`).toBeLessThan(300);
      expect(await userAssignments(page, ctx.id)).toEqual([assignmentKey(target)]);
    });

    await steps.step('Delete the user - the user is removed from the Payer A user list', async () => {
      const list = new UserListPage(roleHolder.page);
      await list.openTable();
      await list.revealRow(name.displayNameEn);
      expect((await list.getActionState(ctx.id, 'delete')).availability, 'Delete offered on the row').toBe('available');
      const answer = await asHolderOnSuiteUser(page, roleHolder.page, ctx.id, 'delete');
      expect(answer.status, `DeleteUser as the Payer Administrator answered ${told(answer)}`).toBeLessThan(300);
      expect(await readUserOrNull(page, ctx.id), 'GetUser after the delete').toBeNull();
    });
  });

  test(`TC-${CASES.payerScopedNeedsPayer.azureId}: should refuse a payer-scoped role with no payer and accept it with one or several payers`, async ({ steps, roleAdmin, suitePayers, suiteUsers, page, newSuiteUserName, discardUserEmail }) => {
    const ctx = { a: { id: '', name: '' }, b: { id: '', name: '' }, email: '' };
    const name = newSuiteUserName();
    const list = new UserListPage(page);
    await openModule(steps, roleAdmin);

    await steps.critical(`Sign in as a System Administrator and open the user assignment screen for a ${PAYER_SCOPED_ROLE} role - the payer selection control is displayed`, async () => {
      const [a, b] = await suitePayers.existing(2);
      ctx.a = a;
      ctx.b = b;
      await list.openTable();
      const drawer = await list.openAddForm();
      expect((await addUserToRolesStep(page, drawer, name)).onStep3, 'Add User reached Roles and Privileges').toBe(true);
      await drawer.addRole(PAYER_SCOPED_ROLE);
      const roleId = await drawer.roleIdAt(0);
      expect(roleId).toBe(PA.id);
      expect(await drawer.isAssignPayersOffered(roleId), 'Assign Payers offered on the role card').toBe(true);
      expect((await drawer.readPayerField(roleId)).shown, 'the Payers field on the role card').toBe(true);
    });

    await steps.step('Attempt to save the assignment with zero payers selected - the system blocks the save and requests at least one payer', async () => {
      const answer = await new UserFormDrawer(page).attemptSave();
      expect(refused(answer), `the save with no payer: ${said(answer)}`).toBe(true);
      expect([...answer.errors, ...answer.messages].join(' | '), 'the refusal names a payer').toMatch(NEEDS_PAYER_TEXT);
    });

    await steps.step('Select exactly one payer and save - the assignment succeeds and the user is scoped to that single payer', async () => {
      const drawer = new UserFormDrawer(page);
      discardUserEmail(name.email);
      await drawer.assignPayers(PA.id, [ctx.a.name]);
      const answer = await drawer.save();
      expect(answer.status, said(answer)).toBeLessThan(300);
      const created = await findUserByEmail(page, name.email);
      expect(await userAssignments(page, created?.id ?? '')).toEqual([assignmentKey({ roleId: PA.id, payerIds: [ctx.a.id] })]);
    });

    await steps.step('On a new assignment, select multiple payers and save - the assignment succeeds and the user is scoped to all selected payers', async () => {
      const user = await suiteUsers.create({ role: PO.en, payerIds: [ctx.a.id] });
      await list.openTable();
      await list.revealRow(user.displayNameEn);
      const drawer = await list.openAssign(user.id);
      await drawer.addRole(PAYER_SCOPED_ROLE);
      await drawer.assignPayers(PA.id, [ctx.a.name, ctx.b.name]);
      const answer = await drawer.save();
      expect(answer.status, said(answer)).toBeLessThan(300);
      expect(await userAssignments(page, user.id)).toContain(assignmentKey({ roleId: PA.id, payerIds: [ctx.a.id, ctx.b.id] }));
    });
  });
});
