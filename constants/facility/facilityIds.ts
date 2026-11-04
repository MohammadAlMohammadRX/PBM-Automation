import type { AuditTabIds, InactivateDialogIds } from '../ElementIds';
import { AUDIT_ENTRY_DRAWER } from '../ElementIds';

/**
 * Element ids of the Facility module (Feature 15130, `/facility-management`).
 *
 * Every id below was read off the live screens on 2026-11-04 (probe dumps in
 * reports/facility/probe/ and the foundation run, see
 * reports/facility/Facility-Foundation-Notes.md) and cross-checked against the
 * application bundle (chunk-3GAWWUPF: the list, form drawer, detail, map and
 * card components). Ids only - no labels, no classes. The shared conventions
 * hold: `{screen}-table-row-{facilityId}-cell-{key}`, `-{action}` row buttons,
 * `{screen}-table-pager-*`, the shared `#pbm-dialog` for confirmations.
 */

// ---- List -------------------------------------------------------------------------

/** The list screen (`facility-list`): KPI tiles, toolbar, table / cards. */
export const FACILITY_LIST = {
  /** The screen namespace ListPageBase builds rows, cells, pager and search from. */
  screen: 'facility-list',
  /** The KPI band - absent without Facilities.GetFacilitiesDashboard. */
  kpiBand: 'facility-list-kpis',
  /**
   * The five tiles, each with `-label` and `-value` children. The values COUNT
   * UP from 0 after GetFacilitiesDashboard answers - read a settled value.
   * Labels (2026-11-04): Total Facilities, Active Facilities, Future Facilities
   * (the AC says "Pending"; the key is `pending`), Inactive Facilities, Expired Licences.
   */
  kpi: {
    total: 'facility-list-kpi-total',
    active: 'facility-list-kpi-active',
    pending: 'facility-list-kpi-pending',
    inactive: 'facility-list-kpi-inactive',
    expired: 'facility-list-kpi-expired',
  },
  toolbar: 'facility-list-toolbar',
  searchInput: 'facility-list-search-input',
  /** The X inside the search box. */
  searchClearIcon: 'facility-list-search-clear-icon',
  /** "Clear" beside the box - shown while any filter / search is applied; clears them all. */
  searchClearAll: 'facility-list-search-clear-button',
  /** Opens the Advance Search drawer (`facility-list-advanced-search`). */
  searchFilterButton: 'facility-list-search-filter-button',
  /** Quick filters (`p-select` comboboxes): All Types / All Statuses. */
  filter: {
    type: 'facility-list-filter-type-select',
    status: 'facility-list-filter-status-select',
  },
  /** The applied-filter chips: `-chip-{search|type|status|providerType}` with `-remove`. */
  chips: 'facility-list-filter-chips',
  sortTrigger: 'facility-list-sort-trigger',
  /** Sort options `facility-list-sort-option-{field}-{asc|desc}` (FACILITY_SORT_FIELD); the active one carries aria-checked="true". */
  sortOptionPrefix: 'facility-list-sort-option-',
  /** Needs Facilities.CreateFacility. */
  addButton: 'facility-list-add-button',
  table: 'facility-list-table-el',
  tableBody: 'facility-list-table-body',
  /** The table's empty row: "No results found." */
  tableEmpty: 'facility-list-table-empty',
  pager: 'facility-list-table-pager',
  /** The Cards view grid; cards are `facility-card-{id}` (FACILITY_CARD). */
  cards: 'facility-list-cards',
  /** "Load More Facilities" under the cards. */
  loadMore: 'facility-list-load-more-button',
} as const;

export type FacilityKpiKey = keyof typeof FACILITY_LIST.kpi;
export type FacilityQuickFilter = keyof typeof FACILITY_LIST.filter;

/** The table's columns, as the cell / header ids carry them (`-cell-{key}`, `-th-{key}`). */
export const FACILITY_COLUMN = {
  name: 'facilitynameen',
  type: 'type',
  code: 'facilitycode',
  licenseNo: 'licenseno',
  licenseExpiry: 'licenseexpirydate',
  status: 'status',
} as const;

export type FacilityColumnKey = keyof typeof FACILITY_COLUMN;

/**
 * Row actions (`facility-list-table-row-{id}-{action}`). Which ones render
 * (2026-11-04, admin): View, Edit always; Inactivate when isActive and the
 * licence is not expired; Activate when inactive and not expired, else a
 * DISABLED Activate titled "Cannot activate: the facility licence has expired.
 * Update its licence expiry date first."; Delete always. The status badge is
 * `-status-badge`.
 */
