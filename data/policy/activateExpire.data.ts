import type { PolicyShape } from './policyPermissions.data';
import { POLICY_SCOPED_PAYER } from '../../utils/policy/writerBHelpers';

/**
 * US 15181 "Activate and expire Policy by date vs Inactive status" (policy folder 12).
 *
 * In this build (foundation notes, 2026-11-03): Inactivate opens a drawer
 * (reason required - Contract Suspended, Payment Issue, Policy Holder Request,
 * Compliance Issue, Other - details optional, max 500) and STAGES the change;
 * Activate (Inactive only) asks "Activate policy?" and stages it too; both take
 * effect when sent for approval and approved. An approved re-activation was seen
 * to come back FUTURE, not Active, even past the effective time - asserted as
 * the case states (Active), so that is reported where it happens. Expired is
 * reached only by the daily job.
 *
 * Literal readings and TC-vs-AC notes:
 * - 19580 / 19585 "status updates to Active": the activation is confirmed, sent
 *   for approval and approved (the application's gate), on a policy that WAS
 *   Active before it was inactivated - an Active seed inactivated and approved
 *   (inactiveFromActiveSeed), so Active is the only correct outcome. Changed in
 *   the 2026-11-04 triage: the earlier precondition (a Future policy past its
 *   effective time) was never Active - only the daily lifecycle job (00:15
 *   local on 2026-11-04) turns a Future policy Active - so it could not show
 *   whether a reactivation restores Active. Each case uses up one Active seed.
 * - 19581 / 19582 "an Active policy": inactivation does not depend on Active vs
 *   Future, so an approved (Future) policy is used - Active policies are scarce
 *   seeds (brief); 19582's "still Active" is read as "status unchanged".
 *   19581's "reason" is the reason select (Compliance Issue) plus the sheet's
 *   text in Details.
 * - 19583 "missing a required activation condition (e.g. the draft v0)": a v0
 *   cannot be Inactive, so the unmet requirement is the one this build enforces
 *   on approval - the policy's only network is staged for removal ("A policy must
 *   have at least one assigned network before this change can be approved.").
 * - 19584 / 19586: Expired cannot be produced on demand; an EXISTING Expired
 *   policy of any payer is only looked at (read-only). With none in the register
 *   the case is BLOCKED.
 * - 19587 "history / audit trail": the Audit History tab and its trail
 *   (GetPolicyAuditTrail). "The inactivation event" is the entry that records
 *   it: live an approved inactivation is audited as UPDATE ("Policy updated",
 *   IsActive true -> false with the reason and details), not STATUS_CHANGE.
 * - 19589: the non-privileged role is the Payer Admin shaped without
 *   InactivatePolicy / SetPolicyActive, on an approved policy of its own payer
 *   ("an Active policy" read as approved, as for 19581).
 */
export const CASES = {
  manualActivate: { azureId: '19580' },
  inactivateWithReason: { azureId: '19581', reason: 'Compliance Issue', details: 'Suspended pending compliance review' },
  reasonRequired: { azureId: '19582' },
  activationRequirements: { azureId: '19583' },
  inactiveVsExpired: { azureId: '19584' },
  membersKept: { azureId: '19585', members: 2 },
  expiredNoActivate: { azureId: '19586' },
  historyKept: { azureId: '19587', details: 'Inactivated by the automation suite to check the history is kept.' },
  activationPermission: { azureId: '19589', payerName: POLICY_SCOPED_PAYER, shape: { without: ['inactivate', 'activate'] } satisfies PolicyShape },
} as const;

/** No Expired policy to look at. */
export const NO_EXPIRED_REASON = 'no policy in the register reads Expired: Expired is set only by the daily lifecycle job after a policy\'s expiry '
  + '(and grace period), so it cannot be produced on demand, and this case only looks at an existing one.';

/** The unmet requirement's message, as the server words it. */
export const UNMET_REQUIREMENT = /at least one assigned network|requirement|cannot be activated|must have/i;
