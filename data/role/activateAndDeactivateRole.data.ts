/**
 * US 21293 "Activate and Deactivate Role" (role folder 13, 12 cases 22132-22143).
 *
 * How it works (reports/role/Role-Foundation-Notes.md): "Inactivate" on an active row opens the Deactivate
 * drawer (`role-deactivate-drawer`, reason + details, Cancel / Deactivate); "Activate" on an inactive row opens
 * the shared dialog "Activate Role"; both POST Roles/SetActive. Predefined rows render the toggle DISABLED.
 *
 * SAFETY: every role deactivated / activated is the case's OWN suite role (`suiteRoles.create`). Predefined rows
 * are read and given a real (force) click on the disabled control - never a confirm.
 *
 * Lead defaults applied here (the test case wins over the AC):
 * - TC role names ("Claims Reviewer") are examples: a suite role "QA Automation Role <stamp> ..." (decision 2).
 * - The TC texts "Deactivate ? Users holding..." and "Are you sure you want to activate ?" are the AC's templates
 *   with the role name left out: asserted with the role's English name filled in (common.data ROLE_MESSAGES).
 * - Toasts asserted literally as "summary — detail" with whitespace / dashes normalised (decision 3).
 * - 22133 "the Details text field becomes visible and mandatory": visible after Other, and Deactivate with it
 *   empty is refused with the "Other" message (no request) before the details are typed.
 * - 22136 "stops accepting further input or flags a length violation": either holds; the drawer is then
 *   cancelled - the role must still be Active.
 * - 22137 the AC quotes no "Reason is mandatory" text: an error under Reason + no request + still Active.
 * - "available / not available for assignment" = the role is / is not offered in the Role list of
 *   Users Administration > Assign Roles & Payers (on a suite user) and of Add Invitation (both closed unsaved).
 *   22139 expects the INACTIVE role absent from both - the invitation drawer lists inactive roles (User
 *   foundation 2026-11-08), so that half FAILS today. The AC also says "An inactive role is offered when roles
 *   are assigned to users or invitations"; the test case wins (decision 1).
 * - 22141 test data "System Administrator" is the hidden system role, not a predefined one: the three
 *   predefined roles are inspected (decision 2).
 * - 22142 "a user without the Activate/Deactivate permission" = the role holder with ONLY a suite role holding
 *   Roles.GetRoles + Roles.GetRole (no Roles.SetActive); baseline: careconnect sees the toggle on a suite row.
 * - 22143 reads every non-predefined row of every page (other people's roles read only).
 */

/** Azure ids. */
export const CASES = {
  deactivateWithReason: { azureId: '22132' },
  deactivateOtherWithDetails: { azureId: '22133' },
  otherWithoutDetailsBlocked: { azureId: '22134' },
  details500Accepted: { azureId: '22135' },
  details501Rejected: { azureId: '22136' },
  noReasonBlocked: { azureId: '22137' },
  reactivate: { azureId: '22138' },
  inactiveNotAssignable: { azureId: '22139' },
  activeAssignable: { azureId: '22140' },
  predefinedCannotDeactivate: { azureId: '22141' },
  hiddenWithoutPermission: { azureId: '22142' },
  controlMatchesStatus: { azureId: '22143' },
} as const;

/** TC texts (the AC's wording; em dash between summary and detail). */
export const DEACTIVATED_TOAST = 'Role deactivated — The role is now inactive and can no longer be assigned.';
export const ACTIVATED_TOAST = 'Role activated — The role is now active and can be assigned to users.';

/** 22132 test data. */
export const REASON_REORGANISATION = 'Reorganisation';
/** 22133 / 22134 / 22135 / 22136 test data. */
export const REASON_OTHER = 'Other';
export const OTHER_DETAILS = 'Role consolidated into new structure';
export const DETAILS_MAX = 500;

/** 22142: the holder's rights - it may list and open roles but not activate / deactivate them. */
export const VIEW_ONLY_RIGHTS = ['Roles.GetRoles', 'Roles.GetRole'] as const;
