import type { PlanBlockedCase } from './activationEligibility.data';
import { PLAN_LIFECYCLE } from './plan.data';
import { PLAN_SUITE } from './planSuite.data';

/**
 * Test data for US 14330 "Automatically expire an inactive plan once its expiry
 * date passes" (plan folder 32), written 2026-11-08 - Manual until the user
 * asked for the job stories to be automated.
 *
 * SEED-THEN-CHECK (see data/plans/expirePlanVersionsByDate.data.ts and
 * reports/manual-automation/Foundation-Notes.md): the cases claim plans built by
 * `npm run seed:plan-jobs` the same Riyadh day and assert what the plan job did.
 * InactivePlanExpire = Active at F1, inactivated (approved) by the
 * administrator, its expiry passing before F2; InactivePlanFutureExpiry = the
 * same with a year-long expiry; PlanVersionExpire = an Active plan whose expiry
 * passed before F2.
 *
 * THE SHEET'S DATES are kept as positions against the job run: the expiry is a
 * date AND time here, so "expiry = today - 1 day" = an expiry instant that had
 * passed when the job ran, and "expiry = today (day 1)" = an expiry instant
 * still ahead when the job ran.
 *
 * NOTES FOR THE LEAD:
 *  - 19256 (stays Inactive on the day, Expired on the next run) is read across
 *    two seeds of one recipe: day 1 = an Inactive plan whose expiry has not
 *    passed at the run (InactivePlanFutureExpiry - stays Inactive); day 2 = the
 *    same recipe once its expiry has passed (InactivePlanExpire - Expired).
 *  - 19258's "previous / new statuses Inactive / Expired" are read from the
 *    expiry entry's change table (Audit Entry drawer).
 *  - 19262's "Active -> Inactive (by the administrator)" is asserted on the
 *    inactivation's audit entries; on 2026-10-27 an approved status change was
 *    logged "By: System" (plans smoke run) - if that is still so, the case fails.
 *  - 19261 needs a SECOND plan-job run after the one that expired the seed
 *    (another seed run the same day, or the daily run) - BLOCKED until one has run.
 */

export const CASES = {
  inactiveExpires: { azureId: '19255' },
  notOnExpiryDay: { azureId: '19256' },
  sameRuleAsActive: { azureId: '19257' },
  systemActor: { azureId: '19258' },
  noExpiryDate: { azureId: '19259' },
  noSameDayRescue: { azureId: '19260' },
  idempotentRerun: { azureId: '19261' },
  fullLifecycle: { azureId: '19262' },
} as const;

/** The payer every seed belongs to. */
export const SEED_PAYER = PLAN_SUITE.payerName;

export const STATUS = PLAN_LIFECYCLE;

/** The lifecycle snapshot labels (GetPlan effectiveStatusId -> lookup englishName). */
export const SNAPSHOT = { active: 'Active', future: 'Future', inactive: 'Inactive', expired: 'Expired' } as const;

export const SYSTEM_ACTOR = 'System';

/** The status field of the Audit Entry drawer's change table. */
export const STATUS_FIELD = /status/i;

/** An expiry recorded by an audit entry - its action, or the status it set. */
export const EXPIRED_ENTRY = /Expir/i;

export const BLOCKED_CASES: PlanBlockedCase[] = [
  {
    azureId: CASES.noExpiryDate.azureId,
    title: 'should never expire an Inactive plan when it has no expiry date set',
    reason:
      'Needs an Inactive plan with NO expiry date. The expiry date is mandatory: CreatePlan with `expiryDate: null` answers '
      + '422 (ValidationErrors ExpiryDate, verified 2026-11-08) and the Add Plan form refuses a blank Expiry Date (18983), '
      + 'so an open-ended plan cannot exist. Runnable only if open-ended plans are allowed.',
  },
  {
    azureId: CASES.noSameDayRescue.azureId,
    title: 'should block manual activation before and after the job runs when an Inactive plan\'s expiry date has just passed',
    reason:
      'Step 2 needs an Inactive plan whose expiry has passed while the plan job has NOT yet processed it, so the manual '
      + 'activation is attempted before the run. That state exists only inside `npm run seed:plan-jobs` between the '
      + 'seeds\' expiry and the F2 firing, and the seeder does not attempt an activation there; a case may not move the job '
      + 'itself. Unblocked by a seed purpose that records an activation attempt between expiry and F2. Activating an '
      + 'already Expired plan (step 5) is covered by 19245 (plan folder 22).',
  },
];
