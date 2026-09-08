import { test } from '../../../fixtures';
import { env } from '../../../constants/EnvironmentConfig';

/**
 * User story: Validate Payer Licence Number Length and Required Entry.
 * Role-based access to editing a payer's licence number.
 *
 * Requires NON_ADMIN_USERNAME / NON_ADMIN_PASSWORD in .env. This spec opts out
 * of the shared administrator session so it can authenticate as the restricted
 * role, exactly as the other access specs in this suite do.
 */
test.describe('Validate Payer Licence Number Length and Required Entry - Access control', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('TC-016: should keep the licence number read-only when the payer is opened by a limited role', async ({
    loginPage,
    payerManagementPage,
    steps,
  }) => {
    // BLOCKED, not FAIL: without a restricted account the denial this case
    // exists to prove can never be exercised, so nothing would be learned about
    // the application and a failure would be a false statement about it.
    if (!env.nonAdminUsername || !env.nonAdminPassword) {
      steps.blocked(
        'NON_ADMIN_USERNAME / NON_ADMIN_PASSWORD are not configured in .env, so a limited-role '
          + 'session cannot be established. This case needs an account that can open a payer '
          + 'but not edit it.',
      );
    }

    await steps.critical('Navigate to the Payer Management module', async () => {
      await loginPage.open();
      await loginPage.loginAndWaitForDashboard(env.nonAdminUsername, env.nonAdminPassword);
      await payerManagementPage.navigate();
    });

    // Deliberately NOT sampled through the `payerSample` fixture: that fixture
    // drives the list as the current user, and a role restricted enough to make
    // this case meaningful may not be able to read the list at all - so a
    // sampling failure would be reported as a missing precondition rather than
    // as the restriction it is.
    await steps.step('The record is opened in a read-only or restricted mode', () =>
      payerManagementPage.expectSearchAccessRestricted());

    await steps.step('The Licence Number is not editable for this role', () =>
      payerManagementPage.expectEditActionDenied());

    await steps.step('Creating a payer, and so entering a licence number, is also denied', () =>
      payerManagementPage.expectCreateActionDenied());
  });
});
