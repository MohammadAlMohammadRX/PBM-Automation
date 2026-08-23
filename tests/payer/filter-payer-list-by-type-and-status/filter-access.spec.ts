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
  }) => {
    await loginPage.open();
    await loginPage.loginAndWaitForDashboard(env.nonAdminUsername, env.nonAdminPassword);

    await payerManagementPage.navigate();

    // Either the module is inaccessible, or it is read-only with no usable
    // filter controls - both satisfy the configured RBAC rules.
    await payerManagementPage.expectFilterControlsRestricted();
  });
});
