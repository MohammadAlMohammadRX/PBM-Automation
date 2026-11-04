import { test, expect, type PolicySession } from '../../../utils/policy/policyRole';
import type { PolicyFormDrawer } from '../../../pages/policy/PolicyFormDrawer';
import { APPROVAL_RIGHT_REASON, CASES } from '../../../data/policy/createPolicy.data';
import { NON_ADMIN_PROFILE } from '../../../data/accounts/nonAdminAccount.data';
import { openScopedPolicyList } from '../../../utils/policy/writerBHelpers';

/**
 * User story 15173: Create policy - the payer a user works for, and who may
 * create. The Payer Admin account (fixture `policyRole`) is the user tied to a
 * payer; shaped without CreatePolicy it is the unauthorised role. See the data
 * file for 19451's approval half.
 */
test.describe('US 15173 - Create policy - payer and access', () => {
  test.describe.configure({ timeout: 15 * 60_000 });

  test(`TC-${CASES.payerDefault.azureId}: should fill the Payer with the logged-in user's current payer`, async ({
    policyRole,
    requirePolicyListAccess,
    steps,
  }) => {
    const data = CASES.payerDefault;
    let session!: PolicySession;
    let drawer!: PolicyFormDrawer;

    await steps.critical('Navigate to the Policy Management module - the module home page loads', async () => {
      session = await policyRole.signIn({});
      await requirePolicyListAccess(session);
      await openScopedPolicyList(session);
      expect(await session.policies.isAddOffered(), 'Add Policy for the Payer Admin').toBe(true);
    });

    await steps.critical('Select Create New Policy - the Step 1 form is displayed', async () => {
      drawer = await session.policies.openAddForm();
      expect(await drawer.currentStep()).toBe(1);
    });

    await steps.step(`Review the Payer field - it is pre-populated with the current payer (${data.payerName}) and cannot be left blank`, async () => {
      const shown = (await drawer.readPayerTag()) || (await drawer.readSelect('payer'));
      expect(shown, 'the Payer the drawer opened with').toBe(data.payerName);
      expect([...NON_ADMIN_PROFILE.scopedPayers]).toContain(shown);
      await drawer.close(true);
    });
  });

  test(`TC-${CASES.createAccess.azureId}: should keep Create and Approve away from a role without those permissions`, async ({
    policyManagementPage,
    policyRole,
    requirePolicyListAccess,
    requireBaseline,
    steps,
  }) => {
    const data = CASES.createAccess;
    let session!: PolicySession;

    await steps.critical('Navigate to the Policy Management module - the module home page loads', async () => {
      await policyManagementPage.openTable();
      requireBaseline(await policyManagementPage.isAddOffered(), 'Add Policy for a user holding CreatePolicy');
      session = await policyRole.signIn(data.shape);
      await requirePolicyListAccess(session);
      await openScopedPolicyList(session);
      expect(await session.policies.canListPolicies()).toBe(true);
    });

    await steps.step('Attempt to select Create New Policy - the action is unavailable or an access-denied message is shown for the unauthorised role', async () => {
      const stillTold = session.stillHeld.length > 0 ? ` - the signed-in account is still told it holds ${session.stillHeld.join(', ')}` : '';
      expect(await session.policies.isAddOffered(), `Add Policy is still offered to the role without ${session.removed.join(', ')}${stillTold}`).toBe(false);
    });

    await steps.step('Attempt to approve a Pending Approval policy as the same unauthorised user - the Approve action is not available or is blocked', async () => {
      steps.blocked(APPROVAL_RIGHT_REASON);
    });
  });
});
