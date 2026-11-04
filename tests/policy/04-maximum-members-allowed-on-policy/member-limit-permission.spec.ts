import { test, expect, type PolicySession } from '../../../utils/policy/policyRole';
import { CASES, DENIED } from '../../../data/policy/maxMembers.data';
import { readPolicy } from '../../../utils/PolicyProvisioning';
import { expectRefused, isListedFor, said, updateAsSession } from '../../../utils/policy/writerBHelpers';

/**
 * User story 15170: Maximum members allowed on policy - who may change the limit.
 * The non-Policy-Administrator is the Payer Admin role shaped without
 * UpdatePolicy (fixture `policyRole`), on a Draft of that account's own payer.
 */
test.describe('US 15170 - Maximum members allowed on policy - permission', () => {
  test.describe.configure({ timeout: 15 * 60_000 });

  test(`TC-${CASES.limitPermission.azureId}: should keep the Member Limit unchangeable for a role without the edit permission`, async ({
    policyDetailPage,
    policyIn,
    policyRole,
    requirePolicyListAccess,
    requireBaseline,
    page,
    steps,
  }) => {
    const data = CASES.limitPermission;
    const policy = await policyIn('Draft', { payerName: data.payerName, networks: 0, maxMembers: 10 });
    let session!: PolicySession;

    await steps.critical('Navigate to the Policy Management module - the module home page loads', async () => {
      await policyDetailPage.open(policy.id);
      requireBaseline((await policyDetailPage.getActionAvailability('edit')) === 'available', 'Edit (the Coverage Period step) on the Draft');
      session = await policyRole.signIn(data.shape);
      await requirePolicyListAccess(session);
      if (!(await isListedFor(session, policy.nameEn))) {
        steps.blocked(`the shaped Payer Admin is not shown the "${data.payerName}" policy "${policy.nameEn}" - it is outside that account's payer scope`);
      }
      expect(await session.policies.isListed(policy.nameEn)).toBe(true);
    });

    await steps.step('Attempt to open the policy\'s Coverage Period step to edit the Member Limit field - the edit action is unavailable for the current role', async () => {
      await session.detail.open(policy.id);
      expect(await session.detail.getActionAvailability('edit'), `Edit without ${session.removed.join(', ')}`).not.toBe('available');
    });

    await steps.step('Attempt to save a change to the Member Limit - the system blocks the action and shows a permissions error', async () => {
      const answer = await updateAsSession(session.page, page, policy.id, { maxMembers: data.attempted });
      expectRefused(answer, 'UpdatePolicy without the edit permission');
      expect(said(answer)).toMatch(DENIED);
      expect((await readPolicy(page, policy.id)).maxMembers).toBe(10);
    });
  });
});
