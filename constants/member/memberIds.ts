import type { InactivateDialogIds } from '../ElementIds';

/**
 * Element ids of the Member module (Feature 14375, `/member-management`).
 *
 * Every id below was read off the live screens on 2026-11-05 (probe dumps in
 * reports/member/probe/foundation-2026-11-05/, see
 * reports/member/Member-Foundation-Notes.md) and cross-checked against the
 * application bundle (chunk-7RKTX6PS: the list, card, form drawer, detail and
 * COB timeline components). Ids only - no labels, no classes. The shared
 * conventions hold: `{screen}-table-row-{memberId}-cell-{key}`, `-{action}` row
 * buttons, `{screen}-table-pager-*`, the shared `#pbm-dialog` for
 * confirmations. A `pbm-button` (Add New Member, Next / Back / Save, the
 * detail's Edit / Delete) carries its id on the p-button HOST: click the inner
 * button (`buttonSelector`) - a host click is a silent no-op.
 */

// ---- List -------------------------------------------------------------------------

/** The list screen (`member-list`): KPI tiles, toolbar, table / cards. */
export const MEMBER_LIST = {
  /** The screen namespace ListPageBase builds rows, cells, pager and search from. */
  screen: 'member-list',
  /** The KPI band - absent without Members.GetMembersDashboard. */
  kpiBand: 'member-list-kpis',
  /**
   * The four tiles, each with `-label` and `-value` children. The values COUNT
   * UP from 0 after GetMembersDashboard answers - read a settled value.
   * Labels (2026-11-05): Total Members, Active Members, Inactive Members,
   * Special Needs (the flag, whatever the status).
   */
  kpi: {
    total: 'member-list-kpi-total',
    active: 'member-list-kpi-active',
    inactive: 'member-list-kpi-inactive',
    specialNeeds: 'member-list-kpi-special-needs',
  },
  /** The breadcrumb payer scope select ("All Payers") - the global component, shared by every payer-scoped module. */
  payerSelect: 'app-breadcrumb-payer-select',
  toolbar: 'member-list-toolbar',
  searchInput: 'member-list-search-input',
  /** The X inside the search box. */
  searchClearIcon: 'member-list-search-clear-icon',
  /** "Clear" beside the box - shown while any filter / search is applied; clears them all. */
  searchClearAll: 'member-list-search-clear-button',
  /** The Filters button beside the search box: on 2026-11-05 it opens NOTHING (no advanced search). */
  searchFilterButton: 'member-list-search-filter-button',
  /** Where an advanced-search drawer would render (the shared component's namespace) - absent on 2026-11-05. */
  advancedSearch: 'member-list-advanced-search',
  /** Quick filters (`p-select` comboboxes): All Statuses (Active / Inactive -> `isActive`) / All Nationalities (-> `nationalityId`). */
  filter: {
    status: 'member-list-filter-status-select',
    nationality: 'member-list-filter-nationality-select',
  },
  /** The applied-filter chips: `-chip-{search|status|nationality}` with `-remove`. */
  chips: 'member-list-filter-chips',
  sortTrigger: 'member-list-sort-trigger',
  sortMenu: 'member-list-sort-menu',
  /** Sort options `member-list-sort-option-{field}-{asc|desc}` (MEMBER_SORT_FIELD). */
  sortOptionPrefix: 'member-list-sort-option-',
  /** Import (`pbm-import-btn`) -> the bulk import drawer (MEMBER_IMPORT). Needs Members.BulkImport. */
  importTrigger: 'member-list-import-trigger',
  /** Needs Members.CreateMember. A p-button: click the inner button. */
  addButton: 'member-list-add-button',
  table: 'member-list-table-el',
  tableBody: 'member-list-table-body',
  /** The table's empty row: "No results found." */
  tableEmpty: 'member-list-table-empty',
  pager: 'member-list-table-pager',
  /** The Cards view grid; cards are `member-card-{id}` (MEMBER_CARD). */
  cards: 'member-list-cards',
  /** "Load More Members" under the cards. */
  loadMore: 'member-list-load-more-button',
  /** The banner shown while the user's own member import runs ("Your member import is still running ..."). */
  bulkLock: 'member-list-bulk-lock',
} as const;

export type MemberKpiKey = keyof typeof MEMBER_LIST.kpi;
export type MemberQuickFilter = keyof typeof MEMBER_LIST.filter;

