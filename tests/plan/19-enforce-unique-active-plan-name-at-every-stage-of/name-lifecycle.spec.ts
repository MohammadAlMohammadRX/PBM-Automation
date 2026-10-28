import { test, expect } from '../../../fixtures';
import type { PlanFormDialog } from '../../../pages/plan/PlanFormDialog';
import { PLAN_APPROVAL_CELL, PLAN_LIFECYCLE } from '../../../data/plans/plan.data';
import {
  ACTIVE_WAIT_MS,
  APPROVED_ANSWER,
  BLOCKED_CASES,
  DUPLICATE_NAME,
  UNIQUE,
  newPlanNamed,
} from '../../../data/plans/uniqueActivePlanName.data';

/**
 * User story 14325: Enforce unique active plan name at every stage of a change.
 * A name's LIFE: a unique name goes all the way to Active; a name is free
 * again once its holder is Inactive or deleted (Expired is BLOCKED - see the
 * data file); and only one Active plan may ever hold it.
 *
 * A reused name is carried by TWO plans (the old holder and the new one), so
 * the new plan is driven on its detail screen by id, never by its list row.
 * Twin: tests/network/37-validate-network-naming-and-arabic-description-on-create-and-edit.
 */
test.describe('US 14325 - A plan name from draft to Active', () => {
  test(`TC-${UNIQUE.uniqueName.azureId}: should create, submit, approve and activate the plan with no duplicate-name error when its name is unique`, async ({
    planManagementPage,
    planDetailPage,
    planApprovalsPage,
    planFormulary,
    steps,
    cleanup,
  }) => {
    test.setTimeout(20 * 60_000);
    const data = newPlanNamed(UNIQUE.uniqueName.name());
    const formulary = await planFormulary();
    let form!: PlanFormDialog;
    let planId = '';

    await steps.critical('Navigate to the Plans Management module - the landing page is displayed', async () => {
      await planManagementPage.openListFor(data.payer);
      expect(await planManagementPage.isAddOffered()).toBe(true);
    });

    await steps.critical('Create New Plan opens a blank plan creation form', async () => {
      form = await planManagementPage.openAddForm();
      expect(await form.readField('nameEn')).toBe('');
    });

    await steps.critical('The unique name and the remaining mandatory fields show no validation warnings', async () => {
      await form.fill(data);
      expect(await form.readFieldError('nameEn'), 'name warning').toBe('');
      expect(await form.readFieldError('expiryDate'), 'period warning').toBe('');
    });

    await steps.critical('Saved as a draft, the plan is listed with status Draft', async () => {
      const report = await form.saveNewAndReport();
      cleanup.register(() => form.discardCreated(report.outcome));
      expect(report.created, report.text).toBe(true);
      planId = form.createdId(report.outcome);
      expect((await planManagementPage.readRow(data.nameEn)).approvalStatus).toMatch(PLAN_APPROVAL_CELL.draft);
    });

    await steps.critical('Submitted for approval, the plan moves to Pending Approval with no name-conflict warning', async () => {
      await planDetailPage.open(planId);
      const tab = planDetailPage.formulary();
      await tab.open();
      expect((await tab.assign(String(formulary.formularyCode)))?.status ?? 0, 'the formulary an approval needs').toBeLessThan(300);
      await planDetailPage.open(planId);
      const sent = await planDetailPage.attemptSubmit();
      expect(sent.status, `SubmitPlanForApproval: ${sent.offered} ${sent.text.slice(0, 200)}`).toBeLessThan(300);
      expect(sent.messages.join(' | '), 'no name-conflict warning').not.toMatch(DUPLICATE_NAME);
      await planManagementPage.expectApprovalCell(data.nameEn, PLAN_APPROVAL_CELL.pendingApproval);
    });

    await steps.step('Approved by an authorised approver, the plan turns Active and now reserves the name', async () => {
      await planManagementPage.waitForEffectiveToPass(planId);
      await planApprovalsPage.open();
      const decision = await planApprovalsPage.attemptApprove(data.nameEn);
      expect(decision.answer, 'the approval should be accepted').toMatch(APPROVED_ANSWER);
      await planDetailPage.open(planId);
      await planDetailPage.expectStatusEventually(PLAN_LIFECYCLE.active, ACTIVE_WAIT_MS);
    });
  });

  test(`TC-${UNIQUE.reuseInactive.azureId}: should accept the reused name and activate the new plan when its previous holder is Inactive`, async ({
    planManagementPage,
    planDetailPage,
    planApprovalsPage,
    planIn,
    planFormulary,
    steps,
    cleanup,
  }) => {
    test.setTimeout(30 * 60_000);
    const formulary = await planFormulary();
    const holder = await planIn('Inactive', { nameEn: UNIQUE.reuseInactive.name() });
    let form!: PlanFormDialog;

    await steps.critical('Navigate to the Plans Management module - the previous holder of the name is Inactive', async () => {
      await planManagementPage.openListFor(holder.payerName);
      await planDetailPage.open(holder.id);
      await planDetailPage.expectStatus(PLAN_LIFECYCLE.inactive);
    });

    await steps.critical('Create New Plan opens a blank plan creation form', async () => {
      await planManagementPage.openListFor(holder.payerName);
      form = await planManagementPage.openAddForm();
      expect(await form.readField('nameEn')).toBe('');
    });

    await steps.step('The reused name and the remaining mandatory fields raise no duplicate-name warning', async () => {
      await form.fill(newPlanNamed(holder.name));
      expect(await form.readField('nameEn')).toBe(holder.name);
      expect(await form.readFieldError('nameEn'), 'no duplicate-name warning').not.toMatch(DUPLICATE_NAME);
    });

    await steps.step('Saved as a draft, submitted and approved, the new plan reaches Active', async () => {
      const report = await form.saveNewAndReport();
      cleanup.register(() => form.discardCreated(report.outcome));
      expect(report.created, `a name held only by an Inactive plan should be accepted: ${report.text}`).toBe(true);
      const planId = form.createdId(report.outcome);
      await planDetailPage.open(planId);
      const tab = planDetailPage.formulary();
      await tab.open();
      expect((await tab.assign(String(formulary.formularyCode)))?.status ?? 0, 'the formulary an approval needs').toBeLessThan(300);
      await planDetailPage.open(planId);
      const sent = await planDetailPage.attemptSubmit();
      expect(sent.status, `SubmitPlanForApproval: ${sent.offered} ${sent.text.slice(0, 200)}`).toBeLessThan(300);
      await planManagementPage.waitForEffectiveToPass(planId);
      await planApprovalsPage.open();
      const decision = await planApprovalsPage.attemptApprove(holder.name);
      expect(decision.answer, 'the approval should be accepted').toMatch(APPROVED_ANSWER);
      await planDetailPage.open(planId);
      await planDetailPage.expectStatusEventually(PLAN_LIFECYCLE.active, ACTIVE_WAIT_MS);
    });
  });

  test(`TC-${UNIQUE.reuseDeleted.azureId}: should accept the reused name and activate the new plan when its previous holder was deleted`, async ({
    planManagementPage,
    planDetailPage,
    planApprovalsPage,
    planIn,
    planFormulary,
    steps,
    cleanup,
  }) => {
    test.setTimeout(30 * 60_000);
    const formulary = await planFormulary();
    const holder = await planIn('Active', { nameEn: UNIQUE.reuseDeleted.name() });
    let form!: PlanFormDialog;

    await steps.critical('Navigate to the Plans Management module - the previous holder of the name has been (soft-)deleted', async () => {
      await planDetailPage.open(holder.id);
      const deletion = await planDetailPage.requestDeletion();
      expect(deletion.status, `DeletePlan: ${deletion.text.slice(0, 200)}`).toBeLessThan(300);
      await planApprovalsPage.open();
      await planApprovalsPage.approve(holder.name);
      await planManagementPage.openListFor(holder.payerName);
      expect(await planManagementPage.isListed(holder.name), 'the deleted holder should leave the list').toBe(false);
    });

    await steps.critical('Create New Plan opens a blank plan creation form', async () => {
      form = await planManagementPage.openAddForm();
      expect(await form.readField('nameEn')).toBe('');
    });

    await steps.step('The reused name and the remaining mandatory fields raise no duplicate-name warning', async () => {
      await form.fill(newPlanNamed(holder.name));
      expect(await form.readField('nameEn')).toBe(holder.name);
      expect(await form.readFieldError('nameEn'), 'no duplicate-name warning').not.toMatch(DUPLICATE_NAME);
    });

    await steps.step('Saved as a draft, submitted and approved, the new plan reaches Active', async () => {
      const report = await form.saveNewAndReport();
      cleanup.register(() => form.discardCreated(report.outcome));
      expect(report.created, `a name held only by a deleted plan should be accepted: ${report.text}`).toBe(true);
      const planId = form.createdId(report.outcome);
      await planDetailPage.open(planId);
      const tab = planDetailPage.formulary();
      await tab.open();
      expect((await tab.assign(String(formulary.formularyCode)))?.status ?? 0, 'the formulary an approval needs').toBeLessThan(300);
      await planDetailPage.open(planId);
      const sent = await planDetailPage.attemptSubmit();
      expect(sent.status, `SubmitPlanForApproval: ${sent.offered} ${sent.text.slice(0, 200)}`).toBeLessThan(300);
      await planManagementPage.waitForEffectiveToPass(planId);
      await planApprovalsPage.open();
      const decision = await planApprovalsPage.attemptApprove(holder.name);
      expect(decision.answer, 'the approval should be accepted').toMatch(APPROVED_ANSWER);
      await planDetailPage.open(planId);
      await planDetailPage.expectStatusEventually(PLAN_LIFECYCLE.active, ACTIVE_WAIT_MS);
    });
  });

  test(`TC-${UNIQUE.onlyOneActive.azureId}: should stop a second plan from becoming Active when an Active plan already holds its name`, async ({
    planManagementPage,
    planIn,
    planFormulary,
    steps,
    cleanup,
  }) => {
    test.setTimeout(20 * 60_000);
    const holder = await planIn('Active', { nameEn: UNIQUE.onlyOneActive.name() });
    const formulary = await planFormulary();

    await steps.critical('Navigate to the Plans Management module - the landing page is displayed', async () => {
      await planManagementPage.openListFor(holder.payerName);
      expect(await planManagementPage.readStatus(holder.name)).toBe(PLAN_LIFECYCLE.active);
    });

    await steps.step('Creating and approving Plan C with the same name is blocked at the earliest stage with a duplicate-name error', async () => {
      const form = await planManagementPage.openAddForm();
      await form.fill(newPlanNamed(holder.name));
      const result = await planManagementPage.attemptAllStages(form, holder.name, String(formulary.formularyCode));
      cleanup.register(() => form.discardCreated(result.outcome));
      expect(result.refusedAt, 'Plan C must be refused at the draft, submit or approval stage').not.toBeNull();
      expect(result.text, `the refusal at the ${result.refusedAt} stage`).toMatch(DUPLICATE_NAME);
    });

    await steps.step('The Plans grid shows only Plan A as Active with that name', async () => {
      await planManagementPage.openListFor(holder.payerName);
      await planManagementPage.search(holder.name);
      const active = (await planManagementPage.getPlanRows()).filter((row) => row.name === holder.name && row.status === PLAN_LIFECYCLE.active);
      expect(active.length, 'exactly one Active plan may hold the name').toBe(1);
    });
  });

  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.azureId}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
