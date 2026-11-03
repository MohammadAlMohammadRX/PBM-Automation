import { FORMULARY_LIST, FORMULARY_VERSIONS } from '../ElementIds';

/**
 * Ids Writer C's formulary folders (06, 13, 14, 17, 19, 20, 22) need beyond
 * constants/ElementIds.ts. Kept apart so the three writers never edit the same
 * file (reports/formulary/Formulary-Writers-Brief.md).
 */

/**
 * A list row's Edit action - `formulary-list-table-row-{id}-edit`. NOT seen on
 * the live list (2026-11-02: View / Clone / Send for Approval / Deactivate /
 * Delete only), but US 15196 asks for one on a v0 draft, so its absence is
 * what 18646 / 18648 / 18649 test. The suffix follows the other row actions.
 */
export const FORMULARY_ROW_EDIT = {
  rowPrefix: `${FORMULARY_LIST.table}-row-`,
  suffix: 'edit',
} as const;

/**
 * The Version History advanced search (`formulary-detail-versions-advanced-search-*`).
 * Its field keys were NOT probed (Foundation notes, "Not exercised"), so a
 * criterion is found among the keys the drawer actually renders
 * (`-field-{key}-input`) by these patterns, the way the other modules' keys
 * read (`statusid`, `changetype`, `requestedby`, `daterange` ...).
 */
export const FORMULARY_VERSION_FILTER = {
  screen: FORMULARY_VERSIONS.advancedSearch.replace(/-advanced-search$/, ''),
  prefix: FORMULARY_VERSIONS.advancedSearch,
  searchButton: `${FORMULARY_VERSIONS.advancedSearch}-search-button`,
  cancelButton: `${FORMULARY_VERSIONS.advancedSearch}-cancel-button`,
  emptyState: `${FORMULARY_VERSIONS.table}-empty`,
  key: {
    approvalStatus: /status/i,
    changeType: /change/i,
    requestedBy: /request.*by|requester/i,
    reviewedBy: /review.*by|reviewer/i,
    requestedOn: /request.*(on|date)|date/i,
  },
} as const;

export type FormularyVersionFilterKey = keyof typeof FORMULARY_VERSION_FILTER.key;
