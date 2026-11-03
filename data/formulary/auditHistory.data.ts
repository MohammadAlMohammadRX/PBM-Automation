import { fullAccessWithout, FULL_ACCESS, SCOPED_PAYER } from './formularyPermissions.data';
import type { FormularyBlockedCase } from './formulary.data';

/**
 * US 15216 "View Formulary - Audit History" (formulary folder 19).
 *
 * The trail is GetFormularyAuditTrail; the tab is the shared AuditHistoryTab
 * (timeline "action / when / By: user", View Details -> field, before, after).
 * The "dedicated audit permission" is GetFormularyAuditTrail - the Formularies
 * section's "View Audit Logs" row shares its label with every other section,
 * so it cannot be targeted by the shaping step (Terminology lesson).
 *
 * Literal readings:
 * - 18868 "Expiry Date changed": the draft's expiry date is moved 30 days.
 * - 18870 "200+ entries": built by saving the draft's description 205 times;
 *   if the trail does not grow by those saves the large formulary cannot be
 *   built and the case is BLOCKED at run time with the count it reached.
 * - 18871 "Create, Update, Delete on Price History": a future price record is
 *   added, its discount changed and the record deleted (the application's own
 *   AddPricingPeriod / UpdatePricingPeriod / DeletePricingPeriod).
 * - 18874 "VAT% 15 -> 10 -> 12": the trade's price starts at 0% VAT and is
 *   changed three times, to 15, 10 and 12.
 * - 18875 "Base Cost previously blank": a trade's base cost is always set
 *   (Add Trade sends one), so the optional field newly filled is the
 *   formulary's English description, created blank.
 * - 18877 "a price record pending approval": the formulary sent for approval
 *   with its price records; its approval is the decision audited.
 * - "a user without the Audit History permission": the Payer Admin role shaped
 *   without GetFormularyAuditTrail, on a formulary of a payer in its scope.
 */
export const CASES = {
  reviewHistory: { azureId: '18867' },
  previousAndNew: { azureId: '18868', moveExpiryDays: 30 },
  permissionGate: { azureId: '18869', payerName: SCOPED_PAYER, without: fullAccessWithout('audit'), with: FULL_ACCESS },
  emptyAndLarge: { azureId: '18870', saves: 205, minimum: 200 },
  createUpdateDelete: { azureId: '18871', discount: 5 },
  immediateEntry: { azureId: '18872', description: 'Standard Formulary - Revised' },
  directUrl: { azureId: '18873', payerName: SCOPED_PAYER, shape: fullAccessWithout('audit') },
  sameFieldOrder: { azureId: '18874', vats: [15, 10, 12] },
  blankToValue: { azureId: '18875', description: 'Description added where none existed.' },
  noAuditTab: { azureId: '18876', payerName: SCOPED_PAYER, shape: fullAccessWithout('audit') },
  approvalAudited: { azureId: '18877' },
  whoAndWhen: { azureId: '18878' },
} as const;

/** Action labels as the timeline may word them. */
export const ACTION_LABEL = {
  create: /create|add/i,
  update: /update|edit|change/i,
  delete: /delete|remov/i,
  approved: /approv/i,
} as const;

/** Field names in the entry drawer. */
export const FIELD = {
  expiry: /expiry/i,
  vat: /vat/i,
  description: /description/i,
  status: /status/i,
} as const;

/** A blank "before" value in the drawer. */
export const BLANK_VALUE = /^(|—|-|–|none|null|n\/a|empty)$/i;
/** The empty-state message of a formulary with no audit entries. */
export const EMPTY_AUDIT = /no (audit|history|entries|records|activity)|nothing|empty/i;
/** The tabs a user without the audit permission should still be offered (18876). */
export const GENERAL_TABS = ['overview', 'tiers', 'trades', 'versions'] as const;

export const BLOCKED_CASES: FormularyBlockedCase[] = [];
