import type { RejectionReason } from '../payers/payerTypes';
import type { NetworkBlockedCase } from '../networks/network.data';
import { repeatTo } from '../networks/network.data';

/**
 * Test data for US 14173 "Reject pending plan version back to Rejected"
 * (plan folder 17).
 *
 * How the sheet maps onto the application (2026-10-27):
 * - The decision is taken on the Plan tab of Approval Management (fixture
 *   `planApprovalsPage`), not on the plan detail - the detail offers no
 *   Approve / Reject. "The plan offers a Reject action" = its queued request
 *   offers one; "no Reject action" for a plan that is not pending = the plan has
 *   no request in the queue at all.
 * - The Reject dialog asks for a MANAGED reason (the payer module's list) and
 *   the sheet's typed "comments" go into the dialog's free-text field - a
 *   dialog offering nowhere to type is a finding the comment cases report.
 * - "Approver" is the suite's administrator (the one account that may
 *   decide). The roles the sheet calls "Plan Administrator (non-approver)",
 *   "Read-only viewer" and "Unassigned user" are all played by the suite's one
 *   non-approver account (nonAdminSession, role "Payer Admin", which holds no
 *   approval right): the rule under test is "no approval right -> no decision".
 * - "Two approver sessions" = the same administrator signed in twice
 *   (staleSession), as the network twin (US 14314) does - the stale-decision
 *   rule does not depend on who the second reviewer is.
 * - "J. Smith" is the administrator's display name.
 */
export type PlanBlockedCase = NetworkBlockedCase;

/** The account that decides, as the version history and audit log name it. */
export const APPROVER_NAME = 'CareConnect Admin User';

/** The managed reasons standing in for the sheet's typed ones. */
export const REASON: Record<'rates' | 'pricing' | 'other', RejectionReason> = {
  rates: 'Incorrect Data',
  pricing: 'Incomplete Information',
  other: 'Other',
};

/** The sheet's typed rejection comments. */
export const COMMENT = {
  valid: 'Premium rates do not match filed rate card',
  minimal: 'x',
  revise: 'Rejected so the administrator can revise the plan',
  pricing: 'Pricing inconsistent with product design',
  special: 'Rates <>&"\'; DROP TABLE Plans;-- need revision',
} as const;

/** The comment-length boundaries (19224). */
export const COMMENT_LENGTH = { max: 1000, atMax: repeatTo('r', 1000), overMax: repeatTo('r', 1001) } as const;

/** Version-history / approval-cell states. */
export const STATE = {
  pendingApproval: /Pending Approval/,
  rejected: /Rejected/,
  draftOrRejected: /Rejected|Draft/,
} as const;

/** The lifecycle a never-approved plan shows - it is not live, so not issuable. */
export const NOT_LIVE = 'Not Live';

/** The quick-filter options a rejected plan must NOT appear under (sheet: "Active" and "Pending Approval"). */
export const LIVE_FILTERS = { active: 'Active', pending: 'Pending' } as const;

/** The approval-status option the advanced search offers for rejected plans. */
export const REJECTED_FILTER = 'Rejected';

/** The KPI tiles the sheet expects to move on a rejection. */
export const KPI_TILE = { pendingApproval: /Pending Approval/i, rejected: /Rejected/i } as const;

/** What a second decision on a decided request must say. */
export const ALREADY_DECIDED = /already|no longer pending|decided|not pending/i;

/** A decision without the approver right. */
export const FORBIDDEN_STATUS = 403;

/** "The rejection date matches the time the action was performed" - today's date in the forms the screens use. */
export const todayPattern = (now: Date = new Date()): RegExp => {
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  const mon = now.toLocaleString('en-US', { month: 'short' });
  return new RegExp(`${dd}/${mm}/${yyyy}|${yyyy}-${mm}-${dd}|${now.getDate()} ${mon},? ${yyyy}|${mon} ${now.getDate()},? ${yyyy}`);
};

export const CASE = {
  rejectReturnsForRevision: '19219',
  commentRequired: '19220',
  approverOnly: '19221',
  pendingOnly: '19222',
  editableKeepsFormulary: '19223',
  commentLength: '19224',
  recordsApproverAndTime: '19225',
  confirmationAndRefresh: '19226',
  noDoubleRejection: '19227',
  notMistakenForApproved: '19228',
  auditConsistency: '19229',
  specialCharacters: '19231',
} as const;
