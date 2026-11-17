/**
 * US 21022 "Edit Email Provider Settings" (notification folder 30, 7 cases: 21889-21892,
 * 21894, 21901, 21903; the other ten wait for the BA or are environment-blocked).
 *
 * Where it lives in this build (foundation 2026-11-11): System Settings > Settings >
 * General, section "SMTP" (read view: From email, SMTP port, SMTP server, SMTP user)
 * and the same four text boxes in the "Edit Setting" drawer
 * (`settings-general-smtp-fromemail|port|server|user-input`). No password field and no
 * password key exist (GetSystemSettings, 2026-11-11). Save sends the changed keys;
 * success toasts "Setting updated" + "The setting was updated successfully."
 * (Arabic "تم تحديث الإعداد بنجاح.").
 *
 * SAFETY: every case takes notificationSettingsGuard - the SMTP values are restored and
 * read back at teardown, seconds after the save (meanwhile e-mail would not send - it
 * fails in this environment anyway). NO password value is ever read or printed: the
 * password checks look at ids, input types and key NAMES only.
 *
 * Literal readings / decisions:
 * - "Notification Center module > SMS & Mail provider section > Edit" = System
 *   Settings > Settings > General, SMTP section, Edit (where the live app keeps the
 *   SMTP values; the AC's location does not exist in this build).
 * - 21889: the UI is switched to Arabic (header toggle) for the whole case and back to
 *   English at the end; the From email gets a suite value.
 * - 21890 / 21891 / 21892 / 21903 "no validation error is shown": the save answers 2xx,
 *   the success toast shows, the drawer closes, and the stored value is exactly what
 *   was typed (blank / "abcd" / "not-an-email!!@@").
 * - 21894: the read view lists no password label, the drawer has no control whose id
 *   names a password and no password-type input, and GetSystemSettings carries no SMTP
 *   key naming a password (by key name only).
 * - 21901 "close or cancel": the drawer's Cancel; then no toast, and the drawer opened
 *   again shows the stored (unchanged) values.
 */
export const SMTP_STORY = { id: 21022, title: 'Edit Email Provider Settings' } as const;

export const CASES = {
  arabicToast: { azureId: 21889, fromEmail: 'qa.automation.from@neorx.co' },
  blankServer: { azureId: 21890 },
  blankFromEmail: { azureId: 21891 },
  nonNumericPort: { azureId: 21892, port: 'abcd' },
  passwordHidden: { azureId: 21894 },
  cancelDiscards: { azureId: 21901, fromEmail: 'qa.automation.cancel@neorx.co', port: '2525', server: 'smtp.qa-automation.invalid', user: 'qa.automation.user' },
  invalidFromEmail: { azureId: 21903, fromEmail: 'not-an-email!!@@' },
} as const;

/** The SMTP read-view labels (live 2026-11-11). */
export const SMTP_LABELS = ['From email', 'SMTP port', 'SMTP server', 'SMTP user'] as const;
export const SMTP_SECTION = 'SMTP';
/** The read-view heading that follows the SMTP section (its lines end there). */
export const SMTP_SECTION_END = 'Notifications & Announcements Archiving';
/** The four SMTP boxes of the Edit drawer (SETTINGS_NOTIFICATION_FIELDS keys). */
export const SMTP_FIELDS = ['smtpServer', 'smtpPort', 'smtpUser', 'smtpFromEmail'] as const;

/** Messages the AC quotes. */
export const MESSAGE = {
  updatedTitle: 'Setting updated',
  updatedEn: 'The setting was updated successfully.',
  updatedAr: 'تم تحديث الإعداد بنجاح.',
  /** Anything that reads as a validation complaint (must NOT show). */
  validation: /required|invalid|must|not valid|format/i,
} as const;

/** A label / key that would name a password (only names are checked, never values). */
export const PASSWORD_WORD = /pass(word)?|secret/i;
