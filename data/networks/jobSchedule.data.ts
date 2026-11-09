import type { NetworkBlockedCase } from './network.data';

/**
 * Test data for US 14310 "Make the daily network status job configurable and
 * date-aware" (network folder 32). Manual until 2026-11-08; automated by moving
 * the job's time (Build-Brief.md).
 *
 * THE SCREEN (Foundation-Notes.md, verified 2026-11-08). The schedule lives in
 * System Settings > Settings > General > "Scheduled Jobs" - NOT in the Network
 * Management module, so step 1 ("navigate to the Network Management module")
 * opens the module and step 2 the settings drawer. `Jobs.NetworkLifecycleCron`
 * ("Medical network status update schedule") is stored as a UTC CRON
 * `m h * * *`; the drawer shows a time-only picker in RIYADH time ("12:15 AM")
 * with a "Runs at 21:15 UTC" hint. The sheets' run times (02:00, 00:00, 23:59,
 * 14:30, 05:00) are what the administrator picks on the screen, i.e. Riyadh
 * wall-clock times.
 *
 * "WAIT FOR 02:00". A case cannot wait for 02:00. The schedule the case saves
 * is checked as stored and as displayed, and that the job FIRES AT THE
 * CONFIGURED TIME is observed by configuring a time two or three minutes ahead
 * (the same UpsertSystemSettings save the screen sends, through `jobClock`)
 * over a network of the case's own whose effective time has passed: Future
 * before that minute, Active after it. The boundary cases (00:00, 23:59) check
 * the next firing the stored value means; the firing itself is the same
 * mechanism 18139 and 18149 observe. Every move is restored by the fixture.
 *
 * "THE JOB EXECUTION LOG" (18145, 18147, 18148, 18150). The foundation found NO
 * last-run / job-execution log for the lifecycle jobs in the UI or the API
 * (only the accumulator reset has one). The cases assert the TEST CASE: a log
 * record of the run (start, end, processed, skipped with reasons, errors) is
 * looked for in the system audit log and the network's Audit History - an
 * expected FINDING while no such log exists.
 *
 * "SystemAdministrator" / "NetworkAdministrator" (18144): the administrator
 * account and the configured non-administrator account (Payer Admin).
 */

export const JOB_SCHEDULE_CASES = {
  configureAndRun: { azureId: '18139', time: '02:00', storedCron: '0 23 * * *', utcHint: 'Runs at 23:00 UTC' },
  earliest: { azureId: '18140', time: '00:00', storedCron: '0 21 * * *', utcHint: 'Runs at 21:00 UTC' },
  latest: { azureId: '18141', time: '23:59', storedCron: '59 20 * * *', utcHint: 'Runs at 20:59 UTC' },
  invalid: { azureId: '18142', typed: '25:99', invalidCron: '99 25 * * *' },
  midRange: { azureId: '18143', time: '14:30', storedCron: '30 11 * * *', utcHint: 'Runs at 11:30 UTC' },
  adminOnly: { azureId: '18144', attemptedCron: '0 23 * * *' },
  reschedule: {
    azureId: '18149',
    oldTime: '02:00',
    oldCron: '0 23 * * *',
    newTime: '05:00',
    newCron: '0 2 * * *',
    newUtcHint: 'Runs at 02:00 UTC',
  },
} as const;

/**
 * The cases sharing ONE firing over a mix of the case's own networks: two
 * approved (eligible - the job makes them Active), one submitted never
 * approved (an unmet activation precondition: approval), one draft, and one
 * created with NO effective date when the application accepts it.
 *
 * - 18145 "NET-3001 Pending, required configuration missing": the submitted,
 *   never-approved network - approval is the activation precondition the
 *   application enforces.
 * - 18148 "NET-3002 EffectiveDate = null": CreateNetwork with
 *   `effectiveDate: null`; when the application refuses it (422, like the
 *   required expiry - Foundation-Notes) the precondition cannot exist and the
 *   case is BLOCKED with the application's answer.
 * - 18150 "5 processed, 2 skipped": scaled to the case's own 2 eligible and 2
 *   skipped networks (the run processes every network, not only these).
 */
export const SKIP_RUN_CASES = {
  unmetPrecondition: { azureId: '18145' },
  missingEffective: { azureId: '18148' },
  runLog: { azureId: '18150' },
} as const;

/** The fields a job-execution log entry must carry (18150 checklist). */
export const JOB_LOG_FIELDS = ['start', 'end', 'processed', 'skipped', 'error'] as const;

/** A refused direct request (18142 invalid CRON, 18144 non-admin). */
export const REFUSED = { min: 400, max: 499 } as const;
export const UNAUTHORISED: readonly number[] = [401, 403];

/** How long a job firing may take to show on a record. */
export const FIRING_SETTLE_MS = 3 * 60_000;

/** Budget per case. */
export const SCHEDULE_TIMEOUT_MS = 10 * 60_000;
export const FIRING_TIMEOUT_MS = 20 * 60_000;

/** The cases this environment cannot exercise - each names the missing resource. */
export const BLOCKED_CASES: readonly NetworkBlockedCase[] = [
  {
    azureId: '18146',
    title: 'should evaluate transitions on the site\'s local date when it is a day ahead of the server date',
    reason:
      'Needs a SITE configured in a time zone whose date is ahead of the server\'s at the run time (the sheet: UTC+12, server '
      + '2026-10-04, site 2026-10-05). This environment has ONE site time zone, the shared System Settings value '
      + 'Site.TimeZone = Asia/Riyadh, which other teams rely on - the suite may move only job TIMES (user, 2026-11-08), not the '
      + 'site time zone. The lifecycle job also compares date-TIMES (an expiry minutes away is applied by the next run), so a '
      + 'calendar-date difference cannot be produced on a network. Unblock with a dedicated site / tenant in UTC+12.',
  },
  {
    azureId: '18147',
    title: 'should complete the daily job with zero networks processed when none need evaluation',
    reason:
      'Needs an environment where NO network requires status evaluation. The shared register holds every team\'s networks '
      + '(Future, Active, Inactive ones the job evaluates on every run) which the suite may not change or delete, and there is no '
      + 'job-execution log to read "zero processed" from (Foundation-Notes: none exists for the lifecycle jobs). Unblock with an '
      + 'empty tenant / database and a job-run log.',
  },
  {
    azureId: '18151',
    title: 'should resolve the site\'s local date correctly when the job runs on a daylight-saving transition night',
    reason:
      'Needs a site in a time zone that observes daylight saving. The only site time zone is Asia/Riyadh (UTC+3 all year, no '
      + 'DST), so a DST transition night never occurs, and changing the shared Site.TimeZone setting is outside what the suite '
      + 'may change (only job times, user 2026-11-08). Unblock with a dedicated site / tenant in a DST time zone.',
  },
];
