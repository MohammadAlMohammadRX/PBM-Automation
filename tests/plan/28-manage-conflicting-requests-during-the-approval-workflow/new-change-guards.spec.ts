import { test, expect } from '../../../fixtures';
import {
  CASE,
  EDIT,
  MENTIONS_PENDING,
  MSG_040,
  STATE,
} from '../../../data/plans/conflictingApprovalRequests.data';

/**
 * User story 14343: Manage conflicting requests during the approval workflow -
 * starting a new change while another is awaiting approval (MSG-PLN-040).
 *
 * A live plan's new change is a staged inactivation; a draft or rejected
 * plan's is an edit (see the data file).
 */
test.describe('US 14343 - New changes while one is pending', () => {
  test.describe.configure({ timeout: 15 * 60_000 });

  test(`TC-${CASE.newChangeAllowed}: should start a new change without a blocking message when the plan has no pending request`, async ({
    planManagementPage,
    planDetailPage,
    planIn,
    steps,
  }) => {
    const plan = await planIn('Active');

    await steps.critical('Navigate to the Plans Management module - the dashboard loads', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Select a plan with no change Pending Approval - its detail page shows the current status', async () => {
      await planDetailPage.open(plan.id);
      expect(await planDetailPage.getVersionBadge(), 'no change awaiting approval').not.toMatch(STATE.pendingApproval);
    });

    await steps.step('Initiate a new change on the plan - it starts and the plan enters an editable Draft state', async () => {
      const outcome = await planManagementPage.attemptNewChange(plan.name);
      expect(outcome.offered, 'the change should be offered').toBe('available');
      expect(outcome.status, outcome.text.slice(0, 200)).toBeLessThan(300);
      expect(outcome.messages.join(' '), 'no "already awaiting approval" message').not.toMatch(MSG_040);
      await planManagementPage.expectApprovalCell(plan.name, STATE.draft);
    });
  });

  test(`TC-${CASE.newChangeBlocked}: should block a new change with MSG-PLN-040 when the plan already has a change pending approval`, async ({
    planManagementPage,
    planApprovalsPage,
    planDetailPage,
    planIn,
    steps,
  }) => {
    const plan = await planIn('PendingChange');

    await steps.critical('Navigate to the Plans Management module - the dashboard loads', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Select the plan with a change Pending Approval - its detail page shows Pending Approval', async () => {
      await planDetailPage.open(plan.id);
      expect(`${await planDetailPage.getVersionBadge()} ${await planDetailPage.getNotice()}`).toMatch(STATE.pendingApproval);
    });

    await steps.step('Attempt to start another change on the same plan - it is rejected with MSG-PLN-040', async () => {
      const outcome = await planManagementPage.attemptNewChange(plan.name);
      expect(outcome.messages.join(' '), `MSG-PLN-040 (offered: ${outcome.offered}, answered ${outcome.status} ${outcome.text.slice(0, 160)})`).toMatch(MSG_040);
      expect(outcome.status, 'the new change must not be accepted').not.toBe(200);
      await planApprovalsPage.open();
      await planApprovalsPage.expectSingleQueuedRequest(plan.name);
    });
  });

  test(`TC-${CASE.rulePerStatus}: should block a new change only when the plan is Pending Approval and allow it when it is Draft, Approved or Rejected`, async ({
    planManagementPage,
    planIn,
    steps,
  }) => {
    test.setTimeout(30 * 60_000);
    const pending = await planIn('PendingChange');
    const approved = await planIn('Active');
    const rejected = await planIn('Rejected');
    // The Draft LAST: built first, its near-term effective time had passed by the
    // time the three approval round trips above were done, and UpdatePlan
    // refused the edit ("Effective date and time cannot be in the past", 2026-10-27).
    const draft = await planIn('Draft');

    await steps.critical('Navigate to the Plans Management module - the dashboard loads', async () => {
      await planManagementPage.openListFor(draft.payerName);
      expect(await planManagementPage.isListed(draft.name)).toBe(true);
    });

    await steps.step('Start a new change on the Draft plan - it is allowed', async () => {
      const report = await planManagementPage.stageEdit(draft.name, 'descriptionEn', EDIT.draft);
      expect(report.refused, report.text).toBe(false);
    });

    await steps.step('Start a new change on the Pending Approval plan - it is blocked with MSG-PLN-040', async () => {
      const outcome = await planManagementPage.attemptNewChange(pending.name);
      expect(outcome.messages.join(' '), `MSG-PLN-040 (offered: ${outcome.offered}, answered ${outcome.status})`).toMatch(MSG_040);
    });

    await steps.step('Start a new change on the Approved plan - it is allowed', async () => {
      const outcome = await planManagementPage.attemptNewChange(approved.name);
      expect(outcome.status, outcome.text.slice(0, 200)).toBeLessThan(300);
      expect(outcome.messages.join(' ')).not.toMatch(MSG_040);
    });

    await steps.step('Start a new change on the Rejected plan - it is allowed', async () => {
      const report = await planManagementPage.stageEdit(rejected.name, 'descriptionEn', EDIT.rejected);
      expect(report.refused, report.text).toBe(false);
    });
  });

  test(`TC-${CASE.zeroVersusOne}: should allow a new change when the plan has zero pending changes and block it when it has one`, async ({
    planManagementPage,
    planIn,
    steps,
  }) => {
    test.setTimeout(20 * 60_000);
    const none = await planIn('Active');
    const one = await planIn('PendingChange');

    await steps.critical('Navigate to the Plans Management module - the dashboard loads', async () => {
      await planManagementPage.openListFor(none.payerName);
      expect(await planManagementPage.isListed(none.name)).toBe(true);
    });

    await steps.step('Start a new change on Plan A (0 pending) - it starts successfully', async () => {
      const outcome = await planManagementPage.attemptNewChange(none.name);
      expect(outcome.status, outcome.text.slice(0, 200)).toBeLessThan(300);
      expect(outcome.messages.join(' ')).not.toMatch(MSG_040);
    });

    await steps.step('Start a new change on Plan B (1 pending) - it is blocked with MSG-PLN-040', async () => {
      const outcome = await planManagementPage.attemptNewChange(one.name);
      expect(outcome.messages.join(' '), `MSG-PLN-040 (offered: ${outcome.offered}, answered ${outcome.status})`).toMatch(MSG_040);
    });
  });

  test(`TC-${CASE.clearlyShown}: should show the Pending Approval badge, a clear MSG-PLN-040 and a required reason when a change is pending`, async ({
    planManagementPage,
    planApprovalsPage,
    planDetailPage,
    planIn,
    steps,
  }) => {
    const plan = await planIn('PendingChange');

    await steps.critical('Navigate to the Plans Management module - the dashboard loads', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.step('Open the plan that is Pending Approval - a Pending Approval badge is visibly displayed', async () => {
      await planDetailPage.open(plan.id);
      expect(await planDetailPage.getVersionBadge()).toMatch(STATE.pendingApproval);
    });

    await steps.step('Attempt to start a new change - MSG-PLN-040 is clear and references the existing pending request', async () => {
      const outcome = await planManagementPage.attemptNewChange(plan.name);
      const message = outcome.messages.join(' ');
      expect(message, `MSG-PLN-040 (offered: ${outcome.offered})`).toMatch(MSG_040);
      expect(message, 'it should point at the pending request').toMatch(MENTIONS_PENDING);
    });

    await steps.step('Open the Reject dialog - the reason field is marked as required', async () => {
      await planApprovalsPage.open();
      const dialog = await planApprovalsPage.openRejectDialog(plan.name);
      expect(await dialog.isReasonMarkedRequired(), 'the reason should be marked required').toBe(true);
      await dialog.cancel();
    });
  });
});
