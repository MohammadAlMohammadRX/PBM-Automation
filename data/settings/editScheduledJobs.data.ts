import type { JobKey } from '../../utils/JobClock';

/**
 * US 20869 "Edit Scheduled Jobs" (settings folder 05, 16 cases 21046-21061).
 *
 * How it works in this build (reports/settings/Settings-Foundation-Notes.md,
 * reports/manual-automation/Foundation-Notes.md):
 * - System Settings > Settings > General. The read view's "Scheduled Jobs"
 *   section has six lines, "<label>" + "Every day at 12:15 am (Riyadh)" (am/pm
 *   LOWER case). Edit Setting -> the drawer: per job a Frequency select (absent
 *   for the accumulator reset), a time PICKER in Riyadh time ("12:15 AM",
 *   arrows only - typing is ignored) and a hint "Runs at 21:15 UTC". A CRON the
 *   picker cannot show (e.g. `7 3 * * 1`) appears as a text box `...-input`
 *   with Frequency "Custom (CRON)".
 * - The API refuses an invalid CRON with 422 "Invalid CRON expression." and
 *   keeps the previous value. Save -> "Setting updated" + "The setting was
 *   updated successfully.".
 * - Every test takes `settingsGuard`, which snapshots and restores all six
 *   `Jobs.*` CRONs; preconditions are set with `settingsGuard.set`.
 *
 * Literal readings / TC-vs-AC decisions (lead decision 2: the TC wins):
 * - The story's "Annual accumulator reset" is labelled "Policy benefit-year
 *   reset schedule" on the screen (`Jobs.AccumulatorAnnualResetCron`).
 * - AC: the accumulator reset is "editable only as a schedule expression in a
 *   text box". The screen shows a time PICKER for it (its CRON `45 0 * * *` is
 *   daily). 21050 / 21059 drive whatever control is there: with no text box a
 *   user cannot type "99 99 99 99 *", and the step FAILS stating that (finding).
 * - 21046 / 21049 (lead decision 1): compare what the screen shows with the
 *   new-installation defaults; equal -> PASS, different -> BLOCKED naming both.
 * - 21048 asserts "Every day at 03:15 AM (Riyadh)" exactly - case IS
 *   significant (lead decision 4), the app writes "am" (expected finding).
 *   21053 checks the overview after its save case-INSENSITIVELY: that case does
 *   not quote the sentence, and the casing finding belongs to 21048.
 * - 21051 precondition "a daily job holds a non-single-time expression shown as
 *   a text box": the Plan job is set to `0 1 1 1 *` (1 January 01:00 UTC - it
 *   cannot fire during the test). 21052 uses the case's literal `0,30 * * * *`
 *   on the Formulary job (it fires every 30 minutes until the restore, which
 *   the test calls at its end).
 * - 21053 (lead decision 9): the precondition "network job at 00:20 UTC" is set
 *   through the guard; the case saves 01:00 UTC (picker "04:00 AM"). "The next
 *   run reflects the new time": the next firing of the stored CRON is 01:00 UTC,
 *   and - to prove a saved time applies without a restart - the job is set
 *   through the SAME screen to a minute just ahead, over an approved suite
 *   network whose effective time has passed: Future before, Active after.
 * - 21055 quotes the Arabic -> the save is repeated in Arabic (lead decision 3).
 *   In Arabic the picker is nudged one minute with its arrow (the English
 *   "hh:mm AM" parser does not apply to the Arabic picker).
 * - 21056-21058 "navigate away": the side-menu link (Terminology Management);
 *   when the drawer's mask keeps it from being clicked, the browser Back button.
 *   The foundation saw the drawer close with NO dialog - expected finding.
 * - 21059 / 21060 (lead decision 10): select all + Delete and any clear icon,
 *   then Save; the save must be blocked AND a required message shown.
 * - 21061 (exploratory, scripted): the five daily jobs each set to a different
 *   Riyadh time (two of them crossing midnight in UTC); every hint compared with
 *   Riyadh = UTC+3 computed by `riyadhPickerToUtcHint`, not hard-coded.
 */

/** The platform time zone these cases presuppose (21047 / 21048 / 21061 precondition). */
export const RIYADH_ZONE = 'Asia/Riyadh';

