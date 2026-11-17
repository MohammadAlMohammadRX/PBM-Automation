/**
 * Notification Center Management (Feature 20980) - every id read off the live
 * screens by the foundation probe, 2026-11-11 (reports/notification/probe/
 * foundation-2026-11-11 and live-2026-11-11). Grouped per screen; ids that
 * carry a record GUID are builders.
 *
 * Screen: /system-settings/notification-center?tab=triggers|definitions|announcements
 */

export const NC_ROUTE = '/system-settings/notification-center';
export type NcTab = 'triggers' | 'definitions' | 'announcements';

/** The tab strip. */
export const NC_TABS = {
  strip: 'notification-center-tabs',
  tab: (tab: NcTab): string => `notification-center-tab-${tab}`,
} as const;

/**
 * The list toolbar + table every tab shares (namespace `nc-<tab>`):
 * search, filter drawer ("advanced search"), chips, sort, export, add, table, pager.
 */
export const NC_LIST = {
  screen: (tab: NcTab): string => `nc-${tab}`,
  searchInput: (tab: NcTab): string => `nc-${tab}-search-input`,
  filterButton: (tab: NcTab): string => `nc-${tab}-search-filter-button`,
  sortTrigger: (tab: NcTab): string => `nc-${tab}-sort-trigger`,
  sortDirection: (tab: NcTab): string => `nc-${tab}-sort-direction`,
  sortMenu: (tab: NcTab): string => `nc-${tab}-sort-menu`,
  sortOption: (tab: NcTab, key: string): string => `nc-${tab}-sort-option-${key}`,
  exportTrigger: (tab: NcTab): string => `nc-${tab}-export-trigger`,
  exportMenu: (tab: NcTab): string => `nc-${tab}-export-menu`,
  exportAll: (tab: NcTab): string => `nc-${tab}-export-all`,
  exportSelected: (tab: NcTab): string => `nc-${tab}-export-selected`,
  addButton: (tab: NcTab): string => `nc-${tab}-add-button`,
  tableEl: (tab: NcTab): string => `nc-${tab}-table-el`,
  tableBody: (tab: NcTab): string => `nc-${tab}-table-body`,
  /** "No records to display." */
  tableEmpty: (tab: NcTab): string => `nc-${tab}-table-empty`,
  th: (tab: NcTab, key: string): string => `nc-${tab}-table-th-${key}`,
  row: (tab: NcTab, id: string): string => `nc-${tab}-table-row-${id}`,
  rowPrefix: (tab: NcTab): string => `nc-${tab}-table-row-`,
  cell: (tab: NcTab, id: string, key: string): string => `nc-${tab}-table-row-${id}-cell-${key}`,
  rowAction: (tab: NcTab, id: string, action: string): string => `nc-${tab}-table-row-${id}-${action}`,
  pagerPrev: (tab: NcTab): string => `nc-${tab}-table-pager-prev`,
  pagerNext: (tab: NcTab): string => `nc-${tab}-table-pager-next`,
  pagerPage: (tab: NcTab, n: number): string => `nc-${tab}-table-pager-page-${n}`,
  /** Filter chips: `-chip-<field>` and `-chip-<field>-remove` (`search` for the search text). */
  chips: (tab: NcTab): string => `nc-${tab}-filter-chips`,
  chip: (tab: NcTab, field: string): string => `nc-${tab}-filter-chips-chip-${field}`,
  chipRemove: (tab: NcTab, field: string): string => `nc-${tab}-filter-chips-chip-${field}-remove`,
  chipPrefix: (tab: NcTab): string => `nc-${tab}-filter-chips-chip-`,
  // The filter drawer ("Advanced Search"): tabs Search / Display, fields by API key.
  filterDrawer: (tab: NcTab): string => `nc-${tab}-advanced-search`,
  filterTitle: (tab: NcTab): string => `nc-${tab}-advanced-search-title`,
  filterClose: (tab: NcTab): string => `nc-${tab}-advanced-search-close`,
  filterTabSearch: (tab: NcTab): string => `nc-${tab}-advanced-search-tab-search`,
  filterTabDisplay: (tab: NcTab): string => `nc-${tab}-advanced-search-tab-display`,
  filterField: (tab: NcTab, key: string): string => `nc-${tab}-advanced-search-field-${key}-input`,
  filterSearchButton: (tab: NcTab): string => `nc-${tab}-advanced-search-search-button`,
  filterCancelButton: (tab: NcTab): string => `nc-${tab}-advanced-search-cancel-button`,
} as const;

