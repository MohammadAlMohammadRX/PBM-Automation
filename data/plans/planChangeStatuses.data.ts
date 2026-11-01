import { repeatTo } from '../networks/network.data';
import type { RejectionReason } from '../payers/payerTypes';
import { PLAN_VERSION_STATUS } from './plan.data';

/**
 * Test data for US 14337 "Support Pending Approval, Published, Superseded,
 * Rejected, and Withdrawn statuses for plan changes" (plan folder 25).
 *
 * The five statuses are VERSION statuses - read in each plan's Version
 * History (PlanVersionHistoryTab), the lookup PLAN_VERSION_STATUS names. How
 * the sheet's plan changes are reached (2026-10-27):
 * - Pending Approval: a plan sent for approval (planIn 'PendingApproval', or
 *   Send for Approval from the row).
 * - Published / Superseded: approving a later change on a live plan - an
 *   inactivation staged and sent (planIn 'PendingChange'), since a published
 *   plan offers no Edit. planIn 'Inactive' is a plan with both (v-first
 *   Superseded, the approved inactivation Published).
 * - Rejected: a pending change rejected with a reason in Approval Management.
 * - Withdrawn: the requester pulls a pending change back - in this
 *   application by SAVING AN EDIT while it is pending (US 14343: the pending
 *   request is withdrawn and the plan returns to Draft). There is no separate
 *   Withdraw action, so "the withdraw action is unavailable" for a decided
 *   change = no withdraw route is offered on it (no Edit on a published plan,
 *   no pending request to pull back, no Withdraw on its version row).
 * - The sheet's "Plan Administrator" is the administrator (it submits); its
 *   "Approver" is the same administrator deciding; the "plan.admin1" who may
 *   not decide is played by the non-approver account (nonAdminSession).
 * - The sheet's plan names ("Gold / Silver / Bronze Health Plan") are each
 *   case's own provisioned plan.
 */

/** The version statuses with their Arabic labels (the story's acceptance criteria). */
export const STATUS = {
  pendingApproval: { en: PLAN_VERSION_STATUS.pendingApproval, ar: /بانتظار الموافقة/ },
  published: { en: PLAN_VERSION_STATUS.published, ar: /منشور/ },
  // The diacritics (damma, fatha) are optional - a label may be rendered without them.
  superseded: { en: PLAN_VERSION_STATUS.superseded, ar: /مُ?ستبدَ?ل/ },
  rejected: { en: PLAN_VERSION_STATUS.rejected, ar: /مرفوض/ },
  // A withdrawn change returns to Draft - there is no "Withdrawn" status (QA lead, 2026-11-01).
  withdrawn: { en: PLAN_VERSION_STATUS.draft, ar: /مسود/ },
} as const;

/** Approval-cell states. */
export const CELL = { draft: /Draft/, pendingApproval: /Pending Approval/, published: /Published|Approved/, rejected: /Rejected/ } as const;

/** The edit that withdraws a pending change (the sheet's "premium update" / "deductible update"). */
export const EDIT = {
  withdraw: 'Premium update - withdrawn before a decision',
} as const;

/** The managed reason standing in for "Deductible exceeds regulatory cap". */
export const REASON: RejectionReason = 'Policy Violation';

/** The sheet's typed reasons (19292 / 19295). */
export const REASON_TEXT = {
  regulatoryCap: 'Deductible exceeds regulatory cap',
  minimal: '-',
  max: 1000,
  atMax: repeatTo('d', 1000),
} as const;

/** A control that would pull a decided change back. */
export const WITHDRAW = /withdraw|recall/i;

/** A read-only historical view offers nothing to change the version with. */
export const EDITING_ACTION = /edit|save|delete/i;

/** A decision without the approver right. */
export const FORBIDDEN_STATUS = 403;

/** The lifecycle a never-published plan shows. */
export const NOT_LIVE = 'Not Live';

export const CASE = {
  sendToPending: '19289',
  approvePublishes: '19290',
  approveSupersedes: '19291',
  rejectRecordsReason: '19292',
  noWithdrawAfterDecision: '19293',
  arabicLabels: '19294',
  rejectNeedsReason: '19295',
  approverOnly: '19296',
  sendWithdrawResend: '19297',
  supersededViewable: '19298',
} as const;
