import { test, expect } from '../../../fixtures';
import type { TestSteps } from '../../../fixtures/testStatus.fixture';
import type { RoleAdministrationPage } from '../../../pages/role/RoleAdministrationPage';
import { PREDEFINED_ROLES, PREDEFINED_ROLE_NAMES, ROLE_MESSAGES } from '../../../data/role/common.data';
import {
  API_WRITE_GATE,
  CASES,
  CUSTOM_RIGHTS,
  EXTRA_PRIVILEGE_FOR_ATTEMPT,
  SYSTEM_ADMIN_ROLE_PATTERN,
  SYSTEM_ROLE,
  UNHELD_PRIVILEGE,
} from '../../../data/role/preventChangesToPredefinedAndSystemRoles.data';
import { allRoles, readRole, rolePermissionKeys } from '../../../utils/role/roleApi';
import {
  adminRoleIdOf,
  allTableRows,
  attemptProtectedRoleUpdate,
  cardsForSearch,
  cardsPresentingDelete,
  closeFormAndStamp,
  controlStates,
  gated,
  openEditToPrivileges,
  permissionIdsOf,
  pokePrivileges,
  predefinedCards,
  predefinedRows,
  readAdminAccount,
  rightsOfOrNone,
  saidWrite,
  statesOutside,
} from '../../../utils/role/writerCHelpers';

/** Step 1 of every case: Role Administration opens as careconnect. */
async function openRoleManagement(steps: TestSteps, roleAdmin: RoleAdministrationPage): Promise<void> {
  await steps.critical('Navigate to the Role Management module - the Role Administration screen is displayed', async () => {
    const answer = await roleAdmin.open();
    expect(answer.status, 'GetRoles').toBe(200);
  });
}

const PO = PREDEFINED_ROLES.payerOfficer;
const OA = PREDEFINED_ROLES.organizationAdministrator;

/**
 * User story 21291: Prevent Changes to Predefined and System Roles - the lock itself (list, controls, Edit,
 * Privileges, the system role, API manipulation, the four default roles). Predefined / system roles are only
 * read, opened and closed; API writes are behind API_WRITE_GATE. See the data file for every reading.
 */
