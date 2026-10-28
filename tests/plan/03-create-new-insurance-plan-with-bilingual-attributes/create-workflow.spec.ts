import { test, expect } from '../../../fixtures';
import type { PlanFormDialog, SaveReport } from '../../../pages/plan/PlanFormDialog';
import { PERMANENT_PLAN_CODE, PLAN_APPROVAL_CELL, PROVISIONAL_PLAN_CODE } from '../../../data/plans/plan.data';
import { NON_ADMIN_PROFILE } from '../../../data/accounts/nonAdminAccount.data';
import {
  ANY_PLAN_CODE,
  CREATE,
  DRAFT_VERSION_ONE,
  PLAN_FORM_MESSAGE,
  STEP_ONE_FIELDS,
  STEP_TWO_FIELDS,
  VERSION_ONE,
} from '../../../data/plans/createPlan.data';

/**
 * User story 14147: Create new insurance plan with bilingual attributes.
 * The creation WORKFLOW - the two steps, what a created plan is (Draft,
 * version one, its code), the period-based name check and who may create.
 * Twins: tests/network/05-register-a-new-network-with-bilingual-information,
 * 10-specify-network-type-and-effective-period.
 */
test.describe('US 14147 - Plan creation workflow', () => {
  test(`TC-${CREATE.twoStep.azureId}: should create a Draft plan through the basic info and effective period steps when every value is valid`, async ({
    planManagementPage,
    steps,
    cleanup,
  }) => {
    const data = CREATE.twoStep.build();
    let form!: PlanFormDialog;
    let report!: SaveReport;

    await steps.critical('Navigate to the Plans Management module - the plan directory loads', async () => {
      await planManagementPage.openListFor(data.payer);
      expect(await planManagementPage.isAddOffered(), 'Create New Plan should be offered').toBe(true);
    });

    await steps.critical('Create New Plan opens step one, asking for the names, type, payer and descriptions', async () => {
      form = await planManagementPage.openAddForm();
      expect(await form.currentStep()).toBe(1);
      expect(await form.getStepFields()).toEqual(expect.arrayContaining([...STEP_ONE_FIELDS]));
    });

    await steps.critical('Valid step-one values lead on to step two, asking for the Effective and Expiry Dates', async () => {
      await form.fillBasicInformation(data);
      await form.next();
      expect(await form.currentStep(), 'the wizard should move to Effective Period').toBe(2);
      expect(await form.getStepFields()).toEqual(expect.arrayContaining([...STEP_TWO_FIELDS]));
    });

    await steps.step('Valid dates submit - the plan is created, confirmed and listed as a new Draft', async () => {
      await form.fillEffectivePeriod(data);
      report = await form.saveNewAndReport();
      cleanup.register(() => form.discardCreated(report.outcome));
      expect(report.created, `the plan should be created: ${report.text}`).toBe(true);
      expect(report.messages.join(' | '), 'a confirmation message').toMatch(PLAN_FORM_MESSAGE.savedAsDraftShown);
      expect((await planManagementPage.readRow(data.nameEn)).approvalStatus).toMatch(PLAN_APPROVAL_CELL.draft);
    });
  });

  test(`TC-${CREATE.codeAtApproval.azureId}: should issue the permanent Plan Code at the first approval when a newly created draft is approved`, async ({
    planManagementPage,
    planApprovalsPage,
    planFormulary,
    steps,
    cleanup,
  }) => {
    test.setTimeout(15 * 60_000);
    const data = CREATE.codeAtApproval.build();
    const formulary = await planFormulary();
    let draftCode = '';

    await steps.critical('Navigate to the Plans Management module - the plan directory loads', async () => {
      await planManagementPage.openListFor(data.payer);
      expect(await planManagementPage.isAddOffered()).toBe(true);
    });

    await steps.critical('A new plan is created as Draft Version 1 carrying only a provisional code', async () => {
      const form = await planManagementPage.openAddForm();
      await form.fill(data);
      const report = await form.saveNewAndReport();
      cleanup.register(() => form.discardCreated(report.outcome));
      expect(report.created, report.text).toBe(true);
      const row = await planManagementPage.readRow(data.nameEn);
      draftCode = row.code;
      expect(row.approvalStatus, 'the new plan should be Draft version 1').toMatch(DRAFT_VERSION_ONE);
      expect(draftCode, 'a draft must not consume a permanent Plan Code').toMatch(PROVISIONAL_PLAN_CODE);
    });

    await steps.step('Once submitted and approved, a permanent Plan Code is displayed on the plan', async () => {
      const assigned = await planManagementPage.assignFormularyThroughDetail(data.nameEn, String(formulary.formularyCode));
      expect(assigned?.status ?? 0, `the formulary should be assigned: ${assigned?.text.slice(0, 200)}`).toBeLessThan(300);
      await planManagementPage.openListFor(data.payer);
      await planManagementPage.submitForApproval(data.nameEn);
      await planApprovalsPage.open();
      await planApprovalsPage.approve(data.nameEn);
      await planManagementPage.openListFor(data.payer);
      expect(await planManagementPage.readCode(data.nameEn), 'the code issued at the first approval').toMatch(PERMANENT_PLAN_CODE);
    });
  });

  test(`TC-${CREATE.codeAndVersionOne.azureId}: should give a new plan a unique Plan Code and store it as Draft version one when it is created`, async ({
    planManagementPage,
    planDetailPage,
    steps,
    cleanup,
  }) => {
    const data = CREATE.codeAndVersionOne.build();
    let planId = '';
    let code = '';

    await steps.critical('Navigate to the Plans Management module - the plan directory loads', async () => {
      await planManagementPage.openListFor(data.payer);
      expect(await planManagementPage.isAddOffered()).toBe(true);
    });

    await steps.critical('Creating a valid plan gives it a unique Plan Code at once', async () => {
      const form = await planManagementPage.openAddForm();
      await form.fill(data);
      const report = await form.saveNewAndReport();
      cleanup.register(() => form.discardCreated(report.outcome));
      expect(report.created, report.text).toBe(true);
      planId = form.createdId(report.outcome);
      code = await planManagementPage.readCode(data.nameEn);
      expect(code, 'a Plan Code should be generated at creation').toMatch(ANY_PLAN_CODE);
      await planManagementPage.search(code);
      expect((await planManagementPage.getPlanRows()).length, `"${code}" should belong to this plan only`).toBe(1);
    });

    await steps.step('The new plan\'s details show status Draft and Version 1', async () => {
      await planDetailPage.open(planId);
      const header = `${await planDetailPage.getStatus()} ${await planDetailPage.getVersionBadge()}`;
      expect(header, 'the detail header should say Draft').toMatch(PLAN_APPROVAL_CELL.draft);
      expect(await planDetailPage.getVersionBadge(), 'the plan should be stored as version 1').toMatch(VERSION_ONE);
    });
  });

  test(`TC-${CREATE.duplicateInPeriod.azureId}: should refuse a duplicate English name inside the existing plan's period and accept it when the new period starts after it`, async ({
    planManagementPage,
    planIn,
    steps,
    cleanup,
  }) => {
    test.setTimeout(15 * 60_000);
    const existing = await planIn('Active', {
      nameEn: CREATE.duplicateInPeriod.existingName(),
      expiryInMinutes: CREATE.duplicateInPeriod.existingExpiryInMinutes,
    });
    const data = CREATE.duplicateInPeriod.overlapping(existing.name);
    let form!: PlanFormDialog;
    let refused!: SaveReport;

    await steps.critical('Navigate to the Plans Management module - the plan directory loads', async () => {
      await planManagementPage.openListFor(existing.payerName);
      expect(await planManagementPage.isListed(existing.name), 'the existing namesake is listed').toBe(true);
    });

    await steps.critical('The existing name, within the existing plan\'s period, is accepted as text for now', async () => {
      form = await planManagementPage.openAddForm();
      await form.fill(data);
      expect(await form.readField('nameEn')).toBe(existing.name);
    });

    await steps.step('Submitting the registration is blocked with a uniqueness error', async () => {
      refused = await form.saveNewAndReport();
      cleanup.register(() => form.discardCreated(refused.outcome));
      expect(refused.refused, `a duplicate name in an overlapping period must not be created: ${refused.text}`).toBe(true);
      expect(refused.messages.join(' | ')).toMatch(PLAN_FORM_MESSAGE.duplicateName);
    });

    await steps.step('With the effective date moved after the existing plan\'s period, no uniqueness error is shown and the plan is created', async () => {
      await form.fillEffectivePeriod({
        ...data,
        effectiveDate: CREATE.duplicateInPeriod.afterExisting.effectiveDate(),
        expiryDate: CREATE.duplicateInPeriod.afterExisting.expiryDate(),
      });
      const report = await form.saveNewAndReport();
      cleanup.register(() => form.discardCreated(report.outcome));
      expect(report.created, `a name free in the new period should be accepted: ${report.text}`).toBe(true);
      // The SERVER's answer, not every message on screen: step 3's refusal stays
      // shown on the name field, and the re-run read it as a fresh one (2026-10-28).
      expect(report.outcome?.text ?? '', 'the save should raise no uniqueness error').not.toMatch(PLAN_FORM_MESSAGE.duplicateName);
    });
  });

  for (const accepted of [
    { ...CREATE.oneDayGap, title: 'should create the plan as Draft Version 1 when the expiry date is exactly one day after the effective date', rule: 'a one-day period' },
    { ...CREATE.effectiveToday, title: 'should create the plan as Draft Version 1 when the effective date is today', rule: 'an effective date of today' },
  ]) {
    test(`TC-${accepted.azureId}: ${accepted.title}`, async ({
      planManagementPage,
      steps,
      cleanup,
    }) => {
      const data = accepted.build();
      let form!: PlanFormDialog;

      await steps.critical('Navigate to the Plans Management module - the plan directory loads', async () => {
        await planManagementPage.openListFor(data.payer);
        expect(await planManagementPage.isAddOffered()).toBe(true);
      });

      await steps.step(`Step one completed, ${accepted.rule} shows no date validation error`, async () => {
        form = await planManagementPage.openAddForm();
        await form.fill(data);
        expect(await form.readField('effectiveDate')).toBe(data.effectiveDate);
        expect(await form.readFieldError('effectiveDate'), 'effective date error').toBe('');
        expect(await form.readFieldError('expiryDate'), 'expiry date error').toBe('');
      });

      await steps.step('Submitting creates the plan as Draft Version 1', async () => {
        const report = await form.saveNewAndReport();
        cleanup.register(() => form.discardCreated(report.outcome));
        expect(report.created, `${accepted.rule} must be accepted: ${report.text}`).toBe(true);
        expect((await planManagementPage.readRow(data.nameEn)).approvalStatus).toMatch(DRAFT_VERSION_ONE);
      });
    });
  }

  test(`TC-${CREATE.createRole.azureId}: should offer Create New Plan only to a role holding the plan creation right when users with and without that right open the directory`, async ({
    planManagementPage,
    shapedNonAdmin,
    requireBaseline,
    steps,
  }) => {
    const payer = NON_ADMIN_PROFILE.scopedPayers[0];

    await steps.critical('A role without the plan creation right is not offered Create New Plan', async () => {
      await planManagementPage.openListFor(payer);
      const held = await planManagementPage.isAddOffered();
      requireBaseline(held, 'the Create New Plan action for a session holding CreatePlan');
      const session = await shapedNonAdmin({ without: ['createPlan'] });
      await session.plans.openListFor(payer);
      expect(await session.plans.isAddOffered(), 'Create New Plan must not be offered without CreatePlan').toBe(false);
    });

    await steps.step('A Plan Administrator is offered Create New Plan and it opens the two-step form', async () => {
      await planManagementPage.openListFor(payer);
      const form = await planManagementPage.openAddForm();
      expect(await form.currentStep()).toBe(1);
      expect(await form.getStepFields()).toEqual(expect.arrayContaining([...STEP_ONE_FIELDS]));
      await form.closeAndDiscard();
    });
  });
});
