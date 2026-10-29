/**
 * The application's QA automation element ids - the single source of truth for
 * every selector in this framework.
 *
 * The PBM frontend now carries an `id` on every interactive element (see the QA
 * Manual's ID-CONVENTIONS.md). Ids are built from route paths, entity ids,
 * model field names and translation KEYS - never from rendered text - so a
 * selector built here matches identically in English and Arabic. That is what
 * lets the bilingual specs share one set of locators instead of carrying a
 * localized label for every control.
 *
 * Everything below was verified against the live application. Where the QA
 * Manual and the live DOM disagree, the live DOM wins and the difference is
 * called out in a comment - see DIALOG_ACTION in particular, where the manual
 * is wrong about the action keys in a way that silently breaks every
 * Send for Approval.
 */

// ---------------------------------------------------------------------------
// Screen namespaces
// ---------------------------------------------------------------------------

/** Each screen owns one id namespace, prefixed with the screen name. */
export const SCREEN = {
  payerList: 'payer-list',
  payerDetail: 'payer-detail',
  payerForm: 'payer-form-drawer',
  approvalsPayer: 'approvals-payer',
  /**
   * The Network tab of the same approvals hub.
   *
   * Every tab of the hub is the SAME component under a module-named namespace -
   * verified: `approvals-network` renders the identical toolbar, search input,
   * table, columns and row actions as `approvals-payer`. That is what lets one
   * Page Object serve both, given the namespace as a parameter.
   */
  approvalsNetwork: 'approvals-network',
  /** The Plan tab of the approvals hub (2026-10-27) - the same component again. */
  approvalsPlan: 'approvals-plan',
  lookupItems: 'lookup-items',
  lookupItemForm: 'lookup-item-form-drawer',
} as const;

// ---------------------------------------------------------------------------
// Global chrome (present on every authenticated screen)
// ---------------------------------------------------------------------------

/**
 * App chrome and the singleton overlays. All of these sit OUTSIDE whichever
 * screen element is rendered - the nav drawer, header, breadcrumb bar and every
 * dialog/toast - so they are always queried from the document root.
 */
/**
 * The application's left-hand navigation, by the ids its links carry.
 *
 * Only the entries a payer test needs to reason about. Terminology Management
 * is here because the country catalogue is maintained there: "a payer
 * administrator may select a country but not maintain the list" is asserted at
 * the door to that module, the payer form offering no catalogue control to
 * anyone.
 */
export const NAV = {
  terminologyManagement: 'app-nav-terminology-management-link',
  // ---- plan folder 14 additions (2026-10-27) ----
  /**
   * The Payer Management menu entry - the in-app navigation target of the
   * plan unsaved-changes guard (19146). Inferred 2026-10-27 from the
   * terminology link's convention (`app-nav-{route}-link`, route
   * /payer-management), not yet verified live.
   */
  payerManagement: 'app-nav-payer-management-link',
} as const;

export const GLOBAL = {
  headerTitle: 'app-header-title',
  languageToggle: 'app-header-language-toggle-button',
  /** The same control on the unauthenticated screens, which have no app header. */
  authLanguageToggle: 'auth-shell-language-toggle-button',
  /** Inline message banner - where the app reports errors outside a toast. */
  /**
   * NOTE: there is no app-level message element with an id. A DOM audit of 38
   * screen states found no `app-message`; the application reports errors through
   * the toast below, and through a banner whose container carries only a CSS
   * class. Use TOAST for error text.
   */

  /**
   * The Table/Cards toggle lives in the global breadcrumb bar, NOT on the list
   * screen. Every list module shares it and remembers the choice per user.
   */
  viewToggleTable: 'app-breadcrumb-view-toggle-table',
  viewToggleCards: 'app-breadcrumb-view-toggle-cards',

  /**
   * The payer SCOPE switcher, in the breadcrumb bar beside the view toggles.
   *
   * Since 2026-09-27 every user - the administrator included - works one payer
   * at a time: the "Select a Payer" gate asks which on first entry, and this
   * control changes it afterwards. The payer list then renders THAT payer and
   * no other, and a search does not cross the boundary (verified: searching
   * "NUPCO" while scoped to "Al Dawaa" returns nothing). So a case that needs a
   * particular payer must put it in scope first - see
   * PayerManagementPage.scopeTo.
   */
  payerScopeSelect: 'app-breadcrumb-payer-select',

  /**
   * A detail screen's action buttons are projected into this container. They
   * carry screen-scoped ids (e.g. `payer-detail-edit-button`) but do not live
   * inside the screen's own element.
   */
  breadcrumbActions: 'app-breadcrumb-actions',
} as const;

/** Login screen. `login-email` / `login-password` predate the QA-id work and
 *  deliberately keep their unsuffixed names (each is a `<label for>` target). */
export const LOGIN = {
  email: 'login-email',
  password: 'login-password',
  submit: 'login-submit-button',
  alert: 'login-alert',
  alertText: 'login-alert-text',
} as const;

// ---------------------------------------------------------------------------
// Shared confirmation dialog
// ---------------------------------------------------------------------------

/**
 * The app-wide confirmation / alert dialog, mounted once and rendered into
 * <body>.
 *
 * VERIFIED: this ONE dialog serves every confirmation in the application -
 * delete, send-for-approval, approve, reject, activate/deactivate, and the
 * dirty-form guard. The QA Manual also documents `pbm-delete-confirm-dialog`
 * and `pbm-unsaved-changes-dialog`, but neither element ever renders.
 */
export const DIALOG = {
  root: 'pbm-dialog',
  title: 'pbm-dialog-title',
  message: 'pbm-dialog-message',
  alert: 'pbm-dialog-alert',
  items: 'pbm-dialog-items',
  /** Reason dropdown, e.g. the reviewer's Rejection Reason. */
  select: 'pbm-dialog-select',
  /** "I confirm that I have reviewed..." - gates the confirm button. */
  acknowledge: 'pbm-dialog-acknowledge-checkbox',
  actions: 'pbm-dialog-actions',
  close: 'pbm-dialog-close-button',
} as const;

/**
 * Dialog action buttons are keyed on the caller's LOGICAL action key, which the
 * dialog resolves against in code - so the id is identical in every language.
 * That is what lets a bilingual suite confirm a dialog without knowing the
 * button's translated label.
 *
 * The key VARIES BY DIALOG, and not the way the QA Manual describes. Observed
 * live:
 *
 *   Delete / Approve / Reject   -> `cancel` + `confirm`
 *   Send for Approval           -> `cancel` + `submit`     (not `confirm`)
 *   Drawer-close guard          -> `stay`   + `discard`
 *
 * The manual claims decision dialogs use `approve` / `reject`; they do not.
 * Because the affirmative key is not predictable, ConfirmDialog resolves it by
 * reading the ids actually present and taking the one that is not a dismissal -
 * see `DISMISSIVE_ACTIONS`. Hard-coding `confirm` silently broke every Send for
 * Approval.
 */
export const DIALOG_ACTION = {
  confirm: 'pbm-dialog-action-confirm',
  /** "Send for Approval" - the maker-checker submit. */
  submit: 'pbm-dialog-action-submit',
  cancel: 'pbm-dialog-action-cancel',
  /** Dirty-form guard only, raised when closing a drawer with unsaved changes. */
  stay: 'pbm-dialog-action-stay',
  discard: 'pbm-dialog-action-discard',
  /**
   * Export format choices. VERIFIED on the live export dialog, which is the
   * shared `#pbm-dialog` carrying `pbm-dialog-action-csv` and
   * `pbm-dialog-action-excel` alongside `cancel`.
   *
   * These are the reason `DISMISSIVE_ACTIONS` is not enough on its own: this
   * dialog has TWO non-dismissive actions, so it must be driven by name. See
   * ConfirmDialog.clickAction.
   */
  csv: 'pbm-dialog-action-csv',
  excel: 'pbm-dialog-action-excel',
} as const;

/**
 * Action keys that DISMISS a dialog rather than carry it out. Anything else in
 * the actions row is the affirmative action, whatever it happens to be called.
 */
export const DISMISSIVE_ACTIONS = ['cancel', 'stay'] as const;

/**
 * Toasts. Both hosts are singletons, so the id names "the toast showing now".
 *
 * The application also renders a SECOND toast host, `pbm-toast-notif` (with its
 * own `-summary` / `-detail`), used for notifications rather than for the result
 * of an action. It is deliberately not covered here: assertions about what an
 * action just did should not match a notification that happened to arrive.
 */
export const TOAST = {
  root: 'pbm-toast',
  summary: 'pbm-toast-summary',
  detail: 'pbm-toast-detail',
} as const;

// ---------------------------------------------------------------------------
// Payer list columns and sort keys
// ---------------------------------------------------------------------------

/**
 * Payer list table column keys - the model property name, lowercased. These
 * replace the positional `td:nth-child(n)` reads the framework used before, so
 * a column being reordered or inserted can no longer silently shift an
 * assertion onto the wrong data.
 *
 * `versionstatus` is the "Approval Status" column ("v1 · Published"); it is
 * undocumented in the QA Manual but present in the live table.
 */
