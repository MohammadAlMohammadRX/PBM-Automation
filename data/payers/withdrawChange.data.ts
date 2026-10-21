
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

/** The accounts the role cases need. */
export const WITHDRAW_ROLE_REQUIREMENT = {
  role: 'a second maker account and a reviewer-only account',
  reason:
    'These cases prove a maker cannot withdraw another maker\'s request and a reviewer cannot '
    + 'withdraw at all. The single shared administrator is both maker and reviewer here.',
} as const;
