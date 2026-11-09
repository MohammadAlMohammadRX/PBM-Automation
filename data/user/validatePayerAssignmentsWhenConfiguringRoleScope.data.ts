/**
 * US 14293 "Validate Payer Assignments When Configuring Role Scope" (user folder 01), 11 cases.
 *
 * How the cases map onto the live screens (2026-11-08, User-Foundation-Notes.md):
 *  - "Role Scope configuration" = the user drawer's step 3 Roles and Privileges
 *    (decision item 7): a role card's Role select; a PAYER-SCOPED role
 *    ("Has Assigned Payers?") adds the Payers area with "Assign Payers" (the
 *    two-list picker: Available / Selected Payers) - that is the "Payer field";
 *    a role that is not payer-scoped has no Payers area. "Save" = the drawer's
 *    Save (UpdateUser). The drawer is reached through the row action Assign
 *    Roles & Payers of a SUITE user (it opens on step 3), so nothing shared is
 *    edited. The roles chosen are SUITE roles (one payer-scoped, one not)
 *    built per case and deleted at teardown.
 *  - "Payer A" (in scope) = the suite scope payer "Al sharq" (the Policy suite's
 *    payer, used by every payer-scoped suite session); "Payer B" (out of scope)
 *    = another existing payer, read-only ("Al Dawaa" when present).
 *  - The SYSTEM administrator holds every payer, so "outside the
 *    administrator's scope" needs a payer-scoped administrator (decisions 7 / 8):
 *    a suite session whose role is scoped to "Al sharq" with Users.UpdateUser
 *    (20473, 20480). Its GetAssignableRoles answered [] in the full run because
 *    the suite set `assignableRoleIds` on the SESSION's role; that list means
 *    "roles that may assign me", so since 2026-11-08 `suiteSession` names the
 *    session's role on each target role instead (`letRoleAssign`). 20480 stays
 *    BLOCKED with the evidence only if the scoped session is still offered no role.
 *  - 20472 (deleted payer): decision 6 - the payer suite's provisioning has NO
 *    payer delete (ApiEndpoints / utils: CreatePayer, UpdatePayer,
 *    InactivatePayer, SubmitPayerForApproval, RevertPayer - no DeletePayer), so
 *    a payer that existed and was deleted cannot be produced: steps 1-3 run
 *    (the list holds only payers that exist), step 4 is data-driven BLOCKED.
 *    In 20479 / 20480 the "deleted payer" part is checked the same way: every
 *    payer listed exists in GetPayersDropdown.
 *  - "displayed, empty" = the card offers Assign Payers and shows its "Payers"
 *    field with no payer chip (no wording is required - the case names none).
 *  - "required" (20475 / 20479, the field's state before any Save) = the Payers
 *    label carries the required marker (the red asterisk,
 *    `user-dialog__label--required`); "the save is blocked" = Save shows
 *    "Select at least one payer for this role." and sends nothing.
 */
export const CASES = {
  assignAllowedPayer: { azureId: '20470' },
  noPayerBlocked: { azureId: '20471' },
  deletedPayerHidden: { azureId: '20472' },
  outOfScopeHidden: { azureId: '20473' },
  exactlyOnePayer: { azureId: '20474' },
  fieldFollowsScoping: { azureId: '20475' },
  fieldReappears: { azureId: '20476' },
  fieldHiddenAndCleared: { azureId: '20477' },
  removeLastPayer: { azureId: '20478' },
  everyRoleChecklist: { azureId: '20479' },
  rapidSwitching: { azureId: '20480' },
} as const;

/** "Payer A" - in the suite administrator's scope (the payer every payer-scoped suite session uses). */
export const SCOPE_PAYER = 'Al sharq';

/** The required-payer message on a payer-scoped card / at Save. */
export const PAYER_REQUIRED = /Select at least one payer for this role\./;

/** User saved through the drawer (UpdateUser). */
export const USER_SAVED = /User updated|saved successfully/i;

/** The rights of the payer-scoped suite ADMINISTRATOR (20473, 20480): read users, edit them (Assign Roles & Payers), see roles and payers. */
export const SCOPED_ADMIN_RIGHTS = [
  'Users.GetUsers',
  'Users.GetUser',
  'Users.UpdateUser',
  'Users.CheckDocumentIdExists',
  'Roles.GetRoles',
  'Payers.GetPayersDropdown',
  'Lookups.GetLookups',
] as const;

/** 20472: decision 6 - no payer delete exists anywhere in the payer suite's provisioning. */
export const DELETED_PAYER_BLOCKED =
  'a payer that existed and was DELETED: the Payers API offers no delete (CreatePayer / UpdatePayer / InactivatePayer / SubmitPayerForApproval / RevertPayer only - '
  + 'no DeletePayer in constants/ApiEndpoints.ts or the payer suite\'s provisioning), so the suite cannot produce a deleted payer to search for (decision 6)';

/** 20480: the partial / full names typed into the picker search (the scoped administrator holds only SCOPE_PAYER). */
export const PARTIAL_PAYER_TERM = 'Al ';

/** 20479: how many roles at most are walked (every active assignable role on 2026-11-08 is far fewer). */
export const ROLE_WALK_LIMIT = 60;
