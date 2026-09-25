import { test, expect } from '../../../fixtures';
import { azureOrCase } from '../../../data/azureTestIds.data';
import type { ShapedSession } from '../../../fixtures/shapedNonAdmin.fixture';
import { NON_ADMIN_PROFILE } from '../../../data/accounts/nonAdminAccount.data';
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
  // Azure test case 15611
  test('15611: should raise an approval request when Send for Approval is confirmed from the detail header', async ({
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

  // Azure test case 15612
  test('15612: should raise the same approval request when Send for Approval is used from the list row', async ({
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

  // Azure test case 15613
  test('15613: should raise no approval request when the Send for Approval confirmation is cancelled', async ({
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

  // Azure test case 15614
  test('15614: should raise an approval request only through Send for Approval and not through saving edits', async ({
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

  // Azure test case 15617
  test('15617: should move the draft through Pending Approval to Approved and, after a rejection, back into the cycle', async ({
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

  // Azure test case 15618
  test('15618: should offer nothing to send when the payer has no changes since its last approved version', async ({
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

  // Azure test case 15621
  test('15621: should hold exactly one approval request when two sessions send the same draft at once', async ({
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

  // Azure test case 15624
  test('15624: should leave no partial request when the submission fails on the wire, and succeed on retry', async ({
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

  // Azure test case 15623
  test('15623: should refuse to save an incomplete draft so it can never be sent for approval', async ({
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


  // ---- the withheld half, on a role shaped for this case -------------------
  // This used to report BLOCKED: the one non-administrator credential in this
  // environment HOLDS the permission whose absence the case is about. The
  // account is now BUILT - the administrator takes the permission off the
  // shared "Payer Admin" role, the case signs in as it, and the permission
  // goes back when the case ends.

  // Azure test case 15620
  test('15620: should refuse Send for Approval to a user without the System Administrator role', async ({ shapedNonAdmin, steps }) => {
    let session!: ShapedSession;

    // THE BASELINE COMES FIRST. Send for Approval is offered only to a record
    // with a staged change to submit, so on a published payer it is absent
    // whatever the role holds - and the case would pass while proving nothing.
    // Asked for WITH the right first, a state-withheld control is reported as
    // BLOCKED rather than as a permission the application honoured.
    await steps.critical('Send for Approval IS offered while the role holds the right', async () => {
      const held = await shapedNonAdmin({ with: ['sendForApproval'] });
      await held.payers.navigate();
      await held.payers.expectRowsRendered();
      const offered = await held.payers.getRowActionAvailability(
        NON_ADMIN_PROFILE.scopedPayers[0],
        'submit-for-approval',
      );
      if (offered !== 'available') {
        steps.blocked(
          `"${NON_ADMIN_PROFILE.scopedPayers[0]}" does not offer Send for Approval even to a role `
            + `that HOLDS the right (the control is ${offered}), because the record has nothing `
            + 'staged to submit. The state withholds the action, not the permission. The case '
            + 'needs a payer with a pending draft inside the account\'s scope.',
        );
      }
    });

    await steps.critical('Sign in as a user without Send for Approval', async () => {
      session = await shapedNonAdmin({ without: ['sendForApproval'] });
      await session.payers.navigate();
      await session.payers.expectRowsRendered();
    });

    await steps.step('Send for Approval is withheld from this role', async () => {
      await session.payers.expectRowActionUnavailable(NON_ADMIN_PROFILE.scopedPayers[0], 'submit-for-approval');
    });
  });
  for (const blocked of BLOCKED_CASES) {
    // Azure test cases - one per generated case:
    //   TC-005 = 15615,  TC-006 = 15616,  TC-009 = 15619
    //   TC-012 = 15622,  TC-015 = 15625
    test(`${azureOrCase('63', 'TC-' + blocked.id)}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
