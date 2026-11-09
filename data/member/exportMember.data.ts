import type { MemberShape } from './memberPermissions.data';

/**
 * US 14381 "Export Member" (member folder 06), 8 cases.
 *
 * How the cases map onto the live list (2026-11-05, Member-Foundation-Notes.md):
 *  - Export is a MENU (Export Template, Selected Export = the current search /
 *    filters, Export All Data) then the format dialog "Export" (CSV (.csv) /
 *    Excel (.xlsx)) - picking a format starts the download. The case's "Click
 *    Export" is the menu, "Select Excel" the dialog's format, "Confirm" the
 *    download it starts. An unfiltered "Export" is Export All Data; a filtered
 *    one (19860 "Selected Excel", 19859) Selected Export.
 *  - The file holds the WHOLE matching set whatever the page (10 rows a page):
 *    Member Code + the 36 template columns (labels: "Saudi (SAU)", "Yes"/"No").
 *    "All member details shown in the list" = the list's columns (Name, Member
 *    ID, Document ID, Nationality, Mobile Number, Status) present as columns -
 *    EXPORT_COLUMNS below maps them onto the file's headers.
 *  - Record counts are compared with the register at the moment (GetMembers).
 *  - 19859 empty export: either the export is refused with a message, or a file
 *    with the headers only - both accepted (the case's "either").
 *  - 19862 "non-administrator user" = the Payer Admin shaped WITHOUT
 *    ExportMembers (shared memberRole); the administrator's Export is the
 *    baseline; the direct ExportMembers request must be refused too.
 *  - 19863 "several thousand records": about 100 suite members are imported for
 *    the case (`memberVolume(100)`, decision) and removed afterwards; the file
 *    must hold the whole register, the volume included.
 */
export const CASES = {
  allExcel: { azureId: '19856' },
  allCsv: { azureId: '19857' },
  allPagesExcel: { azureId: '19858' },
  emptyList: { azureId: '19859', keyword: 'ZZZNOTEXIST' },
  filtered: { azureId: '19860', status: 'Active' },
  columns: { azureId: '19861' },
  notAuthorised: { azureId: '19862', shape: { without: ['export'] } satisfies MemberShape },
  largeList: { azureId: '19863', volume: 100 },
} as const;

/** The list's columns, list wording -> the export header that carries them. */
export const EXPORT_COLUMNS: ReadonlyArray<[string, RegExp]> = [
  ['Name', /^(first|last) name \(english\)/i],
  ['Member ID', /^member (code|id)/i],
  ['Document ID', /^document id/i],
  ['Nationality', /^nationality/i],
  ['Mobile Number', /^mobile number/i],
  ['Status', /^(status|active)\b/i],
];

export const EXPORT_HEADER = {
  code: /^member (code|id)/i,
  active: /^(status|active)\b/i,
  lastName: /^last name \(english\)/i,
} as const;
