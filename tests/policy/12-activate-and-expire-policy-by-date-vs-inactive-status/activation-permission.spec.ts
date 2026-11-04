import { test, expect, type PolicySession } from '../../../utils/policy/policyRole';
import { CASES } from '../../../data/policy/activateExpire.data';
import { isListedFor } from '../../../utils/policy/writerBHelpers';

/**
 * User story 15181: Activate and expire Policy - who may inactivate / activate.
 * The non-privileged role is the Payer Admin shaped without InactivatePolicy and
 * SetPolicyActive (fixture `policyRole`), on an approved policy of its own
 * payer; the Policy Administrator is the administrator.
 */
test.describe('US 15181 - Activate and expire Policy - permission', () => {
  test.describe.configure({ timeout: 15 * 60_000 });

  test(`TC-${CASES.activationPermission.azureId}: should offer Inactivate only to a user holding the Policy Administrator permission`, async ({
    policyDetailPage,
    policyIn,
    policyRole,
    requirePolicyListAccess,
    requireBaseline,
    steps,
  }) => {
    const data = CASES.activationPermission;
    const policy = await policyIn('Future', { payerName: data.payerName });
    let session!: PolicySession;

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyDetailPage.open(policy.id);
      requireBaseline((await policyDetailPage.getActionAvailability('inactivate')) === 'available', 'Inactivate on the approved policy');
      session = await policyRole.signIn(data.shape);
      await requirePolicyListAccess(session);
      if (!(await isListedFor(session, policy.nameEn))) {
        steps.blocked(`the shaped Payer Admin is not shown the "${data.payerName}" policy "${policy.nameEn}" - it is outside that account's payer scope`);
      }
      expect(await session.policies.isListed(policy.nameEn)).toBe(true);
    });

    await steps.step('Log in as a user without Policy Administrator permissions and open the policy - the Inactivate action is disabled or hidden', async () => {
      await session.detail.open(policy.id);
      expect(await session.detail.getActionAvailability('inactivate'), `Inactivate without ${session.removed.join(', ')}`).not.toBe('available');
    });

    await steps.step('Log out and log in as a Policy Administrator and open the same policy - the Inactivate action is enabled and usable', async () => {
      await policyDetailPage.open(policy.id);
      expect(await policyDetailPage.getActionAvailability('inactivate')).toBe('available');
      const drawer = await policyDetailPage.openInactivate();
      expect(await drawer.isOpen()).toBe(true);
      await drawer.cancel();
    });
  });
});
