/**
 * US 21294 "Delete Role" (role folder 14, 10 cases 22144-22153).
 *
 * How it works (reports/role/Role-Foundation-Notes.md): Delete on a row opens the shared dialog "Delete Role" /
 * "Do you want to delete <name>?" (No / Yes) -> DELETE Roles/DeleteRole -> toast "Role deleted / The role has
 * been removed and is no longer available."; predefined rows render Delete DISABLED, predefined cards have none.
 *
 * SAFETY: every role deleted (or refused) is the case's OWN suite role; suite users holding one are the case's
 * own (`suiteUsers.create`) and are deleted before the role at teardown. Predefined rows are only read and
 * given a real (force) click on the disabled control.
 *
 * Lead defaults applied here (the test case wins over the AC):
 * - TC role names ("Temp Reviewer", "Claims Reviewer", "Interim Reviewer") are examples: suite roles.
 * - TC "{{name}}" = the role's English name; the dialog title and message are asserted literally.
 * - 22146 the AC quotes no "role is in use" text: the delete is refused (non-2xx or no request), the role is
 *   still listed and readable, and SOME message is shown (its text goes into the failure message).
 * - 22145 "cannot be assigned to any user or invitation": not offered in Assign Roles & Payers (suite user)
 *   nor in Add Invitation (both closed unsaved).
 * - 22148 "a user without the Delete permission" = the role holder with ONLY a suite role holding
 *   Roles.GetRoles + Roles.GetRole (no Roles.DeleteRole); baseline: careconnect sees Delete on a suite row.
 * - 22151 "the role shows zero assigned users": the app shows no per-role user count, so the only holder (a
 *   suite user) is moved to a second suite role through Assign Roles & Payers and its record is read back.
 * - 22152 "100+ characters" -> exactly 100, the name box's limit (common.data ROLE_LIMITS.name).
 * - 22153 exploratory -> a fixed script on the case's own four roles (one shared token in their names): delete
 *   one after each of search / sort / advance filter / direction flip and compare screen, GetRoles and pager.
 */

/** Azure ids. */
export const CASES = {
  deleteUnassigned: { azureId: '22144' },
  deletedGone: { azureId: '22145' },
  assignedBlocked: { azureId: '22146' },
  predefinedDisabled: { azureId: '22147' },
  hiddenWithoutPermission: { azureId: '22148' },
  cancelKeeps: { azureId: '22149' },
  onlyNonPredefined: { azureId: '22150' },
  afterLastUserRemoved: { azureId: '22151' },
  longName: { azureId: '22152' },
  multipleDeletions: { azureId: '22153' },
} as const;

/** The TC's dialog and toast texts (em dash between title / summary and message / detail). */
export const DELETE_DIALOG_TITLE = 'Delete Role';
export const DELETE_DIALOG = (name: string): string => `Delete Role — Do you want to delete ${name}?`;
export const DELETED_TOAST = 'Role deleted — The role has been removed and is no longer available.';

/** 22146 test data: "assigned to 2 users". */
export const HOLDERS_FOR_BLOCKED_DELETE = 2;

/** 22148: the holder's rights - it may list and open roles but not delete them. */
export const VIEW_ONLY_RIGHTS = ['Roles.GetRoles', 'Roles.GetRole'] as const;

/** 22152: the long name's length (the English name box's maxlength). */
export const LONG_NAME_LENGTH = 100;

/** 22153: how many of its own roles the session deletes, and the list action before each deletion. */
export const MULTI_DELETE_COUNT = 4;
export const BETWEEN_DELETIONS = ['search', 'sort', 'filter', 'direction'] as const;
