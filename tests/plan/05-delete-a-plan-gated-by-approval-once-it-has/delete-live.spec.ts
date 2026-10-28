import { test, expect } from '../../../fixtures';
import {
  APPROVER_NAME,
  AUDIT_LOG_ACTION,
  BLOCKED_CASES,
  CASE,
  DELETE_CHANGE_TYPE,
  LIFECYCLE,
  PRIOR_STATUS,
  REJECTION_REASON,
  SUITE_PAYER,
} from '../../../data/plans/deletePlan.data';

/**
 * User story 14153: Delete a plan, gated by approval once it has gone live.
 * The published half: a live plan's deletion is requested, reviewed and only
 * then applied - removing the plan from the directory and the KPIs with an
 * audit record - or rejected, leaving the plan untouched.
 *
 * Every plan is the case's own Active plan with no policy (`planIn('Active')`);
 * a pending deletion is staged through the API (`pendingPlanDeletion`).
 */
test.describe('US 14153 - Deleting a live plan', () => {
  test.describe.configure({ timeout: 15 * 60_000 });

  test(`TC-${CASE.liveGated}: should create a pending deletion request and remove the plan only once it is approved when the plan has gone live`, async ({
    planManagementPage,
    planDetailPage,
    planApprovalsPage,
    planIn,
    steps,
  }) => {
    const plan = await planIn('Active');

    await steps.critical('Navigate to the Plans Management module - the plan list loads', async () => {
      await planManagementPage.openListFor(SUITE_PAYER);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Open the live plan with no linked policy - its details show it Active', async () => {
      await planDetailPage.open(plan.id);
      expect(await planDetailPage.getStatus()).toBe(LIFECYCLE.active);
    });

    await steps.critical('Select Delete and confirm - a pending deletion request is created and the plan stays unchanged in the directory', async () => {
      const result = await planDetailPage.requestDeletion();
      expect(result.status, `DeletePlan: ${result.text.slice(0, 200)}`).toBeLessThan(300);
      await planApprovalsPage.open();
      await planApprovalsPage.expectInQueue(plan.name);
      await planManagementPage.openListFor(SUITE_PAYER);
      expect(await planManagementPage.isListed(plan.name), 'the plan stays listed until approved').toBe(true);
      expect(await planManagementPage.readStatus(plan.name)).toBe(LIFECYCLE.active);
    });

    await steps.step('Approve the deletion request as an authorized approver - the plan leaves the directory', async () => {
      await planApprovalsPage.open();
      await planApprovalsPage.approve(plan.name);
      await planManagementPage.openListFor(SUITE_PAYER);
      expect(await planManagementPage.isListed(plan.name)).toBe(false);
    });
  });

  test(`TC-${CASE.approvedRemoves}: should remove the plan from the directory and KPIs and record an audit entry when its deletion is approved`, async ({
    planManagementPage,
    planApprovalsPage,
    auditLogsPage,
    planIn,
    pendingPlanDeletion,
    steps,
  }) => {
    const plan = await planIn('Active');
    await pendingPlanDeletion(plan);
    let before: Record<string, number> = {};

    await steps.critical('Navigate to the Plans Management module - the plan list and KPIs load', async () => {
      await planManagementPage.openListFor(SUITE_PAYER);
      before = await planManagementPage.readKpis();
      expect(await planManagementPage.isListed(plan.name), 'the plan is still listed while its deletion is pending').toBe(true);
    });

    await steps.critical('Open the pending deletion request as an approver - it shows the target plan and the requester', async () => {
      await planApprovalsPage.open();
      await planApprovalsPage.expectChangeType(plan.name, DELETE_CHANGE_TYPE);
      const row = await planApprovalsPage.readQueuedRow(plan.name);
      expect(row.text).toContain(plan.name);
      expect(row.text, 'the requester').toContain(APPROVER_NAME);
    });

    await steps.critical('Approve the deletion request - the approval is confirmed and the deletion processed', async () => {
      await planApprovalsPage.approve(plan.name);
      await planApprovalsPage.expectNotInQueue(plan.name);
    });

    await steps.step('Check the directory and the KPI counts - the plan appears in neither', async () => {
      await planManagementPage.openListFor(SUITE_PAYER);
      expect(await planManagementPage.isListed(plan.name)).toBe(false);
      await planManagementPage.openListFor(SUITE_PAYER);
      const after = await planManagementPage.readKpis();
      expect({ total: after.total, active: after.active }, 'the deleted plan should leave the Total and Active tiles')
        .toEqual({ total: before.total - 1, active: before.active - 1 });
    });

    await steps.step('Check the audit log - an entry shows who approved the deletion and when', async () => {
      const rows = await auditLogsPage.findRowsMentioning(plan.id);
      const deletion = rows.find((row) => AUDIT_LOG_ACTION.decision.test(row.actionType));
      expect(deletion, `a deletion / approval entry for the plan among ${rows.map((r) => r.actionType).join(', ') || 'no rows'}`).toBeDefined();
      expect(deletion?.actor).toBe(APPROVER_NAME);
      expect(deletion?.occurredAt, 'when it was approved').not.toBe('');
    });
  });

  test(`TC-${CASE.rejectedKeeps}: should keep the plan active and unchanged when its deletion request is rejected`, async ({
    planManagementPage,
    planDetailPage,
    planApprovalsPage,
    planIn,
    pendingPlanDeletion,
    steps,
  }) => {
    const plan = await planIn('Active');
    await pendingPlanDeletion(plan);

    await steps.critical('Navigate to the Plans Management module - the plan list loads', async () => {
      await planManagementPage.openListFor(SUITE_PAYER);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Open the pending deletion request as an approver - it shows the target plan', async () => {
      await planApprovalsPage.open();
      await planApprovalsPage.expectChangeType(plan.name, DELETE_CHANGE_TYPE);
    });

    await steps.critical('Reject the deletion request with a reason - it is marked Rejected and an audit entry is recorded', async () => {
      await planApprovalsPage.reject(plan.name, REJECTION_REASON);
      await planDetailPage.open(plan.id);
      await planDetailPage.audit().open();
      await planDetailPage.audit().expectEntry(/Reject/i);
    });

    await steps.step('Open the plan directory - the plan still appears, unchanged and Active', async () => {
      await planManagementPage.openListFor(SUITE_PAYER);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
      expect(await planManagementPage.readStatus(plan.name)).toBe(LIFECYCLE.active);
    });
  });

  test(`TC-${CASE.duplicateRequests}: should keep a single pending deletion and delete the plan exactly once when the deletion is submitted twice`, async ({
    planManagementPage,
    planDetailPage,
    planApprovalsPage,
    planIn,
    steps,
  }) => {
    const plan = await planIn('Active');

    await steps.critical('Navigate to the Plans Management module - the plan list loads', async () => {
      await planManagementPage.openListFor(SUITE_PAYER);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Submit a deletion request for the live plan - a pending deletion request is created', async () => {
      await planDetailPage.open(plan.id);
      const result = await planDetailPage.requestDeletion();
      expect(result.status, `DeletePlan: ${result.text.slice(0, 200)}`).toBeLessThan(300);
      await planApprovalsPage.open();
      await planApprovalsPage.expectInQueue(plan.name);
    });

    await steps.step('Immediately submit a second deletion request - it is blocked or merged, never a second record', async () => {
      const answer = await planDetailPage.requestDeletionViaApi(plan.id);
      expect(answer.status, `the duplicate deletion answered ${answer.status}`).toBeGreaterThan(0);
      await planApprovalsPage.open();
      await planApprovalsPage.expectSingleQueuedRequest(plan.name);
    });

    await steps.step('Approve the resulting request - the plan is deleted exactly once', async () => {
      await planApprovalsPage.approve(plan.name);
      await planApprovalsPage.expectNotInQueue(plan.name);
      await planManagementPage.openListFor(SUITE_PAYER);
      expect(await planManagementPage.isListed(plan.name)).toBe(false);
    });
  });

  test(`TC-${CASE.auditDetails}: should capture requester, approver, both times and the prior status when a deletion is audited`, async ({
    planDetailPage,
    planManagementPage,
    planApprovalsPage,
    auditLogsPage,
    planIn,
    steps,
  }) => {
    const plan = await planIn('Active');
    let rows: Awaited<ReturnType<typeof auditLogsPage.findRowsMentioning>> = [];

    await steps.critical('Navigate to the Plans Management module - the plan list loads', async () => {
      await planManagementPage.openListFor(SUITE_PAYER);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Submit and approve a deletion request for the live plan - the deletion is processed', async () => {
      await planDetailPage.open(plan.id);
      expect((await planDetailPage.requestDeletion()).status).toBeLessThan(300);
      await planApprovalsPage.open();
      await planApprovalsPage.approve(plan.name);
      await planApprovalsPage.expectNotInQueue(plan.name);
    });

    await steps.critical('Open System Settings > Audit Logs for the deleted plan - its entries carry requester, approver, times and prior status', async () => {
      rows = await auditLogsPage.findRowsMentioning(plan.id);
      expect(rows.filter((row) => AUDIT_LOG_ACTION.deletion.test(row.actionType)).length, `deletion entries among ${rows.map((r) => r.actionType).join(', ') || 'no rows'}`).toBeGreaterThan(0);
    });

    await steps.step('Cross-check the entries against the required audit fields - all present and populated', async () => {
      const relevant = rows.filter((row) => AUDIT_LOG_ACTION.decision.test(row.actionType));
      expect(relevant.every((row) => row.actor !== '' && row.occurredAt !== '' && row.actionType !== ''), 'actor, time and action on every entry').toBe(true);
      expect(relevant.map((row) => row.actor), 'requester and approver').toContain(APPROVER_NAME);
      expect(relevant.length, 'a submission AND an approval entry, each with its own time').toBeGreaterThanOrEqual(2);
      expect(relevant.map((row) => JSON.stringify(row)).join(' '), 'the plan\'s prior status').toMatch(PRIOR_STATUS);
    });
  });

  test(`TC-${CASE.kpiConsistent}: should drop the plan from the directory and the Active KPI by one when its deletion is approved`, async ({
    planManagementPage,
    planDetailPage,
    planApprovalsPage,
    planIn,
    steps,
  }) => {
    const plan = await planIn('Active');
    let activeBefore = 0;

    await steps.critical('Navigate to the Plans Management module - the plan list and the KPI summary load', async () => {
      await planManagementPage.openListFor(SUITE_PAYER);
      expect(await planManagementPage.isKpiBandVisible(), 'the KPI band').toBe(true);
    });

    await steps.critical('Note the Active KPI count - it includes the target plan', async () => {
      activeBefore = await planManagementPage.getSettledKpiValue('active');
      expect(activeBefore).toBeGreaterThan(0);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Submit and approve the deletion of the live plan - the deletion completes', async () => {
      await planDetailPage.open(plan.id);
      expect((await planDetailPage.requestDeletion()).status).toBeLessThan(300);
      await planApprovalsPage.open();
      await planApprovalsPage.approve(plan.name);
    });

    await steps.step('Refresh the directory and the KPIs - the plan is gone and the Active count is one lower', async () => {
      await planManagementPage.openListFor(SUITE_PAYER);
      expect(await planManagementPage.getSettledKpiValue('active')).toBe(activeBefore - 1);
      expect(await planManagementPage.isListed(plan.name)).toBe(false);
    });
  });

  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.azureId}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
