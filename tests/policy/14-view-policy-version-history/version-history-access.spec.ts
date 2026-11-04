import { test, expect, type PolicySession } from '../../../utils/policy/policyRole';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import { POLICY_DETAIL } from '../../../constants/ElementIds';
import { CASES } from '../../../data/policy/viewVersionHistory.data';
import { NetworkUtils } from '../../../utils/NetworkUtils';
import { POLICY_SCOPE, controlAvailability, openScopedPolicies, said } from '../../../utils/policy/writerAHelpers';

/**
 * User story 15185: View Policy - Version History (who may see and revert).
 * The "Data Entry" user is the Payer Admin shaped without GetPolicyVersions
 * and RevertPolicyVersion; the policy is built for NUPCO, one of that
 * account's payers, so the account can open it. The administrator first shows
 * the tab is offered to a user holding the right.
 */
test.describe('US 15185 - Version History access', () => {
  test(`TC-${CASES.noPermission.azureId}: should hide the Version History and refuse a revert for a user without the version history rights`, async ({
    policyDetailPage: detail,
    policyIn,
    policyRole,
    requirePolicyListAccess,
    requireBaseline,
    steps,
  }) => {
    const policy = await policyIn('Draft', { payerName: POLICY_SCOPE.payerA, networks: 0 });
    let session!: PolicySession;

    await steps.critical('Navigate to the Policy Management module - the module home screen shows the policy list', async () => {
      await detail.open(policy.id);
      requireBaseline(await detail.hasTab('versions'), 'the Version History tab offered to a user holding the right');
      session = await policyRole.signIn({ without: ['versions', 'revert'] });
      await requirePolicyListAccess(session);
      await openScopedPolicies(session, POLICY_SCOPE.allMine);
      expect(await session.policies.isListed(policy.nameEn), `"${policy.nameEn}" (${POLICY_SCOPE.payerA}) for the restricted user`).toBe(true);
    });

    await steps.step('Open the policy record - the Version History tab is hidden or disabled', async () => {
      await session.detail.open(policy.id);
      expect(await controlAvailability(session.page, POLICY_DETAIL.tab.versions), `the tab with ${session.removed.join(', ')} withheld`).not.toBe('available');
    });

    await steps.step('Attempt to access the version history or the revert action directly - the system blocks it', async () => {
      const read = await NetworkUtils.requestAsSession(session.page, 'GET', `${ApiEndpoints.policyVersions}/${policy.id}`);
      const revert = await NetworkUtils.postAsSession(session.page, ApiEndpoints.policyRevert, { policyId: policy.id, targetVersion: 1 });
      // The revert must be refused for the RIGHT, not for the draft having no version to revert to: 401 / 403.
      expect({ read: read.status >= 400, revert: [401, 403].includes(revert.status) }, `GetPolicyVersions ${said(read)}; RevertPolicyVersion ${said(revert)}`).toEqual({ read: true, revert: true });
    });
  });
});
