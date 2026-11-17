/**
 * US 20857 "Export Lookup Items" (lookup folder 05, 11 cases 21154-21164).
 *
 * How it works in this build (reports/lookup/Lookup-Foundation-Notes.md): a
 * list's items screen (/system-settings/lookup-management/<code>) has Export
 * (`lookup-items-export-trigger`). Its menu ids and the format prompt are
 * INFERRED from the register and the other modules (constants/lookup/writerCIds.ts).
 * GET /api/Lookups/Items/<code> returns every item (inactive ones included) and
 * is the reference the file is compared with.
 *
 * SAFETY: only suite items (`suiteLookupItems.create(HOME_LIST)`, code
 * `QA-AUTO-...`) are created, as the unique search term of the filter cases
 * (21155 / 21157); teardown deletes them. Nothing else is changed.
 *
 * Literal readings / TC-vs-AC decisions (the test case wins):
 * - Story description says "CSV or Excel"; the AC and 21159 / 21164 say Excel
 *   only. The TC wins: the format prompt must offer exactly FORMATS_OFFERED.
 * - Messages: the AC's "Lookups exported." / "Failed to export lookups." are
 *   the register's wording reused for one list's items; asserted literally
 *   (lead decision 2) as a toast's summary, detail or "summary - detail".
 * - "Selected Export" = the rows on screen after the search (21155), or the page
 *   on screen when nothing is filtered (21156): the file's codes must equal the
 *   codes rendered on screen. "Export All Data" (21154 / 21157) must equal GET
 *   Items (every item, whatever the search).
 * - 21158: the TC names the columns "Code, Name (English), Name (Arabic),
 *   Display Order, Status, Predefined"; the AC "code, English name, Arabic name,
 *   order, status and Predefined". Headers are matched by meaning
 *   (EXPORT_COLUMNS), and every row's values are compared with the API item
 *   (order: 0 may be written 0, empty or "—"; status Active/Inactive or Yes/No).
 * - 21160: the search term is the TC's example "zzzznotfound" (matches no item).
 * - 21161: lead decision 4 - ExportLookupItems answers 500 in the test's own
 *   window (`page.route`), then the message and "no file" are asserted.
 * - 21162: "not a System Administrator" = a suite role WITHOUT
 *   Lookups.ExportLookupItems that can still read lookups (RESTRICTED_RIGHTS);
 *   baseline first - the administrator is offered Export on the same list.
 *   Step 1's "inaccessible or read-only/limited" = no items table, or a table
 *   without Add Item.
 * - 21163: a list with exactly one item is looked up through the API at run
 *   time (every register list); none -> BLOCKED (SINGLE_ITEM_BLOCK). The suite
 *   cannot build one: every list holds predefined items.
 */

/** The suite's home list for its own items (lead default). */
export const HOME_LIST = 'userDeactivationReason';
/** The second list, when a case needs one (not used by folder 05). */
export const SECOND_LIST = 'roleDeactivationReason';

export const CASES = {
  exportAll: { azureId: '21154' },
  selectedFiltered: { azureId: '21155' },
  selectedPage: { azureId: '21156' },
  allIgnoresFilter: { azureId: '21157' },
  columns: { azureId: '21158' },
  scopeBeforeFormat: { azureId: '21159' },
  nothingToExport: { azureId: '21160' },
  exportFails: { azureId: '21161' },
  notAdmin: { azureId: '21162' },
  singleItem: { azureId: '21163' },
  excelOnly: { azureId: '21164' },
} as const;

export const MESSAGES = {
  exported: 'Lookups exported.',
  failed: 'Failed to export lookups.',
  nothingToExport: 'Nothing to export in the current view.',
} as const;

/** The scope menu's two choices, as the AC and cases quote them. */
export const SCOPE_LABELS = { selected: 'Selected Export', all: 'Export All Data' } as const;

/** The only format the prompt may offer (dialog action keys, dismissals excluded). */
export const FORMATS_OFFERED = ['excel'] as const;

/** A search that matches no item (21160). */
export const NO_MATCH_TERM = 'zzzznotfound';

/** The six columns of the file (AC / 21158), matched by meaning. */
export const EXPORT_COLUMNS: ReadonlyArray<readonly [name: string, header: RegExp]> = [
  ['Code', /^code$/i],
  ['Name (English)', /english/i],
  ['Name (Arabic)', /arabic|الاسم/i],
  ['Display Order', /order|index/i],
  ['Status', /^(status|active|is active)$/i],
  ['Predefined', /predefined/i],
];

/** 21162: reads lookups, cannot export them. */
export const RESTRICTED_RIGHTS = ['Lookups.GetLookups', 'Lookups.GetLookup'] as const;

export const SINGLE_ITEM_BLOCK = 'no lookup list holds exactly one item (GET /api/Lookups/Items for every list of the register), and the suite '
  + 'cannot build one: every list holds predefined items, which the suite must never change';
