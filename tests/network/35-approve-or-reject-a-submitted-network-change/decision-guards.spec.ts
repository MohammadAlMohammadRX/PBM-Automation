import { test, expect } from '../../../fixtures';
import type { ConfirmDialog } from '../../../pages/components/ConfirmDialog';
import { ALREADY_DECIDED, CASE, CHANGES, FORBIDDEN_STATUS, REASON, REASON_LENGTH, edited } from '../../../data/networks/approveRejectChange.data';

/**
 * User story 14314: Approve or reject a submitted network change.
 * Who may decide, and what cannot be decided twice.
 *
 * The administrator is the only account that may approve, and it submits the
 * changes too - so the self-decision rows are asserted against it. The
 * non-reviewer is the configured non-admin account (role "Payer Admin", which
 * by definition holds no approval right).
 */
test.describe('US 14314 - Decision guards', () => {
  test.describe.configure({ timeout: 15 * 60_000 });

  test(`TC-${CASE.noSelfDecision}: should keep the submitter from approving or rejecting their own change even when they hold the reviewer role`, async ({
    networkManagementPage,
    networkApprovalsPage,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Active');

    await steps.critical('Navigate to the module with a change submitted by this user', async () => {
      await networkManagementPage.proposeChange(network.name, edited(CHANGES.first));
      await networkApprovalsPage.expectInQueue(network.name);
    });

    await steps.critical('The submitter opens the queue - the change is visible', async () => {
      await networkApprovalsPage.open();
      await networkApprovalsPage.expectInQueue(network.name);
    });

    await steps.step('Approve and Reject are disabled or hidden on the submitter\'s own change', async () => {
      await networkApprovalsPage.expectSelfApprovalPrevented(network.name);
      expect(await networkApprovalsPage.getRowActionAvailability(network.name, 'reject'), 'reject on own change').not.toBe('available');
    });

    await steps.step('A direct approve call by the submitter is denied with an authorization error', async () => {
      const requestId = await networkApprovalsPage.getPendingRequestId(network.name);
      const answer = await networkApprovalsPage.approveRequestViaApi(requestId);
      expect(answer.status, 'self-approval should be refused').toBe(FORBIDDEN_STATUS);
    });
  });

  test(`TC-${CASE.nonReviewer}: should deny approve and reject when the user has no reviewer permission`, async ({
    networkManagementPage,
    networkApprovalsPage,
    networkIn,
    nonAdminSession,
    steps,
  }) => {
    const network = await networkIn('Active');
    let requestId = '';

    await steps.critical('Navigate to the module with a change waiting for review', async () => {
      await networkManagementPage.proposeChange(network.name, edited(CHANGES.first));
      await networkApprovalsPage.open();
      requestId = await networkApprovalsPage.getPendingRequestId(network.name);
    });

    await steps.step('In Pending Approvals the non-reviewer is offered no decision controls', async () => {
      await nonAdminSession.networkApprovals.openHub();
      await nonAdminSession.networkApprovals.expectApprovalActionsDenied();
    });

    await steps.step('A direct approve attempt is blocked with an authorization error', async () => {
      const answer = await nonAdminSession.networkApprovals.approveRequestViaApi(requestId);
      expect(answer.status).toBe(FORBIDDEN_STATUS);
      await networkApprovalsPage.expectInQueue(network.name);
    });
  });

  test(`TC-${CASE.reDecide}: should refuse a second decision when the change has already been approved`, async ({
    networkManagementPage,
    networkApprovalsPage,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Active');
    let requestId = '';

    await steps.critical('Navigate to the module with a change that has been approved', async () => {
      await networkManagementPage.proposeChange(network.name, edited(CHANGES.first));
      await networkApprovalsPage.open();
      requestId = await networkApprovalsPage.getPendingRequestId(network.name);
      await networkApprovalsPage.approve(network.name);
    });

    await steps.step('The approved change is no longer offered for a decision', async () => {
      await networkApprovalsPage.expectNotInQueue(network.name);
    });

    await steps.step('Approving it again is refused with an "already decided" error', async () => {
      const answer = await networkApprovalsPage.approveRequestViaApi(requestId);
      expect(answer.status, 'a decided change must not be decided again').toBeGreaterThanOrEqual(400);
      expect(answer.text).toMatch(ALREADY_DECIDED);
    });
  });

  test(`TC-${CASE.concurrentReviewers}: should apply only the first decision when two reviewers act on the same change`, async ({
    networkManagementPage,
    networkApprovalsPage,
    staleSession,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Active');

    await steps.critical('Navigate to the module with one submitted change', async () => {
      await networkManagementPage.proposeChange(network.name, edited(CHANGES.first));
      await networkApprovalsPage.expectInQueue(network.name);
    });

    await steps.critical('Both reviewer sessions show the change as submitted', async () => {
      await networkApprovalsPage.open();
      await networkApprovalsPage.expectInQueue(network.name);
      await staleSession.networkApprovals.open();
      await staleSession.networkApprovals.expectInQueue(network.name);
    });

    await steps.step('Session A approves; session B\'s immediate reject is blocked as already decided', async () => {
      await networkApprovalsPage.approve(network.name);
      const attempt = await staleSession.networkApprovals.attemptDecisionOnLoadedRow(network.name, 'reject', REASON.incorrectProviders);
      expect(attempt.answer, 'the second decision should be refused').toMatch(/answered 4\d\d/);
      expect(`${attempt.answer} ${attempt.messages}`, 'the refusal should say it was already decided').toMatch(ALREADY_DECIDED);
    });
  });

  test(`TC-${CASE.reasonLength}: should accept a 500-character reason and refuse 501 when the rejection reason is typed`, async ({
    networkManagementPage,
    networkApprovalsPage,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Active');
    let dialog!: ConfirmDialog;

    await steps.critical('Navigate to the module with a change to reject', async () => {
      await networkManagementPage.proposeChange(network.name, edited(CHANGES.rejected));
      await networkApprovalsPage.expectInQueue(network.name);
    });

    await steps.critical(`The Reject dialog takes a typed reason of exactly ${REASON_LENGTH.max} characters`, async () => {
      await networkApprovalsPage.open();
      dialog = await networkApprovalsPage.openRejectDialog(network.name);
      expect(await dialog.hasFreeTextInput(), 'the reason should be a field the reviewer can type into').toBe(true);
      expect(await dialog.typeReasonText(REASON_LENGTH.atMax), 'a 500-character reason is kept whole').toBe(REASON_LENGTH.atMax);
    });

    await steps.step('A 501-character reason is refused', async () => {
      const held = await dialog.typeReasonText(REASON_LENGTH.overMax);
      expect(held.length, 'the field should stop at the maximum').toBeLessThanOrEqual(REASON_LENGTH.max);
      await dialog.cancel();
    });
  });

  test(`TC-${CASE.decisionTable}: should allow a rejection only for a reviewer, on someone else's change, with a reason`, async ({
    networkManagementPage,
    networkApprovalsPage,
    nonAdminSession,
    networkIn,
    steps,
  }) => {
    test.setTimeout(20 * 60_000);
    const withReason = await networkIn('Active');
    const withoutReason = await networkIn('Active');

    await steps.critical('Navigate to the module with two submitted changes', async () => {
      await networkManagementPage.proposeChange(withReason.name, edited(CHANGES.rejected));
      await networkManagementPage.proposeChange(withoutReason.name, edited(CHANGES.rejected));
      await networkApprovalsPage.open();
    });

    await steps.step('Reviewer + reason: the rejection succeeds', async () => {
      await networkApprovalsPage.reject(withReason.name, REASON.missingCoverage);
      await networkApprovalsPage.expectNotInQueue(withReason.name);
    });

    await steps.step('Reviewer without a reason: the rejection is blocked', async () => {
      const dialog = await networkApprovalsPage.openRejectDialog(withoutReason.name);
      await dialog.acknowledgeIfPresent();
      await dialog.expectAffirmativeDisabled('Reject needs a reason');
      await dialog.cancel();
    });

    await steps.step('Submitter who is also a reviewer: rejecting their own change is blocked', async () => {
      expect(await networkApprovalsPage.getRowActionAvailability(withoutReason.name, 'reject'), 'own change').not.toBe('available');
    });

    await steps.step('Non-reviewer: rejecting is blocked by the role', async () => {
      const requestId = await networkApprovalsPage.getPendingRequestId(withoutReason.name);
      await nonAdminSession.networkApprovals.openHub();
      await nonAdminSession.networkApprovals.expectApprovalActionsDenied();
      const answer = await nonAdminSession.networkApprovals.rejectRequestViaApi(requestId, REASON.missingCoverage);
      expect(answer.status).toBe(FORBIDDEN_STATUS);
    });
  });
});