export const PAYER_COLUMN = {
  payerName: 'payernameen',
  payerType: 'type',
  code: 'payercode',
  networks: 'linkednetworkscount',
  members: 'linkedmemberscount',
  licenseNumber: 'licensenumber',
  email: 'email',
  phone: 'phonenumber',
  status: 'status',
  approvalStatus: 'versionstatus',
} as const;

export type PayerColumnKey = keyof typeof PAYER_COLUMN;

/**
 * Sort option keys, `{column}-{asc|desc}`. NOTE these are NOT the same tokens
 * as the column keys above - the sort expression uses the sortable field name
 * (`payertypeid`, `statusid`) while the column uses the display property
 * (`type`, `status`). Both were read off the live app.
 */
export const PAYER_SORT_FIELD = {
  payerName: 'payernameen',
  payerType: 'payertypeid',
  code: 'payercode',
  licenseNumber: 'licensenumber',
  email: 'email',
  phone: 'phonenumber',
  status: 'statusid',
} as const;

/** Row actions carry no `-button` suffix (unlike the card actions). */
export type RowAction =
  | 'view'
  | 'edit'
  | 'delete'
  | 'submit-for-approval'
  | 'inactivate'
  | 'activate'
  /** The Network list offers Clone on every row (verified 2026-10-21). */
  | 'clone';

// ---------------------------------------------------------------------------
// Add / Edit Payer wizard
// ---------------------------------------------------------------------------

/** How a wizard control is driven, which decides how a value is written. */
export type FieldKind = 'text' | 'select' | 'date';

export interface WizardField {
  /** Id segment, also the key of the field's `-error` message. */
  key: string;
  kind: FieldKind;
  /** 1-based wizard step the field lives on. */
  step: 1 | 2 | 3;
}

/**
 * Maps the wizard's visible field LABELS - which the specs and test data are
 * written in terms of - onto the drawer's id segments.
 *
 * The label stays the framework's public vocabulary (`fillTextField('Payer
 * Name', ...)`) while every actual locator is built from the id. That keeps the
 * 86 test cases untouched and makes the Arabic run immune to a label rename:
 * the app renamed the Arabic payer-name label once already, which silently
 * broke payer creation until it was tracked down.
 */
export const PAYER_FORM_FIELD: Record<string, WizardField> = {
  'Payer Name': { key: 'name-en', kind: 'text', step: 1 },
  // The Arabic payer-name label, kept as a key for the existing call sites.
  'اسم جهة التغطية': { key: 'name-ar', kind: 'text', step: 1 },
  'Payer Type': { key: 'payer-type', kind: 'select', step: 1 },

  'Email Address': { key: 'email', kind: 'text', step: 2 },
  'Phone Number': { key: 'phone-number', kind: 'text', step: 2 },
  'License Number': { key: 'license-number', kind: 'text', step: 2 },
  Country: { key: 'country', kind: 'select', step: 2 },
  City: { key: 'city', kind: 'select', step: 2 },
  'Preferred Language': { key: 'preferred-language', kind: 'select', step: 2 },
  'Preferred Contact Method': { key: 'preferred-contact-method', kind: 'select', step: 2 },

  'Effective Date': { key: 'effective-date', kind: 'date', step: 3 },
  'Expiry Date': { key: 'expiry-date', kind: 'date', step: 3 },
};

/** Wizard step titles, in order - index + 1 is the stepper bullet number. */
export const PAYER_FORM_STEPS = [
  'Basic Information',
  'Contact Information',
  'Effective Period',
] as const;

// ---------------------------------------------------------------------------
// Advanced search
// ---------------------------------------------------------------------------

/**
 * Advanced-search field keys come from the filter field names in code,
 * lowercased - not from the translated labels.
 */
export const PAYER_ADVANCED_SEARCH_FIELD = {
  nameOrCode: 'searchtext',
  payerType: 'payertypeid',
  status: 'statusid',
  licenseNumber: 'licensenumber',
} as const;

// ---------------------------------------------------------------------------
// Approvals hub
// ---------------------------------------------------------------------------

/** Approvals hub: one tab per module, each with its own id namespace. */
export const APPROVALS_COLUMN = {
  name: 'name',
  changeType: 'changetype',
  payerType: 'type',
  status: 'status',
  email: 'email',
  requestedBy: 'requestedby',
  requestedOn: 'requestedon',
} as const;

export type ApprovalsRowAction = 'review' | 'reject' | 'approve';

// ---------------------------------------------------------------------------
// Payer detail
// ---------------------------------------------------------------------------

/**
 * Payer detail fields, by the label the specs ask for. The detail screen splits
 * its values between a contact block and the Overview tab, which is why the ids
 * are not uniformly prefixed.
 */
export const PAYER_DETAIL_FIELD: Record<string, string> = {
  'Payer Code': 'payer-detail-overview-payer-code',
  'License Number': 'payer-detail-overview-license-number',
  'Effective Date': 'payer-detail-overview-effective-date',
  'Expiry Date': 'payer-detail-overview-expiry-date',
  'Created By': 'payer-detail-overview-created-by',
  'Created At': 'payer-detail-overview-created-on',
  'Created On': 'payer-detail-overview-created-on',
  'Modified By': 'payer-detail-overview-modified-by',
  'Modified At': 'payer-detail-overview-modified-on',
  'Modified On': 'payer-detail-overview-modified-on',
  Country: 'payer-detail-contact-country',
  'Email Address': 'payer-detail-contact-email',
  'Phone Number': 'payer-detail-contact-phone',
  'Preferred Language': 'payer-detail-contact-preferred-language',
  'Preferred Contact Method': 'payer-detail-contact-preferred-contact-method',
};

export const PAYER_DETAIL_TAB = {
  prefix: 'payer-detail-tab-',
  overview: 'payer-detail-tab-overview',
  networks: 'payer-detail-tab-networks',
  policies: 'payer-detail-tab-policies',
  versions: 'payer-detail-tab-versions',
  audit: 'payer-detail-tab-audit',
} as const;

// ---------------------------------------------------------------------------
// Id builders
// ---------------------------------------------------------------------------

/**
 * A CSS selector for a `pbm-button`.
 *
 * A `pbm-button`'s id sits on the PrimeNG `<p-button>` HOST, not on the inner
 * `<button>` - PrimeNG exposes no id input, so the wrapper carries it. This
 * matters far more than it looks: the app disables EVERY button while any HTTP
 * request is in flight, and clicking the host element skips Playwright's
 * "wait until enabled" actionability check. A host click during a pending
 * request is a silent no-op that reports success.
 *
 * Descending to the inner `<button>` makes Playwright wait the busy state out.
 * Native `<button id="...">` elements (nav, close, toolbar triggers, table row
 * actions) carry the id directly, so both shapes are matched here.
 */
export function buttonSelector(id: string): string {
  return `button#${id}, #${id} > button`;
}

/** `#id` - for inputs, containers and `pbm-select` comboboxes alike. */
export function byId(id: string): string {
  return `#${id}`;
}

/** A table row id for a screen namespace, e.g. `payer-list-table-row-{id}`. */
export function rowIdPrefix(screen: string): string {
  return `${screen}-table-row-`;
}

// ---------------------------------------------------------------------------
// Payer list dashboard metrics (KPI band)
// ---------------------------------------------------------------------------

/**
 * The five KPI counters above the payer list, each an `<article>` carrying a
 * `-label` and a `-value` child.
 *
 * VERIFIED against the live application: the band is `payer-list-kpis` and the
 * counters are keyed on the metric name, so the ids are identical in English
 * and Arabic - only the `-label` TEXT is translated ("Total Payers" /
 * "إجمالي جهات التغطية"). That is what lets the bilingual metric assertions
 * read the same locator in both languages.
 */
export const PAYER_KPI = {
  total: 'total',
  active: 'active',
  pending: 'pending',
  inactive: 'inactive',
  expired: 'expired',
} as const;

export type PayerKpiKey = keyof typeof PAYER_KPI;

/** The KPI band container - present whenever the module has loaded. */
export const PAYER_KPI_BAND = 'payer-list-kpis';

/**
 * A KPI counter's element, e.g. `payer-list-kpi-active-value`.
 * `kind` selects the counter's number or its translated caption.
 */
export function payerKpiId(metric: PayerKpiKey, kind: 'label' | 'value'): string {
  return `payer-list-kpi-${PAYER_KPI[metric]}-${kind}`;
}

// ---------------------------------------------------------------------------
// Status badge tone
// ---------------------------------------------------------------------------

/**
 * The colour band a status is rendered in, exposed as `data-tone` on every
 * status badge (`{rowId}-status-badge`, `{cardId}-status-badge`, and the detail
 * header's badge).
 *
 * This attribute - not a CSS class and not a computed colour - is the
 * application's own declaration of which colour a status maps to, and it is
 * language-independent: the Arabic UI renders "نشطة" with `data-tone="active"`.
 * Asserting the tone therefore checks the colour MAPPING the acceptance
 * criteria are about, without hard-coding pixel values that a theme change
 * would invalidate and without reading translated text.
 *
 * `neutral` is undocumented in the QA Manual but present live: it is the tone
 * of "Not Live", the status of a payer whose first version has never been
 * published - a FIFTH status value the manual does not mention.
 */
