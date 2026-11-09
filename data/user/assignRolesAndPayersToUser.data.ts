/**
 * US 20410 "Assign Roles and Payers to User" (user folder 04).
 *
 * How it works in this build (User-Foundation-Notes.md, "Add / Edit / Assign
 * drawer"): the row action "Assign Roles & Payers" (`-assign`, gated by
 * Users.UpdateUser - there is no separate assign right) opens the user drawer;
 * step 3 "Roles and Privileges": "Add New User Roles" adds a card (Role select);
 * a payer-scoped role ("Has Assigned Payers?") adds "Assign Payers" -> the
 * two-list picker (Available / Selected Payers, Cancel / Save); Save ->
 * PUT UpdateUser. Save with no role -> "Add at least one role."; a payer role
 * without payers -> "Select at least one payer for this role."; the server
 * refuses a duplicate role with 422 "Duplicate role assignments are not
 * allowed.". Role options = ACTIVE roles the signed-in account may assign.
 *
 * Literal readings / decisions:
 * - "Administrator" = the suite admin; "Claims Reviewer" / "Report Viewer" /
 *   "Role A" = fresh suite roles ("QA Automation Role ...", payer-scoped or
 *   not as the case says); "Payer A / B / C" = real payers picked by name
 *   (`pickPayers` - Al sharq first), only REFERENCED on suite users.
 * - Targets are suite users; "user currently has no roles" (20509, 20516,
 *   20517) = a suite user created with no role (the API accepts it - finding
 *   noted by the foundation).
 * - 20508 "reflected on the user's profile": the profile's Roles & Status
 *   section names the role, and GetUser holds the role with exactly its payer.
 * - 20512 "roles outside the administrator's permission": the admin may assign
 *   every role, so the non-assignable half runs in a suite session whose role
 *   may assign only some suite roles (`assignableRoleIds`); the inactive half
 *   is checked for both. BLOCKED when the session's Role list does not offer
 *   even its assignable role (GetAssignableRoles answered [] in the scoped
 *   probe - decision 8).
 * - 20513 "administrator without the permission": a suite account holding every
 *   user right except Users.UpdateUser (decision 7); "the administrator who
 *   holds the permission" = the admin (baseline first, then again at the end).
 * - 20514 / 20515 "payer-scoped administrator for Payer A": a payer-scoped
 *   suite session on "Al sharq" (decision 8); its users = suite users holding a
 *   payer-scoped suite role on Al sharq (A) or on another payer (B). 20514 S4
 *   "direct action": B's row action, and GetUser for B (what the drawer loads)
 *   from the scoped session - unavailable OR denied passes (literal "or").
 *   20515 "Add a payer-scoped role": a second payer-scoped suite role the
 *   scoped role may assign; when the scoped Role list offers nothing, the
 *   picker of the user's EXISTING payer-scoped card is used (same picker) and
 *   the evidence is annotated.
 * - 20518 (exploratory): scripted - payer role + payer, switch the same card to
 *   a non-payer role, add / remove empty cards, a duplicate attempt, a cancel
 *   answered "Keep Editing", then Save.
 */
export const CASES = {
  opensOnRolesStep: { azureId: '20506' },
  payerRoleWithPayer: { azureId: '20508' },
  noRoleBlocked: { azureId: '20509' },
  duplicateRole: { azureId: '20510' },
  roleWithoutPayers: { azureId: '20511' },
  onlyActiveAssignable: { azureId: '20512' },
  assignHiddenWithoutPermission: { azureId: '20513', shape: { full: true, without: ['Users.UpdateUser'] } },
  scopedSeesOwnUsers: { azureId: '20514' },
  scopedOwnPayersOnly: { azureId: '20515' },
  multiplePayerRoles: { azureId: '20516' },
  minimumAssignment: { azureId: '20517' },
  exploratoryRoleChanges: { azureId: '20518' },
} as const;

/** The payer-scoped administrator's payer ("Payer A") - decision 8. */
export const SCOPED_PAYER = 'Al sharq';

/** What the payer-scoped suite administrator holds (list, view, update = Assign, and the lookups the drawer loads). */
export const SCOPED_ADMIN_RIGHTS = [
  'Users.GetUsers', 'Users.GetUser', 'Users.GetUsersDashboard', 'Users.UpdateUser', 'Users.CheckDocumentIdExists',
  'Roles.GetRoles', 'Payers.GetPayersDropdown', 'Lookups.GetLookups',
] as const;

/** Step 3's validation and server texts. */
export const MESSAGES = {
  noRole: 'Add at least one role.',
  duplicate: /Duplicate role assignments are not allowed/i,
  duplicateWarning: /duplicate|already (assigned|added|selected)/i,
  saved: /User updated|saved successfully/i,
  error: /error|fail|could not|unable/i,
} as const;
