import { test, expect } from '../../../fixtures';
import type { PlanFormDialog, SaveReport } from '../../../pages/plan/PlanFormDialog';
import { planFormData } from '../../../data/plans/plan.data';
import { CREATE, PLAN_FORM_MESSAGE } from '../../../data/plans/createPlan.data';

/**
 * User story 14147: Create new insurance plan with bilingual attributes.
 * The creation form's RULES - English / Arabic script, required basic info and
 * the effective-period rules (mandatory expiry strictly after the effective
 * date, effective today or later).
 * Twins: tests/network/05 (register-validation), 10 (period-validation),
 * 38 (past-date guard).
 */
test.describe('US 14147 - Plan creation rules', () => {
  for (const script of [
    {
      azureId: CREATE.englishScript.azureId,
      title: 'should block progression with a script error when the English name holds Arabic text',
      key: 'nameEn' as const,
      data: () => planFormData({ nameEn: CREATE.englishScript.invalidEnglishName }),
      message: PLAN_FORM_MESSAGE.englishOnly,
      label: 'English',
    },
    {
      azureId: CREATE.arabicScript.azureId,
      title: 'should block progression with a script error when the Arabic name holds English text',
      key: 'nameAr' as const,
      data: () => planFormData({ nameAr: CREATE.arabicScript.invalidArabicName }),
      message: PLAN_FORM_MESSAGE.arabicOnly,
      label: 'Arabic',
    },
  ]) {
    test(`TC-${script.azureId}: ${script.title}`, async ({
      planManagementPage,
      steps,
    }) => {
      const data = script.data();
      let form!: PlanFormDialog;

      await steps.critical('Navigate to the Plans Management module - the plan directory loads', async () => {
        await planManagementPage.openListFor(data.payer);
        expect(await planManagementPage.isAddOffered()).toBe(true);
      });

      await steps.step(`Text of the wrong script in the ${script.label} name shows a script validation error`, async () => {
        form = await planManagementPage.openAddForm();
        await form.fillBasicInformation(data);
        expect(await form.readField(script.key)).toBe(data[script.key]);
        expect(await form.readFieldError(script.key), `the ${script.label} name must flag the wrong script`).toMatch(script.message);
      });

      await steps.step(`Progression is blocked until the ${script.label} name holds ${script.label} script`, async () => {
        await form.next();
        expect(await form.currentStep(), 'the wizard must stay on Basic Information').toBe(1);
        expect(await form.readFieldError(script.key)).toMatch(script.message);
        await form.closeAndDiscard();
      });
    });
  }

  // 18982 (expiry on the effective date's own day) was removed as invalid, 2026-11-01.
  for (const period of [
    {
      azureId: CREATE.pastEffective.azureId,
      title: 'should block the submission with a today-or-later error when the effective date is earlier than today',
      build: CREATE.pastEffective.build,
      message: PLAN_FORM_MESSAGE.effectiveNotPast,
      rule: 'an effective date of yesterday',
    },
  ]) {
    test(`TC-${period.azureId}: ${period.title}`, async ({
      planManagementPage,
      steps,
      cleanup,
    }) => {
      const data = period.build();
      let form!: PlanFormDialog;
      let report!: SaveReport;

      await steps.critical('Navigate to the Plans Management module - the plan directory loads', async () => {
        await planManagementPage.openListFor(data.payer);
        expect(await planManagementPage.isAddOffered()).toBe(true);
      });

      await steps.step(`Step one completed, ${period.rule} on step two shows a validation error`, async () => {
        form = await planManagementPage.openAddForm();
        await form.fill(data);
        expect(await form.readField('effectiveDate')).toBe(data.effectiveDate);
        report = await form.saveNewAndReport();
        cleanup.register(() => form.discardCreated(report.outcome));
        // Inline errors only exist while the form is still open: an ACCEPTED
        // save closes it, and reading its fields then timed out on a form that
        // was gone, hiding the real result (18982 on the re-run, 2026-10-28).
        const inline = report.refused ? [await form.readFieldError('effectiveDate'), await form.readFieldError('expiryDate')] : [];
        expect([...report.messages, ...inline].join(' | '), `the message for ${period.rule}`).toMatch(period.message);
      });

      await steps.step('The submission is blocked and no plan is created', async () => {
        expect(report.refused, `${period.rule} must not be accepted: ${report.text}`).toBe(true);
        expect(await form.readCreated(report.outcome), 'no plan may have been stored').toBeNull();
        await form.closeAndDiscard();
      });
    });
  }

  test(`TC-${CREATE.blankExpiry.azureId}: should block the submission with a mandatory-field error when the expiry date is left blank`, async ({
    planManagementPage,
    steps,
    cleanup,
  }) => {
    const data = CREATE.blankExpiry.build();
    let form!: PlanFormDialog;
    let report!: SaveReport;

    await steps.critical('Navigate to the Plans Management module - the plan directory loads', async () => {
      await planManagementPage.openListFor(data.payer);
      expect(await planManagementPage.isAddOffered()).toBe(true);
    });

    await steps.step('Step one completed and the Expiry Date left blank, a mandatory-field error is shown', async () => {
      form = await planManagementPage.openAddForm();
      await form.fill(data, 'expiryDate');
      expect(await form.readField('expiryDate')).toBe('');
      report = await form.attemptNewSave();
      cleanup.register(() => form.discardCreated(report.outcome));
      expect([await form.readFieldError('expiryDate'), ...report.messages].join(' | '), 'the Expiry Date must be flagged as required')
        .toMatch(PLAN_FORM_MESSAGE.required);
    });

    await steps.step('The submission is blocked until an Expiry Date is provided', async () => {
      expect(report.refused, `an open-ended plan must not be created: ${report.text}`).toBe(true);
      expect(await form.readCreated(report.outcome)).toBeNull();
      await form.closeAndDiscard();
    });
  });

  test(`TC-${CREATE.missingPayer.azureId}: should keep the wizard on step one with a required error when no payer is chosen`, async ({
    planManagementPage,
    steps,
  }) => {
    const data = CREATE.missingPayer.build();
    let form!: PlanFormDialog;

    await steps.critical('Navigate to the Plans Management module - the plan directory loads', async () => {
      await planManagementPage.openListFor(data.payer);
      expect(await planManagementPage.isAddOffered()).toBe(true);
    });

    await steps.step('With the payer left blank, a required-field error is shown next to it', async () => {
      form = await planManagementPage.openAddForm();
      await form.fillBasicInformation(data, 'payer');
      await form.next();
      expect(await form.readFieldError('payer'), 'the Payer field must be flagged as required').toMatch(PLAN_FORM_MESSAGE.required);
    });

    await steps.step('Progression to step two is blocked', async () => {
      expect(await form.currentStep(), 'the wizard must stay on Basic Information').toBe(1);
    });

    await steps.step('With every required field filled, step two opens', async () => {
      await form.fillBasicInformation(data);
      await form.next();
      expect(await form.currentStep(), 'the wizard should reach Effective Period').toBe(2);
      await form.closeAndDiscard();
    });
  });
});
