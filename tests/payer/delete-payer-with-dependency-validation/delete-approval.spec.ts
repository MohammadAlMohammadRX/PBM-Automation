import { test } from '../../../fixtures';
import {
  DELETE_CHANGE_TYPE,
  DELETE_REJECTION_REASON,
} from '../../../data/payers/deletePayer.data';

/**
 * User story: Delete Payer with/without Dependency Validation.
 * The maker-checker workflow for deleting a LIVE payer: the deletion is staged,
 * then approved (logical removal) or rejected (payer stays active).
 */
test.describe('Delete Payer with/without Dependency Validation - Deletion approval', () => {
  test('TC-010: should logically remove the payer from active lists when the staged deletion is approved', async ({
    payerManagementPage,
    approvalManagementPage,
    publishedPayer,
  }) => {
    await payerManagementPage.open();
    await payerManagementPage.deleteAndConfirm(publishedPayer.nameEn);
    await payerManagementPage.sendForApproval(publishedPayer.nameEn);

    // The queue records this as a Delete request.
    await approvalManagementPage.open();
    await approvalManagementPage.expectChangeType(publishedPayer.nameEn, DELETE_CHANGE_TYPE);
    await approvalManagementPage.approve(publishedPayer.nameEn);

    // Logically deleted: no longer selectable from the active payer list.
    await payerManagementPage.open();
    await payerManagementPage.expectRowNotVisible(publishedPayer.nameEn);
  });

  test('TC-011: should keep the payer active when the staged deletion is rejected', async ({
    payerManagementPage,
    approvalManagementPage,
    publishedPayer,
  }) => {
    await payerManagementPage.open();
    // Capture the payer's state BEFORE the deletion is raised - rejecting the
    // deletion must put the record back to exactly this state.
    const versionBefore = await payerManagementPage.getVersionNumber(publishedPayer.nameEn);
    const statusBefore = await payerManagementPage.getApprovalState(publishedPayer.nameEn);

    await payerManagementPage.deleteAndConfirm(publishedPayer.nameEn);
    await payerManagementPage.sendForApproval(publishedPayer.nameEn);

    await approvalManagementPage.open();
    await approvalManagementPage.reject(publishedPayer.nameEn, DELETE_REJECTION_REASON);

    // The deletion request is closed and the payer is restored to its previous
    // state, still live and still holding its PayerCode.
    await payerManagementPage.open();
    await payerManagementPage.expectVersionAndStatus(
      publishedPayer.nameEn,
      versionBefore,
      statusBefore,
    );
    await payerManagementPage.expectPayerCodeAssigned(publishedPayer.nameEn);
    await approvalManagementPage.open();
    await approvalManagementPage.expectNotInQueue(publishedPayer.nameEn);
  });

  test('TC-009: should stage only one deletion request when delete is submitted repeatedly in quick succession', async ({
    payerManagementPage,
    approvalManagementPage,
    publishedPayer,
  }) => {
    await payerManagementPage.open();

    // Submit the deletion twice back-to-back (double-submission).
    await payerManagementPage.deleteAndConfirm(publishedPayer.nameEn);
    await payerManagementPage.deleteAndConfirm(publishedPayer.nameEn);
    await payerManagementPage.sendForApproval(publishedPayer.nameEn);

    // Exactly one pending entry - no duplicate approval requests.
    await approvalManagementPage.open();
    await approvalManagementPage.expectSingleQueuedRequest(publishedPayer.nameEn);
  });
});