/** Column keys (`-table-th-<key>` / `-cell-<key>`) and sort / filter keys per tab. */
export const NC_COLUMNS = {
  triggers: ['name', 'module', 'action', 'recipient', 'predefined', 'active', 'actions'],
  definitions: ['name', 'module', 'action', 'active', 'actions'],
  announcements: ['name', 'status', 'publishat', 'audiences', 'actions'],
} as const;

export const NC_SORT_OPTIONS = {
  /** Default "Newest". */
  triggers: ['newest', 'oldest', 'name', 'module', 'action', 'recipient', 'ispredefined', 'isactive', 'modifiedon'],
  definitions: ['newest', 'oldest', 'name', 'modulename', 'moduleaction', 'isactive', 'modifiedon'],
  announcements: ['newest', 'oldest', 'name', 'status', 'publishat', 'modifiedon'],
} as const;

/** Filter drawer field keys (selects unless noted); options seen 2026-11-11. */
export const NC_FILTER_FIELDS = {
  /** name (text), moduleid [User Management, Approval Management, Member Management, PBM Engine], actionid, recipientid [User, Member, External Contact], ispredefined [Yes, No], isactive [Yes, No]. */
  triggers: ['name', 'moduleid', 'actionid', 'recipientid', 'ispredefined', 'isactive'],
  /** name (text), modulenameid, moduleactionid, isactive [Yes, No]. */
  definitions: ['name', 'modulenameid', 'moduleactionid', 'isactive'],
  /** name (text), status [Scheduled, Published, Cancelled], publishat (date), audiencetypeid [Users, Roles]. */
  announcements: ['name', 'status', 'publishat', 'audiencetypeid'],
} as const;

/** Row actions per tab (`-table-row-<id>-<action>`). */
export const NC_ROW_ACTION = {
  /** Predefined rows offer `edit` only (+ `-predefined-badge`); custom rows edit / toggle-active / delete (+ `-predefined-none`). */
  triggers: ['edit', 'toggle-active', 'delete'],
  definitions: ['edit', 'toggle-active', 'delete'],
  /** Scheduled: view / edit / delete. Published: view / cancel. Cancelled: view / edit / reschedule. */
  announcements: ['view', 'edit', 'delete', 'cancel', 'reschedule'],
} as const;

/** Trigger row extras. */
export const NC_TRIGGER_ROW = {
  predefinedBadge: (id: string): string => `nc-triggers-table-row-${id}-predefined-badge`,
  predefinedNone: (id: string): string => `nc-triggers-table-row-${id}-predefined-none`,
} as const;

// ---- Trigger drawer ("Add New Trigger" / "Edit Trigger") ------------------------------

