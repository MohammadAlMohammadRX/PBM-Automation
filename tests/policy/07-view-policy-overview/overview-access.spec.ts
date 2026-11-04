import { test, expect, type PolicySession } from '../../../utils/policy/policyRole';
import { CASES, DENIED } from '../../../data/policy/policyOverview.data';
import { openScopedPolicyList } from '../../../utils/policy/writerBHelpers';

/**
 * User story 15174: View Policy - Overview - a user without the view right.
 * The "Basic User" is the Payer Admin role shaped without GetPolicy (fixture
 * `policyRole`), asked for a Draft of its own payer - so only the permission
 * can explain a refusal.
 */
test.describe('US 15174 - View Policy - Overview - access', () => {
  test.describe.configure({ timeout: 15 * 60_000 });

  test(`TC-${CASES.noViewAccess.azureId}: should deny the policy details to a user without the policy-view permission`, async ({
    policyDetailPage,
    policyIn,
    policyRole,
    requireBaseline,
    steps,
  }) => {
    const data = CASES.noViewAccess;
    const policy = await policyIn('Draft', { payerName: data.payerName, networks: 0 });
    let session!: PolicySession;

    await steps.critical('Navigate to the Policy Management module - the module loads, or access is restricted at module level', async () => {
      await policyDetailPage.open(policy.id);
      requireBaseline(await policyDetailPage.isLoaded(), 'the policy record for a user holding GetPolicy');
      session = await policyRole.signIn(data.shape);
      await openScopedPolicyList(session);
      expect(session.page.url()).toContain('/');
    });

    await steps.step('Attempt to open an existing policy record as the unauthorised user - the system denies access', async () => {
      await session.detail.openExpectingFailure(policy.id);
      expect(await session.detail.isLoaded(), `the policy record without ${session.removed.join(', ')}`).toBe(false);
    });

    await steps.step('Observe the message presented - an access denied / insufficient permissions message is displayed and no policy data is revealed', async () => {
      const text = await session.detail.getScreenText();
      expect(text).toMatch(DENIED);
      expect(text, 'policy data on the denied screen').not.toContain(policy.nameEn);
      expect(text, 'policy data on the denied screen').not.toContain(policy.policyNumber);
    });
  });
});
