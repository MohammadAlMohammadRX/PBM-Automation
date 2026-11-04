import { test, expect, type PolicySession } from '../../../utils/policy/policyRole';
import { CASES, DENIED } from '../../../data/policy/deletePolicy.data';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import { readPolicyOrNull } from '../../../utils/PolicyProvisioning';
import { expectRefused, isListedFor, requestAs, said } from '../../../utils/policy/writerBHelpers';

/**
 * User story 15183: Delete Policy - a user without the deletion permission.
 * The Read-Only Viewer is the Payer Admin role shaped without DeletePolicy
 * (fixture `policyRole`), on a Draft of its own payer - a Draft offers Delete
 * to a user holding the right, so only the permission explains its absence.
 */
test.describe('US 15183 - Delete Policy - access', () => {
  test.describe.configure({ timeout: 15 * 60_000 });

  test(`TC-${CASES.viewerCannotDelete.azureId}: should hide Delete from a user without the deletion permission and block a direct deletion`, async ({
    policyDetailPage,
    policyIn,
    policyRole,
    requirePolicyListAccess,
    requireBaseline,
    page,
    steps,
  }) => {
    const data = CASES.viewerCannotDelete;
    const policy = await policyIn('Draft', { payerName: data.payerName, networks: 0 });
    let session!: PolicySession;

    await steps.critical('Navigate to the Policy Management module - the module home screen loads showing the policy list', async () => {
      await policyDetailPage.open(policy.id);
      requireBaseline((await policyDetailPage.getActionAvailability('delete')) === 'available', 'Delete on the Draft');
      session = await policyRole.signIn(data.shape);
      await requirePolicyListAccess(session);
      if (!(await isListedFor(session, policy.nameEn))) {
        steps.blocked(`the shaped Payer Admin is not shown the "${data.payerName}" policy "${policy.nameEn}" - it is outside that account's payer scope`);
      }
      expect(await session.policies.isListed(policy.nameEn)).toBe(true);
    });

    await steps.step('Locate any policy record - the Delete action is either hidden or disabled for this user', async () => {
      const row = (await session.policies.getActionState(policy.nameEn, 'delete')).availability;
      await session.detail.open(policy.id);
      const header = await session.detail.getActionAvailability('delete');
      expect({ row: row === 'available', header: header === 'available' }, `Delete without ${session.removed.join(', ')}`).toEqual({ row: false, header: false });
    });

    await steps.step('Attempt to trigger the deletion directly - the system blocks the action', async () => {
      const answer = await requestAs(session, 'DELETE', `${ApiEndpoints.policyDelete}/${policy.id}`);
      expectRefused(answer, 'DeletePolicy without the right');
      expect(said(answer)).toMatch(DENIED);
      expect(await readPolicyOrNull(page, policy.id), 'the policy must still exist').not.toBeNull();
    });
  });
});
