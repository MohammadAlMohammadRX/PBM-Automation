/**
 * Writer A's extra ids for Role Administration (folders 01 Sort and Export, 03 View Role List, 08 Search and
 * Filter - reports/role/Role-Writers-Brief.md). The lead's verified ids are in constants/role/roleIds.ts; these
 * are the ones it does not name. All were read off the live probes of 2026-11-14
 * (reports/role/probe/live-2026-11-14/01-list.ids.txt, 04-advanced.ids.txt; the menu link from
 * reports/lookup/probe/foundation-2026-11-09/p0-nav.txt).
 */

export const WRITER_A_IDS = {
  /** Side menu: the System Settings group (li), its toggle (button) and the Role Administration link. */
  nav: {
    group: 'app-nav-system-settings',
    groupToggle: 'app-nav-system-settings-toggle',
    roleAdministrationLink: 'app-nav-system-settings-role-administration-link',
  },
  /** Table header cells `role-list-table-th-<column>` (name / description / status / actions). */
  tableHeader: (column: 'name' | 'description' | 'status' | 'actions'): string => `role-list-table-th-${column}`,
  /** Advance Search field wrappers `role-list-advanced-search-field-<key>` (+ `-input`). */
  advancedFieldPrefix: 'role-list-advanced-search-field-',
  /** The shared export FORMAT dialog's choices (`pbm-dialog-action-<format>`, p-button hosts). */
  exportFormat: (format: 'excel' | 'csv'): string => `pbm-dialog-action-${format}`,
  /** The app's page outlet (what a refused route shows instead of the list). */
  outlet: 'app-layout-outlet',
} as const;
