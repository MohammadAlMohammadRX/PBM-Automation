import { test } from '../../../fixtures';

/**
 * User story: Create New Payer Organization Record.
 * Happy-path creation of a private Draft and its PayerCode-less state.
 */
test.describe('Create New Payer Organization Record - Draft creation', () => {
  test('TC-001: should save the payer as a private Draft when an admin submits valid mandatory data', async ({
    payerManagementPage,
    uniquePayer,
    cleanup,
  }) => {
    cleanup.register(() => payerManagementPage.deletePayer(uniquePayer.nameEn));

    await payerManagementPage.open();
    await payerManagementPage.createDraftPayer(uniquePayer);

    // Saved as Draft, visible to its creator, and with no PayerCode yet.
    await payerManagementPage.expectApprovalStatusContains(uniquePayer.nameEn, 'Draft');
    await payerManagementPage.expectNoPayerCode(uniquePayer.nameEn);
  });

  test('TC-002: should not assign a PayerCode when the payer record is still a Draft', async ({
    payerManagementPage,
    uniquePayer,
    cleanup,
  }) => {
    cleanup.register(() => payerManagementPage.deletePayer(uniquePayer.nameEn));

    await payerManagementPage.open();
    await payerManagementPage.createDraftPayer(uniquePayer);

    await payerManagementPage.expectApprovalStatusContains(uniquePayer.nameEn, 'Draft');
    await payerManagementPage.expectNoPayerCode(uniquePayer.nameEn);
  });
});
