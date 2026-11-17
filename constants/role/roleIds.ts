/**
 * Role Management (Feature 21279) - every id of System Settings > Role Administration, read off the
 * live screens by the read-only probe and the foundation probe of 2026-11-14
 * (reports/role/probe/live-2026-11-14 and reports/role/probe/foundation-2026-11-14). Ids that carry a
 * role GUID are builders.
 *
 * Screen: /system-settings/role-administration (AppRoutes.roleAdministration).
 *
 * NO ID (addressed with a `locator-exception`, scoped to an id'd container - see the page objects):
 *  - the empty list text "No roles found." (`.role-list__placeholder` inside `role-list`);
 *  - the "Predefined role" badge inside the name cell / card title;
 *  - every permission-tree checkbox: the app gives ALL of them the same id
 *    `role-form-drawer-arabic-description-checkbox` (a defect); tree rows are `.role-dialog__node`;
 *  - the tree messages "Select at least one privilege." / "No privileges match the search.";
 *  - the View Role read-only values (`.role-dialog__view-row` label/value pairs).
 */

export const ROLE_ROUTE = '/system-settings/role-administration';

/** Fixed ids of the list screen. */
export const ROLE_LIST_IDS = {
  root: 'role-list',
  toolbar: 'role-list-toolbar',
  search: 'role-list-search',
  searchInput: 'role-list-search-input',
  /** The (x) inside the box and the "Clear" text button - both appear once text is typed. */
  searchClearIcon: 'role-list-search-clear-icon',
  searchClearButton: 'role-list-search-clear-button',
  /** Opens the "Advance Search for Roles" drawer. */
  filterButton: 'role-list-search-filter-button',
  /** Chips under the toolbar once a search / filter is applied: `-chip-search`, `-chip-<field>` + `-remove`. */
  chips: 'role-list-filter-chips',
  sort: 'role-list-sort',
  sortTrigger: 'role-list-sort-trigger',
  sortMenu: 'role-list-sort-menu',
  sortDirection: 'role-list-sort-direction',
  export: 'role-list-export',
  exportTrigger: 'role-list-export-trigger',
  exportMenu: 'role-list-export-menu',
  exportSelected: 'role-list-export-selected',
  exportAll: 'role-list-export-all',
  /** A p-button host: click through buttonSelector(). */
  addButton: 'role-list-add-button',
  table: 'role-list-table',
  tableEl: 'role-list-table-el',
  tableHead: 'role-list-table-head',
  tableBody: 'role-list-table-body',
  tableFooter: 'role-list-table-footer',
  pager: 'role-list-table-pager',
  pagerPrev: 'role-list-table-pager-prev',
  pagerNext: 'role-list-table-pager-next',
  /** Cards view container (breadcrumb toggle). */
  cards: 'role-list-cards',
  rowPrefix: 'role-list-table-row-',
  cardPrefix: 'role-card-',
} as const;

/** Sort menu option keys (`role-list-sort-option-<key>`) and the `sortBy` each sends (GetRoles). */
export const ROLE_SORT_OPTION = {
  newest: 'CreatedOn desc',
  oldest: 'CreatedOn asc',
  rolename: 'RoleNameEn',
  description: 'DescriptionEn',
  status: 'Status',
  modifiedon: 'ModifiedOn',
} as const;
export type RoleSortKey = keyof typeof ROLE_SORT_OPTION;

/** Table columns (`role-list-table-th-<key>`, cells `-cell-<key>`). NO Role ID column. */
export type RoleColumn = 'name' | 'description' | 'status';
/** Row actions (`role-list-table-row-<id>-<action>`); `toggle-active` reads "Activate" / "Inactivate". */
export type RoleRowAction = 'view' | 'edit' | 'toggle-active' | 'delete';
/** Card actions (`role-card-<id>-<action>-button`, p-button hosts). Cards have NO toggle-active and NO status. */
export type RoleCardAction = 'view' | 'edit' | 'delete';

export const ROLE_ROW = {
  row: (id: string): string => `role-list-table-row-${id}`,
  cell: (id: string, column: RoleColumn): string => `role-list-table-row-${id}-cell-${column}`,
  statusBadge: (id: string): string => `role-list-table-row-${id}-status-badge`,
  actions: (id: string): string => `role-list-table-row-${id}-actions`,
  /** A plain <button>; DISABLED (not absent) for toggle-active / delete on a predefined row. */
  action: (id: string, action: RoleRowAction): string => `role-list-table-row-${id}-${action}`,
} as const;