/** The table's columns, as the cell / header ids carry them (`-cell-{key}`, `-th-{key}`). NO Identity Type / Member Status column (AC of 14377). */
export const MEMBER_COLUMN = {
  name: 'name',
  memberCode: 'membercode',
  documentId: 'documentid',
  nationality: 'nationality',
  mobileNumber: 'mobilenumber',
  status: 'status',
} as const;

export type MemberColumnKey = keyof typeof MEMBER_COLUMN;

/**
 * Row actions (`member-list-table-row-{id}-{action}`): View, Edit,
 * `toggle-active` (labelled "Inactivate" on an active member - opens the
 * Deactivate drawer - and "Activate" on an inactive one - opens the shared
 * dialog), Delete. The status badge is `-status-badge`.
 */
export const MEMBER_ROW_ACTION = {
  view: 'view',
  edit: 'edit',
  toggleActive: 'toggle-active',
  delete: 'delete',
} as const;

export type MemberRowAction = keyof typeof MEMBER_ROW_ACTION;

/**
 * Sort fields (`member-list-sort-option-{field}-{dir}`); request `sortBy`
 * "MemberNameEn asc", "MemberCode desc", "DocumentId asc", "NationalityEn asc",
 * "MobileNumber asc", "Status asc", "CreatedOn desc" (the default),
 * "ModifiedOn asc". Labels "Name (A-Z)", "Member ID (Z-A)", ... "Created On
 * (Newest to Oldest)", "Last Modified (Oldest to Newest)".
 */
export const MEMBER_SORT_FIELD = {
  name: 'membernameen',
  memberCode: 'membercode',
  documentId: 'documentid',
  nationality: 'nationalityen',
  mobileNumber: 'mobilenumber',
  status: 'status',
  created: 'createdon',
  modified: 'modifiedon',
} as const;

export type MemberSortField = keyof typeof MEMBER_SORT_FIELD;

/** The `sortBy` column each field sends. */
export const MEMBER_SORT_COLUMN: Record<MemberSortField, string> = {
  name: 'MemberNameEn',
  memberCode: 'MemberCode',
  documentId: 'DocumentId',
  nationality: 'NationalityEn',
  mobileNumber: 'MobileNumber',
  status: 'Status',
  created: 'CreatedOn',
  modified: 'ModifiedOn',
};

/**
 * Export: trigger -> menu (Export Template, Selected Export = the current
 * search / filters, Export All Data) -> the shared `#pbm-dialog` with
 * `pbm-dialog-action-{cancel|csv|excel}` ("CSV (.csv)" / "Excel (.xlsx)").
 * Needs Members.ExportMembers.
 */
export const MEMBER_EXPORT = {
  root: 'member-list-export',
  trigger: 'member-list-export-trigger',
  menu: 'member-list-export-menu',
  template: 'member-list-export-template',
  selected: 'member-list-export-selected',
  all: 'member-list-export-all',
} as const;

/** The bulk Import drawer and its Upload history (shared component; suffixes in FORMULARY_IMPORT / BULK_HISTORY_PART). */
export const MEMBER_IMPORT = {
  drawer: 'member-list-bulk-import',
  history: 'member-list-bulk-history',
} as const;

/**
 * A card of the Cards view: `member-card-{id}-{suffix}`. The header carries
 * initials, the name (`-title`), the member code, gender / Alive / VIP tags and
 * the Active switch; the body Document ID, Date of Birth (DD/MM/YYYY),
 * Identity Type, Nationality, Email Address, Mobile Number (each with a
 * `-label`); the footer View / Edit / Delete (no Activate / Inactivate button -
 * the switch does it).
 */
export const MEMBER_CARD = {
  prefix: 'member-card-',
  header: 'header',
  title: 'title',
  body: 'body',
  footer: 'footer',
  /** The card's Active toggle (input) - activates / opens the Deactivate drawer. */
  activeSwitch: 'active-switch',
  field: {
    documentId: 'document-id',
    dateOfBirth: 'date-of-birth',
    identityType: 'identity-type',
    nationality: 'nationality',
    email: 'email-address',
    mobile: 'mobile-number',
  },
  action: {
    view: 'view-button',
    edit: 'edit-button',
    delete: 'delete-button',
  },
} as const;

export type MemberCardField = keyof typeof MEMBER_CARD.field;
export type MemberCardAction = keyof typeof MEMBER_CARD.action;

