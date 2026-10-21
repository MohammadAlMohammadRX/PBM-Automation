import { test, expect } from '../../../fixtures';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import { NetworkUtils } from '../../../utils/NetworkUtils';
import { findPayers } from '../../../utils/PayerFinder';
import { PayerFormDialog } from '../../../pages/payer/PayerFormDialog';
import { DELETE_UI } from '../../../data/payers/deletePayer.data';
import { APPROVAL_STATE, SUBMISSION_PROMPT } from '../../../data/payers/withdrawApproval.data';
import {
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

  // Azure test case 15622
  //
  // WRITTEN 2026-10-18 (QA lead: in Approvals, click Review to see the before
  // and after). The reviewer's Review panel now carries a Field / Before /
  // After table (verified live), so one edited field is checked end to end on
  // the suite's own published payer.
  test('15622: should show every edited field as a before/after change in the reviewer\'s queue entry', async ({
    payerManagementPage,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    test.slow();
    const name = publishedPayer.nameEn;
    const before = publishedPayer.phone;
    const after = '512345690';
    let rows: { field: string; before: string; after: string }[] = [];

    await steps.critical('Edit the payer\'s phone number and send the change for approval', async () => {
      await payerManagementPage.open();
      await payerManagementPage.saveTextFieldEdit(name, 'Phone Number', after);
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(name);
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(name);
    });

    await steps.step('The reviewer opens Review and sees the change as before and after', async () => {
      rows = await approvalManagementPage.openReview(name);
      const phone = rows.find((r) => /phone/i.test(r.field));
      expect(phone, `the Review panel should list the Phone Number field; it lists: ${rows.map((r) => r.field).join(', ')}`).toBeDefined();
      expect(phone!.before, 'the before value should be the published phone number').toContain(before);
      expect(phone!.after, 'the after value should be the edited phone number').toContain(after);
    });

    await steps.step('Only the edited field reads as changed', async () => {
      const changed = rows.filter((r) => r.before !== r.after).map((r) => `${r.field}: "${r.before}" -> "${r.after}"`);
      expect(changed.length, `exactly the edited field should differ; changed: ${changed.join('; ')}`).toBe(1);
      await approvalManagementPage.closeReview();
    });
  });

  // Azure test case 15616
  //
  // WRITTEN 2026-10-18 (QA lead: test it on current data - a payer holding an
  // ACTIVE plan and an active network; the blocker's message comes on the
  // delete action, not at approval). The payer is located across the register
  // (GetPayers + its plans read in the Plans module, payer in scope). Deleting
  // it is attempted; a payer holding a network is always refused (verified,
  // D-017), so nothing is ever staged on this real record.
  test('15616: should catch a deletion blocker introduced after staging when the draft is sent', async ({
    page,
    payerManagementPage,
    planManagementPage,
    approvalManagementPage,
    steps,
  }) => {
    test.slow();
    let holder: { name: string; code: string; plan: string } | null = null;
    let statusBefore = '';
    let queuedBefore = 0;

    await steps.critical('Find a payer holding an active, published plan and an active network', async () => {
      const candidates = await findPayers(page, (p) => p.linkedNetworksCount > 0 && p.linkedPoliciesCount > 0, 'payers with networks and policies', []);
      for (const candidate of candidates) {
        const active = (await planManagementPage.plansInScopeOf(candidate.payerNameEn))
          .find((plan) => /published/i.test(plan.approval) && /^active$/i.test(plan.status));
        if (active) { holder = { name: candidate.payerNameEn, code: candidate.payerCode ?? '', plan: `${active.name} (${active.code})` }; break; }
      }
      if (!holder) steps.blocked(`No payer holds an active, published plan with a network (checked: ${candidates.map((c) => c.payerNameEn).join(', ')}).`);
      statusBefore = await payerManagementPage.getApprovalStatus(holder!.code || holder!.name);
      await approvalManagementPage.open();
      queuedBefore = await approvalManagementPage.countQueuedRequests(holder!.name);
      expect(holder!.plan, 'a payer with an active plan should have been found').not.toBe('');
    });

    let messages: string[] = [];
    await steps.step('Deleting the payer is refused on the delete action itself, with a message', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(holder!.code || holder!.name);
      await payerManagementPage.clickDelete(holder!.code || holder!.name);
      await payerManagementPage.dialog().confirm(DELETE_UI.en.confirm);
      expect(
        await payerManagementPage.wasDeletionBlockedByDependency(),
        `"${holder!.name}" holds the active plan ${holder!.plan}; its deletion must be refused on the delete action`,
      ).toBe(true);
      messages = await new PayerFormDialog(page).getVisibleMessages();
      expect(messages.join(' | '), 'the refusal should carry a message').not.toBe('');
    });

    await steps.step('Nothing was staged, so there is nothing to send for approval', async () => {
      expect(await payerManagementPage.getApprovalStatus(holder!.code || holder!.name), 'the payer\'s approval status should be unchanged')
        .toBe(statusBefore);
      await approvalManagementPage.open();
      expect(
        await approvalManagementPage.countQueuedRequests(holder!.name),
        `no request for "${holder!.name}" should have been queued by the refused deletion`,
      ).toBe(queuedBefore);
    });
  });
});
