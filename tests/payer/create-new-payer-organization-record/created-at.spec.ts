import { test, expect } from '../../../fixtures';

/**
 * User story: Create New Payer Organization Record.
 * The CreatedAt timestamp is recorded at Draft creation and must survive the
 * Send-for-Approval and Approval transitions unchanged. Read from the payer
 * detail view (View action) where "Created At" is displayed.
 */
test.describe('Create New Payer Organization Record - Timestamp integrity', () => {
  test('TC-011: should preserve the CreatedAt timestamp from Draft creation through approval', async ({
    payerManagementPage,
    approvalManagementPage,
    uniquePayer,
    cleanup,
  }) => {
    cleanup.register(() => payerManagementPage.deletePayer(uniquePayer.nameEn));

    await payerManagementPage.open();
    await payerManagementPage.createDraftPayer(uniquePayer);

    const detailAtCreation = await payerManagementPage.openDetails(uniquePayer.nameEn);
    const createdAtInitial = await detailAtCreation.getFieldValue('Created At');
    expect(createdAtInitial).not.toEqual('');

    // Move the record all the way to approved.
    await payerManagementPage.open();
    await payerManagementPage.sendForApproval(uniquePayer.nameEn);
    await approvalManagementPage.open();
    await approvalManagementPage.approve(uniquePayer.nameEn);

    // CreatedAt must be identical to what it was at initial Draft creation.
    await payerManagementPage.open();
    const detailAfterApproval = await payerManagementPage.openDetails(uniquePayer.nameEn);
    const createdAtAfterApproval = await detailAfterApproval.getFieldValue('Created At');
    expect(createdAtAfterApproval).toEqual(createdAtInitial);
  });
});
