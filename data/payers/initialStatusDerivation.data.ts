import { LIFECYCLE_STATUS, type LifecycleStatusKey } from './statusTransition.data';

/**
 * Test data for "Derive Initial Payer Status from Effective Date on Approval".
 *
 * A DIFFERENT TRIGGER FROM THE EXPIRY-PRECEDENCE STORY, which is why this is
 * its own suite rather than more rows in that one. That story recalculates a
 * status when a payer is EDITED; this one derives a status the first time a
 * payer is APPROVED. The rule they apply is the same shape - where the dates
 * fall decides the status - so the vocabulary is imported rather than restated,
 * but the moment being tested is not shared and neither are the preconditions.
 *
 * WHETHER "PENDING" IS EVEN A STATUS THE LIST SHOWS IS AN OPEN QUESTION, and
 * TC-002/TC-005/TC-006 turn on it. The two sources in this framework disagree:
 *
 *   constants/ElementIds.ts states, as verified: the lifecycle badge shows
 *   Active, Inactive, Expired and "Not Live", and NEVER shows Pending -
 *   "Pending Approval" being an approval status in a different column.
 *
 *   statusTransition.data.ts expects `pending` from the recalculation rule for
 *   a payer whose window has not opened - but that story is 13/13 BLOCKED for
 *   want of seeded data, so the expectation was never observed live.
 *
 * The cases assert the sheet's requirement, and their failure messages name
 * both the status found and this contradiction. Whichever way it resolves, the
 * answer belongs in one place afterwards.
 *
 * A PAST EFFECTIVE DATE IS ALLOWED; A PAST EXPIRY IS NOT. The expiry-date story
 * pins the second half - expiry must be today or later - so every row below
 * keeps its expiry in the future and moves only the effective date, which is
 * the variable this story is about.
 */

/** One row of the derivation table. */
export interface DerivationCase {
  key: string;
  /** The sheet case this row implements. */
  sheetCase: string;
  label: string;
  /** Effective date as days from today: negative is past, 0 is today. */
  effectiveInDays: number;
  /** The status the payer must show once the approval is applied. */
  expected: LifecycleStatusKey;
  why: string;
}

/**
 * Every combination the story names, as one table.
 *
 * Stated as data so each case asserts one row and the whole rule is legible in
 * a single place - the same shape the expiry-precedence story uses, and for the
 * same reason.
 */
export const DERIVATION_CASES: readonly DerivationCase[] = [
  {
    key: 'today',
    sheetCase: 'TC-643 / TC-645',
    label: 'the effective date is today',
    effectiveInDays: 0,
    expected: 'active',
    why: 'Today is the inclusive boundary: a window that opens today is open now.',
  },
  {
    key: 'yesterday',
    sheetCase: 'TC-646',
    label: 'the effective date was yesterday',
    effectiveInDays: -1,
    expected: 'active',
    why: 'The window opened before today, so the payer is live the moment it is approved.',
  },
  {
    key: 'tomorrow',
    sheetCase: 'TC-647',
    label: 'the effective date is tomorrow',
    effectiveInDays: 1,
    expected: 'pending',
    why:
      'The window has not opened, so the payer is approved but not yet live. Whether the list '
      + 'words this "Pending" is the open question - see the file comment.',
  },
  {
    key: 'far-future',
    sheetCase: 'TC-644',
    label: 'the effective date is well in the future',
    effectiveInDays: 44,
    expected: 'pending',
    why: 'Same rule as tomorrow, at a distance that cannot be a rounding or timezone artefact.',
  },
] as const;

/** How far ahead every row puts its expiry, so only the effective date varies. */
export const EXPIRY_DAYS_AHEAD = 365;

/** The status a payer must NOT hold before its approval. */
export const PRE_APPROVAL_STATUS = LIFECYCLE_STATUS.notLive.en;

/** What the audit trail should record about the status it assigned. */
export const AUDIT_STATUS_EXPECTATION = /active|pending|status/i;
