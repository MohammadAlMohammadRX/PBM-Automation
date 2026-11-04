import type { PolicyBlockedCase } from '../../utils/policy/writerCHelpers';

/**
 * US 18370 "Sublimit/Deductible/Out-of-Pocket and effective-period
 * calculations" (policy folder 20). Nine of its eleven cases are Manual
 * (annual benefit reset, tagged in Azure 2026-11-03); two are automated here.
 *
 * - 19702: "a drug benefit configuration with an effective period" = a benefit
 *   configuration of a formulary trade (Formulary > Trades & Pricing > Benefit
 *   Configuration - where Deductible, Out-of-Pocket Maximum and Sublimit live).
 *   The case's own Draft formulary (payer "Al sharq", one tier, one trade -
 *   never FORM-0023) gets Period 1 (one year) and then an overlapping Period 2
 *   (starting half-way through Period 1, running a year), which must be
 *   rejected with a validation error. Live 2026-11-02 (Formulary suite) the
 *   server answered 409 "This date range overlaps with ...".
 * - 19703 needs claims processing - BLOCKED.
 */
export const CASES = {
  noOverlappingPeriods: {
    azureId: '19702',
    terms: { deductible: 500, outOfPocketMaximum: 3000, sublimitAmount: 10000, copaymentAmount: 20 },
    period1: { startInDays: 2, lengthDays: 365 },
    period2: { startInDays: 2 + 182, lengthDays: 365 },
  },
} as const;

/** The validation a second, overlapping period should meet. */
export const OVERLAP = /overlap/i;

export const BLOCKED_CASES: PolicyBlockedCase[] = [
  {
    azureId: '19703',
    title: 'should apply the current coverage year\'s deductible, out-of-pocket and sublimit when a claim is calculated',
    reason:
      'Needs a policy in its SECOND coverage year with terms distinct from year 1 (case data POL-2008) and a claims interface to '
      + 'submit a SAR 2,000 test claim and read its benefit calculation. A coverage year rolls over only through the annual '
      + 'benefit reset (Manual cases of this story) and the environment exposes no claims submission to the suite. Runnable once '
      + 'a claims simulator and a policy with a past coverage year are available.',
  },
];
