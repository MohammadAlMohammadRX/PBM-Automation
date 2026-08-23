import { test, expect } from '../../../fixtures';
import {
  CHAIN_EDIT_FIELD,
  DETAIL_LABELS,
  EDIT_CHANGE_TYPE,
  EDIT_REJECTION_REASON,
  editedLicenseNumber,
} from '../../../data/payers/editPayer.data';

/**
 * User story: Edit Existing Payer Configuration Details.
 * Approval outcomes for an edited payer.
 *
 * These tests edit a non-identifying field (License Number) so the payer keeps
 * a stable name across the list and the approval queue while the change is
 * carried through the maker-checker workflow.
 */
test.describe('Edit Existing Payer Configuration Details - Edit approval', () => {
  test('TC-013: should update the live payer and stamp the modification when the edit is approved', async ({
    payerManagementPage,
    approvalManagementPage,
    publishedPayer,
  }) => {
    const newLicense = editedLicenseNumber();

    await payerManagementPage.open();
    await payerManagementPage.editSingleFieldAndSave(
      publishedPayer.nameEn,
      CHAIN_EDIT_FIELD.label,
      newLicense,
      CHAIN_EDIT_FIELD.kind,
    );
    await payerManagementPage.sendForApproval(publishedPayer.nameEn);

    await approvalManagementPage.open();
    await approvalManagementPage.expectChangeType(publishedPayer.nameEn, EDIT_CHANGE_TYPE);
    await approvalManagementPage.approve(publishedPayer.nameEn);

    // The live record now carries the edited value...
    await payerManagementPage.open();
    await payerManagementPage.expectApprovalStatusContains(publishedPayer.nameEn, 'Published');
    await payerManagementPage.expectRowShowsDetails(publishedPayer.nameEn, [newLicense]);

    // ...and records who modified it and when.
    const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
    await expect.poll(() => detail.getFieldValue(DETAIL_LABELS.modifiedAt)).not.toEqual('');
    await expect.poll(() => detail.getFieldValue(DETAIL_LABELS.modifiedBy)).not.toEqual('');
  });

  test('TC-014: should leave the live payer unchanged and return the draft when the edit is rejected', async ({
    payerManagementPage,
    approvalManagementPage,
    publishedPayer,
  }) => {
    const newLicense = editedLicenseNumber();

    await payerManagementPage.open();
    const liveVersion = await payerManagementPage.getVersionNumber(publishedPayer.nameEn);
    // The status the live record held before the edit - rejection must restore it.
    const statusBefore = await payerManagementPage.getApprovalState(publishedPayer.nameEn);

    await payerManagementPage.editSingleFieldAndSave(
      publishedPayer.nameEn,
      CHAIN_EDIT_FIELD.label,
      newLicense,
      CHAIN_EDIT_FIELD.kind,
    );
    await payerManagementPage.sendForApproval(publishedPayer.nameEn);

    await approvalManagementPage.open();
    await approvalManagementPage.reject(publishedPayer.nameEn, EDIT_REJECTION_REASON);

    // The live record is untouched and returns to the state it held before the
    // edit - it is NOT left sitting as a draft - and the rejected value was
    // never promoted onto the live record.
    await payerManagementPage.open();
    await payerManagementPage.expectVersionAndStatus(
      publishedPayer.nameEn,
      liveVersion,
      statusBefore,
    );
    await payerManagementPage.expectRowShowsDetails(publishedPayer.nameEn, [
      publishedPayer.licenseNumber,
    ]);
    await approvalManagementPage.open();
    await approvalManagementPage.expectNotInQueue(publishedPayer.nameEn);
  });

  test('TC-015: should prevent the submitting maker from approving their own payer edit', async ({
    payerManagementPage,
    approvalManagementPage,
    publishedPayer,
  }) => {
    // The signed-in account is both the maker and holds approver rights.
    await payerManagementPage.open();
    await payerManagementPage.editSingleFieldAndSave(
      publishedPayer.nameEn,
      CHAIN_EDIT_FIELD.label,
      editedLicenseNumber(),
      CHAIN_EDIT_FIELD.kind,
    );
    await payerManagementPage.sendForApproval(publishedPayer.nameEn);

    // Segregation of duties: the self-submitted request must not be approvable
    // by its own submitter - excluded from their queue or the action blocked.
    await approvalManagementPage.open();
    await approvalManagementPage.expectSelfApprovalPrevented(publishedPayer.nameEn);
  });
});
