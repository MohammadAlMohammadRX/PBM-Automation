import { ADMIN_NAME, FORBIDDEN, FULL_ACCESS, SCOPED_PAYER, VIEW_ONLY } from './formularyPermissions.data';
import type { FormularyBlockedCase } from './formulary.data';

/**
 * US 15205 "Formulary Approval Workflow" (formulary folder 13).
 *
 * Accounts. The administrator (`careconnect`, "CareConnect Admin User") is the
 * only approver and approves its own submissions (its role may approve own
 * requests). The Payer Admin account holds no approval right; shaped with the
 * formulary rights (fixture `formularyRole`) it plays the submitter WITHOUT the
 * approval permission (18754, 18768), the "User A" whose change an independent
 * reviewer (the administrator, "User B") approves (18755), and the Read-Only
 * Viewer (18766). Its formularies are built for a payer in its scope.
 *
 * Literal readings:
 * - "Compliance Officer with Approve Own Requests" (18756) = the administrator.
 * - 18754 "a message explains that self-approval is not permitted": the Payer
 *   Admin is offered no Approve control at all; a hidden control carries no
 *   message, so the step asserts the control is not usable.
 * - 18758 "a tier's copay": tiers carry a default coverage %, which is changed.
 * - 18761 "a trade's drug mapping": the Trades & Pricing card offers no mapping
 *   edit; its own modification is Suspend (SetFormularyTradeStatus), used here.
 * - 18764: FRM-A "no tier, one trade with pricing and benefit" cannot exist (a
 *   trade must sit in a tier), so FRM-A is a formulary with no tier (and so no
 *   trade). FRM-C "trade with benefit but no pricing history" is the trade with
 *   its price records removed - BLOCKED at run time if the application refuses
 *   to remove a trade's last price record. "Attempt to approve" = send for
 *   approval, then approve in the hub (a refusal at either is a block).
 * - 18769: the rejection with a free-text reason is made through RejectRequest
 *   (the hub's Reject dialog offers only the reason list).
 * - 20031: "a new price" is the trade's price of a never-approved formulary
 *   effective in 2 minutes; "approved" = the formulary sent and approved, and
 *   "Active" is read once the price's start has passed.
 */
export { ADMIN_NAME, FORBIDDEN, SCOPED_PAYER };

/** What a refused direct approval / rejection answers (authorization error). */
export const AUTH_ERROR_STATUSES = [401, 403] as const;

export const CASES = {
  selfApproveWithoutRight: { azureId: '18754', shape: FULL_ACCESS },
  independentReviewer: { azureId: '18755', shape: FULL_ACCESS },
  selfApproveWithRight: { azureId: '18756' },
  rejectWithReason: { azureId: '18757', reason: 'Pricing does not match contracted rates' },
  tierEditToDraft: { azureId: '18758', coverage: 75 },
  formularyEditToDraft: { azureId: '18759', description: 'Edited while awaiting approval by the automation suite.' },
  reasonRequired: { azureId: '18760', reason: 'x' },
  tradeEditToDraft: { azureId: '18761' },
  priceEditToDraft: { azureId: '18762', supplierPrice: 15 },
  benefitEditToDraft: { azureId: '18763', copayment: 18 },
  approvalGate: { azureId: '18764' },
  readOnlyViewer: { azureId: '18766', shape: VIEW_ONLY },
  exploratory: { azureId: '18767', description: 'Edited mid-review by the exploratory case.' },
  alternateRoute: { azureId: '18768', shape: FULL_ACCESS },
  fullHistory: { azureId: '18769', reason: 'Tier coverage must be reviewed before approval.', description: 'Edited after the rejection by the automation suite.' },
  priceStatus: { azureId: '20031', effectiveInMinutes: 2 },
} as const;

/** What each incomplete formulary's refusal should name (18764). */
export const GATE_MESSAGE = {
  noTier: /tier/i,
  noBenefit: /benefit/i,
  noPricing: /pric/i,
} as const;

/** Price card statuses (20031). */
export const PRICE_STATUS = { draft: /Draft/i, active: /Active|Current/i } as const;

export const BLOCKED_CASES: FormularyBlockedCase[] = [
  {
    azureId: '18765',
    title: 'should never use an expired price record when the member charge is calculated',
    reason:
      'Needs an approved formulary whose trade has an EXPIRED price record (end date in the past) next to a current one, and a '
      + 'member-charge calculation (pricing simulation / claims tool) to read the price used. A price period cannot be created in '
      + 'the past and becomes Expired only through the daily lifecycle job, so the expired record cannot be produced on demand; '
      + 'and the Formulary module exposes no charge calculation to trigger. Runnable once an approved suite formulary with an '
      + 'expired price record exists and the calculation tool (e.g. the authorization simulator) is available to the suite.',
  },
];
