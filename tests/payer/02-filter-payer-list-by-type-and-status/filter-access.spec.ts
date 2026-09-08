import { test } from '../../../fixtures';
import { env } from '../../../constants/EnvironmentConfig';

/**
 * User story: Filter Payer List by Type and Status.
 * Role-based access to the payer list and its filter controls.
 *
 * Requires NON_ADMIN_USERNAME / NON_ADMIN_PASSWORD in .env. This spec opts out
 * of the shared administrator session to authenticate as the restricted role.
 */
test.describe('Filter Payer List by Type and Status - Access control', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('TC-011: should restrict the payer list and its filter controls when the user is not a System Administrator', async ({
    loginPage,
    payerManagementPage,
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
    // filter controls - both satisfy the configured RBAC rules.
    await steps.step('The payer list and its filter controls are restricted', () =>
      payerManagementPage.expectFilterControlsRestricted());
  });
});
