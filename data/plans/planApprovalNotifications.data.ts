import { APPROVER_NAME } from './rejectPendingPlanVersion.data';
import { ORIGINAL_DESCRIPTION, EDIT_PLAN, edited } from './editPlanAttributes.data';
import { PLAN_APPROVAL_CELL, PLAN_MESSAGE } from './plan.data';
import { MSG_041 } from './conflictingApprovalRequests.data';

/**
 * Test data for the two plan NOTIFICATION cases that were Manual until
 * 2026-11-08 (notification cases were Manual by the QA lead's 2026-10-27 rule;
 * the user asked on 2026-11-08 for them to be automated):
 *  - 18963 (US 14146, plan folder 02) - sending a saved draft for approval
 *    notifies the reviewer;
 *  - 19361 (US 14343, plan folder 28) - withdrawing a pending request (an edit
 *    saved on it) clears it from the approver's queue AND notifications.
 *
 * HOW NOTIFICATIONS WORK HERE (Foundation-Notes.md, verified 2026-11-08):
 * nothing is notified unless an active NOTIFICATION DEFINITION exists for the
 * module action; its audience decides who receives it. So each case creates
 * its own suite definition ("QA Automation Notification ...") for the plan
 * module's "needs approval" action, addressed to the REVIEWER, and deletes it
 * after. The reviewer / approver is the administrator ("CareConnect Admin
 * User") - the one account here that approves plan changes; it is also the
 * maker of the change (the suite's usual set-up), so the reviewer's
 * notifications are read from the administrator's own inbox (GetMyNotifications).
 */

export const CASES = {
  reviewerNotified: { azureId: '18963' },
  withdrawalClearsNotifications: { azureId: '19361' },
} as const;

/** The reviewer the definition is addressed to. */
export const REVIEWER_NAME = APPROVER_NAME;

/** 18963 - the plan starts as a draft with a known description, then gets a private draft change. */
export const DRAFT_PLAN = { ...EDIT_PLAN, descriptionEn: ORIGINAL_DESCRIPTION };
export const draftChange = (): string => edited('Private draft change before sending');

/** 19361 - the edit that withdraws the pending request. */
export const withdrawingEdit = (): string => edited('Edited to withdraw the pending request');

/** How long a notification may take to arrive (it is raised by the submission). */
export const NOTIFICATION_WAIT_MS = 90_000;

export const APPROVAL = PLAN_APPROVAL_CELL;
export const SUBMITTED_MESSAGE = PLAN_MESSAGE.submittedShown;
export { MSG_041 };
