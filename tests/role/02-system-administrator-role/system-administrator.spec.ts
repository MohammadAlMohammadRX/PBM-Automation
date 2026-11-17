import type { Page } from '@playwright/test';
import { test, expect } from '../../../fixtures';
import type { TestSteps } from '../../../fixtures/testStatus.fixture';
import type { RoleAdministrationPage } from '../../../pages/role/RoleAdministrationPage';
import {
  ADMINISTRATIVE_ROLE,
  API_WRITE_GATE,
  CASES,
  NO_BULK_ACTION_BLOCK,
  SYSTEM_ADMINISTRATOR,
  SYSTEM_ADMIN_ROLE_PATTERN,
  SYSTEM_ADMIN_SEARCH,
} from '../../../data/role/systemAdministratorRole.data';
import { allRoles, readPermissionCatalogue } from '../../../utils/role/roleApi';
import {
  accountActive,
  adminInUsersAdministration,
  adminRoleIdOf,
  allTableRows,
  attemptNoopAdminUserUpdate,
  attemptProtectedRoleUpdate,
  blockUnlessAStepFailed,
  bulkActionIds,
  cardsForSearch,
  createUserThroughAddUser,
  gated,
  readAdminAccount,
  saidCreate,
  saidWrite,
  type AdminAccount,
} from '../../../utils/role/writerCHelpers';

/** Step 1 of every case: Role Administration opens as careconnect (and the admin account is read, read only). */
async function openRoleManagement(steps: TestSteps, roleAdmin: RoleAdministrationPage, page: Page, holder: { admin: AdminAccount | null }): Promise<void> {
  await steps.critical('Navigate to the Role Management module - the Role Management module loads', async () => {
    const answer = await roleAdmin.open();
    expect(answer.status, 'GetRoles').toBe(200);
    holder.admin = await readAdminAccount(page);
    expect(holder.admin.id, 'GetCurrentUser of the suite account (the System Administrator)').not.toBe('');
  });
}

/**
 * User story 21281: System Administrator Role. The System Administrator = careconnect (role "Admin") - read
 * only; the user steps run in Users Administration. See the data file for every reading and lead default.
 */