// ---- Add / Edit wizard -------------------------------------------------------------

/**
 * The Add / Edit wizard (`member-form-drawer`, list and detail alike): "Add New
 * Member" / "Edit Member", a four-step stepper - 1 Member Information, 2
 * Non-National Registry, 3 Address, 4 Emergency Contacts. Inputs
 * `-{field}-input`, selects `-{field}-select` (p-select), errors
 * `-{field}-error`. Footer: step 1 Cancel (the back-button) + Next, steps 2-3
 * Back + Next, step 4 Back + Save. There is NO country-dial-code control: the
 * dial code follows the nationality (shown "+966" before the mobile box).
 */
export const MEMBER_FORM = {
  root: 'member-form-drawer',
  title: 'member-form-drawer-title',
  close: 'member-form-drawer-close',
  stepper: 'member-form-drawer-stepper',
  /** `-step-{1..4}` (li) with `-bullet` (button, jumps back / validates forward) and `-label`. */
  stepPrefix: 'member-form-drawer-stepper-step-',
  /** Labelled "Cancel" on step 1, "Back" after. */
  back: 'member-form-drawer-back-button',
  next: 'member-form-drawer-next-button',
  save: 'member-form-drawer-save-button',
  /** Step 1 - Member Information. Required: first / second / last names (both languages), nationality, identity type, document ID, date of birth, gender, member status. */
  patient: {
    englishFirstName: 'member-form-drawer-english-first-name-input',
    englishSecondName: 'member-form-drawer-english-second-name-input',
    englishThirdName: 'member-form-drawer-english-third-name-input',
    englishLastName: 'member-form-drawer-english-last-name-input',
    arabicFirstName: 'member-form-drawer-arabic-first-name-input',
    arabicSecondName: 'member-form-drawer-arabic-second-name-input',
    arabicThirdName: 'member-form-drawer-arabic-third-name-input',
    arabicLastName: 'member-form-drawer-arabic-last-name-input',
    eHealthId: 'member-form-drawer-e-health-id-input',
    /** Choosing Saudi sets AND limits Identity Type to National ID; any other nationality offers Iqama / Passport / GCC ID (Iqama preset). */
    nationality: 'member-form-drawer-nationality-select',
    identityType: 'member-form-drawer-identity-type-id-select',
    documentId: 'member-form-drawer-document-id-input',
    /** Date picker: type DD/MM/YYYY + Enter; fills the Hijri date (ConvertToHijri). No future date (maxDate today). */
    dateOfBirth: 'member-form-drawer-date-of-birth-input',
    /** Text `YYYY/MM/DD`; on blur it fills the Date of Birth (ConvertToGregorian). */
    hijriDateOfBirth: 'member-form-drawer-hijri-date-of-birth-input',
    gender: 'member-form-drawer-gender-id-select',
    placeOfBirth: 'member-form-drawer-place-of-birth-country-id-select',
    occupation: 'member-form-drawer-occupation-input',
    maritalStatus: 'member-form-drawer-marital-status-id-select',
    /** "Member Status": Alive / Deceased. */
    memberStatus: 'member-form-drawer-patient-status-id-select',
    /** "Member Active Status" - TICKED by default. */
    isActive: 'member-form-drawer-is-active-checkbox',
    isSpecialNeeds: 'member-form-drawer-is-special-needs-checkbox',
  },
  /** Step 2 - Non-National Registry. Required: mobile, email, preferred contact method, preferred language. */
  nonNational: {
    insuranceNumber: 'member-form-drawer-insurance-number-input',
    /** Placeholder "5XXXXXXXX" after a fixed "+966"; NO format check, NO maxlength (only "This field is required."). */
    mobileNumber: 'member-form-drawer-mobile-number-input',
    email: 'member-form-drawer-email-input',
    preferredContactMethod: 'member-form-drawer-preferred-contact-method-id-select',
    preferredLanguage: 'member-form-drawer-preferred-language-id-select',
    bloodGroup: 'member-form-drawer-blood-group-id-select',
    isVip: 'member-form-drawer-is-vip-checkbox',
  },
  /** Step 3 - Address. Required: Country. City -> District -> Street cascade (each filters the next). */
  address: {
    country: 'member-form-drawer-address-country-id-select',
    city: 'member-form-drawer-city-id-select',
    district: 'member-form-drawer-district-id-select',
    street: 'member-form-drawer-street-id-select',
    buildingNumber: 'member-form-drawer-building-number-input',
    postalCode: 'member-form-drawer-postal-code-input',
    additionalNumber: 'member-form-drawer-additional-number-input',
  },
  /**
   * Step 4 - Emergency Contacts ("No emergency contacts added yet." until "Add
   * Contact"). locator-exception: EVERY contact's fields share these ids (one
   * set per contact block, no index) - reach the n-th with `.nth(n)`. Their
   * errors carry no id ("This field is required." under the field).
   */
  contact: {
    add: 'member-form-drawer-add-contact-button',
    remove: 'member-form-drawer-remove-contact-button',
    name: 'member-form-drawer-name-input',
    relationship: 'member-form-drawer-relationship-select',
    phoneNumber: 'member-form-drawer-phone-number-input',
  },
  /** Error texts sit under `{root}-{field}-error` for these fields only. */
  error: {
    englishFirstName: 'member-form-drawer-english-first-name-error',
    englishSecondName: 'member-form-drawer-english-second-name-error',
    englishLastName: 'member-form-drawer-english-last-name-error',
    arabicFirstName: 'member-form-drawer-arabic-first-name-error',
    arabicSecondName: 'member-form-drawer-arabic-second-name-error',
    arabicLastName: 'member-form-drawer-arabic-last-name-error',
    nationality: 'member-form-drawer-nationality-id-error',
    identityType: 'member-form-drawer-identity-type-id-error',
    documentId: 'member-form-drawer-document-id-error',
    dateOfBirth: 'member-form-drawer-date-of-birth-error',
    hijriDateOfBirth: 'member-form-drawer-hijri-date-of-birth-error',
    gender: 'member-form-drawer-gender-id-error',
    memberStatus: 'member-form-drawer-patient-status-id-error',
    mobileNumber: 'member-form-drawer-mobile-number-error',
    email: 'member-form-drawer-email-error',
    preferredContactMethod: 'member-form-drawer-preferred-contact-method-id-error',
    preferredLanguage: 'member-form-drawer-preferred-language-id-error',
    country: 'member-form-drawer-address-country-id-error',
  },
} as const;

