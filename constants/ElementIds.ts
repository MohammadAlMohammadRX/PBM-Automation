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
  | 'activate';

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
  filters: 'payer-detail-audit-filters',
  actionSelect: 'payer-detail-audit-action-select',
  dateRangeInput: 'payer-detail-audit-date-range-input',
  timeline: 'payer-detail-audit-timeline',
  rowPrefix: 'payer-detail-audit-row-',
  detailDrawer: 'payer-detail-audit-detail-drawer',
} as const;

/** Detail-header elements beyond PAYER_DETAIL_FIELD's label-to-id value map. */
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
export const PAYER_SELECT = {
  planForm: 'plan-form-drawer-payer-id-select',
  planListFilter: 'plan-list-filter-payer-select',
  networkListFilter: 'network-list-filter-payer-select',
} as const;

export type PayerSelectSurface = keyof typeof PAYER_SELECT;

/** Consuming list modules that own a payer filter of their own. */
export const CONSUMING_SCREEN = {
  planList: 'plan-list',
  networkList: 'network-list',
} as const;

// ---------------------------------------------------------------------------
// Inactivate Payer dialog
// ---------------------------------------------------------------------------

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
