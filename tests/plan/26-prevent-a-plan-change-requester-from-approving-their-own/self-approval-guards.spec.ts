import { test, expect } from '../../../fixtures';
import {
  APPROVE_PLAN_PERMISSION,
  APPROVER_NAME,
  CASE,
  FORBIDDEN_STATUS,
  REQUESTER_ROLE,
  STATE,
} from '../../../data/plans/selfApprovalPrevention.data';

/**
 * User story 14340: Prevent a plan change requester from approving their own
 * change - the submitter, and anyone without the right, is blocked.
 *
 * The submitter-approver is the administrator: it holds the approval right
 * and submits the plan (planIn), so deciding that request is deciding its own
 * change. See the data file for how the sheet's users are played.
 */
test.describe('US 14340 - Self-approval guards', () => {
  test.describe.configure({ timeout: 15 * 60_000 });

  test(`TC-${CASE.selfApproveBlocked}: should block the approval when the requester tries to approve the plan change they submitted`, async ({
    planManagementPage,
    planApprovalsPage,
    planDetailPage,
    planIn,
    steps,
  }) => {
    const plan = await planIn('PendingApproval');

    await steps.critical('Navigate to the Plans Management module - the plan list is visible', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('User A submits a plan change for review - it is Pending Review, recorded as submitted by User A', async () => {
      await planDetailPage.open(plan.id);
      await planDetailPage.versions().open();
      const entry = (await planDetailPage.versions().readRows()).find((row) => STATE.pendingReview.test(row.status));
      expect(entry?.requestedBy ?? '(no pending entry)', 'submitted by User A').toContain(APPROVER_NAME);
    });

    await steps.critical('Still as User A, open the submitted plan change - its details open', async () => {
      await planApprovalsPage.open();
      expect((await planApprovalsPage.openReview(plan.name)).length).toBeGreaterThan(0);
      await planApprovalsPage.closeReview();
    });

    await steps.step('Attempt Approve on the own change - it is disabled or refused for the submitter', async () => {
      await planApprovalsPage.expectSelfApprovalPrevented(plan.name);
    });

    await steps.step('The change\'s status after the attempt is still Pending Review', async () => {
      await planApprovalsPage.expectInQueue(plan.name);
      await planManagementPage.expectApprovalCell(plan.name, STATE.pendingReview);
    });
  });

  test(`TC-${CASE.selfRejectBlocked}: should block the rejection when the requester tries to reject the plan change they submitted`, async ({
    planManagementPage,
    planApprovalsPage,
    planDetailPage,
    planIn,
    steps,
  }) => {
    const plan = await planIn('PendingApproval');

    await steps.critical('Navigate to the Plans Management module - the plan list is visible', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('User A submits a plan change for review - it is Pending Review, recorded as submitted by User A', async () => {
      await planDetailPage.open(plan.id);
      await planDetailPage.versions().open();
      const entry = (await planDetailPage.versions().readRows()).find((row) => STATE.pendingReview.test(row.status));
      expect(entry?.requestedBy ?? '(no pending entry)', 'submitted by User A').toContain(APPROVER_NAME);
    });

    await steps.critical('Still as User A, open the submitted plan change - its details open', async () => {
      await planApprovalsPage.open();
      expect((await planApprovalsPage.openReview(plan.name)).length).toBeGreaterThan(0);
      await planApprovalsPage.closeReview();
    });

    await steps.step('Attempt Reject on the own change - it is disabled or refused for the submitter', async () => {
      expect(await planApprovalsPage.getRowActionAvailability(plan.name, 'reject'), 'Reject on the submitter\'s own change').not.toBe('available');
    });

    await steps.step('The change\'s status after the attempt is still Pending Review', async () => {
      await planApprovalsPage.expectInQueue(plan.name);
      await planManagementPage.expectApprovalCell(plan.name, STATE.pendingReview);
    });
  });

  test(`TC-${CASE.noPermissionDenied}: should deny every decision on a plan change when the user lacks the approval permission`, async ({
    planManagementPage,
    planApprovalsPage,
    nonAdminSession,
    requireBaseline,
    planIn,
    steps,
  }) => {
    const plan = await planIn('PendingApproval');
    let requestId = '';

    await steps.critical('Navigate to the Plans Management module - the plan list is visible', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
      await planApprovalsPage.open();
      requestId = await planApprovalsPage.getPendingRequestId(plan.name);
      requireBaseline((await planApprovalsPage.getDecisionAvailability(plan.name)).approve, 'Approve for a session holding the approval right');
    });

    await steps.step('User C signs in - their session starts without the Approve plan changes permission', async () => {
      await nonAdminSession.planApprovals.openHub();
      expect(await nonAdminSession.planApprovals.getOfferedTabs(), 'User C\'s approvals hub').not.toEqual([]);
    });

    await steps.step('User C opens the pending plan change submitted by User A - the change is reachable', async () => {
      expect((await nonAdminSession.plans.readListAccess()).table, 'User C reaches the Plans module').toBe(true);
    });

    await steps.step('Approve and Reject are hidden or disabled for User C', async () => {
      await nonAdminSession.planApprovals.openHub();
      await nonAdminSession.planApprovals.expectApprovalActionsDenied();
    });

    await steps.step('A direct decision by User C is denied and the change stays Pending Review', async () => {
      const answer = await nonAdminSession.planApprovals.approveRequestViaApi(requestId);
      expect(answer.status, answer.text.slice(0, 200)).toBe(FORBIDDEN_STATUS);
      await planApprovalsPage.expectInQueue(plan.name);
    });
  });

  test(`TC-${CASE.permissionOnlyOnReviewers}: should show the Approve plan changes permission only on reviewer roles when the role catalogue is reviewed`, async ({
    planManagementPage,
    roleAdministrationPage,
    steps,
  }) => {
    test.setTimeout(30 * 60_000);
    let label = '';

    await steps.critical('Navigate to the Plans Management module - the plan list is visible', async () => {
      await planManagementPage.openList();
    });

    await steps.critical('Open the role and permission administration screen - the roles and their permissions load', async () => {
      await roleAdministrationPage.open();
      await roleAdministrationPage.expectRolesListed();
    });

    await steps.step('Locate the Approve plan changes permission - only reviewer roles hold it', async () => {
      const holding = await roleAdministrationPage.getRolesHoldingPermission(APPROVE_PLAN_PERMISSION);
      label = holding.label;
      expect(label, `the catalogue should offer the permission as one of: ${APPROVE_PLAN_PERMISSION.join(' / ')}`).not.toBe('');
      expect(holding.holders.length, 'some reviewer role holds it').toBeGreaterThan(0);
      expect(holding.holders, `roles holding it: ${holding.holders.join(', ')}`).not.toContain(REQUESTER_ROLE);
    });

    await steps.step('The general Requester role does not hold the Approve plan changes permission', async () => {
      const privileges = await roleAdministrationPage.openPermissionCatalogue(REQUESTER_ROLE);
      expect(await privileges.isPermissionChecked(label || APPROVE_PLAN_PERMISSION[0]), `"${REQUESTER_ROLE}" should not hold it`).toBe(false);
      await roleAdministrationPage.closeDrawer();
    });
  });

  test(`TC-${CASE.noBypass}: should refuse the requester's own approval when it is sent around the disabled control`, async ({
    planManagementPage,
    planApprovalsPage,
    planIn,
    steps,
  }) => {
    const plan = await planIn('PendingApproval');
    let requestId = '';

    await steps.critical('Navigate to the Plans Management module - the plan list is visible', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.step('User A opens the submitted change - the Approve action is shown disabled', async () => {
      await planApprovalsPage.open();
      requestId = await planApprovalsPage.getPendingRequestId(plan.name);
      expect(await planApprovalsPage.getRowActionAvailability(plan.name, 'approve'), 'Approve on the submitter\'s own change').toBe('disabled');
    });

    await steps.step('Trigger the approval through a direct request instead - it is rejected with an authorisation error', async () => {
      const answer = await planApprovalsPage.approveRequestViaApi(requestId);
      expect(answer.status, `self-approval sent directly answered ${answer.status} ${answer.text.slice(0, 200)}`).toBe(FORBIDDEN_STATUS);
    });

    await steps.step('Refresh the change - it is still Pending Review and no approval was recorded', async () => {
      await planApprovalsPage.open();
      await planApprovalsPage.expectInQueue(plan.name);
      await planManagementPage.expectApprovalCell(plan.name, STATE.pendingReview);
    });
  });
});
