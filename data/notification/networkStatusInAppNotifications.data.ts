/**
 * US 20995 "Network Status In-App Notifications" (notification folder 12,
 * Writer E) - 6 cases: 21929, 21930, 21932, 21934, 21935, 21936 (21931 /
 * 21933 / 21937 / 21938 wait for the BA).
 *
 * How (assessment "how" + foundation): the suite saves its OWN ACTIVE
 * definition per network action (audience careconnect) whose messages carry a
 * marker and every variable as "[Name={{Name}}]"; it builds its OWN approved
 * networks ("Automation Network ...") and moves the NETWORK job (jobClock,
 * restored after every firing and at teardown). Approval never makes a network
 * Active - the job does; expiry is applied by the job; an approved
 * inactivation applies at approval (verified 2026-11-08).
 *
 * Literal readings / TC-vs-AC decisions (the test case wins):
 * - "Pending/Approved" before Active (21929) = the app's Future.
 * - "{{Entity}}" = the app's NetworkName variable (AC "{{Entity}} resolves to
 *   NetworkName"); a variable set is compared with the AC's lists with the
 *   entity variable written as "Entity" (SPEC_VARIABLES).
 * - Dates in a message match when they name the same day (Riyadh or UTC) as
 *   the network's stored date; TransitionDate = the day of the firing /
 *   approval that made the change (the app's own description of the variable,
 *   GetActionVariables: "Business date the automated job applied the
 *   transition." / for Inactive "Date the inactivation was applied."). Full run 2026-11-11: the app filled it with the network's
 *   ExpiryDate (21930 / 21932) - a FINDING, left failing.
 * - "Configured reminder period" = the environment's global "Reminder before"
 *   (NotifiConfig.ExpiryReminderBeforeDays, read - not changed). "Threshold + 1
 *   day" (21934) = expiry (threshold + 1) days + 30 min ahead; the in-window
 *   control network = threshold days - 30 min ahead (inside under every way of
 *   counting days).
 * - 21934 is a NEGATIVE case: it only means something when the reminder
 *   process ran. An in-window control network is built beside it; when the
 *   control gets no Expiring Soon notification either (activation run + one
 *   more firing), the case is BLOCKED with NO_REMINDER_RUN (Expiring Soon for a
 *   network has never been observed) - unless an earlier step already failed.
 * - InactivationReason (21932) must equal the English label of the reason the
 *   inactivation used (the first networkInactivationReason - what the suite's
 *   inactivation sends).
 */
export const CASES = {
  activeNotified: { azureId: '21929' },
  activeValues: { azureId: '21930' },
  inactiveNotified: { azureId: '21932' },
  noReminderOutsideWindow: { azureId: '21934' },
  expiredNotified: { azureId: '21935' },
  allFourTypes: { azureId: '21936' },
} as const;

export const STORY = 'US 20995 - Network Status In-App Notifications';

/** The AC's placeholder sets ("Entity" = the entity variable). */
export const SPEC_VARIABLES = {
  active: ['Entity', 'EffectiveDate', 'ExpiryDate', 'TransitionDate'],
  inactive: ['Entity', 'InactivationReason', 'TransitionDate'],
  expired: ['Entity', 'ExpiryDate', 'TransitionDate'],
  expiringSoon: ['Entity', 'DaysRemaining', 'ExpiryDate', 'EffectiveDate'],
} as const;

/** Inactivation details the suite records. */
export const INACTIVATION_DETAILS = 'Inactivated by the Writer E network notification case.';

/** Lead times: the networks go live this far ahead of now; a short-lived network expires this far ahead. */
export const EFFECTIVE_IN_MS = 150_000;
export const SHORT_EXPIRY_IN_MS = 330_000;
/** When several networks are built before one firing (21936). */
export const BATCH_EFFECTIVE_IN_MS = 240_000;
export const BATCH_SHORT_EXPIRY_IN_MS = 450_000;

export const NO_REMINDER_RUN =
  'the reminder process sent no "Expiring Soon - Network" notification even for the in-window control network (activation run plus one more '
  + 'network-job firing) - so "not sent outside the window" could not be observed (Expiring Soon for a network was never seen in this environment)';
