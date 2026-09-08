import { test } from '../../../fixtures';
import { env } from '../../../constants/EnvironmentConfig';
import { READ_ONLY_REQUIREMENT } from '../../../data/payers/statusTransition.data';

/**
 * User story: Refine Automatic Status Transitions for Expiry Precedence and
 * Recalculation on Edit.
 * Role-based access to extending an expiry date.
 *
 * Requires NON_ADMIN_USERNAME / NON_ADMIN_PASSWORD in .env. This spec opts out
 * of the shared administrator session so it can authenticate as the restricted
 * role, exactly as the other access specs in this suite do.
 */
test.describe('Refine Automatic Status Transitions - Access control', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('TC-012: should refuse the expiry-date change when an expired payer is opened by a non-approving role', async ({
    loginPage,
    payerManagementPage,
    steps,
  }) => {
    // BLOCKED, not FAIL: without a restricted account the refusal this case
    // exists to prove can never be exercised, so nothing would be learned about
    // the application.
    if (!env.nonAdminUsername || !env.nonAdminPassword) {
      steps.blocked(
        `NON_ADMIN_USERNAME / NON_ADMIN_PASSWORD are not configured in .env. ${
          READ_ONLY_REQUIREMENT.reason
        } Set them to an account holding the "${READ_ONLY_REQUIREMENT.role}" role, then `
          + 're-run this case.',
      );
    }

    await steps.critical('Navigate to the Payer Management module', async () => {
      await loginPage.open();
      await loginPage.loginAndWaitForDashboard(env.nonAdminUsername, env.nonAdminPassword);
      await payerManagementPage.navigate();
    });

    await steps.step('The expiry date cannot be edited by this role', () =>
      payerManagementPage.expectEditActionDenied());

    await steps.step('The approval action is unavailable to this role', () =>
      payerManagementPage.expectSearchAccessRestricted());
  });
});
