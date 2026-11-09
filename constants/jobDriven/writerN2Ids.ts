/**
 * Element ids for Writer N2's job-driven Network stories (2026-11-08):
 * US 14310 (the network status job's schedule, System Settings > Settings >
 * General > "Scheduled Jobs") and US 14323 (Notification Center definitions).
 *
 * Read off the live screens by the foundation probe (reports/manual-automation/
 * Foundation-Notes.md, "Jobs and the settings screen" and "Notifications").
 * The General drawer's ids and each job's controls stay in
 * constants/ElementIds.ts (SETTINGS_GENERAL, SETTINGS_JOBS) and are driven
 * through SettingsPage.
 */

/** System Settings > Notification Center. */
export const NOTIFICATION_CENTER_ROUTE = '/system-settings/notification-center';

/** Notification Center ids (definitions = the bilingual templates). */
export const NOTIFICATION_CENTER = {
  definitionsTab: 'notification-center-tab-definitions',
  triggersTab: 'notification-center-tab-triggers',
  addDefinition: 'nc-definitions-add-button',
  search: 'nc-definitions-search',
  table: 'nc-definitions-table',
  /** `nc-definitions-table-row-<id>` prefixes every cell / action of a definition's row. */
  rowPrefix: 'nc-definitions-table-row-',
  drawer: 'nc-definitions-form-drawer',
  nameInput: 'nc-definitions-form-drawer-name-input',
  moduleSelect: 'nc-definitions-form-drawer-module-select',
  actionSelect: 'nc-definitions-form-drawer-action-select',
  englishInput: 'nc-definitions-form-drawer-english-message-input',
  arabicInput: 'nc-definitions-form-drawer-arabic-message-input',
  isActiveCheckbox: 'nc-definitions-form-drawer-is-active-checkbox',
} as const;

/** The substring a priority control's id would carry, if the drawer had one. */
export const PRIORITY_ID_FRAGMENT = 'priority';
