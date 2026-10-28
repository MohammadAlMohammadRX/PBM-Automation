import { test, expect } from '../../../fixtures';
import type { ShapedSession } from '../../../fixtures/shapedNonAdmin.fixture';
import type { PlanInactivateDialog } from '../../../pages/plan/PlanInactivateDialog';
import { PLAN_PERMISSION } from '../../../data/accounts/payerAdminRole.data';
import {
  APPROVAL,
  BLOCKED_CASES,
  CASE,
  DEACTIVATION,
  LINKED_DELETE_MESSAGE,
  RESTRICTED_ROW_ACTIONS,
  SCOPED_PAYER,
  STATUS,
  VIEW_ONLY_WITH,
  VIEW_ONLY_WITHOUT,
} from '../../../data/plans/planRowActions.data';

/**
 * User story 14168: Display row actions per plan and approval status.
 * The gated actions: who may decide a pending change, the reason and approval
 * a deactivation needs, what blocks a deletion, and how a missing permission is
 * explained on the row. Twins: tests/network/36 (per-action permissions) and
 * 07 / 40 (deactivation with a reason).
 */
test.describe('US 14168 - Gated row actions', () => {
  test(`TC-${CASE.nonApprover}: should offer no usable Approve or Reject when a non-approver views a plan with a pending change`, async ({
    planManagementPage,
    planApprovalsPage,
    planIn,
    nonAdminSession,
    requireBaseline,
    steps,
  }) => {
    test.setTimeout(10 * 60_000);
    const plan = await planIn('PendingApproval', { payerName: SCOPED_PAYER, noFormulary: true });

    await steps.critical('Navigate to the Plans Management module - the list loads', async () => {
      await planManagementPage.openListFor(SCOPED_PAYER);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Log in as a user who is not a designated Approver - their permissions apply', async () => {
      await planApprovalsPage.open();
      const approver = await planApprovalsPage.getDecisionAvailability(plan.name);
      requireBaseline(approver.approve && approver.reject, 'Approve and Reject on the pending plan change, for an approver');
      await nonAdminSession.plans.openListFor(SCOPED_PAYER);
      expect(await nonAdminSession.plans.isListed(plan.name), 'the non-approver should see the plan').toBe(true);
    });

    await steps.step('Locate the plan with a change in Pending Approval - its row is displayed', async () => {
      await nonAdminSession.plans.expectApprovalCell(plan.name, APPROVAL.pendingApproval);
    });

    await steps.step('Neither Approve nor Reject is usable - on the row or in the approval queue', async () => {
      for (const action of ['approve', 'reject'] as const) {
        expect(await nonAdminSession.plans.getDecisionActionAvailability(plan.name, action), `row ${action}`).not.toBe('available');
      }
      await nonAdminSession.planApprovals.openHub();
      await nonAdminSession.planApprovals.expectApprovalActionsDenied();
    });
  });

  test(`TC-${CASE.deactivateGated}: should ask for a reason and send the deactivation for approval when an Active plan is deactivated`, async ({
    planManagementPage,
    planIn,
    steps,
  }) => {
    test.setTimeout(12 * 60_000);
    const plan = await planIn('Active');
    let drawer: PlanInactivateDialog | null = null;

    await steps.critical('Navigate to the Plans Management module - the list loads', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Select Deactivate on the plan - a confirmation requesting a reason is displayed', async () => {
      drawer = await planManagementPage.openDeactivationDrawer(plan.name);
      expect((await drawer.getReasonOptions()).length, 'the drawer should ask for a reason').toBeGreaterThan(0);
    });

    await steps.step('Enter a reason and confirm - the request goes to Pending Approval instead of taking effect', async () => {
      await drawer!.selectReason(DEACTIVATION.reason);
      await drawer!.fillDetails(DEACTIVATION.details);
      await drawer!.confirm();
      // The deactivation is staged as a draft ("Saved as draft"); Send for
      // Approval is what puts it in front of an approver (2026-10-27).
      await planManagementPage.submitForApproval(plan.name);
      expect(await planManagementPage.readStatus(plan.name), 'the deactivation must not take effect before approval').toBe(STATUS.active);
      await planManagementPage.expectApprovalCell(plan.name, APPROVAL.pendingApproval);
    });
  });

  test(`TC-${CASE.deleteBlockedByLinks}: should block deleting a draft linked to a formulary and delete one with no links when Delete is chosen`, async ({
    planManagementPage,
    planIn,
    steps,
  }) => {
    const linked = await planIn('Draft');
    const unlinked = await planIn('Draft', { noFormulary: true });

    await steps.critical('Navigate to the Plans Management module - the list loads', async () => {
      await planManagementPage.openListFor(linked.payerName);
      expect(await planManagementPage.isListed(linked.name)).toBe(true);
    });

    await steps.step('Deleting a draft linked to a formulary is blocked with an explanatory error', async () => {
      const outcome = await planManagementPage.deletePlan(linked.name);
      expect(outcome?.status ?? 0, 'the deletion should be refused').toBeGreaterThanOrEqual(400);
      expect(outcome?.text ?? '', 'the refusal should explain the linked formulary').toMatch(LINKED_DELETE_MESSAGE);
      expect(await planManagementPage.isListed(linked.name), 'the linked draft must remain').toBe(true);
    });

    await steps.step('Deleting a draft with no links of any kind succeeds', async () => {
      const outcome = await planManagementPage.deletePlan(unlinked.name);
      expect(outcome?.status ?? 0, `the deletion should be accepted: ${outcome?.text.slice(0, 200) ?? ''}`).toBeLessThan(300);
      expect(await planManagementPage.isListed(unlinked.name), 'the deleted draft should be gone').toBe(false);
    });
  });

  test(`TC-${CASE.permissionTooltips}: should disable every action the user lacks and explain why in a tooltip when a view-only user opens the list`, async ({
    planManagementPage,
    planIn,
    shapedNonAdmin,
    requireBaseline,
    steps,
  }) => {
    test.setTimeout(10 * 60_000);
    const plan = await planIn('Draft', { payerName: SCOPED_PAYER, noFormulary: true });
    let session: ShapedSession | null = null;

    await steps.critical('Navigate to the Plans Management module - the list loads', async () => {
      await planManagementPage.openListFor(SCOPED_PAYER);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
      const offered = await planManagementPage.getEnabledRowActions(plan.name, RESTRICTED_ROW_ACTIONS);
      requireBaseline(offered.length === RESTRICTED_ROW_ACTIONS.length, `${RESTRICTED_ROW_ACTIONS.join(', ')} on a draft, for an administrator`);
    });

    await steps.critical('Log in with a view-only role - the restricted role is applied', async () => {
      session = await shapedNonAdmin({ without: VIEW_ONLY_WITHOUT, with: VIEW_ONLY_WITH });
      expect(session.removed, 'the role should have lost the edit permission').toContain(PLAN_PERMISSION.editPlan);
      await session.plans.openListFor(SCOPED_PAYER);
      expect(await session.plans.isListed(plan.name), 'a view-only user still sees the plan').toBe(true);
    });

    await steps.step('Each action the user cannot perform is disabled and carries a tooltip explaining why', async () => {
      for (const action of RESTRICTED_ROW_ACTIONS) {
        expect(await session!.plans.getRowActionAvailability(plan.name, action), `${action} should be shown disabled, not hidden`).toBe('disabled');
        expect(await session!.plans.getRowActionMessage(plan.name, action), `${action} should explain the restriction`).not.toBe('');
      }
    });
  });

  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.azureId}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
