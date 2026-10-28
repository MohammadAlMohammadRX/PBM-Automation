import type { RejectionReason } from '../payers/payerTypes';
import { FORBIDDEN_STATUS } from './rejectPendingPlanVersion.data';
import { SUBMITTER_PAYER } from './selfApprovalPrevention.data';

/**
 * Test data for US 14343 "Manage conflicting requests during the approval
 * workflow" (plan folder 28).
 *
 * How the sheet's situations are reached (2026-10-27):
 * - "A plan with a change Pending Approval" on which a NEW change is started
 *   (MSG-PLN-040) = a live plan with a staged change already sent
 *   (planIn 'PendingChange'). A never-approved plan in Pending Approval is the
 *   other kind: there an EDIT is allowed and withdraws the request (MSG-PLN-041),
 *   so that is what the edit / delete / withdraw cases use (planIn
 *   'PendingApproval').
 * - "Initiate a new change" on a Published / Approved plan = the one change
 *   the screens let a user start on a live plan, a staged inactivation
 *   (PlanManagementPage.attemptNewChange) - a published plan offers no Edit.
 *   On a Draft or Rejected plan it is an Edit (PlanManagementPage.stageEdit).
 * - The sheet's plan codes ("PLN-01" ... "PLN-08") are each case's own plan.
 * - MSG-PLN-040/041/042/044 texts are not in the sheet; they are matched by
 *   meaning (patterns below) until the exact wording is confirmed live.
 * - 19360: the "Plan Administrator who submitted" is the non-admin account
 *   (fixture planSubmittedFrom), the "Approver" the administrator.
 */
export { FORBIDDEN_STATUS, SUBMITTER_PAYER };

/** MSG-PLN-040 - a change is already awaiting approval. */
export const MSG_040 = /already (awaiting|pending)|awaiting approval|pending approval/i;
/** MSG-PLN-041 - saving an edit withdrew the pending request; the plan is a draft again. */
export const MSG_041 = /withdr[ae]wn?|returned to draft|back to draft/i;
/** MSG-PLN-042 - deleting the plan withdrew its pending request. */
export const MSG_042 = /withdr[ae]wn?/i;
/** MSG-PLN-044 - a rejection needs a reason. */
export const MSG_044 = /reason[^.]*required|required[^.]*reason|provide a reason|reason is mandatory/i;

/** MSG-PLN-040 must point at the pending request it is protecting. */
export const MENTIONS_PENDING = /pending|awaiting/i;

/** The managed reason standing in for the sheet's typed ones. */
export const REASON: RejectionReason = 'Incorrect Data';

/** The sheet's typed rejection reasons. */
export const REASON_TEXT = {
  formularyMismatch: 'Formulary mismatch with payer contract',
  single: 'a',
  spaces: '   ',
  whitespace: '     ',
  short: 'No formulary available',
} as const;

/** How many rapid whitespace-only rejections 19357 sends. */
export const RAPID_ATTEMPTS = 3;

/** The edits the sheet saves on pending / draft / rejected plans. */
export const EDIT = {
  attribute: 'Edited while the change was pending approval',
  minor: 'A minor edit before deleting the plan',
  draft: 'A new change started on a draft plan',
  rejected: 'A new change started on a rejected plan',
} as const;

/** Approval-cell / version states. */
export const STATE = {
  draft: /Draft/,
  pendingApproval: /Pending Approval/,
  rejected: /Rejected/,
} as const;

export const CASE = {
  newChangeAllowed: '19348',
  newChangeBlocked: '19349',
  rulePerStatus: '19350',
  zeroVersusOne: '19351',
  editWithdraws: '19352',
  deleteWithdraws: '19353',
  rejectNoReasonBlocked: '19354',
  rejectWithReason: '19355',
  reasonBoundary: '19356',
  noForcedRejection: '19357',
  editThenDelete: '19358',
  clearlyShown: '19359',
  noSelfDecision: '19360',
} as const;
