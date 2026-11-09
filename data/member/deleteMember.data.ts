import type { MemberShape } from './memberPermissions.data';

/**
 * US 14385 "Delete Member" (member folder 10).
 *
 * How deletion works in this build (Member-Foundation-Notes.md, "Delete"):
 * Delete (row / card / the view page's breadcrumb) -> `#pbm-dialog` "Delete
 * Member ID / Do you want to delete {name}?" (No / Yes, the X closes it). Yes ->
 * DELETE DeleteMember/{id} -> toast "Member deleted / The member has been
 * deleted."; from the view page back to the list. A SOFT delete (GetMember 404,
 * gone from the list and the tiles; the audit trail keeps an UPDATE entry).
 * Refused with 409 "Member cannot be deleted because they have active policy
 * enrollments." once an enrolment is APPROVED (even on a Future policy). No
 * approval workflow.
 *
 * Literal readings / decisions:
 * - "System Administrator" / "Compliance" user: the administrator (no such
 *   accounts - writers brief). "MEM-1001" etc.: the case's own suite member.
 * - 19904 "an active policy enrolment": an APPROVED enrolment in a suite policy
 *   (status Future - no policy can be made Active on demand; the delete rule
 *   counts approved enrolments). "showing associated enrolments": the policy on
 *   the member's PBM Accumulator Dashboard tab. "evaluates the enrolment count
 *   before deletion": not observable - the confirmation is shown and nothing is
 *   sent before it is answered.
 * - 19905 "has just been deleted": deleted through the API in the precondition;
 *   "the count reflects the exclusion": the Total Members tile is one lower than
 *   before the delete.
 * - 19906 "closing the dialog, pressing Cancel, or navigating away": all three
 *   (No, Esc, the X, then leaving the page with the dialog open).
 * - 19907 "Member Administrator (no delete permission)": the Payer Admin shaped
 *   without DeleteMember (`memberRole`); BLOCKED with the evidence when the role
 *   edit does not reach the account or the account cannot see the member.
 * - 19909 "the entry shows who performed the deletion and when, alongside prior
 *   changes": the member's trail (Audit Logs, entity Member) after an earlier
 *   edit; the deletion entry must read as a deletion. KNOWN FINDING: every
 *   member action is logged as UPDATE.
 */
export const CASES = {
  deleteUnenrolled: { azureId: '19903' },
  blockedByEnrolment: { azureId: '19904' },
  excludedFromList: { azureId: '19905' },
  cancelDeletion: { azureId: '19906' },
  noDeletePermission: { azureId: '19907', shape: { without: ['delete'] } as MemberShape },
  explicitConfirmation: { azureId: '19908' },
  auditTrail: { azureId: '19909', occupation: 'Auditor' },
} as const;

/** The confirmation's title ("Delete Member ID") and message ("Do you want to delete {name}?"). */
export const DELETE_PROMPT = { title: /delete/i, message: /delete/i };

/** The success toast ("Member deleted / The member has been deleted."). */
export const DELETED = /deleted/i;

/** The enrolment refusal ("Member cannot be deleted because they have active policy enrollments."). */
export const ENROLMENT_BLOCK = /cannot be deleted because .*enrol/i;

/** An audit action that reads as a deletion. */
export const DELETION_ACTION = /delet/i;