export type MemberPatientField = keyof typeof MEMBER_FORM.patient;
export type MemberNonNationalField = keyof typeof MEMBER_FORM.nonNational;
export type MemberAddressField = keyof typeof MEMBER_FORM.address;
export type MemberFormField = MemberPatientField | MemberNonNationalField | MemberAddressField;
export type MemberFormErrorField = keyof typeof MEMBER_FORM.error;
export type MemberContactField = 'name' | 'relationship' | 'phoneNumber';

// ---- View page --------------------------------------------------------------------

/**
 * The view page (`/member-management/{id}`, `member-detail`). Header card:
 * initials, Alive / Gender (/ Special Needs / VIP) tags, the name
 * (`member-detail-name`), the member code, the Active switch
 * (`member-detail-toggle-active-button`, a button; a user without
 * SetMemberActive sees the read-only `member-detail-status-label`) and a strip
 * Nationality / Document ID / Mobile Number / Age ("36 years, 5 months, 21
 * days", no ids). Edit and Delete render in the GLOBAL breadcrumb bar
 * (`app-breadcrumb-actions`) with their own ids (p-buttons). There is NO Audit
 * History tab.
 */
export const MEMBER_DETAIL = {
  root: 'member-detail',
  loading: 'member-detail-loading',
  headerCard: 'member-detail-header-card',
  name: 'member-detail-name',
  statusLabel: 'member-detail-status-label',
  breadcrumbActions: 'app-breadcrumb-actions',
  breadcrumbCurrent: 'app-breadcrumb-current',
  action: {
    edit: 'member-detail-edit-button',
    /** The header's Active switch: active -> the Deactivate drawer; inactive -> "Activate Member" dialog. */
    toggleActive: 'member-detail-toggle-active-button',
    delete: 'member-detail-delete-button',
  },
  tabs: 'member-detail-tabs',
  /** The Coverage Ordering tab needs Cob.GetMemberCobTimeline (hidden without it). */
  tab: {
    patient: 'member-detail-tab-patient',
    nonNational: 'member-detail-tab-nonnational',
    address: 'member-detail-tab-address',
    emergency: 'member-detail-tab-emergency',
    dashboard: 'member-detail-tab-dashboard',
    cob: 'member-detail-tab-cob',
  },
  /**
   * Member Information values (`-patient-{field}`, "—" when empty). Date of
   * Birth renders RAW `1990-05-15`; Age is whole years; Special Needs reads
   * "Verified" / "Not verified"; Record Information: Created By / On
   * ("05/11/2026 02:03 AM"), Modified By / On ("—" until the first edit).
   */
  patient: {
    displayName: 'member-detail-patient-display-name',
    eHealthId: 'member-detail-patient-e-health-id',
    documentId: 'member-detail-patient-document-id',
    identityType: 'member-detail-patient-identity-type',
    dateOfBirth: 'member-detail-patient-date-of-birth',
    hijriDateOfBirth: 'member-detail-patient-hijri-date-of-birth',
    age: 'member-detail-patient-age',
    nationality: 'member-detail-patient-nationality',
    gender: 'member-detail-patient-gender',
    placeOfBirth: 'member-detail-patient-place-of-birth',
    occupation: 'member-detail-patient-occupation',
    maritalStatus: 'member-detail-patient-marital-status',
    memberStatus: 'member-detail-patient-member-status',
    specialNeeds: 'member-detail-patient-is-special-needs',
    policyHolders: 'member-detail-patient-policy-holders',
    createdBy: 'member-detail-record-created-by',
    createdOn: 'member-detail-record-created-on',
    modifiedBy: 'member-detail-record-modified-by',
    modifiedOn: 'member-detail-record-modified-on',
  },
  /** Non-National Registry values; VIP reads "Verified" / "Not verified". */
  nonNational: {
    insuranceNumber: 'member-detail-non-national-insurance-number',
    countryDialCode: 'member-detail-non-national-country-dial-code',
    mobileNumber: 'member-detail-non-national-mobile-number',
    email: 'member-detail-non-national-email',
    preferredContactMethod: 'member-detail-non-national-preferred-contact-method',
    preferredLanguage: 'member-detail-non-national-preferred-language',
    bloodGroup: 'member-detail-non-national-blood-group',
    isVip: 'member-detail-non-national-is-vip',
  },
  address: {
    country: 'member-detail-address-country',
    city: 'member-detail-address-city',
    district: 'member-detail-address-district',
    street: 'member-detail-address-street',
    buildingNumber: 'member-detail-address-building-number',
    postalCode: 'member-detail-address-postal-code',
    additionalNumber: 'member-detail-address-additional-number',
  },
  /**
   * Emergency Contacts: one block per contact - locator-exception: every block
   * repeats these ids (reach the n-th with `.nth(n)`). Empty: "No emergency
   * contacts on file.". Created / Modified On read `DD/MM/YYYY HH:mm`.
   */
  emergency: {
    name: 'member-detail-emergency-name',
    relationship: 'member-detail-emergency-relationship',
    phoneNumber: 'member-detail-emergency-phone-number',
    createdOn: 'member-detail-emergency-created-on',
    createdBy: 'member-detail-emergency-created-by',
    modifiedOn: 'member-detail-emergency-modified-on',
    modifiedBy: 'member-detail-emergency-modified-by',
  },
} as const;

