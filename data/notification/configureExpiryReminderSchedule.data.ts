/**
 * US 21006 "Configure Expiry Reminder Schedule" (notification folder 20, 11 cases:
 * 21628-21635, 21637, 21641, 21642; 21636 / 21638 / 21639 / 21640 wait for the BA).
 *
 * Same controls as folder 03 (System Settings > Settings > General > Edit Setting,
 * section "Notifications & Announcements Archiving"): Reminder before (days) is a
 * number box (min 0, max 365, step 1) with the hint under it; Remind every a select.
 * See data/notification/editNotificationArchivingAndExpiryReminders.data.ts for how
 * a save behaves. Every case takes notificationSettingsGuard.
 *
 * Literal readings / decisions:
 * - "Navigate to the Notification Center Management module / open the Notifications &
 *   Announcements Archiving settings section" = System Settings > Settings (General)
 *   and its Edit drawer, where the section lives.
 * - 21628 precondition "No custom values previously configured": cannot be proven; the
 *   stored values must be the defaults 7 / Every day, else the case is BLOCKED naming
 *   the stored values (HOW). Then the drawer must show 7 / "Every day".
 * - 21630 / 21631 (366 / -1) "rejects the value with a validation error and the setting
 *   is not saved": a message must show AND nothing be stored. A box that turns the
 *   value into another and SAVES it is the finding.
 * - 21633 / 21641 ("abc" / 7.5): refused with a validation error, or the box refuses
 *   the keystrokes so nothing changes (prevention, as folder 03's HOW); a different
 *   value being STORED fails.
 * - 21634 blank: the save refused with a message, nothing stored.
 * - 21632: the hint must read "Set to 0 to send no expiry reminders at all." once 0 is
 *   typed (before Save), and the save succeed.
 * - 21642 step 4 "switch the application language to Arabic and reload the section":
 *   the drawer is closed (nothing saved), the UI switched to Arabic, the drawer opened
 *   again and 0 typed again (an unsaved value does not survive a reload) - the Arabic
 *   hint is then read; the UI goes back to English at the end.
 * - 21637 (AUTO_JOB): Reminder before 5 / Every day saved on screen; the payer,
 *   network, plan, policy and formulary records "created or identified": all CREATED as
 *   the suite's own (triage 2026-11-12) - network, plan and formulary approved, effective
 *   in 4 minutes, expiring in 4 days; the payer through the payer module's publishPayer
 *   fixture (effective 30 days back so Active once approved, expiry date 4 days ahead,
 *   purged at teardown); the policy through policyIn('Future') going live in 4 minutes,
 *   grace 0 (discarded at teardown). One that cannot be made BLOCKS the case at run
 *   time with the application's answer. Each
 *   kind gets an ACTIVE suite "Expiring Soon - <Kind>" app notification for
 *   careconnect, its lifecycle job is moved (jobClock) to run after the record's
 *   effective time, and one notification of that definition must arrive per kind.
 *   Which process sends "Expiring Soon" is not stated - the status jobs are assumed.
 */
export const SCHEDULE_STORY = { id: 21006, title: 'Configure Expiry Reminder Schedule' } as const;

export const CASES = {
  defaults: { azureId: 21628, reminderBefore: '7', remindEvery: 'Every day', remindEveryStored: '1' },
  maxValue: { azureId: 21629, value: '365' },
  aboveMax: { azureId: 21630, value: '366' },
  negative: { azureId: 21631, value: '-1' },
  zero: { azureId: 21632, value: '0' },
  nonNumeric: { azureId: 21633, value: 'abc' },
  blank: { azureId: 21634 },
  fourOptions: { azureId: 21635 },
  fiveKinds: { azureId: 21637, reminderBefore: '5', remindEvery: 'Every day', remindEveryStored: '1', withinDays: 5, kinds: ['payer', 'network', 'plan', 'policy', 'formulary'] as const },
  fraction: { azureId: 21641, value: '7.5' },
  hintLive: { azureId: 21642, value: '0' },
} as const;

/** The four options the Remind every select must offer, in order. */
export const REMIND_EVERY_OPTIONS = ['Every day', 'Every two days', 'Every three days', 'Every week'] as const;

/** Messages the AC quotes. */
export const MESSAGE = {
  updated: 'Setting updated',
  hintOffEn: 'Set to 0 to send no expiry reminders at all.',
  hintOffAr: 'اضبطها على 0 لإيقاف تذكيرات انتهاء الصلاحية تمامًا.',
  /** A validation message (the TC names no text): the range / whole-number / required wording. */
  validation: /required|mandatory|must|between|whole number|invalid/i,
} as const;

/** 21628: BLOCKED when the stored values are not the defaults ("never configured" cannot be proven). */
export const NOT_DEFAULT_BLOCKED = (reminder: string, every: string): string =>
  `The stored schedule is Reminder before "${reminder}" / Remind every "${every}", not the defaults 7 / 1 - the precondition "no custom values configured" does not hold in this environment.`;
