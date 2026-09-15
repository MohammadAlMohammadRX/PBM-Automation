import type { BlockedCase } from './payerTypes';

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

const NEEDS_DEPENDENT_POLICY =
  'This case needs a linked network with at least one ACTIVE policy referencing it. No linked '
  + 'network here carries a policy (the Network list shows 0 for each), and policies are created '
  + 'in the Policies module, outside this framework. Provide such a network and re-run.';

/** The sheet's cases this environment cannot exercise, in renumbered order. */
export const BLOCKED_CASES: readonly BlockedCase[] = [
  {
    id: '002',
    title: 'should block the removal at staging when active policies depend on the network',
    reason: NEEDS_DEPENDENT_POLICY,
  },
  {
    id: '003',
    title: 'should decide the removal consistently when a policy expires at the instant of submission',
    reason:
      `${NEEDS_DEPENDENT_POLICY} The boundary also needs a policy end time aligned to the `
      + 'submission instant - a manual, clock-controlled check.',
  },
  {
    id: '004',
    title: 'should block the removal at approval when a new active policy was created after staging passed',
    reason: `${NEEDS_DEPENDENT_POLICY} The policy must be created between staging and approval.`,
  },
  {
    id: '005',
    title: 'should apply the right outcome for each combination of staging result and interim policy change',
    reason: `${NEEDS_DEPENDENT_POLICY} The matrix needs four networks in the four combinations.`,
  },
  {
    id: '007',
    title: 'should handle a policy created concurrently during the approval action',
    reason: `${NEEDS_DEPENDENT_POLICY} The policy must be created in the approval window itself.`,
  },
  {
    id: '008',
    title: 'should let only the approver role approve or reject a removal request',
    reason:
      `The refusal half is shown by the permissions story (the configured non-admin account, a Payer Admin, is offered no Payer approval queue); the removal-specific half needs a PENDING removal request to decide, which needs a free network. ${APPROVER_ROLE_REQUIREMENT.reason}`,
  },
  {
    id: '009',
    title: 'should behave consistently across mixed dependency states in an exploratory session',
    reason: `${NEEDS_DEPENDENT_POLICY} The session needs networks with and without dependencies side by side.`,
  },
  {
    id: '010',
    title: 'should record the audit trail and error message for a removal that was blocked',
    reason: `${NEEDS_DEPENDENT_POLICY} A blocked removal cannot arise without one.`,
  },
  {
    id: '012',
    title: 'should allow the removal when the network\'s only policies are Draft, Expired or Cancelled',
    reason:
      `${NEEDS_DEPENDENT_POLICY} This partition needs one policy in each non-active state and `
      + 'none active.',
  },
];
