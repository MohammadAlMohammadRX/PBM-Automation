import { test, expect } from '../../../fixtures';
import type { PlanFormDialog } from '../../../pages/plan/PlanFormDialog';
import { PLAN_APPROVAL_CELL, PLAN_LIFECYCLE, PLAN_MESSAGE } from '../../../data/plans/plan.data';
import {
  ALREADY_PENDING,
  CONFLICT,
  EDIT,
  EDIT_PLAN,
  LIVE_PLAN,
  NON_ADMIN_VISIBLE_PLAN,
  ORIGINAL_DESCRIPTION,
} from '../../../data/plans/editPlanAttributes.data';

/**
 * User story 14146: Edit a plan's attributes through the approval workflow.
 * The edit's maker-checker life: a private draft, the live plan untouched,
 * Send for Approval (one pending change at a time, a formulary first), the
 * directory refresh, the concurrency stamp and who may edit.
 *
 * 18963 (the reviewer is notified of a submitted draft) is tested manually:
 * notification cases are Manual (QA lead, 2026-10-27).
 * Twin: tests/network/11-edit-existing-network-details (edit-approval).
 */
test.describe('US 14146 - Plan edits through approval', () => {
  test(`TC-${EDIT.liveUnchanged.azureId}: should show no Edit on an Active plan and keep its live values unchanged when the plan is opened`, async ({
    planManagementPage,
    planDetailPage,
    planIn,
    staleSession,
    steps,
  }) => {
    test.setTimeout(12 * 60_000);
    const plan = await planIn('Active', LIVE_PLAN);

    await steps.critical('Navigate to the Plans Management module - the plan directory loads', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.readStatus(plan.name)).toBe(PLAN_LIFECYCLE.active);
    });

    await steps.step('The Active plan\'s row shows no Edit action', async () => {
      await planManagementPage.search(plan.name);
      expect(await planManagementPage.getRowActionAvailability(plan.name, 'edit'), 'an Active plan is not edited').toBe(EDIT.liveUnchanged.editShown);
    });

    await steps.step('The Active plan\'s detail header shows no Edit action', async () => {
      await planDetailPage.open(plan.id);
      expect(await planDetailPage.getActionAvailability('edit'), 'an Active plan is not edited').toBe(EDIT.liveUnchanged.editShown);
    });

    await steps.step('Seen by another session, the live plan still shows its original values', async () => {
      await staleSession.planDetail.open(plan.id);
      expect(await staleSession.planDetail.readOverviewField('description'), 'the live plan must not change').toBe(ORIGINAL_DESCRIPTION);
    });
  });

  test(`TC-${EDIT.concurrentSessions.azureId}: should block the stale save with a concurrency conflict when two sessions edit the same plan`, async ({
    planManagementPage,
    planIn,
    staleSession,
    steps,
  }) => {
    test.setTimeout(8 * 60_000);
    const plan = await planIn('Draft', EDIT_PLAN);
    const sessionAValue = EDIT.concurrentSessions.sessionA();
    let stampOpened = '';
    let formA!: PlanFormDialog;

    await steps.critical('Navigate to the Plans Management module in both sessions - the plan directory loads', async () => {
      await planManagementPage.openListFor(plan.payerName);
      await staleSession.plans.openListFor(plan.payerName);
      expect(await staleSession.plans.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Both sessions open the plan for editing - the same version and concurrency stamp', async () => {
      stampOpened = String((await planManagementPage.readPlanRecord(plan.id)).concurrencyStamp ?? '');
      const formB = await staleSession.plans.openEditForm(plan.name);
      formA = await planManagementPage.openEditForm(plan.name);
      expect(stampOpened, 'GetPlan should hand the drawer a concurrency stamp').not.toBe('');
      expect(await formB.readField('descriptionEn')).toBe(await formA.readField('descriptionEn'));
    });

    await steps.critical('Session A saves a change - accepted, and the concurrency stamp updates', async () => {
      await formA.editField('descriptionEn', sessionAValue);
      const report = await formA.saveEditAndReport();
      expect(report.outcome?.status ?? 0, `session A should save: ${report.text}`).toBeLessThan(300);
      expect(String((await planManagementPage.readPlanRecord(plan.id)).concurrencyStamp ?? ''), 'a save should issue a new stamp').not.toBe(stampOpened);
    });

    await steps.step('Session B\'s save of a different field is blocked with a conflict instead of overwriting session A', async () => {
      const formB = staleSession.plans.editForm();
      await formB.editField('nameAr', EDIT.concurrentSessions.sessionBNameAr);
      const report = await formB.saveEditAndReport();
      expect(report.outcome?.status, `the stale save must be refused: ${report.text}`).toBe(CONFLICT.status);
      expect(report.messages.join(' | '), 'the user should be told the plan changed').toMatch(CONFLICT.message);
      expect((await planManagementPage.readPlanRecord(plan.id)).descriptionEn, 'session A\'s change survives').toBe(sessionAValue);
    });
  });

  test(`TC-${EDIT.formularyRequired.azureId}: should refuse to send the draft for approval when no formulary is assigned`, async ({
    planManagementPage,
    planIn,
    steps,
  }) => {
    const plan = await planIn('Draft', { ...EDIT_PLAN, noFormulary: true });

    await steps.critical('Navigate to the Plans Management module - the plan directory loads', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.step('The draft, edited with no formulary assigned, saves', async () => {
      const report = await planManagementPage.stageEdit(plan.name, 'descriptionEn', EDIT.formularyRequired.description());
      expect(report.created, `the draft should save without a formulary: ${report.text}`).toBe(true);
    });

    await steps.step('Send for Approval is not accepted and the plan does not move to Pending Approval without a formulary', async () => {
      await planManagementPage.openListFor(plan.payerName);
      const result = await planManagementPage.attemptSubmit(plan.name);
      expect(result.offered !== 'available' || result.status >= 300, `submission without a formulary must be refused: ${result.status} ${result.text.slice(0, 200)}`).toBe(true);
      expect((await planManagementPage.readRow(plan.name)).approvalStatus).not.toMatch(PLAN_APPROVAL_CELL.pendingApproval);
    });
  });

  test(`TC-${EDIT.directoryRefresh.azureId}: should show the plan as Pending and raise the Pending KPI by one when the change has just been submitted`, async ({
    planManagementPage,
    planIn,
    steps,
  }) => {
    test.setTimeout(8 * 60_000);
    const plan = await planIn('Draft', EDIT_PLAN);
    let pendingBefore = 0;

    await steps.critical('Navigate to the Plans Management module - the directory shows the plan\'s status and the KPI counts', async () => {
      await planManagementPage.openListFor(plan.payerName);
      // Settled: right after the payer switch the tiles still show the previous
      // scope's counts - the re-run read 44 here against 36 after (2026-10-28).
      pendingBefore = await planManagementPage.getSettledKpiValue('pending');
      expect(await planManagementPage.readStatus(plan.name)).not.toBe('');
    });

    await steps.critical('The plan\'s edit is completed and sent for approval - a success message confirms it', async () => {
      const report = await planManagementPage.stageEdit(plan.name, 'descriptionEn', EDIT.directoryRefresh.description());
      expect(report.created, report.text).toBe(true);
      await planManagementPage.openListFor(plan.payerName);
      const result = await planManagementPage.attemptSubmit(plan.name);
      expect(result.status, `SubmitPlanForApproval: ${result.text.slice(0, 200)}`).toBeLessThan(300);
      expect(result.messages.join(' | '), 'a success message').toMatch(PLAN_MESSAGE.submittedShown);
    });

    await steps.step('Back on the directory, without a manual refresh, the plan reads Pending and the Pending KPI rose by one', async () => {
      await expect
        .poll(() => planManagementPage.getSettledKpiValue('pending'), { message: 'the Pending KPI should count the submitted plan', timeout: 30_000 })
        .toBe(pendingBefore + 1);
      expect(await planManagementPage.readStatus(plan.name), 'the plan\'s status badge').toBe(PLAN_LIFECYCLE.pending);
    });
  });

  test(`TC-${EDIT.editRole.azureId}: should offer Edit only to a role holding the plan edit right when users with and without that right open the plan`, async ({
    planManagementPage,
    planIn,
    shapedNonAdmin,
    requireBaseline,
    steps,
  }) => {
    const plan = await planIn('Draft', NON_ADMIN_VISIBLE_PLAN);

    await steps.critical('Navigate to the module as a user without the Plan Administrator right - Edit is unavailable or access is denied', async () => {
      await planManagementPage.openListFor(plan.payerName);
      const held = await planManagementPage.getActionAvailabilityIfListed(plan.name, 'edit');
      requireBaseline(held === 'available', 'the Edit action for a session holding UpdatePlan');
      const session = await shapedNonAdmin({ without: ['editPlan', 'submitPlan'] });
      await session.plans.openListFor(plan.payerName);
      expect(await session.plans.getActionAvailabilityIfListed(plan.name, 'edit'), 'Edit must be hidden, disabled or the plan out of reach').not.toBe('available');
    });

    await steps.step('A Plan Administrator is offered Edit on the same Draft plan and the form opens normally', async () => {
      await planManagementPage.openListFor(plan.payerName);
      const form = await planManagementPage.openEditForm(plan.name);
      expect(await form.readField('nameEn')).toBe(plan.name);
      await form.closeAndDiscard();
    });
  });
});
