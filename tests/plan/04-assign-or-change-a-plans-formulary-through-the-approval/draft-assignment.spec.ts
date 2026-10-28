import { test, expect } from '../../../fixtures';
import {
  BLOCKED_CASES,
  CASE,
  FORMULARY_NOT_FOUND,
  MISSING_FORMULARY_ID,
  PAYER_MISMATCH,
  REQUIRED_FORMULARY,
  SUITE_PAYER,
  formularyCode,
} from '../../../data/plans/assignPlanFormulary.data';

/**
 * User story 14148: Assign or change a plan's formulary through the approval workflow.
 * Assignment on a plan that is not live yet, the same-payer and existence
 * rules, the required picker - and clearing a formulary in every status.
 *
 * Every plan is the case's own (fixture `planIn`); see the data file for how
 * the sheet's PayerA / F-10 / PayerB map onto this environment.
 */
test.describe('US 14148 - Assigning a formulary', () => {
  test(`TC-${CASE.draftAssign}: should attach the formulary at once without an approval request when the plan is still a draft`, async ({
    planManagementPage,
    planDetailPage,
    planApprovalsPage,
    planIn,
    planFormulary,
    steps,
  }) => {
    const formulary = await planFormulary();
    const plan = await planIn('Draft', { noFormulary: true });
    const tab = planDetailPage.formulary();

    await steps.critical('Navigate to the Plans Management module - the plan list loads', async () => {
      await planManagementPage.openListFor(SUITE_PAYER);
      expect(await planManagementPage.isListed(plan.name), 'the draft plan should be listed').toBe(true);
    });

    await steps.critical('Open the Draft plan - its details show no formulary assigned', async () => {
      await planDetailPage.open(plan.id);
      await tab.open();
      expect(await tab.isPickerShown(), 'a plan without a formulary offers the picker').toBe(true);
      expect(await tab.readAssignedFormularyIdViaApi(plan.id), 'no formulary yet').toBe('');
    });

    await steps.critical('Select a formulary of the plan\'s payer and save - it is attached at once with no approval request', async () => {
      const answer = await tab.assign(formularyCode(formulary));
      expect(answer?.status, `AssignFormularyToPlan: ${answer?.text.slice(0, 200)}`).toBeLessThan(300);
      await planApprovalsPage.open();
      expect(await planApprovalsPage.isInQueue(plan.name), 'assigning on a draft must not raise an approval request').toBe(false);
    });

    await steps.step('Reopen the plan details - the assigned formulary shows as linked', async () => {
      await planDetailPage.open(plan.id);
      await tab.open();
      expect(await tab.readAssignedFormularyIdViaApi(plan.id), 'the plan should reference the formulary').toBe(formulary.id);
      expect(await tab.getPanelText(), 'the tab should show the formulary').toContain(formularyCode(formulary));
    });
  });

  test(`TC-${CASE.crossPayer}: should refuse the assignment with a payer-mismatch message when the formulary belongs to another payer`, async ({
    planManagementPage,
    planDetailPage,
    planIn,
    foreignFormulary,
    steps,
  }) => {
    const foreign = await foreignFormulary();
    const plan = await planIn('Draft', { noFormulary: true });
    const tab = planDetailPage.formulary();

    await steps.critical('Navigate to the Plans Management module - the plan list loads', async () => {
      await planManagementPage.openListFor(SUITE_PAYER);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Open the plan of Payer A - its details show Payer A', async () => {
      await planDetailPage.open(plan.id);
      await planDetailPage.openTab('overview');
      expect(await planDetailPage.readOverviewField('payer')).toBe(SUITE_PAYER);
    });

    await steps.step('Attempt to assign a formulary of Payer B and submit - it is blocked with a payer-mismatch message', async () => {
      await tab.open();
      expect(await tab.getOfferedFormularyCodes(), 'the picker must not offer another payer\'s formulary').not.toContain(formularyCode(foreign));
      const answer = await tab.assignViaApi(plan.id, foreign.id);
      expect(answer.status, `a cross-payer assignment must be refused: ${answer.text.slice(0, 200)}`).toBeGreaterThanOrEqual(400);
      expect(answer.text, 'the refusal should explain the payer mismatch').toMatch(PAYER_MISMATCH);
    });

    await steps.step('Confirm the plan\'s formulary field - it is unchanged (still none)', async () => {
      await planDetailPage.open(plan.id);
      await tab.open();
      expect(await tab.readAssignedFormularyIdViaApi(plan.id)).toBe('');
      expect(await tab.isPickerShown(), 'the plan should still offer the picker').toBe(true);
    });
  });

  test(`TC-${CASE.clearAnyStatus}: should accept clearing the formulary when the plan is Draft, Active or Expired`, async ({
    planManagementPage,
    planDetailPage,
    planApprovalsPage,
    planIn,
    expiredPlan,
    steps,
  }) => {
    test.setTimeout(25 * 60_000);
    const draft = await planIn('Draft');
    const live = await planIn('Active');
    const expired = await expiredPlan();
    const published = [live, expired];
    const tab = planDetailPage.formulary();

    await steps.critical('Navigate to the Plans Management module - the plan list loads', async () => {
      await planManagementPage.openListFor(SUITE_PAYER);
      expect(await planManagementPage.isListed(draft.name)).toBe(true);
    });

    await steps.critical('Open the Draft plan - a formulary is currently assigned', async () => {
      await planDetailPage.open(draft.id);
      await tab.open();
      expect(await tab.readAssignedFormularyIdViaApi(draft.id)).toBe(draft.formularyId);
      expect(await tab.offersRemove(), 'the assigned formulary should offer Remove').toBe(true);
    });

    await steps.step('Clear the Draft plan\'s formulary - the clear is applied at once', async () => {
      await tab.remove();
      expect(await tab.readAssignedFormularyIdViaApi(draft.id), 'the draft should hold no formulary').toBe('');
      await planApprovalsPage.open();
      expect(await planApprovalsPage.isInQueue(draft.name), 'a draft\'s clear needs no approval').toBe(false);
    });

    for (const plan of published) {
      await steps.step(`Repeat the clear on "${plan.name}" - it is accepted and goes through approval`, async () => {
        await planDetailPage.open(plan.id);
        await tab.open();
        await tab.remove();
        expect(await tab.isPickerShown(), 'the cleared plan should offer the picker again').toBe(true);
        await planDetailPage.submitForApproval();
        const decision = await planApprovalsPage.attemptApprove(plan.name);
        expect(decision.stillQueued, `the clear should be approvable: ${decision.answer}`).toBe(false);
      });
    }

    await steps.step('Check the formulary field on each plan once its workflow completed - no formulary is assigned', async () => {
      for (const plan of [draft, ...published]) {
        expect(await tab.readAssignedFormularyIdViaApi(plan.id), `"${plan.name}" should hold no formulary`).toBe('');
      }
    });
  });

  test(`TC-${CASE.requiredField}: should refuse to submit with a required-field message when no formulary is selected`, async ({
    planManagementPage,
    planDetailPage,
    planIn,
    planFormulary,
    steps,
  }) => {
    const formulary = await planFormulary();
    const plan = await planIn('Draft', { noFormulary: true });
    const tab = planDetailPage.formulary();

    await steps.critical('Navigate to the Plans Management module - the plan list loads', async () => {
      await planManagementPage.openListFor(SUITE_PAYER);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Open the plan and start an assignment - the formulary picker is shown, empty', async () => {
      await planDetailPage.open(plan.id);
      await tab.open();
      expect(await tab.isPickerShown()).toBe(true);
      expect(await tab.readAssignedFormularyIdViaApi(plan.id)).toBe('');
    });

    await steps.step('Leave the formulary empty and submit - a required-field message shows and nothing is submitted', async () => {
      const attempt = await tab.attemptAssignWithoutSelection();
      expect(attempt.sent, 'an empty selection must not be submitted').toBe(false);
      expect(attempt.messages.join(' | '), 'the user should be told a formulary is required').toMatch(REQUIRED_FORMULARY);
    });

    await steps.step('Select a valid formulary and submit again - it is accepted', async () => {
      const answer = await tab.assign(formularyCode(formulary));
      expect(answer?.status, `AssignFormularyToPlan: ${answer?.text.slice(0, 200)}`).toBeLessThan(300);
      expect(await tab.readAssignedFormularyIdViaApi(plan.id)).toBe(formulary.id);
    });
  });

  test(`TC-${CASE.missingFormulary}: should refuse with a formulary-not-found error when the formulary does not exist`, async ({
    planManagementPage,
    planDetailPage,
    planIn,
    planFormulary,
    steps,
  }) => {
    const formulary = await planFormulary();
    const plan = await planIn('Draft', { noFormulary: true });
    const tab = planDetailPage.formulary();

    await steps.critical('Navigate to the Plans Management module - the plan list loads', async () => {
      await planManagementPage.openListFor(SUITE_PAYER);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Open the plan and start an assignment - the formulary list is displayed', async () => {
      await planDetailPage.open(plan.id);
      await tab.open();
      expect((await tab.getOfferedFormularyCodes()).length, 'the picker should offer formularies').toBeGreaterThan(0);
    });

    await steps.step('Reference a formulary that never existed and submit - a not-found error and no change', async () => {
      const answer = await tab.assignViaApi(plan.id, MISSING_FORMULARY_ID);
      expect(answer.status, `a missing formulary must be refused: ${answer.text.slice(0, 200)}`).toBeGreaterThanOrEqual(400);
      expect(answer.text, 'the refusal should say the formulary was not found').toMatch(FORMULARY_NOT_FOUND);
      expect(await tab.readAssignedFormularyIdViaApi(plan.id), 'the plan record must be untouched').toBe('');
    });

    await steps.step('Select a valid, existing formulary and submit - it is accepted normally', async () => {
      const answer = await tab.assign(formularyCode(formulary));
      expect(answer?.status, `AssignFormularyToPlan: ${answer?.text.slice(0, 200)}`).toBeLessThan(300);
      expect(await tab.readAssignedFormularyIdViaApi(plan.id)).toBe(formulary.id);
    });
  });

  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.azureId}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