/** The five daily status-update jobs, in the story's order. */
export const DAILY_JOBS = [
  'Jobs.PayerLifecycleCron',
  'Jobs.NetworkLifecycleCron',
  'Jobs.PlanLifecycleCron',
  'Jobs.FormularyLifecycleCron',
  'Jobs.PolicyLifecycleCron',
] as const satisfies readonly JobKey[];

export type DailyJob = (typeof DAILY_JOBS)[number];

export const ACCUMULATOR_JOB: JobKey = 'Jobs.AccumulatorAnnualResetCron';

/** The read view's label for each job (verified 2026-11-09). */
export const JOB_LABEL: Readonly<Record<JobKey, string>> = {
  'Jobs.AccumulatorAnnualResetCron': 'Policy benefit-year reset schedule',
  'Jobs.FormularyLifecycleCron': 'Formulary status update schedule',
  'Jobs.NetworkLifecycleCron': 'Medical network status update schedule',
  'Jobs.PayerLifecycleCron': 'Payer status update schedule',
  'Jobs.PlanLifecycleCron': 'Plan status update schedule',
  'Jobs.PolicyLifecycleCron': 'Policy status update schedule',
};

/** The read view's section heading. */
export const SCHEDULED_JOBS_HEADING = 'Scheduled Jobs';

// ---- lead decision 1: new-installation defaults ----------------------------------------

/**
 * The story's "new installation" defaults: the UTC line each daily job shows,
 * and the accumulator reset's CRON in its text box.
 */
export const NEW_INSTALL_DEFAULTS = {
  daily: {
    'Jobs.PayerLifecycleCron': 'Runs at 00:15 UTC',
    'Jobs.NetworkLifecycleCron': 'Runs at 00:20 UTC',
    'Jobs.PlanLifecycleCron': 'Runs at 00:25 UTC',
    'Jobs.FormularyLifecycleCron': 'Runs at 00:30 UTC',
    'Jobs.PolicyLifecycleCron': 'Runs at 00:35 UTC',
  } satisfies Record<DailyJob, string>,
  accumulatorCron: '45 0 1 1 *',
} as const;

/** Different from the defaults -> BLOCKED (true) rather than a failure. */
export const BLOCK_WHEN_NOT_DEFAULT = true;

/** The BLOCKED reason of a default case, naming what the screen shows and the default. */
export function notNewInstallReason(differences: { job: string; shown: string; expected: string }[]): string {
  return 'Needs a new installation: this environment has its own job schedule. '
    + differences.map((d) => `${d.job} shows "${d.shown}", the new-installation default is "${d.expected}"`).join('; ')
    + '. Unblocked on a freshly installed environment (or by the user agreeing to set the defaults first).';
}

// ---- the cases --------------------------------------------------------------------------

