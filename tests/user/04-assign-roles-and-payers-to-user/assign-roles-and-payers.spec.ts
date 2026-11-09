import { test, expect } from '../../../fixtures';
import type { UserFormDrawer } from '../../../pages/user/UserFormDrawer';
import type { UserListPage } from '../../../pages/user/UserListPage';
import { CASES, MESSAGES } from '../../../data/user/assignRolesAndPayersToUser.data';
import { readUserOrNull } from '../../../utils/UserProvisioning';
import { pickPayers, rolesOnRecord, type NamedPayer } from '../../../utils/user/writerCHelpers';

/** "Navigate to the User Management module": opens Users Administration and answers whether it lists the case's user. */
async function openList(list: UserListPage, displayName: string): Promise<boolean> {
  await list.openTable();
  return list.isListed(displayName);
}

/**
 * User story 20410: Assign Roles and Payers to User - the administrator's
 * cases. Every target is a suite user, every role a suite role; payers are
 * real payers picked by name and only referenced. The permission and payer
 * scope cases live in assign-access.spec.ts. See the data file for the
 * readings.
 */
test.describe('US 20410 - Assign Roles and Payers to User', () => {
  test.describe.configure({ timeout: 6 * 60_000 });

  test(`TC-${CASES.opensOnRolesStep.azureId}: should open Assign Roles & Payers directly on the Roles and Privileges step`, async ({
    userIn,
    userListPage,
    steps,
  }) => {
    const user = await userIn('Active');
    let drawer!: UserFormDrawer;

    await steps.critical('Navigate to the User Management module - the user list is displayed', async () => {
      expect(await openList(userListPage, user.displayNameEn), 'the target user in the list').toBe(true);
    });

    await steps.critical('Locate an existing user and select "Assign Roles & Payers" from its actions - the Edit User drawer opens', async () => {
      expect((await userListPage.getActionState(user.id, 'assign')).availability, 'the row\'s Assign Roles & Payers').toBe('available');
      drawer = await userListPage.openAssign(user.id);
      expect(await drawer.isOpen(), 'the drawer').toBe(true);
      expect(await drawer.getTitle(), 'the drawer title').toMatch(/Edit User/i);
    });

    await steps.step('Observe which step of the drawer is shown - it opens directly on "Roles and Privileges", bypassing User Information and Contact Information', async () => {
      expect(await drawer.currentStep(), 'the step shown (3 = Roles and Privileges)').toBe(3);
      expect(await drawer.countRoleCards(), 'the user\'s current role card on the Roles and Privileges step').toBeGreaterThan(0);
    });
  });

  test(`TC-${CASES.payerRoleWithPayer.azureId}: should save a payer-scoped role together with its required payer`, async ({
    page,
    suiteRole,
    userIn,
    userListPage,
    userProfilePage,
    steps,
  }) => {
    const role = await suiteRole({ hasAssignedPayers: true });
    const user = await userIn('Active');
    const [payer] = await pickPayers(page, 1).catch((e: Error) => steps.blocked(`a payer for the Assign Payers picker: ${e.message}`));
    let drawer!: UserFormDrawer;
    let cardsBefore = 0;

    await steps.critical('Navigate to the User Management module - the user list is displayed', async () => {
      expect(await openList(userListPage, user.displayNameEn), 'the target user in the list').toBe(true);
    });

    await steps.critical('Open "Assign Roles & Payers" for the target user - the Roles and Privileges step is displayed', async () => {
      drawer = await userListPage.openAssign(user.id);
      expect(await drawer.currentStep(), 'the step shown').toBe(3);
      cardsBefore = await drawer.countRoleCards();
    });

    await steps.critical('Click "Add New User Roles" - a new role card is added', async () => {
      await drawer.addRoleCard();
      expect(await drawer.countRoleCards(), 'role cards after Add New User Roles').toBe(cardsBefore + 1);
    });

    await steps.critical('Select a role marked "Has Assigned Payers?" - the role is set on the card and a Payers selection control becomes available', async () => {
      expect(await drawer.getRoleOptions(), 'the Role list').toContain(role.name);
      await drawer.chooseRole(role.name);
      expect(await drawer.readRoles(), 'the roles on the cards').toContain(role.name);
      expect(await drawer.isAssignPayersOffered(role.id), 'Assign Payers on the payer-scoped role\'s card').toBe(true);
    });

    await steps.step('Open the Assign Payers picker and move a payer to Selected Payers - the payer appears as a chip under the role card', async () => {
      await drawer.assignPayers(role.id, [payer.name]);
      expect(await drawer.readRoleCardText(role.id), 'the role card').toContain(payer.name);
    });

    await steps.step('Click Save - the role and its payer are saved against the user and reflected on the profile', async () => {
      const saved = await drawer.attemptSave();
      expect(saved.status, `UpdateUser answered ${saved.text.slice(0, 200)} ${saved.errors.join(' | ')}`).toBe(200);
      expect(saved.messages.join(' | '), 'the confirmation').toMatch(MESSAGES.saved);
      expect((await rolesOnRecord(page, user.id))[role.name], 'the role\'s payers on the user record').toEqual([payer.id]);
      await userProfilePage.open(user.id);
      expect(Object.values(await userProfilePage.readSection('rolesStatus')).join(' | '), 'the profile\'s Roles & Status section').toContain(role.name);
    });
  });

  test(`TC-${CASES.noRoleBlocked.azureId}: should stop saving a user with no role assigned`, async ({
    userIn,
    userListPage,
    steps,
  }) => {
    const user = await userIn('Active', { roles: [] });
    let drawer!: UserFormDrawer;
    let saved!: Awaited<ReturnType<UserFormDrawer['attemptSave']>>;

    await steps.critical('Navigate to the User Management module - the user list is displayed', async () => {
      expect(await openList(userListPage, user.displayNameEn), 'the role-less target user in the list').toBe(true);
    });

    await steps.critical('Open "Assign Roles & Payers" for the target user - the Roles and Privileges step is displayed with no role cards', async () => {
      drawer = await userListPage.openAssign(user.id);
      expect(await drawer.currentStep(), 'the step shown').toBe(3);
      expect(await drawer.countRoleCards(), 'role cards').toBe(0);
      expect(await drawer.getRolesEmptyText(), 'the empty-roles text').toMatch(/No roles assigned yet/);
    });

    await steps.step('Click Save without adding any role - the save action is rejected', async () => {
      saved = await drawer.attemptSave();
      expect(saved.status, `nothing should be sent (UpdateUser answered ${saved.text.slice(0, 200)})`).toBe(-1);
      expect(await drawer.isOpen(), 'the drawer after Save').toBe(true);
    });

    await steps.step('Observe the validation message - "Add at least one role." is displayed', async () => {
      const shown = [...(saved?.errors ?? []), ...(await drawer.getDrawerMessages())];
      expect(shown, 'the messages on the Roles and Privileges step').toContain(MESSAGES.noRole);
    });
  });

  test(`TC-${CASES.duplicateRole.azureId}: should not let the same role be added to a user twice`, async ({
    page,
    suiteRole,
    userIn,
    userListPage,
    steps,
  }) => {
    const roleA = await suiteRole();
    const user = await userIn('Active');
    let drawer!: UserFormDrawer;
    let forced = false;

    await steps.critical('Navigate to the User Management module - the user list is displayed', async () => {
      expect(await openList(userListPage, user.displayNameEn), 'the target user in the list').toBe(true);
    });

    await steps.critical('Open "Assign Roles & Payers" for the target user - the Roles and Privileges step is displayed', async () => {
      drawer = await userListPage.openAssign(user.id);
      expect(await drawer.currentStep(), 'the step shown').toBe(3);
    });

    await steps.critical('Click "Add New User Roles" and select Role A - a role card with Role A is created', async () => {
      await drawer.addRole(roleA.name);
      expect(await drawer.readRoles(), 'the roles on the cards').toContain(roleA.name);
    });

    await steps.step('Click "Add New User Roles" again and try Role A on the new card - Role A is unavailable or a duplicate-role warning is shown', async () => {
      await drawer.addRoleCard();
      const options = await drawer.getRoleOptions();
      let warning = '';
      if (options.includes(roleA.name)) {
        forced = true;
        await drawer.chooseRole(roleA.name);
        warning = [...(await drawer.getFieldErrors()), ...(await drawer.getDrawerMessages())].find((m) => MESSAGES.duplicateWarning.test(m)) ?? '';
      }
      if (forced) expect(warning, `Role A was offered again on the second card (options: ${options.join(', ')}) - a duplicate-role warning`).toMatch(MESSAGES.duplicateWarning);
      else expect(options, 'the second card\'s Role list').not.toContain(roleA.name);
    });

    await steps.step('Attempt to Save - the save is blocked if the duplicate was forced through ("Duplicate role assignments are not allowed.")', async () => {
      const saved = await drawer.attemptSave();
      const record = await readUserOrNull(page, user.id);
      expect((record?.assignedRoles ?? []).filter((r) => r.id === roleA.id).length, 'Role A on the user record').toBeLessThanOrEqual(1);
      if (forced) {
        expect(saved.status >= 200 && saved.status < 300, `the duplicate save answered ${saved.status} ${saved.text.slice(0, 200)}`).toBe(false);
        expect([saved.text, ...saved.messages, ...saved.errors].join(' | '), 'the duplicate refusal').toMatch(MESSAGES.duplicate);
      }
    });
  });

  test(`TC-${CASES.roleWithoutPayers.azureId}: should save a role that takes no payers without asking for any`, async ({
    page,
    suiteRole,
    userIn,
    userListPage,
    steps,
  }) => {
    const role = await suiteRole({ hasAssignedPayers: false });
    const user = await userIn('Active');
    let drawer!: UserFormDrawer;

    await steps.critical('Navigate to the User Management module - the user list is displayed', async () => {
      expect(await openList(userListPage, user.displayNameEn), 'the target user in the list').toBe(true);
    });

    await steps.critical('Open "Assign Roles & Payers" for the target user - the Roles and Privileges step is displayed', async () => {
      drawer = await userListPage.openAssign(user.id);
      expect(await drawer.currentStep(), 'the step shown').toBe(3);
    });

    await steps.critical('Click "Add New User Roles" and select a role not marked "Has Assigned Payers?" - the card shows no payer selection control', async () => {
      await drawer.addRole(role.name);
      expect(await drawer.readRoles(), 'the roles on the cards').toContain(role.name);
      expect(await drawer.isAssignPayersOffered(role.id), 'Assign Payers on a role without payers').toBe(false);
    });

    await steps.step('Click Save - the role is saved without any payer association', async () => {
      const saved = await drawer.attemptSave();
      expect(saved.status, `UpdateUser answered ${saved.text.slice(0, 200)} ${saved.errors.join(' | ')}`).toBe(200);
      expect((await rolesOnRecord(page, user.id))[role.name], 'the role\'s payers on the user record').toEqual([]);
    });
  });

  test(`TC-${CASES.multiplePayerRoles.azureId}: should keep two payer-scoped roles each with its own payer set`, async ({
    page,
    suiteRole,
    userIn,
    userListPage,
    steps,
  }) => {
    const role1 = await suiteRole({ hasAssignedPayers: true });
    const role2 = await suiteRole({ hasAssignedPayers: true });
    const user = await userIn('Active', { roles: [] });
    const payers: NamedPayer[] = await pickPayers(page, 3).catch((e: Error) => steps.blocked(`three payers for the Assign Payers picker: ${e.message}`));
    const [payerA, payerB, payerC] = payers;
    let drawer!: UserFormDrawer;

    await steps.critical('Navigate to the User Management module - the user list is displayed', async () => {
      expect(await openList(userListPage, user.displayNameEn), 'the role-less target user in the list').toBe(true);
    });

    await steps.critical('Open "Assign Roles & Payers" for the target user - the Roles and Privileges step is displayed with no roles assigned', async () => {
      drawer = await userListPage.openAssign(user.id);
      expect(await drawer.currentStep(), 'the step shown').toBe(3);
      expect(await drawer.countRoleCards(), 'role cards').toBe(0);
    });

    await steps.critical('Add Role 1 (payer-scoped) and select Payer A and Payer B - the card shows chips for Payer A and Payer B', async () => {
      await drawer.addRole(role1.name);
      await drawer.assignPayers(role1.id, [payerA.name, payerB.name]);
      const card = await drawer.readRoleCardText(role1.id);
      expect(card, 'Role 1\'s card').toContain(payerA.name);
      expect(card, 'Role 1\'s card').toContain(payerB.name);
    });

    await steps.critical('Add Role 2 (payer-scoped) and select Payer C - its card shows a chip for Payer C only', async () => {
      await drawer.addRole(role2.name);
      await drawer.assignPayers(role2.id, [payerC.name]);
      const card = await drawer.readRoleCardText(role2.id);
      expect(card, 'Role 2\'s card').toContain(payerC.name);
      expect(card, 'Role 2\'s card').not.toContain(payerA.name);
      expect(card, 'Role 2\'s card').not.toContain(payerB.name);
    });

    await steps.step('Click Save - both roles are saved', async () => {
      const saved = await drawer.attemptSave();
      expect(saved.status, `UpdateUser answered ${saved.text.slice(0, 200)} ${saved.errors.join(' | ')}`).toBe(200);
      expect(await rolesOnRecord(page, user.id), 'the roles and payers on the user record').toEqual({
        [role1.name]: [payerA.id, payerB.id].sort(),
        [role2.name]: [payerC.id],
      });
    });

    await steps.step('Reopen "Assign Roles & Payers" for the same user - both roles are displayed, each with its own payer set', async () => {
      await userListPage.openTable();
      await userListPage.revealRow(user.displayNameEn);
      const again = await userListPage.openAssign(user.id);
      expect(await again.readRoles(), 'the roles on the cards').toEqual(expect.arrayContaining([role1.name, role2.name]));
      const card1 = await again.readRoleCardText(role1.id);
      const card2 = await again.readRoleCardText(role2.id);
      expect({ r1A: card1.includes(payerA.name), r1B: card1.includes(payerB.name), r1C: card1.includes(payerC.name), r2C: card2.includes(payerC.name), r2A: card2.includes(payerA.name) }, 'the payer chips per card')
        .toEqual({ r1A: true, r1B: true, r1C: false, r2C: true, r2A: false });
    });
  });

  test(`TC-${CASES.minimumAssignment.azureId}: should save the minimum valid assignment of one role with one payer`, async ({
    page,
    suiteRole,
    userIn,
    userListPage,
    steps,
  }) => {
    const role = await suiteRole({ hasAssignedPayers: true });
    const user = await userIn('Active', { roles: [] });
    const [payer] = await pickPayers(page, 1).catch((e: Error) => steps.blocked(`a payer for the Assign Payers picker: ${e.message}`));
    let drawer!: UserFormDrawer;

    await steps.critical('Navigate to the User Management module - the user list is displayed', async () => {
      expect(await openList(userListPage, user.displayNameEn), 'the role-less target user in the list').toBe(true);
    });

    await steps.critical('Open "Assign Roles & Payers" for the target user - the Roles and Privileges step is displayed', async () => {
      drawer = await userListPage.openAssign(user.id);
      expect(await drawer.currentStep(), 'the step shown').toBe(3);
    });

    await steps.critical('Add the payer-scoped role and select exactly one payer - the card shows a single payer chip', async () => {
      await drawer.addRole(role.name);
      await drawer.assignPayers(role.id, [payer.name]);
      expect(await drawer.countRoleCards(), 'role cards').toBe(1);
      expect(await drawer.readRoleCardText(role.id), 'the role card').toContain(payer.name);
    });

    await steps.step('Click Save - the save completes with exactly one role and one payer recorded', async () => {
      const saved = await drawer.attemptSave();
      expect(saved.status, `UpdateUser answered ${saved.text.slice(0, 200)} ${saved.errors.join(' | ')}`).toBe(200);
      expect(await rolesOnRecord(page, user.id), 'the user record').toEqual({ [role.name]: [payer.id] });
    });
  });

  test(`TC-${CASES.exploratoryRoleChanges.azureId}: should stay consistent when roles are changed repeatedly before saving`, async ({
    page,
    suiteRole,
    userIn,
    userListPage,
    steps,
  }) => {
    const payerRole = await suiteRole({ hasAssignedPayers: true });
    const plainRole = await suiteRole({ hasAssignedPayers: false });
    const user = await userIn('Active');
    const existingRole = user.record.assignedRoles[0]?.name ?? '';
    const [payer] = await pickPayers(page, 1).catch((e: Error) => steps.blocked(`a payer for the Assign Payers picker: ${e.message}`));
    let drawer!: UserFormDrawer;
    let base = 0;

    await steps.critical('Navigate to the User Management module - the user list is displayed', async () => {
      expect(await openList(userListPage, user.displayNameEn), 'the target user in the list').toBe(true);
    });

    await steps.critical('Open "Assign Roles & Payers" for a user - the Roles and Privileges step is displayed', async () => {
      drawer = await userListPage.openAssign(user.id);
      expect(await drawer.currentStep(), 'the step shown').toBe(3);
      base = await drawer.countRoleCards();
      expect(base, 'the user\'s existing role card').toBe(1);
    });

    await steps.step('Add a payer-scoped role with a payer, then switch the same card to a non payer-scoped role - the payer chips are cleared or hidden', async () => {
      await drawer.addRole(payerRole.name);
      await drawer.assignPayers(payerRole.id, [payer.name]);
      expect(await drawer.readRoleCardText(payerRole.id), 'the payer-scoped card before the switch').toContain(payer.name);
      await drawer.chooseRole(plainRole.name, base);
      expect(await drawer.readRoles(), 'the roles on the cards after the switch').toEqual([existingRole, plainRole.name]);
      expect(await drawer.isAssignPayersOffered(plainRole.id), 'Assign Payers after switching to a role without payers').toBe(false);
      expect(await drawer.getText(), 'the drawer after the switch').not.toContain(payer.name);
    });

    await steps.step('Add and remove several role cards quickly, try a duplicate and cancel mid-edit - the drawer stays stable with no stale role or payer data', async () => {
      for (let i = 0; i < 3; i += 1) await drawer.addRoleCard();
      for (let i = (await drawer.countRoleCards()) - 1; i > base; i -= 1) await drawer.removeRole(await drawer.roleIdAt(i));
      await drawer.addRoleCard();
      const duplicateOffered = (await drawer.getRoleOptions()).includes(plainRole.name);
      test.info().annotations.push({ type: 'observation', description: `20518: the chosen role offered again on a new card: ${duplicateOffered}` });
      await drawer.removeRole(await drawer.roleIdAt(base + 1));
      const prompt = await drawer.close();
      if (prompt) await drawer.keepEditing();
      expect(await drawer.isOpen(), 'the drawer after Keep Editing').toBe(true);
      expect(await drawer.countRoleCards(), 'role cards left').toBe(base + 1);
      expect(await drawer.readRoles(), 'the roles on the cards').toEqual([existingRole, plainRole.name]);
      expect(await drawer.getText(), 'the drawer').not.toContain(payer.name);
    });

    await steps.step('Save the final valid configuration - only the intended roles and payers are persisted', async () => {
      const saved = await drawer.attemptSave();
      expect(saved.status, `UpdateUser answered ${saved.text.slice(0, 200)} ${saved.errors.join(' | ')}`).toBe(200);
      expect(await rolesOnRecord(page, user.id), 'the user record').toEqual({ [existingRole]: [], [plainRole.name]: [] });
    });
  });
});
