import { test } from '../../../fixtures';
import { env } from '../../../constants/EnvironmentConfig';
import { READ_ONLY_REQUIREMENT } from '../../../data/payers/statusTransition.data';

/**
 * User story: Refine Automatic Status Transitions for Expiry Precedence and
 * Recalculation on Edit.
 * Role-based access to extending an expiry date.
 *
 * Requires NON_ADMIN_USERNAME / NON_ADMIN_PASSWORD in .env. This spec opts out
 * of the shared administrator session so it can authenticate as the restricted
 * role, exactly as the other access specs in this suite do.
 */
test.describe('Refine Automatic Status Transitions - Access control', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  // Azure test case 15362
  test('15362: should refuse the expiry-date change when an expired payer is opened by a non-approving role', async ({
    shapeRole,
    loginPage,
    payerManagementPage,
    steps,
  }) => {
    // the application.
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

    await steps.step('The expiry date cannot be edited by this role', () =>
      payerManagementPage.expectEditActionDenied());

    await steps.step('The approval action is unavailable to this role', () =>
      payerManagementPage.expectSearchAccessRestricted());
  });
});
