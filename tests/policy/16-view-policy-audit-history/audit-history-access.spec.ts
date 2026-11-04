import { test, expect, type PolicySession } from '../../../utils/policy/policyRole';
import { POLICY_DETAIL } from '../../../constants/ElementIds';
import { CASES } from '../../../data/policy/viewAuditHistory.data';
import { POLICY_SCOPE, controlAvailability, openScopedPolicies } from '../../../utils/policy/writerAHelpers';

/**
 * User story 15187: View Policy - Audit History - the dedicated permission.
 * The Payer Admin role is shaped without / with GetPolicyAuditTrail (fixture
 * `policyRole`); the policy belongs to NUPCO, one of that account's payers, so
 * it can open it. The administrator first shows the tab is offered to a user
 * holding the right (an absent control must baseline first).
 */
test.describe('US 15187 - View Policy - Audit History - permission', () => {
  test.describe.configure({ timeout: 12 * 60_000 });

  test(`TC-${CASES.noPermission.azureId}: should not show the audit trail to a user without the Audit History permission`, async ({
    policyDetailPage: detail,
    policyIn,
    policyRole,
    requirePolicyListAccess,
    requireBaseline,
    steps,
  }) => {
    const policy = await policyIn('Draft', { payerName: POLICY_SCOPE.payerA, networks: 0 });
    let session!: PolicySession;

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await detail.open(policy.id);
      requireBaseline(await detail.hasTab('audit'), 'the Audit History tab offered to a user holding the right');
      session = await policyRole.signIn({ without: ['audit'] });
      await requirePolicyListAccess(session);
      await openScopedPolicies(session, POLICY_SCOPE.allMine);
      expect(await session.policies.isListed(policy.nameEn), `"${policy.nameEn}" (${POLICY_SCOPE.payerA}) for the restricted user`).toBe(true);
    });

    await steps.step('Open a policy\'s detail view - the policy detail view loads', async () => {
      await session.detail.open(policy.id);
      expect(await session.detail.getName()).toBe(policy.nameEn);
    });

    await steps.step('Attempt to locate or select the Audit History tab - it is not shown, or selecting it shows access denied', async () => {
      const tab = await controlAvailability(session.page, POLICY_DETAIL.tab.audit);
      if (tab === 'available') await session.audit.open().catch(() => undefined);
      const shown = tab === 'available' ? (await session.audit.readEntries()).length : 0;
      expect({ entriesShown: shown, trailReadable: await session.audit.canReadTrail(policy.id) }, `the tab is ${tab} with ${session.removed.join(', ')} withheld`)
        .toEqual({ entriesShown: 0, trailReadable: false });
    });
  });

  test(`TC-${CASES.withPermission.azureId}: should open the audit trail for a user holding the Audit History permission`, async ({
    policyIn,
    policyRole,
    requirePolicyListAccess,
    steps,
  }) => {
    const policy = await policyIn('Future', { payerName: POLICY_SCOPE.payerA });
    let session!: PolicySession;

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      session = await policyRole.signIn({ with: ['audit', 'auditLogs'] });
      await requirePolicyListAccess(session);
      await openScopedPolicies(session, POLICY_SCOPE.allMine);
      expect(await session.policies.isListed(policy.nameEn), `"${policy.nameEn}" for the Compliance Officer`).toBe(true);
    });

    await steps.step('Open a policy\'s detail view - the policy detail view loads', async () => {
      await session.detail.open(policy.id);
      expect(await session.detail.getName()).toBe(policy.nameEn);
    });

    await steps.step('Select the Audit History tab - it opens and the audit records are displayed', async () => {
      expect(await session.detail.hasTab('audit'), 'the Audit History tab').toBe(true);
      await session.audit.open();
      expect((await session.audit.readEntries()).length, 'audit records shown').toBeGreaterThan(0);
    });
  });
});