export const ROLE_CARD = {
  card: (id: string): string => `role-card-${id}`,
  header: (id: string): string => `role-card-${id}-header`,
  title: (id: string): string => `role-card-${id}-title`,
  body: (id: string): string => `role-card-${id}-body`,
  name: (id: string): string => `role-card-${id}-name`,
  nameLabel: (id: string): string => `role-card-${id}-name-label`,
  description: (id: string): string => `role-card-${id}-description`,
  descriptionLabel: (id: string): string => `role-card-${id}-description-label`,
  footer: (id: string): string => `role-card-${id}-footer`,
  /** p-button host. Delete is ABSENT on a predefined card. */
  action: (id: string, action: RoleCardAction): string => `role-card-${id}-${action}-button`,
} as const;

export const ROLE_PAGER = {
  page: (n: number): string => `role-list-table-pager-page-${n}`,
} as const;

/** The breadcrumb view toggle (shared app component). */
export const ROLE_VIEW_TOGGLE = {
  root: 'app-breadcrumb-view-toggle',
  table: 'app-breadcrumb-view-toggle-table',
  cards: 'app-breadcrumb-view-toggle-cards',
} as const;

/** "Advance Search for Roles" drawer: tabs Search / Display Settings. */
export const ROLE_FILTER = {
  drawer: 'role-list-advanced-search',
  title: 'role-list-advanced-search-title',
  close: 'role-list-advanced-search-close',
  tabs: 'role-list-advanced-search-tabs',
  tabSearch: 'role-list-advanced-search-tab-search',
  tabDisplay: 'role-list-advanced-search-tab-display',
  body: 'role-list-advanced-search-body',
  nameInput: 'role-list-advanced-search-field-name-input',
  descriptionInput: 'role-list-advanced-search-field-description-input',
  /** p-select: options Active / Inactive. */
  statusSelect: 'role-list-advanced-search-field-status-input',
  /** p-button hosts. The search button reads "Search" on the Search tab and "Apply" on Display Settings. */
  cancelButton: 'role-list-advanced-search-cancel-button',
  searchButton: 'role-list-advanced-search-search-button',
  // Display Settings tab
  pageSizeInput: 'role-list-advanced-search-display-page-size-input',
  pageSizePreset: (n: 5 | 10 | 20 | 30 | 50): string => `role-list-advanced-search-display-page-size-preset-${n}`,
  defaultSortTrigger: 'role-list-advanced-search-display-default-sort-control-trigger',
  defaultSortDirection: 'role-list-advanced-search-display-default-sort-control-direction',
  /** Columns name / description / status; `-visible` checkbox (name is disabled = always shown), `-handle` drag. */
  columnVisible: (key: RoleColumn): string => `role-list-advanced-search-display-column-${key}-visible`,
  columnHandle: (key: RoleColumn): string => `role-list-advanced-search-display-column-${key}-handle`,
  reset: 'role-list-advanced-search-display-reset',
} as const;

