import { test } from '../../../fixtures';
import { env } from '../../../constants/EnvironmentConfig';
import { PAYER_READ_PERMISSIONS } from '../../../data/accounts/payerAdminRole.data';

/**
 * User story: Search Payers by Name or Code.
 * Search and Advanced Search must respect the module's role permissions.
 *
 * The restricted role is shaped by the administrator before the case runs (see
 * fixtures/shapedNonAdmin.fixture.ts). This spec opts out of the shared
 * administrator session so it can authenticate as that role.
 */
test.describe('Search Payers by Name or Code - Access control', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  // Azure test case 14419
  test('14419: should limit search and advanced search to what the user\'s role permits', async ({
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

    await loginPage.open();
    await loginPage.loginAndWaitForDashboard(env.nonAdminUsername, env.nonAdminPassword);

    await payerManagementPage.navigate();

    // Either the module is inaccessible, or search is present but the user
    // cannot exceed their granted access - both satisfy the RBAC rules.
    await payerManagementPage.expectSearchAccessRestricted();
  });
});
