/**
 * US 20994 "Policy Status In-App Notifications" (notification folder 11,
 * Writer E) - 6 cases: 21538, 21539, 21541, 21542, 21545, 21547 (21533-21537,
 * 21540, 21543, 21544, 21546 wait for the BA).
 *
 * How: the suite saves its OWN ACTIVE definitions for the policy actions
 * (audience careconnect; messages carry a marker and every variable as
 * "[Name={{Name}}]") and builds its OWN policies through the `policyIn`
 * fixture ("QA Automation Policy ...", payer "Al sharq", grace period 0,
 * discarded at teardown). A first approval leaves a policy Future; the POLICY
 * job (jobClock, restored after each firing) makes it Active and later Expired;
 * an approved inactivation applies at approval.
 *
 * Literal readings / TC-vs-AC decisions (the test case wins):
 * - "POL-100245", "2026-12-15", "DaysRemaining: 15", "Reminder period: 30 days"
 *   are examples (policy numbers are generated, past dates refused): the
 *   suite's own policy numbers and relative dates are used, and the reminder
 *   period is the environment's global "Reminder before"
 *   (NotifiConfig.ExpiryReminderBeforeDays, READ - not changed, so no other
 *   test or colleague sees a different reminder window).
 * - "{{Entity}}" = the app's PolicyNumber variable (AC "{{Entity}} resolves to
 *   PolicyNumber"); when the action names the entity variable differently,
 *   the action's first required variable stands for it.
 * - Expired "after the grace period ends": the suite's policies carry grace
 *   period 0, so the job that runs after the expiry instant expires them.
 * - 21539 "advance the policy into the window": time cannot be advanced -
 *   two policies are built (HOW): one expiring (threshold + 1) days + 30 min
 *   ahead (one day outside), one threshold days - 30 min ahead (first day
 *   inside), evaluated by the same reminder run(s).
 * - 21541: the same policy goes Active (first firing), receives Expiring Soon
 *   (it expires within minutes, so it is inside any window) and Expired (a
 *   firing after its expiry); a second policy is inactivated and approved.
 * - DaysRemaining is expected to equal the Riyadh calendar days from today to
 *   the expiry; dates match when they name the same day (Riyadh or UTC).
 * - 21547 reason: the policy inactivation reason whose English name matches
 *   REASON_LIKE ("Non-renewal by policyholder" in the TC), else the first one.
 *   TransitionDate must name the day the approved inactivation was applied
 *   (the app's own variable description: "Date the inactivation was
 *   applied."); the full run 2026-11-11 showed the policy's ExpiryDate there -
 *   a FINDING, left failing.
 * - Expiring Soon (21538 / 21539 / 21541 / 21545): no reminder job is listed in
 *   Scheduled Jobs, so the policy job is fired (the activation run plus one more
 *   firing) with the global reminder 7 days / Every day. In the full run no
 *   Expiring Soon arrived for any policy, network or formulary while Active /
 *   Inactive / Expired from the same jobs and definitions did - a FINDING.
 * - Dates "one day outside" / "first day inside" are placed on the right Riyadh
 *   calendar day (outOfWindowExpiry / inWindowExpiry clamp near midnight).
 */
export const CASES = {
  policyNumberInAll: { azureId: '21538' },
  reminderBoundary: { azureId: '21539' },
  fullLifecycle: { azureId: '21541' },
  draftNotNotified: { azureId: '21542' },
  expiringSoonDetails: { azureId: '21545' },
  inactiveReason: { azureId: '21547' },
} as const;

export const STORY = 'US 20994 - Policy Status In-App Notifications';

/** 21547's reason (the TC's "Non-renewal by policyholder"). */
export const REASON_LIKE = /non[\s-]?renewal/i;
export const INACTIVATION_DETAILS = 'Non-renewal by policyholder - Writer E policy notification case.';

/** Lead times (ms from now) - building a policy takes 5-20 s, several are built before one firing. */
export const EFFECTIVE_IN_MS = 180_000;
export const BATCH_EFFECTIVE_IN_MS = 240_000;
/** The short-lived policy of 21538 expires this far ahead (after the activation firing). */
export const SHORT_EXPIRY_IN_MS = 480_000;
/** 21541's policy expires late enough for an extra reminder firing before it. */
export const LIFECYCLE_EXPIRY_IN_MS = 660_000;
/** Long-lived policies expire this many days ahead (inside the suite plan's period). */
export const LONG_EXPIRY_DAYS = 60;
/** How long a "nothing is sent" case keeps watching after the job ran. */
export const WATCH_MS = 75_000;
