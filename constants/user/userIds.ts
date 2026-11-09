/**
 * Element ids of the User Management module (Feature 12972): Users
 * Administration, Invitations, the user profile, My Profile, Change Password,
 * the sign-in / reset-password screens, the Password Policy tab, the header
 * user menu and the Session Expired dialog.
 *
 * Every id below was read off the live screens on 2026-11-08 (probe dumps in
 * reports/user/probe/foundation-2026-11-08/, see
 * reports/user/User-Foundation-Notes.md) and cross-checked against the
 * application bundle (users chunk `chunk-FDGLIHM3`, invitations, login
 * `chunk-X4RRH2IU`, reset `chunk-R6LUZHZE`). Ids only - no labels, no classes.
 * The shared conventions hold: `{screen}-table-row-{id}-cell-{key}`, `-{action}`
 * row buttons, `{screen}-table-pager-*`, the shared `#pbm-dialog` for
 * confirmations (Delete User, Activate User?, Unsaved Changes, Session
 * Expired, the export format / scope choice). A `pbm-button` (Add User, Next /
 * Back / Save, Edit Profile, Change Password ...) carries its id on the p-button
 * HOST: click the inner button (`buttonSelector`) - a host click is a silent no-op.
 */

// ---- Users Administration list --------------------------------------------------

/** `/users-management/users-administration` (`user-list`): KPI tiles, toolbar, table / cards. */
export const USER_LIST = {
  /** The screen namespace ListPageBase builds rows, cells, pager and search from. */
  screen: 'user-list',
  /**
   * The four tiles (`-label`, `-value` children; the value COUNTS UP from 0 after
   * GetUsersDashboard answers - read a settled value). Total / Active / Inactive
   * sit inside a `<button>` (`kpiButton`) that filters the list; Pending Approval
   * has NO button (not clickable) and a caption "Awaiting approval — decided in
   * Approval Management".
   */
  kpi: {
    total: 'user-list-kpi-total',
    active: 'user-list-kpi-active',
    inactive: 'user-list-kpi-inactive',
    pendingApproval: 'user-list-kpi-pending-approval',
  },
  kpiButton: {
    total: 'user-list-kpi-total-button',
    active: 'user-list-kpi-active-button',
    inactive: 'user-list-kpi-inactive-button',
  },
  searchInput: 'user-list-search-input',
  /** Opens the Advance Search drawer (USER_ADVANCED_SEARCH). */
  searchFilterButton: 'user-list-search-filter-button',
  /** The applied-filter chips: `-chip-{search|name|documentId|...}` with `-remove`, plus a clear-all. */
  chips: 'user-list-filter-chips',
  sortTrigger: 'user-list-sort-trigger',
  /** Flips the order of the chosen field ("Newest to Oldest — Click to reverse"). */
  sortDirection: 'user-list-sort-direction',
  sortMenu: 'user-list-sort-menu',
  /** Sort options `user-list-sort-option-{key}` (USER_SORT_OPTION). */
  sortOptionPrefix: 'user-list-sort-option-',
  exportTrigger: 'user-list-export-trigger',
  exportMenu: 'user-list-export-menu',
  /** "Selected Export" / "Export All Data" -> the shared `#pbm-dialog` (scope when a search is applied, then CSV / Excel). */
  exportSelected: 'user-list-export-selected',
  exportAll: 'user-list-export-all',
  /** Needs Users.CreateUser. A p-button: click the inner button. */
  addButton: 'user-list-add-button',
  table: 'user-list-table-el',
  tableBody: 'user-list-table-body',
  /** The table's empty row ("No users found."). */
  tableEmpty: 'user-list-table-empty',
  pager: 'user-list-table-pager',
  /** The Cards view grid; cards are `user-card-{id}` (USER_CARD). */
  cards: 'user-list-cards',
  /** "Load More Users" under the cards. */
  loadMore: 'user-list-load-more-button',
} as const;

export type UserKpiKey = keyof typeof USER_LIST.kpi;
export type UserKpiFilter = keyof typeof USER_LIST.kpiButton;