export type MemberDetailAction = keyof typeof MEMBER_DETAIL.action;
export type MemberDetailTab = keyof typeof MEMBER_DETAIL.tab;
export type MemberPatientValue = keyof typeof MEMBER_DETAIL.patient;
export type MemberNonNationalValue = keyof typeof MEMBER_DETAIL.nonNational;
export type MemberAddressValue = keyof typeof MEMBER_DETAIL.address;
export type MemberEmergencyValue = keyof typeof MEMBER_DETAIL.emergency;

/**
 * The PBM Accumulator Dashboard tab. The member card (name, status, Member ID,
 * Benefit Year, Policies count) and ONE policy at a time; with more than one,
 * buttons "COB Policy 1", "COB Policy 2" ... (`selectCob` - every button shares
 * the id: locator-exception, reach the n-th with `.nth(n)`). Empty: "No active
 * benefit policy found.". Accumulators: "Accumulator data is not yet
 * available." / "No claims have posted in this benefit period yet.".
 */
export const MEMBER_DASHBOARD = {
  memberId: 'member-detail-dashboard-dashboard-member-id',
  benefitYear: 'member-detail-dashboard-dashboard-benefit-year',
  policiesCount: 'member-detail-dashboard-dashboard-policies-count',
  /** locator-exception: every "COB Policy n" button shares this id. */
  selectCob: 'member-detail-select-cob-button',
  policy: {
    policyNumber: 'member-detail-dashboard-dashboard-policy-number',
    plan: 'member-detail-dashboard-dashboard-plan',
    payer: 'member-detail-dashboard-dashboard-payer',
    pbmMemberId: 'member-detail-dashboard-dashboard-pbm-member-id',
    relationship: 'member-detail-dashboard-dashboard-relationship',
    policyStatus: 'member-detail-dashboard-dashboard-policy-status',
    effectivePeriod: 'member-detail-dashboard-dashboard-effective',
  },
  /** Policy-Level Benefit: a term of 0 shows "None". */
  benefit: {
    deductible: 'member-detail-dashboard-policy-deductible',
    coinsurance: 'member-detail-dashboard-policy-coinsurance',
    outOfPocketMaximum: 'member-detail-dashboard-policy-oopm',
    sublimit: 'member-detail-dashboard-policy-sublimit',
  },
  /** Accumulators & Sublimits ("Benefit year {year}"). */
  accumulators: 'member-detail-dashboard-accumulators',
  accumulatorsYear: 'member-detail-dashboard-accumulators-year',
  accumulator: {
    deductibleMet: 'member-detail-dashboard-acc-deductible-met',
    outOfPocketMet: 'member-detail-dashboard-acc-oopm-met',
    policySublimit: 'member-detail-dashboard-acc-policy-sublimit',
    tradeSublimits: 'member-detail-dashboard-acc-trade-sublimits',
    /** "Benefit period {start} – {end}", "renews on {date}" | "ends with the policy", "terms set by a manual reset". */
    period: 'member-detail-dashboard-acc-period',
    noClaims: 'member-detail-dashboard-acc-no-claims',
    lastPosted: 'member-detail-dashboard-acc-last-posted',
  },
  /** "View full accumulator" -> `/financial-benefits/accumulator/{policyMemberId}`; needs MemberAccumulators.GetMemberAccumulator. */
  viewAccumulator: 'member-detail-dashboard-view-accumulator-button',
} as const;

