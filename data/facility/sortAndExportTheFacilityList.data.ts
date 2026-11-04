/**
 * US 15134 "Sort and export the facility list" (facility folder 04), 13 cases.
 *
 * How the cases map onto the live list (2026-11-04, Facility-Foundation-Notes.md):
 *  - Sort is a "Sort By" MENU, not the column headers (as on the Policy list): a case's
 *    "click the <column> header" is that field's menu entry, "click it again" the
 *    opposite direction, and its "sort indicator" the menu's checked option. Options:
 *    Facility Name, Code, License Expiry Date, Status, Created On, Last Modified - NO
 *    Facility Type (17459 looks for one by the options' own ids - the finding).
 *  - "Status" sorts by the STORED (date) status, so a facility switched off (displayed
 *    Inactive) sits among the Active ones; 17460 checks the DISPLAYED statuses come out
 *    grouped and in A-Z / Z-A order (likely the finding). There is no "Suspended"
 *    status in the application (lookup: Future, Active, Inactive, Expired) - the case's
 *    four statuses are the four the application has.
 *  - Ordering is checked on the rows on screen; where boundaries matter (17458, 17460,
 *    17466) the case's own facilities share a token in their names, a keyword search
 *    lists exactly them, and their order is checked whole.
 *  - Export: the menu offers "Selected Export" (the current search / filters) and
 *    "Export All Data" (no filters), then the "Export Facilities" dialog: CSV / Excel.
 *    The file holds the WHOLE matching set, whatever the page. The case's "Export to
 *    CSV" with no filter (17461) is Export All Data; a filtered export (17462, 17463,
 *    17465, 17468) is Selected Export.
 *  - "150 facilities, page size 25" (17461, 17464) and "exactly 25 / 26" (17463) cannot
 *    be set on the shared register (10 rows a page, no page-size control): 17461 / 17464
 *    compare the file with the whole register at its real size; 17463 keeps its own
 *    numbers (2 and 4 matching facilities - the case's step text) with its own facilities.
 *  - Dates: the table shows DD/MM/YYYY, the CSV YYYY-MM-DD - compared as days.
 */

/** The export columns 17469 requires (and 17461's "all facility information"), case wording -> header pattern. */
export const EXPORT_COLUMNS: ReadonlyArray<[string, RegExp]> = [
  ['Name', /^facility name( \(english\))?$/i],
  ['Code', /^(facility )?code$/i],
  ['Type', /^facility type$/i],
  ['Licence Number', /^licen[cs]e (no\.?|number)$/i],
  ['Licence Expiry', /^licen[cs]e expiry( date)?$/i],
  ['Status', /^status$/i],
];

/** Header patterns used to read an export row. */
export const EXPORT_HEADER = {
  name: /^facility name( \(english\))?$/i,
  nameAr: /arabic/i,
  code: /^(facility )?code$/i,
  type: /^facility type$/i,
  licenceNo: /^licen[cs]e (no\.?|number)$/i,
  expiry: /^licen[cs]e expiry( date)?$/i,
  status: /^status$/i,
} as const;

/** The displayed statuses in A-Z order (17460). */
export const STATUS_ORDER = ['Active', 'Expired', 'Future', 'Inactive'] as const;

export const CASES = {
  byCode: { azureId: '17456' },
  byName: { azureId: '17457' },
  byExpiry: { azureId: '17458', expired: { start: '2025-01-01', expiry: '2026-01-01' }, future: { start: '2026-01-01', expiry: '2027-12-31' } },
  byType: { azureId: '17459' },
  byStatus: { azureId: '17460' },
  exportAllCsv: { azureId: '17461' },
  exportFiltered: { azureId: '17462', type: 'Hospital', status: 'Active' },
  selectedExportCounts: { azureId: '17463', first: 2, second: 4 },
  exportAllExcel: { azureId: '17464' },
  emptyExport: { azureId: '17465', keyword: 'NONEXISTENT999' },
  stableTies: { azureId: '17466', expiry: '2026-12-31', repeats: 3 },
  combinedSession: { azureId: '17468', firstStatus: 'Active', secondStatus: 'Expired' },
  exportColumns: { azureId: '17469' },
} as const;
