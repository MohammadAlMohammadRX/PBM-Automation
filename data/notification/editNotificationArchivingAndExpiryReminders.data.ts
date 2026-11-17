/**
 * US 20868 "Edit Notification Archiving and Expiry Reminders" (notification folder 03,
 * 9 cases: 21952, 21955, 21957-21960, 21962-21964; 21951 / 21953 / 21954 / 21956 /
 * 21961 wait for the BA and are not written).
 *
 * Where it lives in this build (foundation 2026-11-11): System Settings > Settings >
 * General, section "Notifications & Announcements Archiving" - read view + the
 * "Edit Setting" drawer: Auto-archive announcements / notifications after read (days)
 * and Reminder before (days) are NUMBER boxes (min 1 / 1 / 0, max 365, step 1 - the
 * box applies its own limits as you type / leave it), the hint under Reminder before
 * ("Reminds N day(s) before ..." / "Set to 0 to send no expiry reminders at all."),
 * Remind every = a select (Every day / two days / three days / week = 1 / 2 / 3 / 7).
 * The drawer has no client validation: Save sends the changed keys; the server's
 * refusal is shown as a toast (in the UI language); success toasts "Setting updated".
 *
 * SAFETY: every case takes notificationSettingsGuard (restore + read-back at teardown).
 * 0 / 365 / 15 etc. change reminders for every record system-wide only for the seconds
 * until teardown restores them.
 *
 * Literal readings / decisions:
 * - "Navigate to the Notification Center Management module / open the Notice
 *   Archiving and Expiry Reminders settings screen" = System Settings > Settings
 *   (General) and its Edit drawer - where the live app keeps these settings.
 * - 21955 (TC quotes the message in English AND Arabic): the refusal is checked in
 *   English, then repeated with the UI in Arabic; 0 and 365 must save. A box that
 *   turns -1 / 366 into another value and SAVES it is the finding (the stored value
 *   changes and no message shows). Every attempt (each language, and 366 after 365 was
 *   saved) starts from the ORIGINAL stored value (guard restore + hub reload): otherwise a
 *   box that turns -1 into 1 / 366 into 365 sends nothing the second time (triage 2026-11-12).
 * - 21960 (HOW): 7.5 / "abc" - refused with the whole-number message, OR the box
 *   refuses the keystrokes so nothing changes (prevention); a different value being
 *   STORED fails. The "abc" step starts from the ORIGINAL stored value (what the 7.5 step
 *   stored is that step's finding, not this one's).
 * - 21962 / 21963 "a required-field validation message": the save must be refused,
 *   the drawer stay open, a message naming the problem show (REQUIRED pattern), and
 *   nothing be stored.
 * - 21959 (raw request): PUT UpsertSystemSettings with Remind every 4 and 5, in English
 *   and in Arabic (Accept-Language, the header the app sends). An accepted value is put
 *   back at once and the case fails.
 * - 21957: the stored Reminder before is first set to 6 through the guard (precondition
 *   "currently a non-zero value"), because saving 7 over a stored 7 sends nothing and
 *   shows no toast. The hint is read from the drawer opened again after each save.
 * - 21957 precondition "expiry reminders are active" (a NEGATIVE case only means something
 *   when reminders do go out): with Reminder before 6, a CONTROL suite network expiring in
 *   3 days + an ACTIVE suite "Expiring Soon - Network" app notification for careconnect;
 *   the network job is moved after the network's effective time (and fired once more if
 *   needed) and the control's Expiring Soon must arrive - else BLOCKED (REMINDERS_NOT_ACTIVE,
 *   decided at run time; writer E's 21934 never saw a network Expiring Soon either).
 * - 21957 step 4 (AUTO_JOB): a SECOND suite network expiring in 3 days; the network job is
 *   moved after its effective time; once the job made it Active (proof it ran) and 90 s
 *   more, careconnect must hold NO new notification of that definition (for it or the
 *   control). Which process sends "Expiring Soon" is not stated - the network status job
 *   is assumed (assessment).
 * - 21964 (exploratory, AUTO_JOB): the drawer's reminder controls are exactly one
 *   Reminder before box and one Remind every select (no per-module / per-payer
 *   control); the read view shows one schedule. Then Reminder before 5 / Every day is
 *   saved and payer, network, policy and formulary records expiring within 5 days each
 *   must get an "Expiring Soon" notification of their suite definition. Every record is
 *   the suite's OWN (triage 2026-11-12): the payer through the payer module's publishPayer
 *   fixture (create + seeded network + approve, effective 30 days back so Active, expiry 4
 *   days ahead; purged at teardown), the policy through the policy module's policyIn
 *   ('Future', going live in 4 min, grace 0; discarded at teardown), network and formulary
 *   approved going live in 4 min. A record that cannot be made BLOCKS the case at run time
 *   with the application's answer (lead decision 8).
 */
