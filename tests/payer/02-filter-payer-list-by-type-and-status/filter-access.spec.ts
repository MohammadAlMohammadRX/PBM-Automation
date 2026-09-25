import { test } from '../../../fixtures';
import { env } from '../../../constants/EnvironmentConfig';
import { PAYER_READ_PERMISSIONS } from '../../../data/accounts/payerAdminRole.data';

/**
 * User story: Filter Payer List by Type and Status.
 * Role-based access to the payer list and its filter controls.
 *
 * The restricted role is shaped by the administrator before the case runs (see
 * fixtures/shapedNonAdmin.fixture.ts). This spec opts out of the shared
 * administrator session so it can authenticate as that role.
 */
test.describe('Filter Payer List by Type and Status - Access control', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  // Azure test case 14402
  test('14402: should restrict the payer list and its filter controls when the user is not a System Administrator', async ({
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

    await steps.critical('Sign in as a non-administrator', async () => {
      await loginPage.open();
      await loginPage.loginAndWaitForDashboard(env.nonAdminUsername, env.nonAdminPassword);
    });

    await steps.critical('Navigate to the payer module', () => payerManagementPage.navigate());

    // Either the module is inaccessible, or it is read-only with no usable
    // filter controls - both satisfy the configured RBAC rules.
    await steps.step('The payer list and its filter controls are restricted', () =>
      payerManagementPage.expectFilterControlsRestricted());
  });
});
