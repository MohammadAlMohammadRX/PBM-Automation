/**
 * US 12939 "Send notifications whenever a payer's status changes"
 * (notification folder 01, Writer E) - 1 case: 21343 (21337-21342,
 * 21344-21347 wait for the BA).
 *
 * How (assessment): an already Active payer the suite uses; an ACTIVE suite
 * "Active - Payer" definition (audience careconnect) exists while the admin
 * moves the PAYER job (jobClock - restored after the firing and at teardown);
 * the payer must stay Active, gain no new status entry in its Audit History,
 * and no "Active - Payer" notification about it may arrive.
 *
 * Literal readings / TC-vs-AC decisions (the test case wins):
 * - "Steady Payer" is the TC's example: STEADY_PAYER ("Al sharq", the payer
 *   the policy / formulary suites own records under) is READ only - its
 *   status and audit trail are read, nothing about it is changed. When it is
 *   not Active at the start, the case is BLOCKED (NOT_ACTIVE).
 * - "two consecutive daily runs": the payer has been Active across earlier
 *   runs; ONE more firing is the "run again without any status change".
 * - "a user assigned to the payer": careconnect (System Administrator - the AC
 *   says administrators get every payer's notifications) is the audience; no
 *   "assigned users" audience exists in the app (assessment risk).
 * - "no new status transition is recorded" = GetPayerAuditTrail holds no
 *   status entry written since the firing was scheduled, and the status still
 *   reads ACTIVE_LABEL.
 */
export const CASES = {
  noRedundantNotification: { azureId: '21343' },
} as const;

export const STORY = "US 12939 - Send notifications whenever a payer's status changes";

/** The Active payer the case watches (read only). */
export const STEADY_PAYER = 'Al sharq';
export const ACTIVE_LABEL = 'Active';

/** How long the case keeps watching for a notification after the payer job ran. */
export const WATCH_MS = 90_000;

export const NOT_ACTIVE = (status: string): string =>
  `the steady payer "${STEADY_PAYER}" reads "${status}", not Active, so "a payer that stays Active across daily runs" cannot be observed`;

/** How long after the payer job's minute the status / audit are read (the run processes every payer). */
export const JOB_SETTLE_MS = 45_000;
