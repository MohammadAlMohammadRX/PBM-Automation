import type { AnchorSpec } from '../../utils/member/writerDHelpers';

/**
 * US 15207 "View Member - Accumulator Dashboard Tab" (member folder 14).
 *
 * THE TAB (Member-Foundation-Notes.md, "PBM Accumulator Dashboard"): member
 * card (name, status, Member ID, Benefit Year, Policies), "COB Policy n"
 * buttons (one shared id), the policy (Policy Number, Plan, Payer, PBM Member
 * ID, Relationship, Policy Status, Effective Period), Policy-Level Benefit (0 ->
 * "None"), Accumulators & Sublimits ("Benefit year ...", View full accumulator,
 * Deductible met, Out-of-pocket met, Policy sublimit used, Trade sub-caps, the
 * period line), "No active benefit policy found." without a policy. Data:
 * GetMember `benefitPolicies` (approved enrolments only).
 *
 * THE SHARED MEMBER (writers brief: share one enrolled member where the cases
 * allow it): every case but 19956 / 19970 uses ONE suite member
 * "QA Automation MemberDash<YYYYMMDD>x<stamp>" in THREE approved suite policies
 * of "Al sharq" (utils/member/writerDHelpers.ts `findOrBuildAnchor`), found by
 * its name and reused by every case and every re-run of the day; an anchor of
 * an earlier day is retired (policies retired, member deactivated) the next
 * time it is asked for. Its coverage order is set to Dash1, Dash2, Dash3 when it
 * is built (19958 / 19966 need "a defined coverage order"); 19968 swaps it and
 * puts it back. Leftover per day: one member + three policies, retired the next
 * day (19956 adds the usual memberEnrolled pair).
 *   Dash1  in force ~2 min after the build, deductible 500, coinsurance 20 %, OOPM 3,000, sublimit 0 (19960 "Sublimit = 0")
 *   Dash2  in force ~3 min after the build, 500 / 20 % / 3,000 / 1,000 (19961 "all non-zero")
 *   Dash3  effective in two days (NOT in force today - 19966), deductible 0
 *
 * Literal readings / decisions:
 * - Test data names (Ahmed Khalil, POL-5521, "Gold PPO", NovaHealth, Benefit
 *   Year 2026, 01-Jan-2026 ...) are the suite's own member and policies; each
 *   value is compared with what GetMember holds for the policy shown.
 * - "2 policies" (19955, 19957, 19958, 19967, 19968): the shared member holds
 *   three (19973 needs three); the cases check COB Policy 1 / 2 and the count
 *   the member really holds.
 * - 19955 Benefit Year: a year must show (known finding: it reads "—").
 * - 19959 Status "Active": an approved policy reads "Future" until the daily
 *   lifecycle job runs; the field is compared with the policy's own status.
 * - 19965 "Policy C (Approved, Other Payer)": a suite policy can only be built on
 *   the Policy suite's payer, so the OTHER payer is the breadcrumb payer scope:
 *   with "Al sharq" selected only the approved Al sharq policies show (the draft
 *   enrolment - "Pending" - does not); with another payer selected none of them.
 * - 19972 "Accumulator-View permission = No": the Payer Admin role without
 *   MemberAccumulators.GetMemberAccumulator (it never held it on 2026-11-05).
 * - 19960 "$0" / 19961 "$500": amounts read "SAR 500.00" in this application.
 * BLOCKED (writers brief, accumulator AMOUNTS): 19962, 19963 need posted
 * claims; 19964 needs a policy with a MANUAL reset - Reset now is refused on
 * the day a benefit period starts and every suite enrolment starts today.
 */
