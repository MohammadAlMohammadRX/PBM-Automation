import { test, expect } from '../../../fixtures';
import type { ConfirmDialog } from '../../../pages/components/ConfirmDialog';
import type { PlanInactivateDialog } from '../../../pages/plan/PlanInactivateDialog';
import {
  APPROVAL,
  CASE,
  COMPLIANCE,
  ENTRY_TIME,
  PAYER_REQUEST,
  RAPID_CLICKS,
  STATUS,
  STATUS_CHANGE_ACTION,
  SUCCESS_MESSAGE,
} from '../../../data/plans/planActivation.data';

/**
 * User story 14331: Activate or deactivate a plan from the list and detail
 * screens with a mandatory reason - the flows: activation from the list,
 * deactivation from the detail, the approval gate (reject, then approve), the
 * badge and success message afterwards, the audit entry, and a rapid
 * double submission. Twins: tests/network/07 (deactivate) and 08 (activate).
 *
 * Confirming Activate / Inactivate stages a draft version (v2 · Draft);
 * "submitting the request" is Send for Approval, after which the approval
 * cell reads Pending Approval while the status is unchanged (as for networks).
 *
 * The success message is read from the approval itself (the approvals hub's
 * toast), which is where the application confirms the decision.
 */
test.describe('US 14331 - Plan activation and deactivation flows', () => {
  test(`TC-${CASE.activateFromList}: should activate the plan after confirmation and approval when Activate is chosen on an Inactive plan's list row`, async ({
    planManagementPage,
    planApprovalsPage,
    planIn,
    toast,
    steps,
  }) => {
    test.setTimeout(15 * 60_000);
    const plan = await planIn('Inactive');
    let prompt: ConfirmDialog | null = null;
    let confirmation = '';

    await steps.critical('Navigate to the Plans Management module - the list shows the Inactive plan with its badge', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
      await planManagementPage.expectStatusText(plan.name, STATUS.inactive);
    });

    await steps.critical('Select Activate from the plan\'s row actions - a confirmation dialog asks to confirm', async () => {
      prompt = await planManagementPage.openActivationPrompt(plan.name);
      expect(await prompt.getMessage(), 'the prompt should name the plan').toContain(plan.name);
    });

    await steps.step('Confirm the action in the dialog - the request is submitted to the approval gate', async () => {
      const outcome = await planManagementPage.confirmActivationAndCapture(prompt!);
      expect(outcome.status, `SetPlanActive should accept: ${outcome.text.slice(0, 200)}`).toBeLessThan(300);
      await planManagementPage.sendStagedChangeIfDraft(plan.name, plan.payerName);
      await planManagementPage.expectApprovalCell(plan.name, APPROVAL.pendingApproval);
    });

    await steps.critical('Approve the request as the approver - the change is processed', async () => {
      await planApprovalsPage.open();
      const dialog = await planApprovalsPage.openApproveDialog(plan.name);
      await dialog.confirm('Approve');
      confirmation = Object.values(await toast.waitForText()).join(' ');
      await planApprovalsPage.waitForDecisionProcessed(plan.name);
    });

    await steps.step('Back on the list, a success message was shown, the list refreshes and the plan shows Active', async () => {
      expect(confirmation, 'the success message').toMatch(SUCCESS_MESSAGE);
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
      await planManagementPage.expectStatusText(plan.name, STATUS.active);
    });
  });

  test(`TC-${CASE.deactivateFromDetail}: should deactivate the plan through approval when an Active plan is deactivated from its detail screen with a reason`, async ({
    planManagementPage,
    planDetailPage,
    planApprovalsPage,
    planIn,
    toast,
    steps,
  }) => {
    test.setTimeout(15 * 60_000);
    const plan = await planIn('Active');
    let drawer: PlanInactivateDialog | null = null;
    let confirmation = '';

    await steps.critical('Navigate to the Plans Management module - the Active plan is listed', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Open the plan\'s detail screen - it shows the plan and status Active', async () => {
      await planManagementPage.openDetails(plan.name);
      await planDetailPage.expectStatus(STATUS.active);
    });

    await steps.critical('Choose Deactivate - a dialog opens with a reason dropdown and an optional details field', async () => {
      drawer = await planDetailPage.openInactivate();
      expect((await drawer.getReasonOptions()).length, 'the reason dropdown').toBeGreaterThan(0);
      expect(await drawer.getDetailsValue(), 'the optional details start empty').toBe('');
    });

    await steps.step('Select a maintained reason, enter details and confirm - the request is submitted to the approval gate', async () => {
      await drawer!.selectReason(PAYER_REQUEST.reason);
      await drawer!.fillDetails(PAYER_REQUEST.details);
      await drawer!.confirm();
      await planManagementPage.sendStagedChangeIfDraft(plan.name, plan.payerName);
      await planManagementPage.expectApprovalCell(plan.name, APPROVAL.pendingApproval);
    });

    await steps.critical('Approve the request - the plan status is updated', async () => {
      await planApprovalsPage.open();
      const dialog = await planApprovalsPage.openApproveDialog(plan.name);
      await dialog.confirm('Approve');
      confirmation = Object.values(await toast.waitForText()).join(' ');
      await planApprovalsPage.waitForDecisionProcessed(plan.name);
      await planDetailPage.open(plan.id);
      await planDetailPage.expectStatusEventually(STATUS.inactive);
    });

    await steps.step('Back on the list, a success message was shown, the list refreshes and the plan shows Inactive', async () => {
      expect(confirmation, 'the success message').toMatch(SUCCESS_MESSAGE);
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
      await planManagementPage.expectStatusText(plan.name, STATUS.inactive);
    });
  });

  test(`TC-${CASE.approvalGate}: should change the status only after approval when an activation is rejected and then resubmitted`, async ({
    planManagementPage,
    planDetailPage,
    planApprovalsPage,
    planIn,
    steps,
  }) => {
    test.setTimeout(20 * 60_000);
    const plan = await planIn('Inactive');

    await steps.critical('Navigate to the Plans Management module - the eligible plan is listed Inactive', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
      await planManagementPage.expectStatusText(plan.name, STATUS.inactive);
    });

    await steps.critical('Submit an activation request with confirmation - it is pending approval and the status has not changed', async () => {
      await planManagementPage.stageAndSubmit(plan.name, 'activate');
      await planManagementPage.expectApprovalCell(plan.name, APPROVAL.pendingApproval);
      expect(await planManagementPage.readStatus(plan.name)).toBe(STATUS.inactive);
    });

    await steps.critical('As the approver, view the pending queue - the activation request awaits review', async () => {
      await planApprovalsPage.open();
      await planApprovalsPage.expectInQueue(plan.name);
    });

    // The requester's rejection notification (the sheet's step 4) is checked
    // by hand: notifications are tested manually (QA lead, 2026-10-27).
    await steps.step('Reject the request - the plan stays Inactive', async () => {
      await planApprovalsPage.reject(plan.name);
      await planDetailPage.open(plan.id);
      await planDetailPage.expectStatus(STATUS.inactive);
    });

    await steps.step('Resubmit the activation and approve it - the plan reads Active only after the approval', async () => {
      await planManagementPage.openListFor(plan.payerName);
      await planManagementPage.stageAndSubmit(plan.name, 'activate');
      expect(await planManagementPage.readStatus(plan.name), 'still Inactive before the approval').toBe(STATUS.inactive);
      await planApprovalsPage.open();
      await planApprovalsPage.approve(plan.name);
      await planDetailPage.open(plan.id);
      await planDetailPage.expectStatusEventually(STATUS.active);
    });
  });

  test(`TC-${CASE.badgeAfterApproval}: should keep the plan listed with matching list and detail badges and a success message when a deactivation is approved`, async ({
    planManagementPage,
    planDetailPage,
    planApprovalsPage,
    planIn,
    toast,
    steps,
  }) => {
    test.setTimeout(15 * 60_000);
    const plan = await planIn('Active');
    let confirmation = '';
    let listBadge = '';

    await steps.critical('Navigate to the Plans Management module once the deactivation is approved - the list refreshes', async () => {
      await planManagementPage.openListFor(plan.payerName);
      await planManagementPage.stageAndSubmit(plan.name, 'inactivate');
      await planApprovalsPage.open();
      const dialog = await planApprovalsPage.openApproveDialog(plan.name);
      await dialog.confirm('Approve');
      confirmation = Object.values(await toast.waitForText()).join(' ');
      await planApprovalsPage.waitForDecisionProcessed(plan.name);
      await planManagementPage.openListFor(plan.payerName);
      await planManagementPage.expectRowsRendered();
    });

    await steps.step('Locate the plan in the directory - it is still listed', async () => {
      expect(await planManagementPage.isListed(plan.name), 'the plan must not be hidden or removed').toBe(true);
    });

    await steps.step('A clear success confirmation was shown after the approval', async () => {
      expect(confirmation, 'the success message').toMatch(SUCCESS_MESSAGE);
    });

    await steps.step('The list row\'s badge reads Inactive, matching the approved change', async () => {
      await planManagementPage.expectStatusText(plan.name, STATUS.inactive);
      listBadge = await planManagementPage.readStatus(plan.name);
    });

    await steps.step('The detail screen\'s badge matches the list\'s', async () => {
      await planDetailPage.open(plan.id);
      await planDetailPage.expectStatus(listBadge);
    });
  });

  test(`TC-${CASE.auditReason}: should record the reason, details, actor and date when a plan is deactivated and activated again`, async ({
    planDetailPage,
    planApprovalsPage,
    planIn,
    steps,
  }) => {
    test.setTimeout(25 * 60_000);
    const plan = await planIn('Active');
    let before = 0;
    let afterDeactivation = 0;

    await steps.critical('Navigate to the plan - it loads', async () => {
      await planDetailPage.open(plan.id);
      expect(await planDetailPage.getName()).toBe(plan.name);
    });

    await steps.critical('Open the plan\'s Audit History tab - the prior entries are listed', async () => {
      await planDetailPage.audit().open();
      before = (await planDetailPage.audit().readAllEntries()).length;
      expect(before, 'an approved plan has history').toBeGreaterThan(0);
    });

    await steps.critical('Deactivate the plan with reason and details, then approve - a new audit entry appears', async () => {
      await planDetailPage.stageInactivation(COMPLIANCE.details, COMPLIANCE.reason);
      await planDetailPage.submitForApproval();
      await planApprovalsPage.open();
      await planApprovalsPage.approve(plan.name);
      await planDetailPage.open(plan.id);
      await planDetailPage.expectStatusEventually(STATUS.inactive);
      await planDetailPage.audit().expectEntry(STATUS_CHANGE_ACTION);
      expect((await planDetailPage.audit().readAllEntries()).length, 'new entries').toBeGreaterThan(before);
    });

    await steps.step('The entry records the reason, the details, the actor and the date', async () => {
      const tab = planDetailPage.audit();
      const entries = await tab.readEntries();
      const index = entries.findIndex((entry) => STATUS_CHANGE_ACTION.test(entry.action));
      expect(index, 'the deactivation entry').toBeGreaterThanOrEqual(0);
      expect(entries[index].by, 'actor').not.toBe('');
      expect(entries[index].when, 'date').toMatch(ENTRY_TIME);
      const detail = await tab.openEntry(index);
      await tab.closeEntry();
      const recorded = detail.changes.map((change) => `${change.field}: ${change.after}`).join(' | ');
      expect(recorded, 'the reason').toContain(COMPLIANCE.reason);
      expect(recorded, 'the details').toContain(COMPLIANCE.details);
      afterDeactivation = (await tab.readAllEntries()).length;
    });

    await steps.step('Activate the plan again and approve - a new entry records the activation with actor and date', async () => {
      await planDetailPage.open(plan.id);
      const outcome = await planDetailPage.attemptActivation();
      expect(outcome.status, `SetPlanActive should accept: ${outcome.text.slice(0, 200)}`).toBeLessThan(300);
      await planDetailPage.open(plan.id);
      await planDetailPage.submitForApproval();
      await planApprovalsPage.open();
      await planApprovalsPage.approve(plan.name);
      await planDetailPage.open(plan.id);
      await planDetailPage.expectStatusEventually(STATUS.active);
      await planDetailPage.audit().open();
      const entries = await planDetailPage.audit().readAllEntries();
      expect(entries.length, 'a new activation entry').toBeGreaterThan(afterDeactivation);
      expect(entries[0].by, 'actor').not.toBe('');
      expect(entries[0].when, 'date').toMatch(ENTRY_TIME);
    });
  });

  test(`TC-${CASE.rapidSubmit}: should create a single pending request and one audit entry when the activation is confirmed several times rapidly`, async ({
    planManagementPage,
    planDetailPage,
    planApprovalsPage,
    planIn,
    steps,
  }) => {
    test.setTimeout(15 * 60_000);
    const plan = await planIn('Inactive');
    let statusEntriesBefore = 0;

    await steps.critical('Navigate to the Plans Management module - the eligible Inactive plan is listed', async () => {
      await planDetailPage.open(plan.id);
      await planDetailPage.audit().open();
      statusEntriesBefore = (await planDetailPage.audit().readAllEntries()).filter((entry) => STATUS_CHANGE_ACTION.test(entry.action)).length;
      await planManagementPage.openListFor(plan.payerName);
      await planManagementPage.expectStatusText(plan.name, STATUS.inactive);
    });

    await steps.critical('Open the activation confirmation and click confirm several times quickly - the submission is processed', async () => {
      const prompt = await planManagementPage.openActivationPrompt(plan.name);
      await prompt.confirmRepeatedly(RAPID_CLICKS);
      await planManagementPage.sendStagedChangeIfDraft(plan.name, plan.payerName);
      await planManagementPage.expectApprovalCell(plan.name, APPROVAL.pendingApproval);
    });

    await steps.step('The pending-approval queue holds a single activation request for the plan', async () => {
      await planApprovalsPage.open();
      await planApprovalsPage.expectSingleQueuedRequest(plan.name);
    });

    await steps.critical('Approve the single request - the plan moves to Active once, without errors', async () => {
      await planApprovalsPage.open();
      await planApprovalsPage.approve(plan.name);
      await planDetailPage.open(plan.id);
      await planDetailPage.expectStatusEventually(STATUS.active);
    });

    await steps.step('The audit history holds exactly one activation entry', async () => {
      await planDetailPage.audit().expectEntry(STATUS_CHANGE_ACTION);
      const statusEntries = (await planDetailPage.audit().readAllEntries()).filter((entry) => STATUS_CHANGE_ACTION.test(entry.action));
      expect(statusEntries.length, 'one new status-change entry').toBe(statusEntriesBefore + 1);
    });
  });
});