/** The table's columns, as the cell / header ids carry them (`-cell-{key}`, `-th-{key}`). NO Gender column on 2026-11-08 (AC of 20412 asks for one). */
export const USER_COLUMN = {
  name: 'name',
  documentId: 'documentid',
  nationality: 'nationality',
  identityType: 'identitytype',
  mobileNumber: 'mobilenumber',
  status: 'status',
} as const;

export type UserColumnKey = keyof typeof USER_COLUMN;

/** Row action suffixes (`user-list-table-row-{id}-{suffix}`); `toggleActivation` reads "Inactivate" / "Activate". */
export const USER_ROW_ACTION = {
  view: 'view',
  edit: 'edit',
  assign: 'assign',
  toggleActivation: 'toggle-activation',
  delete: 'delete',
} as const;

export type UserRowAction = keyof typeof USER_ROW_ACTION;

/**
 * The Sort By menu options (`user-list-sort-option-{key}`): Newest (default,
 * `CreatedOn desc`), Oldest, Name, Gender, Nationality, Identity Type, Document
 * ID, Mobile Number, Status, Last Modified. A field option sorts one way; the
 * direction button (`sortDirection`) reverses it. The request's `sortBy` per
 * option is in USER_SORT_REQUEST (utils/UserProvisioning).
 */
export const USER_SORT_OPTION = {
  newest: 'newest',
  oldest: 'oldest',
  name: 'name',
  gender: 'genderid',
  nationality: 'nationalityid',
  identityType: 'identitytypeid',
  documentId: 'username',
  mobileNumber: 'phonenumber',
  status: 'isactive',
  lastModified: 'modifiedon',
} as const;

export type UserSortOption = keyof typeof USER_SORT_OPTION;

/** The Advance Search drawer (`user-list-advanced-search`): Search / Display Settings tabs, the fields and Cancel / Search. */
export const USER_ADVANCED_SEARCH = {
  root: 'user-list-advanced-search',
  title: 'user-list-advanced-search-title',
  close: 'user-list-advanced-search-close',
  tabSearch: 'user-list-advanced-search-tab-search',
  tabDisplay: 'user-list-advanced-search-tab-display',
  /** Field inputs `user-list-advanced-search-field-{key}-input` (text boxes, or p-select spans for the dropdowns). */
  field: {
    name: 'user-list-advanced-search-field-name-input',
    documentId: 'user-list-advanced-search-field-documentid-input',
    nationality: 'user-list-advanced-search-field-nationalityid-input',
    identityType: 'user-list-advanced-search-field-identitytypeid-input',
    mobileNumber: 'user-list-advanced-search-field-mobilenumber-input',
    status: 'user-list-advanced-search-field-status-input',
    gender: 'user-list-advanced-search-field-genderid-input',
  },
  cancel: 'user-list-advanced-search-cancel-button',
  search: 'user-list-advanced-search-search-button',
} as const;

export type UserAdvancedField = keyof typeof USER_ADVANCED_SEARCH.field;
/** Which advanced fields are dropdowns (p-select) rather than text boxes. */
export const USER_ADVANCED_SELECTS: readonly UserAdvancedField[] = ['nationality', 'identityType', 'status', 'gender'];

/** One user card (`user-card-{id}`): `-header`, `-title` (name), body values with `-label`, footer buttons (p-buttons). */
export const USER_CARD = {
  prefix: 'user-card-',
  field: {
    title: 'title',
    nationality: 'nationality',
    identityType: 'identity-type',
    documentId: 'document-id',
    mobileNumber: 'mobile-number',
  },
  action: {
    view: 'view-button',
    edit: 'edit-button',
    assign: 'assign-button',
    delete: 'delete-button',
  },
} as const;

export type UserCardField = keyof typeof USER_CARD.field;
export type UserCardAction = keyof typeof USER_CARD.action;

// ---- Add / Edit User drawer ---------------------------------------------------------

/**
 * The Add / Edit / Assign Roles & Payers drawer (`user-form-drawer`, ONE drawer):
 * title "Add New User" / "Edit User"; stepper 1 User Information, 2 Contact
 * Information, 3 Roles and Privileges (`-stepper-step-{n}`, `-bullet`,
 * `-label`). Assign Roles & Payers opens it on step 3. Footer: step 1 Cancel
 * (`backButton`) + Next; 2 Back + Next; 3 Back + Save.
 */
