import type { FormularyBlockedCase } from './formulary.data';

/**
 * US 17634 "View Formulary - Trade & Pricing / Price History" (formulary folder 21).
 *
 * Price periods belong to one formulary trade (the card's Price History) and
 * never overlap. Most cases use writerBHelpers.shortPricedDraft - a Draft
 * formulary whose single trade is priced for its first 30 days only - so new
 * periods (+60 .. +240 days after the formulary starts) never collide with it;
 * the cases' fixed dates (2027-01-01 ...) become those relative dates.
 * Expired / current / future periods side by side come from
 * writerBHelpers.priceTimeline (periods dated minutes ahead, then waited for).
 *
 * Literal readings:
 * - A number input that refuses a character outright (the minus sign) counts as
 *   rejecting the value; one that takes it must refuse the save with a message.
 * - 18898 step 4: a new price starting while the current one runs must cut the
 *   current one at its start (to the minute) and become current itself - checked
 *   on an Active formulary.
 * - 18900: the record's approval status is the formulary's draft / badge; the
 *   environment has ONE checker (the administrator approves its own changes), so
 *   the "first approval then second approval" steps cannot be exercised and end
 *   the case BLOCKED once the Draft and Pending Approval steps were checked.
 * - 18909: a period starting at the very minute the existing one ends
 *   double-covers that day, so it must be refused; one starting the day after
 *   must be accepted.
 * - 18908: user A is the Payer Admin account as provided; the case runs only
 *   when that account can read price history and lacks the price write rights.
 */

export const FUTURE = /Future|Not Live|Draft/i;
export const CURRENT = /Active|Current/i;
export const EXPIRED = /Expired/i;
export const DRAFT = /Draft/i;
export const REQUIRED = /required/i;
export const RANGE = /between|range|0.*100|100|maximum|exceed|greater|less|invalid/i;
export const NEGATIVE = /negative|0 or more|greater than or equal|minimum|invalid|must be/i;
export const AFTER_FROM = /after|later|greater|before|must be|end/i;
export const OVERLAP = /overlap/i;
export const NUMERIC_ONLY = /^[0-9.,]*$/;
/** Required labels the record form must show. */
export const REQUIRED_LABELS = [/Supplier Price/i, /VAT/i, /Effective From/i] as const;

export const CASES = {
  addPeriod: { azureId: '18891', supplierPrice: 100, vat: 15, discount: 10, netPrice: 103.5 },
  formLayout: { azureId: '18892' },
  zeroValues: { azureId: '18893', supplierPrice: 0, vat: 0, discount: 0, netPrice: 0 },
  maximumPercentages: { azureId: '18894', supplierPrice: 200, discount: 100, vat: 100, netPrice: 0 },
  overHundred: { azureId: '18895', discount: '100.01', vat: 101, supplierPrice: 50 },
  supplierRequired: { azureId: '18896', vat: 15 },
  negativeValues: { azureId: '18897', baseCost: -10, publicPrice: -5, supplierPrice: -20, vat: 15 },
  noOverlap: { azureId: '18898', overlapStartAfterDays: 90, overlapEndAfterDays: 270, newPriceInMinutes: 3, newSupplierPrice: 12 },
  statusByDates: { azureId: '18899' },
  approvalProgress: { azureId: '18900', supplierPrice: 15, vat: 15 },
  onlyFutureEditable: { azureId: '18901', newSupplierPrice: 13 },
  netPriceFormula: { azureId: '18902', supplierPrice: 100, discount: 10, vat: 15, netPrice: 103.5 },
  endBeforeStart: { azureId: '18904', supplierPrice: 100, vat: 15 },
  rebateOnCurrent: { azureId: '18905' },
  rebateTypes: {
    azureId: '18906',
    existing: { type: 'flatValue', value: 1 },
    none: 'No rebate',
    types: [
      { label: 'Percent of Net Price', code: 'percentOfNetPrice', value: 5 },
      { label: 'Flat Value', code: 'flatValue', value: 3 },
      { label: 'Per Dispense Unit', code: 'perDispenseUnit', value: 2 },
    ],
  },
  negativeRebate: { azureId: '18907', existing: { type: 'flatValue', value: 1 }, type: 'Flat Value', value: -5 },
  permissions: { azureId: '18908' },
  sameDayBoundary: { azureId: '18909', supplierPrice: 30, vat: 15 },
  deleteFuture: { azureId: '18910' },
} as const;

export const BLOCKED_CASES: FormularyBlockedCase[] = [
  {
    azureId: '18903',
    title: 'should calculate the patient cost-sharing with the net price valid on the date of service',
    reason:
      'Needs a cost-sharing calculation for a claim dated today. The environment exposes no claim adjudication or cost-sharing '
      + 'calculation the suite can trigger against a suite formulary, so the net price used for a date of service cannot be '
      + 'observed. The price periods themselves (which one is current) are covered by 18899. Runnable once claims can be '
      + 'adjudicated against a suite formulary.',
  },
];
