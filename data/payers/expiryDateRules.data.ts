import { DateUtils } from '../../utils/DateUtils';

/**
 * Test data for "Restrict Expiry Date to Today or Later".
 *
 * THE HEADLINE FINDING, and it decides the story's first case: an Expiry Date
 * of TODAY cannot be saved at all. Two rules combine to forbid it, both
 * verified on the live wizard:
 *
 *   Effective Date must be today or later
 *     -> "Effective date cannot be earlier than today."
 *   Expiry Date must be AFTER the Effective Date
 *     -> "Expiry date must be after the effective date."
 *
 * So the earliest Effective Date is today, and the expiry has to beat it - which
 * makes TOMORROW the earliest reachable expiry. The story's stated boundary
 * ("accept an Expiry Date set to today") is unreachable by construction, not
 * by defect. That case is written to assert what the application does and is
 * flagged as a contradiction between the story and the implementation, because
 * writing it the story's way would produce a permanent red that no code change
 * short of relaxing one of the two rules could fix.
 *
 * WHAT THIS STORY GETS RIGHT, unlike most in this module: the expiry rules are
 * enforced ON THE FORM, with a real inline message in both languages. There is
 * no silent server rejection here. So these cases can assert messages directly.
 *
 * ONE DIVERGENCE ON MALFORMED INPUT: a nonsense date such as 31/02/2026 leaves
 * its raw text in the box but is reported as `This field is required.` - the
 * datepicker treats an unparseable value as EMPTY rather than as a format
 * error. The story expects a message about the format; the application says
 * "required".
 */

/** Inline messages the date fields produce, verified in both languages. */
export const DATE_MESSAGES = {
  expiryBeforeToday: 'Expiry date cannot be earlier than today.',
  expiryNotAfterEffective: 'Expiry date must be after the effective date.',
  effectiveBeforeToday: 'Effective date cannot be earlier than today.',
  /** What a malformed date actually reports - see the file comment. */
  malformed: 'This field is required.',
  /** The same string, named for its real meaning where a field is simply empty. */
  required: 'This field is required.',
} as const;

export const DATE_MESSAGES_AR = {
  expiryBeforeToday: 'لا يمكن أن يكون تاريخ الانتهاء قبل تاريخ اليوم.',
  expiryNotAfterEffective: 'يجب أن يكون تاريخ الانتهاء بعد تاريخ السريان.',
  effectiveBeforeToday: 'لا يمكن أن يكون تاريخ السريان قبل تاريخ اليوم.',
} as const;

/**
 * Expiry values that must be REFUSED, with the message each produces.
 *
 * Offsets are relative to the run date so the suite never goes stale - a story
 * written against fixed calendar dates would start failing the day after it was
 * written.
 */
export interface RefusedExpiryCase {
  caseId: string;
  label: string;
  /** Days from today; negative is in the past. */
  expiryInDays: number;
  expectedMessage: string;
  expectedMessageAr: string;
}

export const REFUSED_EXPIRY_CASES: readonly RefusedExpiryCase[] = [
  {
    caseId: 'TC-003',
    label: 'yesterday',
    expiryInDays: -1,
    expectedMessage: DATE_MESSAGES.expiryBeforeToday,
    expectedMessageAr: DATE_MESSAGES_AR.expiryBeforeToday,
  },
  {
    caseId: 'TC-004',
    label: 'several years in the past',
    expiryInDays: -2000,
    expectedMessage: DATE_MESSAGES.expiryBeforeToday,
    expectedMessageAr: DATE_MESSAGES_AR.expiryBeforeToday,
  },
];

/**
 * Expiry values that must be ACCEPTED.
 *
 * `today` is deliberately absent - see the file comment. The earliest
 * reachable expiry is tomorrow.
 */
export const ACCEPTED_EXPIRY_CASES = [
  { caseId: 'TC-002', label: 'a future date', expiryInDays: 128 },
  { caseId: 'TC-009', label: 'a valid future leap-year date', expiryInDays: null },
] as const;

/** The earliest expiry the two rules together allow. */
export const EARLIEST_VALID_EXPIRY_IN_DAYS = 1;

/**
 * A malformed value the datepicker cannot parse.
 *
 * 31 February does not exist, so this is rejected as unparseable rather than as
 * out of range - which is what makes it a FORMAT case rather than another
 * boundary one.
 */
export const MALFORMED_EXPIRY = '31/02/2026';

/**
 * The next 29 February that is still in the future, as DD/MM/YYYY.
 *
 * Computed rather than hard-coded: the sheet names 2028-02-29, which stops
 * being a future date in 2028. This keeps the leap-year case meaningful for as
 * long as the suite lives.
 */
export function nextFutureLeapDay(from: Date = new Date()): string {
  const isLeap = (year: number) =>
    (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  for (let year = from.getFullYear(); year < from.getFullYear() + 12; year += 1) {
    if (!isLeap(year)) continue;
    const candidate = new Date(year, 1, 29);
    if (candidate.getTime() > from.getTime()) {
      return `29/02/${year}`;
    }
  }
  // Unreachable for any real calendar - a leap year occurs at least every 8.
  throw new Error('[expiryDateRules] No future leap day found within twelve years.');
}

/**
 * The three rows of the decision-table case, walked in one pass.
 *
 * Each names which messages must appear, so the case asserts one row per step
 * rather than folding all three into a single expectation.
 */
export interface ExpiryDecisionRow {
  label: string;
  /** Omit the payer name to exercise the missing-mandatory-field row. */
  omitPayerName: boolean;
  expiryInDays: number;
  expectsRequiredMessage: boolean;
  expectsExpiryMessage: boolean;
  expectsSave: boolean;
}

export const EXPIRY_DECISION_ROWS: readonly ExpiryDecisionRow[] = [
  {
    label: 'Case A - a mandatory field is empty AND the expiry is in the past',
    omitPayerName: true,
    expiryInDays: -1,
    expectsRequiredMessage: true,
    expectsExpiryMessage: true,
    expectsSave: false,
  },
  {
    label: 'Case B - every mandatory field is filled and the expiry is valid',
    omitPayerName: false,
    expiryInDays: 128,
    expectsRequiredMessage: false,
    expectsExpiryMessage: false,
    expectsSave: true,
  },
  {
    label: 'Case C - every mandatory field is filled but the expiry is in the past',
    omitPayerName: false,
    expiryInDays: -1,
    expectsRequiredMessage: false,
    expectsExpiryMessage: true,
    expectsSave: false,
  },
];

/** Resolves an offset in days to the DD/MM/YYYY the wizard expects. */
export function expiryDate(days: number): string {
  return days >= 0 ? DateUtils.futureDate(days) : DateUtils.pastDate(Math.abs(days));
}

/**
 * The account the restricted-role case needs.
 *
 * Named so the BLOCKED annotation says what to provision rather than a vague
 * "insufficient permissions".
 */
export const RESTRICTED_ROLE_REQUIREMENT = {
  role: 'Read-only payer viewer',
  reason:
    'Needs an account that can open the payer list but holds neither create nor edit rights, '
    + 'so the Expiry Date field can be shown to be unreachable for that role.',
} as const;
