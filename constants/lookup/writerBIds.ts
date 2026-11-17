/**
 * Writer B ids - Lookups Management folders 02 (View Lookup Item List, US 20854)
 * and 04 (Search and Filter Lookup Items, US 20856).
 *
 * VERIFIED live 2026-11-09 (reports/lookup/probe/foundation-2026-11-09/p3-items.ids.txt):
 *   the breadcrumb ids, the header title, the table's empty / pager ids shape and
 *   the per-row `-actions` container.
 *
 * INFERRED, NOT YET VERIFIED LIVE: everything under LOOKUP_ITEMS_ADVANCED and
 * LOOKUP_ITEMS_CHIPS. The foundation saw the drawer host `p-drawer#lookup-items-advanced-search`
 * but never opened it. Its inner ids follow the shared Advance Search component
 * as seen on the User / Facility / Terminology lists:
 *   `{root}-title`, `{root}-close`, `{root}-search-button`, `{root}-cancel-button`,
 *   fields `{root}-field-{key}-input`, chips `{screen}-filter-chips-chip-{key}` + `-remove`.
 * Field keys are the model property in lower case; where the property name is
 * not certain, each field lists its candidate keys (the first one present wins).
 * The first live run that opens the drawer corrects this file.
 */

/** The Advance Search drawer of the Lookup Items screen (INFERRED, not yet verified live). */
export const LOOKUP_ITEMS_ADVANCED = {
  root: 'lookup-items-advanced-search',
  title: 'lookup-items-advanced-search-title',
  close: 'lookup-items-advanced-search-close',
  /** p-button hosts: click the inner button (buttonSelector). */
  search: 'lookup-items-advanced-search-search-button',
  cancel: 'lookup-items-advanced-search-cancel-button',
  fieldPrefix: 'lookup-items-advanced-search-field-',
  /** Candidate field keys (`{fieldPrefix}{key}-input`). code / names are text boxes; status / predefined are selects. */
  field: {
    code: ['code'],
    englishName: ['englishname', 'nameen'],
    arabicName: ['arabicname', 'namear'],
    status: ['isactive', 'status'],
    predefined: ['predefined', 'ispredefined'],
  },
  /** The fields driven as PrimeNG selects (options chosen by label). */
  selects: ['status', 'predefined'],
} as const;

export type ItemFilterField = keyof typeof LOOKUP_ITEMS_ADVANCED.field;

/** Advance Search criteria by field: text for code / names, the option label for status / predefined. */
export type ItemFilters = Partial<Record<ItemFilterField, string>>;

/** Applied-filter chips (INFERRED, not yet verified live). */
export const LOOKUP_ITEMS_CHIPS = {
  root: 'lookup-items-filter-chips',
  chipPrefix: 'lookup-items-filter-chips-chip-',
  removeSuffix: '-remove',
} as const;

/** The Lookup Items table's own ids beyond lookupIds.ts (shape verified live on the probe). */
export const LOOKUP_ITEMS_VIEW = {
  section: 'lookup-items',
  table: 'lookup-items-table-el',
  /** The shared table's empty row (`{screen}-table-empty`); some lists show an id-less placeholder block instead. */
  tableEmpty: 'lookup-items-table-empty',
  /** Class of the id-less empty block, by the User module's convention (`{screen}__placeholder`) - INFERRED. */
  placeholderClass: 'lookup-items__placeholder',
  pagerNext: 'lookup-items-table-pager-next',
  pagerPagePrefix: 'lookup-items-table-pager-page-',
  rowPrefix: 'lookup-items-table-row-',
  /** `{rowPrefix}{itemId}-actions` - the row's action container (verified). */
  actionsSuffix: '-actions',
  thPrefix: 'lookup-items-table-th-',
} as const;

/** App chrome on the items screen (verified live). Two spans share `app-breadcrumb-current`: "System Settings" and the list's name (last). */
export const LOOKUP_CHROME = {
  breadcrumbList: 'app-breadcrumb-list',
  breadcrumbCurrent: 'app-breadcrumb-current',
  lookupsCrumb: 'app-breadcrumb-link-system-settings-lookup-management',
} as const;
