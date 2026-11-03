import type { FormularyBlockedCase } from './formulary.data';

/**
 * US 15199 "View Formulary - Trade & Pricing tab" (formulary folder 09).
 *
 * The catalogue trades the suite may use are MED-001 Paracetamol 500mg,
 * MED-002 Amoxicillin 250mg and MED-003 Metformin 850mg; the cases' example
 * names (Panadol, Zinnat, Augmentin, Ventolin) map onto them. Trade statuses
 * on the cards are "Active" / "Suspended" (the story's "Inactive"); "Future"
 * and "Expired" follow the trade's price period.
 *
 * Literal readings:
 * - A trade has no approval status of its own: its changes are staged in the
 *   formulary's draft, so the "approval status and version" of a trade change
 *   (18700, 18701, 18704) is the formulary's `v<n> · <status>` badge.
 * - 18689 / 18690: the trade card shows the CURRENT net price and rebate; a
 *   draft formulary's prices are all in the future, so a card reading "—" there
 *   instead of the entered price is reported as the mismatch it is (the case
 *   lists the net price as a card detail); 18690's edit is made where the
 *   screens allow it - the Price History of the trade (Edit Price History /
 *   Edit Rebate on its future record).
 * - 18706: the cards offer no Edit Trade (their `edit-button` is Benefit
 *   Configuration) and no screen calls UpdateFormularyTrade, so the tier change
 *   is sent as that request (body: the endpoint's documented tier / coverage).
 * - 18698: the expired trade is one priced to end 7 minutes after the case
 *   starts; the case waits for that time to pass before reading it.
 * - 18699: "ends today" is 23:59 local time today.
 * - 18702: the restricted user is the Payer Admin account as provided; the case
 *   runs only when it can read trades and lacks the trade write rights.
 */

export const INACTIVE = /Suspended|Inactive/i;
export const ACTIVE = /^\s*Active\s*$/i;
export const FUTURE = /Future|Pending|Not Live/i;
export const EXPIRED = /Expired/i;
export const OFFERS_INACTIVATE = /^\s*(Suspend|Inactivate)\s*$/i;
export const OFFERS_ACTIVATE = /^\s*(Reactivate|Activate)\s*$/i;
/** A card value that is really there (not a placeholder). */
export const POPULATED = /[0-9A-Za-z؀-ۿ]/;
/** The empty state of a search that found nothing. */
export const NO_MATCH = /no trades|no results|no matching|no data|not found|nothing|no records/i;
/** A refusal that names the pending approval. */
export const PENDING_BLOCK = /pending|awaiting|approval/i;

export const CASES = {
  addTrade: { azureId: '18689', trade: 'MED-002', tierIndex: 1, coverage: 80, supplierPrice: 60, vat: 0, netPrice: 60, rebate: { type: 'Percent of Net Price', value: 5 } },
  editPricing: { azureId: '18690', supplierPrice: 12.5, netPrice: 12.5, rebate: { type: 'Percent of Net Price', value: 3 } },
  deleteTrade: { azureId: '18691' },
  cardDetails: { azureId: '18692', rebate: { type: 'flatValue', value: 2 } },
  searchByName: { azureId: '18693', term: 'Paracetamol' },
  filterByTier: { azureId: '18694', tier: 'Automation Tier 2' },
  filterByStatus: { azureId: '18695', status: 'Active' },
  combinedFilters: { azureId: '18696', name: 'Paracetamol', tier: 'Automation Tier 2', status: 'Active' },
  toggleFromCard: { azureId: '18697' },
  statusByPeriod: { azureId: '18698', futureAfterDays: 40, expiresAfterMinutes: 7 },
  statusOnBoundary: { azureId: '18699' },
  approvalProgress: { azureId: '18700', trade: 'MED-002' },
  rejectedResubmitted: { azureId: '18701' },
  noPermission: { azureId: '18702' },
  emptySearch: { azureId: '18703', term: 'NonExistentDrugXYZ' },
  pendingDeletion: { azureId: '18704' },
  tierChangeReflected: { azureId: '18706', from: 'Automation Tier 1', to: 'Automation Tier 3' },
} as const;

export const BLOCKED_CASES: FormularyBlockedCase[] = [
  {
    azureId: '18705',
    title: 'should stay usable and accurate while scrolling, paging, searching and toggling a formulary with 200+ trades',
    reason:
      'Needs a formulary holding 200 or more trades. A formulary takes each catalogue trade once, and the suite may only use its '
      + 'three catalogue trades (MED-001..003 - every other trade belongs to shared data), so no suite formulary can hold more '
      + 'than three. Runnable with a seeded catalogue of 200+ suite-owned trades or a seeded large formulary.',
  },
];
