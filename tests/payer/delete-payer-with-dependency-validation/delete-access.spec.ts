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
    steps,
  }) => {
    // BLOCKED, not FAIL: this case needs a SECOND administrator to act as the
    // other maker/checker. Without that account the segregation it checks cannot
    // be observed at all.
    if (!env.secondAdminUsername || !env.secondAdminPassword) {
      steps.blocked(
        'SECOND_ADMIN_USERNAME / SECOND_ADMIN_PASSWORD are not configured in .env, '
          + 'so a second administrator session cannot be established.',
      );
    }

    // Maker A (the default session) owns the draft.
    await steps.critical('Maker A opens the payer list', () => payerManagementPage.open());

    await steps.step('The draft starts out owned by Maker A', () =>
      payerManagementPage.expectApprovalStatusContains(draftPayer.nameEn, 'Draft'));

    // Maker B works in an isolated session and must not be able to discard it.
    // The context is opened and closed outside the recorded steps so it is always
    // released, even when a step aborts the remainder of the test.
    const contextB = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    try {
      const pageB = await contextB.newPage();
      const payerManagementB = new PayerManagementPage(pageB);

      await steps.critical('Maker B signs in from an isolated session', async () => {
        const loginB = new LoginPage(pageB);
        await loginB.open();
        await loginB.loginAndWaitForDashboard(env.secondAdminUsername, env.secondAdminPassword);
      });

      await steps.critical('Maker B opens the payer list', () => payerManagementB.open());

      await steps.step("Maker B is denied the discard action on Maker A's draft", () =>
        payerManagementB.expectDiscardActionDenied(draftPayer.nameEn));
    } finally {
      await contextB.close();
    }

    // The draft is untouched and still owned by Maker A.
    await steps.critical('Maker A reopens the payer list', () => payerManagementPage.open());

    await steps.step('The draft is untouched and still owned by Maker A', () =>
      payerManagementPage.expectApprovalStatusContains(draftPayer.nameEn, 'Draft'));
  });

  test('TC-007: should not return a payer in the search results once it has been deleted', async ({
    payerManagementPage,
    draftPayer,
    steps,
  }) => {
    await steps.critical('Open the payer list', () => payerManagementPage.open());

    // The payer exists to begin with.
    await steps.step('The payer exists to begin with', () =>
      payerManagementPage.expectApprovalStatusContains(draftPayer.nameEn, 'Draft'));

    await steps.critical('Discard the draft', () =>
      payerManagementPage.discardDraft(draftPayer.nameEn));

    await steps.step('A draft-discarded confirmation is shown', () =>
      payerManagementPage.expectToastContains(DELETE_MESSAGES.draftDiscarded));

    // Searching for the deleted payer's name must return nothing - a record that
    // is simply absent is the expected outcome, not an error condition.
    await steps.step('Searching for the deleted payer returns no results', () =>
      payerManagementPage.expectRowNotVisible(draftPayer.nameEn));
  });
});
