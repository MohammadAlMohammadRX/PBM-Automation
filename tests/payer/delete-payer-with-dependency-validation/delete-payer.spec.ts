import { test } from '../../../fixtures';
import { buildUniquePayer } from '../../../data/payers/payer.data';
import { DELETE_MESSAGES, DELETE_TOASTS } from '../../../data/payers/deletePayer.data';

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
