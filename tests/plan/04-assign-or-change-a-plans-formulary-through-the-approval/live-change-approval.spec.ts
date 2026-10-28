import { test, expect } from '../../../fixtures';
import {
  APPROVER_NAME,
  AUDIT_ACTION,
  CASE,
  LIFECYCLE,
  PENDING_NOTICE,
  REJECTION_REASON,
  SUITE_PAYER,
  formularyCode,
  formularyMention,
} from '../../../data/plans/assignPlanFormulary.data';

/**
 * User story 14148: Assign or change a plan's formulary through the approval workflow.
 * A change on a LIVE plan: staged, sent for approval, decided on the shared
 * approval queue - and only then live. Until the decision the plan keeps its
 * original formulary.
 *
 * Every plan is the case's own Active plan carrying the suite formulary
 * (`planIn('Active')`); the replacement is a second Active formulary of the
 * same payer (`suitePayerFormularies`).
 */
test.describe('US 14148 - Changing a live plan\'s formulary', () => {
  test.describe.configure({ timeout: 15 * 60_000 });

  test(`TC-${CASE.liveChangeHeld}: should hold the change for approval and keep the live formulary until it is approved when the plan is Active`, async ({
    planManagementPage,
    planDetailPage,
    planApprovalsPage,
    planIn,
    suitePayerFormularies,
    steps,
  }) => {
    const [original, replacement] = await suitePayerFormularies(2);
    const plan = await planIn('Active', { formularyId: original.id });
    const tab = planDetailPage.formulary();

    await steps.critical('Navigate to the Plans Management module - the plan list loads', async () => {
      await planManagementPage.openListFor(SUITE_PAYER);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Open the Active plan - its details show the existing formulary assignment', async () => {
      await planDetailPage.open(plan.id);
      expect(await planDetailPage.getStatus()).toBe(LIFECYCLE.active);
      await tab.open();
      expect(await tab.getPanelText()).toContain(formularyCode(original));
    });

    await steps.critical('Replace the formulary with another of the same payer and submit - a pending request is created and the live formulary is unchanged', async () => {
      const answer = await tab.replaceWith(formularyCode(replacement));
      expect(answer?.status, `AssignFormularyToPlan: ${answer?.text.slice(0, 200)}`).toBeLessThan(300);
      await planDetailPage.submitForApproval();
      await planApprovalsPage.open();
      await planApprovalsPage.expectInQueue(plan.name);
      expect(await tab.readLiveFormularyIdViaApi(plan.id), 'the live plan keeps its formulary').toBe(original.id);
    });

    await steps.step('View the plan status - a pending-approval indicator alongside Active', async () => {
      await planDetailPage.open(plan.id);
      expect(await planDetailPage.getStatus()).toBe(LIFECYCLE.active);
      expect(await planDetailPage.getNotice(), 'the plan should say a change awaits approval').toMatch(PENDING_NOTICE);
    });

    await steps.step('Approve the request as an authorized approver - the new formulary becomes the plan\'s active one', async () => {
      await planApprovalsPage.open();
      await planApprovalsPage.approve(plan.name);
      await expect.poll(() => tab.readLiveFormularyIdViaApi(plan.id), { timeout: 60_000, message: 'the approved formulary should go live' }).toBe(replacement.id);
    });
  });

  test(`TC-${CASE.pendingNotLive}: should keep referencing the original formulary when a change is pending until it is decided`, async ({
    planManagementPage,
    planDetailPage,
    planApprovalsPage,
    planIn,
    suitePayerFormularies,
    pendingFormularyChange,
    steps,
  }) => {
    const [original, replacement] = await suitePayerFormularies(2);
    const plan = await planIn('Active', { formularyId: original.id });
    await pendingFormularyChange(plan, replacement.id);
    const tab = planDetailPage.formulary();

    await steps.critical('Navigate to the Plans Management module - the plan list loads', async () => {
      await planManagementPage.openListFor(SUITE_PAYER);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Open the live plan - the original formulary is still active and a pending change is indicated', async () => {
      await planDetailPage.open(plan.id);
      expect(await planDetailPage.getNotice(), 'a pending-change indicator').toMatch(PENDING_NOTICE);
      expect(await tab.readLiveFormularyIdViaApi(plan.id)).toBe(original.id);
    });

    await steps.step('View the plan from the directory (the reporting reference) - it references the original formulary, not the pending one', async () => {
      const row = await planManagementPage.readRow(plan.name);
      expect(row.formulary, 'the directory should show the live formulary').toMatch(formularyMention(original));
      expect(row.formulary, 'the pending formulary must not be shown as the plan\'s').not.toMatch(formularyMention(replacement));
    });

    await steps.step('Record the approval decision - only then does the plan\'s formulary change', async () => {
      expect(await tab.readLiveFormularyIdViaApi(plan.id), 'still the original before the decision').toBe(original.id);
      await planApprovalsPage.open();
      await planApprovalsPage.approve(plan.name);
      await expect.poll(() => tab.readLiveFormularyIdViaApi(plan.id), { timeout: 60_000 }).toBe(replacement.id);
    });
  });

  test(`TC-${CASE.rejectedChange}: should leave the current formulary unchanged and record the rejection when the change is rejected`, async ({
    planManagementPage,
    planDetailPage,
    planApprovalsPage,
    planIn,
    suitePayerFormularies,
    pendingFormularyChange,
    steps,
  }) => {
    const [original, replacement] = await suitePayerFormularies(2);
    const plan = await planIn('Active', { formularyId: original.id });
    await pendingFormularyChange(plan, replacement.id);
    const tab = planDetailPage.formulary();

    await steps.critical('Navigate to the Plans Management module - the plan list loads', async () => {
      await planManagementPage.openListFor(SUITE_PAYER);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Open the plan with the pending change - the pending request and the current formulary show', async () => {
      await planDetailPage.open(plan.id);
      expect(await planDetailPage.getNotice()).toMatch(PENDING_NOTICE);
      const history = await tab.readHistoryViaApi(plan.id);
      expect(history.some((entry) => entry.formularyId === replacement.id && !entry.isCurrent), 'the requested formulary is pending').toBe(true);
      expect(await tab.readLiveFormularyIdViaApi(plan.id)).toBe(original.id);
    });

    await steps.critical('Reject the pending request with a reason - it is marked Rejected and an audit entry is recorded', async () => {
      await planApprovalsPage.open();
      await planApprovalsPage.reject(plan.name, REJECTION_REASON);
      await planDetailPage.open(plan.id);
      await planDetailPage.audit().open();
      await planDetailPage.audit().expectEntry(/Reject/i);
    });

    await steps.step('Reopen the plan - it still shows its original formulary', async () => {
      await planDetailPage.open(plan.id);
      await tab.open();
      expect(await tab.readLiveFormularyIdViaApi(plan.id)).toBe(original.id);
      expect(await tab.getPanelText()).toContain(formularyCode(original));
    });
  });

  test(`TC-${CASE.rapidChanges}: should keep the plan in one well-defined formulary state when two changes are submitted back to back`, async ({
    planManagementPage,
    planDetailPage,
    planApprovalsPage,
    planIn,
    suitePayerFormularies,
    steps,
  }) => {
    const [original, first, second] = await suitePayerFormularies(3);
    const plan = await planIn('Active', { formularyId: original.id });
    const tab = planDetailPage.formulary();

    await steps.critical('Navigate to the Plans Management module - the plan list loads', async () => {
      await planManagementPage.openListFor(SUITE_PAYER);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Submit a change to Formulary A - a pending approval request for A is created', async () => {
      await planDetailPage.open(plan.id);
      await tab.open();
      const answer = await tab.replaceWith(formularyCode(first));
      expect(answer?.status, `AssignFormularyToPlan: ${answer?.text.slice(0, 200)}`).toBeLessThan(300);
      await planDetailPage.submitForApproval();
      await planApprovalsPage.open();
      await planApprovalsPage.expectInQueue(plan.name);
    });

    await steps.step('Immediately submit a change to Formulary B - it is blocked or asks to confirm, never silently applied', async () => {
      const answer = await tab.assignViaApi(plan.id, second.id);
      const handled = answer.status >= 400 || /"requiresDraftConfirmation"\s*:\s*true/.test(answer.text);
      expect(handled, `the second change answered ${answer.status} ${answer.text.slice(0, 200)}`).toBe(true);
      await planApprovalsPage.open();
      await planApprovalsPage.expectSingleQueuedRequest(plan.name);
    });

    await steps.step('Approve the resulting request - one well-defined formulary and an audit trail of the submissions', async () => {
      await planApprovalsPage.approve(plan.name);
      await expect.poll(() => tab.readLiveFormularyIdViaApi(plan.id), { timeout: 60_000 }).toBe(first.id);
      await planDetailPage.open(plan.id);
      await planDetailPage.audit().open();
      await planDetailPage.audit().expectEntry(AUDIT_ACTION.submission);
    });
  });

  test(`TC-${CASE.auditTrail}: should record the submission and the decision with user and time when a formulary change is approved`, async ({
    planManagementPage,
    planDetailPage,
    planApprovalsPage,
    planIn,
    suitePayerFormularies,
    steps,
  }) => {
    const [original, replacement] = await suitePayerFormularies(2);
    const plan = await planIn('Active', { formularyId: original.id });
    const tab = planDetailPage.formulary();

    await steps.critical('Navigate to the Plans Management module - the plan list loads', async () => {
      await planManagementPage.openListFor(SUITE_PAYER);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Open the plan and change its formulary - it is submitted for approval', async () => {
      await planDetailPage.open(plan.id);
      await tab.open();
      const answer = await tab.replaceWith(formularyCode(replacement));
      expect(answer?.status, `AssignFormularyToPlan: ${answer?.text.slice(0, 200)}`).toBeLessThan(300);
      await planDetailPage.submitForApproval();
      await planApprovalsPage.open();
      await planApprovalsPage.expectInQueue(plan.name);
    });

    await steps.critical('Approve the resulting request - the decision is recorded', async () => {
      await planApprovalsPage.approve(plan.name);
      await expect.poll(() => tab.readLiveFormularyIdViaApi(plan.id), { timeout: 60_000 }).toBe(replacement.id);
    });

    await steps.step('Open the audit log - the submission and the decision each show their user, time and action', async () => {
      await planDetailPage.open(plan.id);
      await planDetailPage.audit().open();
      const entries = await planDetailPage.audit().readAllEntries();
      const submission = entries.find((entry) => AUDIT_ACTION.submission.test(entry.action));
      const decision = entries.find((entry) => AUDIT_ACTION.decision.test(entry.action));
      expect(submission, `a submission entry among ${entries.map((e) => e.action).join(', ')}`).toBeDefined();
      expect(decision, `a decision entry among ${entries.map((e) => e.action).join(', ')}`).toBeDefined();
      expect([submission?.by, decision?.by], 'each entry names its actor').toEqual([APPROVER_NAME, APPROVER_NAME]);
      expect(submission?.when, 'the submission\'s time').not.toBe('');
      expect(decision?.when, 'the decision\'s time').not.toBe('');
    });
  });

  test(`TC-${CASE.sharedApproval}: should route the change through the shared approval queue with its details when an approver reviews it`, async ({
    planManagementPage,
    planDetailPage,
    planApprovalsPage,
    planIn,
    suitePayerFormularies,
    steps,
  }) => {
    const [original, replacement] = await suitePayerFormularies(2);
    const plan = await planIn('Active', { formularyId: original.id });
    const tab = planDetailPage.formulary();

    await steps.critical('Navigate to the Plans Management module - the plan list loads', async () => {
      await planManagementPage.openListFor(SUITE_PAYER);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Submit a formulary change on the live plan as a Plan Administrator - it is routed to the approvals queue', async () => {
      await planDetailPage.open(plan.id);
      await tab.open();
      const answer = await tab.replaceWith(formularyCode(replacement));
      expect(answer?.status, `AssignFormularyToPlan: ${answer?.text.slice(0, 200)}`).toBeLessThan(300);
      await planDetailPage.submitForApproval();
      await planApprovalsPage.open();
      await planApprovalsPage.expectInQueue(plan.name);
    });

    await steps.step('Open the approvals queue as the approver - the request shows the plan, the requested formulary and the submitter', async () => {
      const row = await planApprovalsPage.readQueuedRow(plan.name);
      expect(row.text, 'the queued row names the plan').toContain(plan.name);
      expect(row.text, 'the queued row names the submitter').toContain(APPROVER_NAME);
      const review = await planApprovalsPage.readReviewText(plan.name);
      expect(review, 'the review shows the requested formulary').toMatch(formularyMention(replacement));
    });

    await steps.step('Approve the request from the queue - the plan takes the new formulary and the request leaves the queue', async () => {
      await planApprovalsPage.open();
      await planApprovalsPage.approve(plan.name);
      await planApprovalsPage.expectNotInQueue(plan.name);
      await expect.poll(() => tab.readLiveFormularyIdViaApi(plan.id), { timeout: 60_000 }).toBe(replacement.id);
    });
  });
});
