import type { ItemFilters } from '../../constants/lookup/writerBIds';

/**
 * US 20856 "Search and Filter Lookup Items" (lookup folder 04), 11 cases (21143-21153).
 *
 * How the cases map onto the live screen (2026-11-09, Lookup-Foundation-Notes.md):
 *  - "Navigate to the Lookups Management module - the Lookup Items screen loads"
 *    opens the home list HOME_LIST (viewLookupItemList.data) directly.
 *  - Search = the toolbar box `lookup-items-search-input`. Advance Search = the
 *    drawer `lookup-items-advanced-search` (Code, English Name, Arabic Name,
 *    Active / Inactive, Predefined Yes / No - AC). Its inner ids were never
 *    opened: they are INFERRED in constants/lookup/writerBIds.ts.
 *  - GET /api/Lookups/Items/<list> returns every item, so the result the screen
 *    should show is computed from it with the same criterion (text: contains,
 *    ignoring case; status / predefined: the flag) and compared with the rows of
 *    EVERY page of the grid. Leftovers of other runs are therefore harmless.
 *  - The TC's example values (Code "GEN01", "MED-01", "zzzznotfound") are examples
 *    (lead decision 1): the code / names used are those of the suite items the
 *    case creates; the no-match term is the TC's own NO_MATCH_TERM.
 *  - Chips (21150, 21151, 21153): one chip per applied filter, each with a remove
 *    control; a chip "is" a filter when its text carries the filter's value.
 *  - 21153 (exploratory) is the scripted sequence RAPID_SEQUENCE, each operation
 *    straight after the previous one; after each, the chips and the grid must
 *    match the filters then applied.
 */
export const CASES = {
  keyword: { azureId: '21143' },
  noMatch: { azureId: '21144' },
  byCode: { azureId: '21145' },
  byStatus: { azureId: '21146' },
  byNames: { azureId: '21147' },
  byPredefined: { azureId: '21148' },
  combined: { azureId: '21149' },
  chips: { azureId: '21150' },
  removeChip: { azureId: '21151' },
  specialAndBlank: { azureId: '21152' },
  rapid: { azureId: '21153' },
} as const;

/** 21144: a term that matches no code or name (the TC's own example). */
export const NO_MATCH_TERM = 'zzzznotfound';

/** 21152: the TC's special characters. */
export const SPECIAL_TERM = '%*<';

/** The labels of the select options (AC: Active / Inactive, Yes / No). */
export const OPTION = {
  active: 'Active',
  inactive: 'Inactive',
  yes: 'Yes',
  no: 'No',
} as const;

/** 21149's test data: Active = Active; Predefined = No. */
export const COMBINED_FILTERS: ItemFilters = { status: OPTION.active, predefined: OPTION.no };

/** 21153: set a filter (merged into the applied ones) or remove one by its chip. */
export type RapidOperation = { set: ItemFilters } | { removeChip: 'status' | 'predefined' };

export const RAPID_SEQUENCE: readonly RapidOperation[] = [
  { set: { status: OPTION.inactive } },
  { set: { status: OPTION.active } },
  { removeChip: 'status' },
  { set: { predefined: OPTION.yes } },
  { set: { predefined: OPTION.no } },
  { set: { status: OPTION.inactive } },
  { removeChip: 'predefined' },
  { removeChip: 'status' },
];

/** The "no matching records" message (21144). */
export const NO_RESULTS_MESSAGE = /no .*(found|items|values|records|results|match)/i;

/** A toast / page text that reports an application error (21152). */
export const ERROR_TEXT = /error|exception|went wrong|failed/i;
