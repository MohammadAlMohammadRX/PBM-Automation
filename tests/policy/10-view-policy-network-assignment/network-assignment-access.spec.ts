import { test, expect, SCOPED_POLICY_PAYER, networkSelectUsable, rowControlAvailability, type PolicySession } from '../../../utils/policy/writerCHelpers';
import { POLICY_NETWORKS } from '../../../constants/ElementIds';
import { CASES } from '../../../data/policy/networkAssignment.data';

/**
 * User story 15177: View Policy - Network Assignment - who may add / delete.
 * The user without the right is the Payer Admin with AssignPolicyNetwork and
 * UnassignPolicyNetwork withheld (fixture `policyRole`); the Policy
 * Administrator is the administrator. The policy belongs to a payer in the
 * Payer Admin's scope, so only the permission explains what it is offered.
 */
test.describe('US 15177 - View Policy - Network Assignment - access', () => {
  test.describe.configure({ timeout: 15 * 60_000 });

  test(`TC-${CASES.authorizedOnly.azureId}: should offer Add and Delete of network assignments only to a user holding the permissions`, async ({
    page,
    policyManagementPage,
    policyDetailPage,
    policyNetworksTab,
    policyIn,
    policyRole,
    requirePolicyListAccess,
    steps,
  }) => {
    const policy = await policyIn('Draft', { payerName: SCOPED_POLICY_PAYER });
    const code = policy.networks[0].networkCode;
    let session!: PolicySession;

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.step('Log in as a user without the network permissions and open the Network Assignment tab - it is viewable, Add / Delete are disabled or hidden', async () => {
      session = await policyRole.signIn(CASES.authorizedOnly.shape);
      await requirePolicyListAccess(session);
      await session.detail.open(policy.id);
      await session.networks.open();
      await expect(session.networks.rowOf(code)).toBeVisible();
      expect(await networkSelectUsable(session.page), 'Add (the network select + Assign)').toBe(false);
      expect(await rowControlAvailability(session.networks.rowOf(code), POLICY_NETWORKS.remove), 'Delete').not.toBe('available');
    });

    await steps.step('Log in as the Policy Administrator and open the same tab - Add / Delete are enabled and usable', async () => {
      await policyDetailPage.open(policy.id);
      await policyNetworksTab.open();
      expect(await networkSelectUsable(page), 'Add (the network select + Assign)').toBe(true);
      expect(await policyNetworksTab.getRemoveAvailability(code), 'Delete').toBe('available');
    });
  });
});
