import { test, expect } from '../../../fixtures';
import type { TestSteps } from '../../../fixtures/testStatus.fixture';
import type { UserListPage } from '../../../pages/user/UserListPage';
import type { UserFormDrawer } from '../../../pages/user/UserFormDrawer';
import { BLOCKED, CASES, PAYER } from '../../../data/user/editUser.data';
import { listUsers, payerIdByName, readUser, type ProvisionedUser } from '../../../utils/UserProvisioning';
import { errorsShown, moveAllPayersBack, navigateToUser, navigateToUsers, openEditUser, said, saved } from '../../../utils/user/writerBHelpers';

/** "Open Edit on an existing user and go to Roles and Privileges" - the drawer on step 3, the roles read off the cards. */
async function openRolesStep(steps: TestSteps, list: UserListPage, user: ProvisionedUser, expected: string, roles: string[], also?: (drawer: UserFormDrawer) => Promise<void>): Promise<UserFormDrawer> {
  let drawer!: UserFormDrawer;
  await steps.critical(`Open Edit on an existing user and go to Roles and Privileges - ${expected}`, async () => {
    drawer = await openEditUser(list, user);
    expect(await drawer.ensureStep(3), `errors ${await errorsShown(drawer)}`).toBe(3);
    expect([...(await drawer.readRoles())].sort(), 'the role cards').toEqual([...roles].sort());
    if (also) await also(drawer);
  });
  return drawer;
}

const sorted = (values: string[]): string[] => [...values].sort();

/**
 * User story 20415: Edit User - roles and payers on edit (add a role, remove
 * one of two, the last role, the last payer, add a payer) and the built-in
 * account. See data/user/editUser.data.ts for the literal readings.
 */