export const FACILITY_ROW_ACTION = {
  view: 'view',
  edit: 'edit',
  inactivate: 'inactivate',
  activate: 'activate',
  delete: 'delete',
} as const;

export type FacilityRowAction = keyof typeof FACILITY_ROW_ACTION;

/**
 * Sort fields (`facility-list-sort-option-{field}-{dir}`); request `sortBy`
 * "FacilityNameEn asc", "FacilityCode desc", "LicenseExpiryDate asc",
 * "Status asc", "CreatedOn desc" (the default), "ModifiedOn asc". NO type sort.
 */
export const FACILITY_SORT_FIELD = {
  name: 'facilitynameen',
  code: 'facilitycode',
  licenseExpiry: 'licenseexpirydate',
  status: 'status',
  created: 'createdon',
  modified: 'modifiedon',
} as const;

export type FacilitySortField = keyof typeof FACILITY_SORT_FIELD;

/** The `sortBy` value each field sends. */
export const FACILITY_SORT_COLUMN: Record<FacilitySortField, string> = {
  name: 'FacilityNameEn',
  code: 'FacilityCode',
  licenseExpiry: 'LicenseExpiryDate',
  status: 'Status',
  created: 'CreatedOn',
  modified: 'ModifiedOn',
};

/**
 * Export: trigger -> menu (Selected Export = the current filters, Export All
 * Data = no filters) -> the shared dialog "Export Facilities" with
 * `pbm-dialog-action-{cancel|csv|excel}`. Needs Facilities.ExportFacilities.
 */
export const FACILITY_EXPORT = {
  root: 'facility-list-export',
  trigger: 'facility-list-export-trigger',
  menu: 'facility-list-export-menu',
  selected: 'facility-list-export-selected',
  all: 'facility-list-export-all',
} as const;

/** The Advance Search drawer ("Advance Search for Facilities") - fields `-field-{key}-input`. */
export const FACILITY_ADVANCED_SEARCH = {
  root: 'facility-list-advanced-search',
  title: 'facility-list-advanced-search-title',
  close: 'facility-list-advanced-search-close',
  search: 'facility-list-advanced-search-search-button',
  cancel: 'facility-list-advanced-search-cancel-button',
  /**
   * The FOUR fields offered (2026-11-04): Facility Name / Code (text,
   * `searchtext`), Facility Type, Status, Provider Type (selects). There is NO
   * licence-number field and NO licence-expiry date range (AC of 15133).
   */
  field: {
    searchText: 'searchtext',
    type: 'typeid',
    status: 'statusid',
    providerType: 'providertypeid',
  },
} as const;

export type FacilityAdvancedField = keyof typeof FACILITY_ADVANCED_SEARCH.field;

/** A card of the Cards view: `facility-card-{id}-{suffix}`. */
export const FACILITY_CARD = {
  prefix: 'facility-card-',
  header: 'header',
  title: 'title',
  typeTag: 'type-tag',
  /** The card's Active toggle (input) - activates / opens the Inactivate drawer; disabled for an expired licence. */
  activeSwitch: 'active-switch',
  code: 'code',
  licenseNo: 'license-no',
  /** Shown raw as `YYYY-MM-DD` (the table shows DD/MM/YYYY). */
  licenseExpiry: 'license-expiry-date',
  status: 'status',
  statusBadge: 'status-badge',
  action: {
    view: 'view-button',
    edit: 'edit-button',
    delete: 'delete-button',
  },
} as const;

export type FacilityCardAction = keyof typeof FACILITY_CARD.action;

// ---- Add / Edit drawer -------------------------------------------------------------

/**
 * The Add / Edit drawer (`facility-form-drawer`, both on the list and on the
 * detail): "Add New Facility" / "Edit Facility", a two-step stepper - 1 Basic
 * Information, 2 Contact & License. Inputs `-{field}-input`, selects
 * `-{field}-select` (p-select), errors `-{field}-error`. The FACILITY CODE is
 * NOT on the form (create or edit) - it shows on the list / Overview only.
 */
