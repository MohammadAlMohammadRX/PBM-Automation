import { test } from '../../../fixtures';
import { env } from '../../../constants/EnvironmentConfig';

/**
 * User story: Edit Existing Payer Configuration Details.
 * Only roles with payer-edit permission may reach the Edit action.
 *
 * Requires NON_ADMIN_USERNAME / NON_ADMIN_PASSWORD in .env. This spec opts out
 * of the shared administrator session to authenticate as the restricted role.
 */
test.describe('Edit Existing Payer Configuration Details - Access control', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('TC-006: should deny the Edit action when the user lacks payer-edit permission', async ({
    loginPage,
    payerManagementPage,
  }) => {
    await loginPage.open();
    await loginPage.loginAndWaitForDashboard(env.nonAdminUsername, env.nonAdminPassword);

    await payerManagementPage.navigate();

    await payerManagementPage.expectEditActionDenied();
  });
});
