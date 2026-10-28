import { test, expect } from '../../../fixtures';
import { PERMANENT_PLAN_CODE } from '../../../data/plans/plan.data';
import {
  ALREADY_DECIDED,
  CASE,
  COMMENT,
  COMMENT_LENGTH,
  FORBIDDEN_STATUS,
  STATE,
} from '../../../data/plans/approvePendingPlanVersion.data';

/**
 * User story 14174: Approve pending plan version to activate.
 * The guards: approvers only, pending plans only, a length-limited comment,
 * and no second, stale approval.
 */
test.describe('US 14174 - Approval guards', () => {
  test.describe.configure({ timeout: 15 * 60_000 });

  test(`TC-${CASE.approverOnly}: should let only an approver approve and deny every other role when a pending plan is approved`, async ({
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

    await steps.step('An authorised approver opens the pending plan - Approve is visible and enabled', async () => {
      const offered = await planApprovalsPage.getRowActionAvailability(plan.name, 'approve');
      requireBaseline(offered === 'available', 'Approve on a pending plan for the approver');
      expect(offered).toBe('available');
    });

    await steps.step('A Plan Administrator (non-approver) opens the same plan - Approve is hidden or disabled', async () => {
      await nonAdminSession.planApprovals.openHub();
      await nonAdminSession.planApprovals.expectApprovalActionsDenied();
    });

    await steps.step('A read-only viewer opens the plan - no approval actions are available', async () => {
      await nonAdminSession.planDetail.openExpectingFailure(plan.id);
      await nonAdminSession.planApprovals.openHub();
      await nonAdminSession.planApprovals.expectApprovalActionsDenied();
    });

    await steps.step('A direct approve call by a non-approver is denied with a permissions error', async () => {
      const answer = await nonAdminSession.planApprovals.approveRequestViaApi(requestId);
      expect(answer.status, answer.text.slice(0, 200)).toBe(FORBIDDEN_STATUS);
      await planApprovalsPage.expectInQueue(plan.name);
    });
  });

  test(`TC-${CASE.pendingOnly}: should offer Approve only when the plan is awaiting approval and not when it is Draft, Active or Rejected`, async ({
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
      requireBaseline((await planApprovalsPage.getRowActionAvailability(pending.name, 'approve')) === 'available', 'Approve on a pending plan');
    });

    await steps.step('Open the Draft plan - no Approve action is available', async () => {
      await planApprovalsPage.expectNotInQueue(draft.name);
    });

    await steps.step('Open the plan already Active - no Approve action is available', async () => {
      await planApprovalsPage.expectNotInQueue(active.name);
    });

    await steps.step('Open the Rejected plan - no Approve action is available', async () => {
      await planApprovalsPage.expectNotInQueue(rejected.name);
    });

    await steps.step('Open the plan in Pending Approval and select Approve - it is available and executes', async () => {
      expect(await planApprovalsPage.getRowActionAvailability(pending.name, 'approve')).toBe('available');
      await planApprovalsPage.approve(pending.name);
      await planManagementPage.expectApprovalCell(pending.name, STATE.published);
    });
  });

  test(`TC-${CASE.commentLength}: should accept a 1000-character comment and refuse 1001 characters when a plan is approved`, async ({
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

    await steps.critical('Open the pending plan and select Approve - the dialog opens', async () => {
      await planApprovalsPage.open();
      const dialog = await planApprovalsPage.openApproveDialog(first.name);
      expect(await dialog.hasFreeTextInput(), 'the Approve dialog should offer a comments field').toBe(true);
      await dialog.cancel();
    });

    await steps.step(`Enter a comment of exactly ${COMMENT_LENGTH.max} characters and confirm - the approval is accepted`, async () => {
      const outcome = await planApprovalsPage.decideWithComment(first.name, 'approve', COMMENT_LENGTH.atMax);
      expect(outcome.typed, 'the full comment is kept').toBe(COMMENT_LENGTH.atMax);
      expect(outcome.stillQueued, outcome.answer).toBe(false);
    });

    await steps.step(`On another pending plan a ${COMMENT_LENGTH.max + 1}-character comment is refused and nothing is submitted`, async () => {
      const dialog = await planApprovalsPage.openApproveDialog(second.name);
      const held = await dialog.typeReasonText(COMMENT_LENGTH.overMax);
      expect(held.length, 'the field should refuse characters past the maximum').toBeLessThanOrEqual(COMMENT_LENGTH.max);
      await dialog.cancel();
      await planApprovalsPage.expectInQueue(second.name);
    });
  });

  test(`TC-${CASE.noDoubleActivation}: should apply only the first approval with a single plan code when two approvers approve the same plan`, async ({
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

    await steps.critical('In session A approve the plan with a comment - it is approved and given a plan code', async () => {
      const outcome = await planApprovalsPage.decideWithComment(plan.name, 'approve', COMMENT.approved);
      expect(outcome.stillQueued, outcome.answer).toBe(false);
      expect(await planManagementPage.readCode(plan.name)).toMatch(PERMANENT_PLAN_CODE);
    });

    await steps.step('In session B (still showing Pending Approval) approve it again - an error says it was already decided', async () => {
      const attempt = await staleSession.planApprovals.attemptDecisionOnLoadedRow(plan.name, 'approve');
      expect(attempt.answer, 'the second approval should be refused').toMatch(/answered 4\d\d/);
      expect(`${attempt.answer} ${attempt.messages}`, 'the refusal should say it was already decided').toMatch(ALREADY_DECIDED);
      await planDetailPage.open(plan.id);
      await planDetailPage.versions().open();
      const published = (await planDetailPage.versions().readRows()).filter((row) => STATE.published.test(row.status));
      expect(published.length, 'no duplicate activation').toBe(1);
    });

    await steps.step('Refresh session B - the plan shows as approved with a single plan code', async () => {
      await staleSession.planApprovals.open();
      await staleSession.planApprovals.expectNotInQueue(plan.name);
      expect(await planManagementPage.readCode(plan.name)).toMatch(PERMANENT_PLAN_CODE);
    });
  });
});
