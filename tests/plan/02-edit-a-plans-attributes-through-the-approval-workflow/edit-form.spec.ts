import { test, expect } from '../../../fixtures';
import type { PlanFormDialog } from '../../../pages/plan/PlanFormDialog';
import { PLAN_FIELD } from '../../../pages/plan/PlanFormDialog';
import type { ProvisionedPlan } from '../../../utils/PlanProvisioning';
import {
  EDIT,
  EDIT_PLAN,
  PAST_EFFECTIVE_DRAFT,
  PLAN_FORM_MESSAGE,
  PLAN_NAME_MAX,
  pickerIsPast,
} from '../../../data/plans/editPlanAttributes.data';

/**
 * User story 14146: Edit a plan's attributes through the approval workflow.
 * The edit FORM: which plans it opens for, the period rules it enforces on an
 * edit (mandatory expiry strictly after the effective date, a moved effective
 * date today or later, an untouched past one left alone), the name rules and
 * the unsaved-changes guard.
 * Twin: tests/network/11-edit-existing-network-details (edit-form).
 */
test.describe('US 14146 - Plan edit form', () => {
  test(`TC-${EDIT.editableStates.azureId}: should open the edit form when the plan is Not Live, pending its first approval or Rejected`, async ({
    planManagementPage,
    planIn,
    steps,
  }) => {
    test.setTimeout(15 * 60_000);
    const plans: { label: string; plan: ProvisionedPlan }[] = [];
    for (const entry of EDIT.editableStates.states) plans.push({ label: entry.label, plan: await planIn(entry.state, EDIT_PLAN) });

    await steps.critical('Navigate to the Plans Management module - the plan directory loads', async () => {
      await planManagementPage.openListFor(plans[0].plan.payerName);
      expect(await planManagementPage.isListed(plans[0].plan.name)).toBe(true);
    });

    for (const { label, plan } of plans) {
      await steps.step(`The plan in ${label} status opens its edit form`, async () => {
        await planManagementPage.openListFor(plan.payerName);
        const form = await planManagementPage.openEditForm(plan.name);
        expect(await form.readField('nameEn'), `the edit form of the ${label} plan should open on it`).toBe(plan.name);
        await form.closeAndDiscard();
      });
    }
  });

  test(`TC-${EDIT.oneDayExpiry.azureId}: should save the draft when the expiry date is exactly one day after the effective date`, async ({
    planManagementPage,
    planIn,
    steps,
  }) => {
    const plan = await planIn('Draft', EDIT_PLAN);
    let form!: PlanFormDialog;

    await steps.critical('Navigate to the Plans Management module - the plan directory loads', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Open the Draft plan for editing - the edit form opens', async () => {
      form = await planManagementPage.openEditForm(plan.name);
      expect(await form.readField('nameEn')).toBe(plan.name);
    });

    await steps.step('A one-day period saves the draft with no validation error', async () => {
      const expiry = EDIT.oneDayExpiry.expiryDate();
      await form.editPeriod(EDIT.oneDayExpiry.effectiveDate(), expiry);
      expect(await form.readField('expiryDate')).toBe(expiry);
      const report = await form.attemptEditSave();
      expect(report.created, `the minimum one-day period must be accepted: ${report.text}`).toBe(true);
      expect(report.messages.join(' | ')).not.toMatch(PLAN_FORM_MESSAGE.expiryAfterEffective);
    });
  });

  test(`TC-${EDIT.blankExpiry.azureId}: should block the save with a mandatory-field error when the expiry date is cleared`, async ({
    planManagementPage,
    planIn,
    steps,
  }) => {
    const plan = await planIn('Draft', EDIT_PLAN);
    let form!: PlanFormDialog;

    await steps.critical('Navigate to the Plans Management module - the plan directory loads', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Open the Draft plan for editing - the edit form opens with an Expiry Date', async () => {
      form = await planManagementPage.openEditForm(plan.name);
      expect(await form.readField('expiryDate')).not.toBe('');
    });

    await steps.step('With the Expiry Date cleared, a mandatory-field error is shown and the save is blocked', async () => {
      await form.goToStepContaining(PLAN_FIELD.expiryDate);
      await form.clearField(PLAN_FIELD.expiryDate);
      const report = await form.attemptEditSave();
      const inline = await form.readFieldError('expiryDate');
      expect(report.refused, `an open-ended plan must not save: ${report.text}`).toBe(true);
      expect([inline, ...report.messages].join(' | '), 'the Expiry Date must be flagged as mandatory').toMatch(PLAN_FORM_MESSAGE.required);
      await form.closeAndDiscard();
    });
  });

  test(`TC-${EDIT.untouchedPastEffective.azureId}: should save an unrelated change without a date error when the past effective date is left unchanged`, async ({
    planManagementPage,
    planIn,
    steps,
  }) => {
    test.setTimeout(8 * 60_000);
    const plan = await planIn('Draft', PAST_EFFECTIVE_DRAFT);
    const description = EDIT.untouchedPastEffective.description();
    let form!: PlanFormDialog;

    await steps.critical('Navigate to the Plans Management module - the plan directory loads', async () => {
      await planManagementPage.waitForEffectiveToPass(plan.id);
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Open the Draft plan for editing - the existing past Effective Date is shown', async () => {
      form = await planManagementPage.openEditForm(plan.name);
      const effective = await form.readField('effectiveDate');
      expect(pickerIsPast(effective), `the stored effective date "${effective}" should now be in the past`).toBe(true);
    });

    await steps.step('Changing only the description saves the draft with no date validation error', async () => {
      await form.editField('descriptionEn', description);
      const report = await form.attemptEditSave();
      expect(report.created, `an untouched past effective date must not block the save: ${report.text}`).toBe(true);
      expect(report.messages.join(' | ')).not.toMatch(PLAN_FORM_MESSAGE.effectiveNotPast);
    });
  });

  test(`TC-${EDIT.movedPastEffective.azureId}: should block the save with a today-or-later error when the effective date is moved to yesterday`, async ({
    planManagementPage,
    planIn,
    steps,
  }) => {
    const plan = await planIn('Draft', EDIT_PLAN);
    const yesterday = EDIT.movedPastEffective.effectiveDate();
    let form!: PlanFormDialog;

    await steps.critical('Navigate to the Plans Management module - the plan directory loads', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Open the Draft plan for editing - the edit form opens', async () => {
      form = await planManagementPage.openEditForm(plan.name);
      expect(await form.readField('effectiveDate')).not.toBe('');
    });

    await steps.step('Yesterday as the Effective Date is refused with a today-or-later error and the save is blocked', async () => {
      await form.editField('effectiveDate', yesterday);
      expect(await form.readField('effectiveDate')).toBe(yesterday);
      const report = await form.attemptEditSave();
      const inline = await form.readFieldError('effectiveDate');
      expect(report.refused, `a moved effective date in the past must not save: ${report.text}`).toBe(true);
      expect([...report.messages, inline].join(' | ')).toMatch(PLAN_FORM_MESSAGE.effectiveNotPast);
      await form.closeAndDiscard();
    });
  });

  test(`TC-${EDIT.rulesEnforced.azureId}: should enforce the uniqueness, length and script rules when an edited draft is saved`, async ({
    planManagementPage,
    planIn,
    steps,
  }) => {
    test.setTimeout(15 * 60_000);
    const existing = await planIn('Active', { nameEn: EDIT.rulesEnforced.existingName() });
    const plan = await planIn('Draft', EDIT_PLAN);
    const validName = EDIT.rulesEnforced.validName();

    await steps.critical('Navigate to the Plans Management module - the plan directory loads', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(existing.name), 'the existing namesake is listed').toBe(true);
    });

    await steps.step('Another plan\'s existing name is refused with a uniqueness error', async () => {
      const form = await planManagementPage.reopenEditForm(plan.name, plan.payerName);
      await form.editField('nameEn', existing.name);
      const report = await form.attemptEditSave();
      expect(report.refused, `a duplicate name must not save: ${report.text}`).toBe(true);
      expect([...report.messages, await form.readFieldError('nameEn')].join(' | ')).toMatch(PLAN_FORM_MESSAGE.duplicateName);
      await form.closeAndDiscard();
    });

    await steps.step('A name over the maximum length is blocked by a length error, or the field never holds more than the maximum', async () => {
      const form = await planManagementPage.reopenEditForm(plan.name, plan.payerName);
      const held = await form.insertInto('nameEn', EDIT.rulesEnforced.oversized());
      const report = await form.attemptEditSave();
      expect(held.length <= PLAN_NAME_MAX || report.refused, `held ${held.length} characters; ${report.text}`).toBe(true);
      expect((await planManagementPage.readPlanRecord(plan.id)).planNameEn.length, 'no over-limit name may be stored').toBeLessThanOrEqual(PLAN_NAME_MAX);
      await form.closeAndDiscard();
    });

    await steps.step('Arabic script in the English name is refused with a script error', async () => {
      const form = await planManagementPage.reopenEditForm(plan.name, plan.payerName);
      await form.editField('nameEn', EDIT.rulesEnforced.arabicInEnglish);
      const report = await form.attemptEditSave();
      expect(report.refused, `Arabic script in the English name must not save: ${report.text}`).toBe(true);
      expect([...report.messages, await form.readFieldError('nameEn')].join(' | ')).toMatch(PLAN_FORM_MESSAGE.englishOnly);
      await form.closeAndDiscard();
    });

    await steps.step('A valid, unique, properly scripted name saves the draft', async () => {
      const form = await planManagementPage.reopenEditForm(plan.name, plan.payerName);
      await form.editField('nameEn', validName);
      const report = await form.attemptEditSave();
      expect(report.created, `the corrected name should save: ${report.text}`).toBe(true);
      expect((await planManagementPage.readPlanRecord(plan.id)).planNameEn).toBe(validName);
    });
  });

  test(`TC-${EDIT.unsavedGuard.azureId}: should warn about unsaved changes and keep them when the user cancels leaving the edit form`, async ({
    planManagementPage,
    planIn,
    steps,
  }) => {
    const plan = await planIn('Draft', EDIT_PLAN);
    const unsaved = EDIT.unsavedGuard.description();
    let form!: PlanFormDialog;

    await steps.critical('Navigate to the Plans Management module - the plan directory loads', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Open the Draft plan for editing and change a field without saving - the field shows the change', async () => {
      form = await planManagementPage.openEditForm(plan.name);
      await form.editField('descriptionEn', unsaved);
      expect(await form.readField('descriptionEn')).toBe(unsaved);
    });

    await steps.critical('Closing the form raises a prompt warning that unsaved changes will be lost', async () => {
      expect(await form.requestClose('close-button'), 'closing a dirty edit form must raise the unsaved-changes guard').toBe(true);
    });

    await steps.step('Cancelling the prompt keeps the administrator on the edit form with the change intact', async () => {
      await form.answerGuard('stay');
      expect(await form.isOpen(), 'the edit form should still be open').toBe(true);
      expect(await form.readField('descriptionEn')).toBe(unsaved);
      await form.closeAndDiscard();
    });
  });
});
