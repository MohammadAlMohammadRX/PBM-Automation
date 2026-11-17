import type { JobKey } from '../../utils/JobClock';
import { SETTINGS_RIGHT } from './viewSettingsGeneralTab.data';

/**
 * US 20866 "Edit Settings - General Tab" (settings folder 03, 13 cases, 21091-21103).
 *
 * How it works in this build (reports/settings/Settings-Foundation-Notes.md):
 * Edit (`settings-general-edit-button`) opens the "Edit Setting" drawer with
 * every section: Time Zone & Theme (time-zone select with a filter searchbox,
 * site-title text input, logo file input + "Replace logo" / "Remove"),
 * Currency (select + rate text input + converter), SMTP, Notifications, and
 * Scheduled Jobs (a Frequency select + a Riyadh time picker per job; the
 * accumulator reset has no Frequency select but also a picker). Save sends
 * PUT UpsertSystemSettings with ONLY the changed keys; a good save answers 200,
 * toasts "Setting updated" + "The setting was updated successfully." and
 * closes the drawer; a bad one answers 422 and the reason shows as a toast.
 * Closing the drawer with changes closed it at once with NO dialog (foundation q6).
 *
 * SAFETY: every test takes settingsGuard (snapshot + restore + read-back of the
 * 11 guarded keys). Only guarded keys are ever changed here: title, time zone,
 * rate, one job time. A job time typed in 21103 is 04:00 AM Riyadh (01:00 UTC),
 * far from working hours, and is never meant to be saved.
 *
 * Literal readings / decisions:
 * - 21091 / 21092 use suite sessions with exact rights (lead decision 7):
 *   21091 view + edit (GetSystemSettings + UpsertSystemSettings); 21092 view
 *   only, after the admin baseline shows Edit. 21092 step 4 "attempt to modify a
 *   displayed value": the read view must hold no editable control, and typing
 *   on the site-title value must leave it unchanged.
 * - 21093 "pre-filled with its current, editable value" is compared with
 *   GetSystemSettings: time zone (city), title, currency, rate (numeric), each
 *   job's picker against its CRON's Riyadh time; every control must be enabled.
 * - 21094 "searchable drop-down" = the select opens an option list with a
 *   filter searchbox; "text box" = <input type=text>; "file picker" = an
 *   <input type=file> taking images plus its visible upload button.
 * - 21095 (TC wins over the AC, lead decision 2): the case expects a CLOCK for
 *   all six jobs, including the accumulator reset, while the AC wants a CRON
 *   text box for it. The clock is asserted.
 * - 21096: the rate is moved by +0.01 (no confirmation while SAR is in use);
 *   "only the Exchange Rate field shows as modified" = every other drawer value
 *   is still what it was when the drawer opened.
 * - 21097: "an invalid out-of-range" rate is 0 (the AC: must be greater than
 *   zero); the AC's message is expected for it and the title's must NOT show.
 *   The foundation saw 0 sent as 0.0001 - if the drawer saves, that is the
 *   finding (the guard restores).
 * - 21098 "closes with no confirmation message": no request, no toast, no
 *   currency confirmation, drawer closed, nothing stored changed.
 * - 21099 quotes the success toast in English AND Arabic and says it "is
 *   shown" (lead decision 3): the English toast comes from the time-zone save;
 *   the save is repeated in Arabic (a rate nudge - the time-zone option labels
 *   are localised and unknown in Arabic) and the UI is switched back to
 *   English in the last step. The time zone the tab shows is read straight
 *   after the English save (no reload) and asserted in step 5.
 * - The toast quote "Setting updated — The setting was updated successfully."
 *   is summary + detail; the em dash is the separator between them.
 * - 21100 quotes the Unsaved Changes message in English and Arabic: both are
 *   checked (Arabic: the close is repeated with the UI in Arabic). "Attempt to
 *   close the panel" = the drawer's X. The case expects the dialog; the
 *   foundation saw none - the failure states that the drawer closed at once.
 * - 21101 / 21102 step 2 is critical: without the dialog, Keep Editing /
 *   Discard Changes cannot be chosen and the later steps are NOT EXECUTED.
 * - 21103: time zone Cairo (valid), a 101-character title (invalid), rate -1
 *   (the case: negative, invalid), the Policy status job at 04:00 AM (valid);
 *   Save pressed 3 times in quick succession. Expected: no request accepted,
 *   the drawer open, BOTH errors shown, nothing stored changed.
 */

/** Messages the stories quote (English; Arabic where the case quotes it). */
export const MESSAGE = {
  updatedEn: 'Setting updated — The setting was updated successfully.',
  updatedAr: 'تم تحديث الإعداد — تم تحديث الإعداد بنجاح.',
  unsavedEn: 'Unsaved Changes — You have unsaved changes. If you leave now, your edits will be lost.',
  unsavedAr: 'تغييرات غير محفوظة — لديك تغييرات غير محفوظة. إذا غادرت الآن، سيتم فقدان تعديلاتك.',
  keepEditing: 'Keep Editing',
  discardChanges: 'Discard Changes',
  /** US 20864 AC. */
  titleInvalid: 'Site title is required and must not exceed 100 characters.',
  /** US 20867 AC. */
  rateInvalid: 'The exchange rate must be a number greater than zero.',
} as const;

/** Valid time zones to switch to - the first whose IANA id differs from the current one is used. */
export const TIME_ZONE_CHOICES = [
  { label: '(GMT+02:00) Cairo', filter: 'Cairo', iana: 'Africa/Cairo' },
  { label: '(GMT+03:00) Riyadh', filter: 'Riyadh', iana: 'Asia/Riyadh' },
] as const;

/** The drawer's section headings the AC names. */
export const DRAWER_SECTIONS = ['Time Zone & Theme', 'Currency', 'Scheduled Jobs'] as const;

/** A daily picker's value. */
export const PICKER_VALUE = /^\d{2}:\d{2} (AM|PM)$/;

export const CASES = {
  editShown: { azureId: '21091', rights: [SETTINGS_RIGHT.view, SETTINGS_RIGHT.edit] },
  editHidden: { azureId: '21092', rights: [SETTINGS_RIGHT.view], typed: 'X' },
  prefilled: { azureId: '21093' },
  timeZoneThemeControls: { azureId: '21094', logoAccepts: 'image/png' },
  jobClocks: { azureId: '21095' },
  onlyChangedSent: { azureId: '21096', key: 'Currency.UsdToSarRate' },
  oneInvalidBlocks: { azureId: '21097', title: 'QA Automation Title 21097', rate: '0' },
  saveNoChanges: { azureId: '21098' },
  successAndRefresh: { azureId: '21099' },
  unsavedPrompt: { azureId: '21100', title: 'QA Automation Unsaved 21100' },
  keepEditing: { azureId: '21101', title: 'QA Automation Keep 21101' },
  discardChanges: { azureId: '21102', title: 'QA Automation Discard 21102' },
  mixedInvalid: {
    azureId: '21103',
    title: `QA Automation over-length title ${'x'.repeat(69)}`, // 101 characters
    rate: '-1',
    job: 'Jobs.PolicyLifecycleCron' as JobKey,
    /** 01:00 UTC - far from working hours, should it ever be saved. */
    jobTime: '04:00 AM',
    saves: 3,
  },
} as const;
