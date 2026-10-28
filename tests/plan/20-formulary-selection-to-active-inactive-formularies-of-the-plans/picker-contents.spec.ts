import { test, expect } from '../../../fixtures';
import { NetworkUtils } from '../../../utils/NetworkUtils';
import { formularyCode } from '../../../data/plans/assignPlanFormulary.data';
import {
  CASE,
  FEED_ERROR,
  FORMULARY_FEED,
  FORMULARY_FIELD,
  NO_FORMULARY_FOR_PAYER,
  OUTAGE_STATUS,
  PICKABLE_STATUSES,
  SUITE_PAYER,
  newPlanData,
} from '../../../data/plans/formularyPicker.data';

/**
 * User story 14326: Formulary selection to active/inactive formularies of the plan's payer.
 * What the formulary picker offers: only the plan payer's Active / Inactive
 * formularies, never a deleted one or another payer's - and how it behaves
 * when the payer has none or the formulary feed is down.
 *
 * Note (2026-10-27): the picker also offers Pending formularies the server then
 * refuses - 19198 asserts every offered status, so that shows there.
 */
test.describe('US 14326 - Formulary picker contents', () => {
  test.describe.configure({ timeout: 15 * 60_000 });

  test(`TC-${CASE.inactiveListedDeletedNot}: should offer the payer's Inactive formulary but not its deleted one when the picker opens`, async ({
    planManagementPage,
    planDetailPage,
    planIn,
    inactiveSuiteFormulary,
    deletedSuiteFormulary,
    steps,
  }) => {
    const inactive = await inactiveSuiteFormulary();
    const deleted = await deletedSuiteFormulary();
    const plan = await planIn('Draft', { noFormulary: true });
    const tab = planDetailPage.formulary();
    let offered: { code: string; statusCode: string; payerId: string }[] = [];

    await steps.critical('Navigate to the Plans Management module - the landing page is displayed', async () => {
      await planManagementPage.openListFor(SUITE_PAYER);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Open the plan and its formulary picker - the selectable formularies load', async () => {
      await planDetailPage.open(plan.id);
      await tab.open();
      offered = await tab.readOfferedFormularies();
      expect(offered.length, 'the picker should offer formularies').toBeGreaterThan(0);
    });

    await steps.step('Review the listed formularies - the Inactive F4 is selectable, the deleted F5 is not, and nothing else but Active / Inactive', async () => {
      const codes = offered.map((option) => option.code);
      expect(codes, 'the Inactive formulary of the payer').toContain(formularyCode(inactive));
      expect(codes, 'a deleted formulary must not be offered').not.toContain(formularyCode(deleted));
      const outside = offered.filter((option) => !(PICKABLE_STATUSES as readonly string[]).includes(option.statusCode));
      expect(outside, 'only Active / Inactive formularies may be offered').toEqual([]);
    });
  });

  test(`TC-${CASE.ownPayerOnly}: should offer only the plan payer's formularies when the picker opens`, async ({
    planManagementPage,
    planDetailPage,
    planIn,
    suitePayerFormularies,
    foreignFormulary,
    steps,
  }) => {
    const [first, second] = await suitePayerFormularies(2);
    const foreign = await foreignFormulary();
    const plan = await planIn('Draft', { noFormulary: true });
    const tab = planDetailPage.formulary();

    await steps.critical('Navigate to the Plans Management module - the landing page is displayed', async () => {
      await planManagementPage.openListFor(SUITE_PAYER);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Open the plan\'s formulary assignment section - the assignment screen is displayed', async () => {
      await planDetailPage.open(plan.id);
      await tab.open();
      expect(await tab.isPickerShown()).toBe(true);
    });

    await steps.step('Open the picker - only F1 and F2 of Payer X are offered, F3 of Payer Y is not', async () => {
      const offered = await tab.readOfferedFormularies();
      const codes = offered.map((option) => option.code);
      expect(codes).toEqual(expect.arrayContaining([formularyCode(first), formularyCode(second)]));
      expect(codes, 'another payer\'s formulary must not be offered').not.toContain(formularyCode(foreign));
      expect(offered.filter((option) => option.payerId !== first.payerId).map((option) => option.code), 'every option belongs to the plan payer').toEqual([]);
    });
  });

  test(`TC-${CASE.assignOnCreate}: should attach the chosen formulary and approve the plan end to end when it is picked while creating the plan`, async ({
    planManagementPage,
    planDetailPage,
    planFormulary,
    cleanup,
    steps,
  }) => {
    const formulary = await planFormulary();
    const data = newPlanData();
    const form = planManagementPage.editForm();
    const labels: string[] = [];

    await steps.critical('Navigate to the Plans Management module - the landing page is displayed', async () => {
      await planManagementPage.openListFor(SUITE_PAYER);
      expect(await planManagementPage.isAddOffered()).toBe(true);
    });

    await steps.critical('Begin creating Plan Q and select Payer X - the payer field is set', async () => {
      await planManagementPage.openAddForm();
      await form.fillBasicInformation(data);
      expect(await form.readField('payer')).toContain(SUITE_PAYER);
    });

    await steps.critical('Open the wizard\'s formulary picker and select F1 - F1 becomes the plan\'s formulary selection', async () => {
      labels.push(...(await form.getStepLabels()));
      await form.next();
      labels.push(...(await form.getStepLabels()));
      expect(labels.filter((label) => FORMULARY_FIELD.test(label)), `the wizard offers ${labels.join(', ')}`).not.toEqual([]);
    });

    await steps.step('Save, submit for approval and approve Plan Q - it becomes Active with F1', async () => {
      await form.fillEffectivePeriod(data);
      const report = await form.saveNewAndReport();
      cleanup.register(() => form.discardCreated(report.outcome));
      expect(report.created, `CreatePlan: ${report.text}`).toBe(true);
      expect(await planDetailPage.formulary().readAssignedFormularyIdViaApi(form.createdId(report.outcome)), 'the plan should carry F1').toBe(formulary.id);
    });
  });

  test(`TC-${CASE.emptyPayer}: should show an empty picker with a no-formulary message when the payer has no Active or Inactive formulary`, async ({
    publishedPayer,
    planDetailPage,
    planManagementPage,
    planIn,
    steps,
  }) => {
    const plan = await planIn('Draft', { payerName: publishedPayer.nameEn, noFormulary: true });
    const tab = planDetailPage.formulary();

    await steps.critical('Navigate to the Plans Management module - the landing page is displayed', async () => {
      await planManagementPage.openListFor(publishedPayer.nameEn);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Open Plan U and its formulary picker - the formularies of Payer Z are requested', async () => {
      await planDetailPage.open(plan.id);
      await tab.open();
      expect(await tab.isPickerShown(), 'the picker should render').toBe(true);
    });

    await steps.step('Review the picker - an empty list with a message that the payer has no formulary', async () => {
      expect(await tab.getOfferedFormularyCodes()).toEqual([]);
      expect(await tab.readPickerOverlayText(), 'the empty state should explain why').toMatch(NO_FORMULARY_FOR_PAYER);
    });
  });

  test(`TC-${CASE.serviceDown}: should show a clear error instead of a blank or broken screen when the formulary feed is unavailable`, async ({
    page,
    planManagementPage,
    planDetailPage,
    planIn,
    steps,
  }) => {
    const plan = await planIn('Draft', { noFormulary: true });
    const tab = planDetailPage.formulary();

    await steps.critical('Navigate to the Plans Management module - the landing page is displayed', async () => {
      await planManagementPage.openListFor(SUITE_PAYER);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Open Plan P and its formulary picker while the feed is down - the formularies are requested', async () => {
      await NetworkUtils.failEndpoint(page, FORMULARY_FEED, OUTAGE_STATUS);
      await planDetailPage.open(plan.id);
      await tab.open();
      expect(await tab.isPickerShown(), 'the tab should still render its picker').toBe(true);
    });

    await steps.step('Observe the picker - a clear error / timeout message, and the plan screen still works', async () => {
      expect((await tab.readMessages()).join(' | '), 'the user should be told the formularies could not be loaded').toMatch(FEED_ERROR);
      expect(await planDetailPage.getName(), 'the plan screen must not crash').toBe(plan.name);
      await NetworkUtils.restoreEndpoint(page, FORMULARY_FEED);
    });
  });
});
