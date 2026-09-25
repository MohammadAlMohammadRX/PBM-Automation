import { test } from '../../../fixtures';
import { PAYER_READ_PERMISSIONS } from '../../../data/accounts/payerAdminRole.data';
import { env } from '../../../constants/EnvironmentConfig';

/**
 * User story: Provide Arabic Labels for All Approval Status Values, Including
 * Withdrawn.
 * Role-based access to the statuses themselves.
 *
 * The restricted role is shaped by the administrator before the case runs (see
 * fixtures/shapedNonAdmin.fixture.ts). This spec opts out of the shared
 * administrator session so it can authenticate as that role.
 */
test.describe('Provide Arabic Labels for All Approval Status Values - Access control', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  // Azure test case 15372
  test('15372: should deny the payer list and its statuses when the module is opened by an unauthorized role', async ({
    shapeRole,
    loginPage,
    payerManagementPage,
    steps,
  }) => {
    // The restricted account is BUILT, not waited for: the administrator takes the
    // permission off the shared "Payer Admin" role, this case signs in as that
    // account, and the permission goes back when the case ends. It used to report
    // BLOCKED because the only non-administrator here HELD the right.
    await shapeRole({ without: PAYER_READ_PERMISSIONS });

    await steps.critical('Navigate to the Payer Management module', async () => {
      await loginPage.open();
      await loginPage.loginAndWaitForDashboard(env.nonAdminUsername, env.nonAdminPassword);
      await payerManagementPage.navigate();
    });

    await steps.step('The payer list is not loaded, or shows an access-restricted view', () =>
      payerManagementPage.expectSearchAccessRestricted());

    await steps.step('Opening a specific payer record is unavailable', () =>
      payerManagementPage.expectEditActionDenied());

    // Reached by direct URL rather than by clicking: a module hidden from the
    // navigation but reachable by address is a real access-control failure, and
    // only a direct navigation can show it.
    await steps.step('Reaching the list by direct URL is blocked', async () => {
      await payerManagementPage.navigate();
      await payerManagementPage.expectSearchAccessRestricted();
    });
  });
});
