/**
 * US 21289 "View Role" (role folder 10, 7 cases, 22094-22100) - Writer B.
 *
 * How the screen behaves (Role-Foundation-Notes.md, 2026-11-14): View opens the same `role-form-drawer` titled
 * "View Role" as ONE read-only page (no stepper): Role Name, اسم الدور, Allowed To Assign By, Has Assigned
 * Payers?, Can a user approve their own requests? (Yes / No) - descriptions and Is Active are NOT shown - then the
 * permission tree with every checkbox disabled; footer Cancel only.
 *
 * SAFETY: every role viewed is a suite role made by `suiteRoles`; the holder (maalmohammad) only reads.
 *
 * Lead decisions applied:
 * - (1) TC over AC / the screen: 22094 compares View with Edit field by field (names, both descriptions, Allowed To
 *   Assign By, the three checkboxes) and privilege by privilege - the missing descriptions / Is Active fail it
 *   (finding). 22099 expects a Role Information -> Privileges -> Role Information navigation: the test looks for
 *   the stepper / Next / Back and fails while View is one page (finding), still checking the content is read-only.
 * - (2) "the permission to view roles" (22096 / 22097) = `Roles.GetRole` (`VIEW_RIGHT`: the View action reads one
 *   role through GetRole); the holder of 22096 keeps `Roles.GetRoles` so the list itself loads and the View action
 *   can be looked for. "edit-roles permission" = `Roles.UpdateRole`.
 * - 22097 (triage 2026-11-15): View Role draws the privilege tree only for a session holding
 *   `Permissions.GetPermissions` (`CATALOGUE_RIGHT`, the "Permissions" module - the app's loadAllPermissions() is
 *   gated on it); without it the tree is empty and reads "No privileges match the search.". Reading the catalogue
 *   is a VIEW right, so both 22097 holders get it (view-only = list + GetRole + catalogue, still no edit right).
 * - 22096 / 22097: "a user" = the role holder maalmohammad on a suite role; careconnect is the baseline (View
 *   offered) before the holder without the right is checked (brief: baseline first). 22097's "sign in as the user
 *   holding both" = the holder is reshaped onto the view + edit suite role and signs in again.
 * - 22098: the zero-privilege role is made through the API (the screen refuses Save with nothing ticked); if the
 *   API refuses an empty list too the case is BLOCKED by `suiteRoles.create` with the answer.
 * - 22100: "every available privilege" = every key of GetRolePermissions (397 nodes, 2026-11-14) on a suite role
 *   nobody holds.
 */
import { ROLE_MESSAGES } from './common.data';

export const STORY = { id: '21289', title: 'View Role' } as const;

/** "The permission to view roles" (lead default above). */
export const VIEW_RIGHT = 'Roles.GetRole';
export const LIST_RIGHT = 'Roles.GetRoles';
export const EDIT_RIGHT = 'Roles.UpdateRole';
/** The privilege catalogue - the tree of View / Add / Edit Role loads only with it (22097, see above). */
export const CATALOGUE_RIGHT = 'Permissions.GetPermissions';

/** View Role row labels (live 2026-11-14) and the Edit field each one mirrors. */
export const VIEW_LABELS = {
  nameEn: 'Role Name',
  nameAr: 'اسم الدور',
  allowedToAssignBy: 'Allowed To Assign By',
  hasAssignedPayers: 'Has Assigned Payers?',
  canApproveOwnRequests: 'Can a user approve their own requests?',
  /** Not shown in View today - the label Edit uses for it. */
  isActive: 'Is Active?',
} as const;
export const YES_NO = { yes: 'Yes', no: 'No' } as const;

export const TITLES = { view: ROLE_MESSAGES.viewTitle, edit: ROLE_MESSAGES.editTitle, stepInformation: ROLE_MESSAGES.stepInformation, stepPrivileges: ROLE_MESSAGES.stepPrivileges } as const;

/** A role with something in every field, so View can be compared with Edit (22094). */
export const FULL_ROLE = {
  label: 'View Compare',
  descriptionEn: 'View compare description',
  descriptionAr: 'وصف مقارنة العرض',
  hasAssignedPayers: true,
  canApproveOwnRequests: true,
  allowedToAssignBy: ['Organization Administrator', 'Payer Administrator'],
  rights: ['Roles.GetRoles', 'Roles.GetRole', 'Roles.ExportRoles', 'Roles.CreateRole', 'Announcement.GetAnnouncements'],
} as const;

export const CASES = {
  sameAsEdit: { azureId: '22094' },
  readOnly: {
    azureId: '22095',
    label: 'View Read Only',
    /** A leaf the role holds and one it does not - both clicked, neither may change. */
    heldLeaf: 'Roles.ExportRoles',
    notHeldLeaf: 'Roles.CreateRole',
    rights: ['Roles.GetRoles', 'Roles.ExportRoles'],
  },
  noViewPermission: {
    azureId: '22096',
    targetLabel: 'View Target',
    holderLabel: 'List Only Holder',
    holderRights: [LIST_RIGHT],
  },
  viewRegardlessOfEdit: {
    azureId: '22097',
    targetLabel: 'View Target',
    viewOnlyLabel: 'View Only Holder',
    viewOnlyRights: [LIST_RIGHT, VIEW_RIGHT, CATALOGUE_RIGHT],
    viewEditLabel: 'View Edit Holder',
    viewEditRights: [LIST_RIGHT, VIEW_RIGHT, CATALOGUE_RIGHT, EDIT_RIGHT],
  },
  zeroPrivileges: { azureId: '22098', label: 'Zero Privileges', rights: [] as string[] },
  stepNavigation: { azureId: '22099', label: 'View Steps' },
  allPrivileges: { azureId: '22100', label: 'All Privileges' },
} as const;
