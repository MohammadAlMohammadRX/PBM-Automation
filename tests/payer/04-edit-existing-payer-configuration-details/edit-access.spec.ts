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

    await steps.critical('Sign in as a user without payer-edit permission', async () => {
      await loginPage.open();
      await loginPage.loginAndWaitForDashboard(env.nonAdminUsername, env.nonAdminPassword);
    });

    await steps.critical('Navigate to the payer module', () => payerManagementPage.navigate());

    await steps.step('The Edit action is not offered', () =>
      payerManagementPage.expectEditActionDenied());
  });
});