export const STATUS_TONE = {
  active: 'active',
  pending: 'pending',
  inactive: 'inactive',
  expired: 'expired',
  neutral: 'neutral',
  onHold: 'on-hold',
} as const;

export type StatusTone = (typeof STATUS_TONE)[keyof typeof STATUS_TONE];

/**
 * A row's or card's LIFECYCLE status badge, whose `data-tone` carries the
 * colour band.
 *
 * Verified vocabulary for this badge: Active/active, Inactive/inactive,
 * Expired/expired and "Not Live"/neutral. It never shows "Pending" - see
 * `versionStatusBadgeId`.
 */
export function statusBadgeId(ownerId: string): string {
  return `${ownerId}-status-badge`;
}

/**
 * A row's or card's APPROVAL status badge ("v0 · Pending Approval"), which is a
 * different element from the lifecycle badge and carries its own `data-tone`.
 *
 * This distinction matters and is easy to get wrong. The two columns describe
 * different things:
 *
 *   Status          the lifecycle of the currently PUBLISHED version -
 *                   Active / Inactive / Expired, or "Not Live" when no version
 *                   has been published yet.
 *   Approval Status the state of the LATEST version - "v1 · Published"
 *                   (tone `active`), "v0 · Pending Approval" (tone `pending`),
 *                   "v1 · Draft" (tone `on-hold`).
 *
 * So a payer awaiting approval reads "Not Live" in Status and "Pending
 * Approval" in Approval Status. The amber PENDING colour band lives on THIS
 * badge; looking for it on the lifecycle badge finds nothing and wrongly reads
 * as a missing colour mapping.
 */
export function versionStatusBadgeId(ownerId: string): string {
  return `${ownerId}-version-status`;
}

// ---------------------------------------------------------------------------
// Payer cards view
// ---------------------------------------------------------------------------

/**
 * The cards view of the payer list.
 *
 * A DIFFERENT id namespace from the table (`payer-card-{id}` rather than
 * `payer-list-table-row-{id}`), with its own field ids and `-button`-suffixed
 * actions - which is exactly why ListPageBase forces Table view before every
 * row assertion. The cards are addressed here only because the localized-name
 * story has to prove the SAME name renders in the list, on the card, and in the
 * detail header.
 */
export const PAYER_CARDS_CONTAINER = 'payer-list-cards';
export const PAYER_CARD_PREFIX = 'payer-card-';

/** A card's field, by the segment the card id folds in. */
export const PAYER_CARD_FIELD = {
  title: 'title',
  typeTag: 'type-tag',
  versionStatus: 'version-status',
  code: 'code',
  networks: 'networks-count',
  members: 'members-count',
  status: 'status',
  email: 'email',
  phone: 'phone',
} as const;

export type PayerCardFieldKey = keyof typeof PAYER_CARD_FIELD;

// ---------------------------------------------------------------------------
// Payer detail - Version History tab
// ---------------------------------------------------------------------------

/**
 * The Version History tab's table; `PAYER_DETAIL_TAB.versions` activates it.
 *
 * VERIFIED live: the tab renders a table in the SAME shared shape as every
 * other list in the application - `{namespace}-table-row-{id}-cell-{key}` - so
 * the column keys below are model property names, not header captions.
 *
 * Note the live tab lists one row per APPROVAL REQUEST, including requests
 * still in "Pending Approval" - see data/payers/versionHistory.data.ts for what
 * the acceptance criteria require instead.
 */
export const PAYER_VERSIONS_SCREEN = 'payer-detail-versions';

export const PAYER_VERSION_COLUMN = {
  version: 'version',
  changeType: 'changetype',
  status: 'status',
  requestedBy: 'requestedby',
  requestedOn: 'requestedon',
  reviewedBy: 'reviewedby',
  reviewedOn: 'reviewedon',
} as const;

export type PayerVersionColumnKey = keyof typeof PAYER_VERSION_COLUMN;

/**
 * The drawer a version row's View action opens.
 *
 * VERIFIED: the drawer HOST element is present but never reports as visible -
 * it is a PrimeNG `p-drawer` wrapper with no box of its own, and the rendered
 * panel is its child. Asserting on the host therefore fails on a drawer that is
 * plainly open on screen, so `-title` is what a test must wait for.
 */
export const PAYER_VERSION_DRAWER = 'payer-detail-version-drawer';
export const PAYER_VERSION_DRAWER_TITLE = 'payer-detail-version-drawer-title';

/**
 * The payer detail tab strip marks its active tab with a CSS class and exposes
 * no `aria-selected` or `role="tab"` - verified across all five tabs, before
 * and after switching.
 *
 * So the class is the only signal the application offers for "this tab is
 * showing", exactly as `PAGER_ACTIVE_CLASS` is for the current page. Reading it
 * is a sanctioned exception; the tab itself is still located by its id.
 */
export const PAYER_DETAIL_ACTIVE_TAB_CLASS = 'is-active';

// ---------------------------------------------------------------------------
// Payer detail - Audit History tab
// ---------------------------------------------------------------------------

/**
 * The Audit History tab is a TIMELINE (a `<ul>` of `<li>`), not a table - so it
 * carries no `-cell-` ids and is read per entry rather than per column.
 */
export const PAYER_AUDIT = {
  /** Gone in the build seen 2026-10-11 - kept for older builds; see `bar`. */
  filters: 'payer-detail-audit-filters',
  /**
   * The audit panel's header bar and search, read off the live tab on
   * 2026-10-11. The old filter strip ("-filters") no longer exists; the panel
   * opens on this bar, with the type and date filters behind Advanced search.
   */
  bar: 'payer-detail-audit-bar',
  /**
   * The filters now live in a DRAWER ("Advance Search for Audit History"),
   * opened by the filter icon beside the search box and applied by its Search
   * button - read off the live tab 2026-10-11. The old inline controls
   * ("-action-select", "-date-range-input") no longer exist.
   */
  advancedSearch: 'payer-detail-audit-advanced-search',
  filterToggle: 'payer-detail-audit-search-filter-button',
  advancedSearchApply: 'payer-detail-audit-advanced-search-search-button',
  advancedSearchCancel: 'payer-detail-audit-advanced-search-cancel-button',
  actorInput: 'payer-detail-audit-advanced-search-field-actorlabel-input',
  actionSelect: 'payer-detail-audit-advanced-search-field-actiontype-input',
  dateRangeInput: 'payer-detail-audit-advanced-search-field-daterange-input',
  timeline: 'payer-detail-audit-timeline',
  rowPrefix: 'payer-detail-audit-row-',
  /** Each entry's only action: `{rowPrefix}{id}-view-details`. */
  viewDetailsSuffix: 'view-details',
  detailDrawer: 'payer-detail-audit-detail-drawer',
  /**
   * The entry drawer - VERIFIED live. Its diff table lists one row per changed
   * field: `{detailRowPrefix}{fieldkey}-field|-before|-after`.
   */
  detailDrawerTitle: 'payer-detail-audit-detail-drawer-title',
  detailDrawerClose: 'payer-detail-audit-detail-drawer-close',
  detailSummary: 'payer-detail-audit-detail-drawer-summary',
  detailActionChip: 'payer-detail-audit-detail-drawer-action-chip',
  detailEntityType: 'payer-detail-audit-detail-drawer-entity-type',
  detailEntityId: 'payer-detail-audit-detail-drawer-entity-id',
  detailMeta: 'payer-detail-audit-detail-drawer-meta',
  detailDiffTable: 'payer-detail-audit-detail-drawer-diff-table',
  detailRowPrefix: 'payer-detail-audit-detail-drawer-row-',
  /**
   * The date-range picker's day cells carry `data-date="YYYY-M-D"` with a
   * ZERO-BASED month (PrimeNG). Typing into the input applies nothing; a range
   * is chosen by clicking two day cells, which fires the trail request with
   * `fromUtc`/`toUtc`.
   */
  calendarDayAttribute: 'data-date',
} as const;

/** Detail-header elements beyond PAYER_DETAIL_FIELD's label-to-id value map. */
/**
 * The what-to-do-next status banners on the payer detail (view) screen.
 *
 * VERIFIED live: a draft payer shows #payer-detail-draft-hint reading "This payer is a
 * draft. It is not live yet ...", and a pending payer shows #payer-detail-pending-hint.
 * The rejected banner follows the same {state}-hint convention. Any of them can be found
 * by the shared suffix, which BANNER_ANY matches.
 */
export const PAYER_DETAIL_BANNER = {
  draft: 'payer-detail-draft-hint',
  pending: 'payer-detail-pending-hint',
  rejected: 'payer-detail-rejected-hint',
} as const;

/** Matches whichever status-hint banner is on the detail screen. */
export const BANNER_ANY = '[id^="payer-detail-"][id$="-hint"]';

export const PAYER_DETAIL_HEADER = {
  name: 'payer-detail-name',
  nameAr: 'payer-detail-overview-payer-name-ar',
  versionBadge: 'payer-detail-version-badge',
  typeTag: 'payer-detail-type-tag',
  statusBadge: 'payer-detail-status-badge',
  pendingHint: 'payer-detail-pending-hint',
  tabs: 'payer-detail-tabs',
} as const;

// ---------------------------------------------------------------------------
// Cross-module payer selection
// ---------------------------------------------------------------------------

