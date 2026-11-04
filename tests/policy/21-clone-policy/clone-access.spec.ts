import { test, expect, type PolicySession } from '../../../utils/policy/policyRole';
import { CASES, cloneName } from '../../../data/policy/clonePolicy.data';
import { clonePolicy } from '../../../utils/PolicyProvisioning';
import { POLICY_SCOPE, openScopedPolicies, said } from '../../../utils/policy/writerAHelpers';

/**
 * User story 18433: Clone Policy (who may clone).
 * The Viewer is the Payer Admin shaped without ClonePolicy and
 * GetPolicyForClone; the source is the case's own draft of NUPCO, one of that
 * account's payers, so it can open it. The administrator first shows Clone is
 * offered to a user holding the right (an absent control must baseline first).
 */
test.describe('US 18433 - Clone Policy access', () => {
  test(`TC-${CASES.nonAdmin.azureId}: should not let a user without the clone right clone a policy`, async ({
    policyDetailPage: detail,
    policyIn,
    policyRole,
    requirePolicyListAccess,
    requireBaseline,
    discardPolicyNamed,
    steps,
  }) => {
    const source = await policyIn('Draft', { payerName: POLICY_SCOPE.payerA, networks: 0 });
    const attempted = cloneName();
    discardPolicyNamed(attempted);
    let session!: PolicySession;

    await steps.critical('Navigate to the Policy Management module - the module home page loads', async () => {
      await detail.open(source.id);
      requireBaseline((await detail.getActionAvailability('clone')) === 'available', 'Clone offered to a user holding the right');
      session = await policyRole.signIn({ without: ['clone', 'viewForClone'] });
      await requirePolicyListAccess(session);
      await openScopedPolicies(session, POLICY_SCOPE.allMine);
      expect(await session.policies.isListed(source.nameEn), `"${source.nameEn}" for the Viewer`).toBe(true);
    });

    await steps.step('Open an existing policy - the policy details are shown', async () => {
      await session.detail.open(source.id);
      expect(await session.detail.getName()).toBe(source.nameEn);
    });

    await steps.step('Look for or attempt to trigger the Clone Policy action - it is unavailable, disabled, or denied with an authorisation error', async () => {
      const header = await session.detail.getActionAvailability('clone');
      await openScopedPolicies(session, POLICY_SCOPE.allMine);
      const row = (await session.policies.getActionState(source.nameEn, 'clone')).availability;
      const direct = await clonePolicy(session.page, source.id, { nameEn: attempted });
      expect({ header: header !== 'available', row: row !== 'available', direct: [401, 403].includes(direct.status) }, `withheld ${session.removed.join(', ')}; header ${header}, row ${row}, ClonePolicy ${said(direct)}`)
        .toEqual({ header: true, row: true, direct: true });
    });
  });
});
