import type { NetworkBlockedCase } from './network.data';

/**
 * Test data for US 14126 "View network overview and details".
 *
 * Verified on the live detail screen (2026-10-21): the header carries the
 * name, a status badge, a `v{n} · {state}` badge, type and dates; tabs are
 * Overview, Facility Assignment (n), Linked Policies (n), Version History and
 * Audit History. The Overview panel shows Network Code, Arabic name, type,
 * status, both descriptions and both dates - and NO Created/Modified
 * metadata, which 17878 asks for (asserted per the sheet).
 *
 * The sheet's "Assigned Facilities count" and "Linked Policies count" are the
 * numbers in the two tab labels - the only counts the detail screen shows.
 */

export const CASE = {
  overviewFields: '17878',
  facilitiesCountLive: '17880',
  zeroCounts: '17884',
  tabChecklist: '17883',
  statusMatches: '17885',
  accessRestricted: '17886',
  countMatrix: '17887',
  rapidTabs: '17888',
} as const;

/** The sheet's audit metadata on the Overview (Created By/At, Modified By/At). */
export const AUDIT_METADATA = [/Created\s*By/i, /Created\s*(At|On)/i, /Modified\s*By/i, /Modified\s*(At|On)/i] as const;

/** A generated network code. Drafts carry NET-D-nnnn, published networks NET-nnnnnn. */
export const NETWORK_CODE_PATTERN = /^NET-(D-)?\d+$/;

/** A rendered date-time on the Overview: `DD/MM/YYYY HH:mm`. */
export const OVERVIEW_DATE_PATTERN = /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/;

/** The facilities a 17880 network starts with, and its count after one more. */
export const LIVE_COUNT = { initial: 2, afterAssign: 3 } as const;

/** How many times 17888 cycles through the tabs, before and after a reload. */
export const TAB_SWITCH_ROUNDS = 3;

export const BLOCKED_CASES: NetworkBlockedCase[] = [
  {
    azureId: '17881',
    title: 'should recount linked policies live when a policy is unlinked from the network',
    reason:
      'Needs a SUITE-OWNED policy linked to a suite-owned network that the case may unlink. The only networks with linked '
      + 'policies are shared team records (read-only to the suite), and the network screen offers no unlink: the Linked Policies '
      + 'tab is read-only and unlinking lives in the Policy module on a policy the suite does not own. Unblocked by a seeded '
      + 'policy linked to an automation network that cases may detach.',
  },
];
