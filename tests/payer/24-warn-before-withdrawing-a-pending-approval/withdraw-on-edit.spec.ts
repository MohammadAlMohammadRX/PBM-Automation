import { test, expect } from '../../../fixtures';
import {
  APPROVAL_STATE,
  EDITED_FIELD,
  SUBMISSION_PROMPT,
  WITHDRAWAL_WARNING,
} from '../../../data/payers/withdrawApproval.data';

/**
 * User story: Warn Before an Edit or Delete Withdraws a Pending Approval.
 * The edit path - the one the application gets right.
 *
 * Saving an edit to a payer that is awaiting approval raises "Return this payer
 * to draft?", states the consequence in full, and requires Continue before it
 * proceeds. The Send for Approval prompt says the same thing in advance. Both
 * were read off the live application, and these cases assert the wording rather
 * than merely that some dialog appeared - a warning that has lost its
 * explanation is the defect this story exists to catch.
 *
 * EVERY CASE PROVISIONS ITS OWN PENDING PAYER: publish one, stage a change,
 * submit it. Sampling a payer that happened to be awaiting approval would mean
 * withdrawing a request somebody else was waiting on.
 */
test.describe('Withdraw a pending approval - On edit', () => {
  test('TC-001: should create an approval request and move the payer to Pending Approval when a draft is submitted', async ({
    payerManagementPage,
    approvalManagementPage,
    draftPayer,
    steps,
  }) => {
    await steps.critical('Navigate to the Payer Management module', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(draftPayer.nameEn);
      await payerManagementPage.waitForRowVisible(draftPayer.nameEn);
    });

    await steps.critical('The payer is in Draft', () =>
      payerManagementPage.expectApprovalStatusContains(draftPayer.nameEn, APPROVAL_STATE.draft));

    await steps.step('Send for Approval asks for confirmation before submitting', async () => {
      await payerManagementPage.sendRowForApproval(draftPayer.nameEn);
      const dialog = payerManagementPage.dialog();
      await dialog.waitForVisible();
      expect(await dialog.getTitle(), 'the prompt should ask before submitting').toBe(
        SUBMISSION_PROMPT.title,
      );
      const message = await dialog.getMessage();
      expect(message, 'it should say where the change goes').toContain(
        SUBMISSION_PROMPT.reviewerNote,
      );
      // The forewarning that makes the later withdrawal warning fair: the user
      // is told, before submitting, that editing afterwards undoes it.
      expect(message, 'and warn that editing afterwards returns it to draft').toContain(
        SUBMISSION_PROMPT.editCaveat,
      );
    });

    await steps.step('Confirming moves the payer to Pending Approval and queues a request', async () => {
      await payerManagementPage.dialog().confirm('Send for Approval');
      await payerManagementPage.open();
      await payerManagementPage.search(draftPayer.nameEn);
      await payerManagementPage.expectApprovalStatusContains(
        draftPayer.nameEn,
        APPROVAL_STATE.pending,
      );

      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(draftPayer.nameEn);
    });
  });

  test('TC-003: should warn that saving will withdraw the request when a pending payer is edited', async ({
    payerManagementPage,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    await steps.critical('Navigate to the module with a payer awaiting approval', async () => {
      await payerManagementPage.open();
      await payerManagementPage.editTextFieldAndSave(
        publishedPayer.nameEn,
        EDITED_FIELD.label,
        EDITED_FIELD.first,
      );
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(publishedPayer.nameEn);
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectApprovalStatusContains(
        publishedPayer.nameEn,
        APPROVAL_STATE.pending,
      );
    });

    await steps.critical('The edit option is available on it', async () => {
      await payerManagementPage.expectRowActionsEnabled(publishedPayer.nameEn, ['edit']);
    });

    await steps.step('Saving a modified field raises the withdrawal warning', async () => {
      const form = await payerManagementPage.openEditForm(publishedPayer.nameEn);
      await form.setFieldValue(EDITED_FIELD.label, EDITED_FIELD.second, 'text');
      expect(
        await form.saveAndReportDialog(),
        'saving over a pending approval should ask first',
      ).toBe(true);

      const dialog = payerManagementPage.dialog();
      expect(await dialog.getTitle(), 'the warning should name what it is about').toBe(
        WITHDRAWAL_WARNING.title,
      );
      const message = await dialog.getMessage();
      expect(message, 'it should say the payer is awaiting approval').toContain(
        WITHDRAWAL_WARNING.awaiting,
      );
      expect(message, 'and state the consequence of saving').toContain(
        WITHDRAWAL_WARNING.consequence,
      );
      expect(message, 'and say what the user has to do next').toContain(
        WITHDRAWAL_WARNING.nextStep,
      );
    });

    await steps.step('Confirming the warning lets the save proceed and returns the payer to Draft', async () => {
      await payerManagementPage.form().confirmWithdrawal();
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectApprovalStatusContains(
        publishedPayer.nameEn,
        APPROVAL_STATE.draft,
      );
      await approvalManagementPage.open();
      await approvalManagementPage.expectNotInQueue(publishedPayer.nameEn);
    });
  });

  test('TC-007: should abort the save and keep the request when the warning is cancelled', async ({
    payerManagementPage,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    await steps.critical('Navigate to the module with a payer awaiting approval', async () => {
      await payerManagementPage.open();
      await payerManagementPage.editTextFieldAndSave(
        publishedPayer.nameEn,
        EDITED_FIELD.label,
        EDITED_FIELD.first,
      );
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(publishedPayer.nameEn);
    });

    await steps.critical('A field is modified in its edit form', async () => {
      await payerManagementPage.open();
      const form = await payerManagementPage.openEditForm(publishedPayer.nameEn);
      await form.setFieldValue(EDITED_FIELD.label, EDITED_FIELD.second, 'text');
      expect(
        await form.getFieldValue(EDITED_FIELD.label),
        'the form should hold the new value before saving',
      ).toBe(EDITED_FIELD.second);
    });

    await steps.step('Cancelling the warning aborts the save and leaves the form open', async () => {
      const form = payerManagementPage.form();
      expect(await form.saveAndReportDialog(), 'the warning should appear').toBe(true);
      await payerManagementPage.dialog().cancel();
      expect(
        await form.isOpen(),
        'the form should stay open with the unsaved change, not close',
      ).toBe(true);
    });

    await steps.step('The payer is still Pending Approval with its original value', async () => {
      // Closed with a discard so the dirty-form guard cannot abort the
      // navigation that follows - a real trap here, and the reason this step
      // does not simply navigate away.
      await payerManagementPage.form().closeAndDiscard();
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectApprovalStatusContains(
        publishedPayer.nameEn,
        APPROVAL_STATE.pending,
      );

      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      expect(
        await detail.getFieldValue(EDITED_FIELD.label),
        'the cancelled edit must not have been written',
      ).toBe(EDITED_FIELD.first);

      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(publishedPayer.nameEn);
    });
  });

  test('TC-006: should warn only when a request is actually pending, across the three states', async ({
    payerManagementPage,
    publishedPayer,
    steps,
  }) => {
    await steps.critical('Navigate to the Payer Management module', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectApprovalStatusContains(
        publishedPayer.nameEn,
        APPROVAL_STATE.published,
      );
    });

    await steps.step('Saving an edit on a PUBLISHED payer raises no withdrawal warning', async () => {
      // The third partition of the sheet's table, and the one most likely to be
      // wrong: there is nothing pending, so a warning here would be a false
      // alarm about withdrawing a request that does not exist.
      const form = await payerManagementPage.openEditForm(publishedPayer.nameEn);
      await form.setFieldValue(EDITED_FIELD.label, EDITED_FIELD.first, 'text');
      expect(
        await form.saveAndReportDialog(),
        'a published payer with no pending request should save without a warning',
      ).toBe(false);
      await form.waitForClosed();
    });

    await steps.step('Saving an edit on a DRAFT payer raises no withdrawal warning either', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectApprovalStatusContains(
        publishedPayer.nameEn,
        APPROVAL_STATE.draft,
      );

      const form = await payerManagementPage.openEditForm(publishedPayer.nameEn);
      await form.setFieldValue(EDITED_FIELD.label, EDITED_FIELD.second, 'text');
      expect(
        await form.saveAndReportDialog(),
        'a draft has no request to withdraw, so no warning should appear',
      ).toBe(false);
      await form.waitForClosed();
    });

    await steps.step('Saving an edit on a PENDING payer does raise it', async () => {
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(publishedPayer.nameEn);
      await payerManagementPage.open();

      const form = await payerManagementPage.openEditForm(publishedPayer.nameEn);
      await form.setFieldValue(EDITED_FIELD.label, EDITED_FIELD.first, 'text');
      expect(
        await form.saveAndReportDialog(),
        'the warning belongs to this state and only this state',
      ).toBe(true);
      await payerManagementPage.form().confirmWithdrawal();
    });

    await steps.step('And the payer ends in Draft, as the warning said it would', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectApprovalStatusContains(
        publishedPayer.nameEn,
        APPROVAL_STATE.draft,
      );
    });
  });
});
