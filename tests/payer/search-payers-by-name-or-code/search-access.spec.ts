import { test } from '../../../fixtures';
import { env } from '../../../constants/EnvironmentConfig';

/**
 * User story: Search Payers by Name or Code.
 * Search and Advanced Search must respect the module's role permissions.
 *
 * Requires NON_ADMIN_USERNAME / NON_ADMIN_PASSWORD in .env. This spec opts out
 * of the shared administrator session to authenticate as the restricted role.
 */
test.describe('Search Payers by Name or Code - Access control', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('TC-028: should limit search and advanced search to what the user\'s role permits', async ({
    loginPage,
    payerManagementPage,
  }) => {
    await loginPage.open();
    await loginPage.loginAndWaitForDashboard(env.nonAdminUsername, env.nonAdminPassword);

    await payerManagementPage.navigate();

    // Either the module is inaccessible, or search is present but the user
    // cannot exceed their granted access - both satisfy the RBAC rules.
    await payerManagementPage.expectSearchAccessRestricted();
  });
});
