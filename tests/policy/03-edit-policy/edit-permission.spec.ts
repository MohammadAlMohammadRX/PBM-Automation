import { test, expect, type PolicySession } from '../../../utils/policy/policyRole';
import { CASES } from '../../../data/policy/editPolicy.data';
import { isListedFor } from '../../../utils/policy/writerBHelpers';

/**
 * User story 15169: Edit policy - who may edit a draft.
 * The view-only user is the Payer Admin role shaped without the policy write
 * rights (fixture `policyRole`, utils/policy/policyRole.ts), on a Draft of that
 * account's own payer - so only the permission can explain what it is offered.
 * The user with edit permission is the administrator.
 */
test.describe('US 15169 - Edit policy - permission', () => {
  test.describe.configure({ timeout: 15 * 60_000 });

  test(`TC-${CASES.editPermission.azureId}: should hide Edit on a Draft V0 from a view-only user and offer it to a user with edit permission`, async ({
    policyManagementPage,
    policyDetailPage,
    policyIn,
    policyRole,
    requirePolicyListAccess,
    requireBaseline,
    steps,
  }) => {
    const data = CASES.editPermission;
    const policy = await policyIn('Draft', { payerName: data.payerName, networks: 0 });
    let session!: PolicySession;

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyDetailPage.open(policy.id);
      requireBaseline((await policyDetailPage.getActionAvailability('edit')) === 'available', 'Edit on the Draft V0');
      session = await policyRole.signIn(data.shape);
      await requirePolicyListAccess(session);
      if (!(await isListedFor(session, policy.nameEn))) {
        steps.blocked(`the shaped Payer Admin is not shown the "${data.payerName}" policy "${policy.nameEn}" - it is outside that account's payer scope`);
      }
      expect(await session.policies.isListed(policy.nameEn)).toBe(true);
    });

    await steps.step('Log in as the view-only user and open a policy in Draft V0 - the policy view page opens', async () => {
      await session.detail.open(policy.id);
      expect(await session.detail.getName()).toBe(policy.nameEn);
    });

    await steps.step('Check for the edit action - it is hidden or disabled for this user', async () => {
      expect(await session.detail.getActionAvailability('edit'), `Edit without ${session.removed.join(', ')}`).not.toBe('available');
    });

    await steps.step('Log out and log in as the user with edit permission - the dashboard loads for this user', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.countRows()).toBeGreaterThan(0);
    });

    await steps.step('Open the same Draft policy and check for the edit action - it is visible and enabled', async () => {
      await policyDetailPage.open(policy.id);
      expect(await policyDetailPage.getActionAvailability('edit')).toBe('available');
    });
  });
});
