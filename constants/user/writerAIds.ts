/**
 * Writer A's extra ids for the User Management folders 01, 02, 03, 06 and 07
 * (reports/user/User-Writers-Brief.md). Every id below was read off the live
 * screens on 2026-11-08 (probe dumps in reports/user/probe/foundation-2026-11-08/:
 * p10-assign-picker.ids.txt, p6-users-sort.ids.txt, p6-users-advsearch.ids.txt,
 * p8-users-filtered.ids.txt). The foundation's `constants/user/userIds.ts`
 * holds the rest; these are the ones it does not name.
 */
export const WRITER_A_IDS = {
  /** The Assign Payers picker (inside `user-form-drawer`). */
  picker: {
    root: 'user-form-drawer-assign-payers-picklist',
    /** Items `...-source-item-{payerId}` / `...-target-item-{payerId}`. */
    sourceItemPrefix: 'user-form-drawer-assign-payers-picklist-source-item-',
    targetItemPrefix: 'user-form-drawer-assign-payers-picklist-target-item-',
    sourceSearch: 'user-form-drawer-assign-payers-picklist-source-search-input',
    targetSearch: 'user-form-drawer-assign-payers-picklist-target-search-input',
    /** "No results found." of the Available list (by analogy with the verified `-target-empty`; unverified). */
    sourceEmpty: 'user-form-drawer-assign-payers-picklist-source-empty',
    targetEmpty: 'user-form-drawer-assign-payers-picklist-target-empty',
    moveSelectedToTarget: 'user-form-drawer-assign-payers-picklist-move-selected-to-target',
    moveSelectedToSource: 'user-form-drawer-assign-payers-picklist-move-selected-to-source',
  },
  /** A table row of Users Administration: `user-list-table-row-{userId}`. */
  userRowPrefix: 'user-list-table-row-',
  /** Applied-filter chips: `user-list-filter-chips-chip-{key}` with `-remove`. */
  userChipPrefix: 'user-list-filter-chips-chip-',
  /** The Advance Search field wrappers `user-list-advanced-search-field-{key}` (label + control). */
  userAdvancedFieldPrefix: 'user-list-advanced-search-field-',
} as const;
