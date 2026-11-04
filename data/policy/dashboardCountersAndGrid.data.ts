import type { PolicyRight } from './policyPermissions.data';
import { OPTIONS } from './policy.data';

/**
 * US 15165 "Policy list - Dashboard counters & grid" (policy folder 01).
 * 19455 (counters after a status changes by date) is Manual and not automated.
 *
 * How the cases map onto the live list (2026-11-03, reports/policy/probe/SCREEN-MAP.md):
 *  - The list shows FOUR tiles - "Total Policies", "Active Policies", "Draft / Pending",
 *    "Expired / Terminated" - where the story and every case want FIVE: Total, Active,
 *    Pending, Inactive, Expired. Each case looks its counters up BY LABEL; a counter
 *    with no tile fails (the finding), it is never mapped onto a neighbouring tile.
 *  - The story's "Pending" is the status code `pending`, which the status filter labels
 *    "Future" (as the Formulary suite reads it); a "Draft / Pending" tile is matched
 *    by its label and compared with the Future count.
 *  - The grid has no Networks column (19458 asserts the case's thirteen columns).
 *  - The Cards view shows the holder in the card header (no own id) - read from it.
 *  - The payer-scoped user (19457) and the read-only user (19464) are the Payer Admin
 *    account shaped through `policyRole` (utils/policy/policyRole.ts); it sees only its
 *    own payers' policies, so 19464's policy is built for NUPCO (writerAHelpers.POLICY_SCOPE).
 *  - 19461 wants a register of EXACTLY the page size, then one more. The shared register's
 *    size cannot be set, so the boundary is checked as relations at its real size: the
 *    Total rises by one, the pager's pages together hold every policy, and the new one
 *    is listed (newest first).
 *  - 19460 (no policies in scope): the register is never empty, so the list's and the
 *    dashboard's OWN answers are emptied / zeroed in the browser (the Formulary 18622
 *    way) and the screen's rendering of them is what is checked.
 */

/** A counter the cases expect, the tile label that carries it, and the status filter that lists its policies (null = all). */
export interface StoryCounter {
  name: string;
  label: RegExp;
  filter: string | null;
}

export const STORY_COUNTERS: readonly StoryCounter[] = [
  { name: 'Total', label: /total/i, filter: null },
  { name: 'Active', label: /^active/i, filter: 'Active' },
  { name: 'Pending', label: /pending|future/i, filter: 'Future' },
  { name: 'Inactive', label: /^inactive/i, filter: 'Inactive' },
  { name: 'Expired', label: /expired/i, filter: 'Expired' },
];

/** The status filter's "no filter" option. */
export const ALL_STATUSES = OPTIONS.statusFilter[0];

/** The grid columns 19458 requires (case wording -> header pattern). */
export const GRID_COLUMNS: ReadonlyArray<[string, RegExp]> = [
  ['Policy name', /^policy name$/i],
  ['Policy number', /^policy number$/i],
  ['Policy type', /^policy type$/i],
  ['Plan', /^plan$/i],
  ['Payer', /^payer$/i],
  ['Policy holder', /^policy holder$/i],
  ['Effective date', /^effective date$/i],
  ['Expiry date', /^expiry date$/i],
  ['Members', /^members$/i],
  ['Networks', /^networks?$/i],
  ['Status', /^status$/i],
  ['Approval status', /^approval status$/i],
  ['Actions', /^actions$/i],
];

/** A value that is no placeholder at all (19465): a blank, or a raw null rendered. */
export const NOT_A_PLACEHOLDER = /^(|null|undefined|nan)$/i;

/** The rights a "read-only" user lacks (19464): every policy right that changes data; the reads stay. */
export const READ_ONLY_WITHHELD: readonly PolicyRight[] = [
  'create', 'edit', 'delete', 'clone', 'viewForClone', 'submit', 'submitLegacy', 'activate', 'inactivate', 'revert',
  'import', 'addMember', 'removeMember', 'assignNetwork', 'unassignNetwork', 'addDocument', 'deleteDocument', 'resetBenefits',
];

export const CASES = {
  fiveCounters: { azureId: '19454' },
  /** User A = the administrator (whole portfolio); User B = the Payer Admin (its two payers). */
  scopedCounts: { azureId: '19457' },
  gridColumns: { azureId: '19458', maxMembers: 10 },
  cardFields: { azureId: '19459', maxMembers: 10 },
  zeroCounters: { azureId: '19460' },
  pageBoundary: { azureId: '19461', maxPages: 40 },
  filterConsistency: { azureId: '19462', status: 'Active' },
  switchViews: { azureId: '19463', switches: 3 },
  /** Edit rights = the administrator; read-only = the Payer Admin without READ_ONLY_WITHHELD. */
  roleActions: { azureId: '19464' },
  /** The optional fields left blank: Member Limit (unlimited), grace period, no network assigned. */
  placeholder: { azureId: '19465' },
} as const;
