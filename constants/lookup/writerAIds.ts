/**
 * Writer A's extra ids for the Lookup Register (`lookup-list`, folders 01 and
 * 03 - reports/lookup/Lookup-Writers-Brief.md). The lead's verified ids are in
 * constants/lookup/lookupIds.ts; these are the ones it does not name.
 *
 * INFERRED, NOT YET VERIFIED LIVE (2026-11-09). The foundation probe saw only
 * the closed drawer host `lookup-list-advanced-search`, the sort trigger /
 * direction button and the export menu. Everything below is derived from the
 * SAME shared list component as verified on the User Management lists
 * (reports/user/probe/foundation-2026-11-08: `user-list-advanced-search-*`,
 * `user-list-filter-chips-chip-{key}-remove`, `user-list-search-clear-button`,
 * `user-list-sort-menu`, `user-list-sort-option-{key}` + `-sort-direction`) and
 * the Member / Facility lists (`-sort-option-{field}-{asc|desc}`). The helpers
 * in utils/lookup/writerAHelpers.ts therefore also look an element up by its id
 * PREFIX when the exact id is absent, so the first run names the real ids.
 */
const SCREEN = 'lookup-list';

export const WRITER_A_IDS = {
  /** The Advance Search drawer (host id verified; the inner ids are inferred). */
  advancedSearch: {
    root: `${SCREEN}-advanced-search`,
    title: `${SCREEN}-advanced-search-title`,
    close: `${SCREEN}-advanced-search-close`,
    /** Field wrappers `{fieldPrefix}{key}` (label + control); inputs `{fieldPrefix}{key}-input`. */
    fieldPrefix: `${SCREEN}-advanced-search-field-`,
    /** Inferred field inputs (model property, lower-cased - as the column keys `code`, `englishname`, `arabicname`). */
    field: {
      code: `${SCREEN}-advanced-search-field-code-input`,
      englishName: `${SCREEN}-advanced-search-field-englishname-input`,
      arabicName: `${SCREEN}-advanced-search-field-arabicname-input`,
    },
    /** Fallback: the fragment a field input's id carries when its exact id differs. */
    fieldFragment: { code: 'code', englishName: 'english', arabicName: 'arabic' },
    search: `${SCREEN}-advanced-search-search-button`,
    cancel: `${SCREEN}-advanced-search-cancel-button`,
  },
  /** Applied-filter chips: `{chipPrefix}{key}` with `-remove` (inferred). */
  chips: `${SCREEN}-filter-chips`,
  chipPrefix: `${SCREEN}-filter-chips-chip-`,
  /** "Clear" beside the search box - shown while a search / filter is applied (inferred). */
  clearAll: `${SCREEN}-search-clear-button`,
  /** The Sort By menu and its options `{sortOptionPrefix}{key}` or `{sortOptionPrefix}{field}-{asc|desc}` (inferred). */
  sortMenu: `${SCREEN}-sort-menu`,
  sortOptionPrefix: `${SCREEN}-sort-option-`,
  /** The table's empty row (ListPageBase convention) - and the id-less placeholder block class some lists render instead. */
  tableEmpty: `${SCREEN}-table-empty`,
  placeholderClass: `${SCREEN}__placeholder`,
  /** A register row and its actions container: `{rowPrefix}{lookupId}` / `{rowPrefix}{lookupId}-actions`. */
  rowPrefix: `${SCREEN}-table-row-`,
  /** Header cells `{headerPrefix}{columnKey}` (verified: code, englishname, arabicname, actions). */
  headerPrefix: `${SCREEN}-table-th-`,
  /** An Add control on the register would follow the shared shape (none was seen - 21116 asserts its absence). */
  addButton: `${SCREEN}-add-button`,
  /** The side-menu link to the register (verified in the foundation) and its System Settings group toggle. */
  menuLink: 'app-nav-system-settings-lookup-management-link',
  menuGroupToggle: 'app-nav-system-settings-toggle',
  /** The breadcrumb's last crumb on the items screen. */
  breadcrumbCurrent: 'app-breadcrumb-current',
} as const;

/**
 * The Sort By option ids to try, in order, per field and direction (inferred).
 * The User-list shape names FIELDS (`code`, `newest`, `oldest`, `modifiedon`)
 * and reverses them with the direction button; the Member-list shape names
 * field + direction (`code-asc`). The helper clicks the first that exists,
 * then flips with `lookup-list-sort-direction` when the request went the other way.
 */
export const SORT_OPTION_CANDIDATES = {
  code: { asc: ['code-asc', 'code'], desc: ['code-desc', 'code'] },
  englishName: { asc: ['englishname-asc', 'englishname', 'englishName'], desc: ['englishname-desc', 'englishname', 'englishName'] },
  arabicName: { asc: ['arabicname-asc', 'arabicname', 'arabicName'], desc: ['arabicname-desc', 'arabicname', 'arabicName'] },
  createdOn: { asc: ['createdon-asc', 'oldest', 'createdon'], desc: ['createdon-desc', 'newest', 'createdon'] },
  modifiedOn: { asc: ['modifiedon-asc', 'modifiedon'], desc: ['modifiedon-desc', 'modifiedon'] },
} as const;

/** Fallback when no candidate id is offered: an option whose key carries this fragment. */
export const SORT_FIELD_FRAGMENT = {
  code: 'code',
  englishName: 'english',
  arabicName: 'arabic',
  createdOn: 'created',
  modifiedOn: 'modified',
} as const;

export type LookupSortField = keyof typeof SORT_OPTION_CANDIDATES;
export type LookupAdvancedField = keyof typeof WRITER_A_IDS.advancedSearch.field;