export type MemberDashboardPolicyField = keyof typeof MEMBER_DASHBOARD.policy;
export type MemberDashboardBenefitField = keyof typeof MEMBER_DASHBOARD.benefit;
export type MemberDashboardAccumulatorField = keyof typeof MEMBER_DASHBOARD.accumulator;

/**
 * The Coverage Ordering (COB) tab - the `pbm-cob-timeline` component under
 * `member-detail-cob-timeline`: "Coverage Ordering", the hint "Drag the
 * policies into the order they should pay: the first is primary." (only with
 * more than one current policy and Cob.ReorderMemberCoverage), the CURRENT
 * list (cdk drag-and-drop rows, handle per row) and History. Entry ids are
 * `{prefix}-entry-{entryId}-{part}` - and the entry id is the EMPTY GUID for
 * every entry (2026-11-05), so every row's ids collide: locator-exception,
 * reach the n-th row's handle / badge with `.nth(n)`. Empty: "This member is
 * not enrolled in any policy yet, so there is nothing to rank." + "No coverage
 * ordering recorded for this member." (`-empty`).
 */
export const MEMBER_COB = {
  prefix: 'member-detail-cob-timeline',
  empty: 'member-detail-cob-timeline-empty',
  reorderHint: 'member-detail-cob-timeline-reorder-hint',
  /** Suffixes of an entry's parts (`{prefix}-entry-{id}-{suffix}`). */
  entry: {
    dragHandle: 'drag-handle',
    /** "Primary" / "Secondary" / "Tertiary" / "Order n". */
    orderBadge: 'order-badge',
    benefit: 'benefit',
  },
} as const;

/**
 * The Deactivate Member drawer - the shared deactivate component under the
 * LIST's `member-deactivate-drawer` or the DETAIL's
 * `member-detail-deactivate-drawer`: title "Deactivate Member", warning,
 * Deactivation Reason* (`-reason-select`), Details (`-details-input`), Cancel /
 * Deactivate (`-confirm-button`).
 */
const deactivateIds = (root: string): InactivateDialogIds => ({
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

export const MEMBER_DEACTIVATE = {
  list: deactivateIds('member-deactivate-drawer'),
  detail: deactivateIds('member-detail-deactivate-drawer'),
} as const;

export type MemberDeactivateHost = keyof typeof MEMBER_DEACTIVATE;
