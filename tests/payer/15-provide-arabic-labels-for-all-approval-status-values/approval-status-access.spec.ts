import { test } from '../../../fixtures';
import { env } from '../../../constants/EnvironmentConfig';

/**
 * User story: Provide Arabic Labels for All Approval Status Values, Including
 * Withdrawn.
 * Role-based access to the statuses themselves.
 *
 * Requires NON_ADMIN_USERNAME / NON_ADMIN_PASSWORD in .env. This spec opts out
 * of the shared administrator session so it can authenticate as the restricted
 * role, exactly as the other access specs in this suite do.
 */
test.describe('Provide Arabic Labels for All Approval Status Values - Access control', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('TC-009: should deny the payer list and its statuses when the module is opened by an unauthorized role', async ({
    loginPage,
    payerManagementPage,
    steps,
  }) => {
    // BLOCKED, not FAIL: without a restricted account the denial this case
    // exists to prove can never be exercised.
    if (!env.nonAdminUsername || !env.nonAdminPassword) {
      steps.blocked(
        'NON_ADMIN_USERNAME / NON_ADMIN_PASSWORD are not configured in .env, so an '
          + 'unauthorized session cannot be established. This case needs an account holding '
          + 'none of the payer permissions.',
      );
    }

    await steps.critical('Navigate to the Payer Management module', async () => {
      await loginPage.open();
      await loginPage.loginAndWaitForDashboard(env.nonAdminUsername, env.nonAdminPassword);
      await payerManagementPage.navigate();
    });

    await steps.step('The payer list is not loaded, or shows an access-restricted view', () =>
      payerManagementPage.expectSearchAccessRestricted());

    await steps.step('Opening a specific payer record is unavailable', () =>
      payerManagementPage.expectEditActionDenied());

    // Reached by direct URL rather than by clicking: a module hidden from the
    // navigation but reachable by address is a real access-control failure, and
    // only a direct navigation can show it.
    await steps.step('Reaching the list by direct URL is blocked', async () => {
      await payerManagementPage.navigate();
      await payerManagementPage.expectSearchAccessRestricted();
    });
  });
});
