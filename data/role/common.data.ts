/**
 * Role Management (Feature 21279) - shared data: suite prefixes, predefined roles, and every live message
 * the foundation captured on 2026-11-14 (careconnect, English UI unless marked AR). Quote these in
 * assertions instead of retyping them; a TC that words a message differently is asserted literally by the
 * TC (findings stay failing tests).
 */
import { SUITE_ROLE_PREFIX } from '../../utils/UserProvisioning';

export { SUITE_ROLE_PREFIX };

/** Arabic name prefix the suite gives its roles (the Arabic box takes Arabic letters). */
export const SUITE_ROLE_ARABIC_PREFIX = 'دور اختبار';

/** The three product roles (isPredefined true). Ids are this environment's (2026-11-14) - resolve by name when in doubt. */
export const PREDEFINED_ROLES = {
  organizationAdministrator: { en: 'Organization Administrator', ar: 'مسؤول المنشأة', id: '468e875a-5fd6-492b-b14d-654990a72d69' },
  payerAdministrator: { en: 'Payer Administrator', ar: 'مسؤول جهة التغطية', id: '9aaf386f-89a4-4658-a990-57ef6340e032' },
  payerOfficer: { en: 'Payer Officer', ar: 'موظف جهة التغطية', id: 'f4903605-97bf-4271-b018-937e55df67dd' },
} as const;
export type PredefinedRoleKey = keyof typeof PREDEFINED_ROLES;
export type PredefinedRoleName = (typeof PREDEFINED_ROLES)[PredefinedRoleKey]['en'];
export const PREDEFINED_ROLE_NAMES: readonly PredefinedRoleName[] = Object.values(PREDEFINED_ROLES).map((r) => r.en);

/**
 * What the predefined roles carry (GetRole, 2026-11-14): `assignableRoleIds` ("Allowed To Assign By") and the
 * number of selected permission ids. careconnect's own role "Admin" (419 permissions) is NOT listed by GetRoles.
 */
export const PREDEFINED_ROLE_FACTS = {
  'Organization Administrator': { allowedToAssignBy: ['Organization Administrator'], selectedPermissions: 367, hasAssignedPayers: false, canApproveOwnRequests: false },
  'Payer Administrator': { allowedToAssignBy: ['Organization Administrator'], selectedPermissions: 229, hasAssignedPayers: true, canApproveOwnRequests: false },
  'Payer Officer': { allowedToAssignBy: ['Organization Administrator', 'Payer Administrator'], selectedPermissions: 131, hasAssignedPayers: true, canApproveOwnRequests: false },
} as const;

/** Roles of OTHER people in this environment - never edited, toggled or deleted by the suite. */
export const FOREIGN_ROLES = ['role without payer', 'Payer Admin / Member', 'Formulary and policy roles', 'For Facility Test', 'Admin 2', 'System Administration', 'Payer Admin'] as const;

/** The predefined badge text in the name cell / card title. */
export const PREDEFINED_BADGE = { en: 'Predefined role' } as const;

/** Status badge / toggle labels. */
export const ROLE_STATUS = { active: 'Active', inactive: 'Inactive' } as const;
/**
 * The toggle on a non-predefined row. Story 21293 is "Activate and Deactivate Role" and its cases (22132, 22143 ...)
 * say "Deactivate"; the build of 2026-11-14 21:30 UTC renamed the old "Inactivate" to "Deactivate".
 */
export const ROLE_TOGGLE_LABEL = { activate: 'Activate', inactivate: 'Deactivate' } as const;

/** Sort menu labels (the trigger shows the chosen one; "Modified On" option shows "Last Modified" on the trigger). */
export const ROLE_SORT_LABEL = { newest: 'Newest', oldest: 'Oldest', rolename: 'Role Name', description: 'Description', status: 'Status', modifiedon: 'Last Modified' } as const;

