/**
 * Test data for "Re-validate Network Selection at Approval Time".
 *
 * WHAT THE APPLICATION OFFERS, verified before these cases were written:
 *
 *   The Assign Network drawer is a MULTI-SELECT, opened from a payer's Linked
 *   Networks section, and it states its own rule: "Assigning or removing a
 *   network is submitted for approval and takes effect once a reviewer approves
 *   it."
 *
 *   The drawer's list holds only networks that belong to no payer. That is the
 *   mechanism behind most of this story: a network already claimed by another
 *   payer is not offered, so the "blocked submission" the sheet describes is
 *   prevented earlier and more firmly than it asks for.
 *
 *   A payer's Linked Networks table carries an ASSIGNMENT STATE per row,
 *   separate from the network's own status - "Pending Removal" was read off a
 *   live row - which is what makes the four-state lifecycle observable.
 *
 * THE POOL IS EXHAUSTED IN THIS ENVIRONMENT, and that shaped the fixtures more
 * than anything else: every earlier dependency test linked a network to a payer
 * that then could not be deleted, so no link was ever released. The
 * `assignableNetwork` fixture refills the pool by submitting and approving a
 * removal - the same flow TC-005 asserts - rather than letting the whole story
 * report BLOCKED.
 */

/**
 * The assignment states a linked network moves through.
 *
 * "Pending Removal" was read from a live row; the others are the states the
 * sheet names for the same column. Where a case cannot verify the exact word it
 * asserts the TRANSITION instead - that the state changed, and that the link
 * survived until approval - which is the requirement rather than the wording.
 */
export const ASSIGNMENT_STATE = {
  pendingAddition: 'Pending Addition',
  assigned: 'Assigned',
  pendingRemoval: 'Pending Removal',
  unassigned: 'Unassigned',
} as const;

/** The drawer's own statement of the maker-checker rule. */
export const ASSIGNMENT_CAVEAT = 'submitted for approval';

/** The change type an assignment appears under in the approvals queue. */
export const ASSIGNMENT_CHANGE_TYPE = 'Update';

/**
 * What "nothing to submit" looks like.
 *
 * The sheet expects a message saying there is nothing to submit when the net
 * selection matches the current assignment. The drawer's own gate is its
 * primary action: it stays disabled until the selection differs from what is
 * already linked. Each case asserts the gate AND looks for the message, so a
 * silent-but-correct refusal is reported as such rather than passed over.
 */
export const NO_CHANGE = {
  expectSubmitDisabled: true,
  /** Any of these, in any of the app's messaging surfaces, would satisfy the sheet. */
  messagePatterns: [/nothing to submit/i, /no changes/i, /no net change/i] as const,
} as const;

/**
 * What a re-validated conflict must tell the user, per the sheet's checklist:
 * the conflicting network by name, the reason, and a next step.
 */
export const CONFLICT_MESSAGE_CHECKLIST = {
  namesNetwork: 'the conflicting network by name',
  statesReason: 'why it cannot be applied',
  offersNextStep: 'what to do about it',
} as const;

/** Statuses a rejected approval must not answer with. */
export const UNACCEPTABLE_APPROVAL_STATUSES = [500] as const;

/** Substrings an error shown to a client must never carry. */
export const LEAK_MARKERS = ['StackTrace', 'System.', '/src/'] as const;

/**
 * Why the network-deletion conflict case is not automated here.
 *
 * The sheet has an administrator DELETE the network while an assignment request
 * is pending. Deleting a network is irreversible, and this environment's
 * assignable pool is already empty - the deletion would remove the only record
 * the rest of this story runs on, and nothing in the suite could put it back.
 * The case is reported BLOCKED with this reason rather than run.
 */
export const DELETION_CONFLICT_BLOCKER = {
  reason:
    'The case requires deleting a network while an assignment request is pending. Deletion is '
    + 'irreversible and this environment holds only one assignable network, so running it would '
    + 'destroy the precondition every other case in this story depends on and could not be '
    + 'undone. Provision a disposable network in Network Management, then re-run this case.',
} as const;

/** The account the restricted-role case needs. */
export const RESTRICTED_ROLE_REQUIREMENT = {
  role: 'a payer role without network-assignment rights',
  reason:
    'The case exists to prove the assignment controls are withheld from a user who may view a '
    + 'payer but not change its networks. The shared administrator session holds every '
    + 'permission, so running it as the administrator would assert nothing.',
} as const;
