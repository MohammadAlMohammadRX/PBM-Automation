import { test } from '../../../fixtures';
import {
  DELETE_MESSAGES,
  DELETE_TOASTS,
  DELETE_CHANGE_TYPE,
  DELETE_REJECTION_REASON,
} from '../../../data/payers/deletePayer.data';
import { buildUniquePayer } from '../../../data/payers/payer.data';

/**
 * User story: Delete Payer with/without Dependency Validation.
 * Core deletion behaviour for records with no dependencies.
 */
test.describe('Delete Payer with/without Dependency Validation - Core deletion', () => {
  test('TC-001: should accept the deletion request when the payer has no dependencies', async ({
    payerManagementPage,
    publishedPayer,
  }) => {
    await payerManagementPage.open();

    await payerManagementPage.deleteAndConfirm(publishedPayer.nameEn);

    // A live payer with no dependencies is staged rather than removed outright,
    // and no dependency error is raised.
    await payerManagementPage.expectApprovalStatusContains(publishedPayer.nameEn, 'Draft');
  });

  test('TC-004: should discard the draft outright when deleting a payer that was never approved', async ({
    payerManagementPage,
    draftPayer,
  }) => {
    await payerManagementPage.open();
    await payerManagementPage.expectApprovalStatusContains(draftPayer.nameEn, 'Draft');

    await payerManagementPage.discardDraft(draftPayer.nameEn);
    await payerManagementPage.expectToastContains(DELETE_MESSAGES.draftDiscarded);

    // Permanently removed - no approval workflow, no residual record.
    await payerManagementPage.expectRowNotVisible(draftPayer.nameEn);
  });

  test('TC-005: should display a confirmation prompt and abort the deletion when the user cancels', async ({
    payerManagementPage,
    draftPayer,
  }) => {
    await payerManagementPage.open();

    // Opens the prompt, asserts it names the payer, then cancels it.
    await payerManagementPage.expectDeleteConfirmationPrompt(draftPayer.nameEn);

    // Cancelling leaves the payer completely unaffected.
    await payerManagementPage.expectApprovalStatusContains(draftPayer.nameEn, 'Draft');
  });

  test('TC-012: should confirm the discard in the language selected in the page header', async ({
    payerManagementPage,
    draftPayer,
    cleanup,
  }) => {
    // A second draft lets the same test case verify the Arabic confirmation
    // without depending on another test's data.
    const arabicDraft = buildUniquePayer();
    cleanup.register(() => payerManagementPage.deletePayer(arabicDraft.nameEn));

    await payerManagementPage.open();
    await payerManagementPage.createDraftPayer(arabicDraft);

    // English UI -> English confirmation message.
    await payerManagementPage.language().switchTo('en');
    await payerManagementPage.discardDraft(draftPayer.nameEn);
    await payerManagementPage.expectToastContains(DELETE_TOASTS.en.draftDiscarded);

    // Arabic UI (switched from the page header) -> Arabic confirmation message,
    // rendered right-to-left. The Arabic list shows payers by their Arabic name,
    // so the record is located by that name while in Arabic.
    await payerManagementPage.language().switchTo('ar');
    await payerManagementPage.language().expectRightToLeft();
    await payerManagementPage.discardDraft(arabicDraft.nameAr, 'ar');
    await payerManagementPage.expectToastContains(DELETE_TOASTS.ar.draftDiscarded);

    await payerManagementPage.language().switchTo('en');
  });

  test('TC-013: should remove the discarded draft from every pending-work view', async ({
    payerManagementPage,
    approvalManagementPage,
    draftPayer,
  }) => {
    await payerManagementPage.open();
    await payerManagementPage.discardDraft(draftPayer.nameEn);
    await payerManagementPage.expectToastContains(DELETE_MESSAGES.draftDiscarded);

    // Gone from the payer list...
    await payerManagementPage.expectRowNotVisible(draftPayer.nameEn);
    // ...and from the approval / pending-work queue.
    await approvalManagementPage.open();
    await approvalManagementPage.expectNotInQueue(draftPayer.nameEn);
  });
});

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
