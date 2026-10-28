import { test, expect } from '../../../fixtures';
import {
  APPROVER_NAME,
  BLOCKED_CASES,
  CASE,
  FORBIDDEN_STATUS,
  STATE,
  SUBMITTER_PAYER,
  SUPPORTING_DETAILS,
} from '../../../data/plans/selfApprovalPrevention.data';

/**
 * User story 14340: Prevent a plan change requester from approving their own
 * change - the independent review that IS allowed.
 *
 * User A (the submitter) is the non-admin account: it creates and sends a plan
 * of a payer in its own scope (fixture `planSubmittedFrom`). User B (the
 * independent reviewer) is the administrator, which did not submit it.
 */
test.describe('US 14340 - Independent review', () => {
  test.describe.configure({ timeout: 15 * 60_000 });

  test(`TC-${CASE.independentApproves}: should let an independent reviewer approve the plan change when someone else submitted it`, async ({
    planManagementPage,
    planApprovalsPage,
    planDetailPage,
    nonAdminSession,
    planSubmittedFrom,
    steps,
  }) => {
    const plan = await planSubmittedFrom(nonAdminSession.page, { payerName: SUBMITTER_PAYER });

    await steps.critical('Navigate to the Plans Management module - the plan list is visible', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('User A submits a plan change for review - it is Pending Review, recorded as submitted by User A', async () => {
      await planDetailPage.open(plan.id);
      await planDetailPage.versions().open();
      const entry = (await planDetailPage.versions().readRows()).find((row) => STATE.pendingReview.test(row.status));
      expect(entry, 'a Pending Review entry').toBeDefined();
      expect(entry?.requestedBy ?? '', 'submitted by User A, not by the reviewer').not.toContain(APPROVER_NAME);
    });

    await steps.critical('User B signs in - their session holds the Approve plan changes permission', async () => {
      await planApprovalsPage.open();
      expect(await planApprovalsPage.getOfferedTabs(), 'User B is offered the plan approvals queue').toContain('plan');
    });

    await steps.step('User B opens the change submitted by User A - an Approve action is available', async () => {
      expect(await planApprovalsPage.getRowActionAvailability(plan.name, 'approve')).toBe('available');
    });

    await steps.step('User B approves and confirms - the change is Approved, recorded as decided by User B', async () => {
      await planApprovalsPage.approve(plan.name);
      await planDetailPage.open(plan.id);
      await planDetailPage.versions().open();
      const entry = (await planDetailPage.versions().readRows()).find((row) => STATE.approved.test(row.status));
      expect(entry, 'an Approved entry').toBeDefined();
      expect(entry?.reviewedBy ?? '').toContain(APPROVER_NAME);
    });
  });

  test(`TC-${CASE.approvedOnlyByIndependent}: should move the plan change to Approved only when an independent reviewer decides it`, async ({
    planManagementPage,
    planApprovalsPage,
    nonAdminSession,
    planSubmittedFrom,
    steps,
  }) => {
    const plan = await planSubmittedFrom(nonAdminSession.page, { payerName: SUBMITTER_PAYER });
    let requestId = '';

    await steps.critical('Navigate to the Plans Management module - the plan list is visible', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('The change\'s current status is Pending Review', async () => {
      await planManagementPage.expectApprovalCell(plan.name, STATE.pendingReview);
      await planApprovalsPage.open();
      requestId = await planApprovalsPage.getPendingRequestId(plan.name);
    });

    await steps.step('As User A, try to approve the own change - it is blocked and the status stays Pending Review', async () => {
      await nonAdminSession.planApprovals.openHub();
      await nonAdminSession.planApprovals.expectApprovalActionsDenied();
      const answer = await nonAdminSession.planApprovals.approveRequestViaApi(requestId);
      expect(answer.status, answer.text.slice(0, 200)).toBe(FORBIDDEN_STATUS);
      await planManagementPage.expectApprovalCell(plan.name, STATE.pendingReview);
    });

    await steps.step('The independent reviewer User B approves the change - the approval is accepted', async () => {
      await planApprovalsPage.open();
      await planApprovalsPage.approve(plan.name);
    });

    await steps.step('After User B\'s decision the status is Approved', async () => {
      await planManagementPage.expectApprovalCell(plan.name, STATE.approved);
    });
  });

  test(`TC-${CASE.endToEndRouting}: should route the change to an independent reviewer and record both actors when a plan change is submitted`, async ({
    planManagementPage,
    planApprovalsPage,
    nonAdminSession,
    planSubmittedFrom,
    steps,
  }) => {
    const plan = await planSubmittedFrom(nonAdminSession.page, { payerName: SUBMITTER_PAYER, descriptionEn: SUPPORTING_DETAILS });

    await steps.critical('Navigate to the Plans Management module - the plan list is visible', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('User A submits a new plan change with supporting details - it is routed to the review queue as Pending Review', async () => {
      await planManagementPage.expectApprovalCell(plan.name, STATE.pendingReview);
    });

    await steps.critical('User B opens the review queue - the submitted change is listed for decision', async () => {
      await planApprovalsPage.open();
      expect((await planApprovalsPage.readQueuedRow(plan.name)).text).toContain(plan.name);
    });

    await steps.step('User B reviews the details and approves - the change is Approved and the plan reflects it', async () => {
      expect((await planApprovalsPage.openReview(plan.name)).length, 'the change details').toBeGreaterThan(0);
      await planApprovalsPage.closeReview();
      await planApprovalsPage.approve(plan.name);
      await planManagementPage.expectApprovalCell(plan.name, STATE.approved);
    });

    await steps.step('User A views the change\'s history - submission by User A and approval by User B are two separate actions', async () => {
      await nonAdminSession.planDetail.open(plan.id);
      await nonAdminSession.planDetail.versions().open();
      const entry = (await nonAdminSession.planDetail.versions().readRows()).find((row) => STATE.approved.test(row.status));
      expect(entry, 'the approved entry in User A\'s view').toBeDefined();
      expect(entry?.reviewedBy ?? '', 'decided by User B').toContain(APPROVER_NAME);
      expect(entry?.requestedBy ?? '', 'requested by User A').not.toBe('');
      expect(entry?.requestedBy, 'two different actors').not.toBe(entry?.reviewedBy);
    });
  });

  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.azureId}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
