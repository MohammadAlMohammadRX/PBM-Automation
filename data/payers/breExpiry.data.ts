import { nonAdminBlockReason } from '../accounts/nonAdminAccount.data';
import type { BlockedCase } from './payerTypes';

/**
 * Test data for "Stop Payer Validity in BRE on Expiry".
 *
 * The story is about the Business Rule Engine and claims adjudication: once a
 * payer is Expired, eligibility checks and claim evaluation must refuse it.
 * Neither the BRE nor a claims interface is reachable from this framework, so
 * those cases are BLOCKED on one.
 *
 * WHAT IS REACHABLE is the payer module's own half of the rule: a payer that
 * is not Active must not be offered where new records are created against a
 * payer. The cross-module payer selection (the plan create form's payer
 * field) is that surface, and it excludes non-Active payers - which is the
 * mechanism the "new policy creation is blocked for an Expired payer" cases
 * describe. This environment cannot manufacture an EXPIRED payer (the
 * transition is a scheduled job), so the non-Active class it CAN produce - an
 * approved Inactive payer - stands in, and the reframing is stated in the
 * case title.
 */

/** The account the access-control case needs. */
export const BRE_ROLE_REQUIREMENT = {
  role: 'a view-only role (e.g. Business Analyst) without payer status rights',
  reason:
    'The case proves only authorised roles can move a payer to or from Expired. The shared '
    + 'administrator can, so it cannot show the withheld half.',
} as const;

const NEEDS_BRE =
  'This case observes the Business Rule Engine or claims adjudication - a payer\'s eligibility '
  + 'verdict, a claim\'s acceptance or its error code. Neither system has an interface this '
  + 'framework can reach. Provide a BRE/claims test endpoint (or its UI) and re-run.';

const NEEDS_EXPIRED_PAYER =
  'This case needs a payer in EXPIRED status, which only the scheduled lifecycle job produces '
  + 'and this environment cannot provision on demand. Provide a disposable expired payer and re-run.';

/** The sheet's cases this environment cannot exercise, in renumbered order. */
export const BLOCKED_CASES: readonly BlockedCase[] = [
  { id: '001', title: 'should exclude the payer from BRE eligibility immediately when it becomes Expired', reason: NEEDS_BRE },
  { id: '002', title: 'should update the BRE state in real time when the payer moves from Active to Expired', reason: NEEDS_BRE },
  { id: '005', title: 'should evaluate a claim dated exactly on the expiry date per the boundary rule', reason: NEEDS_BRE },
  { id: '006', title: 'should accept a claim dated one day before expiry', reason: NEEDS_BRE },
  { id: '007', title: 'should reject a claim dated one day after expiry with the defined error code', reason: NEEDS_BRE },
  { id: '008', title: 'should partition claims well before and well after expiry as accepted and rejected', reason: NEEDS_BRE },
  { id: '009', title: 'should decide claim acceptance from the payer status and claim date matrix', reason: `${NEEDS_BRE} The matrix also needs Suspended and Pending payers.` },
  { id: '010', title: 'should return the exact documented error code and message for an expired payer\'s claim', reason: NEEDS_BRE },
  { id: '011', title: 'should evaluate a midnight-boundary claim consistently across time zones', reason: NEEDS_BRE },
  { id: '012', title: 'should apply one validity rule consistently when the payer expires mid-claim', reason: NEEDS_BRE },
  {
    id: '013',
    title: 'should let only authorised roles change a payer\'s status to or from Expired',
    reason: `${nonAdminBlockReason({ lacking: ['changePayerStatus'] })} ${BRE_ROLE_REQUIREMENT.reason}`,
  },
  { id: '014', title: 'should deliver the Expired status event to the BRE interface and update its eligibility data', reason: NEEDS_BRE },
  { id: '015', title: 'should keep outcomes consistent across rapid reactivation and re-expiry', reason: `${NEEDS_EXPIRED_PAYER} ${NEEDS_BRE}` },
  { id: '016', title: 'should populate every field of the blocked-policy-creation error response', reason: `${NEEDS_EXPIRED_PAYER} The error response is only produced by a policy-creation attempt against an Expired payer.` },
];
