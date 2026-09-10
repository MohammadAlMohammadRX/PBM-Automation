import { test, expect } from '../../../fixtures';
import { DELETE_CHANGE_TYPE } from '../../../data/payers/deletePayer.data';
import {
  ACTIONS_BY_APPROVAL_STATE,
  APPROVAL_STATE,
  DELETE_PROMPT,
  EDITED_FIELD,
  MAX_PENDING_REQUESTS,
  WITHDRAWAL_WARNING,
} from '../../../data/payers/withdrawApproval.data';

/**
 * User story: Warn Before an Edit or Delete Withdraws a Pending Approval.
 * The delete path, the duplicate-submission guard, and the audit trail.
 *
 * THE DELETE PROMPT IS THE GENERIC ONE. Verified on a payer holding no pending
 * request: "Delete Payer / Do you want to delete X? / No / Yes" - a question and
 * nothing more. Whether it gains a withdrawal sentence when a request IS
 * pending is what TC-004 asks; TC-008 pins the plain version so the two cannot
 * be confused.
 *
 * THE DUPLICATE-SUBMISSION GUARD IS STRUCTURAL. A payer awaiting approval keeps
 * only View, Edit and Delete: the Send for Approval action is withheld, so a
 * second request cannot be raised. That is stronger than the sheet's "show an
 * error saying a pending approval already exists", and it means the error it
 * asks for never appears - asserted as its own step so the guarantee and the
 * missing message are reported separately.
 */