export const USER_FORM = {
  root: 'user-form-drawer',
  close: 'user-form-drawer-close',
  stepper: 'user-form-drawer-stepper',
  stepPrefix: 'user-form-drawer-stepper-step-',
  /** Step 1 Cancel / steps 2-3 Back (one id). */
  backButton: 'user-form-drawer-back-button',
  nextButton: 'user-form-drawer-next-button',
  saveButton: 'user-form-drawer-save-button',
  /** Text inputs (`-input`). */
  input: {
    englishFirstName: 'user-form-drawer-english-first-name-input',
    englishSecondName: 'user-form-drawer-english-second-name-input',
    englishLastName: 'user-form-drawer-english-last-name-input',
    arabicFirstName: 'user-form-drawer-arabic-first-name-input',
    arabicSecondName: 'user-form-drawer-arabic-second-name-input',
    arabicLastName: 'user-form-drawer-arabic-last-name-input',
    /** Date picker text box, `DD/MM/YYYY` + Enter. */
    dob: 'user-form-drawer-dob-input',
    /** `YYYY/MM/DD`, filled from the Gregorian date. */
    hijriDob: 'user-form-drawer-hijri-dob-input',
    /** Date picker text box, `DD/MM/YYYY`. */
    accountDeactivationDate: 'user-form-drawer-account-deactivation-date-input',
    documentId: 'user-form-drawer-document-id-input',
    /** Step 2: digits after the "+966" prefix (placeholder "000 000 000"). No dial-code control in the drawer. */
    phoneNumber: 'user-form-drawer-phone-number-input',
    email: 'user-form-drawer-email-input',
  },
  /** p-select comboboxes (the span carrying the id). */
  select: {
    gender: 'user-form-drawer-gender-id-select',
    nationality: 'user-form-drawer-nationality-select',
    identityType: 'user-form-drawer-identity-type-id-select',
    preferredContactMethod: 'user-form-drawer-preferred-contact-method-id-select',
    preferredLanguage: 'user-form-drawer-preferred-language-id-select',
  },
  /** "Is Active" (unticked by default on Add). */
  isActive: 'user-form-drawer-is-active-checkbox',
  /** Field errors (`small`), "This field is required." etc. NOTE the nationality / gender / identity errors carry `-id-`. */
  error: {
    englishFirstName: 'user-form-drawer-english-first-name-error',
    englishSecondName: 'user-form-drawer-english-second-name-error',
    englishLastName: 'user-form-drawer-english-last-name-error',
    arabicFirstName: 'user-form-drawer-arabic-first-name-error',
    arabicSecondName: 'user-form-drawer-arabic-second-name-error',
    arabicLastName: 'user-form-drawer-arabic-last-name-error',
    dob: 'user-form-drawer-dob-error',
    hijriDob: 'user-form-drawer-hijri-dob-error',
    gender: 'user-form-drawer-gender-id-error',
    accountDeactivationDate: 'user-form-drawer-account-deactivation-date-error',
    nationality: 'user-form-drawer-nationality-id-error',
    identityType: 'user-form-drawer-identity-type-id-error',
    documentId: 'user-form-drawer-document-id-error',
    phoneNumber: 'user-form-drawer-phone-number-error',
    email: 'user-form-drawer-email-error',
    preferredContactMethod: 'user-form-drawer-preferred-contact-method-id-error',
    preferredLanguage: 'user-form-drawer-preferred-language-id-error',
  },
  /** Step 3: "Add New User Roles" (p-button) adds a role card. */
  addRoleButton: 'user-form-drawer-add-role-button',
  /** Each card's Role select - the SAME id on every card (reach the n-th by position inside the drawer). */
  roleSelect: 'user-form-drawer-role-select',
  /** A saved card's "Delete Role": `user-form-drawer-role-row-{roleId}-remove-button`. */
  roleRowPrefix: 'user-form-drawer-role-row-',
  /** The Assign Payers two-list picker footer (bundle `qa("assign-cancel-button")`). */
  assignCancel: 'user-form-drawer-assign-cancel-button',
  assignSave: 'user-form-drawer-assign-save-button',
  /** Edit only: Record Information (Created By / On, Modified By / On - disabled inputs). */
  recordInfo: {
    root: 'user-form-drawer-record-info',
    createdBy: 'user-form-drawer-record-info-created-by-input',
    createdOn: 'user-form-drawer-record-info-created-on-input',
    modifiedBy: 'user-form-drawer-record-info-modified-by-input',
    modifiedOn: 'user-form-drawer-record-info-modified-on-input',
  },
} as const;