export const FACILITY_FORM = {
  root: 'facility-form-drawer',
  title: 'facility-form-drawer-title',
  close: 'facility-form-drawer-close',
  stepper: 'facility-form-drawer-stepper',
  /** `-step-{1|2}` (li) with `-bullet` (button, jumps back) and `-label`. */
  stepPrefix: 'facility-form-drawer-stepper-step-',
  back: 'facility-form-drawer-back-button',
  next: 'facility-form-drawer-next-button',
  save: 'facility-form-drawer-save-button',
  /** Step 1 - Basic Information. Required: names, type, provider type. */
  basic: {
    nameEn: 'facility-form-drawer-facility-name-en-input',
    nameAr: 'facility-form-drawer-facility-name-ar-input',
    type: 'facility-form-drawer-type-id-select',
    /** Read-only, derived from the type: Clinic 1, Hospital 2, Pharmacy 3. */
    authorityCode: 'facility-form-drawer-authority-code-input',
    providerType: 'facility-form-drawer-provider-type-id-select',
    nationalCode: 'facility-form-drawer-national-code-input',
    /** Ticked by default. */
    isActive: 'facility-form-drawer-is-active-checkbox',
  },
  /** Step 2 - Contact & License. Required: email, licence number, start and expiry dates. */
  details: {
    email: 'facility-form-drawer-email-input',
    phone: 'facility-form-drawer-phone-number-input',
    mobile: 'facility-form-drawer-mobile-number-input',
    licenseNo: 'facility-form-drawer-license-no-input',
    /** Date pickers: type DD/MM/YYYY + Enter. */
    licenseStart: 'facility-form-drawer-license-start-date-input',
    licenseExpiry: 'facility-form-drawer-license-expiry-date-input',
    buildingName: 'facility-form-drawer-building-name-input',
    zipCode: 'facility-form-drawer-zip-code-input',
    unitNumber: 'facility-form-drawer-unit-number-input',
    /** p-inputnumber, up to 8 decimals; NO range check (95 is kept). */
    longitude: 'facility-form-drawer-longitude-input',
    latitude: 'facility-form-drawer-latitude-input',
    additionalAddressEn: 'facility-form-drawer-additional-address-english-input',
    additionalAddressAr: 'facility-form-drawer-additional-address-arabic-input',
  },
  /** Error texts sit under `{root}-{field}-error` for these fields only. */
  error: {
    nameEn: 'facility-form-drawer-facility-name-en-error',
    nameAr: 'facility-form-drawer-facility-name-ar-error',
    type: 'facility-form-drawer-type-id-error',
    providerType: 'facility-form-drawer-provider-type-id-error',
    email: 'facility-form-drawer-email-error',
    licenseNo: 'facility-form-drawer-license-no-error',
    licenseStart: 'facility-form-drawer-license-start-date-error',
    licenseExpiry: 'facility-form-drawer-license-expiry-date-error',
  },
} as const;

export type FacilityBasicField = keyof typeof FACILITY_FORM.basic;
export type FacilityDetailsField = keyof typeof FACILITY_FORM.details;
export type FacilityFormField = FacilityBasicField | FacilityDetailsField;
export type FacilityFormErrorField = keyof typeof FACILITY_FORM.error;

// ---- Detail -----------------------------------------------------------------------

/**
 * The detail screen (`/facility-management/{id}`, `facility-detail`). The
 * header actions render in the GLOBAL breadcrumb bar (`app-breadcrumb-actions`)
 * but carry their own ids: Edit, Inactivate | Activate, Delete (an expired,
 * inactive facility shows Activate disabled).
 */
export const FACILITY_DETAIL = {
  root: 'facility-detail',
  loading: 'facility-detail-loading',
  headerCard: 'facility-detail-header-card',
  name: 'facility-detail-name',
  typeTag: 'facility-detail-type-tag',
  breadcrumbActions: 'app-breadcrumb-actions',
  breadcrumbCurrent: 'app-breadcrumb-current',
  action: {
    edit: 'facility-detail-edit-button',
    inactivate: 'facility-detail-inactivate-button',
    activate: 'facility-detail-activate-button',
    delete: 'facility-detail-delete-button',
  },
  tabs: 'facility-detail-tabs',
  /** Network Assignment needs Facilities.GetFacilityNetworks; Audit History needs AuditLogs.GetAuditLogs + Facilities.AuditLogs. */
  tab: {
    overview: 'facility-detail-tab-overview',
    networks: 'facility-detail-tab-networks',
    audit: 'facility-detail-tab-audit',
  },
  /**
   * The Overview values (`-overview-{field}`, "—" when empty). Sections: Basic
   * Information, License, Contact, Address, Geo-coordinates (+ a read-only map
   * when both coordinates are set), Record. There is NO English-name, type or
   * email field in the Overview (the name and type are the header's; the
   * header strip shows License Number, Email Address, Mobile Number - no ids).
   * Licence dates render RAW (`2026-10-25`), Created / Modified On as
   * `DD/MM/YYYY hh:mm AM`.
   */
  overview: {
    facilityCode: 'facility-detail-overview-facility-code',
    nameAr: 'facility-detail-overview-facility-name-ar',
    authorityCode: 'facility-detail-overview-authority-code',
    providerType: 'facility-detail-overview-provider-type',
    status: 'facility-detail-overview-status',
    nationalCode: 'facility-detail-overview-national-code',
    licenseStart: 'facility-detail-overview-license-start-date',
    licenseExpiry: 'facility-detail-overview-license-expiry-date',
    phone: 'facility-detail-overview-phone',
    mobile: 'facility-detail-overview-mobile',
    buildingName: 'facility-detail-overview-building-name',
    unitNumber: 'facility-detail-overview-unit-number',
    zipCode: 'facility-detail-overview-zip-code',
    additionalAddressEn: 'facility-detail-overview-additional-address-en',
    additionalAddressAr: 'facility-detail-overview-additional-address-ar',
    longitude: 'facility-detail-overview-longitude',
    latitude: 'facility-detail-overview-latitude',
    createdOn: 'facility-detail-overview-created-on',
    createdBy: 'facility-detail-overview-created-by',
    modifiedOn: 'facility-detail-overview-modified-on',
    modifiedBy: 'facility-detail-overview-modified-by',
  },
} as const;