export const TRIGGER_DRAWER = {
  root: 'nc-triggers-form-drawer',
  close: 'nc-triggers-form-drawer-close',
  stepper: 'nc-triggers-form-drawer-stepper',
  /** 1 General, 2 Content - the bullet is clickable on an existing trigger. */
  step: (n: 1 | 2): string => `nc-triggers-form-drawer-stepper-step-${n}`,
  stepBullet: (n: 1 | 2): string => `nc-triggers-form-drawer-stepper-step-${n}-bullet`,
  stepLabel: (n: 1 | 2): string => `nc-triggers-form-drawer-stepper-step-${n}-label`,
  // General
  /** maxlength 50. */
  nameInput: 'nc-triggers-form-drawer-name-input',
  moduleSelect: 'nc-triggers-form-drawer-module-select',
  actionSelect: 'nc-triggers-form-drawer-action-select',
  /** Read-only: User / Member / External Contact (decided by the module). */
  recipientIndicator: 'nc-triggers-form-drawer-recipient-indicator',
  isActiveCheckbox: 'nc-triggers-form-drawer-is-active-checkbox',
  /** On a predefined trigger: "This is a predefined trigger. Its name, module, action, recipient and active state are fixed..." */
  predefinedNotice: 'nc-triggers-form-drawer-predefined-notice',
  /** "Cancel" on General, "Back" on Content. */
  backButton: 'nc-triggers-form-drawer-back-button',
  nextButton: 'nc-triggers-form-drawer-next-button',
  saveButton: 'nc-triggers-form-drawer-save-button',
  // Content
  manageVariablesButton: 'nc-triggers-form-drawer-manage-variables-button',
  /** Disabled when every channel x language has a template. */
  addTemplateButton: 'nc-triggers-form-drawer-add-template-button',
  /** "Every channel and language already has a message template." */
  allChannelsUsedHint: 'nc-triggers-form-drawer-all-channels-used-hint',
  template: {
    channelSelect: (t: number): string => `nc-triggers-form-drawer-template-idx-${t}-channel-select`,
    languageSelect: (t: number): string => `nc-triggers-form-drawer-template-idx-${t}-language-select`,
    removeButton: (t: number): string => `nc-triggers-form-drawer-template-idx-${t}-remove-button`,
    /** "Every message template needs a channel and a language." */
    error: (t: number): string => `nc-triggers-form-drawer-template-idx-${t}-error`,
    /** SMS body (textarea). */
    bodyInput: (t: number, b = 0): string => `nc-triggers-form-drawer-template-idx-${t}-body-idx-${b}-body-input`,
    /** E-mail subject (input). */
    subjectInput: (t: number, b = 0): string => `nc-triggers-form-drawer-template-idx-${t}-body-idx-${b}-subject-input`,
    /** E-mail body: a rich editor (contenteditable) with a toolbar. */
    editorArea: (t: number, b = 0): string => `nc-triggers-form-drawer-template-idx-${t}-body-idx-${b}-body-editor-area`,
    editorToolbar: (t: number, b = 0): string => `nc-triggers-form-drawer-template-idx-${t}-body-idx-${b}-body-editor-toolbar`,
    /** bold / italic / underline / bullet-list / heading / link / image / clear-format / insert-template (+ font-size-select, text-colour-input). */
    editorButton: (t: number, b: number, key: string): string => `nc-triggers-form-drawer-template-idx-${t}-body-idx-${b}-body-editor-${key}-button`,
    previewButton: (t: number, b = 0): string => `nc-triggers-form-drawer-template-idx-${t}-body-idx-${b}-preview-button`,
    /** "This message body does not use the required variable(s) X, Y. Go back to the Message step and insert them into the body." */
    contentError: (t: number, b = 0): string => `nc-triggers-form-drawer-template-idx-${t}-body-idx-${b}-content-error`,
  },
  /** Right-click in a body/subject: the Insert variable menu, one button per variable of the action. */
  insertVariable: (name: string): string => `nc-triggers-form-drawer-insert-variable-${name.toLowerCase()}`,
  insertVariablePrefix: 'nc-triggers-form-drawer-insert-variable-',
  // Manage Variables view (replaces the Content step inside the drawer)
  variables: {
    back: 'nc-triggers-form-drawer-variables-back-button',
    cancel: 'nc-triggers-form-drawer-variables-cancel-button',
    save: 'nc-triggers-form-drawer-variables-save-button',
    block: (name: string): string => `nc-triggers-form-drawer-variable-${name.toLowerCase()}`,
    sampleValue: (name: string): string => `nc-triggers-form-drawer-variable-${name.toLowerCase()}-sample-value-input`,
    description: (name: string): string => `nc-triggers-form-drawer-variable-${name.toLowerCase()}-description-input`,
    useAsDefault: (name: string): string => `nc-triggers-form-drawer-variable-${name.toLowerCase()}-use-as-default-checkbox`,
    isRequired: (name: string): string => `nc-triggers-form-drawer-variable-${name.toLowerCase()}-is-required-checkbox`,
    isSensitive: (name: string): string => `nc-triggers-form-drawer-variable-${name.toLowerCase()}-is-sensitive-checkbox`,
    /** Shown once Sensitive is ticked (ids by the same pattern - verify on first use: masking-mode-select, mask-char-input, keep-first-input, keep-last-input). */
    field: (name: string, key: string): string => `nc-triggers-form-drawer-variable-${name.toLowerCase()}-${key}`,
  },
} as const;

// ---- Shared dialog / toast ------------------------------------------------------------

/**
 * `pbm-dialog` carries: the toggle confirmation ("Activate trigger" / "Deactivate trigger",
 * "Are you sure you want to activate <name>?", actions cancel = "No", confirm = "Yes"),
 * Unsaved Changes ("You have unsaved changes. If you leave now, your edits will be lost.",
 * stay = "Keep Editing", discard = "Discard Changes"), the template Preview
 * (title "Preview", message = the resolved text, action close = "Close").
 */
