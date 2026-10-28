import { test, expect } from '../../../fixtures';
import type { ConfirmDialog } from '../../../pages/components/ConfirmDialog';
import {
  CASE,
  FORBIDDEN_STATUS,
  MSG_044,
  RAPID_ATTEMPTS,
  REASON,
  REASON_TEXT,
  STATE,
  SUBMITTER_PAYER,
} from '../../../data/plans/conflictingApprovalRequests.data';

/**
 * User story 14343: Manage conflicting requests during the approval workflow -
 * a rejection needs a genuine reason (MSG-PLN-044), and a submitter does not
 * decide their own change.
 *
 * "The reason" here is what the reviewer types: the Reject dialog's free-text
 * field in the UI (the managed reason is chosen too, so only the typed reason
 * is under test), and the `reason` of a direct RejectRequest.
 */
test.describe('US 14343 - Rejection reason and segregation of duties', () => {
  test.describe.configure({ timeout: 15 * 60_000 });

  test(`TC-${CASE.rejectNoReasonBlocked}: should block a rejection with MSG-PLN-044 and keep the change pending when no reason is given`, async ({
    planManagementPage,
    planApprovalsPage,
    planIn,
    steps,
  }) => {
    const plan = await planIn('PendingApproval');
    let dialog!: ConfirmDialog;
    let requestId = '';

    await steps.critical('Navigate to the Plans Management module - the dashboard loads', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Open the pending approval queue and select the change - its details and the Reject action are displayed', async () => {
      await planApprovalsPage.open();
      requestId = await planApprovalsPage.getPendingRequestId(plan.name);
      expect(await planApprovalsPage.getRowActionAvailability(plan.name, 'reject')).toBe('available');
    });

    await steps.step('Select Reject and leave the reason empty - the field stays empty', async () => {
      dialog = await planApprovalsPage.openRejectDialog(plan.name);
      expect(await dialog.typeReasonText(''), 'the reason field is empty').toBe('');
    });

    await steps.step('Submit the rejection - it is refused with MSG-PLN-044 and the change stays Pending Approval', async () => {
      await dialog.acknowledgeIfPresent();
      await dialog.expectAffirmativeDisabled('Reject must stay unavailable without a reason');
      await dialog.cancel();
      const answer = await planApprovalsPage.rejectRequestViaApi(requestId, '');
      expect(answer.status, 'a rejection without a reason must be refused').toBeGreaterThanOrEqual(400);
      expect(`${answer.text} ${answer.validationErrors.join(' ')}`, 'MSG-PLN-044').toMatch(MSG_044);
      await planApprovalsPage.expectInQueue(plan.name);
    });
  });

  test(`TC-${CASE.rejectWithReason}: should reject the change and record the reason in the audit trail when a reason is given`, async ({
    planManagementPage,
    planApprovalsPage,
    planDetailPage,
    planIn,
    steps,
  }) => {
    const plan = await planIn('PendingApproval');
    let dialog!: ConfirmDialog;

    await steps.critical('Navigate to the Plans Management module - the dashboard loads', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Open the pending approval queue and select the change - its details and the Reject action are displayed', async () => {
      await planApprovalsPage.open();
      expect((await planApprovalsPage.openReview(plan.name)).length).toBeGreaterThan(0);
      await planApprovalsPage.closeReview();
      expect(await planApprovalsPage.getRowActionAvailability(plan.name, 'reject')).toBe('available');
    });

    await steps.step('Select Reject and enter a valid rejection reason - the text is accepted', async () => {
      dialog = await planApprovalsPage.openRejectDialog(plan.name);
      expect(await dialog.typeReasonText(REASON_TEXT.formularyMismatch)).toBe(REASON_TEXT.formularyMismatch);
      await dialog.cancel();
    });

    await steps.step('Submit the rejection - the change is Rejected and the reason is in the audit trail', async () => {
      const outcome = await planApprovalsPage.decideWithComment(plan.name, 'reject', REASON_TEXT.formularyMismatch, REASON);
      expect(outcome.stillQueued, outcome.answer).toBe(false);
      await planManagementPage.expectApprovalCell(plan.name, STATE.rejected);
      await planDetailPage.open(plan.id);
      await planDetailPage.audit().open();
      const entry = await planDetailPage.audit().openEntry(0);
      await planDetailPage.audit().closeEntry();
      expect(JSON.stringify(entry), 'the audit entry of the rejection keeps its reason').toContain(REASON_TEXT.formularyMismatch);
    });
  });

  test(`TC-${CASE.reasonBoundary}: should refuse the rejection when the reason is whitespace only and accept it when minimal real text is given`, async ({
    planManagementPage,
    planApprovalsPage,
    planIn,
    steps,
  }) => {
    const minimal = await planIn('PendingApproval');
    const plan = await planIn('PendingApproval');
    let requestId = '';

    await steps.critical('Navigate to the Plans Management module - the dashboard loads', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Open the pending change and select Reject - the dialog opens with a reason field', async () => {
      await planApprovalsPage.open();
      requestId = await planApprovalsPage.getPendingRequestId(plan.name);
      const dialog = await planApprovalsPage.openRejectDialog(plan.name);
      expect(await dialog.hasFreeTextInput(), 'the Reject dialog should offer a reason field').toBe(true);
      await dialog.cancel();
    });

    await steps.step('Enter a single valid character and submit - the minimum-length rule accepts it', async () => {
      const outcome = await planApprovalsPage.decideWithComment(minimal.name, 'reject', REASON_TEXT.single, REASON);
      expect(outcome.typed).toBe(REASON_TEXT.single);
      expect(outcome.stillQueued, outcome.answer).toBe(false);
    });

    await steps.step('Enter a reason of spaces only and submit - the submission is rejected', async () => {
      const dialog = await planApprovalsPage.openRejectDialog(plan.name);
      await dialog.typeReasonText(REASON_TEXT.spaces);
      await dialog.selectReasonIfPresent(REASON);
      await dialog.acknowledgeIfPresent();
      await dialog.expectAffirmativeDisabled('a whitespace-only reason is no reason');
      await dialog.cancel();
      const answer = await planApprovalsPage.rejectRequestViaApi(requestId, REASON_TEXT.spaces);
      expect(answer.status, 'a whitespace-only reason must be refused').toBeGreaterThanOrEqual(400);
      await planApprovalsPage.expectInQueue(plan.name);
    });

    await steps.step('Enter a properly worded short reason and submit - the submission succeeds', async () => {
      const outcome = await planApprovalsPage.decideWithComment(plan.name, 'reject', REASON_TEXT.short, REASON);
      expect(outcome.stillQueued, outcome.answer).toBe(false);
    });
  });

  test(`TC-${CASE.noForcedRejection}: should record no rejection when whitespace reasons are submitted repeatedly`, async ({
    planManagementPage,
    planApprovalsPage,
    planDetailPage,
    planIn,
    steps,
  }) => {
    const plan = await planIn('PendingApproval');
    let requestId = '';

    await steps.critical('Navigate to the Plans Management module - the dashboard loads', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Open the pending change and select Reject - the dialog opens', async () => {
      await planApprovalsPage.open();
      requestId = await planApprovalsPage.getPendingRequestId(plan.name);
      const dialog = await planApprovalsPage.openRejectDialog(plan.name);
      expect(await dialog.isVisible()).toBe(true);
      await dialog.cancel();
    });

    await steps.step('Enter only whitespace and submit - it is rejected with MSG-PLN-044', async () => {
      const dialog = await planApprovalsPage.openRejectDialog(plan.name);
      await dialog.typeReasonText(REASON_TEXT.whitespace);
      await dialog.selectReasonIfPresent(REASON);
      await dialog.acknowledgeIfPresent();
      await dialog.expectAffirmativeDisabled('a whitespace-only reason is no reason');
      await dialog.cancel();
      const answer = await planApprovalsPage.rejectRequestViaApi(requestId, REASON_TEXT.whitespace);
      expect(answer.status).toBeGreaterThanOrEqual(400);
      expect(`${answer.text} ${answer.validationErrors.join(' ')}`, 'MSG-PLN-044').toMatch(MSG_044);
    });

    await steps.step('Resubmit rapidly several times without a reason - each attempt is refused and no rejection is recorded', async () => {
      const answers = await Promise.all(
        Array.from({ length: RAPID_ATTEMPTS }, () => planApprovalsPage.rejectRequestViaApi(requestId, REASON_TEXT.whitespace)),
      );
      expect(answers.map((answer) => answer.status >= 400), `answers: ${answers.map((a) => a.status).join(', ')}`).toEqual(answers.map(() => true));
      await planApprovalsPage.expectInQueue(plan.name);
      await planDetailPage.open(plan.id);
      await planDetailPage.versions().open();
      const statuses = (await planDetailPage.versions().readRows()).map((row) => row.status);
      expect(statuses.filter((status) => STATE.rejected.test(status)), `version statuses: ${statuses.join(', ')}`).toEqual([]);
    });
  });

  test(`TC-${CASE.noSelfDecision}: should keep the decision from the submitting Plan Administrator and offer it to the Approver when a change is pending`, async ({
    planManagementPage,
    planApprovalsPage,
    nonAdminSession,
    planSubmittedFrom,
    requireBaseline,
    steps,
  }) => {
    const plan = await planSubmittedFrom(nonAdminSession.page, { payerName: SUBMITTER_PAYER });
    let requestId = '';

    await steps.critical('Navigate to the Plans Management module - the dashboard loads', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
      await planApprovalsPage.open();
      requestId = await planApprovalsPage.getPendingRequestId(plan.name);
      requireBaseline((await planApprovalsPage.getDecisionAvailability(plan.name)).approve, 'Approve for the Approver on a change someone else submitted');
    });

    await steps.step('The Plan Administrator who submitted opens the pending request - Approve / Reject are unavailable to them', async () => {
      await nonAdminSession.planApprovals.openHub();
      await nonAdminSession.planApprovals.expectApprovalActionsDenied();
      const answer = await nonAdminSession.planApprovals.approveRequestViaApi(requestId);
      expect(answer.status, answer.text.slice(0, 200)).toBe(FORBIDDEN_STATUS);
    });

    await steps.step('A user with the Approver role opens the same request - Approve / Reject are available', async () => {
      await planApprovalsPage.open();
      expect(await planApprovalsPage.getRowActionAvailability(plan.name, 'approve')).toBe('available');
      expect(await planApprovalsPage.getRowActionAvailability(plan.name, 'reject')).toBe('available');
    });
  });
});
