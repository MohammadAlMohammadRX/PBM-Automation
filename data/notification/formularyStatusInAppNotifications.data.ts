/**
 * US 20996 "Formulary Status In-App Notifications" (notification folder 13,
 * Writer E) - 7 cases: 21940, 21942, 21943, 21944, 21945, 21946, 21949
 * (21939 / 21941 / 21947 / 21948 / 21950 wait for the BA).
 *
 * How: the suite saves its OWN ACTIVE definitions for the formulary actions
 * (audience careconnect; marker + every variable as "[Name={{Name}}]") and
 * builds its OWN formularies through `formularyIn` ("QA Automation Formulary
 * ...", payer "Al sharq", discarded at teardown; FORM-0023 is never touched):
 * - Active by APPROVAL (`formularyIn('Active')`, ~3 min) for the inactivation
 *   cases and the "already Active" case;
 * - Future (approved) and made Active by the FORMULARY job for the expiry
 *   cases (their expiry is too close for the approval path's staged benefit
 *   configuration two days out) - BLOCKED (FORMULARY_NOT_ACTIVATED) when the
 *   job leaves it Future, as it did for every one in the full run 2026-11-11;
 * - Active by APPROVAL for the reminder cases (21945, 21946, 21949's Expiring
 *   Soon formulary): a 7-8 day expiry holds the staged configuration, so they
 *   no longer depend on the formulary job activating anything (fixed after the
 *   full run, where they stayed Future); the job is then fired
 *   REMINDER_FIRINGS times for the reminder.
 * The formulary job is moved through jobClock and restored after each firing.
 * Formularies are built by writerEHelpers.suiteFormulary (the formularyIn fixture's provisioning, retried
 * ONCE on a transport error such as "socket hang up" - rerun1 2026-11-12, 21946 - and BLOCKED on a refusal),
 * discarded in afterEach (discardSuiteFormularies).
 *
 * Literal readings / TC-vs-AC decisions (the test case wins):
 * - 21940 "already Active formulary": the suite's own (HOW named FORM-0023 -
 *   replaced by an own formulary so nothing shared is read for a decision);
 *   an ACTIVE "Active - Formulary" suite definition exists while the job runs,
 *   so "no activation notification" is not vacuous.
 * - 21942 "same placeholder set as a direct inactivation": only the approval
 *   path exists in the app; the placeholder set is compared with the AC's
 *   Inactive list (Entity, InactivationReason, TransitionDate) and every value
 *   must be resolved. TransitionDate must name the day the inactivation was
 *   applied (app's variable description "Date the inactivation was applied.");
 *   the full run 2026-11-11 showed the formulary's ExpiryDate - a FINDING.
 * - 21940: the PASS cannot prove the formulary job really ran (no job-run log;
 *   the same job never activated a Future formulary in the full run).
 * - "{{Entity}}" = the app's FormularyName variable (AC); otherwise the
 *   action's first required variable stands for it.
 * - Reminder period = the environment's global "Reminder before" (read, not
 *   changed). "Exactly the threshold" (21945) = expiry threshold days - 30 min
 *   ahead; "threshold + 1" (21946) = (threshold + 1) days + 30 min ahead -
 *   each kept on the right Riyadh calendar day near midnight (21946 failed
 *   "expected 8, found 9" when built in the last half hour of a Riyadh day).
 * - 21946 is NEGATIVE: an in-window control formulary is built beside it; when
 *   the control gets no Expiring Soon either, the case is BLOCKED with
 *   NO_REMINDER_RUN (unless an earlier step failed).
 */
export const CASES = {
  noActiveNotification: { azureId: '21940' },
  inactiveNotified: { azureId: '21942' },
  inactiveNamesFormulary: { azureId: '21943' },
  expiredNotified: { azureId: '21944' },
  expiringSoonAtBoundary: { azureId: '21945' },
  noReminderOutsideWindow: { azureId: '21946' },
  allApplicableTypes: { azureId: '21949' },
} as const;

export const STORY = 'US 20996 - Formulary Status In-App Notifications';

/** The AC's placeholder sets ("Entity" = the entity variable). */
export const SPEC_VARIABLES = {
  active: ['Entity', 'EffectiveDate', 'ExpiryDate', 'TransitionDate'],
  inactive: ['Entity', 'InactivationReason', 'TransitionDate'],
  expired: ['Entity', 'ExpiryDate', 'TransitionDate'],
  expiringSoon: ['Entity', 'DaysRemaining', 'ExpiryDate', 'EffectiveDate'],
} as const;

export const DEACTIVATION_DETAILS = 'Deactivated by the Writer E formulary notification case.';

/** A short-lived formulary expires this far after it is created (it goes live 2 min after creation). */
export const SHORT_EXPIRY_IN_MS = 360_000;
/** How long a "nothing is sent" case keeps watching after the job ran. */
export const WATCH_MS = 75_000;

/**
 * 21944 / 21949 (Expired part): the precondition is an ACTIVE formulary that expires within minutes. Only the
 * formulary job can give one (the approval path stages a benefit configuration two days out, which such a
 * formulary cannot hold) - and in the full run 2026-11-11 the job left every approved (Future) formulary Future
 * after its effective time. Decided at run time: BLOCKED when the job did not make the case's own formulary Active.
 */
export const FORMULARY_NOT_ACTIVATED = (detail: string): string =>
  'the formulary job did not make the approved (Future) suite formulary Active (' + detail + '), and the approval path cannot '
  + 'give an Active formulary that expires within minutes - so the Expired formulary notification could not be produced';

/** Formulary-job firings given to a reminder after an approval-path activation (no activation run happens). */
export const REMINDER_FIRINGS = 2;

export const NO_REMINDER_RUN =
  'the reminder process sent no "Expiring Soon - Formulary" notification even for the in-window control formulary (Active by approval, '
  + 'then two formulary-job firings) - so "not sent outside the window" could not be observed (Expiring Soon was never seen for any entity)';
