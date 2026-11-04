import type { PolicyShape } from './policyPermissions.data';
import { POLICY_SCOPED_PAYER } from '../../utils/policy/writerBHelpers';

/**
 * US 15183 "Delete Policy" (policy folder 13).
 *
 * How deletion works in this build (foundation notes, 2026-11-03): a
 * never-approved (v0) policy is discarded at once ("The draft policy has been
 * discarded.", GetPolicy -> 404), in any approval state. A PUBLISHED policy
 * shows NO Delete action (header or row); the request the screen would send
 * (DeletePolicy) STAGES the deletion ("The deletion has been saved as a draft
 * ...") and Send for Approval + approve removes it (GetPolicy -> 404) - refused
 * with 409 while members ("Cannot delete a policy that has enrolled members.")
 * or documents remain. The prompt has no reason / justification field.
 *
 * Literal readings and TC-vs-AC notes:
 * - "Pending Deletion Approval" = the policy's version `v<n> · Pending Approval`
 *   whose change is a deletion (Version History: Deleted); "Published" = an
 *   approved policy (status Future - the approval always gives Future).
 * - 19591 / 19598 / 19602: the case drives Delete from the screen and expects a
 *   prompt (with a justification / request form); the published policy's Delete
 *   is looked for and its absence is the finding - the deletion is then sent the
 *   way the screen would send it, so the approval half is still exercised.
 * - 19592: TC (blocked while members exist, "regardless of its never-approved
 *   state") vs build (a v0 is discarded at once) - asserted as the case states.
 * - 19593 / 19596 "published with members": an approved Individual policy (a
 *   Group one takes no members until Active); 5 and 1 members.
 * - 19594 / 19598 "Deleted" status and "the full history remains visible": a
 *   deleted policy answers 404, so its version history / audit trail is asked
 *   for by id afterwards - the case expects it retrievable.
 * - 19595 "Rejection Reason = Policy still required": the hub's Reject dialog
 *   offers a reason select and an acknowledgement, no free text - "Other" is chosen.
 * - 19597 "Read-Only Viewer": the Payer Admin role shaped without DeletePolicy,
 *   on a Draft of that account's payer (a Draft offers Delete to the administrator).
 * - 19599 "submit another deletion request": the same DeletePolicy request again
 *   WITHOUT consenting to withdraw the pending one; it must not create a second request.
 * - 19600 "already deleted in a prior session": a published policy whose deletion
 *   was approved (the logical deletion), looked up by direct link and audit.
 * - 19601 "policy selection dropdowns across the module": GetPoliciesDropdown.
 */
export const CASES = {
  draftImmediate: { azureId: '19590' },
  publishedRouted: { azureId: '19591' },
  draftWithMembers: { azureId: '19592', members: 3 },
  publishedWithMembers: { azureId: '19593', members: 5 },
  approvedDeletion: { azureId: '19594' },
  rejectedDeletion: { azureId: '19595', reason: 'Policy still required' },
  oneMember: { azureId: '19596', members: 1 },
  viewerCannotDelete: { azureId: '19597', payerName: POLICY_SCOPED_PAYER, shape: { without: ['delete'] } satisfies PolicyShape },
  endToEnd: { azureId: '19598', justification: 'Policy superseded by new plan' },
  duplicateRequest: { azureId: '19599' },
  alreadyDeleted: { azureId: '19600' },
  draftGoneButAudited: { azureId: '19601' },
  requestAudit: { azureId: '19602', justification: 'Deletion requested by the automation suite for the audit-details case.' },
} as const;

/** A refusal because members are enrolled. */
export const MEMBERS_BLOCK = /member/i;

/** The prompt saying the deletion needs approval. */
export const NEEDS_APPROVAL = /approv/i;

/** A reason / justification shown with a request. */
export const REASON_SHOWN = /reason|justification/i;

/** A permissions refusal. */
export const DENIED = /permission|not authori[sz]ed|access denied|forbidden|not allowed|denied|unauthori[sz]ed/i;

/** A pending deletion request on the policy's header. */
export const PENDING_SHOWN = /pending|awaiting/i;
