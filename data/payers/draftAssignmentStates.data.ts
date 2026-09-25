import { ASSIGNMENT_STATE } from '../networks/networkAssignment.data';
import { nonAdminBlockReason } from '../accounts/nonAdminAccount.data';
import type { BlockedCase, RejectionReason } from './payerTypes';

/**
 * Test data for "Show Draft Assignment/Removal States and Reserve Networks
 * Being Staged".
 *
 * The transitions themselves - stage, submit, approve, each state in turn -
 * are the network-assignment story (folder 32 TC-001/002/005/008) and are not
 * repeated. This story's residue is what the rows are CALLED, in both
 * languages; what a rejected Pending Removal reverts to; and what a freshly
 * staged removal reads as.
 *
 * WHAT THE ENVIRONMENT HOLDS. Fifteen payers carry a network whose link reads
 * "Pending Removal" - removals the assignment story submitted and no reviewer
 * ever decided. That is exactly the precondition the rejection case needs, so
 * it runs for real. No link is SETTLED (published and unstaged), so the "stage
 * a removal" case reports what it found. The pool of assignable networks is
 * empty, so every case that stages an ASSIGNMENT is listed in BLOCKED_CASES.
 */

/**
 * Every English label an assignment-state cell is allowed to show.
 *
 * The four the sheet names, the ones the assignment story read live, and the
 * settled state. "Draft Assignment" and "Pending Removal" were read off live
 * rows in this batch.
 */
export const ASSIGNMENT_STATE_VOCABULARY_EN = [
  'Draft Assignment',
  'Draft Removal',
  'Pending Assignment',
  ASSIGNMENT_STATE.pendingAddition,
  ASSIGNMENT_STATE.pendingRemoval,
  ASSIGNMENT_STATE.assigned,
  ASSIGNMENT_STATE.unassigned,
  'Active',
  '—',
] as const;

/**
 * VERIFIED: a SETTLED link - published, nothing staged - shows a dash in the
 * state column rather than a word. It is neither English nor Arabic, so the
 * bilingual check treats it as its own class.
 */
export const SETTLED_MARKER = /^[-—–]$/;

/**
 * The exact Arabic text the sheet requires for the two NEW draft states. The
 * two pending states keep "their pre-existing text", which the sheet does not
 * spell out - so for those the check is that the label IS Arabic.
 */
export const DRAFT_STATE_LABELS_AR: Readonly<Record<string, string>> = {
  'Draft Assignment': 'ربط مسودة',
  'Draft Removal': 'إلغاء ربط مسودة',
};

/** A label rendered in Arabic contains Arabic script. */
export const ARABIC_SCRIPT = /[؀-ۿ]/;

/** What a freshly staged removal must read as. */
export const DRAFT_REMOVAL_LABEL = 'Draft Removal';

/** A link with a removal or assignment in flight. */
export const IN_FLIGHT_STATE = /draft|pending/i;

/** The reason given when rejecting a pending removal. */
export const REMOVAL_REJECTION_REASON: RejectionReason = 'Other';

/** The account the role case needs. */
export const STAGING_ROLE_REQUIREMENT = {
  role: 'a read-only or viewer role on the payer module',
  reason:
    'The case proves only the System Administrator (maker) role can stage assignment or removal '
    + 'drafts. The shared administrator can, so it cannot show the withheld half.',
} as const;

const NEEDS_FREE_NETWORK =
  'This case has to STAGE a new assignment, and the Assign Network drawer offers no network '
  + 'here: every network already belongs to a payer. Free one (unassign it from a payer and '
  + 'approve the removal - the removal-dependency story does exactly that when it runs) or '
  + 'create and approve a network, then re-run.';

/** The sheet's cases this environment cannot exercise, in renumbered order. */
export const BLOCKED_CASES: readonly BlockedCase[] = [
  {
    id: '002',
    title: 'should not offer a network that another payer\'s pending request names',
    reason: `${NEEDS_FREE_NETWORK} The case then needs that network staged and submitted on a first payer.`,
  },
  {
    id: '003',
    title: 'should stop a second maker staging a network a first maker has already staged for another payer',
    reason: `${NEEDS_FREE_NETWORK} It also needs a second maker account (NON_ADMIN_USERNAME).`,
  },
  {
    id: '004',
    title: 'should release the network back to the pool when a Draft Assignment is discarded',
    reason: NEEDS_FREE_NETWORK,
  },
  {
    id: '005',
    title: 'should show a clear error when a network reserved by another payer\'s pending request is selected',
    reason: NEEDS_FREE_NETWORK,
  },
  {
    id: '007',
    title: 'should keep the row state consistent when a network is rapidly toggled between Draft Assignment and Draft Removal',
    reason:
      'This case needs a SETTLED link - published, with nothing staged - to toggle. Every linked '
      + 'network here already carries a Pending Removal. Approve or reject those removals (the '
      + 'rejection case here does one) and re-run.',
  },
  {
    id: '008',
    title: 'should behave consistently across draft, pending and reserved states in an exploratory session',
    reason:
      'The exploratory session needs three payers sharing a pool of assignable networks. The pool '
      + 'is empty - see the free-network remedy.',
  },
  {
    id: '011',
    title: 'should reflect reservations in real time when two payers\' administrators watch the pool',
    reason: `${NEEDS_FREE_NETWORK} Two concurrent sessions can be driven from here once it exists.`,
  },
];
