
/**
 * Test data for "Re-check Network Removal Dependency at Both Staging and
 * Approval".
 *
 * The positive path is REACHABLE, and running it is also the remedy every
 * network story has been asking for: the register holds payers whose network
 * removal was submitted and never decided, on networks with zero policies.
 * Approving one carries a dependency-free removal through both checkpoints
 * AND frees a network for the assignable pool. The rejection-and-resubmission
 * workflow rides the same candidates.
 *
 * Every case that needs a network WITH dependent policies - the blocked
 * staging, the approval-time re-check after a policy is added, the boundary
 * at the instant of expiry, the matrix - needs policies created against the
 * network, which is the Policies module and outside this framework. Those are
 * listed in BLOCKED_CASES.
 */

/** What the Network list's Policies cell must read for a dependency-free network. */
export const NO_DEPENDENT_POLICIES = '0';

/** How the Network list marks a network that no payer owns. */
export const UNOWNED_MARKER = /^[-—–]$/;

/** The row action through which a removal is staged. */
export const UNASSIGN_ACTION = 'unassign';

/** The account the approver-role case needs. */
export const APPROVER_ROLE_REQUIREMENT = {
  role: 'a requester account without approval rights, alongside an approver account',
  reason:
    'The case proves only the approver role can decide a removal request. The shared '
    + 'administrator both submits and approves, so it cannot show the refusal.',
} as const;
