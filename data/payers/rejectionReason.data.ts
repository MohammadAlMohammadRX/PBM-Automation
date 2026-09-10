/**
 * Test data for "Require a Reason When Rejecting a Request".
 *
 * THE REASON IS A MANAGED DROPDOWN, NOT FREE TEXT, and that single fact decides
 * five of this story's ten cases. The Reject dialog, read off the live
 * application, offers:
 *
 *   Title   "Reject this request"
 *   Message "You are about to reject the request listed below. The proposed
 *            change is discarded and the requester is notified."
 *   Alert   "Rejecting discards the proposed change. The requester has to
 *            submit it again from scratch."
 *   Fields  a "Rejection Reason" select, placeholder "Select a reason", and an
 *            acknowledgement checkbox
 *   Actions Cancel / Reject
 *
 * and NO typable control at all - zero textareas, zero text inputs.
 *
 * So the sheet's minimum length, maximum length, whitespace-only and
 * script-injection cases describe a field that does not exist. Each of them
 * asserts the constraint that replaces it - the reason can only be one of a
 * managed set - which is a STRONGER guarantee than the validation the sheet
 * asks for: a value outside the list cannot be entered, so it cannot be
 * mis-validated, over-long, blank-but-not-empty, or executable.
 *
 * Where a case can still be run literally, it is: a valid reason, a rejection
 * with no reason chosen, the resulting status, and a finalized request offering
 * no reject action.
 */

/** The managed rejection reasons, in the order the dropdown offers them. */
export const REJECTION_DIALOG_REASONS = [
  'Incomplete Information',
  'Incorrect Data',
  'Missing Supporting Document',
  'Policy Violation',
  'Change Not Required',
  'Duplicate Request',
  'Other',
] as const;

/** The Reject dialog's own wording. */
export const REJECT_DIALOG = {
  title: 'Reject this request',
  message: 'You are about to reject the request listed below.',
  consequence: 'The proposed change is discarded and the requester is notified.',
  alert: 'Rejecting discards the proposed change.',
  reasonPlaceholder: 'Select a reason',
} as const;

/**
 * The status a rejected payer version ends in.
 *
 * "Rejected" appears in the payer's Approval Status cell and in its version
 * history; the record itself stays where it was, since the proposed change was
 * discarded rather than applied.
 */
export const REJECTED_STATUS = 'Rejected';

/**
 * The longest managed reason.
 *
 * Stands in for the sheet's "maximum allowed character limit" case: with no
 * typable field there is no limit to exceed, so what CAN be checked is that the
 * longest value the application itself offers is accepted end to end.
 */
export const LONGEST_REASON = REJECTION_DIALOG_REASONS.reduce((longest, reason) =>
  reason.length > longest.length ? reason : longest,
);

/**
 * The values the sheet asks to be typed into the reason field.
 *
 * Kept as data even though none of them can be entered: a case that reports
 * "this input is not expressible" should name the input it means, and the day a
 * free-text field appears these become the values to try.
 */
export const UNENTERABLE_REASONS = {
  empty: '',
  single: 'x',
  whitespace: '   ',
  script: '<script>alert(1)</script> - missing docs',
  overLength: 'x'.repeat(501),
} as const;

/** The account the restricted-role case needs. */
export const RESTRICTED_ROLE_REQUIREMENT = {
  role: 'a role that may view the approval queue but not decide requests',
  reason:
    'The case exists to prove the Reject action is withheld from a user who is not a reviewer. '
    + 'The shared administrator session holds every permission, so running it as the '
    + 'administrator would assert nothing.',
} as const;
