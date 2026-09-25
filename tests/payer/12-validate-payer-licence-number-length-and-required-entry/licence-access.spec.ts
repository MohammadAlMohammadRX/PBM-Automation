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

  // Azure test case 15338
  test('15338: should keep the licence number read-only when the payer is opened by a limited role', async ({
    shapeRole,
    loginPage,
    payerManagementPage,
    steps,
  }) => {
    // The account is BUILT rather than waited for: the administrator takes
    // the permission off the Payer Admin role, this case signs in as that
    // account, and the permission goes back when the case ends. It used to
    // report BLOCKED because the only non-administrator here HELD the right.
    await shapeRole({ without: ['editPayer'] });

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
