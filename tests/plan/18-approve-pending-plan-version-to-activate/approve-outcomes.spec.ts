import { test, expect } from '../../../fixtures';
import type { ConfirmDialog } from '../../../pages/components/ConfirmDialog';
import type { PlanVersionRow } from '../../../pages/plan/PlanVersionHistoryTab';
import { PERMANENT_PLAN_CODE } from '../../../data/plans/plan.data';
import {
  APPROVER_NAME,
  BLANK_COMMENT,
  BLOCKED_CASES,
  CASE,
  COMMENT,
  LIFECYCLE,
  LIFECYCLE_WAIT_MS,
  PENDING_APPROVAL_TILE,
  STATE,
  todayPattern,
} from '../../../data/plans/approvePendingPlanVersion.data';

/**
 * User story 14174: Approve pending plan version to activate.
 * What an approval does: the plan goes Active, gets its permanent code once,
 * the decision is recorded, and later changes still pass through approval.
 *
 * Every case approves its own plan on the Plan tab of Approval Management
 * (see the data files for the mapping).
 */
test.describe('US 14174 - Approval outcomes', () => {
  test.describe.configure({ timeout: 15 * 60_000 });

  test(`TC-${CASE.approveActivates}: should make the plan Active with a success message when an approver approves it with a comment`, async ({
    planManagementPage,
    planApprovalsPage,
    planDetailPage,
    planIn,
    steps,
  }) => {
    const plan = await planIn('PendingApproval');
    let dialog!: ConfirmDialog;

    await steps.critical('Navigate to the Plans Management module - the directory loads', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Open the plan version in Pending Approval - an Approve action is available', async () => {
      await planDetailPage.open(plan.id);
      expect(await planDetailPage.getVersionBadge()).toMatch(STATE.pendingApproval);
      await planApprovalsPage.open();
      expect(await planApprovalsPage.getRowActionAvailability(plan.name, 'approve'), 'Approve on the pending plan').toBe('available');
    });

    await steps.step('Select Approve and enter an optional comment - the comment is accepted', async () => {
      dialog = await planApprovalsPage.openApproveDialog(plan.name);
      expect(await dialog.typeReasonText(COMMENT.asSubmitted), 'the Approve dialog should take a comment').toBe(COMMENT.asSubmitted);
    });

    await steps.critical('Confirm the approval - a success message is displayed', async () => {
      await dialog.confirm('Approve');
      expect(await planApprovalsPage.getToastMessage(), 'a success message after approving').not.toBe('');
      await planApprovalsPage.expectNotInQueue(plan.name);
    });

    await steps.step('Reopen the plan - its status shows Active', async () => {
      await planDetailPage.open(plan.id);
      await planDetailPage.expectStatusEventually(LIFECYCLE.active, LIFECYCLE_WAIT_MS);
    });
  });

  test(`TC-${CASE.permanentCode}: should generate the permanent plan code and keep it for later versions when the plan is approved for the first time`, async ({
    planManagementPage,
    planApprovalsPage,
    planDetailPage,
    planIn,
    steps,
  }) => {
    test.setTimeout(20 * 60_000);
    const plan = await planIn('PendingApproval');
    let code = '';

    await steps.critical('Navigate to the Plans Management module - the directory loads', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.step('Open the new pending plan - no permanent plan code is shown yet', async () => {
      expect(await planManagementPage.readCode(plan.name), 'a never-approved plan carries no permanent code').not.toMatch(PERMANENT_PLAN_CODE);
    });

    await steps.critical('Approve the plan with a comment - the approval succeeds and the plan becomes Active', async () => {
      await planApprovalsPage.open();
      const outcome = await planApprovalsPage.decideWithComment(plan.name, 'approve', COMMENT.firstApproval);
      expect(outcome.stillQueued, outcome.answer).toBe(false);
      await planDetailPage.open(plan.id);
      await planDetailPage.expectStatusEventually(LIFECYCLE.active, LIFECYCLE_WAIT_MS);
    });

    await steps.critical('Reopen the plan - a permanent plan code has been generated and is displayed', async () => {
      code = await planManagementPage.readCode(plan.name);
      expect(code).toMatch(PERMANENT_PLAN_CODE);
    });

    await steps.step('Submit a later revision and approve it - the plan code is unchanged', async () => {
      await planManagementPage.stageAndSubmit(plan.name, 'inactivate');
      await planApprovalsPage.open();
      await planApprovalsPage.approve(plan.name);
      expect(await planManagementPage.readCode(plan.name), 'the code from the first approval').toBe(code);
    });
  });

  test(`TC-${CASE.noComment}: should approve the plan and make it Active when no comment is entered`, async ({
    planManagementPage,
    planApprovalsPage,
    planDetailPage,
    planIn,
    steps,
  }) => {
    const plan = await planIn('PendingApproval');
    let dialog!: ConfirmDialog;

    await steps.critical('Navigate to the Plans Management module - the directory loads', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.step('Open the pending plan and select Approve - the dialog opens with an optional comments field', async () => {
      await planApprovalsPage.open();
      dialog = await planApprovalsPage.openApproveDialog(plan.name);
      expect(await dialog.hasFreeTextInput(), 'the Approve dialog should offer an optional comments field').toBe(true);
    });

    await steps.critical('Leave the comments empty and confirm - the approval is accepted without error', async () => {
      await dialog.confirm('Approve');
      await planApprovalsPage.expectNotInQueue(plan.name);
    });

    await steps.step('Reopen the plan - it shows Active and its approval entry carries no comment', async () => {
      await planDetailPage.open(plan.id);
      await planDetailPage.expectStatusEventually(LIFECYCLE.active, LIFECYCLE_WAIT_MS);
      await planDetailPage.versions().open();
      const entry = (await planDetailPage.versions().readRows()).find((row) => STATE.published.test(row.status));
      expect(entry, 'a Published version entry').toBeDefined();
      expect(entry?.reason ?? '(no entry)', 'no comment recorded').toMatch(BLANK_COMMENT);
    });
  });

  test(`TC-${CASE.recordsApproverCommentTime}: should record the approver, their comment and the approval time when a plan is approved`, async ({
    planManagementPage,
    planApprovalsPage,
    planDetailPage,
    auditLogsPage,
    planIn,
    steps,
  }) => {
    const plan = await planIn('PendingApproval');
    let entry: PlanVersionRow | undefined;

    await steps.critical('Navigate to the Plans Management module - the directory loads', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Open the pending plan, Approve with a comment and confirm - the approval succeeds', async () => {
      await planApprovalsPage.open();
      const outcome = await planApprovalsPage.decideWithComment(plan.name, 'approve', COMMENT.filing);
      expect(outcome.typed, 'the comment typed into the Approve dialog').toBe(COMMENT.filing);
      expect(outcome.stillQueued, outcome.answer).toBe(false);
    });

    await steps.step('Open the audit log and the plan\'s version history - an entry is listed for the approval', async () => {
      expect((await auditLogsPage.findRowsMentioning(plan.id)).length, 'the central audit log should hold a record for the plan').toBeGreaterThan(0);
      await planDetailPage.open(plan.id);
      await planDetailPage.versions().open();
      entry = (await planDetailPage.versions().readRows()).find((row) => STATE.published.test(row.status));
      expect(entry, 'a Published version entry').toBeDefined();
    });

    await steps.step('The entry shows the approving user\'s name', async () => {
      expect(entry?.reviewedBy ?? '(no entry)').toContain(APPROVER_NAME);
    });

    await steps.step('The entry shows the comment and the approval date and time', async () => {
      expect(`${entry?.reason ?? ''} ${await planDetailPage.versions().viewVersionText(entry?.version ?? '')}`, 'the approval comment').toContain(COMMENT.filing);
      expect(entry?.reviewedOn ?? '(no entry)', 'stamped with today').toMatch(todayPattern());
    });
  });

  test(`TC-${CASE.activeOnlyViaApproval}: should change an active plan's formulary only through a new approved version when the plan is already live`, async ({
    planManagementPage,
    planApprovalsPage,
    planDetailPage,
    planIn,
    alternatePlanFormulary,
    requireBaseline,
    steps,
  }) => {
    test.setTimeout(25 * 60_000);
    const plan = await planIn('Active');
    const draft = await planIn('Draft');
    const replacement = await alternatePlanFormulary();

    await steps.critical('Navigate to the Plans Management module - the directory loads', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.step('Open the active plan and try to edit it directly - direct edit controls are unavailable', async () => {
      requireBaseline((await planManagementPage.getOfferedRowActions(draft.name)).includes('edit'), 'Edit on a plan row');
      expect(await planManagementPage.getOfferedRowActions(plan.name), 'the active plan\'s row').not.toContain('edit');
      await planDetailPage.open(plan.id);
      expect(await planDetailPage.getActionAvailability('edit'), 'the active plan\'s header').not.toBe('available');
    });

    await steps.critical('Initiate a new version of the active plan - a new draft version is created', async () => {
      await planDetailPage.open(plan.id);
      await planDetailPage.formulary().open();
      await planDetailPage.formulary().remove();
      const answer = await planDetailPage.formulary().assign(replacement.formularyCode ?? replacement.formularyNameEn);
      expect(answer?.status ?? 0, answer?.text.slice(0, 200) ?? 'no assignment request was sent').toBeLessThan(300);
      await planManagementPage.expectApprovalCell(plan.name, STATE.draft);
    });

    await steps.step('Submit the new version for approval - it is Pending Approval while the active plan is unchanged', async () => {
      await planManagementPage.submitForApproval(plan.name);
      await planManagementPage.expectApprovalCell(plan.name, STATE.pendingApproval);
      expect(await planManagementPage.readStatus(plan.name), 'the live plan stays Active').toBe(LIFECYCLE.active);
      expect(JSON.stringify(await planDetailPage.formulary().readAssignmentViaApi(plan.id)), 'the published formulary is still the original').toContain(plan.formularyId ?? '(none)');
    });

    await steps.step('Approve the new version - the new formulary becomes active, replacing the prior version', async () => {
      await planApprovalsPage.open();
      await planApprovalsPage.approve(plan.name);
      expect((await planManagementPage.readPlanRecord(plan.id)).formularyId).toBe(replacement.id);
      await planDetailPage.open(plan.id);
      await planDetailPage.versions().open();
      const statuses = (await planDetailPage.versions().readRows()).map((row) => row.status);
      expect(STATE.published.test(statuses[0] ?? ''), `newest version published (statuses: ${statuses.join(', ')})`).toBe(true);
      expect(statuses.some((status) => STATE.superseded.test(status)), 'the prior version superseded').toBe(true);
    });
  });

  test(`TC-${CASE.confirmationAndRefresh}: should confirm the approval and refresh the directory, KPIs and version history when a plan is approved`, async ({
    planManagementPage,
    planApprovalsPage,
    planDetailPage,
    planIn,
    steps,
  }) => {
    const plan = await planIn('PendingApproval');
    let activeBefore = 0;

    await steps.critical('Navigate to the Plans Management module - the directory and KPI widgets load with current counts', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect((await planManagementPage.readKpis()).total, 'the Total tile should count the plans').toBeGreaterThan(0);
    });

    await steps.step('Note the Pending Approval and Active counts in the KPIs - both are recorded', async () => {
      activeBefore = await planManagementPage.getSettledKpiValue('active');
      const labels = await planManagementPage.getKpiLabels();
      expect(labels.some((label) => PENDING_APPROVAL_TILE.test(label)), `a Pending Approval tile (tiles: ${labels.join(', ')})`).toBe(true);
    });

    await steps.critical('Approve the pending plan with a comment and confirm - a success message is displayed', async () => {
      await planApprovalsPage.open();
      const outcome = await planApprovalsPage.decideWithComment(plan.name, 'approve', COMMENT.approved);
      expect(outcome.toast, 'a success message').not.toBe('');
      expect(outcome.stillQueued, outcome.answer).toBe(false);
    });

    await steps.step('Return to the directory - the plan appears with status Active', async () => {
      await planDetailPage.open(plan.id);
      await planDetailPage.expectStatusEventually(LIFECYCLE.active, LIFECYCLE_WAIT_MS);
      expect(await planManagementPage.readStatus(plan.name)).toBe(LIFECYCLE.active);
    });

    await steps.step('Check the KPI widgets again - Pending Approval drops by one and Active rises by one', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.getSettledKpiValue('active'), 'the Active tile').toBe(activeBefore + 1);
      const labels = await planManagementPage.getKpiLabels();
      expect(labels.some((label) => PENDING_APPROVAL_TILE.test(label)), `the drop cannot show without a Pending Approval tile (tiles: ${labels.join(', ')})`).toBe(true);
    });

    await steps.step('Open the plan\'s version history - a new entry reflects the approval', async () => {
      await planDetailPage.open(plan.id);
      await planDetailPage.versions().open();
      const statuses = (await planDetailPage.versions().readRows()).map((row) => row.status);
      expect(statuses.some((status) => STATE.published.test(status)), `version statuses: ${statuses.join(', ')}`).toBe(true);
    });
  });

  test(`TC-${CASE.codeNeverChanges}: should keep the plan code identical when later versions of the plan are approved repeatedly`, async ({
    planManagementPage,
    planApprovalsPage,
    planDetailPage,
    planIn,
    steps,
  }) => {
    test.setTimeout(25 * 60_000);
    const plan = await planIn('Active');
    let code = '';

    await steps.critical('Navigate to the Plans Management module - the active plan shows its plan code', async () => {
      await planManagementPage.openListFor(plan.payerName);
      code = await planManagementPage.readCode(plan.name);
      expect(code).toMatch(PERMANENT_PLAN_CODE);
    });

    await steps.critical('Create a new version with a change and submit it - it is Pending Approval and the code is still shown', async () => {
      await planManagementPage.stageAndSubmit(plan.name, 'inactivate');
      await planManagementPage.expectApprovalCell(plan.name, STATE.pendingApproval);
      expect(await planManagementPage.readCode(plan.name)).toBe(code);
    });

    await steps.critical('Approve the new version - it replaces the prior one', async () => {
      await planApprovalsPage.open();
      await planApprovalsPage.approve(plan.name);
      await planDetailPage.open(plan.id);
      await planDetailPage.expectStatusEventually(LIFECYCLE.inactive, LIFECYCLE_WAIT_MS);
    });

    await steps.step('Check the code on the newly published version - it is identical to the original', async () => {
      expect(await planManagementPage.readCode(plan.name)).toBe(code);
    });

    await steps.step('Repeat the version / approval cycle - the code still does not change', async () => {
      await planManagementPage.openListFor(plan.payerName);
      await planManagementPage.stageAndSubmit(plan.name, 'activate');
      await planApprovalsPage.open();
      await planApprovalsPage.approve(plan.name);
      expect(await planManagementPage.readCode(plan.name)).toBe(code);
    });
  });

  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.azureId}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