test.describe('Withdraw a pending approval - On delete', () => {
  test('TC-002: should refuse a second submission while a request is already pending', async ({
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

    await steps.critical('The row shows Pending Approval', () =>
      payerManagementPage.expectApprovalStatusContains(
        publishedPayer.nameEn,
        APPROVAL_STATE.pending,
      ));

    await steps.step('A second submission cannot be started at all', async () => {
      // The guarantee: the action is withheld rather than offered-and-refused,
      // so two pending requests are impossible by construction.
      for (const action of ACTIONS_BY_APPROVAL_STATE.pending.withheld) {
        await payerManagementPage.expectRowActionUnavailable(
          publishedPayer.nameEn,
          action as 'submit-for-approval' | 'inactivate' | 'activate',
        );
      }
      await payerManagementPage.expectRowActionsEnabled(publishedPayer.nameEn, [
        'view',
        'edit',
        'delete',
      ]);
    });

    await steps.step('The user is told why the submission is unavailable', async () => {
      // FAILS. The sheet asks for "a pending approval already exists for this
      // payer"; the action is simply absent, so nothing explains it. The row
      // action carries no title either - checked, because that is where this
      // application does put its withheld-action explanations (see the expiry
      // guardrail on Activate).
      const message = await payerManagementPage.getRowActionMessage(
        publishedPayer.nameEn,
        'submit-for-approval',
      );
      expect(
        message,
        'the refusal should state that a pending approval already exists',
      ).not.toBe('');
    });

    await steps.step('Exactly one request is queued for the payer', async () => {
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(publishedPayer.nameEn);
      await approvalManagementPage.expectSingleQueuedRequest(publishedPayer.nameEn);
      expect(
        await approvalManagementPage.countQueuedRequests(publishedPayer.nameEn),
        `a payer may hold at most ${MAX_PENDING_REQUESTS} pending request`,
      ).toBe(MAX_PENDING_REQUESTS);
    });
  });

  test('TC-004: should warn that deleting will withdraw the pending request', async ({
    payerManagementPage,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    let message!: string;

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

    await steps.critical('The delete option is available on the pending row', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectRowActionsEnabled(publishedPayer.nameEn, ['delete']);
    });

    await steps.step('The delete prompt explains that the pending request will be withdrawn', async () => {
      const dialog = await payerManagementPage.clickDelete(publishedPayer.nameEn);
      message = `${await dialog.getTitle()} ${await dialog.getMessage()}`;
      // The edit path words this properly ("Saving this change withdraws that
      // request..."), so the bar is the application's own. If the delete prompt
      // is the generic question, the user is about to discard a reviewer's
      // pending work with no warning that they are doing so.
      expect(
        message,
        `the prompt said: "${message}" - it should mention the pending request`,
      ).toContain(WITHDRAWAL_WARNING.consequence.split(' and returns')[0]);
    });

    await steps.step('Confirming the deletion proceeds and clears the pending request', async () => {
      await payerManagementPage.dialog().confirm('Yes');
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      // A live payer's deletion is itself maker-checker, so what must be true
      // is that the OLD request is gone and the record now carries the deletion
      // instead - not that the payer has vanished.
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(publishedPayer.nameEn);
      await approvalManagementPage.expectChangeType(publishedPayer.nameEn, DELETE_CHANGE_TYPE);
      await approvalManagementPage.expectSingleQueuedRequest(publishedPayer.nameEn);
    });
  });

  test('TC-008: should show the plain delete confirmation for a payer with nothing pending', async ({
    payerManagementPage,
    draftPayer,
    steps,
  }) => {
    await steps.critical('Navigate to the module with a Draft payer', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(draftPayer.nameEn);
      await payerManagementPage.expectApprovalStatusContains(
        draftPayer.nameEn,
        APPROVAL_STATE.draft,
      );
    });

    await steps.critical('The delete option is available', () =>
      payerManagementPage.expectRowActionsEnabled(draftPayer.nameEn, ['delete']));

    await steps.step('The prompt is the standard one, with no mention of an approval', async () => {
      const dialog = await payerManagementPage.clickDelete(draftPayer.nameEn);
      expect(await dialog.getTitle(), 'the standard delete title').toBe(DELETE_PROMPT.title);
      const message = await dialog.getMessage();
      expect(message, 'it should simply ask').toContain(DELETE_PROMPT.question);
      // The control: a withdrawal warning HERE would be a false alarm, and
      // that is as much a defect as a missing one where it belongs.
      expect(message, 'and must not claim a request will be withdrawn').not.toContain(
        'withdraw',
      );
    });

    await steps.step('Confirming discards the draft', async () => {
      await payerManagementPage.dialog().confirm('Yes');
      await payerManagementPage.open();
      await payerManagementPage.expectRowNotVisible(draftPayer.nameEn);
    });
  });

  test('TC-009: should leave no orphaned request when a withdrawn payer is then deleted', async ({
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

    await steps.critical('An edit withdraws the request and returns it to Draft', async () => {
      await payerManagementPage.open();
      const form = await payerManagementPage.openEditForm(publishedPayer.nameEn);
      await form.setFieldValue(EDITED_FIELD.label, EDITED_FIELD.second, 'text');
      expect(await form.saveAndReportDialog(), 'the withdrawal warning should appear').toBe(true);
      await payerManagementPage.form().confirmWithdrawal();

      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectApprovalStatusContains(
        publishedPayer.nameEn,
        APPROVAL_STATE.draft,
      );
    });

    await steps.step('Deleting it now shows the plain confirmation, the request being gone', async () => {
      const dialog = await payerManagementPage.clickDelete(publishedPayer.nameEn);
      const message = await dialog.getMessage();
      expect(
        message,
        'nothing is pending any more, so nothing should be said about withdrawing one',
      ).not.toContain('withdraw');
      await payerManagementPage.dialog().confirm('Yes');
    });

    await steps.step('No request is left behind for this payer - the orphan check', async () => {
      // VERIFIED, and it corrects what this step first demanded. It expected a
      // DELETE request to appear in the queue; none does, and that is right:
      // the edit had returned this payer to DRAFT, and a draft is deleted
      // outright rather than sent for approval. A deletion request is raised
      // for a payer that is LIVE - which is TC-004's subject, with its own
      // payer in its own state.
      //
      // What this case is named for is the orphan, so that is what it asserts:
      // the withdrawn edit's request must not still be sitting in the queue
      // for a payer that no longer exists.
      await approvalManagementPage.open();
      expect(
        await approvalManagementPage.countQueuedRequests(publishedPayer.nameEn),
        'the withdrawn request must not outlive the payer it belonged to',
      ).toBe(0);
    });

    await steps.step('And the payer itself is gone from the register', async () => {
      await payerManagementPage.open();
      await payerManagementPage.expectRowNotVisible(publishedPayer.nameEn);
    });
  });

  test('TC-010: should remove the withdrawn request from the reviewer queue and record the withdrawal', async ({
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
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(publishedPayer.nameEn);
    });

    await steps.critical('The withdrawal warning is raised and satisfies its checklist', async () => {
      await payerManagementPage.open();
      const form = await payerManagementPage.openEditForm(publishedPayer.nameEn);
      await form.setFieldValue(EDITED_FIELD.label, EDITED_FIELD.second, 'text');
      expect(await form.saveAndReportDialog()).toBe(true);

      const dialog = payerManagementPage.dialog();
      const message = await dialog.getMessage();
      // The sheet's three criteria, one assertion each: clear wording, the
      // consequence, and an acknowledgement before proceeding.
      expect(await dialog.getTitle(), 'clear wording').toBe(WITHDRAWAL_WARNING.title);
      expect(message, 'the consequence').toContain(WITHDRAWAL_WARNING.consequence);
      expect(
        await dialog.getActionKeys(),
        'an acknowledgement is required - the dialog offers a way out as well as a way on',
      ).toEqual(expect.arrayContaining(['cancel']));
    });

    await steps.step('Confirming withdraws the request from the reviewer queue', async () => {
      await payerManagementPage.form().confirmWithdrawal();
      await approvalManagementPage.open();
      await approvalManagementPage.expectNotInQueue(publishedPayer.nameEn);
    });

    await steps.step("The withdrawal is recorded in the payer's own history", async () => {
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      await detail.openAuditHistory();
      // Matched on the entry text, which is all the timeline exposes - it has
      // no per-field ids. A Status Change entry is what a withdrawal produces.
      await detail.expectAuditEntryMatching(
        /Status Change|Update/i,
        'the withdrawal that returned the payer to draft',
      );
    });
  });

  test('TC-012: should clear the task from the reviewer queue once an administrator withdraws it', async ({
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

    await steps.critical('The reviewer queue holds the task', async () => {
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(publishedPayer.nameEn);
      await approvalManagementPage.expectActionsAvailable(publishedPayer.nameEn);
    });

    await steps.step('The administrator edits and saves, acknowledging the warning', async () => {
      await payerManagementPage.open();
      const form = await payerManagementPage.openEditForm(publishedPayer.nameEn);
      await form.setFieldValue(EDITED_FIELD.label, EDITED_FIELD.second, 'text');
      expect(await form.saveAndReportDialog()).toBe(true);
      await payerManagementPage.form().confirmWithdrawal();
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectApprovalStatusContains(
        publishedPayer.nameEn,
        APPROVAL_STATE.draft,
      );
    });

    await steps.step('The task no longer appears in the queue', async () => {
      // Read as the reviewer would: the queue is the same list for every role
      // in this application, so what matters is that the task is not there for
      // anyone to act on.
      await approvalManagementPage.open();
      await approvalManagementPage.expectNotInQueue(publishedPayer.nameEn);
    });
  });
});
