import { test, expect, type PolicySession } from '../../../utils/policy/policyRole';
import { CASES, DENIED } from '../../../data/policy/policyholder.data';
import { policyHolders, readPolicy } from '../../../utils/PolicyProvisioning';
import { expectRefused, isListedFor, said, updateAsSession } from '../../../utils/policy/writerBHelpers';

/**
 * User story 15172: Assign a Single Policyholder to policy - who may remove or
 * reassign a holder. The unauthorised role is the Payer Admin shaped without
 * UpdatePolicy (fixture `policyRole`), on an approved (Future) and a Draft
 * policy of that account's own payer.
 */
test.describe('US 15172 - Assign a Single Policyholder to policy - permission', () => {
  test.describe.configure({ timeout: 15 * 60_000 });

  test(`TC-${CASES.holderPermission.azureId}: should deny removing or reassigning a policyholder to a role without the permission`, async ({
    policyDetailPage,
    policyIn,
    policyRole,
    requirePolicyListAccess,
    requireBaseline,
    page,
    steps,
  }) => {
    const data = CASES.holderPermission;
    const approved = await policyIn('Future', { payerName: data.payerName });
    const draft = await policyIn('Draft', { payerName: data.payerName, networks: 0 });
    const target = (await policyHolders(page)).find((h) => h.nameEn === data.to);
    let session!: PolicySession;

    await steps.critical('Navigate to the Policy Management module - the module home page loads', async () => {
      await policyDetailPage.open(draft.id);
      requireBaseline((await policyDetailPage.getActionAvailability('edit')) === 'available', 'Edit (the holder) on the Draft');
      session = await policyRole.signIn(data.shape);
      await requirePolicyListAccess(session);
      if (!(await isListedFor(session, draft.nameEn))) {
        steps.blocked(`the shaped Payer Admin is not shown the "${data.payerName}" policies - they are outside that account's payer scope`);
      }
      expect(target, `the holder "${data.to}"`).toBeDefined();
    });

    await steps.step('Attempt to open an approved policy and remove the assigned policyholder - the action is unavailable or blocked due to insufficient permissions', async () => {
      await session.detail.open(approved.id);
      expect(await session.detail.getActionAvailability('edit'), 'Edit on the approved policy').not.toBe('available');
      const answer = await updateAsSession(session.page, page, approved.id, { policyHolderId: null });
      expectRefused(answer, 'removing the holder of the approved policy');
      expect((await readPolicy(page, approved.id)).policyHolderNames).toBe(approved.holderName);
    });

    await steps.step('Attempt to reassign the policyholder on a Draft policy as the unauthorised role - the system denies the action with a permissions error', async () => {
      await session.detail.open(draft.id);
      expect(await session.detail.getActionAvailability('edit'), `Edit without ${session.removed.join(', ')}`).not.toBe('available');
      const answer = await updateAsSession(session.page, page, draft.id, { policyHolderId: target?.id });
      expectRefused(answer, 'reassigning the holder of the Draft');
      expect(said(answer)).toMatch(DENIED);
      expect((await readPolicy(page, draft.id)).policyHolderNames).toBe(draft.holderName);
    });
  });
});
