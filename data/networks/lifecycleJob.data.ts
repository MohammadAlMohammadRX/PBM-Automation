/**
 * Shared data for the cases that wait on the lifecycle job - 08 manual
 * activation, 31 expired reactivation, 39 status prerequisites.
 *
 * Stories 09, 13, 30, 32 and 44 (the automatic transitions, the job schedule
 * and the Expired/Inactive notifications) were moved to MANUAL on 2026-10-24
 * and removed from the code; their Azure test cases carry the "Manual" tag.
 *
 * HOW "RUN THE DAILY JOB" IS EXERCISED HERE. The job cannot be triggered from
 * the interface. In this environment its CRON (System Settings > Settings,
 * "Network lifecycle job schedule (CRON, UTC)") fires EVERY MINUTE, so a
 * date-driven transition is reached by giving the case's own network an
 * effective or expiry date-time a few minutes out and waiting for the next run
 * after it. The sheets' calendar dates (2026-10-03, "today + 2 days") are kept
 * as the INTENT; the minutes are the same boundary on the date-time the
 * application actually compares (verified 2026-10-21: the pickers carry a time,
 * and a same-day expiry two hours after the effective time is accepted).
 *
 * "The job ran and changed nothing" is observed by re-reading the record across
 * JOB_HOLD_MS - at least two runs.
 */

/** Long enough for the every-minute job to run at least twice. */
export const JOB_HOLD_MS = 150_000;

/** How long a due transition may take to show (job interval + list/detail lag). */
export const JOB_TRANSITION_MS = 4 * 60_000;

/** What an automatic status change looks like in the network's Audit History. */
export const AUTO_STATUS_AUDIT = {
  action: 'Status Change',
  actor: 'System',
  field: 'StatusId',
} as const;

/** Minutes from now until 23:59 today - "an expiry date equal to today". At least 20. */
export function minutesUntilEndOfToday(): number {
  const end = new Date();
  end.setHours(23, 59, 0, 0);
  return Math.max(20, Math.floor((end.getTime() - Date.now()) / 60_000));
}
