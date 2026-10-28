import { PLAN_LIFECYCLE } from './plan.data';
import { PLAN_SUITE } from './planSuite.data';
import { ALREADY_DECIDED, APPROVER_NAME, type PlanBlockedCase } from './rejectPendingPlanVersion.data';
import type { RejectionReason } from '../payers/payerTypes';

/**
 * Test data for US 14153 "Delete a plan, gated by approval once it has gone
 * live" (plan folder 05).
 *
 * A never-approved plan (Draft "Not Live", or Pending Approval of its first
 * version) is discarded outright; a published one (Active, Expired) has its
 * deletion staged and sent for approval, and leaves the directory only once a
 * reviewer approves it - the network module's rule (tests/network/18). Every
 * plan is the case's own; the reviewer is the administrator.
 *
 * Linked policies: the Policies module has no provisioning helper in this
 * suite and a case-owned plan carries no policy, so the policy-blocker cases are
 * BLOCKED below.
 */
export const CASE = {
  draftDiscarded: '19003',
  liveGated: '19004',
  approvedRemoves: '19006',
  rejectedKeeps: '19007',
  everyStatus: '19009',
  alreadyDeleted: '19011',
  duplicateRequests: '19012',
  auditDetails: '19013',
  kpiConsistent: '19014',
} as const;

export { ALREADY_DECIDED, APPROVER_NAME };

export const SUITE_PAYER = PLAN_SUITE.payerName;

export const LIFECYCLE = PLAN_LIFECYCLE;

/** The approval queue's change type for a deletion. */
export const DELETE_CHANGE_TYPE = 'Delete';

/** The sheet's rejection reason "Plan still in use" - the closest managed reason (19007). */
export const REJECTION_REASON: RejectionReason = 'Change Not Required';

/** What a deleted plan's URL shows (19011). */
export const PLAN_NOT_FOUND = /not found|no longer exists|does not exist|unable to load/i;

/** System audit log entries a deletion and its decision leave (19006, 19013). */
export const AUDIT_LOG_ACTION = {
  deletion: /Delete/i,
  decision: /Approv|Delete/i,
} as const;

/** "The plan's prior status" the compliance checklist asks the deletion entry to carry (19013). */
export const PRIOR_STATUS = new RegExp(PLAN_LIFECYCLE.active, 'i');

export const BLOCKED_CASES: PlanBlockedCase[] = [
  {
    azureId: '19005',
    title: 'should block the deletion with a linked-policy message when the plan has a linked policy',
    reason: 'Needs a plan with a linked policy (POL-01): no policy can be linked to a case-owned plan - the suite has no '
      + 'Policies provisioning helper and a policy also needs members and a holder. Needs a seeded plan with one linked policy '
      + '(and the right to unlink it) in the suite payer\'s scope.',
  },
  {
    azureId: '19008',
    title: 'should let only authorized users initiate or approve a deletion when users without the rights try',
    reason: 'Needs signed-in accounts WITHOUT plan deletion / approval rights: the only non-administrator (Payer Admin) is '
      + 'scoped to "Al Dawaa 2" / "NUPCO", and the role-shaping catalogue (data/accounts/payerAdminRole.data.ts) has no Plans '
      + 'permission keys, so shapedNonAdmin cannot withhold Delete Plan or Approve. Needs a "Viewer" account in the suite '
      + 'payer\'s scope, or the Plans permissions added to the role catalogue.',
  },
  {
    azureId: '19010',
    title: 'should still block the deletion when the linked policy expires on the request date',
    reason: 'Needs a plan linked to a policy whose expiry date is TODAY (POL-02): no policy can be linked to a case-owned plan '
      + '(no Policies provisioning helper), and a policy expiring today must be seeded the day before. Needs that seeded plan '
      + 'and policy pair.',
  },
];
