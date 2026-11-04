import { test, expect, type PolicySession } from '../../../utils/policy/policyRole';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import { POLICY_LIST } from '../../../constants/ElementIds';
import { CASES, IMPORT_MESSAGE } from '../../../data/policy/bulkImport.data';
import { POLICY_SCOPE, controlAvailability, openScopedPolicies, postImportAsSession, said } from '../../../utils/policy/writerAHelpers';

/**
 * User story 15176: Policy Bulk Import (who may import).
 * The restricted user is the Payer Admin account shaped WITHOUT the policy
 * import rights ("Import policies, members and network assignments", "View
 * policy upload history and results"); the administrator first shows the
 * Import control is offered to a user holding them (an absent control must
 * baseline first).
 */
test.describe('US 15176 - Policy Bulk Import access', () => {
  test(`TC-${CASES.noRights.azureId}: should hide or disable Bulk Import and refuse a direct import for a user without the import right`, async ({
    policyManagementPage: list,
    policyRole,
    requirePolicyListAccess,
    requireBaseline,
    steps,
  }) => {
    let session!: PolicySession;

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await list.openTable();
      requireBaseline(await list.isImportOffered(), 'the Import control offered to a user holding the import right');
      session = await policyRole.signIn({ without: ['import', 'importHistory'] });
      await requirePolicyListAccess(session);
      await openScopedPolicies(session, POLICY_SCOPE.allMine);
      expect(await session.policies.isKpiBandVisible(), 'the restricted user\'s list').toBe(true);
    });

    await steps.step('Attempt to access the Bulk Import option as the restricted user - it is hidden or disabled', async () => {
      expect(await controlAvailability(session.page, POLICY_LIST.importTrigger), `Import with ${session.removed.join(', ')} withheld`).not.toBe('available');
    });

    await steps.step('Attempt to invoke the import action directly - the system blocks it with a permissions-denied message', async () => {
      const answer = await postImportAsSession(session.page, ApiEndpoints.policyImport, { name: 'policies.csv', mimeType: 'text/csv', buffer: Buffer.from('Policy Name\nDirect import\n') });
      expect({ refused: answer.status === 401 || answer.status === 403, message: IMPORT_MESSAGE.denied.test(answer.text) || answer.status === 403 }, `ImportPolicies answered ${said(answer)}`)
        .toEqual({ refused: true, message: true });
    });
  });
});