export const NC_DIALOG = {
  root: 'pbm-dialog',
  title: 'pbm-dialog-title',
  message: 'pbm-dialog-message',
  actions: 'pbm-dialog-actions',
  close: 'pbm-dialog-close-button',
  action: (key: 'confirm' | 'cancel' | 'stay' | 'discard' | 'close' | 'excel' | 'csv'): string => `pbm-dialog-action-${key}`,
} as const;

export const NC_TOAST = {
  root: 'pbm-toast',
  summary: 'pbm-toast-summary',
  detail: 'pbm-toast-detail',
  /** The SECOND toast host - the real-time "New notification" / "New announcement" pop-up. */
  notifRoot: 'pbm-toast-notif',
  notifSummary: 'pbm-toast-notif-summary',
  notifDetail: 'pbm-toast-notif-detail',
} as const;

// ---- Header bells ---------------------------------------------------------------------

export type BellKind = 'notification' | 'announcement';

/** Suffixes under `<kind>-` (see pages/notification/InboxBells.ts). */
export const BELL = {
  part: {
    button: 'bell-button',
    badge: 'bell-badge',
    drawer: 'drawer',
    header: 'drawer-header',
    title: 'drawer-title',
    unreadCount: 'drawer-unread-count',
    close: 'drawer-close',
    search: 'drawer-search-input',
    tabs: 'drawer-tabs',
    unreadTabBadge: 'drawer-tab-unread-badge',
    body: 'drawer-body',
    list: 'drawer-list',
    empty: 'drawer-empty',
    footer: 'drawer-footer',
    markAllRead: 'drawer-mark-all-read-button',
    loadMore: 'drawer-load-more-button',
  },
  row: (kind: BellKind, itemId: string): string => `${kind}-drawer-row-${itemId}`,
  rowPart: (kind: BellKind, itemId: string, part: 'text' | 'time' | 'type' | 'archive-button'): string => `${kind}-drawer-row-${itemId}-${part}`,
} as const;

// ---- Detail pages ---------------------------------------------------------------------

/** /notifications/<approval request id> (a "Need to Approve" notification's relatedEntityId). */
export const NOTIFICATION_DETAIL = {
  routePrefix: '/notifications/',
  root: 'notification-detail',
  header: 'notification-detail-header',
  /** "Add Payer". */
  action: 'notification-detail-action',
  entityType: 'notification-detail-entity-type',
  statusBadge: 'notification-detail-status-badge',
  meta: 'notification-detail-meta',
  requestedBy: 'notification-detail-requested-by',
  requestedOn: 'notification-detail-requested-on',
  messageTitle: 'notification-detail-message-title',
  message: 'notification-detail-message',
  changesTitle: 'notification-detail-changes-title',
  diff: 'notification-detail-diff',
  diffTable: 'notification-detail-diff-diff-table',
  diffRow: (field: string): string => `notification-detail-diff-row-${field}`,
  diffCell: (field: string, part: 'field' | 'before' | 'after'): string => `notification-detail-diff-row-${field}-${part}`,
  diffRowPrefix: 'notification-detail-diff-row-',
  /** "You submitted this request. A different reviewer must approve or reject it." (no Approve / Reject then). */
  ownSubmissionHint: 'notification-detail-own-submission-hint',
  approveButton: 'notification-detail-approve-button',
  rejectButton: 'notification-detail-reject-button',
  reject: {
    drawer: 'notification-detail-reject-drawer',
    /** "Reject Submission". */
    title: 'notification-detail-reject-drawer-title',
    close: 'notification-detail-reject-drawer-close',
    /** Incomplete Information / Incorrect Data / Missing Supporting Document / Policy Violation / Change Not Required / Duplicate Request / Other. */
    reasonSelect: 'notification-detail-reject-drawer-reason-select',
    /** maxlength 500, placeholder 'Explain what the maker should correct (required when the reason is "Other")'. */
    details: 'notification-detail-reject-drawer-details',
    cancel: 'notification-detail-reject-drawer-cancel-button',
    confirm: 'notification-detail-reject-drawer-confirm-button',
  },
} as const;

