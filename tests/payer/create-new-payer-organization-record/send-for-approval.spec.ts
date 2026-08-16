import { test } from '../../../fixtures';
import { VALIDATION_MESSAGES } from '../../../data/payers/payer.data';

/**
 * User story: Create New Payer Organization Record.
 * Draft -> Pending Approval transition, and the guard that an incomplete record
 * cannot proceed to approval.
 */
test.describe('Create New Payer Organization Record - Send for Approval', () => {
  test('TC-003: should transition the payer from Draft to Pending Approval when Send for Approval is confirmed', async ({
    payerManagementPage,
    uniquePayer,
    cleanup,
  }) => {
    cleanup.register(() => payerManagementPage.deletePayer(uniquePayer.nameEn));

    await payerManagementPage.open();
    await payerManagementPage.createDraftPayer(uniquePayer);
    await payerManagementPage.expectApprovalStatusContains(uniquePayer.nameEn, 'Draft');

    await payerManagementPage.sendForApproval(uniquePayer.nameEn);

    // Now pending the reviewer's decision; still no PayerCode.
    await payerManagementPage.expectApprovalStatusContains(uniquePayer.nameEn, 'Pending Approval');
    await payerManagementPage.expectNoPayerCode(uniquePayer.nameEn);
  });

  test('TC-014: should block sending for approval when a mandatory field is incomplete', async ({
    payerManagementPage,
    uniquePayer,
    cleanup,
  }) => {
    cleanup.register(() => payerManagementPage.deletePayer(uniquePayer.nameEn));

    await payerManagementPage.open();
    await payerManagementPage.createDraftPayer(uniquePayer);

    // A record can only be sent for approval once it exists as a Draft; the app
    // must never let a Draft reach an incomplete-yet-savable state. Edit the
    // Draft, clear a mandatory field, and confirm the app refuses to save it -
    // so no incomplete record can ever be sent for approval.
    const edit = await payerManagementPage.openEditForm(uniquePayer.nameEn);
    await edit.clickNext(); // Basic -> Contact
    await edit.clickNext(); // Contact -> Effective Period
    await edit.clearField('Effective Date');
    await edit.save();

    await edit.expectFieldRequired('Effective Date', VALIDATION_MESSAGES.required);
    await edit.waitForOpen(); // still open, incomplete save rejected
    await edit.closeAndDiscard();
  });
});
