import { nonAdminBlockReason } from '../accounts/nonAdminAccount.data';

/**
 * Test data for "Submit a Payer Draft for Approval".
 *
 * The submission has two routes - the list row's action and the detail
 * header's - and one prompt; the cases here exercise both routes, the
 * prompt's cancel, the rule that nothing else raises a request, the full
 * Draft → Pending → Approved/Rejected cycle, the no-change refusal, two
 * sessions submitting at once, and a submission that fails on the wire.
 *
 * The re-check cases (a duplicate email or a deletion blocker arising AFTER
 * staging) cannot be set up: the register refuses the duplicate at save time
 * (the email-uniqueness story), so a staged draft can never be made to
 * collide later. Those, the approval-time blocker and the role case are
 * listed in BLOCKED_CASES.
 */

/** The field edited to give a draft something to submit. */
export const SUBMIT_EDIT = {
  label: 'License Number',
  value: 'LIC-SUBMIT-1',
  again: 'LIC-SUBMIT-2',
} as const;

/** The wizard field blanked in the incomplete-draft case. */
export const REQUIRED_FIELD_LABEL = 'Payer Name';

/** A rejected version reads this in the approval cell. */
export const REJECTED_STATE = /rejected/i;

/** The account the role case needs. */
export const SUBMIT_ROLE_REQUIREMENT = {
  role: 'an account without the System Administrator role',
  reason: 'The case proves Send for Approval is refused to a non-administrator; the shared administrator cannot show the refusal.',
} as const;
