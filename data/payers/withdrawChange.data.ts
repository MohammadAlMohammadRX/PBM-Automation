import type { BlockedCase } from './payerTypes';

/**
 * Test data for "Withdraw a Payer Change Before It Is Reviewed".
 *
 * HOW WITHDRAWAL WORKS HERE, because the sheet imagines a Withdraw button and
 * a "Withdrawn" status and the app has neither. Verified by the
 * warn-before-withdrawing story (folder 24): the maker withdraws a pending
 * request by EDITING the payer - the save raises "Return this payer to
 * draft?", and confirming it withdraws the request and returns the payer to
 * Draft. So every "Withdrawn" expectation is asserted as the request leaving
 * the queue and the payer reading Draft, with no reviewer decision recorded
 * on the version. The cases are written against that model and say so.
 *
 * The other-maker, reviewer-role and matrix cases need accounts this
 * environment does not have; the null-status case needs a corrupted record.
 * Those are listed in BLOCKED_CASES.
 */

/** The field edited to stage a change and, later, to withdraw it. */
export const WITHDRAW_EDIT = {
  label: 'License Number',
  staged: 'LIC-WD-STAGED',
  withdrawing: 'LIC-WD-WITHDRAW',
  again: 'LIC-WD-AGAIN',
} as const;

/** How many times Withdraw is pressed in the duplicate-submission case. */
export const RAPID_WITHDRAW_CLICKS = 3;

/** A version that carries a reviewer decision reads one of these. */
export const DECIDED_STATUS = /approved|rejected|published/i;

/** What the audit trail is expected to say about a withdrawal, in either wording. */
export const WITHDRAWAL_AUDIT_HINT = /withdr|draft|return|updat/i;

/** The accounts the role cases need. */
export const WITHDRAW_ROLE_REQUIREMENT = {
  role: 'a second maker account and a reviewer-only account',
  reason:
    'These cases prove a maker cannot withdraw another maker\'s request and a reviewer cannot '
    + 'withdraw at all. The single shared administrator is both maker and reviewer here.',
} as const;

const NEEDS_ACCOUNTS =
  `The configured non-admin account (a Payer Admin) is a maker for two shared live payers only and holds no review right, so neither a second maker on a disposable payer nor a reviewer can be played by it. ${WITHDRAW_ROLE_REQUIREMENT.reason} Provide ${WITHDRAW_ROLE_REQUIREMENT.role} and re-run.`;

/** The sheet's cases this environment cannot exercise, in renumbered order. */
export const BLOCKED_CASES: readonly BlockedCase[] = [
  { id: '006', title: 'should refuse a maker withdrawing a request submitted by another maker', reason: NEEDS_ACCOUNTS },
  { id: '007', title: 'should refuse a reviewer-only role withdrawing a maker\'s request', reason: NEEDS_ACCOUNTS },
  { id: '011', title: 'should offer Withdraw only for the right role and request-status combinations', reason: `${NEEDS_ACCOUNTS} The matrix needs each status owned by a distinct maker.` },
  {
    id: '015',
    title: 'should keep the withdrawn status through navigation, refresh and session interruption',
    reason: 'An exploratory session over navigation, refresh and interrupted sessions is a manual activity; its deterministic core (the request stays withdrawn) is the first case here.',
  },
  {
    id: '016',
    title: 'should offer no Withdraw for a request whose status field is missing',
    reason: 'This case needs a change request with a corrupted or null status field, which only a data-layer edit can produce.',
  },
];