/**
 * The shared payer selection control, as each CONSUMING module exposes it.
 *
 * Three surfaces were found live, all backed by the same
 * `GET /api/Payers/GetPayersDropdown` interface:
 *
 *   plan-form-drawer-payer-id-select   the Add Plan wizard's Payer field
 *   plan-list-filter-payer-select      the Plans list's "filter by payer"
 *   network-list-filter-payer-select   the Networks list's "filter by payer"
 *
 * Two independent consumers is what makes the cross-module consistency case
 * checkable at all.
 */
/**
 * The "Select a Payer" gate a SCOPED account meets before any payer screen
 * shows data. Added by the application on or before 21 September 2026; the
 * administrator never sees it. See pages/components/PayerScopeDialog.ts.
 */
export const PAYER_SCOPE_DIALOG = {
  select: 'pbm-dialog-select',
} as const;

export const PAYER_SELECT = {
  planForm: 'plan-form-drawer-payer-id-select',
  planListFilter: 'plan-list-filter-payer-select',
  networkListFilter: 'network-list-filter-payer-select',
  // ---- plan folder 24 additions (2026-10-27) ----
  /**
   * The top-bar payer scope selector (the same id as GLOBAL.payerScopeSelect),
   * read as a dropdown: the Plans module's "Payer filter" for a payer-scoped
   * user (US 14335), as it is the network directory's (US 14302).
   */
  topBarScope: 'app-breadcrumb-payer-select',
} as const;

export type PayerSelectSurface = keyof typeof PAYER_SELECT;

/** Consuming list modules that own a payer filter of their own. */
export const CONSUMING_SCREEN = {
  planList: 'plan-list',
  networkList: 'network-list',
  /**
   * The Policies module. It owns no payer filter of its own, so it is not a
   * consumer in the cross-module sense - it is listed here because the
   * cascade story has to read a payer's policies to see whether inactivating
   * the payer carried them with it.
   */
  policyList: 'policy-list',
} as const;

/**
 * The Plan list's columns, as its cell ids carry them.
 *
 * Read off the live table. Note "plancode" where the network list says "code":
 * the id conventions are per module, not global, so each list needs its own
 * map. A key borrowed from a neighbouring module reads every cell as empty,
 * which does not fail - it quietly answers "no such record".
 */
export const PLAN_COLUMN = {
  name: 'name',
  code: 'plancode',
  payer: 'payer',
  formulary: 'formulary',
  approvalStatus: 'versionstatus',
  effectiveDate: 'effectivedate',
  status: 'status',
} as const;

/** The ids a detail screen's Audit History tab is built from (components/AuditHistoryTab). */
export interface AuditTabIds {
  searchInput: string;
  /** The id prefix the tab's advanced-search drawer namespaces its fields under. */
  searchPrefix: string;
  advancedSearchButton: string;
  advancedSearch: string;
  chips: string;
  viewButton: string;
  pager: string;
  drawer: {
    title: string;
    action: string;
    entityType: string;
    entityId: string;
    meta: string;
    diffTable: string;
    rowPrefix: string;
    close: string;
  };
}

/** The shared "Audit Entry" drawer - one component for every module (verified 2026-10-21 / 2026-10-27). */
export const AUDIT_ENTRY_DRAWER = {
  title: 'audit-log-detail-drawer-title',
  action: 'audit-log-detail-drawer-action-chip',
  entityType: 'audit-log-detail-drawer-entity-type',
  entityId: 'audit-log-detail-drawer-entity-id',
  meta: 'audit-log-detail-drawer-meta',
  diffTable: 'audit-log-detail-drawer-diff-table',
  rowPrefix: 'audit-log-detail-drawer-row-',
  close: 'audit-log-detail-drawer-close-button',
} as const;

// ---- Plans module (Feature 14144) - every id below read off the live screens, 2026-10-27 ----

/** The Plans list (`/plans-management`) - the same id conventions as the network list. */
export const PLAN_LIST = {
  screen: 'plan-list',
  kpiBand: 'plan-list-kpis',
  /** `${kpi}-label` and `${kpi}-value` hang off each. "pending" is labelled "Future Plans". */
  kpi: {
    total: 'plan-list-kpi-total',
    active: 'plan-list-kpi-active',
    pending: 'plan-list-kpi-pending',
    inactive: 'plan-list-kpi-inactive',
    expired: 'plan-list-kpi-expired',
  },
  typeFilter: 'plan-list-filter-type-select',
  statusFilter: 'plan-list-filter-status-select',
  advancedSearchButton: 'plan-list-search-filter-button',
  advancedSearch: 'plan-list-advanced-search',
  chips: 'plan-list-filter-chips',
  sortTrigger: 'plan-list-sort-trigger',
  sortMenu: 'plan-list-sort-menu',
  sortOptionPrefix: 'plan-list-sort-option-',
  addButton: 'plan-list-add-button',
  importTrigger: 'plan-list-import-trigger',
  tableBody: 'plan-list-table-body',
  /** Card view: `plan-card-{id}` with `-title`, `-code`, `-payer`, `-status`, `-view-button`, ... */
  cards: 'plan-list-cards',
  cardPrefix: 'plan-card-',
  viewToggleTable: 'app-breadcrumb-view-toggle-table',
  viewToggleCards: 'app-breadcrumb-view-toggle-cards',
} as const;

export type PlanKpiKey = keyof typeof PLAN_LIST.kpi;

/** The Plans list's Export menu - the same two-step flow as the network list's. */
export const PLAN_EXPORT = {
  root: 'plan-list-export',
  trigger: 'plan-list-export-trigger',
  menu: 'plan-list-export-menu',
  selected: 'plan-list-export-selected',
  all: 'plan-list-export-all',
  template: 'plan-list-export-template',
} as const;

/** Sort By option ids are `plan-list-sort-option-{field}-{asc|desc}`. */
export const PLAN_SORT_FIELD = {
  name: 'plannameen',
  code: 'plancode',
  type: 'plantypeid',
  status: 'statusid',
  effectiveDate: 'effectivedate',
  expiryDate: 'expirydate',
  createdOn: 'createdon',
  modifiedOn: 'modifiedon',
} as const;

export type PlanSortColumn = keyof typeof PLAN_SORT_FIELD;

/** The Plans list's Advanced Search criteria (`plan-list-advanced-search-field-{key}`). */
export const PLAN_ADVANCED_SEARCH_FIELD = {
  nameOrCode: 'searchtext',
  type: 'plantypeid',
  status: 'statusid',
  approvalStatus: 'approvalstatus',
  // ---- plan folder 10 additions (2026-10-27) ----
  /** The Payer criterion US 14159 requires - inferred 2026-10-27, not yet verified live. */
  payer: 'payerid',
} as const;

/** A criterion of the Plans list's Advanced Search, by PLAN_ADVANCED_SEARCH_FIELD key (plan folder 10, 2026-10-27). */
export type PlanSearchField = keyof typeof PLAN_ADVANCED_SEARCH_FIELD;

export const PLAN_FORM_PREFIX = 'plan-form-drawer';

/** The Add / Edit Plan wizard: step 1 Basic Information, step 2 Effective Period. */
export const PLAN_FORM_FIELD: Record<string, WizardField> = {
  'Plan Name': { key: 'plan-name-en', kind: 'text', step: 1 },
  'Plan Name (Arabic)': { key: 'plan-name-ar', kind: 'text', step: 1 },
  Payer: { key: 'payer-id', kind: 'select', step: 1 },
  'Plan Type': { key: 'plan-type-id', kind: 'select', step: 1 },
  Description: { key: 'description-en', kind: 'text', step: 1 },
  'Description (Arabic)': { key: 'description-ar', kind: 'text', step: 1 },
  'Effective Date': { key: 'effective-date', kind: 'date', step: 2 },
  'Expiry Date': { key: 'expiry-date', kind: 'date', step: 2 },
};

export const PLAN_FORM = {
  title: 'plan-form-drawer-title',
  close: 'plan-form-drawer-close',
  /** "Important: This plan will be submitted for approval ..." (step 1 and step 2). */
  importantNotice: 'plan-form-drawer-important-title-message',
  /** The read-only payer tag shown while a payer is in the top-bar scope (verified 2026-10-27). */
  payerTag: 'plan-form-drawer-payer-id-tag',
} as const;

