import type { PlanBlockedCase } from './activationEligibility.data';
import { PLAN_APPROVAL_CELL, PLAN_LIFECYCLE } from './plan.data';
import { PLAN_SUITE } from './planSuite.data';
import type { PlanSpec } from '../../utils/PlanProvisioning';

/**
 * Test data for US 14338 "Determine plan status automatically from approval,
 * effective date, and payer status" (plan folder 33), written 2026-11-08 -
 * Manual until the user asked for the job stories to be automated.
 *
 * THE RULE THE CASES MEET (verified 2026-11-08, Foundation-Notes.md): approval
 * NEVER makes a plan Active, even once its effective time has passed - it reads
 * Future ("Pending" on the list badge) until the daily plan job runs. So every
 * "becomes / is Active" case CLAIMS a plan built and processed by
 * `npm run seed:plan-jobs` the same Riyadh day (PlanActivateOnEffective:
 * approved, effective before the F1 run, Active after it) and asserts what the
 * job left; no seed today -> BLOCKED naming the seed command. 19299 (approved,
 * effective in 10 days -> Pending) needs no job and builds its own plan.
 *
 * THE SHEET'S DATES are kept as positions against the job run: the create
 * refuses a past effective time, so "effective = today / yesterday / 30 days
 * ago" are all an effective instant that had passed when the job ran (the
 * equivalence class "arrived"); "tomorrow" / "+5 days" = PlanFutureEffective
 * (effective ~26 h after the seed run, still ahead when the job ran).
 *
 * LABELS. The list badge shows "Pending" for an approved plan that has not
 * started (PLAN_LIFECYCLE, verified 2026-10-27; the status lookup itself names it
 * "Future"). The sheet's "Draft" status is the badge "Not Live" - the label the
 * application gives a never-approved plan (precedent: plan folder 02, 18960).
 *
 * PAYER STATUS. Every plan the suite can approve belongs to "Al sharq" (the
 * only payer with an Active formulary, FORM-0023, used read-only), which must
 * stay Active for every other plan case - so the inactive-payer cases (19304,
 * 19309) are BLOCKED, as 19247 / 19251 are in plan folder 22.
 *
 * NOTE FOR THE LEAD: 19308 asks the detail view to show "the approval date,
 * effective date and payer status"; the Overview carries the effective date and
 * the payer, the header's version badge carries the approval - there is no
 * approval-date or payer-status field, so those two are read off the badge and
 * the payer name.
 */

export const CASES = {
  futurePending: { azureId: '19299' },
  todayActive: { azureId: '19300' },
  pastActive: { azureId: '19301' },
  tomorrowPending: { azureId: '19302' },
  yesterdayActive: { azureId: '19303' },
  inactivePayer: { azureId: '19304' },
  unapprovedNeverLive: { azureId: '19305' },
  jobActivates: { azureId: '19306' },
  jobLeavesPending: { azureId: '19307' },
  listAccurate: { azureId: '19308' },
  payerDeactivated: { azureId: '19309' },
  everyStatus: { azureId: '19310' },
} as const;

/** The payer every seed belongs to (Active). */
export const SEED_PAYER = PLAN_SUITE.payerName;

export const STATUS = PLAN_LIFECYCLE;
export const APPROVAL = PLAN_APPROVAL_CELL;

/** The sheet's "Draft" status as the badge shows it. */
export const DRAFT_LABEL = PLAN_LIFECYCLE.notLive;

/** The lifecycle snapshot labels (GetPlan effectiveStatusId -> lookup englishName). */
export const SNAPSHOT = { active: 'Active', future: 'Future', inactive: 'Inactive', expired: 'Expired' } as const;

/** 19299 - approved, effective 10 days ahead (the sheet's "Today + 10 days"). */
export const TEN_DAYS_AHEAD: PlanSpec = { effectiveInMinutes: 10 * 24 * 60, expiryInMinutes: 400 * 24 * 60 };
export const TEN_DAYS_MS = 10 * 24 * 60 * 60_000;
/** How far "10 days" may drift (the plan is created a few minutes after the clock is read). */
export const DAY_TOLERANCE_MS = 60 * 60_000;

/** 19310 - one seed per status the list must label (purpose -> badge). */
export const STATUS_CHECKLIST = [
  { status: 'Draft', purpose: 'PlanDraft', label: PLAN_LIFECYCLE.notLive },
  { status: 'Pending', purpose: 'PlanFutureEffective', label: PLAN_LIFECYCLE.pending },
  { status: 'Active', purpose: 'PlanActivateOnEffective', label: PLAN_LIFECYCLE.active },
  { status: 'Inactive', purpose: 'InactivePlanFutureExpiry', label: PLAN_LIFECYCLE.inactive },
  { status: 'Expired', purpose: 'PlanVersionExpire', label: PLAN_LIFECYCLE.expired },
] as const;

/** 19308 - the seeds that make "a mix of Draft, Pending, Active, Inactive and Expired plans". */
export const MIXED_PURPOSES = [
  'PlanDraft',
  'PlanUnapproved',
  'PlanFutureEffective',
  'PlanActivateOnEffective',
  'PlanActiveExpiryTomorrow',
  'InactivePlanFutureExpiry',
  'PlanVersionExpire',
  'InactivePlanExpire',
] as const;

export const BLOCKED_CASES: PlanBlockedCase[] = [
  {
    azureId: CASES.inactivePayer.azureId,
    title: 'should withhold Active status when an approved plan\'s effective date has arrived but its payer is Inactive',
    reason:
      'Needs an APPROVED plan whose owning payer is Inactive. Approval needs an Active formulary of the plan\'s own payer '
      + '(409 otherwise); the only payer with one is the suite payer "Al sharq" (FORM-0023, used read-only), which must '
      + 'stay Active for every other plan case, and formularies made for another payer stay Pending until the daily '
      + 'formulary job. Unblocked by a disposable payer that owns an Active formulary and may be inactivated (same gap as '
      + '19247 in plan folder 22).',
  },
  {
    azureId: CASES.payerDeactivated.azureId,
    title: 'should reconsider an Active plan\'s status when its payer is deactivated',
    reason:
      'Needs an Active plan whose payer the case may deactivate. Every Active plan the suite can build belongs to "Al '
      + 'sharq" (the only payer with an Active formulary, FORM-0023), which must stay Active for every other plan case; '
      + 'the suite never deactivates a payer it did not create. Unblocked by a disposable payer that owns an Active '
      + 'formulary (see 19304).',
  },
];
