import { DateUtils } from '../../utils/DateUtils';
import { DATE_MESSAGES } from './expiryDateRules.data';

/**
 * Test data for "Restrict Effective Date to Today or Later".
 *
 * The Effective Date field enforces its rule ON THE FORM, with a real inline
 * message - this is the same well-behaved corner of the module the expiry-date
 * story lives in, so nothing here reads a response to learn whether the app
 * refused. The message and the date helpers are reused from that story rather
 * than restated.
 *
 * THE GRANDFATHERED CASES need a payer whose Effective Date is already in the
 * past, which the create form will not produce - it rejects a past effective
 * date. So those cases set the past date directly on the wire (the same seam
 * the status-derivation story uses), which is the only way to reach the state
 * the sheet describes: a record whose effective date predates the rule.
 *
 * THE NON-ADMIN CASE is BLOCKED for want of the second account.
 */
export const EFFECTIVE_MESSAGES = {
  beforeToday: DATE_MESSAGES.effectiveBeforeToday,
  malformed: DATE_MESSAGES.malformed,
  required: DATE_MESSAGES.required,
} as const;

/** An expiry safely after any effective date these cases use. */
export const SAFE_EXPIRY_DAYS_AHEAD = 400;

/** Effective dates that the form must ACCEPT, by days from today. */
export const ACCEPTED_EFFECTIVE = {
  today: 0,
  future: 30,
} as const;

/** Effective dates the form must REJECT as earlier than today. */
export const REJECTED_EFFECTIVE = [
  { label: 'yesterday', daysAgo: 1 },
  { label: 'far in the past', daysAgo: 400 },
] as const;

/** A malformed value typed into the date field. */
export const MALFORMED_EFFECTIVE = '31/31/2026';

/** A past effective date to stamp on the wire for the grandfathered cases. */
export const GRANDFATHERED_EFFECTIVE_DAYS_AGO = 120;

/** Builds a DD/MM/YYYY effective date `days` from today (negative = past). */
export function effectiveDate(days: number): string {
  if (days === 0) return DateUtils.todayFormatted();
  return days > 0 ? DateUtils.futureDate(days) : DateUtils.pastDate(Math.abs(days));
}

/** The account the access-control case needs. */
export const EFFECTIVE_ROLE_REQUIREMENT = {
  role: 'a non-administrator payer role',
  reason:
    'The case proves a non-administrator cannot register or edit a payer\'s Effective Date. The '
    + 'shared administrator session can do both, so running it as the administrator asserts nothing.',
} as const;
