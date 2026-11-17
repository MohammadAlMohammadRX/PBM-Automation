/**
 * System Setting Management (Feature 20863) - element ids verified on the live
 * screen 2026-11-09 (reports/settings/Settings-Foundation-Notes.md).
 *
 * System Settings > Settings (`/system-settings/settings`) is one hub with four
 * tabs (General, SMS Provider, Two-Factor Authentication, Password Policy). The
 * General tab is a read view plus an "Edit Setting" drawer; every drawer field
 * is `settings-general-<setting key, lower-case, dots removed>-<control>`.
 * The ids already used by other suites stay in constants/ElementIds.ts
 * (SETTINGS_GENERAL, SETTINGS_JOBS); this file adds the rest.
 */

export const SETTINGS_HUB = {
  tabs: 'settings-hub-tabs',
  tab: {
    general: 'settings-hub-tab-general',
    sms: 'settings-hub-tab-sms',
    twoFactor: 'settings-hub-tab-two-factor',
    passwordPolicy: 'settings-hub-tab-password-policy',
  },
  /** The id'd layout outlet - the read view's values carry no ids, so its text is read by label. */
  outlet: 'app-layout-outlet',
} as const;

/** The General "Edit Setting" drawer. */
export const SETTINGS_DRAWER = {
  editButton: 'settings-general-edit-button',
  drawer: 'settings-general-drawer',
  title: 'settings-general-drawer-title',
  close: 'settings-general-drawer-close',
  save: 'settings-general-drawer-save-button',
  cancel: 'settings-general-drawer-cancel-button',
  // Time Zone & Theme
  timeZoneSelect: 'settings-general-site-timezone-select',
  siteTitleInput: 'settings-general-site-title-input',
  logoPreview: 'settings-general-site-logo-logo-preview',
  /** `<input type=file accept="image/png,image/jpeg,image/webp">` - drive with setInputFiles. */
  logoFileInput: 'settings-general-site-logo-logo-input',
  /** Reads "Replace logo" once a logo is set. */
  logoUploadButton: 'settings-general-site-logo-logo-upload-button',
  logoRemoveButton: 'settings-general-site-logo-logo-remove-button',
  // Currency
  currencySelect: 'settings-general-currency-code-select',
  rateInput: 'settings-general-currency-usdtosarrate-input',
  converter: 'settings-general-currency-usdtosarrate-converter',
  converterAmount: 'settings-general-currency-usdtosarrate-converter-amount',
  converterSwap: 'settings-general-currency-usdtosarrate-converter-swap',
  /** "SAR 100.00 = USD 26.67" */
  converterResult: 'settings-general-currency-usdtosarrate-converter-result',
} as const;

/**
 * The shared application dialog (`pbm-dialog`) - the currency confirmation uses
 * it: title "Change the system currency?", message, alert, items idx-0 (example)
 * .. idx-5 (affected screens), the acknowledgement checkbox, Cancel / Change currency.
 */
export const PBM_DIALOG = {
  host: 'pbm-dialog-host',
  dialog: 'pbm-dialog',
  close: 'pbm-dialog-close-button',
  title: 'pbm-dialog-title',
  message: 'pbm-dialog-message',
  alert: 'pbm-dialog-alert',
  items: 'pbm-dialog-items',
  item: (index: number): string => `pbm-dialog-item-idx-${index}`,
  acknowledge: 'pbm-dialog-acknowledge-checkbox',
  cancel: 'pbm-dialog-action-cancel',
  confirm: 'pbm-dialog-action-confirm',
} as const;

/** The unsaved-changes dialog host (its inner ids were never seen - the drawer closed without it, 2026-11-09). */
export const UNSAVED_DIALOG = {
  host: 'pbm-unsaved-changes-dialog-host',
} as const;

/** The application toast. */
export const SETTINGS_TOAST = {
  toast: 'pbm-toast',
  summary: 'pbm-toast-summary',
  detail: 'pbm-toast-detail',
} as const;
