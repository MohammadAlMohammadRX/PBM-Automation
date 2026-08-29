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
 *
 * Steps are recorded through the `steps` fixture. Deletion is a sequence of
 * transitions, so each transition is `critical` - if the delete never happened,
 * asserting on its outcome would report a failure that says nothing about the
 * application. The verifications that follow are `step`, so one failing check
 * still lets the next one report.
 */
test.describe('Delete Payer with/without Dependency Validation - Core deletion', () => {
  test('TC-001: should accept the deletion request when the payer has no dependencies', async ({
    payerManagementPage,
    publishedPayer,
    steps,
  }) => {
    await steps.critical('Open the payer list', () => payerManagementPage.open());

    await steps.critical('Delete the payer and confirm the prompt', () =>
      payerManagementPage.deleteAndConfirm(publishedPayer.nameEn));

    // A live payer with no dependencies is staged rather than removed outright,
    // and no dependency error is raised.
    await steps.step('The deletion is staged - the record moves back to Draft', () =>
      payerManagementPage.expectApprovalStatusContains(publishedPayer.nameEn, 'Draft'));
  });

  test('TC-004: should discard the draft outright when deleting a payer that was never approved', async ({
    payerManagementPage,
    draftPayer,
    steps,
  }) => {
    await steps.critical('Open the payer list', () => payerManagementPage.open());

    await steps.step('The payer starts as an unapproved Draft', () =>
      payerManagementPage.expectApprovalStatusContains(draftPayer.nameEn, 'Draft'));

    await steps.critical('Discard the draft', () =>
      payerManagementPage.discardDraft(draftPayer.nameEn));

    await steps.step('A draft-discarded confirmation is shown', () =>
      payerManagementPage.expectToastContains(DELETE_MESSAGES.draftDiscarded));

    // Permanently removed - no approval workflow, no residual record.
    await steps.step('The draft is permanently removed from the list', () =>
      payerManagementPage.expectRowNotVisible(draftPayer.nameEn));
  });

  test('TC-005: should display a confirmation prompt and abort the deletion when the user cancels', async ({
    payerManagementPage,
    draftPayer,
    steps,
  }) => {
    await steps.critical('Open the payer list', () => payerManagementPage.open());

    // Opens the prompt, asserts it names the payer, then cancels it. Critical:
    // if the prompt never opened or was never cancelled, the check below cannot
    // tell us whether cancelling protects the record.
    await steps.critical('Open the delete confirmation prompt and cancel it', () =>
      payerManagementPage.expectDeleteConfirmationPrompt(draftPayer.nameEn));

    // Cancelling leaves the payer completely unaffected.
    await steps.step('Cancelling leaves the payer unaffected, still a Draft', () =>
      payerManagementPage.expectApprovalStatusContains(draftPayer.nameEn, 'Draft'));
  });

  test('TC-012: should confirm the discard in the language selected in the page header', async ({
    payerManagementPage,
    draftPayer,
    cleanup,
    steps,
  }) => {
    // A second draft lets the same test case verify the Arabic confirmation
    // without depending on another test's data.
    const arabicDraft = buildUniquePayer();
    cleanup.register(() => payerManagementPage.deletePayer(arabicDraft.nameEn));

    await steps.critical('Open the payer list', () => payerManagementPage.open());

    await steps.critical('Create a second draft for the Arabic check', () =>
      payerManagementPage.createDraftPayer(arabicDraft));

    // The UI language is restored in `finally`: it is stored with the session, so
    // leaving it in Arabic would change the language for every later test.
    try {
      // English UI -> English confirmation message.
      await steps.critical('Switch the page header language to English', () =>
        payerManagementPage.language().switchTo('en'));

      await steps.critical('Discard the first draft while the UI is English', () =>
        payerManagementPage.discardDraft(draftPayer.nameEn));

      await steps.step('The confirmation message is in English', () =>
        payerManagementPage.expectToastContains(DELETE_TOASTS.en.draftDiscarded));

      // Arabic UI (switched from the page header) -> Arabic confirmation message,
      // rendered right-to-left. The Arabic list shows payers by their Arabic name,
      // so the record is located by that name while in Arabic.
      await steps.critical('Switch the page header language to Arabic', () =>
        payerManagementPage.language().switchTo('ar'));

      await steps.step('The page is rendered right-to-left', () =>
        payerManagementPage.language().expectRightToLeft());

      await steps.critical('Discard the second draft while the UI is Arabic', () =>
        payerManagementPage.discardDraft(arabicDraft.nameAr, 'ar'));

      await steps.step('The confirmation message is in Arabic', () =>
        payerManagementPage.expectToastContains(DELETE_TOASTS.ar.draftDiscarded));
    } finally {
      await payerManagementPage.language().switchTo('en');
    }
  });

  test('TC-013: should remove the discarded draft from every pending-work view', async ({
    payerManagementPage,
    approvalManagementPage,
    draftPayer,
    steps,
  }) => {
    await steps.critical('Open the payer list', () => payerManagementPage.open());

    await steps.critical('Discard the draft', () =>
      payerManagementPage.discardDraft(draftPayer.nameEn));

    await steps.step('A draft-discarded confirmation is shown', () =>
      payerManagementPage.expectToastContains(DELETE_MESSAGES.draftDiscarded));

    // Gone from the payer list...
    await steps.step('The draft is gone from the payer list', () =>
      payerManagementPage.expectRowNotVisible(draftPayer.nameEn));

    // ...and from the approval / pending-work queue.
    await steps.critical('Open the approval queue', () => approvalManagementPage.open());

    await steps.step('The draft is gone from the approval queue', () =>
      approvalManagementPage.expectNotInQueue(draftPayer.nameEn));
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
    steps,
  }) => {
    await steps.critical('Open the payer list', () => payerManagementPage.open());

    await steps.critical('Delete the live payer and confirm the prompt', () =>
      payerManagementPage.deleteAndConfirm(publishedPayer.nameEn));

    await steps.critical('Send the staged deletion for approval', () =>
      payerManagementPage.sendForApproval(publishedPayer.nameEn));

    // The queue records this as a Delete request.
    await steps.critical('Open the approval queue', () => approvalManagementPage.open());

    await steps.step(`The queue records the change type as "${DELETE_CHANGE_TYPE}"`, () =>
      approvalManagementPage.expectChangeType(publishedPayer.nameEn, DELETE_CHANGE_TYPE));

    await steps.critical('Approve the staged deletion', () =>
      approvalManagementPage.approve(publishedPayer.nameEn));

    // Logically deleted: no longer selectable from the active payer list.
    await steps.critical('Return to the payer list', () => payerManagementPage.open());

    await steps.step('The payer is no longer listed among active payers', () =>
      payerManagementPage.expectRowNotVisible(publishedPayer.nameEn));
  });

  test('TC-011: should keep the payer active when the staged deletion is rejected', async ({
    payerManagementPage,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    let versionBefore!: Awaited<ReturnType<typeof payerManagementPage.getVersionNumber>>;
    let statusBefore!: Awaited<ReturnType<typeof payerManagementPage.getApprovalState>>;

    await steps.critical('Open the payer list', () => payerManagementPage.open());

    // Capture the payer's state BEFORE the deletion is raised - rejecting the
    // deletion must put the record back to exactly this state. Critical: without
    // the baseline there is nothing to compare the restored record against.
    await steps.critical('Record the version and approval state before deletion', async () => {
      versionBefore = await payerManagementPage.getVersionNumber(publishedPayer.nameEn);
      statusBefore = await payerManagementPage.getApprovalState(publishedPayer.nameEn);
    });

    await steps.critical('Delete the payer and confirm the prompt', () =>
      payerManagementPage.deleteAndConfirm(publishedPayer.nameEn));

    await steps.critical('Send the staged deletion for approval', () =>
      payerManagementPage.sendForApproval(publishedPayer.nameEn));

    await steps.critical('Open the approval queue', () => approvalManagementPage.open());

    await steps.critical(`Reject the staged deletion with "${DELETE_REJECTION_REASON}"`, () =>
      approvalManagementPage.reject(publishedPayer.nameEn, DELETE_REJECTION_REASON));

    // The deletion request is closed and the payer is restored to its previous
    // state, still live and still holding its PayerCode.
    await steps.critical('Return to the payer list', () => payerManagementPage.open());

    await steps.step('The payer is restored to its previous version and status', () =>
      payerManagementPage.expectVersionAndStatus(
        publishedPayer.nameEn,
        versionBefore,
        statusBefore,
      ));

    await steps.step('The payer still holds its PayerCode', () =>
      payerManagementPage.expectPayerCodeAssigned(publishedPayer.nameEn));

    await steps.critical('Reopen the approval queue', () => approvalManagementPage.open());

    await steps.step('The deletion request is no longer queued', () =>
      approvalManagementPage.expectNotInQueue(publishedPayer.nameEn));
  });

  test('TC-009: should stage only one deletion request when delete is submitted repeatedly in quick succession', async ({
    payerManagementPage,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    await steps.critical('Open the payer list', () => payerManagementPage.open());

    // Submit the deletion twice back-to-back (double-submission).
    await steps.critical('Submit the deletion twice back-to-back', async () => {
      await payerManagementPage.deleteAndConfirm(publishedPayer.nameEn);
      await payerManagementPage.deleteAndConfirm(publishedPayer.nameEn);
    });

    await steps.critical('Send the staged deletion for approval', () =>
      payerManagementPage.sendForApproval(publishedPayer.nameEn));

    // Exactly one pending entry - no duplicate approval requests.
    await steps.critical('Open the approval queue', () => approvalManagementPage.open());

    await steps.step('Exactly one deletion request is queued, with no duplicate', () =>
      approvalManagementPage.expectSingleQueuedRequest(publishedPayer.nameEn));
  });
});
