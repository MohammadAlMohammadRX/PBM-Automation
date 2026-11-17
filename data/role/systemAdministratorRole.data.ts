/**
 * US 21281 "System Administrator Role" (role folder 02, 8 cases 21988-21995).
 *
 * WHO IS THE SYSTEM ADMINISTRATOR (brief "Accounts"): the suite's own account careconnect (GetCurrentUser,
 * role "Admin", 419 permissions) is the AC's default "System Administrator" user and its role "Admin" the
 * "System Administrator" role. Neither is listed: GetRoles never answers "Admin", and the account is not in
 * Users Administration (User foundation 2026-11-08). The TC's literal names are the AC's wording, not the
 * environment's (lead decision 2) - SYSTEM_ADMINISTRATOR below holds the mapping; the names the run saw are
 * reported in each case's failure messages / annotations.
 *
 * Lead defaults applied here:
 * - 21988 / 21989 / 21992 / 21995 start in "Role Management" but the user account lives in Users
 *   Administration: step 1 opens Role Administration (as written), the user steps run in Users Administration.
 * - 21988 step 3 "any available bulk-action path": Users Administration offers NO bulk action and the admin
 *   is not listed, so nothing can select it; the step asserts exactly that and that the account remains.
 *   A forced API DeleteUser / ToggleUserActivation(false) on the ONLY admin is NEVER sent (irreversible).
 * - 21989 step 3 "force the edit through any alternate action path" = an API UpdateUser carrying the
 *   admin's own record unchanged (a no-op) - gated by API_WRITE_GATE (BLOCKED while false).
 * - 21990 test data "Admin" / "Data Entry": "Admin" is the hidden super-admin role, so the administrative role
 *   is Organization Administrator and the non-administrative one a suite role (lead decision 2). Both users
 *   are made through Add User (the screen) and deleted at teardown.
 * - 21991 "freshly provisioned state" cannot be produced - the current environment is read. "Every
 *   permission" = every key of the permission catalogue (GetRolePermissions, module nodes included) is in
 *   the account's permissions (GetCurrentUserRolesAndPermissions).
 * - 21993 "System Administrator role never appears" (lead decision 5): any listed role matching
 *   SYSTEM_ADMIN_ROLE_PATTERN counts - the environment lists a colleague's "System Administration" (FAILS today).
 * - 21994 "any available path": list / cards / search (UI) and GetRoles (API) never offer the "Admin" role;
 *   the WRITE path (one UpdateRole renaming the Admin role, put back at once if accepted) is gated by
 *   API_WRITE_GATE. Deactivate / delete attempts on the Admin role are never sent (irreversible lock-out).
 * - 21995 Users Administration has no bulk inactivate / delete: step 2 asserts the bulk action exists (FAILS
 *   today - the finding); step 3 asserts the admin is unchanged and, with nothing to observe for the other two
 *   users, is BLOCKED unless step 2 already failed.
 */

/** Azure ids. */
export const CASES = {
  cannotDeleteUser: { azureId: '21988' },
  cannotEditUser: { azureId: '21989' },
  definesAdminsAndUsers: { azureId: '21990' },
  defaultUserAndRole: { azureId: '21991' },
  cannotInactivateUser: { azureId: '21992' },
  roleNeverListed: { azureId: '21993' },
  roleCannotBeChanged: { azureId: '21994' },
  excludedFromBulk: { azureId: '21995' },
} as const;

/**
 * The System Administrator of the cases = careconnect and its role (brief "Accounts"). `roleName` is the
 * environment's name of the super-admin role; set it to 'System Administrator' to assert the AC's literal name.
 */
export const SYSTEM_ADMINISTRATOR = {
  roleName: 'Admin',
  literalName: 'System Administrator',
} as const;

/** Lead decision 5: a listed role whose name matches this counts as the System Administrator role. */
export const SYSTEM_ADMIN_ROLE_PATTERN = /^System Administrat/i;

/** 21993 test data: the search term. */
export const SYSTEM_ADMIN_SEARCH = 'System Administrator';

/**
 * ONE gate for every API write attempt against the System Administrator account / role in this folder
 * (21989 step 3: a no-op UpdateUser on careconnect; 21994 step 2: a rename of the Admin role, put back at once
 * if accepted). While false those steps are BLOCKED. The user may switch it on.
 */
export const API_WRITE_GATE = {
  allowed: false,
  reason: 'API write attempts against the System Administrator account / role are switched off (data/role/systemAdministratorRole.data.ts API_WRITE_GATE) - a missing server guard would change the only super-admin',
} as const;

/** 21990: the administrative role given to User1 (TC "Admin" - the hidden super-admin role cannot be assigned). */
export const ADMINISTRATIVE_ROLE = 'Organization Administrator' as const;

/** 21995 step 3: why the other two users' update cannot be observed. */
export const NO_BULK_ACTION_BLOCK = 'Users Administration offers no bulk inactivate / delete action, so the other selected users cannot be updated in bulk (User foundation 2026-11-08: only Selected Export)';
