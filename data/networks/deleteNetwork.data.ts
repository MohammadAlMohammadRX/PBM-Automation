import type { NetworkBlockedCase } from './network.data';

/**
 * Test data for US 14137 "Delete a network, subject to approval when live".
 *
 * Verified 2026-10-21: the row and header Delete raise "Delete Network - Do you
 * want to delete {name}?" (No / Yes); a never-approved draft answers "The draft
 * network has been discarded." and leaves the list. What a PUBLISHED network's
 * deletion does is the story's subject and is asserted per the sheet.
 *
 * "A live network with no dependencies" is provisioned as an APPROVED network
 * with no facility, effective two days out (state Pending): an Active network
 * needs a pharmacy to go live, so an Active one can never be dependency-free.
 * If the application refuses to approve a facility-less network the fixture
 * reports BLOCKED, naming that refusal.
 */

export const CASE = {
  draftDiscarded: '17956',
  liveWorkflow: '17957',
  facilityBoundary: '17959',
  facilityMessage: '17961',
  selfApproval: '17963',
  confirmCancel: '17964',
  logicalDeletion: '17966',
  reviewerOnly: '17967',
  rejection: '17965',
  noPermission: '17968',
  crossModule: '17969',
} as const;

/** The queue's change type for a deletion request. */
export const DELETE_CHANGE_TYPE = 'Delete';

/** A blocker message naming facilities. */
export const FACILITY_BLOCKER = /facilit|pharmac/i;

/** The audit action a deletion should leave. */
export const DELETE_AUDIT_ACTION = /delet/i;

/** The pending states a staged deletion's approval cell may read. */
export const STAGED_APPROVAL_CELL = /Draft|Pending Approval/;

const POLICY_REASON =
  'Needs a network that holds linked policies AND may receive a deletion attempt. Every policy-linked network in this '
  + 'environment is a shared team record: if the blocker failed, the attempt would stage a real deletion of it. A '
  + 'suite-owned network cannot be given a policy (policies are linked from the Policy module, on shared payers). '
  + 'Unblocked by a seeded automation network with a linked test policy.';

export const BLOCKED_CASES: NetworkBlockedCase[] = [
  {
    azureId: '17958',
    title: 'should discard, stage or block a deletion according to approval history and dependencies when each combination is deleted',
    reason: `The decision table's (Live, Policies) row: ${POLICY_REASON}`,
  },
  {
    azureId: '17960',
    title: 'should block deletion with the right message when a network has facilities only, policies only, both or neither',
    reason: `The policies-only and both partitions: ${POLICY_REASON}`,
  },
  {
    azureId: '17962',
    title: 'should block deletion with a message naming policies when the network has linked policies',
    reason: POLICY_REASON,
  },
];
