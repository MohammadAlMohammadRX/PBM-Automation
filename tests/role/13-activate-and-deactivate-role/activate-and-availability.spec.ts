import { test, expect } from '../../../fixtures';
import type { TestSteps } from '../../../fixtures/testStatus.fixture';
import type { RoleAdministrationPage } from '../../../pages/role/RoleAdministrationPage';
import { ROLE_MESSAGES, ROLE_STATUS, ROLE_TOGGLE_LABEL } from '../../../data/role/common.data';
import { CASES, VIEW_ONLY_RIGHTS } from '../../../data/role/activateAndDeactivateRole.data';
import {
  actionOf,
  allTableRows,
  pokePredefined,
  predefinedRows,
  roleOptionsInAssign,
  roleOptionsInInvitation,
  rowsShowing,
  toggleMismatches,
} from '../../../utils/role/writerCHelpers';

/** Step 1: Role Administration (careconnect) showing the case's own suite role with its status. */
async function openRegisterWith(steps: TestSteps, roleAdmin: RoleAdministrationPage, role: { id: string; name: string }, status: string): Promise<void> {
  await steps.critical(`Navigate to the Role Management module - the Role Register list is displayed with the role shown as ${status}`, async () => {
    await roleAdmin.open();
    const found = await roleAdmin.search(role.name);
    expect(found.items.map((r) => r.name), 'the case\'s suite role in the list').toEqual([role.name]);
    await expect(roleAdmin.statusBadge(role.id)).toHaveText(status);
  });
}

/**
 * User story 21293: Activate and Deactivate Role - activation, assignability, the predefined lock and who sees
 * the control. Every role toggled is the case's own suite role; predefined rows only receive real (force) clicks
 * on their disabled control, never a confirm. See the data file for the readings.
 */
