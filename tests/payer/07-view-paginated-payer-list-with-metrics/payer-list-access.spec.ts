import { test, expect } from '../../../fixtures';
import { PAYER_READ_PERMISSIONS } from '../../../data/accounts/payerAdminRole.data';
import { env } from '../../../constants/EnvironmentConfig';

/**
 * User story: View Paginated Payer List with Metrics.
 * Role-based access to the payer list and its metrics.
 *
 * The restricted role is shaped by the administrator before the case runs (see
 * fixtures/shapedNonAdmin.fixture.ts). This spec opts out of the shared
 * administrator session so it can authenticate as that role.
 */
test.describe('View Paginated Payer List with Metrics - Access control', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  // Azure test case 14469
  test('14469: should deny the payer list and its metrics to a non-administrator', async ({
    shapeRole,
    loginPage,
    payerManagementPage,
    payerMetrics,
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

    // THE LIST ITSELF IS THE CLAIM, so the list itself is what is asserted. An
    // earlier version checked only the Filters control and the metrics band -
    // proxies for the list rather than the list - and a case that asserts a
    // proxy can report a defect while the thing in its title is working. The
    // row count is also what a reader of the report wants to see: 'a role with
    // no read permissions was shown N payers'.
    await steps.step('No payer records are listed to this role', async () => {
      const listed = await payerManagementPage.getVisiblePayerNames();
      expect(
        listed,
        `a role stripped of every payer read permission should be shown no payers; it was shown: ${listed.join(', ') || 'none'}`,
      ).toHaveLength(0);
    });

    // The controls stay in the case as a second, separate signal - so the report
    // says whether the module was closed or merely emptied.
    await steps.step('The list controls are not available to this role', () =>
      payerManagementPage.expectSearchAccessRestricted());

    await steps.step('The dashboard metrics are not available to this role', () =>
      payerMetrics.expectBandUnavailable());
  });
});
