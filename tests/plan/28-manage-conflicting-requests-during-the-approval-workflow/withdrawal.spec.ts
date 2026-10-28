import { test, expect } from '../../../fixtures';
import {
  CASE,
  EDIT,
  MSG_041,
  MSG_042,
  STATE,
} from '../../../data/plans/conflictingApprovalRequests.data';

/**
 * User story 14343: Manage conflicting requests during the approval workflow -
 * an edit (MSG-PLN-041) or a deletion (MSG-PLN-042) of a plan awaiting
 * approval withdraws its pending request and leaves nothing orphaned.
 *
 * 19361 (queue AND notifications cleared on withdrawal) is tested manually:
 * notification cases are Manual (QA lead, 2026-10-27).
 */
test.describe('US 14343 - Withdrawing a pending request', () => {
  test.describe.configure({ timeout: 15 * 60_000 });

  test(`TC-${CASE.editWithdraws}: should withdraw the pending request and return the plan to Draft when an edit to it is saved`, async ({
    planManagementPage,
    planApprovalsPage,
    planDetailPage,
    planIn,
    steps,
  }) => {
    const plan = await planIn('PendingApproval');
    let messages = '';

    await steps.critical('Navigate to the Plans Management module - the dashboard loads', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Open the plan that is Pending Approval - its detail shows Pending Approval', async () => {
      await planDetailPage.open(plan.id);
      expect(await planDetailPage.getVersionBadge()).toMatch(STATE.pendingApproval);
    });

    await steps.critical('Edit a plan attribute and save - the save completes', async () => {
      const report = await planManagementPage.stageEdit(plan.name, 'descriptionEn', EDIT.attribute);
      expect(report.refused, report.text).toBe(false);
      messages = report.messages.join(' ');
    });

    await steps.step('The plan is Draft and the pending request has left the approval queue (MSG-PLN-041)', async () => {
      await planManagementPage.expectApprovalCell(plan.name, STATE.draft);
      await planApprovalsPage.open();
      await planApprovalsPage.expectNotInQueue(plan.name);
      expect(messages, 'MSG-PLN-041 - the user is told the request was withdrawn').toMatch(MSG_041);
    });
  });

  test(`TC-${CASE.deleteWithdraws}: should withdraw the pending request from the queue when a plan pending approval is deleted`, async ({
    planManagementPage,
    planApprovalsPage,
    planDetailPage,
    planIn,
    steps,
  }) => {
    const plan = await planIn('PendingApproval');
    let messages = '';

    await steps.critical('Navigate to the Plans Management module - the dashboard loads', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Open the plan that is Pending Approval - its detail shows Pending Approval', async () => {
      await planDetailPage.open(plan.id);
      expect(await planDetailPage.getVersionBadge()).toMatch(STATE.pendingApproval);
    });

    await steps.critical('Delete the plan - the deletion is confirmed', async () => {
      const outcome = await planDetailPage.deleteAndCapture();
      expect(outcome.status, outcome.text.slice(0, 200)).toBeLessThan(300);
      messages = outcome.messages.join(' ');
    });

    await steps.step('The approver\'s pending queue no longer holds the request (MSG-PLN-042)', async () => {
      await planApprovalsPage.open();
      await planApprovalsPage.expectNotInQueue(plan.name);
      expect(messages, 'MSG-PLN-042 - the user is told the pending request was withdrawn').toMatch(MSG_042);
    });
  });

  test(`TC-${CASE.editThenDelete}: should leave no orphaned approval request when a pending plan is edited and then deleted`, async ({
    planManagementPage,
    planApprovalsPage,
    planIn,
    steps,
  }) => {
    const plan = await planIn('PendingApproval');

    await steps.critical('Navigate to the Plans Management module - the dashboard loads', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Save a minor edit and then delete the plan - the edit withdraws the request, then the deletion proceeds', async () => {
      const report = await planManagementPage.stageEdit(plan.name, 'descriptionEn', EDIT.minor);
      expect(report.refused, report.text).toBe(false);
      await planManagementPage.expectApprovalCell(plan.name, STATE.draft);
      const outcome = await planManagementPage.deletePlan(plan.name);
      expect(outcome?.status ?? 0, outcome?.text.slice(0, 200) ?? 'no delete request was sent').toBeLessThan(300);
    });

    await steps.step('The approver\'s queue holds no entry for the plan and the plan is deleted', async () => {
      await planApprovalsPage.open();
      await planApprovalsPage.expectNotInQueue(plan.name);
      expect(await planManagementPage.isListed(plan.name), 'the plan should be gone').toBe(false);
    });
  });
});
