import { test } from '../../../fixtures';
import { env } from '../../../constants/EnvironmentConfig';
import { LoginPage } from '../../../pages/auth/LoginPage';
import { PayerManagementPage } from '../../../pages/payer/PayerManagementPage';

/**
 * User story: Create New Payer Organization Record.
 * A private Draft must be visible only to its creator. Admin A (the default
 * session) creates the Draft; Admin B (a second, separate session) must not be
 * able to see it.
 *
 * Requires SECOND_ADMIN_USERNAME / SECOND_ADMIN_PASSWORD in .env.
 */
test.describe('Create New Payer Organization Record - Draft privacy', () => {
  test('TC-013: should hide a Draft payer from a second administrator who is not its creator', async ({
    payerManagementPage,
    uniquePayer,
    cleanup,
    browser,
  }) => {
    cleanup.register(() => payerManagementPage.deletePayer(uniquePayer.nameEn));

    // Admin A creates the private Draft.
    await payerManagementPage.open();
    await payerManagementPage.createDraftPayer(uniquePayer);
    await payerManagementPage.expectApprovalStatusContains(uniquePayer.nameEn, 'Draft');

    // Admin B, in an isolated session, must not see admin A's Draft.
    const contextB = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const pageB = await contextB.newPage();
    const loginB = new LoginPage(pageB);
    await loginB.open();
    await loginB.loginAndWaitForDashboard(env.secondAdminUsername, env.secondAdminPassword);

    const payerManagementB = new PayerManagementPage(pageB);
    await payerManagementB.open();
    await payerManagementB.expectRowNotVisible(uniquePayer.nameEn);

    await contextB.close();
  });
});
