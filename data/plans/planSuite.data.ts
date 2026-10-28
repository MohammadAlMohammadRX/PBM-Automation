/**
 * Which payer and formulary the Plans suite builds its plans with.
 *
 * TEMPORARY (QA lead, 2026-10-27): an existing Active formulary, FORM-0023
 * "Al Sharq 2" of the payer "Al sharq". The suite's own formularies
 * (FORM-0030..0035, "QA Automation Formulary ...", under QA Payer
 * Stark-Kassulke) stay Pending until the daily lifecycle job runs, and only an
 * Active formulary can be assigned to a plan - without one no plan can be
 * approved. Once one of them is Active, set `formularyCode` to '' (and
 * `payerName` back to the scope payer) and the suite picks its own formulary
 * again (utils/FormularyProvisioning.suiteFormulary).
 *
 * Overridable per run with PLANS_PAYER / PLANS_FORMULARY_CODE.
 */
export const PLAN_SUITE = {
  payerName: process.env.PLANS_PAYER?.trim() || 'Al sharq',
  formularyCode: process.env.PLANS_FORMULARY_CODE?.trim() ?? 'FORM-0023',
} as const;
