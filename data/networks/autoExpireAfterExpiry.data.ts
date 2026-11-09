import type { NetworkBlockedCase } from './network.data';
import { SEED_COMMAND } from '../../utils/jobDriven/jobSeeds';

/**
 * Test data for US 14130 "Automatically expire network after expiry date"
 * (folder 13) - automated 2026-11-08 by seed-then-check (see
 * jobDrivenNetwork.data.ts).
 *
 * SEEDS. `ExpireAfterExpiry` = suite networks made Active by the seed run's
 * F1, whose expiry date-time (today) passes before F2, which should make them
 * Expired. `ActiveExpiryTomorrow` = Active at F1, expiring ~27 h later - both
 * firings must leave it Active. `ExpiredThenExtend` = Expired the same way,
 * claimed EXCLUSIVELY by a case that acts on it (17895). The sheets' fixed
 * dates (2026-10-03 "yesterday") are played by today's seeds: the job compares
 * the expiry DATE-TIME, so "expiry has passed" is the expiry instant before F2.
 *
 * NOT EXERCISABLE HERE, annotated in the case rather than faked:
 * - Draft / Suspended partitions (17893, 17896): no network seed is a draft
 *   whose dates passed, and the application has no "Suspended" status (its
 *   Inactive status is US 14308's subject, where a passed expiry EXPIRES it).
 * - "Already Expired before the run" (17893 E1, 17896 rule 3): every seed
 *   expires AT F2, the last firing; only a SECOND seed run the same day re-runs
 *   the job over it (the case uses one when the manifest shows it).
 * - 17901 "three days overdue after an outage": the seed is overdue by minutes;
 *   the daily job cannot be held off for days in a shared environment.
 * - 17902 time-zone partitions: the site has ONE time zone (Asia/Riyadh).
 * - The sheets' "job log": no lifecycle job log exists in the UI or API
 *   (Foundation-Notes 2026-11-08); the record's change and its audit entry are
 *   what the run leaves behind.
 */
export const CASES = {
  activeExpires: { azureId: '17890' },
  tomorrowStaysActive: { azureId: '17892' },
  partitions: { azureId: '17893' },
  expiryToday: { azureId: '17894' },
  noManualReactivation: { azureId: '17895' },
  decisionTable: { azureId: '17896' },
  auditEntry: { azureId: '17899' },
  adminsNotified: { azureId: '17900' },
  missedRunCaughtUp: { azureId: '17901' },
  midnightBoundary: { azureId: '17902' },
  largeBatch: { azureId: '17903' },
  onlySystemExpires: { azureId: '17904' },
} as const;

/** 17903: the sheet's batch size. */
export const LARGE_BATCH = 500;

/** 17900: how the Notification Center names the network-expired action (definitions list `moduleActionEn`). */
export const EXPIRED_NETWORK_ACTION = /expired/i;
export const NETWORK_MODULE_ACTION = /network/i;

/** The old status of the job's expiry entry. */
export const BEFORE_EXPIRY = /Active/i;

/** No header action may set a network to Expired by hand. */
export const EXPIRE_ACTION = /expire/i;

export const BLOCKED_CASES: NetworkBlockedCase[] = [
  {
    azureId: '17897',
    title: 'should flag every policy linked to a network as affected when the network expires',
    reason:
      'Needs suite-owned policies linked to a network that the job then expires. The seed run (`' + SEED_COMMAND.network + '`) '
      + 'builds networks without policies, and every policy-linked network in this environment is a shared team record the suite '
      + 'must not expire. Unblocked by a seed purpose that links two suite policies (Policy module) to an ExpireAfterExpiry network '
      + 'before F2.',
  },
  {
    azureId: '17898',
    title: 'should never auto-expire a network that has no expiry date',
    reason:
      'A network without an expiry date cannot exist here: CreateNetwork with `expiryDate: null` is refused with 422 '
      + 'ValidationErrors[ExpiryDate] (verified 2026-11-08), and the form requires the date. Unblocked only if the application '
      + 'makes the expiry date optional.',
  },
];
