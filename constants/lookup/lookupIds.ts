/**
 * Lookups Management (Feature 20852) - element ids verified on the live screens
 * 2026-11-09 (reports/lookup/Lookup-Foundation-Notes.md).
 *
 * Both screens use the shared list shape (pages/components/ListPageBase):
 *   register  `lookup-list-*`   System Settings > Lookups (/system-settings/lookup-management)
 *   items     `lookup-items-*`  /system-settings/lookup-management/<list code>
 * Rows are `<screen>-table-row-<id>`, cells `...-cell-<key>`, actions `...-<action>`.
 */

export const LOOKUP_REGISTER = {
  screen: 'lookup-list',
  searchInput: 'lookup-list-search-input',
  /** Opens the Advance Search drawer. */
  filterButton: 'lookup-list-search-filter-button',
  sortTrigger: 'lookup-list-sort-trigger',
  sortDirection: 'lookup-list-sort-direction',
  exportTrigger: 'lookup-list-export-trigger',
  exportMenu: 'lookup-list-export-menu',
  exportSelected: 'lookup-list-export-selected',
  exportAll: 'lookup-list-export-all',
  /** Columns: code, englishname, arabicname, actions. Row action: `view`. */
  column: { code: 'code', englishName: 'englishname', arabicName: 'arabicname' },
} as const;

export const LOOKUP_ITEMS = {
  screen: 'lookup-items',
  searchInput: 'lookup-items-search-input',
  filterButton: 'lookup-items-search-filter-button',
  /** The Advance Search drawer (its inner ids were not opened in the foundation). */
  advancedSearch: 'lookup-items-advanced-search',
  exportTrigger: 'lookup-items-export-trigger',
  addButton: 'lookup-items-add-button',
  /** Columns: code, englishname, arabicname, index (Order), status (Active), predefined. Row actions: `edit`, `delete`. */
  column: { code: 'code', englishName: 'englishname', arabicName: 'arabicname', order: 'index', status: 'status', predefined: 'predefined' },
  /** Per-row extras: `<row>-status-badge`, `<row>-predefined`. */
  statusBadge: (rowId: string): string => `lookup-items-table-row-${rowId}-status-badge`,
  predefinedBadge: (rowId: string): string => `lookup-items-table-row-${rowId}-predefined`,
} as const;

/** The Add / Edit Lookup Item drawer. Inputs show the placeholder "Enter value"; Display Order starts at "0"; Is Active starts ticked. */
export const LOOKUP_ITEM_DRAWER = {
  drawer: 'lookup-item-form-drawer',
  title: 'lookup-item-form-drawer-title',
  close: 'lookup-item-form-drawer-close',
  code: 'lookup-item-form-drawer-code-input',
  englishName: 'lookup-item-form-drawer-english-name-input',
  arabicName: 'lookup-item-form-drawer-arabic-name-input',
  order: 'lookup-item-form-drawer-index-input',
  isActive: 'lookup-item-form-drawer-is-active-checkbox',
  cancel: 'lookup-item-form-drawer-cancel-button',
  save: 'lookup-item-form-drawer-save-button',
} as const;
