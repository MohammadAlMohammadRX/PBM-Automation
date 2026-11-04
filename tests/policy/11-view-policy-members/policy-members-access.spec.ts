import { test, expect, SCOPED_POLICY_PAYER, type PolicySession } from '../../../utils/policy/writerCHelpers';
import { CASES } from '../../../data/policy/policyMembers.data';

/**
 * User story 15178: View Policy - Members - who may add / delete. The user
 * without member-management permission is the Payer Admin with AddPolicyMember
 * and RemovePolicyMember withheld (fixture `policyRole`); the Insurance
 * Coordinator is the administrator. The policy (Individual, so it takes a
 * member in Draft) belongs to a payer in the Payer Admin's scope.
 */
test.describe('US 15178 - View Policy - Members - access', () => {
  test.describe.configure({ timeout: 15 * 60_000 });

  test(`TC-${CASES.authorizedOnly.azureId}: should offer Add and Delete of members only to a user holding the member permissions`, async ({
    policyManagementPage,
    policyDetailPage,
    policyMembersTab,
    policyIn,
    policyRole,
    requirePolicyListAccess,
    steps,
  }) => {
    const policy = await policyIn('Draft', { type: 'individual', members: 1, networks: 0, payerName: SCOPED_POLICY_PAYER });
    const code = policy.members[0].memberCode;
    let session!: PolicySession;

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.step('Log in as a user without member-management permission and open the Members tab - Add / Delete are disabled or hidden', async () => {
      session = await policyRole.signIn(CASES.authorizedOnly.shape);
      await requirePolicyListAccess(session);
      await session.detail.open(policy.id);
      await session.members.open();
      await expect(session.members.rowOf(code)).toBeVisible();
      expect(await session.members.getAddAvailability(), 'Add Member').not.toBe('available');
      expect(await session.members.getRowActionAvailability(code, 'remove'), 'Delete').not.toBe('available');
    });

    await steps.step('Log in as the Insurance Coordinator and open the same tab - Add / Delete are enabled and usable', async () => {
      await policyDetailPage.open(policy.id);
      await policyMembersTab.open();
      expect(await policyMembersTab.getAddAvailability(), 'Add Member').toBe('available');
      expect(await policyMembersTab.getRowActionAvailability(code, 'remove'), 'Delete').toBe('available');
    });
  });
});
