import { DateUtils } from '../../utils/DateUtils';

/**
 * Test data for the user story: Automatically Discard Unapproved Registrations
 * Past Their Effective Window.
 *
 * READ THIS BEFORE EDITING THE SPEC. This story is driven by a SCHEDULED
 * BACK-END JOB, and three of its preconditions cannot be created through the
 * application at all. That is not a gap in the automation - it is a property of
 * the feature, and it is recorded here so the specs can report each case
 * BLOCKED with a precise reason instead of failing and implying a defect that
 * has not been observed.
 *
 * Verified against the live application and build:
 *
 *   1. NO JOB TRIGGER. The discard is performed by a scheduled batch job. The
 *      System Settings menu offers Notification Center, Role Administration,
 *      Lookups, Settings, Audit Logs and "Accumulator Reset Job History" - and
 *      nothing that runs or reschedules the payer lifecycle job. A UI test
 *      cannot make the job execute, so it cannot observe its outcome.
 *
 *   2. NO CLOCK CONTROL. The rule fires when an effective date LAPSES.
 *      Playwright can freeze the browser's clock; it cannot move the server's,
 *      and the job evaluates server time.
 *
 *   3. PAST EFFECTIVE DATES CANNOT BE ENTERED. The wizard restricts Effective
 *      Date to today or later (its own separate user story), so a version-zero
 *      registration whose effective date is already in the past cannot be
 *      created through the UI - which is the precondition most of these cases
 *      start from.
 *
 * What IS observable, and is therefore automated for real: that the discard
 * vocabulary exists in the application, and that a registration whose effective
 * window has NOT lapsed is left alone by whatever the job does between runs -
 * the negative half of the boundary, which needs no clock and no job trigger.
 */

/** The status a discarded registration must end in. */
export const DISCARDED_STATUS = 'Discarded';

/** Approval statuses a version-zero registration passes through. */
export const REGISTRATION_STATUS = {
  pending: 'Pending Approval',
  draft: 'Draft',
  published: 'Published',
  rejected: 'Rejected',
  discarded: 'Discarded',
} as const;

/** The version a never-approved registration carries. */
export const UNAPPROVED_VERSION = 'v0';

/** The version a registration reaches on its first approval. */
export const FIRST_PUBLISHED_VERSION = 'v1';

/**
 * The reason text the audit trail must record for an automatic discard, as the
 * criteria word it. Matched loosely (case-insensitive, on the distinctive
 * words) because the exact sentence is a translated string.
 */
export const AUTO_DISCARD_REASON_PATTERN = /auto[- ]?discard|effective date lapsed/i;

/**
 * The decision matrix the rule is specified by: only a version-zero PENDING
 * registration whose effective date has passed may be discarded.
 *
 * `runnable` says whether the row's precondition can be created through the
 * application - see the file header for why most cannot.
 */
export interface DiscardDecisionRow {
  id: string;
  version: string;
  status: string;
  /** Whether the effective date has already passed. */
  datePassed: boolean;
  /** Whether a previously approved version exists. */
  hasApprovedVersion: boolean;
  expectedOutcome: 'Discarded' | 'Unchanged';
  runnable: boolean;
  blockedBecause?: string;
}

const NO_CLOCK_CONTROL =
  'the row needs an effective date that has already lapsed, which cannot be entered '
  + '(the wizard restricts Effective Date to today or later) and cannot be reached by '
  + 'waiting, because the server clock cannot be moved from a UI test';

const NO_JOB_TRIGGER =
  'the outcome is produced by a scheduled back-end job that the application exposes no '
  + 'way to run, so it cannot be observed within a test';

export const DISCARD_DECISION_MATRIX: readonly DiscardDecisionRow[] = [
  {
    id: 'v0-pending-date-passed',
    version: 'v0',
    status: REGISTRATION_STATUS.pending,
    datePassed: true,
    hasApprovedVersion: false,
    expectedOutcome: 'Discarded',
    runnable: false,
    blockedBecause: `${NO_CLOCK_CONTROL}; additionally, ${NO_JOB_TRIGGER}`,
  },
  {
    id: 'v0-pending-date-future',
    version: 'v0',
    status: REGISTRATION_STATUS.pending,
    datePassed: false,
    hasApprovedVersion: false,
    expectedOutcome: 'Unchanged',
    // The only row whose precondition the UI can create AND whose expected
    // outcome needs no job run: nothing may happen to it, and "nothing" is
    // observable without moving any clock.
    runnable: true,
  },
  {
    id: 'v1-pending-approval-date-passed',
    version: 'v1+',
    status: REGISTRATION_STATUS.pending,
    datePassed: true,
    hasApprovedVersion: true,
    expectedOutcome: 'Unchanged',
    runnable: false,
    blockedBecause: NO_CLOCK_CONTROL,
  },
  {
    id: 'v1-pending-approval-date-future',
    version: 'v1+',
    status: REGISTRATION_STATUS.pending,
    datePassed: false,
    hasApprovedVersion: true,
    expectedOutcome: 'Unchanged',
    runnable: true,
  },
] as const;

/** The matrix rows that can actually be exercised against this build. */
export const RUNNABLE_DECISION_ROWS = DISCARD_DECISION_MATRIX.filter((row) => row.runnable);

/** The matrix rows that cannot, with the reason each is blocked. */
export const BLOCKED_DECISION_ROWS = DISCARD_DECISION_MATRIX.filter((row) => !row.runnable);

/**
 * Effective dates the boundary cases are specified against, computed relative
 * to the run date so the suite never goes stale.
 */
export const BOUNDARY_DATES = {
  /** Exactly today - the moment the window closes. */
  today: () => DateUtils.todayFormatted(),
  /** One day out - the last date that must NOT be discarded. */
  tomorrow: () => DateUtils.futureDate(1),
  /** Comfortably in the future, for the "not yet due" control case. */
  future: () => DateUtils.futureDate(30),
  /** Well past - unreachable through the wizard, kept for documentation. */
  wellPast: () => DateUtils.pastDate(11),
} as const;

/** Reasons reported when a case is blocked, so the wording stays consistent. */
export const BLOCKED_REASONS = {
  noJobTrigger: NO_JOB_TRIGGER,
  noClockControl: NO_CLOCK_CONTROL,
  noDiscardedRecord:
    'no auto-discarded registration exists in the environment, and one cannot be produced '
    + `because ${NO_JOB_TRIGGER}`,
  noNullEffectiveDate:
    'the Effective Date field is mandatory in the wizard, so a registration with a null '
    + 'effective date cannot be created through the application',
  noScheduleVisibility:
    'the application exposes no job schedule or job-run log for the payer lifecycle job, '
    + 'so a scheduled run cannot be confirmed from the UI',
} as const;
