import { test, expect } from '../../../fixtures';
import type { ConfirmDialog } from '../../../pages/components/ConfirmDialog';
import {
  ALREADY_DECIDED,
  CASE,
  COMMENT,
  COMMENT_LENGTH,
  FORBIDDEN_STATUS,
  REASON,
  STATE,
} from '../../../data/plans/rejectPendingPlanVersion.data';

/**
 * User story 14173: Reject pending plan version back to Rejected.
 * The guards: a mandatory, length-limited comment; approvers only; pending
 * plans only; and no second, stale rejection.
 *
 * The approver is the suite administrator; the non-approver roles are played
 * by the non-admin account; the "second approver session" is the administrator
 * signed in again (data file).
 */
test.describe('US 14173 - Rejection guards', () => {
  test.describe.configure({ timeout: 15 * 60_000 });

  test(`TC-${CASE.commentRequired}: should block the rejection while the comment is empty and accept it when one character is entered`, async ({
    planManagementPage,
    planApprovalsPage,
    planIn,
    steps,
  }) => {
    const plan = await planIn('PendingApproval');
    let dialog!: ConfirmDialog;

    await steps.critical('Navigate to the Plans Management module - the directory loads', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Open the pending plan and select Reject - the dialog opens with an empty comments field', async () => {
      await planApprovalsPage.open();
      dialog = await planApprovalsPage.openRejectDialog(plan.name);
      expect(await dialog.hasFreeTextInput(), 'the Reject dialog should offer a comments field').toBe(true);
      expect(await dialog.typeReasonText(''), 'the comments field starts empty').toBe('');
    });

    await steps.step('Leave the comments blank and try to confirm - comments are required and the dialog stays open', async () => {
      await dialog.selectReasonIfPresent(REASON.other);
      await dialog.acknowledgeIfPresent();
      await dialog.expectAffirmativeDisabled('Reject must stay unavailable while the comments are empty');
      expect(await dialog.isVisible(), 'the dialog stays open').toBe(true);
      await dialog.cancel();
    });

    await steps.step('Enter a single character and confirm - the rejection is accepted and the dialog closes', async () => {
      const outcome = await planApprovalsPage.decideWithComment(plan.name, 'reject', COMMENT.minimal, REASON.other);
      expect(outcome.typed).toBe(COMMENT.minimal);
      expect(outcome.answer, 'a one-character comment should be accepted').toMatch(/answered 2\d\d/);
      expect(outcome.stillQueued).toBe(false);
    });
  });

  test(`TC-${CASE.approverOnly}: should let only an approver reject and deny every other role when a pending plan is rejected`, async ({
    planManagementPage,
    planApprovalsPage,
    nonAdminSession,
    requireBaseline,
    planIn,
    steps,
  }) => {
    const plan = await planIn('PendingApproval');
    let requestId = '';

    await steps.critical('Navigate to the Plans Management module - the directory loads for each user', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
      await planApprovalsPage.open();
      requestId = await planApprovalsPage.getPendingRequestId(plan.name);
    });

    await steps.step('An authorised approver opens the pending plan - Reject is visible and enabled', async () => {
      const offered = await planApprovalsPage.getRowActionAvailability(plan.name, 'reject');
      requireBaseline(offered === 'available', 'Reject on a pending plan for the approver');
      expect(offered).toBe('available');
    });

    await steps.step('A Plan Administrator (non-approver) opens the same plan - Reject is hidden or disabled', async () => {
      await nonAdminSession.planApprovals.openHub();
      await nonAdminSession.planApprovals.expectApprovalActionsDenied();
    });

    await steps.step('A read-only viewer opens the plan - Reject is not available', async () => {
      await nonAdminSession.planDetail.openExpectingFailure(plan.id);
      await nonAdminSession.planApprovals.openHub();
      await nonAdminSession.planApprovals.expectApprovalActionsDenied();
    });

    await steps.step('A direct reject call by a non-approver is denied with a permissions error', async () => {
      const answer = await nonAdminSession.planApprovals.rejectRequestViaApi(requestId, COMMENT.valid);
      expect(answer.status, answer.text.slice(0, 200)).toBe(FORBIDDEN_STATUS);
      await planApprovalsPage.expectInQueue(plan.name);
    });
  });

  test(`TC-${CASE.pendingOnly}: should offer Reject only when the plan is awaiting approval and not when it is Draft, Active or Rejected`, async ({
    planManagementPage,
    planApprovalsPage,
    requireBaseline,
    planIn,
    steps,
  }) => {
    test.setTimeout(25 * 60_000);
    const draft = await planIn('Draft');
    const active = await planIn('Active');
    const rejected = await planIn('Rejected');
    const pending = await planIn('PendingApproval');

    await steps.critical('Navigate to the Plans Management module - the directory shows plans in every status', async () => {
      await planManagementPage.openListFor(pending.payerName);
      for (const plan of [draft, active, rejected, pending]) {
        expect(await planManagementPage.isListed(plan.name), `"${plan.name}" should be listed`).toBe(true);
      }
      await planApprovalsPage.open();
      requireBaseline((await planApprovalsPage.getRowActionAvailability(pending.name, 'reject')) === 'available', 'Reject on a pending plan');
    });

    await steps.step('Open the Draft plan - no Reject action is available', async () => {
      await planApprovalsPage.expectNotInQueue(draft.name);
    });

    await steps.step('Open the Active plan - no Reject action is available', async () => {
      await planApprovalsPage.expectNotInQueue(active.name);
    });

    await steps.step('Open the plan already Rejected - no Reject action is available', async () => {
      await planApprovalsPage.expectNotInQueue(rejected.name);
    });

    await steps.step('Open the plan in Pending Approval and select Reject - it is available and executes', async () => {
      expect(await planApprovalsPage.getRowActionAvailability(pending.name, 'reject')).toBe('available');
      await planApprovalsPage.reject(pending.name, REASON.rates);
      await planManagementPage.expectApprovalCell(pending.name, STATE.rejected);
    });
  });

  test(`TC-${CASE.commentLength}: should accept a 1000-character comment and refuse 1001 characters when a plan is rejected`, async ({
    planManagementPage,
    planApprovalsPage,
    planIn,
    steps,
  }) => {
    const first = await planIn('PendingApproval');
    const second = await planIn('PendingApproval');

    await steps.critical('Navigate to the Plans Management module - the directory loads', async () => {
      await planManagementPage.openListFor(first.payerName);
      expect(await planManagementPage.isListed(first.name)).toBe(true);
    });

    await steps.critical('Open the pending plan and select Reject - the dialog opens', async () => {
      await planApprovalsPage.open();
      const dialog = await planApprovalsPage.openRejectDialog(first.name);
      expect(await dialog.hasFreeTextInput(), 'the Reject dialog should offer a comments field').toBe(true);
      await dialog.cancel();
    });

    await steps.step(`Enter a comment of exactly ${COMMENT_LENGTH.max} characters and confirm - the rejection is accepted`, async () => {
      const outcome = await planApprovalsPage.decideWithComment(first.name, 'reject', COMMENT_LENGTH.atMax, REASON.other);
      expect(outcome.typed, 'the full comment is kept').toBe(COMMENT_LENGTH.atMax);
      expect(outcome.stillQueued, outcome.answer).toBe(false);
    });

    await steps.step(`On another pending plan a ${COMMENT_LENGTH.max + 1}-character comment is refused and nothing is submitted`, async () => {
      const dialog = await planApprovalsPage.openRejectDialog(second.name);
      const held = await dialog.typeReasonText(COMMENT_LENGTH.overMax);
      expect(held.length, 'the field should refuse characters past the maximum').toBeLessThanOrEqual(COMMENT_LENGTH.max);
      await dialog.cancel();
      await planApprovalsPage.expectInQueue(second.name);
    });
  });

  test(`TC-${CASE.noDoubleRejection}: should apply only the first rejection and refuse a stale second one when two approvers act on the same plan`, async ({
    planManagementPage,
    planApprovalsPage,
    planDetailPage,
    staleSession,
    planIn,
    steps,
  }) => {
    const plan = await planIn('PendingApproval');

    await steps.critical('Navigate to the module in two approver sessions - both show the plan in Pending Approval', async () => {
      await planManagementPage.openListFor(plan.payerName);
      await planApprovalsPage.open();
      await planApprovalsPage.expectInQueue(plan.name);
      await staleSession.planApprovals.open();
      await staleSession.planApprovals.expectInQueue(plan.name);
    });

    await steps.critical('In session A reject the plan with a valid comment - it becomes Rejected', async () => {
      await planApprovalsPage.reject(plan.name, REASON.rates);
      await planManagementPage.expectApprovalCell(plan.name, STATE.rejected);
    });

    await steps.step('In session B (still showing Pending Approval) reject it again - an error says it is no longer pending', async () => {
      const attempt = await staleSession.planApprovals.attemptDecisionOnLoadedRow(plan.name, 'reject', REASON.pricing);
      expect(attempt.answer, 'the second rejection should be refused').toMatch(/answered 4\d\d/);
      expect(`${attempt.answer} ${attempt.messages}`, 'the refusal should say the plan is no longer pending').toMatch(ALREADY_DECIDED);
    });

    await steps.step('Refresh session B - the plan shows as Rejected, with a single rejection recorded', async () => {
      await staleSession.planApprovals.open();
      await staleSession.planApprovals.expectNotInQueue(plan.name);
      await planDetailPage.open(plan.id);
      await planDetailPage.versions().open();
      const rejectedEntries = (await planDetailPage.versions().readRows()).filter((row) => STATE.rejected.test(row.status));
      expect(rejectedEntries.length, 'exactly one rejection record').toBe(1);
    });
  });
});
