import { PAYER_ADMIN_ROLE } from '../accounts/payerAdminRole.data';
import { APPROVER_NAME, FORBIDDEN_STATUS, type PlanBlockedCase } from './rejectPendingPlanVersion.data';

/**
 * Test data for US 14340 "Prevent a plan change requester from approving their
 * own change" (plan folder 26).
 *
 * The environment has TWO accounts: the administrator (the only one that may
 * decide - it also submits every change the suite provisions) and the
 * non-admin "Payer Admin" (scoped to "Al Dawaa 2" / "NUPCO", no approval right).
 * The sheet's users are played as follows:
 * - "User A holds the approval permission and submitted the change" = the
 *   administrator: it submits through planIn and is then asked to decide its
 *   own request (self-approval must be blocked).
 * - "User A submits, independent User B approves" = the NON-ADMIN submits a
 *   plan of a payer in its own scope (fixture `planSubmittedFrom`, BLOCKED with
 *   the reason when that payer has no Active formulary or the account may not
 *   create / submit plans) and the administrator, who did not submit it,
 *   decides it.
 * - "User C without the approval permission" = the non-admin account.
 * - "Pending Review" on the sheet = "Pending Approval" here; "Approved" =
 *   Published / Approved.
 * Cases needing a THIRD account, or the approval permission granted to the
 * submitter mid-review, are BLOCKED below with the exact account they need.
 */
export { APPROVER_NAME, FORBIDDEN_STATUS };

/** The payer the non-admin submits its plan for - one of the payers in its own scope. */
export const SUBMITTER_PAYER = 'Al Dawaa 2';

/** The "supporting details" of the change the non-admin submits (19320). */
export const SUPPORTING_DETAILS = 'Submitted by the requester for independent review (PC-2002).';

/** The general submitter role of this environment (the sheet's "Requester"). */
export const REQUESTER_ROLE = PAYER_ADMIN_ROLE;

/**
 * "Approve plan changes" (الموافقة على تغييرات الخطة) as the role catalogue may
 * show it: the intended bilingual names, then plausible raw codes. INFERRED
 * 2026-10-27, not yet verified live - the catalogue shows most permissions
 * under their codes (see data/accounts/payerAdminRole.data.ts).
 */
export const APPROVE_PLAN_PERMISSION = ['Approve plan changes', 'الموافقة على تغييرات الخطة', 'ApprovePlanChanges', 'ApprovePlan'] as const;

/** States. */
export const STATE = {
  pendingReview: /Pending Approval/,
  approved: /Approved|Published/,
} as const;

export const CASE = {
  independentApproves: '19311',
  selfApproveBlocked: '19312',
  selfRejectBlocked: '19313',
  noPermissionDenied: '19314',
  laterGrantStillBlocked: '19315',
  onlySubmitterExcluded: '19316',
  approvedOnlyByIndependent: '19317',
  permissionOnlyOnReviewers: '19318',
  noBypass: '19319',
  endToEndRouting: '19320',
} as const;

export const BLOCKED_CASES: PlanBlockedCase[] = [
  {
    azureId: CASE.laterGrantStillBlocked,
    title: 'should still block the requester from approving their own earlier submission when they are granted reviewer rights later',
    reason:
      'Needs a submitter account that can be GRANTED the plan-approval permission ("Approve plan changes" / '
      + 'الموافقة على تغييرات الخطة) while its change is pending. The only non-admin account ("Payer Admin") holds no '
      + 'plan-approval permission and the role catalogue entry for it is not known (no PLAN_PERMISSION key for it '
      + 'in data/accounts/payerAdminRole.data.ts, not verified live); the administrator already holds every right, '
      + 'so "granted later" cannot be staged. Runnable with a second approver-capable account, or once the '
      + 'permission\'s catalogue label is verified so shapedNonAdmin({ with: [...] }) can grant it.',
  },
  {
    azureId: CASE.onlySubmitterExcluded,
    title: 'should exclude only the submitter and let any other approver decide when several reviewers hold the permission',
    reason:
      'Needs THREE accounts holding the plan-approval permission (submitter A, reviewers B and D). The environment '
      + 'has one approver (the administrator) and one non-admin without approval rights, so a second and third '
      + 'independent approver do not exist. Runnable once two more approver accounts are provisioned.',
  },
];