export type UserFormInput = keyof typeof USER_FORM.input;
export type UserFormSelect = keyof typeof USER_FORM.select;
export type UserFormErrorField = keyof typeof USER_FORM.error;

// ---- Deactivate User drawer ---------------------------------------------------------

/**
 * Row "Inactivate" on an active user -> drawer `user-deactivate-drawer`: title
 * "Deactivate User?", warning "Deactivate {name}? They will not be able to sign
 * in. No other record is changed.", reason select (lookup
 * userDeactivationReason), details (max 500), Cancel / Deactivate. Row
 * "Activate" on an inactive user -> `#pbm-dialog` "Activate User?" / "Do you
 * want to make {name} active?".
 */
export const USER_DEACTIVATE = {
  root: 'user-deactivate-drawer',
  title: 'user-deactivate-drawer-title',
  close: 'user-deactivate-drawer-close',
  body: 'user-deactivate-drawer-body',
  warning: 'user-deactivate-drawer-warning',
  reason: 'user-deactivate-drawer-reason-select',
  reasonError: 'user-deactivate-drawer-reason-error',
  details: 'user-deactivate-drawer-details-input',
  detailsError: 'user-deactivate-drawer-details-error',
  cancel: 'user-deactivate-drawer-cancel-button',
  confirm: 'user-deactivate-drawer-confirm-button',
} as const;

// ---- User Profile (admin view) ---------------------------------------------------

/**
 * `/users-management/users-administration/profile/{id}`: header card (initials,
 * gender, name, user name, status), summary strip (Nationality, Document ID,
 * Mobile Number, Age), four collapsible sections. The VALUES carry no ids
 * (read a section's panel text). Edit Profile is in the breadcrumb actions;
 * there is NO Change Password button on this page (2026-11-08).
 */
export const USER_PROFILE = {
  editButton: 'user-profile-edit-button',
  collapseAll: 'user-profile-collapse-all-button',
  section: {
    personal: 'user-profile-section-personal',
    contact: 'user-profile-section-contact',
    rolesStatus: 'user-profile-section-rolesstatus',
    record: 'user-profile-section-record',
  },
} as const;

export type UserProfileSection = keyof typeof USER_PROFILE.section;

// ---- Invitations ----------------------------------------------------------------------

/** `/users-management/invitations` (`invitation-list`). */
export const INVITATION_LIST = {
  screen: 'invitation-list',
  root: 'invitation-list',
  toolbar: 'invitation-list-toolbar',
  searchInput: 'invitation-list-search-input',
  searchFilterButton: 'invitation-list-search-filter-button',
  /** "Approvals List (N)" -> /approval-management?tab=invitation. A p-button. */
  approvalsButton: 'invitation-list-gotoapprovals-button',
  sortTrigger: 'invitation-list-sort-trigger',
  sortDirection: 'invitation-list-sort-direction',
  sortMenu: 'invitation-list-sort-menu',
  sortOptionPrefix: 'invitation-list-sort-option-',
  exportTrigger: 'invitation-list-export-trigger',
  exportMenu: 'invitation-list-export-menu',
  exportSelected: 'invitation-list-export-selected',
  exportAll: 'invitation-list-export-all',
  /** "Add Invitation" (p-button). */
  addButton: 'invitation-list-add-button',
  chips: 'invitation-list-filter-chips',
  table: 'invitation-list-table-el',
  tableBody: 'invitation-list-table-body',
  tableEmpty: 'invitation-list-table-empty',
  pager: 'invitation-list-table-pager',
  cards: 'invitation-list-cards',
  loadMore: 'invitation-list-load-more-button',
} as const;

/** Invitation table columns (`-cell-{key}`, `-th-{key}`): Email, Role, Payer, Expiration, Status, Actions. */
export const INVITATION_COLUMN = {
  email: 'email',
  role: 'rolename',
  payer: 'payer',
  expiration: 'expiration',
  status: 'status',
} as const;

