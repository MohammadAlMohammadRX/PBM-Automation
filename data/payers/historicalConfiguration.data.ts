import { nonAdminBlockReason } from '../accounts/nonAdminAccount.data';
import type { BlockedCase } from './payerTypes';

/**
 * Test data for "Reconstruct a Payer's Historical Configuration".
 *
 * There is NO point-in-time lookup in this build: the Version History tab
 * lists a payer's versions with their dates and statuses, but offers no
 * "as of <date>" control, so "reconstruct the configuration on 2026-05-01"
 * has no interface to drive. Every case that enters a date is BLOCKED on
 * that control.
 *
 * WHAT IS REACHABLE is the ledger the reconstruction would read: today's
 * configuration is the latest published version; a payer never edited has
 * exactly its registration version; a payer taken Active → Inactive → Active
 * carries each transition as a published version. Those three run for real.
 */

/** Statuses a listed version may carry once published. */
export const PUBLISHED_VERSION = /published/i;

/** How many versions a full inactivate-and-reactivate cycle should add at least. */
export const TRANSITIONS_IN_A_CYCLE = 2;

/** The account the role case needs. */
export const HISTORY_ROLE_REQUIREMENT = {
  role: 'an account without the Business Analyst role',
  reason: 'The case proves historical reconstruction is denied to a role without it; the shared administrator cannot show the denial.',
} as const;

const NEEDS_AS_OF_LOOKUP =
  'This case enters a date and reads the configuration in effect on it. The Version History tab '
  + 'offers no point-in-time ("as of") lookup in this build - versions are listed, not queried by '
  + 'date. Re-run once the lookup ships; the version readers already exist.';

/** The sheet's cases this environment cannot exercise, in renumbered order. */
export const BLOCKED_CASES: readonly BlockedCase[] = [
  { id: '001', title: 'should reconstruct the configuration for a past date with a single prior change', reason: NEEDS_AS_OF_LOOKUP },
  { id: '002', title: 'should return the version that became effective on the exact effective date', reason: NEEDS_AS_OF_LOOKUP },
  { id: '003', title: 'should return the prior version for the day before a version change', reason: NEEDS_AS_OF_LOOKUP },
  { id: '005', title: 'should report that no configuration exists for a date before registration', reason: NEEDS_AS_OF_LOOKUP },
  { id: '006', title: 'should reject an invalid date format without performing the lookup', reason: NEEDS_AS_OF_LOOKUP },
  { id: '007', title: 'should return the end-of-day version when several changes share one date', reason: NEEDS_AS_OF_LOOKUP },
  {
    id: '009',
    title: 'should deny historical reconstruction to a user without the Business Analyst role',
    reason: `${NEEDS_AS_OF_LOOKUP} And ${nonAdminBlockReason({ lacking: ['viewVersionHistory'] })} ${HISTORY_ROLE_REQUIREMENT.reason}`,
  },
  { id: '010', title: 'should feed re-adjudication the historical configuration for a past claim date', reason: 'This case needs an integrated Claims module and a claim to re-adjudicate - outside this framework.' },
  { id: '011', title: 'should handle leap-year and year-boundary dates in the historical lookup', reason: NEEDS_AS_OF_LOOKUP },
  { id: '012', title: 'should include every configuration field in the reconstructed record', reason: `${NEEDS_AS_OF_LOOKUP} No documented field checklist accompanied the story either.` },
  { id: '013', title: 'should reject or clearly handle a future date in the historical lookup', reason: NEEDS_AS_OF_LOOKUP },
];
