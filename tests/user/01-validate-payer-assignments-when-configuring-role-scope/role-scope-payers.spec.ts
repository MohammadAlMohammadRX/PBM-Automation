import { test, expect } from '../../../fixtures';
import type { UserFormDrawer } from '../../../pages/user/UserFormDrawer';
import type { UserListPage } from '../../../pages/user/UserListPage';
import {
  CASES,
  PAYER_REQUIRED,
  ROLE_WALK_LIMIT,
  SCOPE_PAYER,
  USER_SAVED,
} from '../../../data/user/validatePayerAssignmentsWhenConfiguringRoleScope.data';
import { listAssignableRoles, payerIdByName, readUser, type ProvisionedUser, type UserRecord } from '../../../utils/UserProvisioning';
import { movePayersBack, payerNamesOf, pickerAll } from '../../../utils/user/writerAHelpers';

/**
 * User story 14293: Validate Payer Assignments When Configuring Role Scope -
 * the SYSTEM administrator's cases. "Role Scope configuration" is the user
 * drawer's step 3 (Assign Roles & Payers on a suite user); the payer-scoped and
 * plain roles are suite roles. The payer-scoped administrator's cases (20472,
 * 20473, 20480) are in role-scope-payer-eligibility.spec.ts. See the data file.
 */

/** The roles a suite user holds after a save: role id -> payer ids. */
function heldRoles(record: UserRecord): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const r of record.assignedRoles ?? []) out[r.id] = (r.assignedPayers ?? []).map((p) => p.id);
  return out;
}

/**
 * "The Payer field is displayed, empty": the card offers Assign Payers, shows its "Payers" field
 * and holds no payer chip. (Until 2026-11-08 this required a "No payers assigned yet" wording the
 * case does not name, read from `small, p` elements - the app's empty text is a <span>.)
 */
async function payerFieldState(drawer: UserFormDrawer, roleId: string): Promise<{ assignPayers: boolean; payerField: boolean; payers: string[] }> {
  const field = await drawer.readPayerField(roleId);
  return { assignPayers: await drawer.isAssignPayersOffered(roleId), payerField: field.shown, payers: field.chips };
}

/** What "the Payer field is displayed, empty" reads as. */
const EMPTY_PAYER_FIELD = { assignPayers: true, payerField: true, payers: [] as string[] };

/** Users Administration -> the target's row -> Assign Roles & Payers (step 3). */
async function openRoleScope(list: UserListPage, target: ProvisionedUser): Promise<UserFormDrawer> {
  await list.revealRow(target.displayNameEn);
  const drawer = await list.openAssign(target.id);
  expect(await drawer.currentStep(), 'Assign Roles & Payers opens the drawer on step 3 Roles and Privileges').toBe(3);
  return drawer;
}