export type InvitationColumnKey = keyof typeof INVITATION_COLUMN;

/** Row actions by status: Pending -> Pause / Resend / Delete; Paused -> Play / Resend / Delete; others -> Resend / Delete (Completed: both disabled). */
export const INVITATION_ROW_ACTION = {
  pause: 'pause',
  play: 'play',
  resend: 'resend',
  delete: 'delete',
} as const;

export type InvitationRowAction = keyof typeof INVITATION_ROW_ACTION;

/** Sort By (`invitation-list-sort-option-{key}`): Newest (default), Oldest, Email, Role, Expiration, Status, Last Modified. */
export const INVITATION_SORT_OPTION = {
  newest: 'newest',
  oldest: 'oldest',
  email: 'email',
  role: 'rolename',
  expiration: 'expireson',
  status: 'status',
  lastModified: 'modifiedon',
} as const;

export type InvitationSortOption = keyof typeof INVITATION_SORT_OPTION;

/** Advance Search for Invitations: Email, Role, Payer, Expiration, Status. */
export const INVITATION_ADVANCED_SEARCH = {
  root: 'invitation-list-advanced-search',
  title: 'invitation-list-advanced-search-title',
  close: 'invitation-list-advanced-search-close',
  field: {
    email: 'invitation-list-advanced-search-field-email-input',
    role: 'invitation-list-advanced-search-field-roleid-input',
    payer: 'invitation-list-advanced-search-field-payerid-input',
    expiration: 'invitation-list-advanced-search-field-expireson-input',
    status: 'invitation-list-advanced-search-field-status-input',
  },
  cancel: 'invitation-list-advanced-search-cancel-button',
  search: 'invitation-list-advanced-search-search-button',
} as const;

export type InvitationAdvancedField = keyof typeof INVITATION_ADVANCED_SEARCH.field;
export const INVITATION_ADVANCED_SELECTS: readonly InvitationAdvancedField[] = ['role', 'payer', 'status'];

/** One invitation card (`invitation-card-{id}`): `-title` (e-mail), `-role`, `-payer`, `-expiration`, `-status` (+ `-label`), footer `-{pause|play|resend|delete}-button`. */
export const INVITATION_CARD = {
  prefix: 'invitation-card-',
  field: { email: 'title', role: 'role', payer: 'payer', expiration: 'expiration', status: 'status' },
} as const;

/**
 * Add New Invitation drawer (`invitation-form-drawer`): Role Name (select),
 * Payer (select `-role-name-select-2` - the second select; disabled for a
 * non-payer-scoped role), Email Address (+ add button or Enter -> chips),
 * Import Email from Excel (hidden file input), Cancel / Save.
 */
export const INVITATION_FORM = {
  root: 'invitation-form-drawer',
  title: 'invitation-form-drawer-title',
  close: 'invitation-form-drawer-close',
  role: 'invitation-form-drawer-role-name-select',
  /** The PAYER select (the app gives it the role select's id + "-2"). */
  payer: 'invitation-form-drawer-role-name-select-2',
  email: 'invitation-form-drawer-email-address-input',
  addEmail: 'invitation-form-drawer-add-email-button',
  file: 'invitation-form-drawer-file-input',
  /** The chips row and one chip: `{chipPrefix}{e-mail with every non-alphanumeric as -}` (+ `-remove`). */
  chips: 'invitation-form-drawer-email-chips',
  chipPrefix: 'invitation-form-drawer-email-chips-chip-',
  /** "+N more" - past three chips the rest are folded behind this toggle (probe 2026-11-08, 20656). */
  chipsToggle: 'invitation-form-drawer-email-chips-toggle',
  /** Field errors: Role ("This field is required.") and Email (required / "Enter a valid email address."). */
  roleError: 'invitation-form-drawer-role-id-error',
  emailsError: 'invitation-form-drawer-emails-error',
  cancel: 'invitation-form-drawer-cancel-button',
  save: 'invitation-form-drawer-save-button',
} as const;

// ---- My Profile / Change Password -----------------------------------------------------

