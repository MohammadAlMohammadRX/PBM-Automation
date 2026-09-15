import type { BlockedCase } from './payerTypes';

/**
 * Test data for "Make the Lifecycle Job Schedule Configurable and Resilient".
 *
 * VERIFIED live, and it overturns an earlier assumption that no schedule UI
 * existed: System Settings > Settings > General carries three lifecycle job
 * schedules - network, payer, policy - each a single CRON expression in UTC,
 * edited through one drawer and saved with PUT UpsertSystemSettings. The
 * drawer validates NOTHING client-side; the server refuses a bad CRON with
 * 422 and the toast "Invalid CRON expression.", leaving the drawer open and
 * the stored value untouched.
 *
 * THE SHEET'S MODEL DIFFERS from the app's: it imagines frequency, time and
 * time-zone fields. The app has one CRON string, and the time zone is fixed
 * to UTC by the label. So the boundary and decision-table cases are asserted
 * on CRON forms - hour and minute limits, valid daily/interval/weekly shapes,
 * malformed and oversized input - which is the same validation intent on the
 * real field.
 *
 * EVERY SAVE OF A CHANGED VALUE IS UNDONE IN THE SAME TEST. The payer CRON
 * drives a real job on a shared environment, so each case reads the original,
 * saves its alternative, asserts, and restores - and the describe's afterEach
 * restores again if a failure left the value changed. The alternative values
 * keep the job at a harmless nightly time.
 */

/** A valid schedule that differs from the original: the same expression with its minute moved by one. */
export const alternativeCron = (original: string): string => {
  const parts = original.trim().split(/\s+/);
  const minute = Number(parts[0]);
  const bumped = Number.isInteger(minute) ? (minute + 1) % 60 : 5;
  return [String(bumped), ...(parts.slice(1).length === 4 ? parts.slice(1) : ['0', '*', '*', '*'])].join(' ');
};

/** Values the server must refuse, by what each probes. */
export const INVALID_CRONS = {
  outOfRange: '99 99 * * *',
  hourOverBoundary: '0 24 * * *',
  minuteOverBoundary: '60 0 * * *',
  malformed: 'not-a-cron',
  tooFewFields: '5 *',
  oversized: '1 '.repeat(150).trim(),
  script: '<script>alert(1)</script>',
  empty: '',
} as const;

/** The upper boundary that must still be accepted. */
export const VALID_BOUNDARY_CRON = '59 23 * * *';

/** Valid schedule shapes standing in for the sheet's frequency table. */
export const VALID_CRON_FORMS = [
  { label: 'daily at a fixed time', cron: '0 3 * * *' },
  { label: 'every six hours', cron: '0 */6 * * *' },
  { label: 'weekly on Monday', cron: '30 1 * * 1' },
] as const;

/** How a refused save presents. */
export const SCHEDULE_REFUSAL = {
  status: 422,
  toast: /invalid cron/i,
} as const;

/** The schedule label must state the time basis. */
export const UTC_BASIS = /\(CRON,\s*UTC\)/i;

/** The site time zone the drawer offers, as a recognisable zone string. */
export const TIME_ZONE_PATTERN = /GMT|UTC|\//i;

/** How the audit log names a settings change. */
export const SETTINGS_AUDIT_ENTITY = /setting/i;

/** The account the role case needs. */
export const SCHEDULE_ROLE_REQUIREMENT = {
  role: 'a Standard and a Read-Only user',
  reason:
    'The case proves only the System Administrator can view and change the lifecycle schedule. '
    + 'The shared administrator can, so it cannot show the refusal.',
} as const;

/** The sheet's cases this environment cannot exercise, in renumbered order. */
export const BLOCKED_CASES: readonly BlockedCase[] = [
  {
    id: '005',
    title: 'should fall back to the default schedule and log it when the stored schedule is missing at startup',
    reason: 'This case deletes the stored schedule before an application restart and reads the server log - data-layer and host access this suite does not have.',
  },
  {
    id: '006',
    title: 'should fall back to the default schedule and log it when the stored schedule is corrupted at startup',
    reason: 'This case corrupts the stored schedule before a restart and reads the server log - data-layer and host access this suite does not have.',
  },
  {
    id: '007',
    title: 'should apply a schedule change to the next run when the job is currently in progress',
    reason: 'This case needs the lifecycle job to be running while the schedule is saved; the job runs nightly at its CRON time and cannot be triggered from here.',
  },
  {
    id: '014',
    title: 'should transition eligible payers correctly when the job runs on the newly saved schedule',
    reason: 'End-to-end execution needs the job to fire on the saved schedule; it runs nightly (UTC) and cannot be triggered or fast-forwarded from here.',
  },
];
