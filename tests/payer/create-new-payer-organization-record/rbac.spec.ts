import { test } from '../../../fixtures';
import { env } from '../../../constants/EnvironmentConfig';

/**
 * User story: Create New Payer Organization Record.
 * Only System Administrators may create a payer. This spec logs in as a NON-admin
 * (Standard User / Reviewer) and asserts the Create action is denied.
 *
 * Requires NON_ADMIN_USERNAME / NON_ADMIN_PASSWORD in .env. This test opts out of
 * the shared admin session so it can authenticate as the lower-privilege user.
 */
test.describe('Create New Payer Organization Record - Access control', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('TC-012: should deny the Create New Payer action when the user lacks the System Administrator role', async ({
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

    // The Create action must not be offered to a non-admin.
    await steps.step('The Create New Payer action is not offered', () =>
      payerManagementPage.expectCreateActionDenied());
  });
});
