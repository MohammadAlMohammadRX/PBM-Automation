/**
 * US 15200 "View Formulary - Trade & Pricing / Add trade" (formulary folder 10).
 *
 * Every case adds trades to its own Draft formulary (one tier "Automation
 * Tier 1", 80% coverage, and no trade unless the case needs one present),
 * with the catalogue trades MED-001 / MED-002 / MED-003 - a formulary takes
 * each trade once, so a case adding several trades uses a different one each
 * time. Dates are typed as the pickers take them (`DD/MM/YYYY HH:mm`); the
 * cases' fixed calendar dates (2026-11-01, 2026-12-01 ...) become dates
 * relative to the formulary's own period so they never fall in the past.
 *
 * Literal readings:
 * - A number input that refuses a character outright (the minus sign, letters)
 *   counts as rejecting the value; one that takes it must refuse the save with
 *   a message.
 * - 18708: the card lists the trade's CURRENT net price; a draft formulary's
 *   price is in the future, so a card reading "—" instead of 103.50 is
 *   reported as the mismatch it is (the case expects the price on the list).
 * - 18717: the duplicate is attempted through the picker when it still offers
 *   the trade, and always through AddFormularyTrade itself.
 * - 18718: a pricing period holds one rebate (Edit Rebate on its card); a
 *   second rebate for the same period must be refused, not overwrite the first.
 * - 18723: the restricted user is the Payer Admin account as provided; the case
 *   runs only when it lacks Formularies.AddFormularyTrade.
 * - 18724: "exactly the trades defined in terminology" is the catalogue the
 *   drawer itself loads (GetTradesDropdown) - compared by count and by the
 *   suite's own catalogue trades.
 */

export const NET_PRICE_FORMULA = /\(.*\)\s*[×x*]\s*\(1\s*\+/;
export const RANGE = /between|range|0.*100|100|maximum|minimum|greater|less|exceed|negative|invalid/i;
export const REQUIRED = /required/i;
export const PAST = /past|today|future|earlier|before|cannot/i;
export const AFTER_FROM = /after|later|greater|before|must be|end date|effective to/i;
export const DUPLICATE_TRADE = 'This trade is already added to the formulary.';
export const ONE_REBATE = /already|exists|only one|one rebate|per pricing period/i;
export const NUMERIC_ONLY = /^[0-9.,]*$/;

export const CASES = {
  coverageDefault: { azureId: '18707', tierCoverage: 80, manual: 65 },
  addWithPricing: { azureId: '18708', trade: 'MED-001', supplierPrice: 100, discount: 10, vat: 15, netPrice: 103.5 },
  coverageBounds: { azureId: '18709', values: [0, 100] },
  coverageOutOfRange: { azureId: '18710', values: [-5, 150] },
  supplierRequired: { azureId: '18711', supplierPrice: 100 },
  discountBounds: { azureId: '18712', valid: [0, 100], invalid: 101 },
  netPriceLive: {
    azureId: '18713',
    supplierPrice: 200,
    steps: [
      { discount: 20, vat: 10, netPrice: 176 },
      { discount: 0, vat: 10, netPrice: 220 },
      { discount: 0, vat: 0, netPrice: 200 },
    ],
  },
  vatRequired: { azureId: '18714', invalid: -1, valid: [0, 100] },
  rebateHidden: { azureId: '18715', type: 'Percent of Net Price', value: 5, none: 'No rebate' },
  rebateValueRequired: { azureId: '18716', type: 'Flat Value', value: 5 },
  duplicateTrade: { azureId: '18717', trade: 'MED-001' },
  oneRebatePerPeriod: { azureId: '18718', existing: { type: 'flatValue', value: 5 }, second: { type: 'Percent of Net Price', value: 7 } },
  pastEffectiveFrom: { azureId: '18719', formularyInMinutes: 10, todayInMinutes: 20 },
  effectiveToAfterFrom: { azureId: '18720', fromAfterDays: 1, badToBeforeDays: 1, goodToAfterDays: 31 },
  nonNegativePrices: { azureId: '18721', negative: { baseCost: -10, publicPrice: -5 }, corrected: { baseCost: 50, publicPrice: 60 } },
  rebateCycling: {
    azureId: '18722',
    cycle: [
      { type: 'Percent of Net Price', value: 5 },
      { type: 'Flat Value', value: 3 },
      { type: 'Per Dispense Unit', value: 4 },
    ],
    final: { type: 'Per Dispense Unit', code: 'perDispenseUnit', value: 2.5 },
    none: 'No rebate',
  },
  noPermission: { azureId: '18723' },
  dropdownSources: { azureId: '18724', foreignTier: 'Foreign Formulary Tier' },
  nonNumericPrice: { azureId: '18725', text: 'abc' },
} as const;
