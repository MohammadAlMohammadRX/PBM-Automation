import { test } from '../../../fixtures';
import { CHAIN_EDIT_FIELD, editedLicenseNumber } from '../../../data/payers/editPayer.data';

/**
 * User story: Edit Existing Payer Configuration Details.
 * Version lifecycle: v0 draft -> v1 on first publish, and every later edit
 * proposes the next version without disturbing the live one until approved.
 *
 * The Approval Status column renders "v<N> · <Status>", where N is the version
 * of the LIVE record and Status describes the change pending on top of it.
 */
test.describe('Edit Existing Payer Configuration Details - Versioning', () => {
  test('TC-009: should start a new payer at v0 Draft and publish it as v1 when first approved', async ({
    payerManagementPage,
    approvalManagementPage,
    uniquePayer,
    cleanup,
  }) => {
    cleanup.register(() => payerManagementPage.deletePayer(uniquePayer.nameEn));

    await payerManagementPage.open();
    await payerManagementPage.createDraftPayer(uniquePayer);

    // Initial save: v0, Draft.
    await payerManagementPage.expectVersionAndStatus(uniquePayer.nameEn, 0, 'Draft');

    // Sent for approval: still v0, now pending.
    await payerManagementPage.sendForApproval(uniquePayer.nameEn);
    await payerManagementPage.expectVersionAndStatus(uniquePayer.nameEn, 0, 'Pending Approval');

    // Approved: the first published version is v1.
    await approvalManagementPage.open();
    await approvalManagementPage.approve(uniquePayer.nameEn);
    await payerManagementPage.open();
    await payerManagementPage.expectVersionAndStatus(uniquePayer.nameEn, 1, 'Published');
  });

  test('TC-016: should create a pending version without changing the live version when a published payer is edited', async ({
    payerManagementPage,
    publishedPayer,
  }) => {
    await payerManagementPage.open();
    const liveVersion = await payerManagementPage.getVersionNumber(publishedPayer.nameEn);

    await payerManagementPage.editSingleFieldAndSave(
      publishedPayer.nameEn,
      CHAIN_EDIT_FIELD.label,
      editedLicenseNumber(),
      CHAIN_EDIT_FIELD.kind,
    );
    await payerManagementPage.sendForApproval(publishedPayer.nameEn);

    // The live record stays on its published version while the edit is pending.
    await payerManagementPage.expectVersionAndStatus(
      publishedPayer.nameEn,
      liveVersion,
      'Pending Approval',
    );
    await payerManagementPage.expectPayerCodeAssigned(publishedPayer.nameEn);
  });

  test('TC-017: should publish the pending edit as the next live version when it is approved', async ({
    payerManagementPage,
    approvalManagementPage,
    publishedPayer,
  }) => {
    await payerManagementPage.open();
    const liveVersion = await payerManagementPage.getVersionNumber(publishedPayer.nameEn);

    await payerManagementPage.editSingleFieldAndSave(
      publishedPayer.nameEn,
      CHAIN_EDIT_FIELD.label,
      editedLicenseNumber(),
      CHAIN_EDIT_FIELD.kind,
    );
    await payerManagementPage.sendForApproval(publishedPayer.nameEn);
    await approvalManagementPage.open();
    await approvalManagementPage.approve(publishedPayer.nameEn);

    // The version counter advances by exactly one and becomes the live record.
    await payerManagementPage.open();
    await payerManagementPage.expectVersionAndStatus(
      publishedPayer.nameEn,
      liveVersion + 1,
      'Published',
    );
  });

  test('TC-018: should keep the live version and consume no version number when a pending edit is rejected', async ({
    payerManagementPage,
    approvalManagementPage,
    publishedPayer,
  }) => {
    await payerManagementPage.open();
    const liveVersion = await payerManagementPage.getVersionNumber(publishedPayer.nameEn);
    const statusBefore = await payerManagementPage.getApprovalState(publishedPayer.nameEn);

    await payerManagementPage.editSingleFieldAndSave(
      publishedPayer.nameEn,
      CHAIN_EDIT_FIELD.label,
      editedLicenseNumber(),
      CHAIN_EDIT_FIELD.kind,
    );
    await payerManagementPage.sendForApproval(publishedPayer.nameEn);
    await approvalManagementPage.open();
    await approvalManagementPage.reject(publishedPayer.nameEn, 'Incorrect Data');

    // No version was consumed: the live record keeps its version number and
    // returns to the published state it held before the rejected edit.
    await payerManagementPage.open();
    await payerManagementPage.expectVersionAndStatus(
      publishedPayer.nameEn,
      liveVersion,
      statusBefore,
    );
  });
});
