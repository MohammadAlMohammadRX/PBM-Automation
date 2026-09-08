import { DateUtils } from '../../utils/DateUtils';

/**
 * Test data for "Refine Automatic Status Transitions for Expiry Precedence and
 * Recalculation on Edit".
 *
 * The story has two halves that behave completely differently, and separating
 * them is what makes it testable at all:
 *
 *   RECALCULATION ON EDIT is synchronous. Extend an Expired payer's expiry into
 *   the future, get the edit approved, and the status is recomputed there and
 *   then. These cases need no job and no waiting - they run today.
 *
 *   EXPIRY PRECEDENCE is a batch. Whether an Inactive payer whose expiry has
 *   passed becomes Expired is decided by a daily process with no UI trigger, so
 *   those cases need seeded records (statusSeed.data.ts) and a day of real time.
 *
 * The lifecycle status labels below are the ones the payer list renders, read
 * off the live application in both languages. "Not Live" is included because
 * the list uses it for a payer that has never been approved - it is not one of
 * the four statuses this story is about, and a test that mistook it for
 * Inactive would report a transition that never happened.
 */

/** The lifecycle statuses the payer list renders, English and Arabic. */
export const LIFECYCLE_STATUS = {
  active: { en: 'Active', ar: 'نشطة' },
  inactive: { en: 'Inactive', ar: 'غير نشط' },
  expired: { en: 'Expired', ar: 'منتهية' },
  pending: { en: 'Pending', ar: 'قيد الانتظار' },
  /** A payer with no approved version yet - not part of this story's rules. */
  notLive: { en: 'Not Live', ar: 'غير مُفعّل' },
} as const;

export type LifecycleStatusKey = keyof typeof LIFECYCLE_STATUS;

/**
 * The status an edit should recalculate to, by where the new dates fall.
 *
 * This is the story's rule stated as a table rather than prose, so each case
 * asserts one row of it and the whole rule is visible in one place. `Active`
 * when the window is open, `Pending` when it has not started, `Expired` when it
 * has already closed - and crucially the third row proves that an edit does not
 * simply clear an Expired status, it recomputes it.
 */
export interface RecalculationCase {
  key: string;
  caseId: string;
  label: string;
  /** New effective date, as days from today. */
  effectiveInDays: number;
  /** New expiry date, as days from today. */
  expiryInDays: number;
  /** The status the payer must show once the edit is applied. */
  expected: LifecycleStatusKey;
  /**
   * Set when the FORM refuses the new dates outright, with this message.
   *
   * The "change the expiry to another date that has also passed" case turns out
   * to be unperformable: the wizard rejects any expiry before today with
   * "Expiry date cannot be earlier than today." (verified live). So the payer
   * cannot leave Expired by that route at all, which satisfies the criterion by
   * prevention rather than by recalculation - and the assertion has to be the
   * refusal, because there is no edit to recalculate from.
   */
  refusedWithMessage?: string;
  why: string;
}

export const RECALCULATION_CASES: readonly RecalculationCase[] = [
  {
    key: 'extend-into-future',
    caseId: 'TC-005',
    label: 'the expiry is extended into the future',
    effectiveInDays: 0,
    expiryInDays: 115,
    expected: 'active',
    why:
      'Start date is on or before today and today is on or before the new expiry, so the '
      + 'payer is inside its window again and must read Active.',
  },
  {
    key: 'future-start',
    caseId: 'TC-006',
    label: 'both dates are moved into the future',
    effectiveInDays: 24,
    expiryInDays: 389,
    expected: 'pending',
    why:
      'The window is valid but has not opened yet. Proves the recalculation reads the START '
      + 'date too - a rule that only looked at expiry would wrongly report Active.',
  },
  {
    key: 'still-past',
    caseId: 'TC-009',
    label: 'the expiry is changed to another date that has also passed',
    effectiveInDays: 0,
    expiryInDays: -18,
    expected: 'expired',
    refusedWithMessage: 'Expiry date cannot be earlier than today.',
    why:
      'The form refuses an expiry before today, so this edit can never be applied and the '
      + 'payer necessarily stays Expired. The criterion holds, but by prevention rather than '
      + 'by recalculation - so the assertion is the refusal plus the unchanged status.',
  },
];

/** Resolves a case to concrete DD/MM/YYYY dates for the wizard. */
export function datesFor(recalculation: RecalculationCase): {
  effectiveDate: string;
  expiryDate: string;
} {
  return {
    effectiveDate:
      recalculation.effectiveInDays >= 0
        ? DateUtils.futureDate(recalculation.effectiveInDays)
        : DateUtils.pastDate(Math.abs(recalculation.effectiveInDays)),
    expiryDate:
      recalculation.expiryInDays >= 0
        ? DateUtils.futureDate(recalculation.expiryInDays)
        : DateUtils.pastDate(Math.abs(recalculation.expiryInDays)),
  };
}

/**
 * The batch decision table - one row per starting status.
 *
 * The point of the story is that the first three rows all land on Expired
 * regardless of where they started, and the fourth does not move. A test that
 * only checked the Inactive row would pass against an implementation that
 * expired everything.
 */
export interface BatchExpectation {
  key: string;
  startingStatus: LifecycleStatusKey;
  expiryPassed: boolean;
  expected: LifecycleStatusKey;
  why: string;
}

export const BATCH_EXPECTATIONS: readonly BatchExpectation[] = [
  {
    key: 'active-passed',
    startingStatus: 'active',
    expiryPassed: true,
    expected: 'expired',
    why: 'An active payer past its expiry must expire.',
  },
  {
    key: 'inactive-passed',
    startingStatus: 'inactive',
    expiryPassed: true,
    expected: 'expired',
    why: 'Expiry takes precedence over a manual inactivation - the story\'s core rule.',
  },
  {
    key: 'pending-passed',
    startingStatus: 'pending',
    expiryPassed: true,
    expected: 'expired',
    why: 'A payer whose whole window elapsed before it went live must expire, not activate.',
  },
  {
    key: 'inactive-not-passed',
    startingStatus: 'inactive',
    expiryPassed: false,
    expected: 'inactive',
    why: 'The control: an inactive payer inside its window must be left alone.',
  },
];

/**
 * What the batch cases need before they can report anything.
 *
 * Held here so every BLOCKED annotation in the story gives the same, precise
 * reason instead of each spec wording it differently.
 */
export const BATCH_BLOCKER = {
  reason:
    'The daily status recalculation has no UI or API trigger available to this suite, so the '
    + 'transition can only be observed after the job has run of its own accord. Seeded rows '
    + '(npm run seed:status) become checkable the day after seeding; npm run check:status '
    + 'reports whether the job has since moved them.',
} as const;

/**
 * The account the RBAC case needs.
 *
 * The environment exposes one set of credentials, belonging to a full
 * administrator, so "a read-only user cannot extend an expiry" cannot be
 * observed here.
 */
export const READ_ONLY_REQUIREMENT = {
  role: 'Read-only payer viewer',
  reason:
    'Needs an account that can open a payer but holds neither edit nor approve rights, to show '
    + 'the expiry field is not editable and the approval action is unavailable.',
} as const;
