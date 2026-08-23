import { test } from '../../../fixtures';
import { env } from '../../../constants/EnvironmentConfig';
import { LoginPage } from '../../../pages/auth/LoginPage';
import { PayerManagementPage } from '../../../pages/payer/PayerManagementPage';
import { DELETE_MESSAGES } from '../../../data/payers/deletePayer.data';

/**
 * User story: Delete Payer with/without Dependency Validation.
 * Ownership rules, and confirming a deleted payer is really gone.
 */
test.describe('Delete Payer with/without Dependency Validation - Access & deleted records', () => {
  test('TC-006: should prevent a maker from discarding a draft created by a different maker', async ({
    payerManagementPage,
    draftPayer,
    browser,
  }) => {
    // Maker A (the default session) owns the draft.
    await payerManagementPage.open();
    await payerManagementPage.expectApprovalStatusContains(draftPayer.nameEn, 'Draft');

    // Maker B works in an isolated session and must not be able to discard it.
    const contextB = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const pageB = await contextB.newPage();
    const loginB = new LoginPage(pageB);
    await loginB.open();
    await loginB.loginAndWaitForDashboard(env.secondAdminUsername, env.secondAdminPassword);

    const payerManagementB = new PayerManagementPage(pageB);
    await payerManagementB.open();
    await payerManagementB.expectDiscardActionDenied(draftPayer.nameEn);

    await contextB.close();

    // The draft is untouched and still owned by Maker A.
    await payerManagementPage.open();
    await payerManagementPage.expectApprovalStatusContains(draftPayer.nameEn, 'Draft');
  });

  test('TC-007: should not return a payer in the search results once it has been deleted', async ({
    payerManagementPage,
    draftPayer,
  }) => {
    await payerManagementPage.open();
    // The payer exists to begin with.
    await payerManagementPage.expectApprovalStatusContains(draftPayer.nameEn, 'Draft');

    await payerManagementPage.discardDraft(draftPayer.nameEn);
    await payerManagementPage.expectToastContains(DELETE_MESSAGES.draftDiscarded);

    // Searching for the deleted payer's name must return nothing - a record that
    // is simply absent is the expected outcome, not an error condition.
    await payerManagementPage.expectRowNotVisible(draftPayer.nameEn);
  });
});
