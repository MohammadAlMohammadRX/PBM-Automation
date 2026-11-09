import { test, expect } from '../../../fixtures';
import {
  APPROVAL,
  CASES,
  DRAFT_PLAN,
  NOTIFICATION_WAIT_MS,
  REVIEWER_NAME,
  SUBMITTED_MESSAGE,
  draftChange,
} from '../../../data/plans/planApprovalNotifications.data';
import {
  planNotifications,
  removeSuiteDefinition,
  requirePlanApprovalDefinition,
} from '../../../utils/jobDriven/writerPHelpers';

/**
 * User story 14146: Edit a plan's attributes through the approval workflow -
 * 18963, the reviewer is notified when a saved draft is sent for approval
 * (Manual until 2026-11-08; notification cases were Manual by the 2026-10-27
 * rule). The case addresses its own notification definition for the plan
 * "needs approval" action to the reviewer and deletes it afterwards - see
 * data/plans/planApprovalNotifications.data.ts.
 */
test.describe('US 14146 - Reviewer notified of a submitted plan change', () => {
  test.describe.configure({ timeout: 10 * 60_000 });

  test(`TC-${CASES.reviewerNotified.azureId}: should move the change to Pending Approval and notify the reviewer when a saved draft is sent for approval`, async ({
    page,
    planManagementPage,
    planIn,
    cleanup,
    steps,
  }, testInfo) => {
    const definition = await requirePlanApprovalDefinition(page, testInfo, REVIEWER_NAME);
    cleanup.register(() => removeSuiteDefinition(page, definition));
    const plan = await planIn('Draft', DRAFT_PLAN);
    const change = draftChange();
    let sentAt = new Date();

    await steps.critical('Navigate to the Plans Management module - the plan directory loads', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('A private draft change is saved on the plan, not yet submitted - the save completes', async () => {
      const report = await planManagementPage.stageEdit(plan.name, 'descriptionEn', change);
      expect(report.refused, report.text).toBe(false);
      await planManagementPage.expectApprovalCell(plan.name, APPROVAL.draft);
    });

    await steps.critical('Open the plan with the private draft change - the edit form shows the saved draft values', async () => {
      const form = await planManagementPage.openEditForm(plan.name);
      expect(await form.readField('descriptionEn')).toBe(change);
      await form.closeAndDiscard();
    });

    await steps.critical('Select Send for Approval - the change moves to Pending Approval and a success message is shown', async () => {
      sentAt = new Date();
      const result = await planManagementPage.attemptSubmit(plan.name);
      expect(result.status, `SubmitPlanForApproval: ${result.text.slice(0, 200)}`).toBeLessThan(300);
      expect(result.messages.join(' | '), 'a success message').toMatch(SUBMITTED_MESSAGE);
      await planManagementPage.expectApprovalCell(plan.name, APPROVAL.pendingApproval);
    });

    await steps.step('Check the reviewer\'s notifications - the reviewer received one about the pending change', async () => {
      await expect
        .poll(async () => (await planNotifications(page, definition, sentAt, plan)).length, {
          timeout: NOTIFICATION_WAIT_MS,
          intervals: [5_000],
          message: `"${REVIEWER_NAME}" should receive a "${definition.name}" notification about "${plan.name}"`,
        })
        .toBeGreaterThan(0);
      // The definition's template carries {{PlanName}}: the notification must say WHICH plan awaits approval.
      const [received] = await planNotifications(page, definition, sentAt, plan);
      expect(received.englishMessage, 'the notification names the plan ({{PlanName}})').toContain(plan.name);
    });
  });
});