export const CASES = {
  dailyDefaults: { azureId: '21046' },
  utcHint: {
    azureId: '21047',
    job: 'Jobs.PayerLifecycleCron' as JobKey,
    picker: '03:15 AM',
    hint: 'Runs at 00:15 UTC',
  },
  overviewSentence: {
    azureId: '21048',
    job: 'Jobs.PayerLifecycleCron' as JobKey,
    /** 03:15 AM Riyadh = 00:15 UTC. */
    precondition: '15 0 * * *',
    sentence: 'Every day at 03:15 AM (Riyadh)',
  },
  accumulatorDefault: { azureId: '21049' },
  accumulatorInvalid: {
    azureId: '21050',
    job: 'Jobs.AccumulatorAnnualResetCron' as JobKey,
    typed: '99 99 99 99 *',
  },
  dailyRawInvalid: {
    azureId: '21051',
    job: 'Jobs.PlanLifecycleCron' as JobKey,
    /** Not a single daily time (1 January 01:00 UTC) - shown as a raw text box; cannot fire during the test. */
    precondition: '0 1 1 1 *',
    typed: 'x 1 1',
  },
  rawTextBox: {
    azureId: '21052',
    job: 'Jobs.FormularyLifecycleCron' as JobKey,
    cron: '0,30 * * * *',
  },
  saveNetworkTime: {
    azureId: '21053',
    job: 'Jobs.NetworkLifecycleCron' as JobKey,
    /** "currently set to 00:20 UTC". */
    precondition: '20 0 * * *',
    preconditionPicker: '03:20 AM',
    preconditionHint: 'Runs at 00:20 UTC',
    /** 01:00 UTC = 04:00 AM Riyadh. */
    picker: '04:00 AM',
    hint: 'Runs at 01:00 UTC',
    savedCron: '0 1 * * *',
    nextRunUtc: '01:00',
    overview: 'Every day at 04:00 AM (Riyadh)',
  },
  noRunNow: { azureId: '21054' },
  savedConfirmation: {
    azureId: '21055',
    job: 'Jobs.FormularyLifecycleCron' as JobKey,
    /** 01:00 UTC (or 01:30 UTC when it already holds 01:00) - far from the job's usual time. */
    times: ['04:00 AM', '04:30 AM'],
  },
  unsavedWarning: { azureId: '21056' },
  keepEditing: { azureId: '21057' },
  discardChanges: { azureId: '21058' },
  accumulatorEmpty: { azureId: '21059', job: 'Jobs.AccumulatorAnnualResetCron' as JobKey },
  networkEmpty: { azureId: '21060', job: 'Jobs.NetworkLifecycleCron' as JobKey },
  exploratoryUtc: {
    azureId: '21061',
    /** A different Riyadh time per job; 01:05 AM and 02:59 AM fall on the previous UTC day. */
    times: {
      'Jobs.PayerLifecycleCron': '03:00 AM',
      'Jobs.NetworkLifecycleCron': '02:59 AM',
      'Jobs.PlanLifecycleCron': '12:30 PM',
      'Jobs.FormularyLifecycleCron': '01:05 AM',
      'Jobs.PolicyLifecycleCron': '11:45 PM',
    } satisfies Record<DailyJob, string>,
  },
} as const;

// ---- messages (asserted exactly as the cases quote them) -------------------------------

export const MESSAGES = {
  invalidCron: 'Invalid CRON expression.',
  savedEn: 'Setting updated',
  savedAr: 'تم تحديث الإعداد',
  unsaved: {
    title: 'Unsaved Changes',
    message: 'You have unsaved changes. If you leave now, your edits will be lost.',
    options: ['Keep Editing', 'Discard Changes'],
  },
  /** "the field is flagged as required" - any required-field message. */
  required: /required|مطلوب/i,
} as const;

// ---- unsaved-changes cases (21056-21058) ------------------------------------------------

/** The job whose time the unsaved-changes cases change (never saved). */
export const UNSAVED_JOB: JobKey = 'Jobs.PlanLifecycleCron';

/** Candidate unsaved times - the first that differs from the current one is used. */
export const UNSAVED_TIMES = ['04:00 AM', '04:30 AM'] as const;

/** The route the screen lives on (the "left the screen" check). */
export const SETTINGS_ROUTE_FRAGMENT = '/system-settings/settings';

// ---- 21054: on-demand controls ----------------------------------------------------------

/** A control's text or id that would offer running a job now. */
export const RUN_ON_DEMAND = {
  text: /run\s*now|run\s*job|run\s*on\s*demand|trigger|execute|تشغيل الآن|تشغيل فوري/i,
  id: /run-?now|run-?job|trigger|execute/i,
} as const;

/** Controls the 21054 scan must have seen, so it is known to have read the screen (baseline). */
export const SCAN_BASELINE_IDS = ['settings-general-edit-button', 'settings-general-drawer-save-button'] as const;

// ---- budgets ----------------------------------------------------------------------------

/** A screen-only case (picker arrows for up to five jobs). */
export const SCREEN_BUDGET = 5 * 60_000;

/** 21053: provisioning a network, one screen save and one job firing. */
export const FIRING_BUDGET = 15 * 60_000;

/** 21053: how long after its minute the job may take to make the network Active. */
export const FIRING_SETTLE_MS = 3 * 60_000;

/** 21053: the suite network's effective time, ahead of now (the create refuses a past time). */
export const EFFECTIVE_AHEAD_MS = 120_000;

/** 21053: the least lead the screen move gets (picker arrows + save must finish before the minute). */
export const MOVE_LEAD_MS = 150_000;
