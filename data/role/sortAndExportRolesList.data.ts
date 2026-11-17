/**
 * US 21280 "Sort and Export Roles list" (role folder 01, 12 cases, 21976-21987).
 *
 * Live screen (reports/role/Role-Foundation-Notes.md): the Sort control is a toolbar MENU (Newest, Oldest,
 * Role Name, Description, Status, Modified On) + a direction button; the first pick of Role Name sends
 * "RoleNameEn desc"; a new option keeps the current direction. Export = menu "Selected Export" / "Export All
 * Data" -> the shared format dialog (Excel / CSV) -> Roles_<stamp>.xlsx + toast "Export downloaded.". Excel
 * headers seen: Role Name, Arabic Name, Active, Created By, Created Date.
 *
 * Decisions (Role-Writers-Brief.md lead decisions):
 *  - Example names ("Billing Clerk", "Auditor", "Nurse Supervisor") and search terms ("Clerk", "Nurse") are
 *    replaced by suite roles whose names carry one shared group token (decision 2); the search uses the token.
 *  - Orders are checked on the WHOLE list: the screen's own GetRoles request replayed with 1000 rows, compared
 *    case-insensitively (Intl.Collator 'en', base); the rows on screen must BE the answer's first page.
 *  - "a sort indicator appears on the <X> column" (21976 / 21978 / 21979) is asserted literally on the column
 *    header (aria-sort or a sort marker inside `role-list-table-th-<column>`) together with the toolbar trigger
 *    reading the option. The probe saw no indicator on the headers - a FINDING (fails today).
 *  - 21977 "no sort indicator active": no column header carries a sort indicator; the trigger shows the
 *    default "Newest" (the AC's default order, not a user choice).
 *  - 21976 description order (lead default for the open question): non-empty descriptions in order,
 *    case-insensitive; roles without a description kept in ONE block at the start or the end
 *    (DESCRIPTION_EMPTIES_RULE). Ascending = A to Z.
 *  - 21979 (TC only asks "grouped"): in both directions every Active role and every Inactive role forms one
 *    block (STATUS_BLOCKS = 2 when both statuses exist).
 *  - Export menu labels are the TC's literal "Export Selected" / "Export All Data" (decision 3). The screen
 *    reads "Selected Export" - a wording FINDING (fails today). The TCs skip the format dialog; the suite picks
 *    Excel (the AC: "The list exports as Excel").
 *  - 21984 (open question "same order or same roles?"): the file must hold the same roles as the filtered list
 *    on screen; the order is reported, not asserted (EXPORT_ORDER_MUST_MATCH = false).
 *  - 21985 columns: the TC's literal "Role ID, Role Name, Description, Status" (decision 6: Role ID asserted
 *    literally - fails today; the file has no Role ID / Description / Status column). Values of the columns
 *    that ARE there are compared with GetRoles (Description = English description, Status = Active/Inactive).
 *  - 21986 (AUTO_NEEDS_DETAILS, either/or): accepted = an Excel file with headers and no data row, OR a message
 *    that is not the failure text; a crash, the failure text "Export failed. Please try again." or neither
 *    outcome fails. A disabled Selected Export is reported as "not processed" (fails).
 *  - 21987: Selected Export with no search must hold every listed role (the AC's "Export Selected exports only
 *    the filtered data" - with no filter, everything).
 */
export const CASES = {
  sortByDescription: { azureId: '21976' },
  defaultNewestFirst: { azureId: '21977' },
  sortByRoleName: { azureId: '21978' },
  sortByStatus: { azureId: '21979' },
  exportSelectedFiltered: { azureId: '21980' },
  exportAllIgnoresFilter: { azureId: '21981' },
  exportChoiceWithSearch: { azureId: '21982' },
  exportConfirmation: { azureId: '21983' },
  searchSortExport: { azureId: '21984' },
  exportExcelColumns: { azureId: '21985' },
  exportNoResults: { azureId: '21986' },
  exportSelectedNoFilter: { azureId: '21987' },
} as const;

/** The default order (live) and the trigger label of each option used here. */
export const DEFAULT_SORT_BY = 'CreatedOn desc';
export const SORT_LABEL = { newest: 'Newest', rolename: 'Role Name', description: 'Description', status: 'Status' } as const;
/** The `sortBy` field each option sends (GetRoles). */
export const SORT_FIELD = { rolename: 'RoleNameEn', description: 'DescriptionEn', status: 'Status' } as const;

/** 21976: roles without a description must form one block at either end (lead default). */
export const DESCRIPTION_EMPTIES_RULE = 'one block at the start or the end' as const;

/** 21976: three suite roles with distinct descriptions (labels + English descriptions). */
export const DESCRIPTION_ROLES = [
  { label: 'Desc Charlie', descriptionEn: 'charlie role for sorting' },
  { label: 'Desc Alpha', descriptionEn: 'Alpha role for sorting' },
  { label: 'Desc Bravo', descriptionEn: 'bravo role for sorting' },
] as const;

/** 21978: three suite roles in place of "Billing Clerk", "Auditor", "Nurse Supervisor" (decision 2). */
export const NAME_ROLES = ['Billing Clerk', 'Auditor', 'Nurse Supervisor'] as const;

/** 21979: one active and one inactive suite role. */
export const STATUS_ROLES = [
  { label: 'Status Active', isActive: true },
  { label: 'Status Inactive', isActive: false },
] as const;
export const STATUS_BLOCKS_WHEN_BOTH = 2;

/** Export menu labels as the TCs / AC quote them (decision 3). */
export const EXPORT_CHOICES = ['Export Selected', 'Export All Data'] as const;
export const EXPORT_FORMAT = 'excel' as const;
export const EXCEL_EXTENSION = /\.xlsx$/i;

/** Messages quoted by the AC (decision 3). */
export const EXPORT_DOWNLOADED = 'Export downloaded.';
export const EXPORT_FAILED = 'Export failed. Please try again.';

/** The file's role-name column (live header). */
export const FILE_NAME_COLUMN = 'Role Name';

/** 21985: the columns the TC expects, literally (decision 6). */
export const EXPECTED_FILE_COLUMNS = ['Role ID', 'Role Name', 'Description', 'Status'] as const;

/** 21980 / 21981 / 21982 / 21984: suite roles carrying one group token (the search term). */
export const FILTER_ROLE_LABELS = ['Clerk One', 'Clerk Two'] as const;
export const SEARCH_SORT_ROLES = [
  { label: 'Combo Bravo', isActive: true },
  { label: 'Combo Alpha', isActive: false },
  { label: 'Combo Charlie', isActive: true },
] as const;
export const EXPORT_ORDER_MUST_MATCH = false;

/** 21986: the TC's term that matches no role. */
export const NO_MATCH_TERM = 'zzznoresult123';