test.describe('US 21291 - Prevent Changes to Predefined and System Roles (lock)', () => {
  test.describe.configure({ timeout: 6 * 60_000 });

  test(`TC-${CASES.listShowsPredefinedNotSystem.azureId}: should list the three predefined roles and never the System Administrator role`, async ({ page, steps, roleAdmin }) => {
    await openRoleManagement(steps, roleAdmin);

    await steps.step('Review the full roles list - Organization Administrator, Payer Administrator, and Payer Officer are displayed, and System Administrator does not appear anywhere in the list', async () => {
      const table = await allTableRows(roleAdmin);
      const api = await allRoles(page);
      const shown = Object.fromEntries(PREDEFINED_ROLE_NAMES.map((n) => [n, table.rows.some((r) => r.name === n && r.predefined)]));
      const systemAdmin = [...new Set([...table.rows.map((r) => r.name), ...api.map((r) => r.name)])].filter((n) => SYSTEM_ADMIN_ROLE_PATTERN.test(n) || n === SYSTEM_ROLE.name);
      expect({ shown, systemAdmin }, `${table.rows.length} rows on ${table.totalPages} page(s): ${table.rows.map((r) => r.name).join(', ')}`)
        .toEqual({ shown: Object.fromEntries(PREDEFINED_ROLE_NAMES.map((n) => [n, true])), systemAdmin: [] });
    });
  });

  test(`TC-${CASES.deactivationNotAvailable.azureId}: should disable or withhold the activation control of every predefined role`, async ({ page, steps, roleAdmin }) => {
    await openRoleManagement(steps, roleAdmin);

    await steps.step('Locate a predefined role in the list and check the activation/deactivation control - the control is disabled or not offered for the predefined role', async () => {
      const rows = await predefinedRows(roleAdmin, page);
      const states = controlStates(rows, 'toggle-active');
      expect(statesOutside(states, ['disabled', 'absent']), 'predefined rows whose Activate / Inactivate is offered (or that are not listed)').toEqual([]);
    });
  });

  test(`TC-${CASES.deleteNotOffered.azureId}: should present no Delete action for a predefined role`, async ({ page, steps, roleAdmin }) => {
    await openRoleManagement(steps, roleAdmin);

    await steps.step('Locate a predefined role in the list and check the available row actions - no Delete action is present for the predefined role', async () => {
      const rows = await predefinedRows(roleAdmin, page);
      const cards = await predefinedCards(roleAdmin, page);
      const table = statesOutside(controlStates(rows, 'delete'), ['absent']).map((s) => `table ${s}`);
      const cardDeletes = cardsPresentingDelete(cards);
      expect([...table, ...cardDeletes], 'predefined roles that present a Delete action (lead decision 4: "no Delete action is present" = absent)').toEqual([]);
    });
  });

  test(`TC-${CASES.privilegesFixed.azureId}: should keep the privileges of a predefined role unchanged when its checkboxes are clicked`, async ({ page, steps, roleAdmin }) => {
    const before = { stamp: '', keys: [] as string[] };
    await openRoleManagement(steps, roleAdmin);

    await steps.critical('Open a predefined role (Payer Officer, Edit) and go to the Privileges step - privileges display as read-only', async () => {
      before.stamp = (await readRole(page, PO.id))?.concurrencyStamp ?? '';
      before.keys = (await rolePermissionKeys(page, PO.id)).sort();
      const opened = await openEditToPrivileges(roleAdmin, page, PO.id, PO.en);
      expect({ step: opened.step, everyRowDisabled: opened.rows > 0 && opened.disabledRows === opened.rows, note: opened.privilegesNote },
        `Privileges of Payer Officer: ${opened.disabledRows} of ${opened.rows} rows disabled`).toEqual({ step: 2, everyRowDisabled: true, note: true });
    });

    await steps.step('Attempt to check an unassigned privilege or uncheck an assigned one - the checkboxes remain unresponsive and the privilege set is unchanged', async () => {
      const pokes = await pokePrivileges(roleAdmin, page, PO.id, UNHELD_PRIVILEGE);
      const closed = await closeFormAndStamp(roleAdmin, page, PO.id);
      const after = (await rolePermissionKeys(page, PO.id)).sort();
      expect({
        clicked: pokes.length,
        changedOnScreen: pokes.filter((p) => p.before !== p.after).map((p) => `${p.key} ${p.before} -> ${p.after}`),
        stampUnchanged: closed.stamp === before.stamp,
        sameSet: after.join(',') === before.keys.join(','),
      }, `close guard "${closed.guard}"`).toEqual({ clicked: 2, changedOnScreen: [], stampUnchanged: true, sameSet: true });
    });
  });

  test(`TC-${CASES.systemRoleLocked.azureId}: should offer no rename, edit, deactivate or delete for the System Administrator role`, async ({ page, steps, roleAdmin }) => {
    await openRoleManagement(steps, roleAdmin);

    await steps.step('Attempt to locate any rename, edit, deactivate, or delete action associated with the System Administrator role through any available path - none of these actions are available for the System Administrator role', async () => {
      const admin = await readAdminAccount(page);
      const roleId = adminRoleIdOf(admin, SYSTEM_ROLE.name);
      const searched = await roleAdmin.search(SYSTEM_ROLE.name);
      const cards = await cardsForSearch(roleAdmin, SYSTEM_ROLE.name);
      const listed = await allRoles(page);
      expect({
        inSearch: searched.items.some((r) => r.name === SYSTEM_ROLE.name || r.id === roleId),
        inCards: cards.some((c) => c.name === SYSTEM_ROLE.name || c.id === roleId),
        inGetRoles: listed.some((r) => r.name === SYSTEM_ROLE.name || (roleId !== '' && r.id === roleId)),
      }, `the System Administrator role "${SYSTEM_ROLE.name}" (careconnect's, id ${roleId || 'unknown'}); search answered [${searched.items.map((r) => r.name).join(', ')}]`)
        .toEqual({ inSearch: false, inCards: false, inGetRoles: false });
      const out = await gated(steps, API_WRITE_GATE, () => attemptProtectedRoleUpdate(page, roleId, (r) => ({ name: `${r.name} renamed` })));
      expect({ refused: out === null || out.status >= 400, unchanged: out === null || out.unchangedAfter }, saidWrite(out, 'UpdateRole renaming the System Administrator role'))
        .toEqual({ refused: true, unchanged: true });
    });
  });

  test(`TC-${CASES.newRoleInsteadOfEdit.azureId}: should keep a predefined role locked and create a new role for a different permission set`, async ({ page, steps, roleAdmin, suiteRoles }) => {
    const before = { stamp: '' };
    const nameEn = suiteRoles.newName('custom set');
    const nameAr = suiteRoles.newArabicName();
    await openRoleManagement(steps, roleAdmin);

    await steps.step('Attempt to edit a predefined role (Organization Administrator) to add a new permission combination - editing is blocked as the role is locked', async () => {
      before.stamp = (await readRole(page, OA.id))?.concurrencyStamp ?? '';
      await roleAdmin.search(OA.en);
      const form = await roleAdmin.openEdit(OA.id);
      const disabled = await form.disabledFields();
      await expect(form.predefinedNote()).toHaveText(ROLE_MESSAGES.predefinedNote);
      const closed = await closeFormAndStamp(roleAdmin, page, OA.id);
      expect({ editable: Object.entries(disabled).filter(([, d]) => !d).map(([f]) => f), stampUnchanged: closed.stamp === before.stamp }, 'Edit of Organization Administrator')
        .toEqual({ editable: [], stampUnchanged: true });
    });

    await steps.step(`Use the Add Role action to create a new role with the desired permission combination (${CUSTOM_RIGHTS.join(' + ')}) - the new role is created successfully with the custom permissions`, async () => {
      await suiteRoles.watch();
      const form = await roleAdmin.openAdd();
      await form.fill({ nameEn, nameAr, descriptionEn: 'Custom permission set (22129)', allowedToAssignBy: [OA.en] });
      await form.nextToPrivileges();
      for (const key of CUSTOM_RIGHTS) await form.tree.tick(key);
      const out = await form.save();
      const id = await suiteRoles.adopt(nameEn).catch(() => '');
      expect({ status: out.status, closed: out.closed, rights: await rightsOfOrNone(page, id) }, `CreateRole answered ${out.status} "${out.apiMessage}", toast "${out.toast}"`)
        .toEqual({ status: 200, closed: true, rights: [...CUSTOM_RIGHTS].sort() });
    });
  });

  test(`TC-${CASES.apiManipulationRefused.azureId}: should refuse a direct API change to a predefined role`, async ({ page, steps, roleAdmin }) => {
    await openRoleManagement(steps, roleAdmin);

    await steps.step('Open a predefined role and attempt to bypass UI locks using direct API calls to submit a change to its name or privileges - the backend rejects the change and the predefined role remains unchanged', async () => {
      await roleAdmin.search(PO.en);
      const form = await roleAdmin.openEdit(PO.id);
      const disabled = await form.disabledFields();
      await roleAdmin.form.close('x');
      expect(Object.entries(disabled).filter(([, d]) => !d).map(([f]) => f), 'Payer Officer fields the Edit drawer leaves editable').toEqual([]);
      const out = await gated(steps, API_WRITE_GATE, async () => {
        const [extra] = await permissionIdsOf(page, [EXTRA_PRIVILEGE_FOR_ATTEMPT]);
        return attemptProtectedRoleUpdate(page, PO.id, (r) => ({ name: `${r.name} changed`, selectedPermissionIds: [...(r.selectedPermissionIds ?? []), extra] }));
      });
      expect({ refused: out === null || out.status >= 400, unchanged: out === null || out.unchangedAfter }, saidWrite(out, 'UpdateRole on Payer Officer (new name + one privilege)'))
        .toEqual({ refused: true, unchanged: true });
    });
  });

  test(`TC-${CASES.fourDefaultRoles.azureId}: should ship three listed predefined roles plus the unlisted System Administrator role`, async ({ page, steps, roleAdmin }) => {
    await openRoleManagement(steps, roleAdmin);

    await steps.step('Count the default roles available in the system, including the System Administrator role verified through its known behaviour - exactly three predefined roles are visible in the list, and the System Administrator system role exists as the fourth, non-listed role', async () => {
      const listed = await allRoles(page);
      const rows = await predefinedRows(roleAdmin, page);
      const admin = await readAdminAccount(page);
      expect({
        predefined: listed.filter((r) => r.isPredefined).map((r) => r.name).sort(),
        badges: Object.entries(rows).filter(([, r]) => !r?.predefined).map(([n]) => n),
        systemRoleHeld: admin.roles.includes(SYSTEM_ROLE.name),
        systemRoleListed: listed.filter((r) => r.name === SYSTEM_ROLE.name || SYSTEM_ADMIN_ROLE_PATTERN.test(r.name)).map((r) => r.name),
      }, `careconnect holds [${admin.roles.join(', ')}]; ${listed.length} roles listed`)
        .toEqual({ predefined: [...PREDEFINED_ROLE_NAMES].sort(), badges: [], systemRoleHeld: true, systemRoleListed: [] });
    });
  });
});
