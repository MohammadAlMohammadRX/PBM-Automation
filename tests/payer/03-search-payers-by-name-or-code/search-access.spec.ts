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

    await loginPage.open();
    await loginPage.loginAndWaitForDashboard(env.nonAdminUsername, env.nonAdminPassword);

    await payerManagementPage.navigate();

    // Either the module is inaccessible, or search is present but the user
    // cannot exceed their granted access - both satisfy the RBAC rules.
    await payerManagementPage.expectSearchAccessRestricted();
  });
});
