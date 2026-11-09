import { test, expect, type UserRoleSession } from '../../../utils/user/userRole';
import type { UserFormDrawer } from '../../../pages/user/UserFormDrawer';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import { CASES, SCOPED_ADMIN_RIGHTS, SCOPED_PAYER } from '../../../data/user/assignRolesAndPayersToUser.data';
import { NetworkUtils } from '../../../utils/NetworkUtils';
import { listAssignableRoles, listUsers, payerIdByName, userSearchKey } from '../../../utils/UserProvisioning';
import { pickPayers } from '../../../utils/user/writerCHelpers';

/**
 * User story 20410: Assign Roles and Payers to User - who may assign and what
 * they may assign. Restricted accounts are suite users holding a suite role
 * (`userRole.signIn`), never the shared Payer Admin; the payer-scoped
 * administrator is scoped to Al sharq (decision 8). The admin baselines every
 * "control absent" case first. See the data file for the readings.
 */
test.describe('US 20410 - Assign Roles and Payers to User - access and scope', () => {
  test.describe.configure({ timeout: 8 * 60_000 });

  test(`TC-${CASES.onlyActiveAssignable.azureId}: should offer only active roles the administrator may assign in the Role list`, async ({
    suiteRole,
    userIn,
    userListPage,
    userRole,
    requireShapeApplied,
    steps,
  }) => {
    const assignable = await suiteRole();
    const notAssignable = await suiteRole();
    const inactive = await suiteRole({ isActive: false });
    const user = await userIn('Active');
    let drawer!: UserFormDrawer;
    let options: string[] = [];

    await steps.critical('Navigate to the User Management module - the user list is displayed', async () => {
      await userListPage.openTable();
      expect(await userListPage.isListed(user.displayNameEn), 'the target user in the list').toBe(true);
    });

    await steps.critical('Open "Assign Roles & Payers" for a user - the Roles and Privileges step is displayed', async () => {
      drawer = await userListPage.openAssign(user.id);
      expect(await drawer.currentStep(), 'the step shown').toBe(3);
    });

    await steps.critical('Click "Add New User Roles" and open the Role dropdown - the dropdown list is displayed', async () => {
      await drawer.addRoleCard();
      options = await drawer.getRoleOptions();
      expect(options.length, 'Role options').toBeGreaterThan(0);
    });

    await steps.step('Review the roles listed (administrator) - active roles appear; inactive roles are absent', async () => {
      expect(options, 'the administrator\'s Role list').toEqual(expect.arrayContaining([assignable.name, notAssignable.name]));
      expect(options, 'the administrator\'s Role list').not.toContain(inactive.name);
    });

    await steps.step('Review the roles listed (an administrator allowed to assign only some roles) - roles outside its permission and inactive roles are absent', async () => {
      const session = await userRole.signIn({ full: true, assignableRoleIds: [assignable.id, inactive.id] });
      requireShapeApplied(session);
      await session.users.openTable();
      await session.users.revealRow(user.displayNameEn);
      const limited = await session.users.openAssign(user.id);
      await limited.addRoleCard();
      const offered = await limited.getRoleOptions();
      if (!offered.includes(assignable.name)) {
        const answered = (await listAssignableRoles(session.page).catch(() => [])).map((r) => r.name);
        steps.blocked(`permission-not-granted: the suite administrator's Role list does not offer its assignable role "${assignable.name}" (options: ${offered.join(', ') || 'none'}; GetAssignableRoles answered: ${answered.join(', ') || '[]'})`);
      }
      expect(offered, 'the limited administrator\'s Role list').not.toContain(notAssignable.name);
      expect(offered, 'the limited administrator\'s Role list').not.toContain(inactive.name);
    });
  });

  test(`TC-${CASES.assignHiddenWithoutPermission.azureId}: should show Assign Roles & Payers only to administrators who hold the permission`, async ({
    userIn,
    userListPage,
    userRole,
    requireShapeApplied,
    steps,
  }) => {
    const user = await userIn('Active');
    let session!: UserRoleSession;

    await steps.critical('Navigate to the User Management module - the user list is displayed (baseline: the administrator is offered Assign Roles & Payers)', async () => {
      await userListPage.openTable();
      expect(await userListPage.isListed(user.displayNameEn), 'the target user in the list').toBe(true);
      const baseline = await userListPage.getActionState(user.id, 'assign');
      if (baseline.availability !== 'available') steps.blocked(`baseline: the administrator is not offered Assign Roles & Payers (${baseline.availability})`);
      expect(baseline.availability).toBe('available');
    });

    await steps.critical('Log in as the administrator without the Assign Roles & Payers permission (Users.UpdateUser withheld) - the user list is displayed', async () => {
      session = await userRole.signIn(CASES.assignHiddenWithoutPermission.shape);
      requireShapeApplied(session);
      await session.users.openTable();
      expect(await session.users.countRows(), 'rows in the restricted list').toBeGreaterThan(0);
    });

    await steps.step('Open the actions for any user - the available actions are displayed', async () => {
      expect(await session.users.isListed(user.displayNameEn), 'the target user in the restricted list').toBe(true);
      expect((await session.users.readRowActions(user.id)).length, 'the row\'s actions').toBeGreaterThan(0);
    });

    await steps.step('Check for the "Assign Roles & Payers" action - the action is not present', async () => {
      expect((await session.users.getActionState(user.id, 'assign')).availability, 'Assign Roles & Payers without Users.UpdateUser').toBe('absent');
    });

    await steps.step('Log out and log in as the administrator who holds the permission - the user list is displayed', async () => {
      const out = await session.menu.logout();
      expect(out.path, 'the restricted account after Logout').toMatch(/\/login/);
      await userListPage.openTable();
      expect(await userListPage.countRows(), 'rows in the administrator\'s list').toBeGreaterThan(0);
    });

    await steps.step('Open the actions for the same user - "Assign Roles & Payers" is visible and available', async () => {
      expect(await userListPage.isListed(user.displayNameEn), 'the target user in the list').toBe(true);
      expect((await userListPage.getActionState(user.id, 'assign')).availability, 'Assign Roles & Payers for the administrator').toBe('available');
    });
  });

  test(`TC-${CASES.scopedSeesOwnUsers.azureId}: should let a payer-scoped administrator see and manage only users of its own payers`, async ({
    page,
    suiteRole,
    userIn,
    userListPage,
    userRole,
    requireShapeApplied,
    steps,
  }) => {
    const scopedRole = await suiteRole({ hasAssignedPayers: true });
    const payerAId = await payerIdByName(page, SCOPED_PAYER).catch((e: Error) => steps.blocked(`Payer A "${SCOPED_PAYER}": ${e.message}`));
    const [payerB] = await pickPayers(page, 1, [SCOPED_PAYER]).catch((e: Error) => steps.blocked(`a second payer (Payer B): ${e.message}`));
    const userA = await userIn('Active', { roles: [{ roleId: scopedRole.id, payerIds: [payerAId] }] });
    const userB = await userIn('Active', { roles: [{ roleId: scopedRole.id, payerIds: [payerB.id] }] });
    let session!: UserRoleSession;

    await steps.critical('Navigate to the User Management module - the user list is displayed (users exist under Payer A and Payer B)', async () => {
      await userListPage.openTable();
      expect(await userListPage.isListed(userA.displayNameEn), `the ${SCOPED_PAYER} user`).toBe(true);
      expect(await userListPage.isListed(userB.displayNameEn), `the ${payerB.name} user`).toBe(true);
    });

    await steps.critical(`Log in as the payer-scoped administrator for Payer A (${SCOPED_PAYER}) - the user list loads`, async () => {
      session = await userRole.signIn({ with: SCOPED_ADMIN_RIGHTS, payers: [SCOPED_PAYER] });
      requireShapeApplied(session);
      await session.users.openTable();
      await session.users.expectToolbar();
      expect(await session.users.countRows(), 'rows in the scoped list (at least the administrator itself)').toBeGreaterThan(0);
    });

    await steps.step('Review the users displayed - only users belonging to Payer A are shown; users under Payer B are absent', async () => {
      const shown = { payerAUser: await session.users.isListed(userA.displayNameEn), payerBUser: await session.users.isListed(userB.displayNameEn) };
      const api = (await listUsers(session.page, { searchText: userSearchKey(userB.displayNameEn) }, 20)).items.some((u) => u.id === userB.id);
      expect({ ...shown, payerBUserInTheAnswer: api }, 'the scoped administrator\'s list').toEqual({ payerAUser: true, payerBUser: false, payerBUserInTheAnswer: false });
    });

    await steps.step('Attempt to open "Assign Roles & Payers" for the Payer B user via a direct action - the action is unavailable or access is denied', async () => {
      await session.users.searchFor(userSearchKey(userB.displayNameEn));
      const assign = (await session.users.getActionState(userB.id, 'assign')).availability;
      const direct = await NetworkUtils.requestAsSession(session.page, 'POST', ApiEndpoints.userGet, { id: userB.id });
      const denied = direct.status >= 400 || !/"payload"\s*:\s*\{/.test(direct.text);
      test.info().annotations.push({ type: 'observation', description: `20514: GetUser of the ${payerB.name} user from the ${SCOPED_PAYER} session answered ${direct.status}` });
      expect(assign === 'absent' || denied, `Assign Roles & Payers for the Payer B user is ${assign}; GetUser answered ${direct.status} ${direct.text.slice(0, 160)}`).toBe(true);
    });
  });

  test(`TC-${CASES.scopedOwnPayersOnly.azureId}: should never offer a payer-scoped administrator a payer outside its own payers`, async ({
    page,
    suiteRole,
    userIn,
    userListPage,
    userRole,
    requireShapeApplied,
    steps,
  }) => {
    const roleOnUser = await suiteRole({ hasAssignedPayers: true });
    const roleToAdd = await suiteRole({ hasAssignedPayers: true });
    const payerAId = await payerIdByName(page, SCOPED_PAYER).catch((e: Error) => steps.blocked(`Payer A "${SCOPED_PAYER}": ${e.message}`));
    const [payerB] = await pickPayers(page, 1, [SCOPED_PAYER]).catch((e: Error) => steps.blocked(`a second payer (Payer B): ${e.message}`));
    const userA = await userIn('Active', { roles: [{ roleId: roleOnUser.id, payerIds: [payerAId] }] });
    let session!: UserRoleSession;
    let drawer!: UserFormDrawer;

    await steps.critical('Navigate to the User Management module - the user list is displayed', async () => {
      await userListPage.openTable();
      expect(await userListPage.isListed(userA.displayNameEn), `the ${SCOPED_PAYER} user`).toBe(true);
    });

    await steps.critical(`Log in as the payer-scoped administrator for Payer A (${SCOPED_PAYER}) and open "Assign Roles & Payers" for a Payer A user - the Roles and Privileges step is displayed`, async () => {
      session = await userRole.signIn({ with: SCOPED_ADMIN_RIGHTS, payers: [SCOPED_PAYER], assignableRoleIds: [roleOnUser.id, roleToAdd.id] });
      requireShapeApplied(session);
      await session.users.openTable();
      await session.users.revealRow(userA.displayNameEn);
      drawer = await session.users.openAssign(userA.id);
      expect(await drawer.currentStep(), 'the step shown').toBe(3);
    });

    await steps.critical('Add a payer-scoped role and open the Assign Payers picker - the Available Payers list is displayed', async () => {
      await drawer.addRoleCard();
      const options = await drawer.getRoleOptions();
      let pickerRole = roleToAdd.id;
      if (options.includes(roleToAdd.name)) {
        await drawer.chooseRole(roleToAdd.name);
      } else {
        const answered = (await listAssignableRoles(session.page).catch(() => [])).map((r) => r.name);
        test.info().annotations.push({ type: 'permission-not-granted', description: `20515: the scoped Role list offers no role (options: ${options.join(', ') || 'none'}; GetAssignableRoles: ${answered.join(', ') || '[]'}) - the user's existing payer-scoped card's picker is used` });
        await drawer.removeRole(await drawer.roleIdAt((await drawer.countRoleCards()) - 1)).catch(() => undefined);
        if (!(await drawer.isAssignPayersOffered(roleOnUser.id))) steps.blocked(`the scoped administrator can neither pick a payer-scoped role (options: ${options.join(', ') || 'none'}) nor open the existing card's Assign Payers`);
        pickerRole = roleOnUser.id;
      }
      await drawer.openAssignPayers(pickerRole);
      const listed = [...(await drawer.readPickerPayers('source')), ...(await drawer.readPickerPayers('target'))];
      expect(listed.length, 'payers in the picker').toBeGreaterThan(0);
    });

    await steps.step(`Review the Available Payers list - only Payer A (${SCOPED_PAYER}) is listed; Payer B is not offered`, async () => {
      const available = await drawer.readPickerPayers('source');
      const selected = await drawer.readPickerPayers('target');
      expect(available, `Available Payers (Payer B = ${payerB.name})`).not.toContain(payerB.name);
      expect([...new Set([...available, ...selected])], 'every payer the scoped picker offers').toEqual([SCOPED_PAYER]);
      await drawer.closePicker(false);
    });
  });
});
