import type { NetworkBlockedCase } from '../networks/network.data';
import { toDisplayDate } from '../networks/network.data';
import { PLAN_APPROVAL_CELL, PLAN_LIFECYCLE, planNamed } from './plan.data';

/**
 * Test data for US 14329 "Block activation when the plan's timing, payer
 * status, or name is not eligible"
 * (folder 22-block-activation-when-the-plans-timing-payer-status-or).
 *
 * Activation ("تفعيل خطة") raises the shared confirmation prompt and calls
 * POST /api/Plans/SetPlanActive; a refusal is read from that answer, the toast
 * and the action's own tooltip. The plans are the case's own (fixture `planIn`):
 * 'InactiveFuture' is an Inactive plan whose effective date has not arrived,
 * 'Expired' a short-lived plan the lifecycle job expired.
 * Twins: tests/network/39 (status prerequisites) and 24 (go-live prerequisites).
 */

export type PlanBlockedCase = NetworkBlockedCase;

export const CASE = {
  futureEffective: '19243',
  effectiveToday: '19244',
  expiredActivate: '19245',
  expiredDeactivate: '19246',
  inactivePayer: '19247',
  duplicateName: '19248',
  eligible: '19249',
  datePartitions: '19250',
  payerSuspendedMidFlow: '19251',
  conflictResolved: '19252',
  alternateEntryPoints: '19253',
  messageCatalogue: '19254',
} as const;

export const STATUS = PLAN_LIFECYCLE;
export const APPROVAL = PLAN_APPROVAL_CELL;

/** "The effective date has not arrived yet" - the timing refusal. */
export const FUTURE_DATE_MESSAGE = /effective date.*(not|yet)|not yet (arrived|effective|reached|started)|before (its|the) effective|future/i;

/** MSG-PLN-025: an expired record cannot change status until its expiry date is extended. */
export const EXPIRY_GUIDANCE = /expir.*(extend|update|change)|(extend|update).*expir/i;

/** The duplicate Active name refusal. */
export const DUPLICATE_NAME_MESSAGE = /already.*active.*name|name.*already|same name|duplicate|unique/i;

/** The sheet's plan names (19248, 19252), made unique per run. */
export const sharedName = (prefix: 'Gold Health Plan' | 'Silver Health Plan'): string => planNamed(prefix);
export const GOLD = 'Gold Health Plan';
export const SILVER = 'Silver Health Plan';

/** 19252 - the reason Plan A is deactivated with, and its details. */
export const RESOLVE_CONFLICT = {
  reason: 'Replaced by New Plan',
  details: 'Deactivated to free the shared name (US 14329).',
} as const;

/** 19253 - details for the forced (API) attempts. */
export const FORCED_DETAILS = 'Forced by an automated eligibility case (US 14329).';

/** Today as DD/MM/YYYY - the effective date of a plan created minutes ago (19244). */
export const today = (): string => toDisplayDate(new Date());

/** A DD/MM/YYYY (optionally with a time) date as a day count, for "in the past / future" checks. */
export const dayNumber = (value: string): number => {
  const m = value.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? Math.floor(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])) / 86_400_000) : Number.NaN;
};

export const todayNumber = (): number => dayNumber(today());

export const BLOCKED_CASES: PlanBlockedCase[] = [
  {
    azureId: CASE.inactivePayer,
    title: 'should block activation with MSG-PLN-024 when the plan\'s owning payer is not Active',
    reason:
      'Needs an Inactive plan whose OWNING PAYER is Inactive or Suspended. A plan can only reach Inactive after being '
      + 'approved, and approval needs an Active formulary of the plan\'s own payer (409 otherwise). The only payer with one '
      + 'is the suite payer "Al sharq" (FORM-0023), which must stay Active for every other plan case; formularies created '
      + 'for another payer stay Pending until the daily lifecycle job. Unblocked by a disposable payer that owns an Active '
      + 'formulary and may be inactivated.',
  },
  {
    azureId: CASE.datePartitions,
    title: 'should allow only the plan with fully valid dates to proceed when each date partition is activated',
    reason:
      'Partition 4 (a future effective date AND a past expiry date) cannot exist: the plan form and CreatePlan refuse an '
      + 'expiry date before the effective date, so no such record can be built. Partitions 1-3 are covered one by one by '
      + '19243 (future effective date), 19245 (expired) and 19249 (valid dates). Runnable only against seeded inconsistent data.',
  },
  {
    azureId: CASE.payerSuspendedMidFlow,
    title: 'should re-check the payer and block activation with MSG-PLN-024 when the payer is suspended before confirmation',
    reason:
      'Needs an eligible Inactive plan whose owning payer the case may inactivate mid-flow. Every approvable plan belongs to '
      + 'the suite payer "Al sharq" (the only payer with an Active formulary, FORM-0023), which must stay Active; see 19247. '
      + 'Unblocked by a disposable payer that owns an Active formulary.',
  },
  {
    azureId: CASE.messageCatalogue,
    title: 'should show the catalogue message of each ineligibility reason when four ineligible plans are activated',
    reason:
      'One of the four required plans - an Inactive plan whose payer is not Active (MSG-PLN-024) - cannot be built here '
      + '(see 19247). The other three messages are asserted by 19243 (future effective date), 19245 (MSG-PLN-025) and 19248 '
      + '(duplicate Active name). Unblocked together with 19247.',
  },
];
