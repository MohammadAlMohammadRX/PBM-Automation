import { repeatTo } from '../networks/network.data';
import { PLAN_LIFECYCLE } from './plan.data';
import { ALREADY_DECIDED, APPROVER_NAME, FORBIDDEN_STATUS, todayPattern, type PlanBlockedCase } from './rejectPendingPlanVersion.data';

/**
 * Test data for US 14174 "Approve pending plan version to activate"
 * (plan folder 18).
 *
 * The decision is taken on the Plan tab of Approval Management, as for
 * rejections (data/plans/rejectPendingPlanVersion.data.ts, which also explains
 * how the sheet's roles and "two approver sessions" are played). An approved
 * plan whose effective time has passed turns Active (the lifecycle job runs
 * every minute here), so "Reopen the plan - Active" is polled.
 *
 * "A later revision of the plan" / "a new version": a published plan offers
 * no Edit (live fact, 2026-10-27). The changes the screens DO let a user start
 * on it go through the approval gate - an inactivation (then an activation)
 * staged and sent for approval, or a formulary reassignment on the Formulary
 * tab - and those are what the revision cases use. "M. Lee" is the
 * administrator's display name.
 */
export { ALREADY_DECIDED, APPROVER_NAME, FORBIDDEN_STATUS, todayPattern };

/** The sheet's approval comments. */
export const COMMENT = {
  asSubmitted: 'Approved as submitted',
  firstApproval: 'First approval of the plan',
  filing: 'Meets all filing requirements',
  approved: 'Approved by the automated approval case',
} as const;

/** The comment-length boundaries (19237). */
export const COMMENT_LENGTH = { max: 1000, atMax: repeatTo('a', 1000), overMax: repeatTo('a', 1001) } as const;

/** A version entry approved without a comment shows nothing (or a dash) for it. */
export const BLANK_COMMENT = /^\s*[-—]?\s*$/;

/** States. */
export const STATE = {
  draft: /Draft/,
  pendingApproval: /Pending Approval/,
  published: /Published|Approved/,
  superseded: /Superseded/,
} as const;

export const LIFECYCLE = { active: PLAN_LIFECYCLE.active, inactive: PLAN_LIFECYCLE.inactive } as const;

/** How long an approved plan may take to read Active / Inactive (the lifecycle job runs every minute). */
export const LIFECYCLE_WAIT_MS = 4 * 60_000;

/** The KPI tile the sheet expects to drop on an approval (the band has Total / Active / Future / Inactive / Expired). */
export const PENDING_APPROVAL_TILE = /Pending Approval/i;

export const CASE = {
  approveActivates: '19230',
  permanentCode: '19232',
  noComment: '19233',
  approverOnly: '19234',
  pendingOnly: '19235',
  recordsApproverCommentTime: '19236',
  commentLength: '19237',
  activeOnlyViaApproval: '19238',
  confirmationAndRefresh: '19239',
  codeNeverChanges: '19240',
  noDoubleActivation: '19241',
  policyIssuance: '19242',
} as const;

export const BLOCKED_CASES: PlanBlockedCase[] = [
  {
    azureId: CASE.policyIssuance,
    title: 'should offer the plan for selection in policy issuance when it has just been approved and is Active',
    reason:
      'Needs the policy-issuance workflow with its plan selector. The Policies module this suite drives '
      + '(pages/policy/PolicyManagementPage.ts) is a read-only list - no issuance flow or plan selection is '
      + 'reachable in this environment, so whether a newly approved plan is offered there cannot be observed. '
      + 'Runnable once policy issuance (or its plan-selection lookup) is available to the administrator account.',
  },
];