test.describe('US 21281 - System Administrator Role', () => {
  test.describe.configure({ timeout: 8 * 60_000 });

  test(`TC-${CASES.cannotDeleteUser.azureId}: should offer no Delete for the System Administrator user and keep it when no bulk path can reach it`, async ({ page, steps, roleAdmin }) => {
    const ctx: { admin: AdminAccount | null } = { admin: null };
    await openRoleManagement(steps, roleAdmin, page, ctx);

    await steps.step('Locate the "System Administrator" user and attempt to delete it - the Delete action is unavailable or disabled for this user', async () => {
      const admin = ctx.admin as AdminAccount;
      const seen = await adminInUsersAdministration(page, admin);
      expect(seen.actions.delete, `Delete on the System Administrator account ${admin.email} (roles ${admin.roles.join(', ')}): listed by GetUsers ${seen.apiListed}, found by its e-mail ${seen.searchListed}, row shown ${seen.rowShown}`).not.toBe('available');
    });

    await steps.step('Attempt the deletion through any available bulk-action path - the system blocks the action and the System Administrator user remains in the system', async () => {
      const admin = ctx.admin as AdminAccount;
      const bulk = await bulkActionIds(page);
      const seen = await adminInUsersAdministration(page, admin);
      const after = await readAdminAccount(page);
      expect({ selectable: seen.apiListed || seen.rowShown, remains: accountActive(after) },
        `bulk-action controls in Users Administration [${bulk.join(', ') || 'none'}]; the admin listed by GetUsers ${seen.apiListed}, row shown ${seen.rowShown}; GetCurrentUser ${after.sessionStatus}, isActive ${after.isActive}`)
        .toEqual({ selectable: false, remains: true });
    });
  });

  test(`TC-${CASES.cannotEditUser.azureId}: should offer no Edit for the System Administrator user and refuse a forced edit`, async ({ page, steps, roleAdmin }) => {
    const ctx: { admin: AdminAccount | null } = { admin: null };
    await openRoleManagement(steps, roleAdmin, page, ctx);

    await steps.step('Locate the "System Administrator" user and attempt to open it for editing - the Edit action is unavailable or disabled for this user', async () => {
      const admin = ctx.admin as AdminAccount;
      const seen = await adminInUsersAdministration(page, admin);
      expect({ edit: seen.actions.edit === 'available', assign: seen.actions.assign === 'available' },
        `Edit / Assign Roles & Payers on ${admin.email}: listed by GetUsers ${seen.apiListed}, found by its e-mail ${seen.searchListed}, row shown ${seen.rowShown}`)
        .toEqual({ edit: false, assign: false });
    });

    await steps.step('Attempt to force the edit through any alternate action path (API UpdateUser) - the system rejects the change and the user record remains unmodified', async () => {
      const admin = ctx.admin as AdminAccount;
      const out = await gated(steps, API_WRITE_GATE, () => attemptNoopAdminUserUpdate(page, admin));
      expect({ refused: out === null || out.status >= 400, unchanged: out === null || out.unchanged },
        saidWrite(out, 'UpdateUser on the System Administrator account')).toEqual({ refused: true, unchanged: true });
    });
  });

  test(`TC-${CASES.definesAdminsAndUsers.azureId}: should let the System Administrator create an administrator and a non-administrative user`, async ({ page, steps, roleAdmin, suiteRoles, suiteUsers }) => {
    const ctx: { admin: AdminAccount | null } = { admin: null };
    const dataEntry = await suiteRoles.create({ label: 'data entry' });
    await openRoleManagement(steps, roleAdmin, page, ctx);

    await steps.step(`Create a new user and assign an administrative role (${ADMINISTRATIVE_ROLE}) - the new user is saved with the assigned role`, async () => {
      const made = await createUserThroughAddUser(page, ADMINISTRATIVE_ROLE, (email) => suiteUsers.adopt(email));
      expect({ saved: made.userId !== '', roles: Object.keys(made.roles) }, saidCreate(made)).toEqual({ saved: true, roles: [ADMINISTRATIVE_ROLE] });
    });

    await steps.step(`Create another new user with a non-administrative role (the suite role "${dataEntry.name}") - the second user is saved with its assigned role`, async () => {
      const made = await createUserThroughAddUser(page, dataEntry.name, (email) => suiteUsers.adopt(email));
      expect({ saved: made.userId !== '', roles: Object.keys(made.roles) }, saidCreate(made)).toEqual({ saved: true, roles: [dataEntry.name] });
    });
  });

  test(`TC-${CASES.defaultUserAndRole.azureId}: should have the default System Administrator user holding the unlisted System Administrator role with every permission`, async ({ page, steps, roleAdmin }) => {
    const ctx: { admin: AdminAccount | null } = { admin: null };
    await openRoleManagement(steps, roleAdmin, page, ctx);

    await steps.step(`Review the default user accounts and roles configured in the system - a user "System Administrator" exists assigned the role "System Administrator" (here: careconnect, role "${SYSTEM_ADMINISTRATOR.roleName}")`, async () => {
      const admin = ctx.admin as AdminAccount;
      const listed = (await allRoles(page)).map((r) => r.name);
      expect({ roles: admin.roles, active: accountActive(admin), roleListed: listed.includes(SYSTEM_ADMINISTRATOR.roleName) },
        `the System Administrator account "${admin.names.join(' / ')}" holds [${admin.roles.join(', ')}]; listed roles: ${listed.join(', ')}`)
        .toEqual({ roles: [SYSTEM_ADMINISTRATOR.roleName], active: true, roleListed: false });
    });

    await steps.step('Review the permissions granted to the System Administrator role - every permission in the system is enabled for this role', async () => {
      const admin = ctx.admin as AdminAccount;
      const catalogue = await readPermissionCatalogue(page);
      const missing = [...catalogue.byKey.keys()].filter((key) => !admin.permissions.includes(key));
      expect(missing, `${missing.length} of ${catalogue.byKey.size} catalogue permissions are not held by "${admin.roles.join(', ')}" (holds ${admin.permissions.length}); first missing: ${missing.slice(0, 10).join(', ')}`).toEqual([]);
    });
  });

  test(`TC-${CASES.cannotInactivateUser.azureId}: should offer no status change for the System Administrator user and keep it Active`, async ({ page, steps, roleAdmin }) => {
    const ctx: { admin: AdminAccount | null } = { admin: null };
    await openRoleManagement(steps, roleAdmin, page, ctx);

    await steps.step('Locate the "System Administrator" user and attempt to change its status to Inactive - the status-change control is unavailable or the action is rejected', async () => {
      const admin = ctx.admin as AdminAccount;
      const seen = await adminInUsersAdministration(page, admin);
      expect(seen.actions.toggleActivation, `Inactivate on ${admin.email}: listed by GetUsers ${seen.apiListed}, found by its e-mail ${seen.searchListed}, row shown ${seen.rowShown}`).not.toBe('available');
    });

    await steps.step('Verify the user\'s current status - the System Administrator user remains Active', async () => {
      const after = await readAdminAccount(page);
      expect(accountActive(after), `GetCurrentUser ${after.sessionStatus}, GetUser isActive ${after.isActive}`).toBe(true);
    });
  });

  test(`TC-${CASES.roleNeverListed.azureId}: should never show the System Administrator role in the table, the cards or a search`, async ({ page, steps, roleAdmin }) => {
    const ctx: { admin: AdminAccount | null } = { admin: null };
    await openRoleManagement(steps, roleAdmin, page, ctx);

    await steps.step('Review every role entry shown in the list and in card view - the "System Administrator" role does not appear anywhere in either view', async () => {
      const table = await allTableRows(roleAdmin);
      const cards = await cardsForSearch(roleAdmin, 'System Administrat');
      const api = (await allRoles(page)).map((r) => r.name);
      const offending = {
        table: table.rows.map((r) => r.name).filter((n) => SYSTEM_ADMIN_ROLE_PATTERN.test(n) || n === SYSTEM_ADMINISTRATOR.roleName),
        cards: cards.map((c) => c.name).filter((n) => SYSTEM_ADMIN_ROLE_PATTERN.test(n) || n === SYSTEM_ADMINISTRATOR.roleName),
        api: api.filter((n) => SYSTEM_ADMIN_ROLE_PATTERN.test(n) || n === SYSTEM_ADMINISTRATOR.roleName),
      };
      // One flat list (view: name) - an object diff is unreadable once the failure narrator flattens it.
      const shown = [...offending.table.map((n) => `table: ${n}`), ...offending.cards.map((n) => `cards: ${n}`), ...offending.api.map((n) => `GetRoles: ${n}`)];
      expect(shown, `System Administrator roles shown (table ${table.rows.length} rows on ${table.totalPages} page(s), GetRoles ${api.length} roles)`).toEqual([]);
    });

    await steps.step(`Search for "${SYSTEM_ADMIN_SEARCH}" in the roles search field - no matching role is returned`, async () => {
      const result = await roleAdmin.search(SYSTEM_ADMIN_SEARCH);
      expect(result.items.map((r) => r.name), `GetRoles answered ${result.totalRows} row(s) for "${SYSTEM_ADMIN_SEARCH}"`).toEqual([]);
      await expect(roleAdmin.emptyText()).toBeVisible();
    });
  });

  test(`TC-${CASES.roleCannotBeChanged.azureId}: should offer no path to edit the System Administrator role and refuse a forced change`, async ({ page, steps, roleAdmin }) => {
    const ctx: { admin: AdminAccount | null } = { admin: null };
    await openRoleManagement(steps, roleAdmin, page, ctx);

    await steps.step(`Attempt to access the System Administrator role's edit or permission configuration through any available path (list, cards, search, API) - the system denies access or shows no editable configuration`, async () => {
      const admin = ctx.admin as AdminAccount;
      const roleId = adminRoleIdOf(admin, SYSTEM_ADMINISTRATOR.roleName);
      const searched = await roleAdmin.search(SYSTEM_ADMINISTRATOR.roleName);
      const cards = await cardsForSearch(roleAdmin, SYSTEM_ADMINISTRATOR.roleName);
      const listedIds = (await allRoles(page)).map((r) => r.id);
      expect({
        inSearch: searched.items.some((r) => r.name === SYSTEM_ADMINISTRATOR.roleName || r.id === roleId),
        inCards: cards.some((c) => c.name === SYSTEM_ADMINISTRATOR.roleName || c.id === roleId),
        inGetRoles: roleId !== '' && listedIds.includes(roleId),
      }, `the "${SYSTEM_ADMINISTRATOR.roleName}" role (id ${roleId || 'unknown'}) - search answered [${searched.items.map((r) => r.name).join(', ')}]`).toEqual({ inSearch: false, inCards: false, inGetRoles: false });
      const out = await gated(steps, API_WRITE_GATE, () => attemptProtectedRoleUpdate(page, roleId, (r) => ({ name: `${r.name} changed` })));
      expect({ refused: out === null || out.status >= 400, unchanged: out === null || out.unchangedAfter },
        saidWrite(out, 'UpdateRole on the System Administrator role')).toEqual({ refused: true, unchanged: true });
    });
  });

  test(`TC-${CASES.excludedFromBulk.azureId}: should skip the System Administrator user in a bulk inactivate or delete of all users`, async ({ page, steps, roleAdmin, suiteRoles, suiteUsers }) => {
    const ctx: { admin: AdminAccount | null } = { admin: null };
    const role = await suiteRoles.create({ label: 'bulk' });
    const others = [await suiteUsers.create({ role }), await suiteUsers.create({ role })];
    await openRoleManagement(steps, roleAdmin, page, ctx);

    await steps.step('Select all users in the user list, including the System Administrator, and apply a bulk inactivate or delete action - the system applies the action to the selected users', async () => {
      const admin = ctx.admin as AdminAccount;
      const bulk = await bulkActionIds(page);
      const seen = await adminInUsersAdministration(page, admin);
      expect({ bulkActionOffered: bulk.length > 0 },
        `Users Administration offers no bulk inactivate / delete (no control id containing "bulk"; ${seen.totalUsers} users, the admin listed ${seen.apiListed}); the two suite users ${others.map((u) => u.displayNameEn).join(', ')} cannot be updated together`)
        .toEqual({ bulkActionOffered: true });
    });

    await steps.step('Review the result - the System Administrator user is skipped and remains unchanged while the other selected users are updated', async () => {
      const after = await readAdminAccount(page);
      expect(accountActive(after), `GetCurrentUser ${after.sessionStatus}, GetUser isActive ${after.isActive}`).toBe(true);
      blockUnlessAStepFailed(steps, NO_BULK_ACTION_BLOCK);
    });
  });
});
