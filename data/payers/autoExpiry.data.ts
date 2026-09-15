import type { BlockedCase } from './payerTypes';

/**
 * Test data for "Automatically Transition Payer Status to Expired".
 *
 * As with automatic activation, the expiry is the lifecycle job's, on its CRON
 * (`15 0 * * *` UTC), with no trigger here. Every case that needs the job to
 * run - the day-after boundary, the cascade, the notification, the BRE - is
 * BLOCKED on a job trigger (and, for the BRE cases, on a BRE interface).
 *
 * Reachable is the job's negative space on the day: a payer whose ExpiryDate
 * is tomorrow is Active and stays Active today, and a payer cannot exist with
 * no ExpiryDate if the form requires one (asserted either way).
 *
 * VERIFIED: the form REFUSES an ExpiryDate of today (the earliest it accepts
 * is tomorrow - see EARLIEST_VALID_EXPIRY_IN_DAYS in expiryDateRules.data.ts),
 * so the "expires today, still Active" boundary cannot be built through the
 * interface and is BLOCKED on seeded data.
 */

/** Days ahead for the boundary that must NOT expire today. */
export const EXPIRY_TOMORROW_DAYS = 1;

const NEEDS_SEEDED_EXPIRY_TODAY =
  'This case needs a live payer whose ExpiryDate is TODAY. The form refuses that date (the '
  + 'earliest expiry it accepts is tomorrow), so the payer cannot be created through the '
  + 'interface on the day. Seed one directly, or create it with ExpiryDate = tomorrow and run '
  + 'this case the next day before the lifecycle job fires (15 0 * * * UTC).';

const NEEDS_JOB_RUN =
  'This case needs the payer lifecycle job to RUN against a prepared payer. The job runs on its '
  + 'CRON (15 0 * * * UTC) and this suite has no trigger and cannot move the clock. Provide a job '
  + 'trigger (or run it on demand) and re-run.';

const NEEDS_BRE = 'It also observes the Business Rule Engine, which has no interface this framework can reach.';

/** The sheet's cases this environment cannot exercise, in renumbered order. */
export const BLOCKED_CASES: readonly BlockedCase[] = [
  { id: '001', title: 'should expire an Active payer the day after its ExpiryDate', reason: NEEDS_JOB_RUN },
  { id: '002', title: 'should keep an Active payer Active on the day its ExpiryDate falls', reason: NEEDS_SEEDED_EXPIRY_TODAY },
  { id: '004', title: 'should cascade an automatic expiry to the payer\'s active plans and policies', reason: `${NEEDS_JOB_RUN} Plus a payer with active plans and policies.` },
  { id: '005', title: 'should expire only Active payers past their ExpiryDate across the decision table', reason: `${NEEDS_JOB_RUN} The table also needs Pending, Inactive and Expired payers.` },
  { id: '006', title: 'should perform only the Active-to-Expired transition and leave other statuses untouched', reason: NEEDS_JOB_RUN },
  { id: '007', title: 'should send a High-priority notification to System Administrators when a payer expires', reason: `${NEEDS_JOB_RUN} Plus the notification panel.` },
  { id: '008', title: 'should stop the Business Rule Engine using a payer immediately after it expires', reason: `${NEEDS_JOB_RUN} ${NEEDS_BRE}` },
  { id: '009', title: 'should expire a payer with plans and policies end to end, cascading and notifying', reason: `${NEEDS_JOB_RUN} ${NEEDS_BRE}` },
  { id: '010', title: 'should expire a payer with no plans or policies without error', reason: NEEDS_JOB_RUN },
  { id: '011', title: 'should not duplicate cascades or notifications when the expiry job re-runs the same day', reason: NEEDS_JOB_RUN },
  { id: '012', title: 'should cascade only active plans and leave already-inactive ones unchanged on expiry', reason: `${NEEDS_JOB_RUN} Plus a plan already Inactive under the payer.` },
  { id: '014', title: 'should keep an expired payer out of the Business Rule Engine even through a stale reference', reason: `${NEEDS_JOB_RUN} ${NEEDS_BRE}` },
];
