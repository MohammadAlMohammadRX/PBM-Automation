/**
 * US 21287 "Search and Filter Roles" (role folder 08, 10 cases, 22067-22076).
 *
 * Live screen (reports/role/Role-Foundation-Notes.md): the search box is server side and debounced (GetRoles
 * `searchText`, no Enter); "Clear" beside it; empty result "No roles found."; "Advance Search for Roles" =
 * tab Search with Role Name, Description, Status (Active / Inactive) + tab Display Settings.
 *
 * Decisions (Role-Writers-Brief.md lead decisions):
 *  - Example roles ("Claims Reviewer", "Network Officer", "مسؤول الشبكة", "Network Administrator") do not exist:
 *    the suite creates its own, whose names carry the example words plus a unique token (decision 2), and
 *    searches the full suite name (or the token) so other people's roles cannot answer.
 *  - Arabic: the role's Arabic name is "مسؤول الشبكة <arabic token>" and its Arabic description carries a
 *    second Arabic token, searched on its own (TC 22071 step 4).
 *  - 22068: four suite roles - one matching name + description keyword + Active, and three that each miss one
 *    criterion; only the full match may come back (whole result re-read with the screen's own request).
 *  - 22071 / 22072 step 4 (triage 2026-11-15, read-only probe): the search box sends `searchText`, which the
 *    server matches against role NAMES only - description words ("formularies", "Administers", Arabic words) answer
 *    0 roles, while Advance Search's `description` filter does match. The steps stay failing (finding).
 *  - 22075 "exactly the Role name, Description and Status fields": the Search TAB's fields only (open question;
 *    the Display Settings tab is a separate tab). Labels compared as words, case ignored ("Role name" in the TC
 *    vs "Role Name" on screen). "usable" = each takes a value and shows it back.
 *  - 22076 (AUTO_NEEDS_DETAILS, "select the role ... its details open for management"): the management action
 *    is EDIT (MANAGE_ACTION) - the drawer opens on that role (title "Edit Role", its name filled) and is closed
 *    without saving.
 */
export const CASES = {
  searchByName: { azureId: '22067' },
  advanceSearchAllThree: { azureId: '22068' },
  activeOnly: { azureId: '22069' },
  noRolesFound: { azureId: '22070' },
  arabicNameAndDescription: { azureId: '22071' },
  englishNameAndDescription: { azureId: '22072' },
  clearSearch: { azureId: '22073' },
  descriptionNoMatch: { azureId: '22074' },
  advanceSearchFields: { azureId: '22075' },
  searchThenManage: { azureId: '22076' },
} as const;

/** Example words carried by the suite roles' names (decision 2). */
export const EXAMPLE_NAMES = {
  claimsReviewer: 'Claims Reviewer',
  networkOfficer: 'Network Officer',
  networkAdministrator: 'Network Administrator',
  arabicNetworkManager: 'مسؤول الشبكة',
} as const;

/** 22071: the Arabic description around the searched Arabic token. */
export const ARABIC_DESCRIPTION_PREFIX = 'دور لإدارة الشبكة';
/** 22072: the English description around the searched English keyword. */
export const ENGLISH_DESCRIPTION = (keyword: string): string => `Manages the ${keyword} network`;

/** 22068: the four roles (label suffix after the group token; description has the keyword unless `keyword` false). */
export const ADVANCE_ROLES = {
  full: { label: 'Network Officer', keyword: true, isActive: true },
  missName: { label: 'Other Officer', keyword: true, isActive: true },
  missDescription: { label: 'Network Officer Desc', keyword: false, isActive: true },
  missStatus: { label: 'Network Officer Status', keyword: true, isActive: false },
} as const;
export const ADVANCE_DESCRIPTION = (keyword: string | null): string => (keyword ? `Handles the ${keyword} network` : 'Handles claims only');
export const STATUS_ACTIVE = 'Active' as const;

/** 22070 / 22074: the TCs' terms that match nothing. */
export const NO_MATCH_NAME = 'Zzzznonexistent';
export const NO_MATCH_DESCRIPTION = 'xyzabc';

/** 22075: the fields (wrapper id keys) and labels the TC names, and the values typed to prove them usable. */
export const ADVANCE_FIELD_KEYS = ['name', 'description', 'status'] as const;
export const ADVANCE_FIELD_LABELS = ['Role name', 'Description', 'Status'] as const;
export const ADVANCE_TRY_VALUES = { name: 'Usability check', description: 'usability', status: 'Active' } as const;

/** 22076: the action that opens a found role for management (lead default). */
export const MANAGE_ACTION = 'edit' as const;