test.describe('US 14293 - Validate Payer Assignments When Configuring Role Scope', () => {
  test.describe.configure({ timeout: 6 * 60_000 });

  test(`TC-${CASES.assignAllowedPayer.azureId}: should save a payer-scoped role with an in-scope payer when the administrator assigns one`, async ({
    page,
    steps,
    suiteRole,
    userIn,
    userListPage: list,
  }) => {
    const scoped = await suiteRole({ hasAssignedPayers: true });
    const target = await userIn('Active');
    const payerId = await payerIdByName(page, SCOPE_PAYER);
    let drawer!: UserFormDrawer;

    await steps.critical('Navigate to the User Management module - the module landing page is displayed', async () => {
      await list.openTable();
      await list.expectToolbar();
    });

    await steps.critical('Open the Role Scope configuration screen - the list of roles is displayed', async () => {
      drawer = await openRoleScope(list, target);
      await drawer.addRoleCard();
      const options = await drawer.getRoleOptions();
      expect(options, options.join(' | ')).toContain(scoped.name);
    });

    await steps.critical(`Select a role that requires payer scoping ("${scoped.name}") - the Payer field becomes visible`, async () => {
      await drawer.chooseRole(scoped.name);
      expect(await drawer.isAssignPayersOffered(scoped.id), 'Assign Payers on the payer-scoped role card').toBe(true);
    });

    await steps.step('Open the Payer field list - only payers within the administrator\'s scope are listed', async () => {
      await drawer.openAssignPayers(scoped.id);
      const { available, selected } = await pickerAll(drawer);
      const scope = await payerNamesOf(page);
      expect({ outside: [...available, ...selected].filter((n) => !scope.includes(n)), listsPayerA: available.includes(SCOPE_PAYER) })
        .toEqual({ outside: [], listsPayerA: true });
    });

    await steps.critical(`Select a payer from the list ("${SCOPE_PAYER}") - the payer is added to the assigned payers list`, async () => {
      await drawer.movePayers([SCOPE_PAYER]);
      expect((await pickerAll(drawer)).selected).toEqual([SCOPE_PAYER]);
      await drawer.closePicker(true);
      expect(await drawer.getText()).toContain(SCOPE_PAYER);
    });

    await steps.step('Click Save - the role scope configuration is saved and a confirmation message is displayed', async () => {
      const saved = await drawer.attemptSave();
      expect({ status: saved.status, confirmed: saved.messages.some((m) => USER_SAVED.test(m)) }, `${saved.text.slice(0, 200)} ${saved.messages.join(' | ')} ${saved.errors.join(' | ')}`)
        .toEqual({ status: 200, confirmed: true });
      expect(heldRoles(await readUser(page, target.id))[scoped.id], 'the payers saved on the payer-scoped role').toEqual([payerId]);
    });
  });

  test(`TC-${CASES.noPayerBlocked.azureId}: should refuse to save a payer-scoped role when no payer is assigned`, async ({
    page,
    steps,
    suiteRole,
    userIn,
    userListPage: list,
  }) => {
    const scoped = await suiteRole({ hasAssignedPayers: true });
    const target = await userIn('Active');
    let drawer!: UserFormDrawer;

    await steps.critical('Navigate to the User Management module - the module landing page is displayed', async () => {
      await list.openTable();
      await list.expectToolbar();
    });

    await steps.critical('Open Role Scope configuration and select a payer-scoped role - the Payer field is displayed, empty', async () => {
      drawer = await openRoleScope(list, target);
      await drawer.addRole(scoped.name);
      expect(await payerFieldState(drawer, scoped.id), 'the Payer field on the card').toEqual(EMPTY_PAYER_FIELD);
    });

    await steps.step('Leave the Payer field empty (0 payers assigned) - the assigned payers count remains 0', async () => {
      await drawer.openAssignPayers(scoped.id);
      expect((await pickerAll(drawer)).selected).toEqual([]);
      await drawer.closePicker(false);
    });

    await steps.step('Click Save - a validation error states at least one payer must be assigned, and the role is not saved', async () => {
      const saved = await drawer.attemptSave();
      const shown = [...saved.errors, ...saved.messages, ...(await drawer.getDrawerMessages())];
      expect({ refusedMessage: shown.some((m) => PAYER_REQUIRED.test(m)), written: saved.status >= 200 && saved.status < 300 }, `${saved.status} ${saved.text.slice(0, 200)} ${shown.join(' | ')}`)
        .toEqual({ refusedMessage: true, written: false });
      expect(Object.keys(heldRoles(await readUser(page, target.id))), 'the payer-scoped role must not be saved').not.toContain(scoped.id);
    });
  });

  test(`TC-${CASES.exactlyOnePayer.azureId}: should save a payer-scoped role when exactly one payer is assigned`, async ({
    page,
    steps,
    suiteRole,
    userIn,
    userListPage: list,
  }) => {
    const scoped = await suiteRole({ hasAssignedPayers: true });
    const target = await userIn('Active');
    const payerId = await payerIdByName(page, SCOPE_PAYER);
    let drawer!: UserFormDrawer;

    await steps.critical('Navigate to the User Management module - the module landing page is displayed', async () => {
      await list.openTable();
      await list.expectToolbar();
    });

    await steps.critical('Open Role Scope configuration and select the payer-scoped role - the Payer field is displayed, empty', async () => {
      drawer = await openRoleScope(list, target);
      await drawer.addRole(scoped.name);
      expect(await payerFieldState(drawer, scoped.id), 'the Payer field on the card').toEqual(EMPTY_PAYER_FIELD);
    });

    await steps.critical(`Select exactly one payer ("${SCOPE_PAYER}") - the assigned payers count shows 1`, async () => {
      await drawer.openAssignPayers(scoped.id);
      await drawer.movePayers([SCOPE_PAYER]);
      expect((await pickerAll(drawer)).selected).toHaveLength(1);
      await drawer.closePicker(true);
    });

    await steps.step('Click Save - the role is saved with a confirmation message', async () => {
      const saved = await drawer.attemptSave();
      expect({ status: saved.status, confirmed: saved.messages.some((m) => USER_SAVED.test(m)) }, `${saved.text.slice(0, 200)} ${saved.messages.join(' | ')} ${saved.errors.join(' | ')}`)
        .toEqual({ status: 200, confirmed: true });
      expect(heldRoles(await readUser(page, target.id))[scoped.id]).toEqual([payerId]);
    });
  });

  test(`TC-${CASES.fieldFollowsScoping.azureId}: should hide and not require the Payer field for a non-payer-scoped role and require it for a payer-scoped one`, async ({
    page,
    steps,
    suiteRole,
    userIn,
    userListPage: list,
  }) => {
    const scoped = await suiteRole({ hasAssignedPayers: true });
    const plain = await suiteRole({});
    const target = await userIn('Active');
    let drawer!: UserFormDrawer;

    await steps.critical('Navigate to the User Management module - the module landing page is displayed', async () => {
      await list.openTable();
      await list.expectToolbar();
    });

    await steps.step(`Open Role Scope configuration and select the non-payer-scoped role ("${plain.name}") - the Payer field is hidden and no payer validation is enforced`, async () => {
      drawer = await openRoleScope(list, target);
      await drawer.addRole(plain.name);
      const field = await drawer.readPayerField(plain.id);
      expect({ payerField: (await drawer.isAssignPayersOffered(plain.id)) || field.shown, required: field.required }, JSON.stringify(field))
        .toEqual({ payerField: false, required: false });
    });

    await steps.step('Click Save without assigning any payer - the role is saved without error', async () => {
      const saved = await drawer.attemptSave();
      expect(saved.status, `${saved.text.slice(0, 200)} ${saved.messages.join(' | ')} ${saved.errors.join(' | ')}`).toBe(200);
      expect(heldRoles(await readUser(page, target.id))[plain.id]).toEqual([]);
    });

    await steps.critical(`Select the payer-scoped role ("${scoped.name}") instead - the Payer field becomes visible and required`, async () => {
      // The drawer slides out after the Save of step 3: wait for it instead of clicking a vanishing X (full run 20475).
      if (!(await drawer.waitForClosed()) && (await drawer.isOpen())) await drawer.close();
      await list.openTable();
      drawer = await openRoleScope(list, target);
      await drawer.addRole(scoped.name);
      const field = await drawer.readPayerField(scoped.id);
      expect({ payerField: (await drawer.isAssignPayersOffered(scoped.id)) && field.shown, required: field.required }, JSON.stringify(field))
        .toEqual({ payerField: true, required: true });
    });

    await steps.step('Attempt to Save without assigning a payer - a validation error is shown and the save is blocked', async () => {
      const saved = await drawer.attemptSave();
      const shown = [...saved.errors, ...saved.messages, ...(await drawer.getDrawerMessages())];
      expect({ refusedMessage: shown.some((m) => PAYER_REQUIRED.test(m)), written: saved.status >= 200 && saved.status < 300 }, `${saved.status} ${saved.text.slice(0, 200)} ${shown.join(' | ')}`)
        .toEqual({ refusedMessage: true, written: false });
      expect(Object.keys(heldRoles(await readUser(page, target.id)))).not.toContain(scoped.id);
    });
  });

  test(`TC-${CASES.fieldReappears.azureId}: should show the Payer field empty and required when the role switches to a payer-scoped one`, async ({
    page,
    steps,
    suiteRole,
    userIn,
    userListPage: list,
  }) => {
    const scoped = await suiteRole({ hasAssignedPayers: true });
    const plain = await suiteRole({});
    const target = await userIn('Active');
    let drawer!: UserFormDrawer;

    await steps.critical('Navigate to the User Management module - the module landing page is displayed', async () => {
      await list.openTable();
      await list.expectToolbar();
    });

    await steps.critical(`Open Role Scope configuration with a non-payer-scoped role selected ("${plain.name}") - the Payer field is hidden`, async () => {
      drawer = await openRoleScope(list, target);
      await drawer.addRole(plain.name);
      expect(await drawer.isAssignPayersOffered(plain.id)).toBe(false);
    });

    await steps.step(`Change the role selection to a payer-scoped role ("${scoped.name}") - the Payer field becomes visible and empty`, async () => {
      await drawer.chooseRole(scoped.name);
      expect(await payerFieldState(drawer, scoped.id), 'the Payer field on the card').toEqual(EMPTY_PAYER_FIELD);
    });

    await steps.step('Attempt to save without assigning a payer - a validation error requires at least one payer', async () => {
      const saved = await drawer.attemptSave();
      const shown = [...saved.errors, ...saved.messages, ...(await drawer.getDrawerMessages())];
      expect({ refusedMessage: shown.some((m) => PAYER_REQUIRED.test(m)), written: saved.status >= 200 && saved.status < 300 }, `${saved.status} ${saved.text.slice(0, 200)} ${shown.join(' | ')}`)
        .toEqual({ refusedMessage: true, written: false });
      expect(Object.keys(heldRoles(await readUser(page, target.id)))).not.toContain(scoped.id);
    });
  });

  test(`TC-${CASES.fieldHiddenAndCleared.azureId}: should hide the Payer field and keep no payer when the role switches to a non-payer-scoped one`, async ({
    page,
    steps,
    suiteRole,
    userIn,
    userListPage: list,
  }) => {
    const scoped = await suiteRole({ hasAssignedPayers: true });
    const plain = await suiteRole({});
    const target = await userIn('Active');
    let drawer!: UserFormDrawer;

    await steps.critical('Navigate to the User Management module - the module landing page is displayed', async () => {
      await list.openTable();
      await list.expectToolbar();
    });

    await steps.critical(`Open Role Scope configuration with the payer-scoped role selected and "${SCOPE_PAYER}" assigned - the Payer field shows the assigned payer`, async () => {
      drawer = await openRoleScope(list, target);
      await drawer.addRole(scoped.name);
      await drawer.assignPayers(scoped.id, [SCOPE_PAYER]);
      expect(await drawer.isAssignPayersOffered(scoped.id)).toBe(true);
      expect(await drawer.getText()).toContain(SCOPE_PAYER);
    });

    await steps.step(`Change the role selection to a non-payer-scoped role ("${plain.name}") - the Payer field is hidden from the form`, async () => {
      await drawer.chooseRole(plain.name);
      expect({
        payerFieldOld: await drawer.isAssignPayersOffered(scoped.id),
        payerFieldNew: await drawer.isAssignPayersOffered(plain.id),
        payerStillShown: (await drawer.getText()).includes(SCOPE_PAYER),
      }).toEqual({ payerFieldOld: false, payerFieldNew: false, payerStillShown: false });
    });

    await steps.step('Click Save - the role is saved without any payer scope applied', async () => {
      const saved = await drawer.attemptSave();
      expect(saved.status, `${saved.text.slice(0, 200)} ${saved.messages.join(' | ')} ${saved.errors.join(' | ')}`).toBe(200);
      const held = heldRoles(await readUser(page, target.id));
      expect({ plainPayers: held[plain.id], scopedKept: scoped.id in held }).toEqual({ plainPayers: [], scopedKept: false });
    });
  });

  test(`TC-${CASES.removeLastPayer.azureId}: should refuse to save once the last payer of a payer-scoped role is removed`, async ({
    page,
    steps,
    suiteRole,
    userIn,
    userListPage: list,
  }) => {
    const scoped = await suiteRole({ hasAssignedPayers: true });
    const payerId = await payerIdByName(page, SCOPE_PAYER);
    const target = await userIn('Active', { roles: [{ roleId: scoped.id, payerIds: [payerId] }] });
    let drawer!: UserFormDrawer;

    await steps.critical('Navigate to the User Management module - the module landing page is displayed', async () => {
      await list.openTable();
      await list.expectToolbar();
    });

    await steps.critical(`Open Role Scope configuration for the payer-scoped role with one payer assigned - the Payer field shows "${SCOPE_PAYER}"`, async () => {
      drawer = await openRoleScope(list, target);
      expect(await drawer.isAssignPayersOffered(scoped.id), 'Assign Payers on the saved card').toBe(true);
      await drawer.openAssignPayers(scoped.id);
      expect((await pickerAll(drawer)).selected).toEqual([SCOPE_PAYER]);
    });

    await steps.step('Remove the assigned payer from the list - the assigned payers count becomes 0', async () => {
      await movePayersBack(page, [SCOPE_PAYER]);
      expect((await pickerAll(drawer)).selected).toEqual([]);
      await drawer.closePicker(true);
    });

    await steps.step('Click Save - a validation error is displayed and the role is not saved', async () => {
      const saved = await drawer.attemptSave();
      const shown = [...saved.errors, ...saved.messages, ...(await drawer.getDrawerMessages())];
      expect({ refusedMessage: shown.some((m) => PAYER_REQUIRED.test(m)), written: saved.status >= 200 && saved.status < 300 }, `${saved.status} ${saved.text.slice(0, 200)} ${shown.join(' | ')}`)
        .toEqual({ refusedMessage: true, written: false });
      expect(heldRoles(await readUser(page, target.id))[scoped.id], 'the saved payer must remain').toEqual([payerId]);
    });
  });

  test(`TC-${CASES.everyRoleChecklist.azureId}: should show, hide and require the Payer field for every role according to its scoping rule`, async ({
    page,
    steps,
    userIn,
    userListPage: list,
  }) => {
    test.setTimeout(15 * 60_000);
    const target = await userIn('Active');
    const ownRole = target.roles[0]?.roleId ?? '';
    let drawer!: UserFormDrawer;
    let roles: { id: string; name: string; hasAssignedPayers: boolean }[] = [];
    const scope = await payerNamesOf(page);

    await steps.critical('Navigate to the User Management module - the module landing page is displayed', async () => {
      await list.openTable();
      await list.expectToolbar();
    });

    await steps.critical('Open Role Scope configuration - the list of all roles is displayed', async () => {
      drawer = await openRoleScope(list, target);
      await drawer.addRoleCard();
      const options = await drawer.getRoleOptions();
      const active = (await listAssignableRoles(page)).filter((r) => r.isActive);
      const names = active.map((r) => r.name);
      expect({
        missing: active.filter((r) => r.id !== ownRole && !options.includes(r.name)).map((r) => r.name),
        notAssignable: options.filter((o) => !names.includes(o)),
      }, `Role options: ${options.join(' | ')}`).toEqual({ missing: [], notAssignable: [] });
      roles = active.filter((r) => r.id !== ownRole).slice(0, ROLE_WALK_LIMIT);
    });

    const outcomes: { role: string; scoped: boolean; shown: boolean; required: boolean; listed: string[] }[] = [];

    await steps.step('Select each role in turn and record whether the Payer field is shown, hidden, required, and what it lists - each role behaves per its scoping rule', async () => {
      for (const role of roles) {
        await drawer.chooseRole(role.name);
        const field = await drawer.readPayerField(role.id);
        const shown = (await drawer.isAssignPayersOffered(role.id)) && field.shown;
        const required = field.required;
        let listed: string[] = [];
        if (shown) {
          await drawer.openAssignPayers(role.id);
          const both = await pickerAll(drawer);
          listed = [...both.available, ...both.selected];
          await drawer.closePicker(false);
        }
        outcomes.push({ role: role.name, scoped: role.hasAssignedPayers, shown, required, listed });
      }
      const wrong = outcomes.filter((o) => o.shown !== o.scoped || o.required !== o.scoped).map((o) => `${o.role}: scoped ${o.scoped}, shown ${o.shown}, required ${o.required}`);
      expect(wrong, `${outcomes.length} roles walked`).toEqual([]);
    });

    await steps.step('Confirm no role shows an out-of-scope or deleted payer in its list - every list holds only valid, in-scope payers', async () => {
      const invalid = outcomes.flatMap((o) => o.listed.filter((n) => !scope.includes(n)).map((n) => `${o.role}: ${n}`));
      expect({ scopedRolesChecked: outcomes.filter((o) => o.shown).length > 0, invalid }).toEqual({ scopedRolesChecked: true, invalid: [] });
    });
  });
});
