/**
 * US 20986 "Sort and Export Triggers" (notification folder 09, 14 cases, 21412-21425).
 *
 * How it works (foundation 2026-11-11): Triggers (Email&SMS) is the `nc-triggers`
 * list - 10 rows a page, default sort "Newest" (`sortBy: "CreatedOn desc"`), sort
 * menu options newest / oldest / name / module / action / recipient / ispredefined /
 * isactive / modifiedon plus a direction toggle, Export menu "Selected Export" /
 * "Export All Data" (a format dialog Excel / CSV may follow - answered Excel),
 * file `Triggers_<stamp>.xlsx` with Name, Module, Action, Recipient, Predefined, Active.
 *
 * Literal readings / decisions:
 * - TC example values are replaced (lead decision 2): "Multiple triggers created at
 *   different times" = two suite triggers created one after the other; the TC's
 *   search "Order" is kept as the search word and the suite makes its own
 *   "QA Automation Trigger Order ..." triggers (one ACTIVE, one inactive); the "2 of 10"
 *   counts depend on the environment, so the file is compared with the screen / API.
 * - "Alphabetically" / "ordered by <column> value" = ascending A to Z. Choosing a
 *   field keeps the previous direction (the probe saw "Name desc" right after picking
 *   Name), so the sort direction toggle - part of the Sort By control - is set to
 *   ascending before the rows are read. Comparison is case-insensitive.
 * - "Grouped / ordered by Module", "grouped by Active status", "grouped by Predefined":
 *   each value forms ONE contiguous run on the page (the "/" accepts either).
 * - Newest / oldest: the screen's order must equal the order of its own answer
 *   (`CreatedOn desc` / `CreatedOn asc`) and the later suite trigger must come
 *   first / last; the list rows carry no createdOn, so the API's CreatedOn sort is
 *   the reference.
 * - "Lock badge" = the predefined badge (`-predefined-badge`, text "Predefined");
 *   custom rows show "—" (`-predefined-none`).
 * - 21425 zero results: real filter values that match nothing - Module "Member
 *   Management" + Predefined "Yes" (no predefined trigger belongs to Member Management).
 * - 21419 / 21421: the ACTIVE suite trigger is put on a FREE Member Management
 *   action when one is free (it would only ever notify a member, and only for the
 *   seconds the case runs); teardown deletes both.
 */
export const SORT_EXPORT_STORY = { id: 20986, title: 'Sort and Export Triggers' } as const;

export const CASES = {
  defaultNewest: { azureId: 21412 },
  sortName: { azureId: 21413 },
  sortModule: { azureId: 21414 },
  sortRecipient: { azureId: 21415 },
  sortAction: { azureId: 21416 },
  sortActive: { azureId: 21417 },
  newestOldest: { azureId: 21418 },
  exportSelected: { azureId: 21419 },
  sortPredefined: { azureId: 21420 },
  exportAll: { azureId: 21421 },
  exportExcel: { azureId: 21422 },
  exportColumns: { azureId: 21423 },
  lockBadge: { azureId: 21424 },
  exportEmpty: { azureId: 21425 },
} as const;

/** Sort menu keys (`nc-triggers-sort-option-<key>`) and the column each one orders. */
export const SORT = {
  newest: { key: 'newest', label: 'Newest' },
  oldest: { key: 'oldest', label: 'Oldest' },
  name: { key: 'name', column: 'name', label: 'Name' },
  module: { key: 'module', column: 'module', label: 'Module' },
  action: { key: 'action', column: 'action', label: 'Action' },
  recipient: { key: 'recipient', column: 'recipient', label: 'Recipient' },
  predefined: { key: 'ispredefined', column: 'predefined', label: 'Predefined' },
  active: { key: 'isactive', column: 'active', label: 'Active' },
} as const;

/** The request `sortBy` of the newest / oldest options. */
export const SORT_BY = { newest: 'CreatedOn desc', oldest: 'CreatedOn asc' } as const;

/** The search word of 21419 / 21421 (the TC's) and the suite trigger label that carries it. */
export const ORDER_SEARCH = 'Order';
/** The filter of 21419 / 21421: Active = Active (filter field `isactive`, option "Yes"). */
export const ACTIVE_FILTER = { isactive: 'Yes' } as const;
/** 21425: a real filter combination that matches no trigger. */
export const EMPTY_FILTER = { moduleid: 'Member Management', ispredefined: 'Yes' } as const;

/** The list's Active cell marks and the Predefined badge text. */
export const ACTIVE_MARK = { yes: '✓', no: '✗' } as const;
export const PREDEFINED_TEXT = 'Predefined';
export const CUSTOM_PREDEFINED_TEXT = '—';
/** "No records to display." */
export const EMPTY_LIST_TEXT = 'No records to display.';

/** The columns the list and the file must show (AC + TC 21423). */
export const TRIGGER_COLUMNS = ['Name', 'Module', 'Action', 'Recipient', 'Predefined', 'Active'] as const;
/** Column keys of the list (`nc-triggers-table-th-<key>`), same order. */
export const TRIGGER_COLUMN_KEYS = ['name', 'module', 'action', 'recipient', 'predefined', 'active'] as const;
/** The export's Active / Predefined values. */
export const FILE_YES_NO = { yes: 'Yes', no: 'No' } as const;

/** The download: Excel. */
export const EXCEL_FILE = /^Triggers_.*\.xlsx$/i;
/** The two Export menu entries (AC). */
export const EXPORT_MENU = ['Selected Export', 'Export All Data'] as const;
