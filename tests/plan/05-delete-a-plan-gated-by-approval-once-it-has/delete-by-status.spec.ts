import { test, expect } from '../../../fixtures';
import {
  ALREADY_DECIDED,
  CASE,
  LIFECYCLE,
  PLAN_NOT_FOUND,
  SUITE_PAYER,
} from '../../../data/plans/deletePlan.data';

/**
 * User story 14153: Delete a plan, gated by approval once it has gone live.
 * Which plans are discarded outright and which go through approval - by
 * lifecycle status - and what is left to act on once a plan is gone.
 */
test.describe('US 14153 - Deleting by lifecycle status', () => {
  test.describe.configure({ timeout: 20 * 60_000 });

  test(`TC-${CASE.draftDiscarded}: should discard the plan at once with no approval request when it was never approved`, async ({
    planManagementPage,
    planDetailPage,
    planApprovalsPage,
    planIn,
    steps,
  }) => {
    const plan = await planIn('Draft');

    await steps.critical('Navigate to the Plans Management module - the plan list loads', async () => {
      await planManagementPage.openListFor(SUITE_PAYER);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Open the never-approved plan - its details show it is not live (Draft)', async () => {
      await planDetailPage.open(plan.id);
      expect(await planDetailPage.getStatus()).toBe(LIFECYCLE.notLive);
    });

    await steps.critical('Select Delete and confirm - the plan is deleted at once with no approval request', async () => {
      const result = await planDetailPage.deleteAndCapture();
      expect(result.status, `DeletePlan: ${result.text.slice(0, 200)}`).toBeLessThan(300);
      await planApprovalsPage.open();
      expect(await planApprovalsPage.isInQueue(plan.name), 'a draft\'s deletion needs no approval').toBe(false);
    });

    await steps.step('Return to the plan list - the deleted plan no longer appears', async () => {
      await planManagementPage.openListFor(SUITE_PAYER);
      expect(await planManagementPage.isListed(plan.name)).toBe(false);
    });
  });

  test(`TC-${CASE.everyStatus}: should delete never-live plans outright and gate previously live plans by approval when deleting in each status`, async ({
    planManagementPage,
    planDetailPage,
    planApprovalsPage,
    planIn,
    expiredPlan,
    steps,
  }) => {
    test.setTimeout(30 * 60_000);
    const draft = await planIn('Draft');
    const pending = await planIn('PendingApproval');
    const live = await planIn('Active');
    const expired = await expiredPlan();

    await steps.critical('Navigate to the Plans Management module - the plan list loads', async () => {
      await planManagementPage.openListFor(SUITE_PAYER);
      expect(await planManagementPage.isListed(draft.name)).toBe(true);
    });

    for (const plan of [draft, pending]) {
      await steps.step(`Submit deletion for the never-live plan "${plan.name}" - it is deleted outright with no approval`, async () => {
        await planDetailPage.open(plan.id);
        const result = await planDetailPage.deleteAndCapture();
        expect(result.status, `DeletePlan: ${result.text.slice(0, 200)}`).toBeLessThan(300);
        await planApprovalsPage.open();
        expect(await planApprovalsPage.isInQueue(plan.name), 'no deletion request for a never-live plan').toBe(false);
        await planManagementPage.openListFor(SUITE_PAYER);
        expect(await planManagementPage.isListed(plan.name), 'the plan should be gone').toBe(false);
      });
    }

    for (const plan of [live, expired]) {
      await steps.step(`Submit deletion for the previously live plan "${plan.name}" - a deletion approval request is created instead`, async () => {
        await planDetailPage.open(plan.id);
        const result = await planDetailPage.requestDeletion();
        expect(result.status, `DeletePlan: ${result.text.slice(0, 200)}`).toBeLessThan(300);
        await planApprovalsPage.open();
        await planApprovalsPage.expectInQueue(plan.name);
        await planManagementPage.openListFor(SUITE_PAYER);
        expect(await planManagementPage.isListed(plan.name), 'the plan stays until the deletion is approved').toBe(true);
      });
    }
  });

  test(`TC-${CASE.alreadyDeleted}: should refuse safely when the plan was already deleted or the deletion request was already processed`, async ({
    planManagementPage,
    planDetailPage,
    planApprovalsPage,
    deletedPlanWithStaleRequest,
    steps,
  }) => {
    const { plan, requestId } = await deletedPlanWithStaleRequest();

    await steps.critical('Navigate to the Plans Management module - the plan list loads without the deleted plan', async () => {
      await planManagementPage.openListFor(SUITE_PAYER);
      expect(await planManagementPage.isListed(plan.name)).toBe(false);
    });

    await steps.step('Open, then request the deletion of, the already-deleted plan - a plan-not-found message', async () => {
      await planDetailPage.openExpectingFailure(plan.id);
      expect(await planDetailPage.isLoaded(10_000), 'a deleted plan must not render').toBe(false);
      expect([await planDetailPage.getMainText(), ...(await planDetailPage.readMessages())].join(' | '), 'the screen should say the plan was not found')
        .toMatch(PLAN_NOT_FOUND);
      const answer = await planDetailPage.requestDeletionViaApi(plan.id);
      expect(answer.status, `deleting a deleted plan: ${answer.text.slice(0, 200)}`).toBeGreaterThanOrEqual(400);
      expect(answer.text).toMatch(PLAN_NOT_FOUND);
    });

    await steps.step('Re-approve the processed deletion request through its stale reference - it is no longer pending', async () => {
      const answer = await planApprovalsPage.approveRequestViaApi(requestId);
      expect(answer.status, `re-approving a decided request: ${answer.text.slice(0, 200)}`).toBeGreaterThanOrEqual(400);
      expect(answer.text, 'the refusal should say the request is no longer pending').toMatch(ALREADY_DECIDED);
    });
  });
});
