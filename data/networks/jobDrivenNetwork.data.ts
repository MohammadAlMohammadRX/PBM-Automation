import type { JobSeedPurpose } from '../../utils/jobDriven/jobSeeds';

/**
 * Shared data for the job-driven Network cases automated on 2026-11-08
 * (US 14129 folder 09, US 14130 folder 13, US 14308 folder 30, and the single
 * job-touched cases of 05 / 14 / 19 / 29 / 31 / 33).
 *
 * SEED-THEN-CHECK (reports/manual-automation/Foundation-Notes.md). The network
 * lifecycle job (`Jobs.NetworkLifecycleCron`) is DAILY now (00:15 Riyadh). The
 * cases never move it: `npm run seed:network-jobs`, run the same Riyadh day,
 * builds suite networks per purpose, fires the job twice (F1 activation, F2
 * expiry), restores it and records every seed's state before / after. A case
 * CLAIMS a seed of its purpose (`requireJobSeed`) and asserts what the job did;
 * no seed today -> BLOCKED naming the seed command.
 *
 * LABELS. The application has NO "Pending" network status: the sheets'
 * "Pending" (approved, effective date not reached) is the status the screens
 * and the status lookup call "Future" (verified 2026-11-08). The cases assert
 * "Future" wherever the sheet says Pending for an APPROVED network; a
 * submitted-but-unapproved registration is "Pending Approval" in the list's
 * approval cell.
 */
export const SHOWN = {
  /** The sheets' "Pending" for an approved network. */
  future: 'Future',
  active: 'Active',
  inactive: 'Inactive',
  expired: 'Expired',
} as const;

export type ShownStatus = (typeof SHOWN)[keyof typeof SHOWN];

/** The approval cell of a submitted, unapproved registration or edit. */
export const PENDING_APPROVAL_CELL = /Pending Approval/;

/**
 * How an audit entry made by the job should identify its actor: the sheets want
 * "system / automatic, not a specific approver".
 */
export const SYSTEM_ACTOR = /system|job|scheduler|automat|background/i;

/** What a refused reactivation of an Expired network should say. */
export const EXPIRED_CANNOT_REACTIVATE = /expired/i;

/** How long a case waits for the screen to show a status it already holds in the API. */
export const SCREEN_SETTLE_MS = 60_000;

/** The budget of a case that only reads seeds (open, read, audit). */
export const READ_SEED_BUDGET = 6 * 60_000;

/** The budget of a case that also builds or edits a network of its own. */
export const BUILD_BUDGET = 15 * 60_000;

/** The seed purposes these cases claim (names fixed by utils/jobDriven/jobSeeds.ts). */
export const PURPOSE = {
  activate: 'ActivateOnEffective',
  future: 'FutureEffective',
  expire: 'ExpireAfterExpiry',
  expiryTomorrow: 'ActiveExpiryTomorrow',
  inactiveExpire: 'InactiveThenExpire',
  inactiveFuture: 'InactiveFutureExpiry',
  inactiveLaterToday: 'InactiveExpiryLaterToday',
  expiredExtend: 'ExpiredThenExtend',
} as const satisfies Record<string, JobSeedPurpose>;