/** The plan detail screen (`/plans-management/{id}`). */
export const PLAN_DETAIL = {
  root: 'plan-detail',
  headerCard: 'plan-detail-header-card',
  name: 'plan-detail-name',
  statusBadge: 'plan-detail-status-badge',
  versionBadge: 'plan-detail-version-badge',
  /** "Important: A change to this plan is awaiting approval ..." */
  notice: 'plan-detail-important-title-message-text',
  tabs: 'plan-detail-tabs',
  tab: {
    overview: 'plan-detail-tab-overview',
    formulary: 'plan-detail-tab-formulary',
    benefits: 'plan-detail-tab-benefits',
    versions: 'plan-detail-tab-versions',
    audit: 'plan-detail-tab-audit',
  },
  /** Header actions, `plan-detail-{action}-button`; offered by state. */
  action: {
    edit: 'plan-detail-edit-button',
    clone: 'plan-detail-clone-button',
    delete: 'plan-detail-delete-button',
    inactivate: 'plan-detail-inactivate-button',
    activate: 'plan-detail-activate-button',
    submit: 'plan-detail-submit-for-approval-button',
  },
  /** Overview fields, `plan-detail-overview-{key}`. */
  overview: {
    code: 'plan-detail-overview-plan-code',
    payer: 'plan-detail-overview-payer',
    type: 'plan-detail-overview-plan-type',
    nameEn: 'plan-detail-overview-plan-name-en',
    nameAr: 'plan-detail-overview-plan-name-ar',
    description: 'plan-detail-overview-description',
    effectiveDate: 'plan-detail-overview-effective-date',
    expiryDate: 'plan-detail-overview-expiry-date',
    createdAt: 'plan-detail-overview-created-at',
    lastUpdated: 'plan-detail-overview-last-updated',
    // ---- plan folder 07 additions (2026-10-27) ----
    /** inferred 2026-10-27, not yet verified live - the "Created By" metadata US 14155 asks for. */
    createdBy: 'plan-detail-overview-created-by',
  },
} as const;

// ---- plan folder 07 / 16 additions (2026-10-27) ----

/** The shell's breadcrumb trail ("Dashboard > Plans Mgmt > <name>") - the id PlanDetailPage.getBreadcrumb reads. */
export const APP_BREADCRUMB = {
  list: 'app-breadcrumb-list',
} as const;

/**
 * Row-action suffixes for the approval decisions US 14168 asks the Plans list to
 * offer while a change is Pending Approval (`{rowId}-{action}`, the RowAction
 * convention). inferred 2026-10-27, not yet verified live - the live rows
 * offered none of them on 2026-10-27.
 */
export const PLAN_ROW_DECISION_ACTION = {
  approve: 'approve',
  reject: 'reject',
  recall: 'recall',
} as const;

export type PlanRowDecisionAction = keyof typeof PLAN_ROW_DECISION_ACTION;

export type PlanDetailTab = keyof typeof PLAN_DETAIL.tab;
export type PlanOverviewField = keyof typeof PLAN_DETAIL.overview;

/** The plan detail's Audit History tab - the shared component (components/AuditHistoryTab). */
export const PLAN_AUDIT = {
  searchInput: 'plan-detail-audit-search-input',
  searchPrefix: 'plan-detail-audit',
  advancedSearchButton: 'plan-detail-audit-search-filter-button',
  advancedSearch: 'plan-detail-audit-advanced-search',
  chips: 'plan-detail-audit-filter-chips',
  /** locator-exception: every entry's button shares this id; entries have none. */
  viewButton: 'plan-detail-view-audit-button',
  pager: 'plan-detail-audit-pager',
  drawer: AUDIT_ENTRY_DRAWER,
} as const satisfies AuditTabIds;

/** The plan detail's Version History tab (`plan-detail-versions-table`). */
export const PLAN_VERSIONS = {
  searchInput: 'plan-detail-versions-search-input',
  table: 'plan-detail-versions-table',
  /** Rows `plan-detail-versions-table-row-{id}`, cells `-cell-{version|status|changetype|reason|requestedby|requestedon|reviewedby|reviewedon}`. */
  rowPrefix: 'plan-detail-versions-table-row-',
  /** locator-exception: every row's View button shares this id. */
  viewButton: 'plan-detail-view-version-button',
  pager: 'plan-detail-versions-table-pager',
} as const;

/** The plan detail's Formulary Assignment tab. */
export const PLAN_FORMULARY_TAB = {
  /** The picker shown while no formulary is assigned, and its Assign button. */
  select: 'plan-detail-selected-formulary-id-select',
  assignButton: 'plan-detail-assign-formulary-button',
  /** Shown once one is assigned. */
  viewButton: 'plan-detail-view-formulary-button',
  removeButton: 'plan-detail-remove-formulary-button',
  /** The assignment's state badge ("Draft Assignment", "Pending Approval", "Future", ...). */
  stateBadge: 'plan-detail-last-updated-badge',
} as const;

// ---- plan folder 04 / 20 / 21 additions (2026-10-27) ----

/**
 * More of the Formulary Assignment tab. Each assignment card (one per formulary
 * the plan has had, per version) carries the shared state badge above and no id
 * of its own; the picker's field error is inferred 2026-10-27, not yet verified live.
 */
export const PLAN_FORMULARY_TAB_EXTRA = {
  /** Inferred 2026-10-27, not yet verified live - where a required-field error would render. */
  selectError: 'plan-detail-selected-formulary-id-error',
} as const;

// ---- plan folder 27 additions (2026-10-27) ----

/**
 * The formulary detail screen (`/formulary-pricing/{id}`). Read off the
 * application's own bundle on 2026-10-27, not yet verified live.
 */
export const FORMULARY_DETAIL = {
  root: 'formulary-detail',
  headerCard: 'formulary-detail-header-card',
  name: 'formulary-detail-name',
  statusBadge: 'formulary-detail-status-badge',
  versionBadge: 'formulary-detail-version-badge',
  notice: 'formulary-detail-important-title-message',
  tabs: 'formulary-detail-tabs',
  action: {
    edit: 'formulary-detail-edit-button',
    clone: 'formulary-detail-clone-button',
    delete: 'formulary-detail-delete-button',
    setActive: 'formulary-detail-set-active-button',
    submit: 'formulary-detail-submit-for-approval-button',
    revert: 'formulary-detail-revert-button',
  },
  overview: {
    code: 'formulary-detail-overview-formulary-code',
    payer: 'formulary-detail-overview-payer',
    description: 'formulary-detail-overview-description',
    effectiveDate: 'formulary-detail-overview-effective-date',
    expiryDate: 'formulary-detail-overview-expiry-date',
    totalTiers: 'formulary-detail-overview-total-tiers',
    totalTrades: 'formulary-detail-overview-total-trades',
  },
} as const;

/**
 * The Add / Edit Formulary drawer (`formulary-form-drawer`). In edit mode the
 * payer renders as a read-only tag; a payer the user may choose renders as the
 * select. Read off the bundle on 2026-10-27, not yet verified live.
 */
export const FORMULARY_FORM = {
  root: 'formulary-form-drawer',
  payerSelect: 'formulary-form-drawer-payer-id-select',
  payerTag: 'formulary-form-drawer-payer-id-tag',
  payerError: 'formulary-form-drawer-payer-id-error',
  /** Inferred 2026-10-27 from the plan form's `-close`, not yet verified live. */
  close: 'formulary-form-drawer-close',
} as const;

/** The Inactivate Plan drawer - the network's drawer component, reason (lookup) and optional details. */
export const PLAN_INACTIVATE = {
  root: 'plan-inactivate-dialog',
  title: 'plan-inactivate-dialog-title',
  close: 'plan-inactivate-dialog-close',
  reasonSelect: 'plan-inactivate-dialog-reason-id-select',
  reasonError: 'plan-inactivate-dialog-reason-id-error',
  detailsInput: 'plan-inactivate-dialog-details-input',
  detailsError: 'plan-inactivate-dialog-details-error',
  approvalNotice: 'plan-inactivate-dialog-approval-notice-text',
  cancel: 'plan-inactivate-dialog-cancel-button',
  save: 'plan-inactivate-dialog-save-button',
} as const satisfies InactivateDialogIds;

/** The Policy list's columns, as its cell ids carry them. */
export const POLICY_COLUMN = {
  name: 'name',
  number: 'number',
  type: 'type',
  plan: 'plan',
  payer: 'payer',
  holder: 'holder',
  status: 'status',
  effectiveDate: 'effectivedate',
  expiryDate: 'expirydate',
  members: 'members',
  approvalStatus: 'versionstatus',
} as const;

/**
 * The Network list's columns, as the model-property keys its cell ids carry.
 *
 * Read off the live table, where each cell id is the row id plus "-cell-" plus
 * the key below. They are SHORTER than the payer list's and shorter than the
 * payer detail screen's own Linked Networks table, which spells the same
 * columns out in full (networkname, networkcode) - so the two tables cannot
 * share one set of keys, and a key guessed from the other table reads every
 * cell as empty rather than failing. That is exactly how a status sample came
 * back "no network in the environment displays Inactive" while three did.
 *
 * The network-activation story needs the Payer column as well as the Status
 * one - its whole question is whether the two are independent.
 */
export const NETWORK_COLUMN = {
  networkName: 'name',
  code: 'code',
  payer: 'payer',
  networkType: 'type',
  status: 'status',
  effectiveDate: 'effectivedate',
  expiryDate: 'expirydate',
  facilities: 'facilities',
  linkedPolicies: 'policies',
  approvalStatus: 'versionstatus',
} as const;

/**
 * The payer detail screen's Linked Networks table.
 *
 * A different table from the Network list, with its own row prefix, and the
 * only place the payer-to-network link is visible. It carries the network
 * status AND the assignment state, which are separate things: a network can be
 * Active while its assignment is still Pending Addition.
 */
