import type { NetworkBlockedCase } from './network.data';
import { SEED_COMMAND } from '../../utils/jobDriven/jobSeeds';

/**
 * Test data for US 14308 "Automatically expire an inactive network once its
 * expiry date passes" (folder 30) - automated 2026-11-08 by seed-then-check
 * (see jobDrivenNetwork.data.ts).
 *
 * SEEDS. `InactiveThenExpire` = suite networks made Active by F1, then
 * INACTIVATED by the administrator with a reason (approved) - the sheets'
 * "manual suspension" - whose expiry date-time (today) passes before F2.
 * `InactiveFutureExpiry` = inactivated the same way, expiring in a year.
 * The sheets' site date 2026-10-04 is the day of the seed run.
 *
 * TEST CASE OVER APPLICATION. 18113 says an Inactive network whose expiry DATE
 * equals today must stay Inactive ("equals, but has not yet passed"); the job
 * compares the expiry DATE-TIME, so today's InactiveThenExpire seed (expiry
 * today, passed before F2) is expected to read Expired - 18113 asserts the
 * sheet and is EXPECTED TO FAIL. It also disagrees with US 14130's 17894
 * (Active, expiry today -> Expired).
 *
 * 18114 "one day in the past" is played by an expiry minutes in the past.
 * 18116's "Pending network with a past expiry" cannot exist (its expiry would
 * precede its future effective date); the Future seed plays the Pending row.
 * The site has ONE time zone (Asia/Riyadh, UTC+3): 18117 runs only when the
 * seed run's F2 fell where the Riyadh date was ahead of the UTC date.
 */
export const CASES = {
  inactiveExpires: { azureId: '18112' },
  expiryTodayStaysInactive: { azureId: '18113' },
  oneDayPastExpires: { azureId: '18114' },
  futureStaysInactive: { azureId: '18115' },
  otherStatesUntouched: { azureId: '18116' },
  siteLocalDate: { azureId: '18117' },
  expiryOverSuspension: { azureId: '18118' },
  notReprocessed: { azureId: '18120' },
  onlyStatusChanges: { azureId: '18121' },
  viewerCannotReverse: { azureId: '18123' },
  auditReporting: { azureId: '18124' },
} as const;

/** The system Audit Logs entity type of a network. */
export const NETWORK_AUDIT_ENTITY = 'Network';

/** What the viewer must not be offered on the network. */
export const VIEWER_WITHHELD = ['inactivateNetwork', 'activateNetwork', 'deleteNetwork', 'cloneNetwork', 'submitNetwork'] as const;

/** The header actions a read-only viewer must not see as available. */
export const STATUS_ACTIONS = ['activate', 'inactivate'] as const;

/** The second seed run that re-runs the job over already-Expired seeds. */
export const SECOND_RUN = `a second \`${SEED_COMMAND.network}\` the same day, after the first (its firings re-run the job over the first run's Expired seeds)`;

export const BLOCKED_CASES: NetworkBlockedCase[] = [
  {
    azureId: '18119',
    title: 'should skip an Inactive network that has no expiry date without an error',
    reason:
      'A network without an expiry date cannot exist here: CreateNetwork with `expiryDate: null` is refused with 422 '
      + 'ValidationErrors[ExpiryDate] (verified 2026-11-08). Unblocked only if the application makes the expiry date optional.',
  },
  {
    azureId: '18122',
    title: "should decide each Inactive network's expiry by its own site's local date when sites in several time zones run in one job",
    reason:
      'Needs sites in different time zones (UTC-5, UTC+10, UTC+0). This environment has ONE site time zone (System Settings '
      + '> General, Asia/Riyadh) and networks carry no site or time zone of their own. Unblocked by multi-site time-zone support '
      + 'and one seeded Inactive network per site.',
  },
];