/**
 * `/my-profile` (header user menu > My Profile): header (name, user name,
 * active toggle + label, Change Password), four sections. Editable fields are
 * `my-profile-field-{key}` with `-label`, `-value`, `-edit-button`; in edit
 * mode `-input` (or a select), `-save-button`, `-cancel-button`. Read-only values
 * are `my-profile-{key}` with `-label`.
 */
export const MY_PROFILE = {
  root: 'my-profile',
  name: 'my-profile-name',
  username: 'my-profile-username',
  activeToggle: 'my-profile-active-toggle',
  activeLabel: 'my-profile-active-label',
  changePasswordButton: 'my-profile-change-password-button',
  collapseAll: 'my-profile-collapse-all-button',
  section: {
    personal: 'my-profile-section-personal',
    contact: 'my-profile-section-contact',
    rolesStatus: 'my-profile-section-rolesstatus',
    record: 'my-profile-section-record',
  },
  /** In-place editable fields (`my-profile-field-{key}`). */
  field: {
    englishFirstName: 'englishfirstname',
    englishSecondName: 'englishsecondname',
    englishLastName: 'englishlastname',
    arabicFirstName: 'arabicfirstname',
    arabicSecondName: 'arabicsecondname',
    arabicLastName: 'arabiclastname',
    phoneNumber: 'phonenumber',
    countryDialCode: 'countrydialcodeid',
    preferredLanguage: 'preferredlanguageid',
    preferredContactMethod: 'preferredcontactmethodid',
  },
  /** Read-only values (`my-profile-{key}`, label `my-profile-{key}-label`). */
  value: {
    gender: 'my-profile-gender',
    nationality: 'my-profile-nationality',
    identityType: 'my-profile-identity-type',
    documentId: 'my-profile-document-id',
    dob: 'my-profile-dob',
    hijriDob: 'my-profile-hijri-dob',
    /** NOTE the doubled suffix: the value is `my-profile-age-label`, its label `my-profile-age-label-label`. */
    age: 'my-profile-age-label',
    email: 'my-profile-email',
    status: 'my-profile-status',
    lastLogin: 'my-profile-last-login',
    emailConfirmed: 'my-profile-email-confirmed',
    accountDeactivationDate: 'my-profile-account-deactivation-date',
  },
} as const;

export type MyProfileField = keyof typeof MY_PROFILE.field;
export type MyProfileValue = keyof typeof MY_PROFILE.value;
export type MyProfileSection = keyof typeof MY_PROFILE.section;

/**
 * The Change Password drawer (`change-password-drawer`, from the user menu or My
 * Profile; "Set a New Password" when forced): Current / New / Confirm (masked),
 * the live requirements list (`-new-password-requirements-rule-{lengthrange|
 * uppercase|lowercase|digit|symbol|uniquechars}`), the strength meter, Cancel /
 * Change Password (`submit`).
 */
export const CHANGE_PASSWORD = {
  root: 'change-password-drawer',
  title: 'change-password-drawer-title',
  close: 'change-password-drawer-close',
  body: 'change-password-drawer-body',
  intro: 'change-password-drawer-intro',
  current: 'change-password-drawer-current-password-input',
  currentError: 'change-password-drawer-current-password-error',
  next: 'change-password-drawer-new-password-input',
  nextError: 'change-password-drawer-new-password-error',
  confirm: 'change-password-drawer-confirm-password-input',
  confirmError: 'change-password-drawer-confirm-password-error',
  requirements: 'change-password-drawer-new-password-requirements',
  rulePrefix: 'change-password-drawer-new-password-requirements-rule-',
  strength: 'change-password-drawer-new-password-strength',
  strengthLabel: 'change-password-drawer-new-password-strength-label',
  alert: 'change-password-drawer-alert',
  cancel: 'change-password-drawer-cancel-button',
  submit: 'change-password-drawer-submit-button',
} as const;

/** The live checklist lines (`{rulePrefix}{key}`) - only the ones the policy imposes are rendered. */
export const PASSWORD_RULE = {
  lengthRange: 'lengthrange',
  uppercase: 'uppercase',
  lowercase: 'lowercase',
  digit: 'digit',
  symbol: 'symbol',
  uniqueChars: 'uniquechars',
} as const;

export type PasswordRule = keyof typeof PASSWORD_RULE;