export const PAYER_LINKED_NETWORKS = {
  rowPrefix: 'payer-detail-networks-table-row-',
  /** Column headers: `payer-detail-networks-table-th-{cellKey}`. */
  headerPrefix: 'payer-detail-networks-table-th-',
  nameCell: 'networkname',
  codeCell: 'networkcode',
  /**
   * The Facilities column - VERIFIED live: the cell key is `networkfacilities`
   * and a network with nothing attached renders "0", not the dash the payer
   * list uses for a zero count.
   */
  facilitiesCell: 'networkfacilities',
  statusCell: 'status',
  assignmentStateCell: 'assignmentstate',
  /** The section's own search box and its maker-checker hint line. */
  searchInput: 'payer-detail-networks-search-input',
  hint: 'payer-detail-networks-hint',
} as const;

/**
 * The payer detail screen's Linked Policies section.
 *
 * VERIFIED live on a payer with no policies: activating the tab renders this
 * search bar and an un-id'd empty-state sentence ("No policies are linked to
 * this payer yet."), no table, and fires no request. Every id the section
 * carries starts with `prefix`, which is how a reader can say what the section
 * contains without knowing the ids a policy table would carry if one rendered.
 */
export const PAYER_LINKED_POLICIES = {
  prefix: 'payer-detail-policies',
  table: 'payer-detail-policies-table',
  paginator: 'payer-detail-policies-paginator',
  searchInput: 'payer-detail-policies-search-input',
  filterButton: 'payer-detail-policies-search-filter-button',
} as const;

// ---------------------------------------------------------------------------
// System Settings > Settings > General
// ---------------------------------------------------------------------------

/**
 * The General settings card and its edit drawer.
 *
 * VERIFIED live. The read view carries only the Edit button as an id - its
 * values are plain text - so a reader takes values from the drawer's inputs.
 * The three lifecycle job schedules are single CRON expressions in UTC, one
 * input each; the drawer performs NO client-side validation (an invalid or
 * empty CRON leaves Save enabled and shows nothing), the server refuses on
 * save with 422 and a toast. Save and Cancel are `<p-button>` wrappers whose
 * inner button carries no id - clicking the wrapper reaches it.
 */
export const SETTINGS_GENERAL = {
  tabs: 'settings-hub-tabs',
  generalTab: 'settings-hub-tab-general',
  editButton: 'settings-general-edit-button',
  drawer: 'settings-general-drawer',
  drawerTitle: 'settings-general-drawer-title',
  drawerClose: 'settings-general-drawer-close',
  saveButton: 'settings-general-drawer-save-button',
  cancelButton: 'settings-general-drawer-cancel-button',
  siteTimezoneSelect: 'settings-general-site-timezone-select',
  siteTitleInput: 'settings-general-site-title-input',
  jobs: {
    network: 'settings-general-jobs-networklifecyclecron-input',
    payer: 'settings-general-jobs-payerlifecyclecron-input',
    policy: 'settings-general-jobs-policylifecyclecron-input',
  },
} as const;

export type LifecycleJob = keyof typeof SETTINGS_GENERAL.jobs;

// ---------------------------------------------------------------------------
// System Settings > Audit Logs
// ---------------------------------------------------------------------------

/**
 * The system-wide audit log: a list in the SAME shared shape as every other
 * list (`audit-log-list-table-row-{id}-cell-{key}`), so ListPageBase drives it.
 * Its System Log tab lists every entity change - PayerVersion rows appear for
 * payer edits and approvals.
 */
export const AUDIT_LOG = {
  screen: 'audit-log-list',
  tabs: 'audit-logs-hub-tabs',
  systemLogTab: 'audit-logs-hub-tab-system-log',
} as const;

/** The audit log's columns, as its cell ids carry them. */
export const AUDIT_LOG_COLUMN = {
  occurredAt: 'occurredatutc',
  actionType: 'actiontype',
  entityType: 'entitytype',
  entityId: 'entityid',
  actor: 'actor',
} as const;

// ---------------------------------------------------------------------------
// Inactivate Payer / Network drawers
// ---------------------------------------------------------------------------

/**
 * The Inactivate NETWORK drawer - a different element from the payer one, with
 * different field ids. Verified live: the reason select is -reason-id-select
 * (not -reason-select) and the affirmative action is -save-button (not
 * -confirm-button), so the two drawers cannot share one set of ids.
 *
 * Note also that only INACTIVATION uses a drawer. Activating a network raises
 * the shared #pbm-dialog instead.
 */
/** The ids of an "Inactivate <record>" drawer - one component for networks and plans. */
export interface InactivateDialogIds {
  root: string;
  title: string;
  close: string;
  reasonSelect: string;
  reasonError: string;
  detailsInput: string;
  detailsError: string;
  approvalNotice: string;
  cancel: string;
  save: string;
}

export const NETWORK_INACTIVATE_DIALOG = {
  root: 'network-inactivate-dialog',
  title: 'network-inactivate-dialog-title',
  close: 'network-inactivate-dialog-close',
  reasonSelect: 'network-inactivate-dialog-reason-id-select',
  reasonError: 'network-inactivate-dialog-reason-id-error',
  detailsInput: 'network-inactivate-dialog-details-input',
  detailsError: 'network-inactivate-dialog-details-error',
  /** "Needs approval. Switching this saves a draft ..." - verified 2026-10-21. */
  approvalNotice: 'network-inactivate-dialog-approval-notice-text',
  cancel: 'network-inactivate-dialog-cancel-button',
  save: 'network-inactivate-dialog-save-button',
} as const satisfies InactivateDialogIds;


/**
 * Inactivating a payer does NOT use the shared confirmation dialog.
 *
 * VERIFIED, and it contradicts DIALOG's claim that one dialog serves every
 * confirmation in the application: the inactivate row action opens a dedicated
 * right-hand drawer, `payer-inactivate-dialog`, with its own reason select,
 * free-text details field, impact summary and its own cancel/confirm buttons.
 * `#pbm-dialog` never renders for this action - so driving it through
 * ConfirmDialog waits out a full timeout on a dialog that was never coming.
 *
 * The impact summary is the reason this is a drawer rather than a dialog: it
 * previews what inactivating the payer will affect, which is a whole user story
 * of its own.
 */
export const PAYER_INACTIVATE_DIALOG = {
  root: 'payer-inactivate-dialog',
  title: 'payer-inactivate-dialog-title',
  close: 'payer-inactivate-dialog-close',
  body: 'payer-inactivate-dialog-body',
  warning: 'payer-inactivate-dialog-warning',
  impact: 'payer-inactivate-dialog-impact',
  impactSummary: 'payer-inactivate-dialog-impact-summary',
  reasonSelect: 'payer-inactivate-dialog-reason-select',
  /** The required-reason message, which appears only after a blocked confirm. */
  reasonError: 'payer-inactivate-dialog-reason-error',
  detailsInput: 'payer-inactivate-dialog-details-input',
  cancel: 'payer-inactivate-dialog-cancel-button',
  confirm: 'payer-inactivate-dialog-confirm-button',
} as const;

/**
 * The pager's page buttons collapse beyond seven pages, so "which page is
 * showing" is read from the active button's class rather than from an
 * accessible attribute the pager does not expose.
 *
 * locator-exception: `is-active` is the only signal the application offers for
 * the CURRENT page - the buttons carry no `aria-current` - and the page-state
 * assertions exist precisely to check it. The id prefix still scopes the
 * lookup, so this can never drift onto another table's pager.
 */
export const PAGER_ACTIVE_CLASS = 'is-active';

/**
 * The approvals hub's tab strip. Which module tabs it carries depends on the
 * session's permissions - VERIFIED a Payer Admin gets Network, Policy,
 * Formulary and Registrations but no Payer tab - so the strip is read, not
 * assumed, by the permission cases.
 */
export const APPROVALS_HUB = {
  tabs: 'approvals-hub-tabs',
  tabPrefix: 'approvals-hub-tab-',
} as const;

// ---------------------------------------------------------------------------
// List export
// ---------------------------------------------------------------------------

/**
 * Exporting is TWO steps, which is easy to get wrong: the toolbar trigger opens
 * a small menu offering "Selected Export" / "Export All Data", and only then
 * does the shared `#pbm-dialog` appear asking for a FORMAT (CSV or Excel).
 *
 * VERIFIED against the live list. A test that clicks `-export-all` and waits
 * for a download waits forever, because nothing is downloaded until a format is
 * chosen. The format dialog is the reason ConfirmDialog needed `clickAction` -
 * it offers two affirmative actions, so "the first non-dismissive one" picks
 * CSV when the test asked for Excel.
 */
export const PAYER_EXPORT = {
  root: 'payer-list-export',
  trigger: 'payer-list-export-trigger',
  menu: 'payer-list-export-menu',
  /** Exports only the rows ticked in the table. */
  selected: 'payer-list-export-selected',
  /** Exports the whole register, ignoring the current filter. */
  all: 'payer-list-export-all',
} as const;

/** The format dialog's action keys, used with ConfirmDialog.clickAction(). */
export const EXPORT_FORMAT = {
  csv: 'csv',
  excel: 'excel',
} as const;

export type ExportFormat = keyof typeof EXPORT_FORMAT;

/**
 * Column headers in the exported CSV, exactly as the file writes them.
 *
 * Read off a real download rather than assumed from the grid: the export
 * carries a `Dial Code` column the table does not show, and its header is
 * "License Number" (US spelling) even where the UI says Licence. Addressing
 * export columns by name means a reordered export cannot shift an assertion
 * onto the wrong field.
 */
