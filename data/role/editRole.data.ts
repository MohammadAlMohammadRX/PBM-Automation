/**
 * US 21290 "Edit Role" (role folder 11, 13 cases, 22101-22113) - Writer B.
 *
 * How the screen behaves (Role-Foundation-Notes.md, 2026-11-14): a suite row's Edit opens the Add drawer titled
 * "Edit Role" (stepper Role Information / Privileges) pre-filled from GetRole; Save sends PUT UpdateRole. A role
 * whose Allowed To Assign By is empty opens with "This field is required." and refuses Next. Predefined rows show
 * Edit ENABLED, opening a locked form (AC 21291) - while AC 21290 / TC 22112 say Edit is hidden.
 *
 * SAFETY: every role edited is a suite role made by `suiteRoles` in the test (tracked by id, so a rename outside
 * the prefix - 22104's one-letter name - is still deleted at teardown). Predefined roles are only READ (22112
 * looks at their row / card actions, never opens a write). The holder (maalmohammad) is restored by `roleHolder`.
 *
 * Lead decisions applied:
 * - (2) TC example values: "Claims Reviewer Updated" -> a stamped suite name with that label; the description is
 *   the TC's own text. "e.g., 100 characters" = the screen's maxlength 100 (`ROLE_LIMITS.name`).
 * - (1/3) 22112: Edit asserted HIDDEN for the three predefined roles in the table and the cards (fails today -
 *   finding: Edit is offered and opens a locked form). 22105 quotes no message: it must show a length message,
 *   refuse the save and keep the stored name (a box that silently stops at 100 and saves the cut name fails).
 *   22106 quotes no message: the AC's "Role name '{0}' is already taken." is asserted.
 * - 22102 "a previously incomplete required field": a suite role saved through the API with an EMPTY Allowed To
 *   Assign By (the screen requires it; the API takes it - the same state UserProvisioning's roles are in). If the
 *   API refuses it the case is BLOCKED with the answer.
 * - 22104 "1 character": a single letter no listed role uses (so uniqueness cannot refuse it).
 * - 22107 "a privilege the role grants": `Roles.CreateRole` (a LEAF - a branch's checkbox shows its descendants,
 *   not its own permission), whose effect the holder sees as the Add Role button. The app offers Add Role only to a session holding
 *   BOTH `Roles.CreateRole` and `Permissions.GetPermissions` (its addPermissions, match "all" - triage 2026-11-15),
 *   so the role also grants the catalogue right, which it keeps after the edit.
 * - 22108 "edit-roles permission" = `Roles.UpdateRole`; the holder keeps GetRoles + GetRole so the list and View
 *   load; the API attempt is an UpdateRole on a SUITE role (refusal expected).
 * - 22113 "the list of Add Role validations" (not attached): `VALIDATION_RULES` = every rule of AC 21288 that the
 *   form can trigger; each is triggered in Add Role and in Edit Role and the two outcomes (step reached, field
 *   errors, toast / tree message, kept value, server answer) must be equal.
 */
import { PREDEFINED_ROLES, ROLE_LIMITS, ROLE_MESSAGES } from './common.data';

export const STORY = { id: '21290', title: 'Edit Role' } as const;

export const RIGHTS = {
  list: 'Roles.GetRoles',
  view: 'Roles.GetRole',
  edit: 'Roles.UpdateRole',
  create: 'Roles.CreateRole',
  export: 'Roles.ExportRoles',
  /** The privilege catalogue: Add Role needs it next to CreateRole (22107). */
  catalogue: 'Permissions.GetPermissions',
} as const;

/**
 * The rights every role edited here is made with: a branch + a LEAF, so a Save from the tree always carries a
 * visibly ticked privilege (a branch's checkbox shows only its descendants).
 */
export const EDIT_ROLE_RIGHTS = [RIGHTS.list, RIGHTS.export] as const;

export const TITLES = { edit: ROLE_MESSAGES.editTitle, stepInformation: ROLE_MESSAGES.stepInformation, stepPrivileges: ROLE_MESSAGES.stepPrivileges } as const;

export const LIMITS = ROLE_LIMITS;

export const QUOTES = {
  fieldRequired: ROLE_MESSAGES.fieldRequired,
  nameTaken: ROLE_MESSAGES.nameTaken,
  unsavedTitle: ROLE_MESSAGES.unsavedTitle,
} as const;