// ---- Header user menu / Session Expired ---------------------------------------------

export const USER_MENU = {
  trigger: 'app-header-user-menu-trigger',
  panel: 'app-header-user-menu-panel',
  profile: 'app-header-user-menu-profile',
  changePassword: 'app-header-user-menu-change-password',
  logout: 'app-header-user-menu-logout',
} as const;

/**
 * "Session Expired" is the shared `#pbm-dialog` (DIALOG.title / .message) with
 * ONE action `pbm-dialog-action-login` "Go to Login Page". Raised by the HTTP
 * interceptor on any 401.
 */
export const SESSION_EXPIRED = {
  host: 'pbm-session-expired-dialog-host',
  loginAction: 'pbm-dialog-action-login',
} as const;

// ---- Sign-in / Reset password (unauthenticated) --------------------------------------

/** The sign-in screen (`/login`) beyond LOGIN in ElementIds: errors, title, Forget Password? link, language toggle. */
export const SIGN_IN = {
  title: 'login-title',
  form: 'login-form',
  email: 'login-email',
  emailError: 'login-email-error',
  password: 'login-password',
  passwordError: 'login-password-error',
  submit: 'login-submit-button',
  /** The failure banner ("Important" + the server's message). */
  alert: 'login-alert',
  forgotLink: 'login-forgot-password-link',
  languageToggle: 'auth-shell-language-toggle-button',
} as const;

/**
 * `/reset-password`: step 1 (Sending an Email: `reset-email`, Continue, Log In)
 * and, with `?email=&code=` from the e-mailed link, step 2 (Reset your Password:
 * `reset-password` + `reset-confirm`, requirements, strength, Save Password).
 */
export const RESET_PASSWORD = {
  title: 'reset-password-title',
  stepper: 'reset-password-stepper',
  stepPrefix: 'reset-password-stepper-step-',
  emailForm: 'reset-password-email-form',
  email: 'reset-email',
  emailError: 'reset-email-error',
  continue: 'reset-password-continue-button',
  login: 'reset-password-login-button',
  passwordForm: 'reset-password-password-form',
  password: 'reset-password',
  passwordError: 'reset-password-error',
  confirm: 'reset-confirm',
  confirmError: 'reset-confirm-error',
  requirements: 'reset-password-requirements',
  strength: 'reset-password-strength',
  save: 'reset-password-save-button',
  alert: 'reset-password-alert',
} as const;

// ---- System Settings > Password Policy ----------------------------------------------

/** `/system-settings/settings`, tab "Password Policy": read view (values carry no ids) + Edit -> drawer. */
export const PASSWORD_POLICY = {
  tab: 'settings-hub-tab-password-policy',
  tabs: 'settings-hub-tabs',
  editButton: 'settings-password-policy-edit-button',
  drawer: 'settings-password-policy-drawer',
  title: 'settings-password-policy-drawer-title',
  close: 'settings-password-policy-drawer-close',
  input: {
    requiredLength: 'settings-password-policy-drawer-required-length-input',
    maximumLength: 'settings-password-policy-drawer-maximum-length-input',
    requiredUniqueChars: 'settings-password-policy-drawer-required-unique-chars-input',
    passwordHistoryCount: 'settings-password-policy-drawer-password-history-count-input',
    expiryDays: 'settings-password-policy-drawer-expiry-days-input',
  },
  checkbox: {
    requireUppercase: 'settings-password-policy-drawer-require-uppercase-checkbox',
    requireLowercase: 'settings-password-policy-drawer-require-lowercase-checkbox',
    requireDigit: 'settings-password-policy-drawer-require-digit-checkbox',
    requireNonAlphanumeric: 'settings-password-policy-drawer-require-non-alphanumeric-checkbox',
    requireChangeForNewUsers: 'settings-password-policy-drawer-require-change-for-new-users-checkbox',
  },
  /** Field errors: `{input id without -input}-error`. */
  errorSuffix: '-error',
  cancel: 'settings-password-policy-drawer-cancel-button',
  save: 'settings-password-policy-drawer-save-button',
} as const;

export type PolicyNumberField = keyof typeof PASSWORD_POLICY.input;
export type PolicyFlagField = keyof typeof PASSWORD_POLICY.checkbox;
