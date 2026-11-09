import type { AnchorSpec } from '../../utils/member/writerDHelpers';

/**
 * US 15208 "View Member - Accumulator Dashboard - Member Benefit Accumulator"
 * (member folder 15) - accumulators reset at each benefit year start.
 *
 * HOW THE YEAR START IS PRODUCED (writers brief decision; user's job rule): a
 * policy shorter than a year has no renewal - its only "year start" is its
 * effective date - and an effective date in the past is refused, so the suite
 * builds its OWN policy whose benefit year starts TODAY:
 *   1. ONE suite member "QA Automation MemberReset<YYYYMMDD>x<stamp>" enrolled in
 *      ONE approved suite policy "QA Automation Policy Reset <stamp>" (Al sharq,
 *      effective a few minutes ahead, 90 days, deductible 500 / coinsurance 20 % /
 *      OOPM 3,000 / sublimit 1,000), shared by every case of the folder and every
 *      re-run of the day (utils/member/writerDHelpers.ts `findOrBuildAnchor`;
 *      earlier days' anchors are retired the next time one is asked for);
 *   2. the ADMINISTRATOR moves `Jobs.PolicyLifecycleCron` (memberJobClock) to
 *      fire just after the effective time, so the policy turns ACTIVE, and puts
 *      it back at once;
 *   3. the ADMINISTRATOR moves `Jobs.AccumulatorAnnualResetCron` ~2 minutes
 *      ahead, waits (bounded) for GetResetJobHistory to show the scheduled row
 *      of the policy, and puts it back. memberJobClock ALSO restores both jobs
 *      at every case's teardown.
 * Each case asks for the phase it needs; a phase already reached (by an earlier
 * case or run of the day) is not repeated, so the jobs move as few times as
 * possible. 19980 is FIRST in the spec: it watches the screen while the reset
 * job runs.
 *
 * Findings vs BLOCKED (writers brief):
 * - the scheduled job leaving NO history row for the policy is the
 *   application's answer: the case FAILS (19974, 19976, 19978, 19980, 19982);
 * - the policy not turning Active after the lifecycle job ran is a broken
 *   PRECONDITION: BLOCKED with the evidence;
 * - accumulator AMOUNTS cannot be posted (no claim can be posted): the
 *   "non-zero balances" of the preconditions are 0.00 - the cases assert what
 *   they can without an amount (totals shown, zero after the reset, the period);
 * - 19975 / 19983 need a PRIOR (closed) benefit year in the Benefit Period
 *   select; a policy created today has none unless the reset closes one - read
 *   at run time, BLOCKED when the select offers no prior period;
 * - 19978 needs a policy with a MANUAL reset in the reset history: an existing
 *   "Manual" row is READ (never created - Reset now is refused on the day a
 *   period starts, and the suite does not reset a policy it did not create);
 *   BLOCKED when the history has none;
 * - 19977 family totals: BLOCKED - individual accumulators only.
 *
 * Literal readings:
 * - 19981 "benefit year changed from 01-Jan..31-Dec to 01-Mar..28-Feb": the
 *   start of an in-force policy cannot move (an effective date in the past is
 *   refused), so the END moves: the expiry is extended by 30 days through Policy
 *   Management (staged, sent, approved).
 * - 19979 "Accumulator-View permission = No": the Payer Admin role without
 *   MemberAccumulators.GetMemberAccumulator / GetResetJobHistory (it never held
 *   them on 2026-11-05).
 * - Hassan Ali / Prior Benefit Year 2025 / $450 are the suite's own member,
 *   period and (zero) amounts.
 */
export const RESET_ANCHOR: AnchorSpec = {
  prefix: 'MemberReset',
  policies: [
    { tag: 'Reset', spec: { deductibleAmount: 500, coinsurancePercent: 20, outOfPocketMaximum: 3000, sublimitAmount: 1000, effectiveInMinutes: 3, expiryInDays: 90 } },
  ],
};

export const CASES = {
  autoReset: { azureId: '19974' },
  priorYear: { azureId: '19975' },
  individualReset: { azureId: '19976' },
  autoVsManual: { azureId: '19978' },
  noAccumulatorRight: { azureId: '19979', shape: { with: ['list'], without: ['accumulator', 'resetHistory'] } as const },
  atomic: { azureId: '19980' },
  datesChanged: { azureId: '19981', extendDays: 30 },
  everyType: { azureId: '19982' },
  priorReadOnly: { azureId: '19983' },
} as const;

/** The Individual section's totals ("Deductible 0.00 SAR of 500.00 SAR 0%"). */
export const INDIVIDUAL_AMOUNT = {
  deductible: /Deductible\s+([\d,]+\.\d{2})\s*SAR\s+of\s+([\d,]+\.\d{2})\s*SAR/i,
  outOfPocket: /Out-of-Pocket\s+([\d,]+\.\d{2})\s*SAR\s+of\s+([\d,]+\.\d{2})\s*SAR/i,
};

/** The sublimit section when nothing is consumed. */
export const NO_SUBLIMIT_USED = /No sublimits consumed in this period\./i;

/** A reset history kind that names the automatic year-start reset. */
export const AUTOMATIC_KIND = /auto|schedul|annual|year/i;

/** A reset history kind that names a manual reset. */
export const MANUAL_KIND = /manual/i;

/** An edit / save control. */
export const EDIT_CONTROL = /edit|save|update|reset/i;

/** An access-restricted answer. */
export const ACCESS_RESTRICTED = /access|denied|not authori[sz]ed|unauthori[sz]ed|permission|restricted|forbidden/i;

export const BLOCKED_CASES = [
  {
    azureId: '19977',
    title: "should reset a family's combined accumulator totals at year start along with the individual totals",
    reason: 'Needs a FAMILY policy with a family accumulator balance: the application keeps INDIVIDUAL accumulators only (no family accumulator exists on the '
      + 'Member Benefit Accumulator screen or in GetMemberAccumulator), and no claim can be posted to give any accumulator a balance '
      + '(the engine simulator writes nothing; posting needs a partner integration client the suite does not create).',
  },
] as const;
