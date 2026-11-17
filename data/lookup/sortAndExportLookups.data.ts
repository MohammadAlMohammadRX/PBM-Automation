/**
 * US 20855 "Sort and Export Lookups" (lookup folder 03, 12 cases, 21131-21142).
 *
 * The Lookup Register (`lookup-list`) is read-only: 57 predefined lists, default
 * order GetLookups `sortBy: "CreatedOn desc"` with the trigger reading "Newest"
 * and a direction button beside it; Export opens Selected Export / Export All
 * Data (reports/lookup/Lookup-Foundation-Notes.md). Nothing here changes data.
 *
 * Literal readings / decisions (Lookup-Writers-Brief.md, lead decisions):
 *  - Sort By: the menu's option ids were not probed (constants/lookup/writerAIds.ts,
 *    inferred). An order is asserted on what the screen received: the rows on
 *    screen ARE the answer's items in order, and the WHOLE register, re-read
 *    with the same request (`sortBy`, 1000 rows), is in that order. The request
 *    must name the field (SORT_COLUMN) and the direction. Names compare
 *    case-insensitively (localeCompare, base); dates as instants (null last
 *    when newest-first, first when oldest-first - SQL's order).
 *  - "Created On, Newest to Oldest / Oldest to Newest" = `CreatedOn desc / asc`.
 *  - 21133 "Last Modified": every predefined list had modifiedOn null on
 *    2026-11-09; when no two lists differ in Last Modified the order cannot be
 *    observed and the step is BLOCKED at run time (unless a step already failed).
 *  - 21104-style default order (21134): BLOCKED when every list carries the
 *    same createdOn.
 *  - Export (decision 5): Export -> Selected Export / Export All Data -> the
 *    shared format dialog -> Excel. The file is saved under the test's output
 *    folder and read with utils/XlsxUtils (CSV with utils/CsvUtils). "a choice
 *    of Excel" (AC) is asserted as: Excel is offered (the cases do not say "only").
 *  - Selected Export (AC): the rows matching the search + filters (ALL of them,
 *    re-read with the screen's own request); with nothing filtered, the page on
 *    screen (21141 compares the file with the 10 rows shown, in order).
 *  - "Lookups exported." / "Failed to export lookups." asserted literally
 *    (decision 2). 21139 fails ExportLookups in the test's own browser with
 *    page.route -> 500 (decision 4).
 *  - 21138: the file's columns must be exactly Code, English Name, Arabic Name -
 *    the register's data columns in screen order (Actions is not data).
 *  - 21142: "a header-only file or an appropriate message" = a file with the
 *    headers and no rows, OR the literal "Nothing to export in the current view."
 *    (decision 2); "Failed to export lookups." or no outcome at all fails.
 *  - 21140 (decision 6): the account without the right = a suite role with no
 *    Lookups.* right; "a System Administrator holding the view-lookups
 *    permission" = a suite role holding ONLY the view rights (the AC: "available
 *    only to a System Administrator who holds the permission to view lookups"),
 *    so Export must be offered on the view right alone. The administrator's own
 *    register is the baseline. If the lead reads Export as needing
 *    Lookups.ExportLookups too, add it to SORT_EXPORT_HOLDER_RIGHTS.
 */
export const CASES = {
  codeAscending: { azureId: '21131' },
  codeDescending: { azureId: '21132' },
  dateSorts: { azureId: '21133' },
  newestByDefault: { azureId: '21134' },
  nameSorts: { azureId: '21135' },
  selectedExport: { azureId: '21136' },
  exportAll: { azureId: '21137' },
  exportColumns: { azureId: '21138' },
  exportFails: { azureId: '21139' },
  permission: { azureId: '21140' },
  exportWithSort: { azureId: '21141' },
  exportNoRows: { azureId: '21142' },
} as const;

/** The request `sortBy` column each Sort By field must name (matched case-insensitively). */
export const SORT_COLUMN = {
  code: /^code\b/i,
  englishName: /^englishname\b/i,
  arabicName: /^arabicname\b/i,
  createdOn: /^createdon\b/i,
  modifiedOn: /^modifiedon\b/i,
} as const;

/** The default order (seen live) and the trigger's default label. */
export const DEFAULT_SORT = 'CreatedOn desc';
export const DEFAULT_SORT_LABEL = 'Newest';

/** The export file's columns: the register's data columns, in screen order. */
export const EXPORT_HEADERS = ['Code', 'English Name', 'Arabic Name'] as const;

/** The Export menu's two choices (seen live). */
export const EXPORT_MENU = ['Selected Export', 'Export All Data'] as const;

/** The format the cases choose in the export dialog (`pbm-dialog-action-excel`). */
export const EXPORT_FORMAT = 'excel';
export const EXCEL_OFFERED = /Excel/i;

/** Literal messages (decision 2). */
export const EXPORTED_TOAST = 'Lookups exported.';
export const EXPORT_FAILED_TOAST = 'Failed to export lookups.';
export const NOTHING_TO_EXPORT = 'Nothing to export in the current view.';

/** The register's export endpoint (made to fail in 21139). */
export const EXPORT_ENDPOINT = '/api/Lookups/ExportLookups';
export const FAILED_STATUS = 500;

/** 21136 / 21137: a search term and an Advance Search filter that narrow the register. */
export const FILTER_SETUP = { search: 'Reason', code: 'Deactivation' } as const;

/** 21142: a filter that matches no list (21115's example term). */
export const NO_MATCH_TERM = 'zzzznotfound';

/** The number of predefined lists (AC). */
export const PREDEFINED_LIST_COUNT = 57;

/** 21140 (decision 6). */
export const NO_LOOKUP_RIGHTS = ['Users.GetUsers'] as const;
export const SORT_EXPORT_HOLDER_RIGHTS = ['Lookups.GetLookups', 'Lookups.GetLookup'] as const;

/** BLOCKED reasons decided at run time (decision 7). */
export const BLOCKED = {
  sameCreationDates: 'every lookup list in the register carries the same Created On (GetLookups createdOn), so a date order cannot be observed',
  sameModifiedDates: 'no two lookup lists differ in Last Modified (GetLookups modifiedOn is the same / empty on every list), so a Last Modified order cannot be observed',
} as const;