export const ARCHIVING_STORY = { id: 20868, title: 'Edit Notification Archiving and Expiry Reminders' } as const;

export const CASES = {
  validCustom: { azureId: 21952, announcements: '45', notifications: '60', reminderBefore: '15', remindEvery: 'Every three days', remindEveryStored: '3' },
  reminderRange: { azureId: 21955, below: '-1', min: '0', max: '365', above: '366' },
  zeroSwitchesOff: { azureId: 21957, precondition: '6', seven: '7', zero: '0', expiresInDays: 3 },
  fourCadences: { azureId: 21958, saves: [{ label: 'Every two days', stored: '2' }, { label: 'Every three days', stored: '3' }, { label: 'Every week', stored: '7' }] },
  invalidCadenceRaw: { azureId: 21959, values: ['4', '5'] },
  wholeNumbers: { azureId: 21960, decimal: '7.5', text: 'abc' },
  announcementsBlank: { azureId: 21962 },
  notificationsBlank: { azureId: 21963 },
  oneSchedule: { azureId: 21964, reminderBefore: '5', remindEvery: 'Every day', remindEveryStored: '1', withinDays: 5, kinds: ['payer', 'network', 'policy', 'formulary'] as const },
} as const;

/** The section's read-view labels (live 2026-11-11). */
export const LABEL = {
  section: 'Notifications & Announcements Archiving',
  announcements: 'Auto-archive announcements after read (days)',
  notifications: 'Auto-archive notifications after read (days)',
  reminderBefore: 'Reminder before (days)',
  remindEvery: 'Remind every',
} as const;

/** The four cadences, in order. */
export const REMIND_EVERY_OPTIONS = ['Every day', 'Every two days', 'Every three days', 'Every week'] as const;

/** Messages the AC quotes. */
export const MESSAGE = {
  updated: 'Setting updated',
  reminderRangeEn: 'Reminder before (days) must be a whole number between 0 and 365.',
  reminderRangeAr: 'يجب أن يكون التذكير قبل (أيام) رقمًا صحيحًا بين 0 و365.',
  remindEveryEn: 'Remind every must be 1, 2, 3 or 7 days.',
  remindEveryAr: 'يجب أن يكون تكرار التذكير 1 أو 2 أو 3 أو 7 أيام.',
  hint: (days: string): string => `Reminds ${days} day(s) before the expiry date, then repeats on the same cadence until it expires.`,
  hintOff: 'Set to 0 to send no expiry reminders at all.',
  /** A required / validation message (the TC names no text). */
  required: /required|mandatory|must|between|cannot be empty|whole number/i,
} as const;

/** 21959: the Remind every refusal per request language (Accept-Language). */
export const REMIND_EVERY_MESSAGE: Readonly<Record<'en' | 'ar', string>> = { en: MESSAGE.remindEveryEn, ar: MESSAGE.remindEveryAr };

/** Drawer control ids of the reminder schedule (21964): exactly these, nothing per module / payer. */
export const REMINDER_CONTROL_IDS = [
  'settings-general-notificonfig-expiryreminderbeforedays-input',
  'settings-general-notificonfig-expiryreminderbeforedays-schedule-hint',
  'settings-general-notificonfig-expiryremindereverydays-select',
] as const;

/** 21957: BLOCKED when the control network got no Expiring Soon reminder (precondition "expiry reminders are active"). */
export const REMINDERS_NOT_ACTIVE = (reminderBefore: string, firings: readonly string[], status: string): string =>
  `The precondition "expiry reminders are active" does not hold: with Reminder before ${reminderBefore} days the network job `
  + `(fired ${firings.join(', ')}) left the suite control network expiring in 3 days "${status}" and sent no "Expiring Soon - Network" `
  + 'notification for it - so "no reminder once Reminder before is 0" cannot be told apart from "no reminder at all".';

/** 21964 / 21637: BLOCKED when a kind's record could not be had (lead decision 8). */
export const NO_RECORD_BLOCKED = (missing: string): string =>
  `Records nearing expiry could not be had for: ${missing}. The case needs an Active record of each kind expiring within the reminder window.`;
