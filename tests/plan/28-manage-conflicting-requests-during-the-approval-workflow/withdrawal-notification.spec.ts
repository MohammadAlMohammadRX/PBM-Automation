import { test, expect } from '../../../fixtures';
import {
  APPROVAL,
  CASES,
  MSG_041,
  NOTIFICATION_WAIT_MS,
  REVIEWER_NAME,
  withdrawingEdit,
} from '../../../data/plans/planApprovalNotifications.data';
import {
  planNotifications,
  removeSuiteDefinition,
  requirePlanApprovalDefinition,
  stillListed,
} from '../../../utils/jobDriven/writerPHelpers';

/**
 * User story 14343: Manage conflicting requests during the approval workflow -
 * 19361, withdrawing a pending request (an edit saved on it, MSG-PLN-041)
 * clears it from the approver's queue AND notifications (Manual until
 * 2026-11-08). The case addresses its own notification definition for the
 * plan "needs approval" action to the approver before the plan is submitted,
 * and deletes it afterwards - see data/plans/planApprovalNotifications.data.ts.
 */
test.describe('US 14343 - Withdrawal clears the approver\'s notifications', () => {
  test.describe.configure({ timeout: 12 * 60_000 });

  test(`TC-${CASES.withdrawalClearsNotifications.azureId}: should clear the request from the approver's queue and notifications when a pending plan is edited and withdrawn`, async ({
    page,
    planManagementPage,
    planApprovalsPage,
    planIn,
    cleanup,
    steps,
  }, testInfo) => {
    const definition = await requirePlanApprovalDefinition(page, testInfo, REVIEWER_NAME);
    cleanup.register(() => removeSuiteDefinition(page, definition));
    const submittedFrom = new Date();
    const plan = await planIn('PendingApproval');
    let messages = '';

    await steps.critical('Navigate to the Plans Management module - the dashboard loads', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('The plan change is Pending Approval in the approver\'s queue and notifications', async () => {
      await planApprovalsPage.open();
      await planApprovalsPage.expectInQueue(plan.name);
      await expect
        .poll(async () => (await planNotifications(page, definition, submittedFrom, plan)).length, {
          timeout: NOTIFICATION_WAIT_MS,
          intervals: [5_000],
          message: `"${REVIEWER_NAME}" should have a "${definition.name}" notification about "${plan.name}"`,
        })
        .toBeGreaterThan(0);
    });

    await steps.critical('As Plan Administrator, edit and save the pending plan - the request is withdrawn and the plan returns to Draft', async () => {
      await planManagementPage.openListFor(plan.payerName);
      const report = await planManagementPage.stageEdit(plan.name, 'descriptionEn', withdrawingEdit());
      expect(report.refused, report.text).toBe(false);
      messages = report.messages.join(' ');
      await planManagementPage.expectApprovalCell(plan.name, APPROVAL.draft);
      expect(messages, 'the user is told the plan is a draft again').toMatch(MSG_041);
    });

    await steps.step('As the Approver, the withdrawn request no longer appears in the approval queue', async () => {
      await planApprovalsPage.open();
      await planApprovalsPage.expectNotInQueue(plan.name);
    });

    await steps.step('As the Approver, the withdrawn request no longer appears in the notification list', async () => {
      const left = stillListed(await planNotifications(page, definition, submittedFrom, plan));
      expect(left.map((n) => `${n.englishMessage} (${n.createdOn})`), 'notifications still listed for the withdrawn request').toEqual([]);
    });
  });
});
