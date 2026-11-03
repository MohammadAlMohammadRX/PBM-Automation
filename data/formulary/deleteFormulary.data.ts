import type { FormularyBlockedCase } from './formulary.data';
import { NON_ADMIN_PROFILE } from '../accounts/nonAdminAccount.data';

/**
 * US 15213 "Delete Formulary" (formulary folder 16).
 *
 * How deletion works in this build (foundation notes, 2026-11-02): a
 * never-approved (v0) formulary is discarded at once; a PUBLISHED one has its
 * deletion saved as a draft ("The deletion has been saved as a draft. Send it
 * for approval when you are ready.") - the formulary rule that nothing goes
 * live until it is sent for approval (US 15192). So the sheet's "submit a
 * deletion request" is Delete (+ its prompt) followed by Send for Approval,
 * and "Pending Deletion Approval" is the formulary awaiting that approval
 * (`v<n> · Pending Approval` with a deletion change). A deletion reason, a
 * Withdraw action and a plan-assignment count are asserted as the sheet states them.
 *
 * Formularies are the case's own: Future (approved, no plan) unless the case
 * needs a live one; "assigned to a plan" is an Active plan carrying it
 * (planIn('Active', { formularyId }) - left in place by the plan fixture, so
 * that formulary stays too). The restricted users are the Payer Admin account
 * shaped to the formulary read rights (writerAHelpers.formularySession) on a
 * formulary of its own payer.
 */

/** The sheet's message for a formulary assigned to a plan. */
export const ASSIGNED_MESSAGE = 'This formulary cannot be deleted because it is assigned to one or more plans.';

/** A plan-assignment count of zero / of one, as the detail page would show it. */
export const planCountShown = (count: number): RegExp => new RegExp(`\\bplans?\\b[^\\d]{0,40}\\b${count}\\b|\\b${count}\\b\\s*(assigned )?plans?\\b`, 'i');

export const DELETE_MESSAGE = {
  inUse: /in use|assigned|plan/i,
  alreadyPending: /already|pending|awaiting|in progress/i,
  pendingDeletion: /pending|delet|awaiting/i,
  denied: /permission|not authori[sz]ed|access denied|forbidden|not allowed|denied/i,
  required: /required|reason/i,
  deleted: /delet/i,
  withdraw: /withdraw/i,
} as const;

export const REASON = 'No longer in use';

export const CASES = {
  unassigned: { azureId: '18796' },
  assignedBlocked: { azureId: '18797' },
  onePlanBlocks: { azureId: '18798' },
  zeroPlans: { azureId: '18799' },
  approved: { azureId: '18800' },
  rejected: { azureId: '18801' },
  viewerCannotDelete: { azureId: '18803', payer: NON_ADMIN_PROFILE.scopedPayers[0] },
  nonApprover: { azureId: '18804', payer: NON_ADMIN_PROFILE.scopedPayers[0] },
  secondRequest: { azureId: '18805' },
  noNewPlan: { azureId: '18806' },
  reasonRequired: { azureId: '18807' },
  withdraw: { azureId: '18808' },
  reCheck: { azureId: '18809' },
  logical: { azureId: '18810' },
} as const;

export const BLOCKED_CASES: FormularyBlockedCase[] = [
  {
    azureId: '18802',
    title: 'should complete the deletion workflow with the requester and a separate approver both recorded in the audit trail',
    reason:
      'Needs two accounts: a Formulary Administrator who submits the deletion and a separate approver who logs in to '
      + 'decide it ("admin1" / "approver1"). This environment has one administrator, which approves its own requests, '
      + 'and the only other account (Payer Admin) holds no approval rights - so "log out and log in as the approver" '
      + 'cannot be performed and the audit trail cannot show two different people. Runnable once an approver account '
      + 'separate from the administrator is configured.',
  },
];
