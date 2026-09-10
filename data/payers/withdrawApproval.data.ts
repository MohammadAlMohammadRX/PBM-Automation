/**
 * Test data for "Warn Before an Edit or Delete Withdraws a Pending Approval".
 *
 * THE APPLICATION DOES THIS WELL, and the exact wording is why. Editing a payer
 * that is awaiting approval and pressing Save raises, verified live:
 *
 *   Title    "Return this payer to draft?"
 *   Body     "This payer is awaiting approval. Saving this change withdraws
 *             that request and returns the payer to draft - you will need to
 *             send it for approval again."
 *   Actions  Cancel / Continue
 *
 * That covers all three things the sheet's checklist asks of the message: it is
 * clear, it states the consequence, and it requires an acknowledgement before
 * proceeding.
 *
 * The Send for Approval dialog says the same thing in advance - "You can still
 * edit it afterwards, but doing so returns it to draft" - so the user is warned
 * twice, before and at the point of no return.
 *
 * WHAT IS NOT THERE. A payer at Pending Approval offers only View, Edit and
 * Delete: the Send for Approval action is withheld. So the sheet's "attempt to
 * send it again and see 'a pending approval already exists'" cannot happen -
 * the attempt is impossible and unexplained. The guarantee (never two pending
 * requests) is stronger than the sheet asks; the messaging is absent.
 */

/** The withdrawal warning, exactly as rendered. */
export const WITHDRAWAL_WARNING = {
  title: 'Return this payer to draft?',
  awaiting: 'This payer is awaiting approval.',
  consequence: 'Saving this change withdraws that request and returns the payer to draft',
  nextStep: 'you will need to send it for approval again',
} as const;

/** The Send for Approval prompt, which forewarns of the same thing. */
export const SUBMISSION_PROMPT = {
  title: 'Send for approval?',
  reviewerNote: 'This payer and all of its draft changes will be sent to a reviewer.',
  editCaveat: 'You can still edit it afterwards, but doing so returns it to draft.',
} as const;

/** The standard delete confirmation, which mentions no approval at all. */
export const DELETE_PROMPT = {
  title: 'Delete Payer',
  /** The whole message: a question and nothing else. */
  question: 'Do you want to delete',
} as const;

/** Approval-cell text, by the state a payer is in. */
export const APPROVAL_STATE = {
  draft: 'Draft',
  pending: 'Pending Approval',
  published: 'Published',
} as const;

/**
 * The actions a payer's row offers, by its approval state.
 *
 * Verified: a payer awaiting approval loses BOTH the submit action (there is
 * already a request) and its lifecycle actions, keeping only View, Edit and
 * Delete. That is what makes "one pending request at a time" true by
 * construction.
 */
export const ACTIONS_BY_APPROVAL_STATE = {
  pending: {
    offered: ['view', 'edit', 'delete'],
    withheld: ['submit-for-approval', 'inactivate', 'activate'],
  },
} as const;

/** How many pending requests a payer may ever hold. */
export const MAX_PENDING_REQUESTS = 1;

/** A field to edit, and the values to move it between. */
export const EDITED_FIELD = {
  label: 'License Number',
  first: 'LIC-WITHDRAW-A',
  second: 'LIC-WITHDRAW-B',
} as const;

/** The account the restricted-role case needs. */
export const RESTRICTED_ROLE_REQUIREMENT = {
  role: 'a payer role that may view but not edit or delete',
  reason:
    'The case exists to prove the edit and delete controls are withheld from a user who may '
    + 'not change a payer awaiting approval. The shared administrator session holds every '
    + 'permission, so running it as the administrator would assert nothing.',
} as const;
