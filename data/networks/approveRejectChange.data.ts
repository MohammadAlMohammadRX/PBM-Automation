import type { RejectionReason } from '../payers/payerTypes';
import { repeatTo } from './network.data';
import { edited } from './optimisticLocking.data';

/**
 * Test data for US 14314 "Approve or reject a submitted network change".
 *
 * The decision is taken in Approval Management > Network (verified
 * 2026-10-21): each queued request offers Review / Reject / Approve; both
 * decisions raise the shared dialog with an acknowledgement; Reject asks for a
 * reason from a MANAGED list (no free-text field was found on the payer
 * module's identical dialog - story 26). The sheet's typed reasons are mapped
 * to the managed reason closest in meaning; the reason-LENGTH case asserts the
 * free-text field the sheet requires.
 *
 * "Submitted" on the sheet = "Pending Approval" in the application; "Active /
 * Published" = the `Published` version status. The reviewer is the single
 * administrator account, which also submits - so "a change submitted by
 * someone else" cannot be staged here, and the self-decision cases are
 * asserted against that same account.
 */
export { edited };

/** Version-history states after decisions. */
export const VERSION_STATUS = {
  published: /Published|Active/,
  superseded: /Superseded/,
  rejected: /Rejected/,
} as const;

/** Approval-cell states. */
export const APPROVAL_CELL = {
  published: /Published/,
  rejected: /Rejected|Draft/,
} as const;

/** The sheet's reasons mapped to managed ones. */
export const REASON: Record<'missingCoverage' | 'incorrectProviders' | 'duplicate', RejectionReason> = {
  missingCoverage: 'Incomplete Information',
  incorrectProviders: 'Incorrect Data',
  duplicate: 'Duplicate Request',
};

/** What a second decision on a decided request must say. */
export const ALREADY_DECIDED = /already|no longer pending|decided|not pending/i;

/** A request without the reviewer right. */
export const FORBIDDEN_STATUS = 403;

/** The reason-length boundaries (18190). */
export const REASON_LENGTH = { max: 500, atMax: repeatTo('r', 500), overMax: repeatTo('r', 501) } as const;

export const CASE = {
  approvePublishes: '18178',
  supersedes: '18179',
  rejectWithReason: '18180',
  rejectWithoutReason: '18181',
  noSelfDecision: '18182',
  nonReviewer: '18183',
  reviewerBoth: '18184',
  repeatedCycles: '18185',
  rejectedTerminal: '18186',
  reDecide: '18187',
  concurrentReviewers: '18188',
  supersededDetails: '18189',
  reasonLength: '18190',
  decisionTable: '18191',
} as const;

export const CHANGES = {
  first: 'First approved change',
  second: 'Second approved change',
  rejected: 'A change that is rejected',
} as const;