export const PAYER_EXPORT_COLUMN = {
  code: 'Payer Code',
  nameEn: 'Payer Name',
  nameAr: 'Payer Name (Arabic)',
  payerType: 'Payer Type',
  email: 'Email',
  dialCode: 'Dial Code',
  phone: 'Phone Number',
  licenseNumber: 'License Number',
  status: 'Status',
  effectiveDate: 'Effective Date',
  expiryDate: 'Expiry Date',
  networks: 'Linked Networks',
  members: 'Linked Members',
} as const;

// ---------------------------------------------------------------------------
// Approval (version) status vocabulary
// ---------------------------------------------------------------------------

/**
 * Every approval-status value the application actually produces, with the
 * Arabic label it renders.
 *
 * WHERE EACH ONE LIVES, because it is not one screen: `pendingApproval`,
 * `published` and `draft` appear in the payer list's Approval Status cell
 * (`{row}-version-status`), while `superseded` and `rejected` appear only in a
 * payer's Version History tab - a payer's CURRENT version is never superseded
 * by definition, so the list cannot show it.
 *
 * `withdrawn` is DELIBERATELY ABSENT. The Arabic-labels story asks for five
 * statuses including Withdrawn (مسحوب); the live application offers no such
 * status and no Withdraw action anywhere - not on a list row, not on a version
 * row, not in the approvals hub. Listing it here as though it existed would
 * make a test pass against a value the application never emits, so the expected
 * vocabulary lives in data/payers/approvalStatus.data.ts and is checked AGAINST
 * this map. That is what turns "Withdrawn is missing" into a reported failure
 * rather than a silent omission.
 */
export const APPROVAL_STATUS = {
  pendingApproval: { en: 'Pending Approval', ar: 'بانتظار الموافقة', tone: 'pending' },
  published: { en: 'Published', ar: 'منشور', tone: 'active' },
  superseded: { en: 'Superseded', ar: 'مُستبدَل', tone: 'on-hold' },
  rejected: { en: 'Rejected', ar: 'مرفوض', tone: 'expired' },
  draft: { en: 'Draft', ar: 'مسودة', tone: 'on-hold' },
} as const;

export type ApprovalStatusKey = keyof typeof APPROVAL_STATUS;

// ---------------------------------------------------------------------------
// Role administration / permission catalogue
// ---------------------------------------------------------------------------

/** The role list screen: cards only - this screen has no table view. */
export const ROLE_LIST = {
  root: 'role-list',
  toolbar: 'role-list-toolbar',
  search: 'role-list-search',
  searchInput: 'role-list-search-input',
  table: 'role-list-table',
  tableBody: 'role-list-table-body',
  /** Every row's id begins with this; the rest is the role's GUID. */
  rowPrefix: 'role-list-table-row-',
  addButton: 'role-list-add-button',
} as const;

/**
 * A role ROW's id segments, `role-list-table-row-{guid}-{segment}`.
 *
 * The screen used to render cards (`role-card-{id}-name`) and was rebuilt as a
 * table on or before 20 September 2026. The ids are now shaped exactly like the
 * payer list's, which is why a role is found by its name CELL and acted on
 * through its row - the same approach every other list in this suite uses.
 */
export const ROLE_ROW_FIELD = {
  name: 'cell-name',
  description: 'cell-description',
  status: 'cell-status',
  edit: 'edit',
  view: 'view',
  toggleActive: 'toggle-active',
  delete: 'delete',
} as const;

/**
 * The two-step role drawer. Step 2, "Privileges", is the permission catalogue.
 *
 * `canApproveOwnRequests` is worth naming: it is the maker-checker switch the
 * permissions story's "submitter cannot approve their own request" case is
 * about, and it is a property of the ROLE rather than a permission in the tree.
 */
export const ROLE_FORM = {
  root: 'role-form-drawer',
  title: 'role-form-drawer-title',
  close: 'role-form-drawer-close',
  nextButton: 'role-form-drawer-next-button',
  cancelButton: 'role-form-drawer-cancel-button',
  englishName: 'role-form-drawer-english-name-input',
  arabicName: 'role-form-drawer-arabic-name-input',
  isActive: 'role-form-drawer-is-active-checkbox',
  hasAssignedPayers: 'role-form-drawer-has-assigned-payers-checkbox',
  canApproveOwnRequests: 'role-form-drawer-can-approve-own-requests-checkbox',
  permissionSearch: 'role-form-drawer-permission-search-input',
  /** REQUIRED since the 2026-10-25 build: Next is refused while it is empty. */
  assignableRoles: 'role-form-drawer-assignable-role-ids-multiselect',
} as const;

/**
 * A PrimeNG multiselect's id sits on its hidden accessibility <input>, which
 * takes no click; the visible control is the wrapping `.p-multiselect`
 * (read live 2026-10-25 - 18275 clicked the input and timed out).
 */
export const multiselectControl = (id: string): string => `.p-multiselect:has(> .p-hidden-accessible > #${id}), .p-multiselect:has(#${id})`;

/**
 * The permission tree's group headings, as the Privileges step renders them.
 *
 * `payers` is the group holding the payer permissions; `payerApprovals` is a
 * separate group nested under Approval Management, which is where the
 * approve/reject privilege lives. A test looking for all nine payer
 * permissions in one group would find eight.
 */
export const PERMISSION_GROUP = {
  payers: 'Payers',
  payerApprovals: 'Payer Approvals',
} as const;

/**
 * locator-exception: the permission tree gives EVERY checkbox the same id.
 *
 * VERIFIED: 26+ elements in one drawer all carry
 * `role-form-drawer-arabic-description-checkbox` - the id is not merely
 * unhelpful, it is a copy-paste of an unrelated field's id repeated down the
 * whole tree. An id-addressed locator therefore cannot name a single permission,
 * and `#...-checkbox` resolves to a strict-mode violation.
 *
 * So permission rows are located by their visible LABEL, which is exactly what
 * the bilingual-names story is about anyway: the label IS the thing under test.
 * The lookup is scoped to the drawer's id so it cannot drift onto another
 * screen. This is recorded as a defect - see the change summary - rather than
 * quietly worked around.
 */
export const PERMISSION_ROW_CLASS = 'p-treenode';

// ---------------------------------------------------------------------------
// Network module (/network-management) - mapped 2026-10-21 from the live DOM
// ---------------------------------------------------------------------------

/**
 * The Network list's toolbar, KPI band and filters.
 *
 * Every id below was read off the live screen by a DOM probe, not inferred
 * from the payer list. The two lists share a component, so the SHAPE matches
 * (`{screen}-kpi-{key}-value`, `{screen}-sort-option-{field}-{dir}`), but the
 * keys do not - the network KPIs are total/active/pending/inactive/expired and
 * the sort fields are the network model's own property names.
 */
export const NETWORK_LIST = {
  screen: 'network-list',
  kpiBand: 'network-list-kpis',
  /** `${kpi}-label` and `${kpi}-value` hang off each of these. */
  kpi: {
    total: 'network-list-kpi-total',
    active: 'network-list-kpi-active',
    pending: 'network-list-kpi-pending',
    inactive: 'network-list-kpi-inactive',
    expired: 'network-list-kpi-expired',
  },
  typeFilter: 'network-list-filter-type-select',
  statusFilter: 'network-list-filter-status-select',
  advancedSearchButton: 'network-list-search-filter-button',
  advancedSearch: 'network-list-advanced-search',
  /** Filter chips rendered once advanced-search criteria are applied. */
  chips: 'network-list-filter-chips',
  sortTrigger: 'network-list-sort-trigger',
  sortMenu: 'network-list-sort-menu',
  sortOptionPrefix: 'network-list-sort-option-',
  addButton: 'network-list-add-button',
  importTrigger: 'network-list-import-trigger',
  tableBody: 'network-list-table-body',
} as const;

export type NetworkKpiKey = keyof typeof NETWORK_LIST.kpi;

/** The Network list's Export menu - same two-step flow as the payer list's. */
export const NETWORK_EXPORT = {
  root: 'network-list-export',
  trigger: 'network-list-export-trigger',
  menu: 'network-list-export-menu',
  /** VERIFIED 2026-10-21: writes the CURRENT PAGE only (10 rows of 603). */
  selected: 'network-list-export-selected',
  /** VERIFIED 2026-10-21: writes the whole register (603 rows). */
  all: 'network-list-export-all',
  template: 'network-list-export-template',
} as const;

/** The sort expressions behind each Sort By option (`{field}-{asc|desc}`). */
export const NETWORK_SORT_FIELD = {
  name: 'networknameen',
  code: 'networkcode',
  type: 'networktypeid',
  status: 'statusid',
  effectiveDate: 'effectivedate',
  expiryDate: 'expirydate',
  createdOn: 'createdon',
  modifiedOn: 'modifiedon',
} as const;

export type NetworkSortColumn = keyof typeof NETWORK_SORT_FIELD;

/**
 * Advanced Search criteria keys under `network-list-advanced-search-field-`.
 * Live 2026-10-21: searchtext, networktypeid, statusid, approvalstatus. There
 * is NO payer criterion.
 */
