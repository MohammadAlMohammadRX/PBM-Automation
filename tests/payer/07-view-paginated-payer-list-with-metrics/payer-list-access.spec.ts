import { test } from '../../../fixtures';
import { env } from '../../../constants/EnvironmentConfig';

/**
 * User story: View Paginated Payer List with Metrics.
 * Role-based access to the payer list and its metrics.
 *
 * Requires NON_ADMIN_USERNAME / NON_ADMIN_PASSWORD in .env. This spec opts out
 * of the shared administrator session so it can authenticate as the restricted
 * role, exactly as the other access specs in this suite do.
 */
test.describe('View Paginated Payer List with Metrics - Access control', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('TC-010: should deny the payer list and its metrics to a non-administrator', async ({
    loginPage,
    payerManagementPage,
    payerMetrics,
    steps,
  }) => {
    // BLOCKED, not FAIL: without a non-administrator account the denial this
    // case exists to prove can never be exercised. Nothing is learned about the
    // application, so reporting a failure would be a false statement about it.
    if (!env.nonAdminUsername || !env.nonAdminPassword) {
      steps.blocked(
        'NON_ADMIN_USERNAME / NON_ADMIN_PASSWORD are not configured in .env, so a '
          + 'non-administrator session cannot be established.',
      );
    }

    await steps.critical('Sign in as a non-administrator', async () => {
      await loginPage.open();
      await loginPage.loginAndWaitForDashboard(env.nonAdminUsername, env.nonAdminPassword);
    });

    await steps.critical('Navigate to the payer module', () => payerManagementPage.navigate());

    // Either the module is inaccessible, or it is read-only with no usable
    // controls - both satisfy the configured RBAC rules, which is why the
    // Page Object owns the branch rather than the test.
    await steps.step('The payer list is not available to this role', () =>
      payerManagementPage.expectSearchAccessRestricted());

    await steps.step('The dashboard metrics are not available to this role', () =>
      payerMetrics.expectBandUnavailable());
  });
});
