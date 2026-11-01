import { test, expect } from '../../../fixtures';
import { DRAFT_ASSIGNMENT, formularyCode } from '../../../data/plans/assignPlanFormulary.data';
import {
  BLOCKED_CASES,
  CASE,
  CROSS_PAYER_ERROR,
  MESSAGE_CHECKLIST,
  SUITE_PAYER,
  serverMessage,
} from '../../../data/plans/formularyPicker.data';

/**
 * User story 14326: Formulary selection to active/inactive formularies of the plan's payer.
 * The same-payer rule wherever a formulary is assigned or changed: a
 * cross-payer formulary is refused - with a clear explanation - by every path,
 * and a same-payer change completes through approval.
 */
test.describe('US 14326 - Same-payer rule', () => {
  test.describe.configure({ timeout: 15 * 60_000 });

  test(`TC-${CASE.crossPayerRefused}: should refuse the assignment with an explanatory error when the formulary belongs to a different payer`, async ({
    planManagementPage,
    planDetailPage,
    planIn,
    foreignFormulary,
    steps,
  }) => {
    const foreign = await foreignFormulary();
    const plan = await planIn('Draft', { noFormulary: true });
    const tab = planDetailPage.formulary();
    let answer = { status: 0, text: '' };

    await steps.critical('Navigate to the Plans Management module - the landing page is displayed', async () => {
      await planManagementPage.openListFor(SUITE_PAYER);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Open Plan P\'s formulary assignment section - the assignment screen is displayed', async () => {
      await planDetailPage.open(plan.id);
      await tab.open();
      expect(await tab.isPickerShown()).toBe(true);
    });

    await steps.critical('Assign F6 directly, bypassing the picker - the system evaluates the payer match', async () => {
      answer = await tab.assignViaApi(plan.id, foreign.id);
      expect(answer.status, 'the server should answer the attempt').toBeGreaterThan(0);
    });

    await steps.step('Confirm the attempt - it is refused with an error saying the formulary belongs to a different payer', async () => {
      expect(answer.status, `a cross-payer assignment must be refused: ${answer.text.slice(0, 200)}`).toBeGreaterThanOrEqual(400);
      expect(answer.text, 'the refusal should explain the payer rule').toMatch(CROSS_PAYER_ERROR);
      expect(await tab.readAssignedFormularyIdViaApi(plan.id), 'nothing may be attached').toBe('');
    });
  });

  test(`TC-${CASE.samePayerChange}: should move the plan from F1 to F2 through approval when it is reassigned within the same payer`, async ({
    planManagementPage,
    planDetailPage,
    planApprovalsPage,
    planIn,
    suitePayerFormularies,
    steps,
  }) => {
    const [first, second] = await suitePayerFormularies(2);
    const plan = await planIn('Active', { formularyId: first.id });
    const tab = planDetailPage.formulary();

    await steps.critical('Navigate to the Plans Management module - the landing page is displayed', async () => {
      await planManagementPage.openListFor(SUITE_PAYER);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Open Plan R and start a formulary change - the current selection is F1', async () => {
      await planDetailPage.open(plan.id);
      await tab.open();
      expect(await tab.getPanelText()).toContain(formularyCode(first));
    });

    await steps.critical('Select F2 and save - the change is recorded with F2, pending approval', async () => {
      const answer = await tab.replaceWith(formularyCode(second));
      expect(answer?.status, `AssignFormularyToPlan: ${answer?.text.slice(0, 200)}`).toBeLessThan(300);
      const staged = (await tab.readAssignmentCards()).find((card) => card.text.includes(formularyCode(second)));
      expect(staged?.badge, 'F2 should be the staged assignment').toMatch(DRAFT_ASSIGNMENT);
    });

    await steps.step('Submit for approval and approve - the plan\'s active formulary moves from F1 to F2', async () => {
      await planDetailPage.submitForApproval();
      await planApprovalsPage.open();
      await planApprovalsPage.approve(plan.name);
      await expect.poll(() => tab.readLiveFormularyIdViaApi(plan.id), { timeout: 60_000 }).toBe(second.id);
    });
  });

  test(`TC-${CASE.clearRefusal}: should explain the same-payer rule in plain words when a cross-payer formulary is refused`, async ({
    planDetailPage,
    planManagementPage,
    planIn,
    foreignFormulary,
    steps,
  }) => {
    const foreign = await foreignFormulary();
    const plan = await planIn('Draft', { noFormulary: true });
    const tab = planDetailPage.formulary();
    let message = '';

    await steps.critical('Navigate to the Plans Management module - the landing page is displayed', async () => {
      await planManagementPage.openListFor(SUITE_PAYER);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Attempt to assign F6 to Plan P - the system refuses it', async () => {
      await planDetailPage.open(plan.id);
      const answer = await tab.assignViaApi(plan.id, foreign.id);
      message = serverMessage(answer.text);
      expect(answer.status, `the cross-payer assignment must be refused: ${answer.text.slice(0, 200)}`).toBeGreaterThanOrEqual(400);
    });

    // "The formulary must belong to the same payer as the plan." is clear enough (QA lead, 2026-11-01).
    await steps.step('Review the message - it explains the same-payer rule in plain words, with no technical jargon', async () => {
      expect({
        explainsRestriction: MESSAGE_CHECKLIST.explainsRestriction.test(message),
        freeOfJargon: !MESSAGE_CHECKLIST.jargon.test(message),
      }, `the message read: ${message.slice(0, 300)}`).toEqual({
        explainsRestriction: true,
        freeOfJargon: true,
      });
    });
  });

  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.azureId}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
