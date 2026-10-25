import type { NetworkBlockedCase } from './network.data';
import { networkStamp } from '../../utils/NetworkProvisioning';

/**
 * Test data for US 14128 "Activate network manually from Inactive status".
 *
 * Activation raises the shared #pbm-dialog ("Activate Network"); confirming
 * STAGES the change, which takes effect only after Send for Approval and an
 * approval (verified for networks since story 21, 2026-10-12).
 *
 * The sheet's "Inactive network with an expiry date in the past" (17825) is not
 * a state this environment can hold: the lifecycle job runs every minute and
 * moves such a network to Expired. The case therefore runs on an Expired
 * network - the state that rule produces - and asserts the same block and the
 * same "extend the expiry date" instruction.
 */

/** The refusal messages each blocker must be explained with (matched loosely). */
export const BLOCKER_MESSAGE = {
  expiry: /expir/i,
  facility: /facilit|pharmac/i,
  payer: /payer/i,
  duplicateName: /name|already|exist|duplicate/i,
} as const;

/** The status ids an approved activation must leave cleared. */
export const CLEARED_INACTIVATION_FIELDS = [
  'inactivationReasonId',
  'inactivationDetails',
  'inactivatedBy',
  'inactivatedOn',
] as const;

/** The details text the Inactive fixture records ("Deactivated by an automated regression test."). */
export const FIXTURE_INACTIVATION_DETAILS = 'Deactivated by an automated regression test.';

/** The reason used when this story inactivates an owning payer. */
export const PAYER_INACTIVATION_DETAILS = 'Inactivated to test a network whose payer is not active.';

/** A shared English name for the duplicate-name cases ("North Region Network" in the sheet). */
export const duplicateName = (): string => `North Region Network ${networkStamp()}`;

/** What an unauthorised direct request must answer. */
export const UNAUTHORISED: readonly number[] = [401, 403];

/** Lifecycle budget per case: provisioning an Inactive network costs ~4 minutes. */
export const LIFECYCLE_TIMEOUT_MS = 25 * 60_000;

/** Status-change audit entries: old and new values and who did it. */
export const ACTIVATION_AUDIT = {
  action: /Status Change/i,
  statusField: /status/i,
  before: 'Inactive',
  after: 'Active',
  meta: /\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}\s*•\s*\S+/,
} as const;

export const BLOCKED_CASES: readonly NetworkBlockedCase[] = [
  {
    azureId: '17833',
    title: 'should leave the facility Active and the linked policy Inactive when the network is reactivated',
    reason:
      'Needs a SUITE-OWNED Inactive network with an assigned facility AND a linked policy that is Inactive. Policies '
      + 'are linked to networks from the Policy module (AssignPolicyNetwork) and no suite helper creates that link; '
      + 'the register networks that already have policies are shared team data a case must not reactivate. '
      + 'Unblock with a policy-linking fixture or a reserved network-with-policy.',
  },
  {
    azureId: '17835',
    title: 'should report every activation blocker and only the remaining ones as each is fixed when all blockers apply at once',
    reason:
      'Needs a network that is simultaneously Inactive, past its expiry date, without a facility and owned by an '
      + 'inactive payer. That state cannot be held here: the lifecycle job (every minute) turns an Inactive network '
      + 'past its expiry into Expired, and an inactive payer cannot be selected in the Network module scope to fix '
      + 'blockers one at a time. Unblock with a seeded network in that state and a pausable lifecycle job.',
  },
];
