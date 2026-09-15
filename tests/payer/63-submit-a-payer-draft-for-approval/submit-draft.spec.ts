import { test, expect } from '../../../fixtures';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import { NetworkUtils } from '../../../utils/NetworkUtils';
import { APPROVAL_STATE, SUBMISSION_PROMPT } from '../../../data/payers/withdrawApproval.data';
import {
  BLOCKED_CASES,
  REJECTED_STATE,
  REQUIRED_FIELD_LABEL,
  SUBMIT_EDIT,
} from '../../../data/payers/submitDraft.data';

/**
 * User story: Submit a Payer Draft for Approval.
 *
 * Both routes to the request (list row, detail header), the prompt's cancel,
 * the rule that nothing else raises a request, the full state cycle, the
 * no-change refusal, two sessions at once, and a submission that fails on the
 * wire. The re-check and role cases are BLOCKED - see submitDraft.data.ts.
 */
test.describe('Submit a payer draft for approval', () => {
  test('TC-001: should raise an approval request when Send for Approval is confirmed from the detail header', async ({
    payerManagementPage,
    approvalManagementPage,
    draftPayer,
    steps,
  }) => {
    await steps.critical('Navigate to the module and open the draft payer', async () => {
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(draftPayer.nameEn);
      await detail.waitForLoaded();
    });

    await steps.step('Send for Approval from the header moves the draft to Pending Approval', async () => {
      await payerManagementPage.detail().sendForApproval();
      await payerManagementPage.open();
      await payerManagementPage.search(draftPayer.nameEn);
      await payerManagementPage.expectApprovalStatusContains(draftPayer.nameEn, APPROVAL_STATE.pending);
    });

    await steps.step('The request is in the reviewer\'s queue', async () => {
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(draftPayer.nameEn);
    });
  });

  test('TC-002: should raise the same approval request when Send for Approval is used from the list row', async ({
    payerManagementPage,
    approvalManagementPage,
    draftPayer,
    steps,
  }) => {
    await steps.critical('Navigate to the module and send the draft from its row', async () => {
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(draftPayer.nameEn);
    });

    await steps.step('Exactly one request is queued for the payer', async () => {
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(draftPayer.nameEn);
      expect(await approvalManagementPage.countQueuedRequests(draftPayer.nameEn)).toBe(1);
    });
  });

  test('TC-003: should raise no approval request when the Send for Approval confirmation is cancelled', async ({
    payerManagementPage,
    approvalManagementPage,
    draftPayer,
    steps,
  }) => {
    await steps.critical('Navigate to the module and open the Send for Approval prompt', async () => {
      await payerManagementPage.open();
      const dialog = await payerManagementPage.openSendForApprovalPrompt(draftPayer.nameEn);
      expect(await dialog.getTitle(), 'the prompt should be the submission confirmation').toContain(
        SUBMISSION_PROMPT.title,
      );
      await dialog.cancel();
    });

    await steps.step('The draft is still a draft', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(draftPayer.nameEn);
      await payerManagementPage.expectApprovalStatusContains(draftPayer.nameEn, APPROVAL_STATE.draft);
    });

    await steps.step('And nothing reached the queue', async () => {
      await approvalManagementPage.open();
      await approvalManagementPage.expectNotInQueue(draftPayer.nameEn);
    });
  });

  test('TC-004: should raise an approval request only through Send for Approval and not through saving edits', async ({
    payerManagementPage,
    approvalManagementPage,
    draftPayer,
    steps,
  }) => {
    await steps.critical('Navigate to the module and save an edit on the draft', async () => {
      await payerManagementPage.open();
      await payerManagementPage.editTextFieldAndSave(draftPayer.nameEn, SUBMIT_EDIT.label, SUBMIT_EDIT.value);
    });

    await steps.step('Saving raised no request', async () => {
      await approvalManagementPage.open();
      await approvalManagementPage.expectNotInQueue(draftPayer.nameEn);
    });

    await steps.step('Only Send for Approval does', async () => {
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(draftPayer.nameEn);
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(draftPayer.nameEn);
    });
  });

  test('TC-007: should move the draft through Pending Approval to Approved and, after a rejection, back into the cycle', async ({
    payerManagementPage,
    approvalManagementPage,
    draftPayer,
    steps,
  }) => {
    test.slow();

    await steps.critical('Navigate to the module and send the draft for approval', async () => {
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(draftPayer.nameEn);
    });

    await steps.step('Approval publishes it', async () => {
      await approvalManagementPage.open();
      await approvalManagementPage.approve(draftPayer.nameEn);
      await payerManagementPage.open();
      await payerManagementPage.search(draftPayer.nameEn);
      await payerManagementPage.expectApprovalStatusContains(draftPayer.nameEn, APPROVAL_STATE.published);
    });

    await steps.step('A new edit, sent and rejected, reads Rejected', async () => {
      await payerManagementPage.editTextFieldAndSave(draftPayer.nameEn, SUBMIT_EDIT.label, SUBMIT_EDIT.value);
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(draftPayer.nameEn);
      await approvalManagementPage.open();
      await approvalManagementPage.reject(draftPayer.nameEn);
      // The list's approval cell keeps the LIVE version ("v1 · Published") and
      // the rejected-registration banner is for first-time payers only; a
      // rejected EDIT shows in the payer's Version History.
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(draftPayer.nameEn);
      const history = detail.versionHistory();
      await history.open();
      const statuses = await history.getListedStatuses();
      expect(
        statuses.some((status) => REJECTED_STATE.test(status)),
        `a rejected version should be listed; statuses: ${statuses.join(', ')}`,
      ).toBe(true);
    });

    await steps.step('The rejected draft can be edited and sent again', async () => {
      await payerManagementPage.editTextFieldAndSave(draftPayer.nameEn, SUBMIT_EDIT.label, SUBMIT_EDIT.again);
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(draftPayer.nameEn);
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(draftPayer.nameEn);
    });
  });

  test('TC-008: should offer nothing to send when the payer has no changes since its last approved version', async ({
    payerManagementPage,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    await steps.critical('Navigate to the module and find the published payer', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectApprovalStatusContains(publishedPayer.nameEn, APPROVAL_STATE.published);
    });

    await steps.step('Its row offers no Send for Approval', async () => {
      // Nothing changed, so there is nothing to review: the action is withheld
      // rather than raising an empty or ambiguous request.
      expect(
        await payerManagementPage.hasRowAction(publishedPayer.nameEn, 'submit-for-approval'),
        'a payer with no pending changes should not offer Send for Approval',
      ).toBe(false);
    });

    await steps.step('And no request exists for it', async () => {
      await approvalManagementPage.open();
      expect(await approvalManagementPage.countQueuedRequests(publishedPayer.nameEn)).toBe(0);
    });
  });

  test('TC-011: should hold exactly one approval request when two sessions send the same draft at once', async ({
    payerManagementPage,
    approvalManagementPage,
    staleSession,
    draftPayer,
    steps,
  }) => {
    test.slow();

    await steps.critical('Navigate to the module and open the Send for Approval prompt in a second session', async () => {
      const dialog = await staleSession.payerPage.openSendForApprovalPrompt(draftPayer.nameEn);
      expect(await dialog.getTitle()).toContain(SUBMISSION_PROMPT.title);
    });

    await steps.step('The first session sends the draft', async () => {
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(draftPayer.nameEn);
    });

    await steps.step('The second session confirms its already-open prompt', async () => {
      await staleSession.payerPage.dialog().confirm('Send for Approval');
      await staleSession.payerPage.waitForPageReady();
      expect(await staleSession.payerPage.dialog().isVisible(), 'the second prompt should be gone').toBe(false);
    });

    await steps.step('Exactly one request exists for the draft', async () => {
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(draftPayer.nameEn);
      expect(
        await approvalManagementPage.countQueuedRequests(draftPayer.nameEn),
        'two concurrent submissions must not produce two requests',
      ).toBe(1);
    });
  });

  test('TC-013: should leave no partial request when the submission fails on the wire, and succeed on retry', async ({
    page,
    payerManagementPage,
    approvalManagementPage,
    draftPayer,
    steps,
  }) => {
    await steps.critical('Navigate to the module and attempt the submission with the service failing', async () => {
      await NetworkUtils.failEndpoint(page, ApiEndpoints.payerSubmit);
      await payerManagementPage.open();
      const dialog = await payerManagementPage.openSendForApprovalPrompt(draftPayer.nameEn);
      await dialog.confirmRepeatedly(1);
      await payerManagementPage.waitForPageReady();
      await NetworkUtils.restoreEndpoint(page, ApiEndpoints.payerSubmit);
      await payerManagementPage.open();
      await payerManagementPage.search(draftPayer.nameEn);
      await payerManagementPage.expectApprovalStatusContains(draftPayer.nameEn, APPROVAL_STATE.draft);
    });

    await steps.step('No request was created by the failed attempt', async () => {
      await approvalManagementPage.open();
      await approvalManagementPage.expectNotInQueue(draftPayer.nameEn);
    });

    await steps.step('The retry creates a single valid request', async () => {
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(draftPayer.nameEn);
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(draftPayer.nameEn);
      expect(await approvalManagementPage.countQueuedRequests(draftPayer.nameEn)).toBe(1);
    });
  });

  test('TC-014: should refuse to save an incomplete draft so it can never be sent for approval', async ({
    payerManagementPage,
    approvalManagementPage,
    draftPayer,
    steps,
  }) => {
    await steps.critical('Navigate to the module and blank a required field on the draft', async () => {
      await payerManagementPage.open();
      const form = await payerManagementPage.openEditForm(draftPayer.nameEn);
      await form.setFieldValue(REQUIRED_FIELD_LABEL, '', 'text');
      await form.saveAndReportDialog();
      // The guarantee is that an INCOMPLETE draft never comes to exist: the
      // form either holds the save, or ignores the blank and keeps the name.
      const held = await form.isOpen();
      await form.closeAndDiscard();
      await payerManagementPage.open();
      await payerManagementPage.search(draftPayer.nameEn);
      const stillNamed = await payerManagementPage.isRowVisible(draftPayer.nameEn);
      expect(
        held || stillNamed,
        'blanking the name must be refused, or at least never persisted - the draft lost its name',
      ).toBe(true);
    });

    await steps.step('Nothing reached the queue', async () => {
      await approvalManagementPage.open();
      await approvalManagementPage.expectNotInQueue(draftPayer.nameEn);
    });
  });

  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.id}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
