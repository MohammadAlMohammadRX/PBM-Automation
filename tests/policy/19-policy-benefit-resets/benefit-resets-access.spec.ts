import { test, expect, resetsMenuOffered, type PolicySession } from '../../../utils/policy/writerCHelpers';
import { CASES, DENIED } from '../../../data/policy/benefitResets.data';

/**
 * User story 18366: Policy Benefit Resets - "by System Administrators only".
 * The non-System-Administrator is the Payer Admin account as it is (no
 * shaping: its role is a payer role, not a system administrator). The menu
 * entry is baselined on the administrator's own screen first.
 */
test.describe('US 18366 - Policy Benefit Resets - access', () => {
  test.describe.configure({ timeout: 10 * 60_000 });

  test(`TC-${CASES.sysAdminOnly.azureId}: should keep a non-System-Administrator out of Policy Benefit Resets`, async ({
    page,
    policyManagementPage,
    policyRole,
    requireBaseline,
    steps,
  }) => {
    let session!: PolicySession;

    await steps.critical('Navigate to the Policy Management module - the module home page loads', async () => {
      await policyManagementPage.openTable();
      requireBaseline(await resetsMenuOffered(page), 'the Policy Benefit Resets menu entry (for the administrator)');
      session = await policyRole.signIn({});
      await session.policies.open();
      expect(session.page.url()).toMatch(/^https?:/);
    });

    await steps.step('Attempt to open Policy Benefit Resets from the menu - the option is hidden or disabled for this role', async () => {
      expect(await resetsMenuOffered(session.page)).toBe(false);
    });

    await steps.step('Attempt to open the Policy Benefit Resets page directly - access is denied with an unauthorized message', async () => {
      await session.resets.openExpectingDenial();
      expect(await session.resets.isLoaded(), 'the Policy Benefit Resets screen rendered').toBe(false);
      expect(await session.detail.getScreenText()).toMatch(DENIED);
    });
  });
});