/** Add / Edit / View drawer (one component; the title says which). */
export const ROLE_FORM_IDS = {
  root: 'role-form-drawer',
  title: 'role-form-drawer-title',
  close: 'role-form-drawer-close',
  stepper: 'role-form-drawer-stepper',
  step: (n: 1 | 2): string => `role-form-drawer-stepper-step-${n}`,
  stepBullet: (n: 1 | 2): string => `role-form-drawer-stepper-step-${n}-bullet`,
  stepLabel: (n: 1 | 2): string => `role-form-drawer-stepper-step-${n}-label`,
  /** Edit of a PREDEFINED role only: "This is a predefined role. ..." */
  predefinedNote: 'role-form-drawer-predefined-note',
  // step 1 "Role Information"
  englishName: 'role-form-drawer-english-name-input',
  arabicName: 'role-form-drawer-arabic-name-input',
  /** The multiselect's hidden accessibility <input>; click the `.p-multiselect` host (multiselectControl()). */
  assignableRoles: 'role-form-drawer-assignable-role-ids-multiselect',
  englishDescription: 'role-form-drawer-english-description-input',
  arabicDescription: 'role-form-drawer-arabic-description-input',
  isActive: 'role-form-drawer-is-active-checkbox',
  hasAssignedPayers: 'role-form-drawer-has-assigned-payers-checkbox',
  canApproveOwnRequests: 'role-form-drawer-can-approve-own-requests-checkbox',
  /** `<small>` field errors ("This field is required."). */
  englishNameError: 'role-form-drawer-english-name-error',
  arabicNameError: 'role-form-drawer-arabic-name-error',
  assignableRolesError: 'role-form-drawer-assignable-role-ids-error',
  // footer (p-button hosts)
  cancelButton: 'role-form-drawer-cancel-button',
  nextButton: 'role-form-drawer-next-button',
  backButton: 'role-form-drawer-back-button',
  saveButton: 'role-form-drawer-save-button',
  // step 2 "Privileges" (also the lower half of View Role)
  permissionSearch: 'role-form-drawer-permission-search-input',
  expandAll: 'role-form-drawer-permission-expand-all',
  collapseAll: 'role-form-drawer-permission-collapse-all',
  /** The DUPLICATED id every tree checkbox carries (defect) - never address a node by it. */
  duplicatedTreeCheckboxId: 'role-form-drawer-arabic-description-checkbox',
} as const;

/**
 * The expand/collapse chevron of a tree BRANCH: `role-form-drawer-permission-toggle-<key lower-cased, dots as dashes>`,
 * e.g. `Roles` -> `...-toggle-roles`, `Roles.GetRoles` -> `...-toggle-roles-getroles`,
 * `ApprovalManagement.Payer` -> `...-toggle-approvalmanagement-payer`. Leaves have NO id.
 * The synthetic "Bulk import" folders are `...-toggle-bulk-folder-<module>` (not in the API catalogue).
 * `aria-expanded` = "true" / "false".
 */
export const permissionToggleId = (key: string): string => `role-form-drawer-permission-toggle-${key.toLowerCase().replace(/\./g, '-')}`;
export const bulkFolderToggleId = (moduleKey: string): string => `role-form-drawer-permission-toggle-bulk-folder-${moduleKey.toLowerCase()}`;

/** Deactivate drawer (Inactivate on an ACTIVE role). */
export const ROLE_DEACTIVATE_IDS = {
  root: 'role-deactivate-drawer',
  title: 'role-deactivate-drawer-title',
  close: 'role-deactivate-drawer-close',
  body: 'role-deactivate-drawer-body',
  warning: 'role-deactivate-drawer-warning',
  /** p-select (click it, then pick a `getByRole('option')`). */
  reasonSelect: 'role-deactivate-drawer-reason-select',
  reasonError: 'role-deactivate-drawer-reason-error',
  /** textarea, maxlength 500. */
  detailsInput: 'role-deactivate-drawer-details-input',
  detailsError: 'role-deactivate-drawer-details-error',
  cancelButton: 'role-deactivate-drawer-cancel-button',
  confirmButton: 'role-deactivate-drawer-confirm-button',
} as const;

/**
 * Activate (on an INACTIVE role) and Delete both use the SHARED `pbm-dialog` (constants/ElementIds DIALOG /
 * DIALOG_ACTION): title `pbm-dialog-title`, text `pbm-dialog-message`, buttons `pbm-dialog-action-cancel` /
 * `pbm-dialog-action-confirm` (p-button hosts). `pbm-delete-confirm-dialog-host` exists but stays EMPTY.
 */
export const ROLE_DIALOG = {
  root: 'pbm-dialog',
  title: 'pbm-dialog-title',
  message: 'pbm-dialog-message',
  close: 'pbm-dialog-close-button',
  cancel: 'pbm-dialog-action-cancel',
  confirm: 'pbm-dialog-action-confirm',
  /** The drawer-close guard ("Unsaved Changes"). */
  stay: 'pbm-dialog-action-stay',
  discard: 'pbm-dialog-action-discard',
} as const;

/** Toasts (shared): `pbm-toast` (stacks; same id on each), `pbm-toast-summary`, `pbm-toast-detail`. */
export const ROLE_TOAST = {
  root: 'pbm-toast',
  summary: 'pbm-toast-summary',
  detail: 'pbm-toast-detail',
} as const;
