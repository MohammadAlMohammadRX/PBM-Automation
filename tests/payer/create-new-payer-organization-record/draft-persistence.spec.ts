import { test } from '../../../fixtures';

/**
 * User story: Create New Payer Organization Record.
 * A saved Draft survives navigating away from and back to the module.
 */
test.describe('Create New Payer Organization Record - Draft persistence', () => {
  test('TC-016: should retain all Draft field values when navigating away and returning before submission', async ({
    payerManagementPage,
    uniquePayer,
    cleanup,
  }) => {
    cleanup.register(() => payerManagementPage.deletePayer(uniquePayer.nameEn));

    await payerManagementPage.open();
    await payerManagementPage.createDraftPayer(uniquePayer);
    await payerManagementPage.expectApprovalStatusContains(uniquePayer.nameEn, 'Draft');

    await payerManagementPage.navigateAwayAndReturn();

    // All saved values are retained accurately and the record is still a Draft.
    await payerManagementPage.expectRowShowsDetails(uniquePayer.nameEn, [
      uniquePayer.nameEn,
      uniquePayer.licenseNumber,
      uniquePayer.email,
      uniquePayer.phone,
    ]);
    await payerManagementPage.expectApprovalStatusContains(uniquePayer.nameEn, 'Draft');
    await payerManagementPage.expectNoPayerCode(uniquePayer.nameEn);
  });
});
