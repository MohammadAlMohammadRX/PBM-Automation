import { test } from '../../../fixtures';
import { DELETE_MESSAGES } from '../../../data/payers/deletePayer.data';

/**
 * User story: Delete Payer with/without Dependency Validation.
 * Ownership rules, and confirming a deleted payer is really gone.
 */
test.describe('Delete Payer with/without Dependency Validation - Access & deleted records', () => {

  // Azure test case 14357
  test('14357: should not return a payer in the search results once it has been deleted', async ({
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