export type FacilityDetailAction = keyof typeof FACILITY_DETAIL.action;
export type FacilityDetailTab = keyof typeof FACILITY_DETAIL.tab;
export type FacilityOverviewField = keyof typeof FACILITY_DETAIL.overview;

/**
 * The Network Assignment tab: a read-only table (`facility-detail-networks-table`)
 * - columns Code, Network Name, Status, Assigned On (NO network type), rows
 * `-row-{networkId}` with `-cell-{key}`; the name is a link button
 * (`facility-detail-view-network-button`, shared by every row) to the network.
 * Empty: "This facility is not assigned to any network." in `-empty`.
 */
export const FACILITY_NETWORKS = {
  screen: 'facility-detail-networks-table',
  table: 'facility-detail-networks-table-el',
  body: 'facility-detail-networks-table-body',
  empty: 'facility-detail-networks-table-empty',
  pager: 'facility-detail-networks-table-pager',
  /** locator-exception: every row's name link shares this id; it is reached inside the row. */
  viewNetwork: 'facility-detail-view-network-button',
  column: {
    code: 'networkcode',
    name: 'networkname',
    status: 'status',
    assignedOn: 'assignedon',
  },
} as const;

export type FacilityNetworkColumn = keyof typeof FACILITY_NETWORKS.column;

/**
 * The Audit History tab - the shared audit component under
 * `facility-detail-audit-*`: search box, Filters -> "Advance Search for Audit
 * History" (Action Type: Create, Update, Status Change, Delete; Performed By;
 * Date Range - clicked in the calendar), a timeline whose entries carry no id
 * (each has View Details = `facility-detail-view-audit-button`), a pager, and
 * the shared "Audit Entry" drawer.
 */
export const FACILITY_AUDIT = {
  searchInput: 'facility-detail-audit-search-input',
  searchPrefix: 'facility-detail-audit',
  advancedSearchButton: 'facility-detail-audit-search-filter-button',
  advancedSearch: 'facility-detail-audit-advanced-search',
  chips: 'facility-detail-audit-filter-chips',
  /** locator-exception: every entry's button shares this id; entries have none. */
  viewButton: 'facility-detail-view-audit-button',
  pager: 'facility-detail-audit-pager',
  drawer: AUDIT_ENTRY_DRAWER,
} as const satisfies AuditTabIds;

/**
 * The Inactivate drawer - one component under two namespaces: the LIST's
 * `facility-deactivate-drawer` and the DETAIL's `facility-detail-deactivate-drawer`
 * ("Inactivate facility", warning "Deactivate {name}? It stays on record ...",
 * Deactivation Reason* (lookup facilityDeactivationReason), Details (max 500,
 * required when the reason is Other), Cancel / Inactivate). No approval notice
 * - `approvalNotice` points at the warning paragraph.
 */
const inactivateIds = (root: string): InactivateDialogIds => ({
  root,
  title: `${root}-title`,
  close: `${root}-close`,
  reasonSelect: `${root}-reason-select`,
  reasonError: `${root}-reason-error`,
  detailsInput: `${root}-details-input`,
  detailsError: `${root}-details-error`,
  approvalNotice: `${root}-warning`,
  cancel: `${root}-cancel-button`,
  save: `${root}-confirm-button`,
});

export const FACILITY_INACTIVATE = {
  list: inactivateIds('facility-deactivate-drawer'),
  detail: inactivateIds('facility-detail-deactivate-drawer'),
} as const;

export type FacilityInactivateHost = keyof typeof FACILITY_INACTIVATE;
