import { nonAdminBlockReason } from '../accounts/nonAdminAccount.data';
import type { BlockedCase } from './payerTypes';

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

const NEEDS_LATE_DUPLICATE =
  'This case needs a duplicate to ARISE after the draft was staged. The register refuses a '
  + 'duplicate email at save time, so a second record can never take a staged draft\'s email, and '
  + 'the submit-time re-check can only ever see a clean draft. Provide a data-layer way to create '
  + 'the collision after staging and re-run.';

/** The sheet's cases this environment cannot exercise, in renumbered order. */
export const BLOCKED_CASES: readonly BlockedCase[] = [
  { id: '005', title: 'should catch a duplicate email introduced after staging when the draft is sent', reason: NEEDS_LATE_DUPLICATE },
  {
    id: '006',
    title: 'should catch a deletion blocker introduced after staging when the draft is sent',
    reason: 'This case needs a staged network removal and a new active plan created against that network afterwards - the Plans module, outside this framework.',
  },
  {
    id: '009',
    title: 'should leave the request pending rather than partially applied when a blocker is found at approval',
    reason: NEEDS_LATE_DUPLICATE,
  },
  {
    id: '012',
    title: 'should show every edited field as a before/after change in the reviewer\'s queue entry',
    reason: 'The approvals hub lists the request and its change type; no field-level before/after payload view has been observed on it. Point this case at the payload view once one exists.',
  },
  { id: '015', title: 'should treat case and whitespace variants of an existing email as duplicates when the draft is sent', reason: NEEDS_LATE_DUPLICATE },
];