export const DASHBOARD_ANCHOR: AnchorSpec = {
  prefix: 'MemberDash',
  policies: [
    { tag: 'Dash1', spec: { deductibleAmount: 500, coinsurancePercent: 20, outOfPocketMaximum: 3000, sublimitAmount: 0, effectiveInMinutes: 2, expiryInDays: 90 } },
    { tag: 'Dash2', spec: { deductibleAmount: 500, coinsurancePercent: 20, outOfPocketMaximum: 3000, sublimitAmount: 1000, effectiveInMinutes: 3, expiryInDays: 90 } },
    { tag: 'Dash3', spec: { deductibleAmount: 0, coinsurancePercent: 10, outOfPocketMaximum: 2000, sublimitAmount: 500, effectiveInMinutes: 2 * 24 * 60, expiryInDays: 90 } },
  ],
};

export const CASES = {
  memberCard: { azureId: '19955' },
  singlePolicy: { azureId: '19956' },
  switchPolicies: { azureId: '19957' },
  primaryFirst: { azureId: '19958' },
  policyDetails: { azureId: '19959' },
  zeroIsNone: { azureId: '19960', tag: 'Dash1', expected: { deductible: 'SAR 500.00', coinsurance: '20%', outOfPocketMaximum: 'SAR 3,000.00', sublimit: 'None' } },
  ownTerms: { azureId: '19961', tag: 'Dash2', expected: { deductible: 'SAR 500.00', coinsurance: '20%', outOfPocketMaximum: 'SAR 3,000.00', sublimit: 'SAR 1,000.00' } },
  payerScope: { azureId: '19965', draftTag: 'DashDraft' },
  ordering: { azureId: '19966', inForceWaitMs: 6 * 60_000 },
  opensOnFirst: { azureId: '19967' },
  afterReorder: { azureId: '19968' },
  readOnly: { azureId: '19969' },
  noPolicy: { azureId: '19970', text: 'No active benefit policy found.' },
  viewFull: { azureId: '19971' },
  noAccumulatorRight: { azureId: '19972', shape: { with: ['list'], without: ['accumulator'] } as const },
  rapidSwitch: { azureId: '19973' },
} as const;

/** A control on the tab that would change data (the tab is read-only). */
export const WRITE_CONTROL = /save|enrol|edit|add|remove|update|delete|change/i;

/** An access-restricted answer. */
export const ACCESS_RESTRICTED = /access|denied|not authori[sz]ed|unauthori[sz]ed|permission|restricted|forbidden/i;

/** A benefit year as the card should print it. */
export const BENEFIT_YEAR = /\d{4}/;

/** A case the environment cannot run, reported BLOCKED with its reason (data-driven). */
export interface DashboardBlockedCase {
  azureId: string;
  title: string;
  reason: string;
}

const NO_CLAIM = 'no claim can be posted for a suite member: the Integration Portal engine simulator writes nothing ("Nothing is written: no transaction, '
  + 'no accumulator posting") and posting needs the partner pre-authorization API with an integration client\'s credentials, which the suite does not create';

export const BLOCKED_CASES: DashboardBlockedCase[] = [
  {
    azureId: '19962',
    title: 'should show how much of the deductible the member has used this benefit year',
    reason: `Needs a member with SAR 300 applied toward a SAR 500 deductible in the current benefit year - ${NO_CLAIM}. The parts checkable without an amount `
      + '(labels, SAR 0.00, the period line) are covered by 19959 / 19961 / 19973.',
  },
  {
    azureId: '19963',
    title: 'should show how much of the out-of-pocket maximum the member has used this year',
    reason: `Needs a member with SAR 1,200 accrued toward a SAR 3,000 out-of-pocket maximum in the current benefit year - ${NO_CLAIM}.`,
  },
  {
    azureId: '19964',
    title: 'should show when the benefit period renews and whether a manual reset set the terms',
    reason: 'Needs a member enrolled in a policy that had a MANUAL reset (Reset now) applied: the application refuses a reset on the day a benefit period starts '
      + '(409 "The policy\'s current benefit period already starts today; it cannot be reset again today.") and every suite enrolment is made today, so no suite '
      + 'member\'s policy can carry a manual reset; the suite does not reset or enrol into a policy it did not create.',
  },
];
