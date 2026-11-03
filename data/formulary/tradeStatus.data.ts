/**
 * US 15197 "Inactivate and activate formulary trades" (formulary folder 07).
 * 18670 is Manual (date driven) and is not automated.
 *
 * The screens call the story's Inactivate / Activate "Suspend" / "Reactivate"
 * (toggle `formulary-trades-card-{id}-toggle-status-button`, status badge
 * "Suspended"); the cases accept either word. On a PUBLISHED formulary a
 * Suspend / Reactivate is staged in the formulary's draft ("Saved to the
 * formulary's draft. Send the formulary for approval ...") - the approval
 * request is the formulary's Send for Approval, then the shared approvals
 * module's decision (the administrator is the one checker).
 *
 * Literal readings:
 * - "an approval request is generated" (18662, 18664): the change must sit in
 *   the formulary's draft and Send for Approval must put a request in the queue.
 * - 18667 / 18668 "prevents the duplicate action": the toggle must not offer
 *   the redundant action, and a direct repeat of it must be refused.
 * - 18666: the restricted user is the Payer Admin account as provided; the
 *   case runs only when that account can read trades but lacks
 *   Formularies.SetFormularyTradeStatus (writerBHelpers requireFormularyRights).
 * - 18671 / 18672: the "history log" is the formulary's Audit History
 *   (GetFormularyAuditTrail): one entry per status change, with the user, the
 *   time and the before / after status.
 */

/** Status words: the screens say Suspended where the story says Inactive. */
export const INACTIVE = /Suspended|Inactive/i;
export const ACTIVE = /^\s*Active\s*$/i;
/** The toggle's label offering the inactivation / the activation. */
export const OFFERS_INACTIVATE = /^\s*(Suspend|Inactivate)\s*$/i;
export const OFFERS_ACTIVATE = /^\s*(Reactivate|Activate)\s*$/i;
/** A refusal of a redundant status change. */
export const ALREADY = /already|no change|not allowed|cannot|invalid/i;
/** What an audit entry of a trade status change carries. */
export const STATUS_CHANGE_ENTRY = /suspend|reactivat|tradestatus|trade status|SetFormularyTradeStatus|status/i;

export const CASES = {
  activateInactive: { azureId: '18662' },
  detailsPreserved: { azureId: '18663', rebate: { type: 'flatValue', value: 2 } },
  inactivateActive: { azureId: '18664' },
  rejectedInactivation: { azureId: '18665' },
  noPermission: { azureId: '18666' },
  alreadyInactive: { azureId: '18667' },
  alreadyActive: { azureId: '18668' },
  draftFormulary: { azureId: '18669' },
  rapidToggles: { azureId: '18671', toggles: 5 },
  auditLogged: { azureId: '18672' },
  reflectedOnTab: { azureId: '18673' },
} as const;
