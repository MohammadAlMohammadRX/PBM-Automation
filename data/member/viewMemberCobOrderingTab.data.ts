import type { MemberShape } from './memberPermissions.data';

/**
 * US 14384 "Veiw Member - Coordination of Benefits Ordering Tab" (member folder 09).
 *
 * How the tab works in this build (Member-Foundation-Notes.md, "Coverage
 * Ordering"): "Coverage Ordering" / CURRENT ORDERING - one row per APPROVED
 * enrolment: badge (Primary / Secondary / Tertiary / Order n), "<policy> ·
 * <POL-number>", "<payer> · <from> — <to>" (the POLICY's own dates), the
 * benefit line; the hint "Drag the policies into the order they should pay: the
 * first is primary." with 2+ policies; a History section for earlier orderings.
 * A drop sends PUT Cob/ReorderMemberCoverage `{memberId, policyIds}` at once (no
 * approval) - 200 + toast "Coverage ordering / Coverage priority updated."; a
 * partial order or a duplicate policy id answers 409. Before the first reorder
 * every entry id is the empty GUID.
 *
 * Shared members (utils/member/writerCHelpers.ts `SharedEnrolment`; every
 * approved enrolment leaves a deactivated member + retired policies behind, so
 * the cases share):
 * - cob-ordering.spec.ts: ONE member in THREE policies created in an order that
 *   is NOT their start order (THREE_POLICIES: created 60 / 20 / 40 minutes ahead),
 *   for 19891 (runs first: nothing reordered yet), 19898, 19892, 19893, 19895,
 *   19900, 19902, 19901 and 19899 (last: a known finding).
 * - cob-ordering-growth.spec.ts: ONE member that starts with ONE policy (19896),
 *   gets a second (19897) and then two more unordered ones (19894).
 * A failed case restarts the worker, so a later case may meet a freshly built
 * member: every case establishes its own precondition (and BLOCKS when it
 * cannot hold - e.g. 19891 on a member already reordered, 19896 on one with
 * more than one policy).
 *
 * Literal readings / decisions:
 * - The administrator plays the Member Administrator (writers brief).
 * - 19891 test data (2018 / 2020 / 2023 starts): a policy cannot start in the
 *   past - three Future policies starting 20 / 40 / 60 minutes ahead stand in;
 *   "oldest to newest" = earliest effective start first (AC: "earliest-starting
 *   first"). The initial order was seen unstable (foundation) - a finding when
 *   it fails.
 * - 19892 "all other policies are marked Secondary": with three policies the
 *   third reads "Tertiary" (the app's third badge). The case's own step 4 is
 *   asserted (moved -> Primary, previous first -> Secondary) - decision item.
 *   "Confirm the reorder": there is no confirmation - the drop applies at once;
 *   the 200 answer is the confirmation asserted.
 * - 19893: the screen offers no way to put two policies on one place; the
 *   attempt is rapid drags plus the same request the drop sends with a
 *   duplicate policy id ("prevents or auto-corrects": refused, and the order
 *   stays a strict 1..n sequence).
 * - 19894 "New Policy D start date = 2026-01-01": two NEW Future policies (the
 *   later-enrolled one starts EARLIER) so "earliest-starting first" is
 *   observable among the unordered ones.
 * - 19895 "an order already applied on a previous date": an ordering cannot be
 *   back-dated; the precondition order is applied earlier the same day (via the
 *   drop's own request when none exists). "unchanged with its original effective
 *   dates": the previous entries in History keep their effective-from.
 * - 19899 / 19883: the rows show no Status and no "Effective Start / End Date"
 *   labels (KNOWN FINDING) - the dates are matched as values.
 * - 19901 "without Member Administrator role": the Payer Admin shaped WITH the
 *   COB tab (Cob.GetMemberCobTimeline - it holds no Cob.* right) and WITHOUT
 *   ReorderMemberCoverage (`memberRole`). BLOCKED with the evidence when the
 *   role edit does not reach the account, or when the account cannot see the
 *   member (payer scope).
 * - 19902 (exploratory): a fixed script - drop outside the list, three rapid
 *   drags, a reload mid-drag, re-open - after each, the order shown must equal
 *   the saved order and the rows stay complete (every policy once, badges
 *   Primary / Secondary / Tertiary).
 */
export const CASES = {
  noPolicies: { azureId: '19890' },
  oldestFirst: { azureId: '19891' },
  reorderPrimary: { azureId: '19892' },
  noSharedPosition: { azureId: '19893' },
  newPolicyJoinsEnd: { azureId: '19894' },
  effectiveTodayHistory: { azureId: '19895' },
  singlePolicyNoDrag: { azureId: '19896' },
  twoPoliciesDrag: { azureId: '19897' },
  datesReadOnly: { azureId: '19898' },
  rowDetails: { azureId: '19899' },
  dashboardFollowsPrimary: { azureId: '19900' },
  restrictedReorder: { azureId: '19901', shape: { with: ['cob'], without: ['cobReorder'] } as MemberShape },
  exploratory: { azureId: '19902' },
} as const;

/** The three-policy member: created 60, 20, 40 minutes ahead (start order 2, 3, 1), distinct deductibles. */
export const THREE_POLICIES = [
  { effectiveInMinutes: 60, deductibleAmount: 100 },
  { effectiveInMinutes: 20, deductibleAmount: 0 },
  { effectiveInMinutes: 40, deductibleAmount: 50 },
] as const;

/** The growing member: its first policy, the second (starts earlier), then two new unordered ones (the later-enrolled starts earlier). */
export const GROWING = {
  first: { effectiveInMinutes: 30 },
  second: { effectiveInMinutes: 15 },
  newer: [{ effectiveInMinutes: 55 }, { effectiveInMinutes: 45 }],
} as const;

/** The order badges, top first. */
export const ORDER_BADGES = ['Primary', 'Secondary', 'Tertiary', 'Order 4', 'Order 5'] as const;

/** The reorder toast ("Coverage ordering / Coverage priority updated."). */
export const REORDERED = /coverage (ordering|priority)|order has been updated/i;

/** The empty tab. */
export const EMPTY_COB = /not enrolled in any policy|no coverage ordering/i;

/** The History section's heading. */
export const HISTORY = /history/i;