/** /announcements/<announcement id> (the bell row's target). */
export const ANNOUNCEMENT_DETAIL = {
  routePrefix: '/announcements/',
  root: 'announcement-detail',
  title: 'announcement-detail-title',
  /** "11/11/2026, 17:02:59". */
  date: 'announcement-detail-date',
  /** The message in the UI language (`dir` ltr / rtl). */
  message: 'announcement-detail-message',
  back: 'announcement-detail-back-button',
} as const;

// ---- The form drawers (shared builder) -------------------------------------------------

export type FormTab = NcTab;

/**
 * `nc-<tab>-form-drawer-<part>`. Parts shared by the three drawers; tab-only
 * parts are listed in TRIGGER_DRAWER / DEFINITION_DRAWER / ANNOUNCEMENT_DRAWER.
 */
export const NC_FORM = {
  id: (tab: FormTab, part: string): string => (part ? `nc-${tab}-form-drawer-${part}` : `nc-${tab}-form-drawer`),
  part: {
    root: '',
    close: 'close',
    stepper: 'stepper',
    name: 'name-input',
    module: 'module-select',
    action: 'action-select',
    isActive: 'is-active-checkbox',
    back: 'back-button',
    next: 'next-button',
    save: 'save-button',
    manageVariables: 'manage-variables-button',
    addAudience: 'add-audience-button',
  },
} as const;

/** App Notification drawer ("Create"): 1 General / 2 Content / 3 Audiences. */
export const DEFINITION_DRAWER = {
  root: 'nc-definitions-form-drawer',
  /** maxlength 200. */
  nameInput: 'nc-definitions-form-drawer-name-input',
  moduleSelect: 'nc-definitions-form-drawer-module-select',
  actionSelect: 'nc-definitions-form-drawer-action-select',
  /** maxlength 1000. */
  descriptionInput: 'nc-definitions-form-drawer-description-input',
  isActiveCheckbox: 'nc-definitions-form-drawer-is-active-checkbox',
  // Content ("Right-click a field to insert a variable")
  manageVariablesButton: 'nc-definitions-form-drawer-manage-variables-button',
  previewButton: 'nc-definitions-form-drawer-preview-button',
  /** textarea dir=ltr; error "This field is required."; toast "English message and Arabic message are required." */
  englishInput: 'nc-definitions-form-drawer-english-message-input',
  englishError: 'nc-definitions-form-drawer-english-message-error',
  /** textarea dir=rtl. */
  arabicInput: 'nc-definitions-form-drawer-arabic-message-input',
  arabicError: 'nc-definitions-form-drawer-arabic-message-error',
  notesInput: 'nc-definitions-form-drawer-notes-input',
  insertVariable: (name: string): string => `nc-definitions-form-drawer-insert-variable-${name.toLowerCase()}`,
  variable: (name: string, field: string): string => `nc-definitions-form-drawer-variable-${name.toLowerCase()}-${field}`,
  variablesBack: 'nc-definitions-form-drawer-variables-back-button',
  // Audiences ("Add at least one audience." when none)
  addAudienceButton: 'nc-definitions-form-drawer-add-audience-button',
  audienceType: (i: number): string => `nc-definitions-form-drawer-audience-idx-${i}-type-select`,
  audienceRemove: (i: number): string => `nc-definitions-form-drawer-audience-idx-${i}-remove-button`,
  audienceAssign: (i: number): string => `nc-definitions-form-drawer-audience-idx-${i}-assign-button`,
  /** The Assign window (pick list: Available / Selected). */
  assign: {
    back: 'nc-definitions-form-drawer-assign-back-button',
    cancel: 'nc-definitions-form-drawer-assign-cancel-button',
    save: 'nc-definitions-form-drawer-assign-save-button',
    sourceSearch: 'nc-definitions-form-drawer-assign-picklist-source-search-input',
    targetSearch: 'nc-definitions-form-drawer-assign-picklist-target-search-input',
    sourceList: 'nc-definitions-form-drawer-assign-picklist-source-list',
    targetList: 'nc-definitions-form-drawer-assign-picklist-target-list',
    /** "No results found." */
    targetEmpty: 'nc-definitions-form-drawer-assign-picklist-target-empty',
    sourceItem: (id: string): string => `nc-definitions-form-drawer-assign-picklist-source-item-${id}`,
    targetItem: (id: string): string => `nc-definitions-form-drawer-assign-picklist-target-item-${id}`,
    moveSelectedToTarget: 'nc-definitions-form-drawer-assign-picklist-move-selected-to-target',
    moveAllToTarget: 'nc-definitions-form-drawer-assign-picklist-move-all-to-target',
    moveSelectedToSource: 'nc-definitions-form-drawer-assign-picklist-move-selected-to-source',
    moveAllToSource: 'nc-definitions-form-drawer-assign-picklist-move-all-to-source',
  },
} as const;

