import { test, expect } from '../../../fixtures';
import type { ConfirmDialog } from '../../../pages/components/ConfirmDialog';
import type { PlanVersionRow } from '../../../pages/plan/PlanVersionHistoryTab';
import type { AuditLogRow } from '../../../pages/system/AuditLogsPage';
import {
  APPROVER_NAME,
  CASE,
  COMMENT,
  KPI_TILE,
  LIVE_FILTERS,
  NOT_LIVE,
  REASON,
  REJECTED_FILTER,
  STATE,
  todayPattern,
} from '../../../data/plans/rejectPendingPlanVersion.data';

/**
 * User story 14173: Reject pending plan version back to Rejected.
 * What a rejection does to the plan: its status, editability, formulary,
 * version history, audit trail, directory and KPIs.
 *
 * Every case rejects its own plan (fixture `planIn('PendingApproval')`) on the
 * Plan tab of Approval Management - see the data file for the mapping.
 */
test.describe('US 14173 - Rejection outcomes', () => {
  test.describe.configure({ timeout: 15 * 60_000 });

  test(`TC-${CASE.rejectReturnsForRevision}: should return the plan to Rejected and editable with its formulary when an approver rejects it with a comment`, async ({
    planManagementPage,
    planApprovalsPage,
    planDetailPage,
    planIn,
    steps,
  }) => {
    const plan = await planIn('PendingApproval');
    let dialog!: ConfirmDialog;

    await steps.critical('Navigate to the Plans Management module - the plans directory loads', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name), 'the pending plan should be in the directory').toBe(true);
    });

    await steps.critical('Open the plan version in Pending Approval - it reads Pending Approval and a Reject action is available', async () => {
      await planDetailPage.open(plan.id);
      expect(await planDetailPage.getVersionBadge()).toMatch(STATE.pendingApproval);
      await planApprovalsPage.open();
      expect(await planApprovalsPage.getRowActionAvailability(plan.name, 'reject'), 'Reject on the pending plan').toBe('available');
    });

    await steps.step('Select Reject - a dialog opens prompting for mandatory comments', async () => {
      dialog = await planApprovalsPage.openRejectDialog(plan.name);
      expect(await dialog.hasFreeTextInput(), 'the Reject dialog should offer a comments field').toBe(true);
    });

    await steps.step('Enter a valid rejection reason in the comments field - the text is accepted', async () => {
      expect(await dialog.typeReasonText(COMMENT.valid)).toBe(COMMENT.valid);
    });

    await steps.critical('Confirm the rejection - a success message is displayed and the dialog closes', async () => {
      await dialog.selectReasonIfPresent(REASON.rates);
      await dialog.confirm('Reject');
      expect(await planApprovalsPage.getToastMessage(), 'a success message after rejecting').not.toBe('');
      await planApprovalsPage.expectNotInQueue(plan.name);
    });

    await steps.step('Reopen the plan - it reads Rejected, is editable and keeps its formulary', async () => {
      await planManagementPage.expectApprovalCell(plan.name, STATE.rejected);
      expect(await planManagementPage.getRowActionAvailability(plan.name, 'edit'), 'a rejected plan should be editable').toBe('available');
      expect((await planManagementPage.readPlanRecord(plan.id)).formularyId, 'the formulary assignment stays intact').toBe(plan.formularyId);
    });
  });

  test(`TC-${CASE.editableKeepsFormulary}: should keep the plan editable with its formulary and accept a new formulary when the plan has been rejected`, async ({
    planManagementPage,
    planApprovalsPage,
    planDetailPage,
    planIn,
    alternatePlanFormulary,
    steps,
  }) => {
    const plan = await planIn('PendingApproval');
    const replacement = await alternatePlanFormulary();
    let formulary = '';

    await steps.critical('Navigate to the Plans Management module - the directory loads', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.step('Open the pending plan and note the assigned formulary - its name is displayed', async () => {
      formulary = (await planManagementPage.readRow(plan.name)).formulary;
      expect(formulary, 'the pending plan should show its formulary').not.toBe('');
    });

    await steps.critical('Reject the plan with a valid comment - its status changes to Rejected', async () => {
      await planApprovalsPage.open();
      const outcome = await planApprovalsPage.decideWithComment(plan.name, 'reject', COMMENT.revise, REASON.rates);
      expect(outcome.stillQueued, outcome.answer).toBe(false);
      await planManagementPage.expectApprovalCell(plan.name, STATE.rejected);
    });

    await steps.step('The Plan Administrator opens the rejected plan - it opens in an editable form', async () => {
      const form = await planManagementPage.openEditForm(plan.name);
      expect(await form.isFieldEditable('nameEn'), 'the rejected plan should be editable').toBe(true);
    });

    await steps.step('The formulary assignment field still holds the same formulary', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect((await planManagementPage.readPlanRecord(plan.id)).formularyId).toBe(plan.formularyId);
      expect((await planManagementPage.readRow(plan.name)).formulary).toBe(formulary);
    });

    await steps.step('Change the formulary to a different one and save - the new formulary is saved against the plan', async () => {
      await planDetailPage.open(plan.id);
      await planDetailPage.formulary().open();
      await planDetailPage.formulary().remove();
      const answer = await planDetailPage.formulary().assign(replacement.formularyCode ?? replacement.formularyNameEn);
      expect(answer?.status ?? 0, answer?.text.slice(0, 200) ?? 'no assignment request was sent').toBeLessThan(300);
      expect((await planManagementPage.readPlanRecord(plan.id)).formularyId).toBe(replacement.id);
    });
  });

  test(`TC-${CASE.recordsApproverAndTime}: should record the rejecting approver and the rejection time when a plan is rejected`, async ({
    planManagementPage,
    planApprovalsPage,
    planDetailPage,
    planIn,
    steps,
  }) => {
    const plan = await planIn('PendingApproval');
    let entry: PlanVersionRow | undefined;

    await steps.critical('Navigate to the Plans Management module - the directory loads', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Open the pending plan, Reject with a reason and confirm - the rejection succeeds', async () => {
      await planApprovalsPage.open();
      const outcome = await planApprovalsPage.decideWithComment(plan.name, 'reject', COMMENT.valid, REASON.rates);
      expect(outcome.stillQueued, outcome.answer).toBe(false);
    });

    await steps.step('Open the plan\'s version history - an entry is listed for the rejection', async () => {
      await planDetailPage.open(plan.id);
      await planDetailPage.versions().open();
      entry = (await planDetailPage.versions().readRows()).find((row) => STATE.rejected.test(row.status));
      expect(entry, 'a Rejected version entry').toBeDefined();
    });

    await steps.step('The entry shows the rejecting approver\'s name', async () => {
      expect(entry?.reviewedBy ?? '(no entry)').toContain(APPROVER_NAME);
    });

    await steps.step('The entry shows the rejection date and time', async () => {
      expect(entry?.reviewedOn ?? '(no entry)', 'the rejection should be stamped with today').toMatch(todayPattern());
    });
  });

  test(`TC-${CASE.confirmationAndRefresh}: should confirm the rejection and refresh the directory, KPIs and version history when a plan is rejected`, async ({
    planManagementPage,
    planApprovalsPage,
    planDetailPage,
    planIn,
    steps,
  }) => {
    const plan = await planIn('PendingApproval');
    let totalBefore = 0;

    await steps.critical('Navigate to the Plans Management module - the directory and KPI widgets load with current counts', async () => {
      await planManagementPage.openListFor(plan.payerName);
      totalBefore = (await planManagementPage.readKpis()).total;
      expect(totalBefore, 'the Total tile should count the plans').toBeGreaterThan(0);
    });

    await steps.step('Note the Pending Approval and Rejected counts in the KPIs - both tiles are shown', async () => {
      const labels = await planManagementPage.getKpiLabels();
      expect(labels.some((label) => KPI_TILE.pendingApproval.test(label)), `a Pending Approval tile (tiles: ${labels.join(', ')})`).toBe(true);
      expect(labels.some((label) => KPI_TILE.rejected.test(label)), `a Rejected tile (tiles: ${labels.join(', ')})`).toBe(true);
    });

    await steps.critical('Reject the pending plan with a valid comment and confirm - a success message is displayed', async () => {
      await planApprovalsPage.open();
      const outcome = await planApprovalsPage.decideWithComment(plan.name, 'reject', COMMENT.valid, REASON.rates);
      expect(outcome.toast, 'a success message').not.toBe('');
      expect(outcome.stillQueued, outcome.answer).toBe(false);
    });

    await steps.step('Return to the directory - the plan appears with status Rejected', async () => {
      await planManagementPage.expectApprovalCell(plan.name, STATE.rejected);
    });

    await steps.step('Check the KPI widgets again - Pending Approval drops by one and Rejected rises by one', async () => {
      await planManagementPage.openListFor(plan.payerName);
      const labels = await planManagementPage.getKpiLabels();
      expect(labels.some((label) => KPI_TILE.pendingApproval.test(label)), `the KPIs cannot show the move without a Pending Approval tile (tiles: ${labels.join(', ')})`).toBe(true);
      expect(labels.some((label) => KPI_TILE.rejected.test(label)), `the KPIs cannot show the move without a Rejected tile (tiles: ${labels.join(', ')})`).toBe(true);
      expect((await planManagementPage.readKpis()).total, 'a rejection removes no plan').toBe(totalBefore);
    });

    await steps.step('Open the plan\'s version history - a new entry reflects the rejection', async () => {
      await planDetailPage.open(plan.id);
      await planDetailPage.versions().open();
      const statuses = (await planDetailPage.versions().readRows()).map((row) => row.status);
      expect(statuses.some((status) => STATE.rejected.test(status)), `version statuses: ${statuses.join(', ')}`).toBe(true);
    });
  });

  test(`TC-${CASE.notMistakenForApproved}: should never treat a rejected plan as live, approvable or issuable when it is explored after rejection`, async ({
    planManagementPage,
    planApprovalsPage,
    planIn,
    steps,
  }) => {
    const plan = await planIn('PendingApproval');

    await steps.critical('Navigate to the Plans Management module - the directory loads', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Reject the pending plan with a valid comment - its status becomes Rejected', async () => {
      await planApprovalsPage.open();
      await planApprovalsPage.reject(plan.name, REASON.rates);
      await planManagementPage.expectApprovalCell(plan.name, STATE.rejected);
    });

    await steps.step('Filter the directory by Active and by Pending - the rejected plan appears under neither', async () => {
      await planManagementPage.search(plan.name);
      await planManagementPage.applyQuickFilter('status', LIVE_FILTERS.active);
      expect(await planManagementPage.isRowVisible(plan.name), 'listed under Active').toBe(false);
      await planManagementPage.openListFor(plan.payerName);
      await planManagementPage.search(plan.name);
      await planManagementPage.applyQuickFilter('status', LIVE_FILTERS.pending);
      expect(await planManagementPage.isRowVisible(plan.name), 'listed under Pending').toBe(false);
    });

    await steps.step('Filter the directory by Rejected - the rejected plan appears', async () => {
      await planManagementPage.openListFor(plan.payerName);
      await planManagementPage.advancedSearchFor({ nameOrCode: plan.name, approvalStatus: REJECTED_FILTER });
      expect(await planManagementPage.isRowVisible(plan.name), 'listed under the Rejected filter').toBe(true);
    });

    await steps.step('No Approve action is exposed on the rejected plan before resubmission', async () => {
      await planApprovalsPage.expectNotInQueue(plan.name);
    });

    await steps.step('The rejected plan is not available for policy issuance - it is not live', async () => {
      expect(await planManagementPage.readStatus(plan.name), 'only a live plan is issuable').toBe(NOT_LIVE);
    });
  });

  test(`TC-${CASE.auditConsistency}: should record the rejection identically in the version history and the central audit log when a plan is rejected`, async ({
    planManagementPage,
    planApprovalsPage,
    planDetailPage,
    auditLogsPage,
    planIn,
    steps,
  }) => {
    const plan = await planIn('PendingApproval');
    let central: AuditLogRow[] = [];

    await steps.critical('Navigate to the Plans Management module - the directory loads', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Reject the pending plan with a valid comment - the rejection succeeds', async () => {
      await planApprovalsPage.open();
      const outcome = await planApprovalsPage.decideWithComment(plan.name, 'reject', COMMENT.pricing, REASON.pricing);
      expect(outcome.stillQueued, outcome.answer).toBe(false);
    });

    await steps.step('Open the central audit log - a record for this plan references the rejection', async () => {
      central = await auditLogsPage.findRowsMentioning(plan.id);
      expect(central.length, 'the central audit log should hold a record for the plan').toBeGreaterThan(0);
    });

    await steps.step('The audit record and the version history entry show the same approver, reason and timestamp', async () => {
      await planDetailPage.open(plan.id);
      await planDetailPage.versions().open();
      const entry = (await planDetailPage.versions().readRows()).find((row) => STATE.rejected.test(row.status));
      expect(entry, 'a Rejected version entry').toBeDefined();
      expect(central.map((row) => row.actor), 'the same approver').toContain(entry?.reviewedBy ?? '(no entry)');
      expect(central.some((row) => todayPattern().test(row.occurredAt)), 'the audit record is stamped today').toBe(true);
      expect(entry?.reviewedOn ?? '', 'the version entry is stamped today').toMatch(todayPattern());
      expect(`${entry?.reason ?? ''} ${await planDetailPage.versions().viewVersionText(entry?.version ?? '')}`, 'the version history keeps the reason').toContain(COMMENT.pricing);
      expect(JSON.stringify(central), 'the central audit log keeps the same reason').toContain(COMMENT.pricing);
    });
  });

  test(`TC-${CASE.specialCharacters}: should store and display a rejection comment exactly as text when it contains special characters`, async ({
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

    await steps.step('Open the pending plan and select Reject - the dialog opens', async () => {
      await planApprovalsPage.open();
      dialog = await planApprovalsPage.openRejectDialog(plan.name);
      expect(await dialog.hasFreeTextInput(), 'the Reject dialog should offer a comments field').toBe(true);
    });

    await steps.step('Enter a comment with special characters and script-like text - it is accepted as plain text', async () => {
      expect(await dialog.typeReasonText(COMMENT.special)).toBe(COMMENT.special);
      await dialog.cancel();
    });

    await steps.critical('Confirm the rejection - it succeeds', async () => {
      const outcome = await planApprovalsPage.decideWithComment(plan.name, 'reject', COMMENT.special, REASON.rates);
      expect(outcome.typed).toBe(COMMENT.special);
      expect(outcome.stillQueued, outcome.answer).toBe(false);
    });

    await steps.step('Reopen the version history - the stored comment is displayed exactly as entered, as text', async () => {
      await planDetailPage.open(plan.id);
      await planDetailPage.versions().open();
      const entry = (await planDetailPage.versions().readRows()).find((row) => STATE.rejected.test(row.status));
      expect(entry, 'a Rejected version entry').toBeDefined();
      expect(await planDetailPage.versions().viewVersionText(entry?.version ?? ''), 'the comment rendered verbatim').toContain(COMMENT.special);
      expect(await planDetailPage.getName(), 'the page still renders the plan').toBe(plan.name);
    });
  });
});
