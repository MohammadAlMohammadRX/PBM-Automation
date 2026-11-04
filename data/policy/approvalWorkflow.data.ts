import type { PolicyBlockedCase } from '../../utils/policy/writerCHelpers';
import { FULL_ACCESS } from './policyPermissionCases.data';

/**
 * US 18434 "Policy Approval Workflow" (policy folder 22).
 *
 * Accounts. The administrator is the Compliance Officer WITH the approval
 * permission (it approves its own requests) and the reviewer of other users'
 * requests. The Payer Admin account plays the user WITHOUT the approval
 * permission: its role held the "Policy Approvals" group (Approve/Reject,
 * Approve/Reject all) on 2026-11-03, so those cases withhold it first
 * (fixture `policyApprovalRight`, utils/policy/writerCHelpers.ts) and give the
 * account every policy right (fixture `policyRole`). Its policies belong to a
 * payer in its scope (NUPCO) - the fixture BLOCKS a case that needs a NUPCO
 * network when that payer has none active.
 *
 * Live facts (Foundation notes): the hub's Reject dialog has a reason SELECT +
 * acknowledgement and NO free-text reason; approval of a policy without a
 * network -> 409 "A policy must have at least one assigned network ...", of an
 * INDIVIDUAL policy without a member -> 409 "... at least one enrolled member
 * ..."; a published policy offers NO Edit; every later change is staged as a
 * draft of the next version (badge "v<n> · Draft").
 *
 * Literal readings:
 * - "Open the request" = the policy's row in the approvals hub (Policy tab) and
 *   its detail screen; "status 'Approved'" = the published version's status.
 * - 19722 / 19736 "a written reason": typed in the Reject dialog (the free-text
 *   field appears once the reason select is set, as in the Formulary hub).
 * - 19723 "leave the reason empty": neither a reason nor text is given.
 * - 19725 (TC vs AC): the case edits "the policy itself" of an APPROVED
 *   request; the AC speaks of modifying a change request. A published policy
 *   offers no Edit - asserted as the case words it.
 * - 19726 adds a member, 19727 removes the network, 19728 adds a document on an
 *   approved (Future) policy; each must leave the version badge at "Draft".
 * - 19730 "an empty Member list": an Individual policy with no member (a Group
 *   policy is approved with none - a finding of the Foundation notes).
 * - 19733 / 19734: the direct action reuses the request id captured while the
 *   request was pending (approved / withdrawn to Draft since).
 * - 19735: roles x states = the administrator and the Payer Admin without the
 *   approval permission, on Draft, Pending Approval, Approved and Rejected
 *   policies of the scoped payer.
 */
export const CASES = {
  selfApproveWithRight: { azureId: '19718' },
  selfApproveWithoutRight: { azureId: '19719', shape: FULL_ACCESS },
  approveOthers: { azureId: '19720', shape: FULL_ACCESS },
  noRightOthers: { azureId: '19721', shape: FULL_ACCESS },
  rejectWithReason: { azureId: '19722', reason: 'Network assignment does not match regional compliance requirements' },
  rejectEmptyReason: { azureId: '19723' },
  rejectBlankReason: { azureId: '19724', reason: '   ' },
  editPolicyToDraft: { azureId: '19725', gracePeriod: '9' },
  memberToDraft: { azureId: '19726', relationship: 'Child' },
  networkToDraft: { azureId: '19727' },
  documentToDraft: { azureId: '19728', title: 'Policy_Guidelines_v2', file: 'Policy_Guidelines_v2.pdf' },
  resendAfterDraft: { azureId: '19729' },
  needsMember: { azureId: '19730' },
  needsNetwork: { azureId: '19731' },
  memberAndNetwork: { azureId: '19732' },
  alreadyApproved: { azureId: '19733' },
  rejectNotPending: { azureId: '19734' },
  rolesAndStates: { azureId: '19735', shape: FULL_ACCESS },
  auditTrail: { azureId: '19736', reason: 'Missing updated documentation' },
} as const;

/** The approval prerequisites the server names (409). */
export const NEEDS = { member: /at least one (enrolled )?member/i, network: /at least one (assigned )?network/i } as const;
/** What a refused duplicate / ineligible decision should say. */
export const ALREADY_DECIDED = /already (been )?approved|no longer pending|not pending|already (been )?(decided|processed)/i;
export const NOT_ELIGIBLE = /not (eligible|pending)|no longer pending|cannot be rejected|only pending/i;
/** A required-reason validation. */
export const REASON_REQUIRED = /required|enter a (valid )?reason|provide a reason/i;

export const BLOCKED_CASES: PolicyBlockedCase[] = [
  {
    azureId: '19737',
    title: 'should notify the submitter when their policy change is approved or rejected',
    reason:
      'Needs the SUBMITTER\'s notification channel ("submitter@neorx.co", a registered e-mail / in-app channel) to be read after '
      + 'the decision. The suite has no mailbox for the submitting account, and the in-app notifications feed of the approval '
      + 'workflow was not exposed for policies on 2026-11-03. Runnable once a test mailbox or the policy decision notifications '
      + 'are available to the suite.',
  },
];
