/**
 * US 20412 "Sort and Export Users" (user folder 06), 13 cases.
 *
 * How the cases map onto the live list (2026-11-08, User-Foundation-Notes.md):
 *  - Sort By is a menu of FIELDS (Newest, Oldest, Name, Gender, Nationality,
 *    Identity Type, Document ID, Mobile Number, Status, Last Modified) plus a
 *    direction button that reverses the chosen field; a field option keeps the
 *    current direction. "Name (A-Z)" = Name + ascending (`EnglishFirstName asc`),
 *    "Name (Z-A)" = Name + descending. 20555 asserts each AC field is offered and
 *    sortable BOTH ways (request `sortBy` "<Field> asc" and "<Field> desc");
 *    "Created On" Newest-to-Oldest / Oldest-to-Newest = the Newest / Oldest
 *    options (`CreatedOn desc` / `CreatedOn asc`) - there is no "Created On"
 *    field option (literal reading noted, decision kept to the request sent).
 *  - The order is checked on the answer the screen received, in screen order
 *    (row ids = answer ids): names case-insensitively, dates as instants.
 *  - Export = menu Selected Export / Export All Data -> the `#pbm-dialog` format
 *    choice CSV / Excel -> POST ExportUsers (`format` 1 / 2) -> a file
 *    `Users_YYYYMMDD_HHmmss.csv|xlsx` with columns Username (= document ID),
 *    Email, Full Name (EN), Full Name (AR), Gender, Nationality, Identity Type,
 *    Email Confirmed, Active, Last Login, Created Date.
 *  - 20557 (decision 2): asserted literally - the All Users / Filtered Results
 *    question should appear when a search is applied (it never did on
 *    2026-11-08: the MENU offers Selected Export / Export All Data instead; the
 *    step's evidence names both).
 *  - 20558 "choose Filtered Results": the page object answers the question when
 *    the app asks it; otherwise Selected Export is the filtered choice (AC "The
 *    Selected Export option exports only the filtered users").
 *  - 20561 (payer-scoped administrator, decision 7): a suite session scoped to
 *    "Al sharq" with Users.ExportUsers; "Payer B users" = a suite user whose
 *    payer-scoped suite role is on another payer.
 *  - 20562 (exploratory) is a scripted sequence of the listed actions.
 *  - 20563: the AC's table has a Gender column; the live table has none (finding
 *    - asserted literally). "Nationality (Country Code)" = "Saudi (SAU)".
 */
export const CASES = {
  nameAscending: { azureId: '20551' },
  nameDescending: { azureId: '20552' },
  newestByDefault: { azureId: '20553' },
  exportCsv: { azureId: '20554' },
  allSortOptions: { azureId: '20555' },
  exportExcel: { azureId: '20556' },
  scopeQuestion: { azureId: '20557' },
  filteredExport: { azureId: '20558' },
  tenPerPage: { azureId: '20559' },
  nextPrevious: { azureId: '20560' },
  scopedExportAll: { azureId: '20561' },
  exploratory: { azureId: '20562' },
  tableColumns: { azureId: '20563' },
} as const;

/** The AC's A-Z / Z-A fields: Sort By option key -> menu label and the request's `sortBy` field. */
export const AZ_FIELDS = {
  name: { label: 'Name', sortBy: 'EnglishFirstName' },
  gender: { label: 'Gender', sortBy: 'GenderId' },
  nationality: { label: 'Nationality', sortBy: 'NationalityId' },
  identityType: { label: 'Identity Type', sortBy: 'IdentityTypeId' },
  documentId: { label: 'Document ID', sortBy: 'UserName' },
  status: { label: 'Status', sortBy: 'IsActive' },
} as const;

/** Created On (Newest / Oldest) and Last Modified. */
export const DATE_SORTS = { newest: 'CreatedOn desc', oldest: 'CreatedOn asc', lastModified: 'ModifiedOn' } as const;

/** The table columns the AC lists (in its order). */
export const TABLE_COLUMNS = ['Name', 'Document ID', 'Identity Type', 'Nationality', 'Gender', 'Mobile Number', 'Status', 'Actions'] as const;

/** Nationality shown with its country code, e.g. "Saudi (SAU)". */
export const WITH_COUNTRY_CODE = /\([A-Z]{2,3}\)\s*$/;

/** The export file's columns (2026-11-08). */
export const EXPORT_HEADERS = ['Username', 'Email', 'Full Name (EN)', 'Full Name (AR)', 'Gender', 'Nationality', 'Identity Type', 'Email Confirmed', 'Active', 'Last Login', 'Created Date'] as const;

export const EXPORT_FILE = { csv: /^Users_\d{8}_\d{6}\.csv$/i, excel: /^Users_\d{8}_\d{6}\.xlsx$/i } as const;

/** 20557's expected scope question choices. */
export const SCOPE_CHOICES = { all: /All Users/i, filtered: /Filtered Results/i } as const;

/** The payer of 20561's payer-scoped administrator. */
export const SCOPE_PAYER = 'Al sharq';

/** 20561's rights: read the list and export it. */
export const SCOPED_EXPORT_RIGHTS = ['Users.GetUsers', 'Users.GetUser', 'Users.GetUsersDashboard', 'Users.ExportUsers'] as const;

/** 20562's empty filtered result. */
export const NO_MATCH_TERM = 'zzznotreal';

/** A toast that would report an export error. */
export const ERROR_TOAST = /error|exception|went wrong|failed/i;

/** The page size the AC configures. */
export const PAGE_SIZE = 10;
