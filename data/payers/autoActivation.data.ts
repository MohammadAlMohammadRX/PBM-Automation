import type { BlockedCase } from './payerTypes';

/**
 * Test data for "Automatically Transition Payer Status to Active".
 *
 * The transition is performed by the payer lifecycle job, which runs on its
 * CRON (verified: `15 0 * * *`, UTC) and cannot be triggered or fast-forwarded
 * from this suite - the status-seed fixture's approach (seed rows, wait real
 * days) is why folder 14 sits 13/13 BLOCKED. Every case that needs the job to
 * RUN is BLOCKED on a job trigger, naming it.
 *
 * What is reachable is the job's precondition and its negative space: a payer
 * approved with a future EffectiveDate is Pending and STAYS Pending before the
 * job (no transition, no status-change audit entry), and a payer cannot exist
 * with no EffectiveDate at all because the form refuses to save without one.
 */

/** Days ahead for a future EffectiveDate. */
export const FUTURE_EFFECTIVE_DAYS = 1;

/** A safely distant expiry so the effective date is the only variable. */
export const SAFE_EXPIRY_DAYS = 400;

/** The audit action a transition would have written. */
export const TRANSITION_ENTRY = /status change/i;

const NEEDS_JOB_RUN =
  'This case needs the payer lifecycle job to RUN against a prepared payer. The job runs on its '
  + 'CRON (15 0 * * * UTC) and this suite has no trigger and cannot move the clock; the status-seed '
  + 'fixture waits real calendar days. Provide a job trigger (or run it on demand) and re-run.';

/** The sheet's cases this environment cannot exercise, in renumbered order. */
export const BLOCKED_CASES: readonly BlockedCase[] = [
  { id: '001', title: 'should activate a Pending payer when EffectiveDate equals the current date', reason: NEEDS_JOB_RUN },
  { id: '002', title: 'should activate a Pending payer whose EffectiveDate is in the past', reason: NEEDS_JOB_RUN },
  { id: '004', title: 'should activate a Pending payer with no networks when its EffectiveDate has arrived', reason: NEEDS_JOB_RUN },
  { id: '005', title: 'should transition only Pending payers whose EffectiveDate has arrived across the decision table', reason: `${NEEDS_JOB_RUN} The table also needs Active, Inactive and Expired payers.` },
  { id: '006', title: 'should perform only the Pending-to-Active transition and leave other statuses untouched', reason: NEEDS_JOB_RUN },
  { id: '007', title: 'should activate a newly created payer automatically on the next business day', reason: NEEDS_JOB_RUN },
  { id: '008', title: 'should record the system user on the automated Pending-to-Active audit entry', reason: NEEDS_JOB_RUN },
  { id: '009', title: 'should notify every System Administrator when a payer is activated automatically', reason: `${NEEDS_JOB_RUN} It also needs two administrator accounts and the notification panel.` },
  { id: '010', title: 'should not duplicate transitions or notifications when the job re-runs the same day', reason: NEEDS_JOB_RUN },
  { id: '012', title: 'should process a large batch of payers with mixed statuses and dates correctly', reason: `${NEEDS_JOB_RUN} Plus 100+ seeded payers.` },
  { id: '014', title: 'should run the activation job independently of any logged-in user session', reason: NEEDS_JOB_RUN },
];