export const NETWORK_ADVANCED_SEARCH_FIELD = {
  nameOrCode: 'searchtext',
  networkType: 'networktypeid',
  status: 'statusid',
  approvalStatus: 'approvalstatus',
} as const;

export type NetworkSearchField = keyof typeof NETWORK_ADVANCED_SEARCH_FIELD;

/** The Add / Edit / Clone Network wizard. */
export const NETWORK_FORM_PREFIX = 'network-form-drawer';

export const NETWORK_FORM_FIELD: Record<string, WizardField> = {
  'Network Name': { key: 'network-name-en', kind: 'text', step: 1 },
  /** The Arabic name's label is Arabic in both UI languages. */
  'الشبكة الطبية': { key: 'network-name-ar', kind: 'text', step: 1 },
  'Network Type': { key: 'network-type-id', kind: 'select', step: 1 },
  Description: { key: 'description-en', kind: 'text', step: 1 },
  'Description (Arabic)': { key: 'description-ar', kind: 'text', step: 1 },
  'Effective Date': { key: 'effective-date', kind: 'date', step: 2 },
  'Expiry Date': { key: 'expiry-date', kind: 'date', step: 2 },
};

export const NETWORK_FORM = {
  /** The owning payer, shown read-only as a tag (the top-bar scope payer). */
  payerTag: 'network-form-drawer-payer-id-tag',
  /**
   * The "Payers" multi-select, offered instead of the tag when the top bar is on
   * "All Payers" (verified 2026-10-27): "Choose All Payers, one payer (it will own
   * the network), or several payers". Defaults to an "All Payers" chip. The id
   * is on PrimeNG's hidden input - click it through multiselectControl().
   */
  payersMultiselect: 'network-form-drawer-payer-ids-multiselect',
  /** Step 2's "Important: Initial status will be set to Pending ..." notice. */
  importantNotice: 'network-form-drawer-important-title-message-text',
} as const;

/** The network detail screen (`/network-management/{id}`). */
export const NETWORK_DETAIL = {
  root: 'network-detail',
  headerCard: 'network-detail-header-card',
  name: 'network-detail-name',
  statusBadge: 'network-detail-status-badge',
  versionBadge: 'network-detail-version-badge',
  tabs: 'network-detail-tabs',
  tab: {
    overview: 'network-detail-tab-overview',
    facilities: 'network-detail-tab-facilities',
    policies: 'network-detail-tab-policies',
    versions: 'network-detail-tab-versions',
    audit: 'network-detail-tab-audit',
  },
  /** Header actions, `network-detail-{action}-button`; offered by state. */
  action: {
    edit: 'network-detail-edit-button',
    clone: 'network-detail-clone-button',
    delete: 'network-detail-delete-button',
    inactivate: 'network-detail-inactivate-button',
    activate: 'network-detail-activate-button',
    submit: 'network-detail-submit-for-approval-button',
  },
  /** Overview fields, `network-detail-overview-{key}`. */
  overview: {
    code: 'network-detail-overview-network-code',
    nameAr: 'network-detail-overview-network-name-ar',
    type: 'network-detail-overview-network-type',
    descriptionEn: 'network-detail-overview-description-en',
    descriptionAr: 'network-detail-overview-description-ar',
    effectiveDate: 'network-detail-overview-effective-date',
    expiryDate: 'network-detail-overview-expiry-date',
    status: 'network-detail-status-badge-2',
  },
} as const;

export type NetworkDetailTab = keyof typeof NETWORK_DETAIL.tab;
export type NetworkDetailAction = keyof typeof NETWORK_DETAIL.action;
export type NetworkOverviewField = keyof typeof NETWORK_DETAIL.overview;

/**
 * The Facility Assignment tab.
 *
 * locator-exception: the application reuses the ids of an unrelated
 * "inactivation-details" component here - the search box is
 * `network-detail-inactivation-details-search-2`, every status badge in the
 * table is `-badge-4` and every assignment badge `-badge-3`, and every Remove
 * button shares `network-detail-remove-facility-button`. Rows carry NO id, so
 * a row is addressed by its facility name or code inside the tab's table.
 */
/**
 * The id FAMILY of the reused "inactivation-details" search box (2026-10-25).
 * The app numbers it by render order - the Facilities tab's box was
 * `...-search-2-input` in one session and `...-search-input` in another - so a
 * fixed id failed five facility cases with the box plainly on screen. Matched
 * by prefix/suffix and narrowed to the VISIBLE one: only the open tab's box is.
 */
export const DETAIL_TAB_SEARCH = {
  inputSelector: '[id^="network-detail-inactivation-details-search"][id$="-input"]',
  filterButtonSelector: 'button[id^="network-detail-inactivation-details-search"][id$="-filter-button"], [id^="network-detail-inactivation-details-search"][id$="-filter-button"] > button',
  /** The applied-filter chips of the same component - numbered the same way. */
  chipsSelector: '[id^="network-detail-inactivation-details-chips"]',
  /** "Clear" lives on the SEARCH component (`...-search-2-clear-button`), not on the chips. */
  clearButtonSelector: 'button[id^="network-detail-inactivation-details-search"][id$="-clear-button"]',
} as const;

export const NETWORK_FACILITIES = {
  searchInput: 'network-detail-inactivation-details-search-2-input',
  advancedSearchButton: 'network-detail-inactivation-details-search-2-filter-button',
  advancedSearch: 'network-detail-facilities-advanced-search',
  chips: 'network-detail-inactivation-details-chips-2',
  exportTrigger: 'network-detail-facilities-export-trigger',
  importTrigger: 'network-detail-facilities-import-trigger',
  assignButton: 'network-detail-assign-fac-open-button',
  removeButton: 'network-detail-remove-facility-button',
  statusBadge: 'network-detail-inactivation-details-badge-4',
  assignmentBadge: 'network-detail-inactivation-details-badge-3',
  paginator: 'network-detail-inactivation-details-paginator',
  assignDrawer: {
    root: 'network-detail-drawer-2',
    title: 'network-detail-drawer-2-title',
    close: 'network-detail-drawer-2-close',
    multiselect: 'network-detail-selected-fac-ids-multiselect',
    cancel: 'network-detail-cancel-button',
    confirm: 'network-detail-assign-fac-confirm-button',
  },
} as const;

/** The Linked Policies tab (read-only). */
export const NETWORK_POLICIES = {
  searchInput: 'network-detail-inactivation-details-search-input',
  advancedSearch: 'network-detail-policies-advanced-search',
  table: 'network-detail-policies-table',
  tableBody: 'network-detail-policies-table-body',
  empty: 'network-detail-policies-table-empty',
} as const;

/** The Version History tab and its "Version Details" drawer. */
export const NETWORK_VERSIONS = {
  searchInput: 'network-detail-versions-search-input',
  table: 'network-detail-versions-table',
  rowPrefix: 'network-detail-versions-table-row-',
  headerPrefix: 'network-detail-versions-table-th-',
  viewButton: 'network-detail-view-version-button',
  drawer: {
    title: 'network-detail-drawer-1-title',
    close: 'network-detail-close-button',
    /** `network-detail-drawer-1-{key}` - see NETWORK_VERSION_FIELD. */
    fieldPrefix: 'network-detail-drawer-1-',
  },
} as const;

/** Version Details drawer field keys (`network-detail-drawer-1-{key}`). */
export const NETWORK_VERSION_FIELD = {
  approvalStatus: 'versions-approval-status',
  businessStatus: 'versions-business-status',
  nameEn: 'network-name-en',
  nameAr: 'network-name-ar',
  type: 'network-type',
  effectiveDate: 'effective-date',
  expiryDate: 'expiry-date',
  descriptionEn: 'description-en',
  descriptionAr: 'description-ar',
  requestedBy: 'versions-col-requested-by',
  requestedOn: 'versions-col-requested-on',
  reviewedBy: 'versions-col-reviewed-by',
  reviewedOn: 'versions-col-reviewed-on',
  reason: 'versions-col-reason',
} as const;

export type NetworkVersionField = keyof typeof NETWORK_VERSION_FIELD;

/** The Audit History tab and the shared "Audit Entry" drawer it opens. */

export const NETWORK_AUDIT = {
  searchInput: 'network-detail-audit-search-input',
  searchPrefix: 'network-detail-audit',
  advancedSearchButton: 'network-detail-audit-search-filter-button',
  advancedSearch: 'network-detail-audit-advanced-search',
  chips: 'network-detail-audit-filter-chips',
  /** locator-exception: every entry's button shares this id; entries have none. */
  viewButton: 'network-detail-view-audit-button',
  pager: 'network-detail-audit-pager',
  drawer: AUDIT_ENTRY_DRAWER,
} as const satisfies AuditTabIds;

/**
 * The Network list's Cards view (story 03, 2026-10-21). INFERRED from the
 * payer cards (`payer-list-cards`, `payer-card-{id}-title`) - not yet
 * confirmed on the network list; the cards cases fail on these ids first if
 * the network cards differ.
 */
export const NETWORK_CARDS = {
  container: 'network-list-cards',
  cardPrefix: 'network-card-',
  titleSuffix: 'title',
} as const;