/** Lookup `roleDeactivationReason` (GET /api/Lookups/Items/roleDeactivationReason), in screen order. */
export const ROLE_DEACTIVATION_REASON = {
  reorganisation: { en: 'Reorganisation', ar: 'إعادة هيكلة', id: '1de47a01-4b2c-4d3e-9a8b-1a2b3c4d0102' },
  supersededByAnotherRole: { en: 'Superseded by Another Role', ar: 'مستبدل بدور آخر', id: '1de47a01-4b2c-4d3e-9a8b-1a2b3c4d0103' },
  noLongerRequired: { en: 'No Longer Required', ar: 'لم يعد مطلوبًا', id: '1de47a01-4b2c-4d3e-9a8b-1a2b3c4d0104' },
  securityReview: { en: 'Security Review', ar: 'مراجعة أمنية', id: '1de47a01-4b2c-4d3e-9a8b-1a2b3c4d0105' },
  other: { en: 'Other', ar: 'أخرى', id: '1de47a01-4b2c-4d3e-9a8b-1a2b3c4d0106' },
} as const;
export type RoleDeactivationReasonKey = keyof typeof ROLE_DEACTIVATION_REASON;
export const ROLE_DEACTIVATION_REASON_LABELS = Object.values(ROLE_DEACTIVATION_REASON).map((r) => r.en);

/** Field limits read off the inputs (maxlength). */
export const ROLE_LIMITS = { name: 100, description: 250, deactivationDetails: 500 } as const;

/** Every message observed live (EN). `{name}` = the role's English name. */
export const ROLE_MESSAGES = {
  // list
  noRolesFound: 'No roles found.',
  // drawer titles
  addTitle: 'Add New Role',
  editTitle: 'Edit Role',
  viewTitle: 'View Role',
  stepInformation: 'Role Information',
  stepPrivileges: 'Privileges',
  // step 1
  fieldRequired: 'This field is required.',
  predefinedNote: 'This is a predefined role. Its name, description, flags and delegation are part of the product and cannot be changed.',
  // step 2
  selectAtLeastOnePrivilege: 'Select at least one privilege.',
  noPrivilegesMatch: 'No privileges match the search.',
  // close guard (pbm-dialog)
  unsavedTitle: 'Unsaved Changes',
  unsavedMessage: 'You have unsaved changes. If you leave now, your edits will be lost.',
  // toasts: summary + detail
  createdSummary: 'Role created',
  createdDetail: 'The new role has been created and is ready to be assigned.',
  deactivatedSummary: 'Role deactivated',
  deactivatedDetail: 'The role is now inactive and can no longer be assigned.',
  activatedSummary: 'Role activated',
  activatedDetail: 'The role is now active and can be assigned to users.',
  deletedSummary: 'Role deleted',
  deletedDetail: 'The role has been removed and is no longer available.',
  /** CreateRole 409 ValidationErrors[Name] - also shown as the toast text (drawer stays open). */
  nameTaken: (name: string): string => `Role name '${name}' is already taken.`,
  // deactivate drawer
  deactivateTitle: 'Deactivate Role',
  deactivateWarning: (name: string): string => `Deactivate ${name}? Users holding this role lose its permissions. No other record is changed.`,
  deactivateConfirmLabel: 'Deactivate',
  deactivateReasonPlaceholder: 'Select a reason',
  detailsRequiredForOther: 'Details are required when the reason is "Other".',
  // activate / delete confirm (pbm-dialog)
  activateTitle: 'Activate Role',
  activateMessage: (name: string): string => `Are you sure you want to activate ${name}?`,
  activateConfirmLabel: 'Activate',
  deleteTitle: 'Delete Role',
  deleteMessage: (name: string): string => `Do you want to delete ${name}?`,
  deleteConfirmLabel: 'Yes',
  deleteCancelLabel: 'No',
} as const;

/** API successMessage texts (the answers, not the toasts). */
export const ROLE_API_MESSAGES = {
  created: 'Role has been created successfully.',
  deactivated: 'Role has been deactivated successfully.',
  activated: 'Role has been activated successfully.',
  deleted: 'Role has been deleted successfully.',
} as const;