/** A role with every field set (22101). */
export const PREFILLED_ROLE = {
  label: 'Prefilled',
  descriptionEn: 'Prefilled role description',
  descriptionAr: 'وصف الدور المعبأ',
  isActive: true,
  hasAssignedPayers: true,
  canApproveOwnRequests: true,
  allowedToAssignBy: [PREDEFINED_ROLES.organizationAdministrator.en, PREDEFINED_ROLES.payerAdministrator.en],
  rights: [RIGHTS.list, RIGHTS.view, RIGHTS.export],
} as const;

/** One Add Role validation, triggered the same way in Add and in Edit (22113). */
export type ValidationRule =
  | { key: string; title: string; kind: 'step1'; field: 'nameEn' | 'nameAr' | 'descriptionEn'; value: string }
  | { key: string; title: string; kind: 'allowedToAssignBy' }
  | { key: string; title: string; kind: 'noPrivilege' }
  | { key: string; title: string; kind: 'duplicateName' };

const letters = (n: number): string => `QaAutomation${'x'.repeat(Math.max(0, n - 12))}`.slice(0, n);

export const VALIDATION_RULES: readonly ValidationRule[] = [
  { key: 'englishNameRequired', title: 'Role Name (English) is mandatory', kind: 'step1', field: 'nameEn', value: '' },
  { key: 'arabicNameRequired', title: 'Role Name (Arabic) is mandatory', kind: 'step1', field: 'nameAr', value: '' },
  { key: 'allowedToAssignByRequired', title: 'Allowed To Assign By needs at least one role', kind: 'allowedToAssignBy' },
  { key: 'englishLettersOnly', title: 'Role Name (English) takes English letters only', kind: 'step1', field: 'nameEn', value: 'مدير' },
  { key: 'arabicLettersOnly', title: 'Role Name (Arabic) takes Arabic letters only', kind: 'step1', field: 'nameAr', value: 'Manager' },
  { key: 'nameMaxLength', title: 'Role Name (English) max 100 characters', kind: 'step1', field: 'nameEn', value: letters(ROLE_LIMITS.name + 1) },
  { key: 'descriptionMaxLength', title: 'Role Description (English) max 250 characters', kind: 'step1', field: 'descriptionEn', value: letters(ROLE_LIMITS.description + 1) },
  { key: 'atLeastOnePrivilege', title: 'At least one privilege must be selected', kind: 'noPrivilege' },
  { key: 'uniqueName', title: 'A duplicate role name is rejected', kind: 'duplicateName' },
];

export const CASES = {
  prefilled: { azureId: '22101' },
  completeRequiredFields: { azureId: '22102', label: 'Incomplete', rights: [RIGHTS.list, RIGHTS.export], assigner: PREDEFINED_ROLES.organizationAdministrator.en },
  updateNameAndDescription: { azureId: '22103', label: 'Claims Reviewer', newLabel: 'Claims Reviewer Updated', descriptionEn: 'Handles updated claims review workflow' },
  nameLengthBounds: { azureId: '22104', label: 'Name Bounds' },
  nameTooLong: { azureId: '22105', label: 'Name Too Long' },
  duplicateName: { azureId: '22106', firstLabel: 'Existing Name', secondLabel: 'Renamed To Existing' },
  privilegeChangeImmediate: {
    azureId: '22107',
    label: 'Immediate Holder',
    rights: [RIGHTS.list, RIGHTS.view, RIGHTS.catalogue, RIGHTS.create],
    removed: RIGHTS.create,
    kept: [RIGHTS.list, RIGHTS.view, RIGHTS.catalogue],
  },
  noEditPermission: { azureId: '22108', targetLabel: 'Edit Target', holderLabel: 'No Edit Holder', holderRights: [RIGHTS.list, RIGHTS.view] },
  allowedToAssignBy: { azureId: '22109', label: 'Assigner Change', from: PREDEFINED_ROLES.organizationAdministrator, to: PREDEFINED_ROLES.payerAdministrator },
  toggleFlags: { azureId: '22110', label: 'Flags', before: { isActive: true, hasAssignedPayers: false, canApproveOwnRequests: false }, after: { isActive: false, hasAssignedPayers: true, canApproveOwnRequests: true } },
  cancelEdit: {
    azureId: '22111',
    label: 'Cancel Edit',
    rights: [RIGHTS.list, RIGHTS.export],
    changes: { descriptionEn: 'Changed then cancelled', descriptionAr: 'تغيير ملغى', hasAssignedPayers: true, canApproveOwnRequests: true },
    tickedThenCancelled: RIGHTS.create,
  },
  predefinedEditHidden: { azureId: '22112' },
  sameValidations: { azureId: '22113', label: 'Same Validations', otherLabel: 'Validation Twin', rights: [RIGHTS.list, RIGHTS.export] },
} as const;
