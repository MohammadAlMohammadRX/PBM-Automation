import { pickerDateTime, pickerMinutesFromNow } from './network.data';

/**
 * Test data for US 14309 "Reactivate an expired network when its expiry date
 * is extended".
 *
 * Each case's network is its own, already Expired (fixture
 * `networkIn('Expired')`: effective a minute out, expiring two minutes later,
 * then expired by the every-minute job - so its effective date is TODAY and in
 * the past). The edit is made through the Edit drawer, saved as a draft, sent
 * for approval and approved, exactly as a user would.
 *
 * The sheets' dates are relative to a site date of 2026-10-04; they are kept
 * as offsets from today: 2026-12-31 ~ +70 days, 2026-11-01 ~ +28 days,
 * 2026-10-05 = tomorrow, 2026-10-10 = +6 days. All values are picker strings
 * ("DD/MM/YYYY HH:mm").
 */
export const DATES = {
  /** "New Expiry Date = 2026-12-31". */
  extendedExpiry: () => pickerDateTime(70),
  /** "New Effective Date = 2026-11-01" (future). */
  futureEffective: () => pickerDateTime(28),
  /** "Effective Date = 2026-10-05" (today + 1). */
  tomorrowEffective: () => pickerDateTime(1),
  /** "Effective Date = today": today, a few minutes ahead (the form refuses a past time). */
  todayEffective: () => pickerMinutesFromNow(3),
  /** "Expiry extended only up to today": 23:59 today. */
  expiryToday: () => pickerDateTime(0, '23:59'),
  /** "Expiry 2026-09-15" - a past expiry. */
  pastExpiry: () => pickerDateTime(-1),
  /** "Expiry 2026-10-15" while the effective date is 2026-11-01: expiry before effective. */
  expiryBeforeEffective: () => pickerDateTime(11),
  /** 18138: the first submitted expiry, then the final one. */
  firstExpiry: () => pickerDateTime(70),
  finalExpiry: () => pickerDateTime(6),
} as const;

/** The unrelated field 18130 edits (the sheet's example is the name; the description is as unrelated and safer to change). */
export const UNRELATED_EDIT = { descriptionEn: 'Edited without touching the dates.' } as const;

/** How the approval cell reads while an edit awaits a checker. */
export const PENDING_APPROVAL_CELL = /Pending Approval/;

/** The approver as the audit trail names the administrator. */
export const APPROVER_ACTOR = 'CareConnect';

export const CASE = {
  extendToActive: '18125',
  futureEffectiveToPending: '18126',
  effectiveTodayActive: '18127',
  effectiveTomorrowPending: '18128',
  expiryTodayStaysExpired: '18129',
  noExtensionStaysExpired: '18130',
  decisionTable: '18132',
  stateMap: '18133',
  expiryBeforeEffectiveRejected: '18134',
  noSelfApproval: '18135',
  viewerCannotExtend: '18136',
  auditHistory: '18137',
  finalValuesUsed: '18138',
} as const;

/** How the approval cell reads once the edit has been approved. */
export const PUBLISHED_CELL = /Published/;