test.describe('US 21293 - Activate and Deactivate Role (activate and availability)', () => {
  test.describe.configure({ timeout: 8 * 60_000 });

  test(`TC-${CASES.reactivate.azureId}: should reactivate an inactive role after confirming and offer it for assignment again`, async ({ page, steps, roleAdmin, suiteRoles, suiteUsers }) => {
    const role = await suiteRoles.create({ label: 'reactivate', isActive: false });
    const host = await suiteUsers.create({ role: await suiteRoles.create({ label: 'assign host' }) });
    await openRegisterWith(steps, roleAdmin, role, ROLE_STATUS.inactive);

    await steps.critical('Select Activate on the inactive role - a confirmation dialog "Are you sure you want to activate <name>?" is displayed', async () => {
      const dialog = await roleAdmin.openActivate(role.id);
      const shown = await dialog.read();
      expect({ title: shown.title, message: shown.message }).toEqual({ title: ROLE_MESSAGES.activateTitle, message: ROLE_MESSAGES.activateMessage(role.name) });
    });

    await steps.step('Confirm the activation - the role status changes to Active and becomes available again for assignment to users and invitations', async () => {
      const out = await roleAdmin.dialog.confirmActivate();
      expect(out.status, `SetActive answered ${out.status} "${out.apiMessage}", toast "${out.toast}"`).toBe(200);
      await expect(roleAdmin.statusBadge(role.id)).toHaveText(ROLE_STATUS.active);
      expect({ users: (await roleOptionsInAssign(page, host)).includes(role.name), invitations: (await roleOptionsInInvitation(page)).includes(role.name) }, 'the reactivated role offered in the Role lists')
        .toEqual({ users: true, invitations: true });
    });
  });

  test(`TC-${CASES.inactiveNotAssignable.azureId}: should not offer an inactive role for users or invitations`, async ({ page, steps, roleAdmin, suiteRoles, suiteUsers }) => {
    const role = await suiteRoles.create({ label: 'inactive', isActive: false });
    const host = await suiteUsers.create({ role: await suiteRoles.create({ label: 'assign host' }) });
    await openRegisterWith(steps, roleAdmin, role, ROLE_STATUS.inactive);

    await steps.step('Open the Users module and attempt to assign the inactive role to a user - the inactive role is not offered in the selectable role list', async () => {
      const options = await roleOptionsInAssign(page, host);
      expect(options.filter((o) => o === role.name), `Assign Roles & Payers offers the INACTIVE role (${options.length} roles offered)`).toEqual([]);
    });

    await steps.step('Open an invitation form and attempt to add the inactive role - the inactive role is not offered in the selectable role list', async () => {
      const options = await roleOptionsInInvitation(page);
      expect(options.filter((o) => o === role.name), `Add Invitation offers the INACTIVE role (${options.length} roles offered)`).toEqual([]);
    });
  });

  test(`TC-${CASES.activeAssignable.azureId}: should offer an active role for users and invitations`, async ({ page, steps, roleAdmin, suiteRoles, suiteUsers }) => {
    const role = await suiteRoles.create({ label: 'active' });
    const host = await suiteUsers.create({ role: await suiteRoles.create({ label: 'assign host' }) });
    await openRegisterWith(steps, roleAdmin, role, ROLE_STATUS.active);

    await steps.step('Open the Users module and attempt to assign the active role to a user - the role appears in the selectable list', async () => {
      expect(await roleOptionsInAssign(page, host), 'the Role list of Assign Roles & Payers').toContain(role.name);
    });

    await steps.step('Open an invitation form and attempt to add the active role - the role appears in the selectable list', async () => {
      expect(await roleOptionsInInvitation(page), 'the Role list of Add Invitation').toContain(role.name);
    });
  });

  test(`TC-${CASES.predefinedCannotDeactivate.azureId}: should disable the Activate/Deactivate action of every predefined role`, async ({ page, steps, roleAdmin }) => {
    await steps.critical('Navigate to the Role Management module - the Role Register list is displayed, with the predefined roles shown', async () => {
      await roleAdmin.open();
      const rows = await predefinedRows(roleAdmin, page);
      expect(Object.entries(rows).filter(([, r]) => !r?.predefined).map(([n]) => n), 'predefined roles not shown with the badge').toEqual([]);
    });

    await steps.step('Locate the predefined role and inspect the Deactivate action - the Activate/Deactivate action is disabled for the predefined role and cannot be triggered', async () => {
      const poked = await pokePredefined(roleAdmin, page, 'toggle-active');
      expect(Object.entries(poked).filter(([, p]) => !p.present || p.enabled || p.opened).map(([n, p]) => `${n}: present ${p.present}, enabled ${p.enabled}, opened ${p.opened}`), 'predefined toggles that are not a disabled, inert control')
        .toEqual([]);
    });
  });

  test(`TC-${CASES.hiddenWithoutPermission.azureId}: should hide Activate/Deactivate from a user without the permission`, async ({ steps, roleAdmin, roleHolder, suiteRoles }) => {
    const target = await suiteRoles.create({ label: 'toggle target' });
    await roleHolder.becomeSuiteRole({ label: 'no set active', rights: [...VIEW_ONLY_RIGHTS] });

    await steps.critical('Navigate to the Role Management module (as the user without the Activate/Deactivate permission) - the Role Register list is displayed', async () => {
      const answer = await roleHolder.roles.open();
      expect(answer.status, 'GetRoles as the holder').toBe(200);
    });

    await steps.step('Inspect each non-predefined role row for the Activate/Deactivate control - the action is not shown to the user for any role', async () => {
      await roleAdmin.open();
      await roleAdmin.search(target.name);
      const baseline = actionOf({ actions: await roleAdmin.rowActions(target.id) }, 'toggle-active');
      const holderRows = await allTableRows(roleHolder.roles);
      expect({ baselineOffered: baseline.present && baseline.enabled, shownToHolder: rowsShowing(holderRows.rows, 'toggle-active') },
        `the holder saw ${holderRows.rows.length} rows; careconnect's toggle on "${target.name}" reads "${baseline.label}"`).toEqual({ baselineOffered: true, shownToHolder: [] });
    });
  });

  test(`TC-${CASES.controlMatchesStatus.azureId}: should offer every non-predefined role the Activate or Deactivate control matching its status`, async ({ steps, roleAdmin, suiteRoles }) => {
    const active = await suiteRoles.create({ label: 'mixed active' });
    const inactive = await suiteRoles.create({ label: 'mixed inactive', isActive: false });

    await steps.critical('Navigate to the Role Management module - the Role Register list is displayed with all non-predefined roles', async () => {
      const answer = await roleAdmin.open();
      expect(answer.items.map((r) => r.id), 'the two suite roles (newest first)').toEqual(expect.arrayContaining([active.id, inactive.id]));
    });

    await steps.step('Review each non-predefined role row - the control shown matches the role\'s current status (Active -> Deactivate, Inactive -> Activate)', async () => {
      const table = await allTableRows(roleAdmin);
      const own = table.rows.filter((r) => r.id === active.id || r.id === inactive.id).map((r) => `${r.status}:${actionOf(r, 'toggle-active').label}`).sort();
      expect({ mismatches: toggleMismatches(table.rows), own }, `${table.rows.filter((r) => !r.predefined).length} non-predefined rows on ${table.totalPages} page(s)`)
        .toEqual({ mismatches: [], own: [`Active:${ROLE_TOGGLE_LABEL.inactivate}`, `Inactive:${ROLE_TOGGLE_LABEL.activate}`] });
    });
  });
});
