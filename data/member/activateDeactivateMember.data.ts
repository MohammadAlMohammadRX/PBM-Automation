import type { MemberShape } from './memberPermissions.data';

/**
 * US 14386 "Activate/Deactivate Member" (member folder 11).
 *
 * How it works in this build (Member-Foundation-Notes.md, "Edit, Activate /
 * Deactivate, Delete"): the row's toggle reads "Inactivate" on an active member
 * (opens the Deactivate drawer) and "Activate" on an inactive one (opens the
 * shared dialog); the view page's header switch does the same. Deactivate
 * drawer: "Deactivate Member", Deactivation Reason* (Coverage Ended ... Other),
 * Details, Cancel / Deactivate -> SetMemberActive -> "Member deactivated / The
 * member has been deactivated.". Activate: "Activate Member / Activate {name}?
 * The member can be enrolled into new policies." (Cancel / Activate) -> "Member
 * activated / The member has been activated.". Applied at once (no approval).
 * Activate and Deactivate share ONE right (SetMemberActive).
 *
 * Literal readings / decisions:
 * - "Member Administrator": the administrator (no such account - writers brief).
 *   "MEM-2001" etc.: the case's own suite members.
 * - 19912 "without losing data integrity": every stored field of a fully
 *   populated member (GetMemberForEdit) except the status bookkeeping
 *   (IsActive, inactivation reason / details / by / on, modified by / on, the
 *   concurrency stamp) is unchanged after deactivate -> activate -> deactivate.
 * - 19913 "the policy enrolment selection screen": a suite DRAFT Individual
 *   policy's Members tab > Add Member picker (GetPolicyMemberCandidates),
 *   searched by each member's document ID; "Deleted" = a suite member deleted in
 *   the precondition.
 * - 19916 "the Activate action is disabled / hidden": on an active member the
 *   row offers "Inactivate" (never "Activate") and the header reads Active; on an
 *   inactive member the row offers "Activate" (never "Inactivate").
 * - 19917 "Compliance Officer (no activate / deactivate permission)": the Payer
 *   Admin shaped without SetMemberActive (`memberRole`); BLOCKED with the
 *   evidence when the role edit does not reach the account or it cannot see the
 *   member.
 * - 19918 "Policy A (Active), Policy B (Pending)": no policy can be made Active
 *   on demand - A is an APPROVED suite policy (Future), B a suite policy sent for
 *   approval with the member on it (pending). "retains its original status": the
 *   policy status and the member's roster state on each are unchanged.
 */
export const CASES = {
  activateInactive: { azureId: '19910' },
  deactivateActive: { azureId: '19911' },
  cycle: { azureId: '19912' },
  eligibility: { azureId: '19913' },
  listStatus: { azureId: '19915' },
  redundant: { azureId: '19916' },
  noSetActivePermission: { azureId: '19917', shape: { without: ['setActive'] } as MemberShape },
  policiesUnaffected: { azureId: '19918' },
} as const;

/** The activation dialog ("Activate Member / Activate {name}? ..."). */
export const ACTIVATE_PROMPT = /activate/i;

/** The deactivation drawer's title ("Deactivate Member"). */
export const DEACTIVATE_TITLE = /deactivate/i;

/** The success toasts. */
export const ACTIVATED = /activated/i;
export const DEACTIVATED = /deactivated/i;

/** Stored fields that are status bookkeeping, not member data (19912). */
export const STATUS_BOOKKEEPING = /^(isActive|inactivation\w*|inactivated\w*|modified\w*|concurrencyStamp)$/i;