test.describe('US 20415 - Edit User', () => {
  test.describe.configure({ timeout: 6 * 60_000 });

  test(`TC-${CASES.addRole.azureId}: should keep the original role and add the new one when a role is added to an existing user`, async ({ page, steps, userListPage: list, userIn, suiteRole }) => {
    const original = await suiteRole();
    const extra = await suiteRole();
    const user = await userIn('Active', { roles: [{ roleId: original.id, payerIds: [] }] });
    await navigateToUser(steps, list, user);
    const drawer = await openRolesStep(steps, list, user, `the step is displayed with the user's current role ("${original.name}") listed`, [original.name]);

    await steps.step(`Click Add New User Roles and select an additional role ("${extra.name}") - the new role is added to the list`, async () => {
      await drawer.addRole(extra.name);
      expect(sorted(await drawer.readRoles())).toEqual(sorted([original.name, extra.name]));
    });

    await steps.step('Save the changes - the user now has both roles assigned', async () => {
      const answer = await drawer.attemptSave();
      expect(saved(answer), said(answer)).toBe(true);
      expect(sorted((await readUser(page, user.id)).assignedRoles.map((r) => r.id)), 'the stored roles').toEqual(sorted([original.id, extra.id]));
    });
  });

  test(`TC-${CASES.removeOneOfTwoRoles.azureId}: should save the user with the remaining role when one of two roles is deleted`, async ({ page, steps, userListPage: list, userIn, suiteRole }) => {
    const kept = await suiteRole();
    const removed = await suiteRole();
    const user = await userIn('Active', { roles: [{ roleId: kept.id, payerIds: [] }, { roleId: removed.id, payerIds: [] }] });
    await navigateToUser(steps, list, user);
    const drawer = await openRolesStep(steps, list, user, 'both roles are displayed', [kept.name, removed.name]);

    await steps.step(`Click Delete Role against one of the roles ("${removed.name}") - that role is removed from the list, leaving one role remaining`, async () => {
      await drawer.removeRole(removed.id);
      expect({ cards: await drawer.countRoleCards(), roles: await drawer.readRoles() }).toEqual({ cards: 1, roles: [kept.name] });
    });

    await steps.step('Save the changes - the user is saved with the single remaining role', async () => {
      const answer = await drawer.attemptSave();
      expect(saved(answer), said(answer)).toBe(true);
      expect((await readUser(page, user.id)).assignedRoles.map((r) => r.id), 'the stored roles').toEqual([kept.id]);
    });
  });

  test(`TC-${CASES.lastRole.azureId}: should not let the administrator remove a user's only remaining role`, async ({ steps, userListPage: list, userIn, suiteRole }) => {
    const c = CASES.lastRole;
    const only = await suiteRole();
    const user = await userIn('Active', { roles: [{ roleId: only.id, payerIds: [] }] });
    await navigateToUser(steps, list, user);
    const drawer = await openRolesStep(steps, list, user, `the single role ("${only.name}") is displayed`, [only.name]);

    await steps.step('Click Delete Role against that role - the system either blocks the removal or warns that at least one role must remain', async () => {
      await drawer.removeRole(only.id);
      const cards = await drawer.countRoleCards();
      const shown = [...(await drawer.getDrawerMessages()), ...(await drawer.getFieldErrors()), ...(await list.readToasts())];
      expect(cards === 1 || shown.some((m) => c.warning.test(m)), `role cards left: ${cards}; shown ${JSON.stringify(shown)}`).toBe(true);
    });
  });

  test(`TC-${CASES.lastPayer.azureId}: should not let a payer-scoped role be left without a payer`, async ({ page, steps, userListPage: list, userIn, suiteRole }) => {
    const c = CASES.lastPayer;
    const role = await suiteRole({ hasAssignedPayers: true });
    const user = await userIn('Active', { roles: [{ roleId: role.id, payerIds: [await payerIdByName(page, PAYER.first)] }] });
    await navigateToUser(steps, list, user);
    const drawer = await openRolesStep(steps, list, user, `the payer-scoped role ("${role.name}") and its single payer ("${PAYER.first}", read in its Assign Payers picker) are displayed`, [role.name], async (d) => {
      await d.openAssignPayers(role.id);
      expect(await d.readPickerPayers('target'), 'Selected Payers').toEqual([PAYER.first]);
    });

    await steps.step('Attempt to remove the only payer from the role - the system blocks the removal or warns that at least one payer must remain', async () => {
      const moved = await moveAllPayersBack(page, drawer);
      let stillSelected = moved.after;
      if (moved.after.length === 0 && moved.saveEnabled) {
        await drawer.closePicker(true);
        await drawer.openAssignPayers(role.id);
        stillSelected = await drawer.readPickerPayers('target');
        await drawer.closePicker(false);
      }
      const shown = [...(await drawer.getDrawerMessages()), ...(await drawer.getFieldErrors()), ...(await list.readToasts())];
      const warned = shown.some((m) => c.warning.test(m));
      expect(stillSelected.length > 0 || !moved.saveEnabled || warned, `Selected Payers after the removal ${JSON.stringify(stillSelected)}; picker Save enabled ${moved.saveEnabled}; shown ${JSON.stringify(shown)}`).toBe(true);
    });
  });

  test(`TC-${CASES.addPayer.azureId}: should keep both payers when an additional payer is added to a payer-scoped role`, async ({ page, steps, userListPage: list, userIn, suiteRole }) => {
    const role = await suiteRole({ hasAssignedPayers: true });
    const firstId = await payerIdByName(page, PAYER.first);
    const addedId = await payerIdByName(page, PAYER.added);
    const user = await userIn('Active', { roles: [{ roleId: role.id, payerIds: [firstId] }] });
    await navigateToUser(steps, list, user);
    const drawer = await openRolesStep(steps, list, user, `the payer-scoped role ("${role.name}") is displayed`, [role.name]);

    await steps.step(`Click the Payers control and add an additional payer ("${PAYER.added}") - the new payer appears in the role's payer list`, async () => {
      await drawer.assignPayers(role.id, [PAYER.added]);
      await drawer.openAssignPayers(role.id);
      const selected = await drawer.readPickerPayers('target');
      await drawer.closePicker(false);
      expect(sorted(selected), 'Selected Payers').toEqual(sorted([PAYER.first, PAYER.added]));
    });

    await steps.step('Save the changes - both payers are retained against the role', async () => {
      const answer = await drawer.attemptSave();
      expect(saved(answer), said(answer)).toBe(true);
      const stored = (await readUser(page, user.id)).assignedRoles.find((r) => r.id === role.id);
      expect(sorted((stored?.assignedPayers ?? []).map((p) => p.id)), 'the stored payers of the role').toEqual(sorted([firstId, addedId]));
    });
  });

  test(`TC-${CASES.builtInAccount.azureId}: should leave a built-in platform account's roles unchanged and refuse its deactivation from the edit flow`, async ({ page, steps, userListPage: list }) => {
    let drawer: UserFormDrawer | null = null;
    await navigateToUsers(steps, list, 'the User Management list view is displayed');

    await steps.step('Open Edit on the built-in system account - the Edit User drawer opens on User Information', async () => {
      const builtIn = (await listUsers(page, {}, 200)).items.filter((u) => u.isStatic);
      if (builtIn.length === 0) steps.blocked(BLOCKED.builtInAccount);
      steps.blocked(`a built-in account is listed (${builtIn.map((u) => u.userName).join(', ')}), but the suite never edits an account it did not create - decision needed before this case can run`);
    });

    await steps.step('Go to Roles and Privileges and attempt to change or remove the assigned roles - the controls to change roles are unavailable or any change attempt is blocked', async () => {
      expect(drawer, 'the built-in account\'s Edit drawer').not.toBeNull();
    });

    await steps.step('Attempt to deactivate the account from within the edit flow - deactivation is prevented', async () => {
      expect(drawer, 'the built-in account\'s Edit drawer').not.toBeNull();
      drawer = null;
    });
  });
});