/** Announcement drawer ("Create"): 1 General / 2 Audiences (same audience + assign ids under `nc-announcements-form-drawer-`). */
export const ANNOUNCEMENT_DRAWER = {
  root: 'nc-announcements-form-drawer',
  /** maxlength 200. */
  nameInput: 'nc-announcements-form-drawer-name-input',
  /** textarea dir=ltr. */
  englishInput: 'nc-announcements-form-drawer-english-message-input',
  /** textarea dir=rtl. */
  arabicInput: 'nc-announcements-form-drawer-arabic-message-input',
  /** Text input + calendar; shows / accepts "yyyy-MM-dd HH:mm" (Riyadh); default = now. Can be emptied. */
  publishOnInput: 'nc-announcements-form-drawer-publish-on-input',
  addAudienceButton: 'nc-announcements-form-drawer-add-audience-button',
  audienceType: (i: number): string => `nc-announcements-form-drawer-audience-idx-${i}-type-select`,
  audienceRemove: (i: number): string => `nc-announcements-form-drawer-audience-idx-${i}-remove-button`,
  audienceAssign: (i: number): string => `nc-announcements-form-drawer-audience-idx-${i}-assign-button`,
  assignPrefix: 'nc-announcements-form-drawer-assign-',
} as const;

/** Row View -> "Announcement details" (Name, Status, Publish at, Published on, ENGLISH / ARABIC MESSAGE, AUDIENCES "Users:<name>"). */
export const ANNOUNCEMENT_VIEW = {
  root: 'nc-announcements-view-drawer',
  title: 'nc-announcements-view-drawer-title',
  close: 'nc-announcements-view-drawer-close',
  closeButton: 'nc-announcements-view-drawer-close-button',
} as const;

/**
 * Row Reschedule (Cancelled only) -> "Reschedule": Publish at only (default now), hint
 * "Pick a new date/time (now up to one year ahead). Now re-sends it immediately; a future time re-sends it then."
 */
export const ANNOUNCEMENT_RESCHEDULE = {
  root: 'nc-announcements-reschedule-drawer',
  title: 'nc-announcements-reschedule-drawer-title',
  close: 'nc-announcements-reschedule-drawer-close',
  publishOnInput: 'nc-announcements-reschedule-drawer-publish-on-input',
  cancel: 'nc-announcements-reschedule-drawer-cancel-button',
  confirm: 'nc-announcements-reschedule-drawer-confirm-button',
} as const;

/** "Next job MM:SS" on the Announcements tab - no id seen on 2026-11-11 (read from the outlet text). */
export const NEXT_JOB_PATTERN = /Next job\s+(\d{2}):(\d{2})/;

// ---- System Settings > General > Edit Setting drawer (notification parts) ------------

/** Opened with `settings-general-edit-button`; Save `settings-general-drawer-save-button`, Cancel `settings-general-drawer-cancel-button`. */
export const SETTINGS_NOTIFICATION_FIELDS = {
  smtpFromEmail: 'settings-general-smtp-fromemail-input',
  smtpPort: 'settings-general-smtp-port-input',
  smtpServer: 'settings-general-smtp-server-input',
  smtpUser: 'settings-general-smtp-user-input',
  autoArchiveAnnouncements: 'settings-general-notifi-autoarchiveannouncementsafterread-input',
  autoArchiveNotifications: 'settings-general-notifi-autoarchivenotificationsafterread-input',
  reminderBeforeDays: 'settings-general-notificonfig-expiryreminderbeforedays-input',
  /** "Reminds 7 day(s) before the expiry date, then repeats on the same cadence until it expires" */
  reminderBeforeHint: 'settings-general-notificonfig-expiryreminderbeforedays-schedule-hint',
  /** Every day / Every two days / Every three days / Every week. */
  remindEverySelect: 'settings-general-notificonfig-expiryremindereverydays-select',
} as const;
