import { test, expect } from '../../../fixtures';
import {
  CASE,
  FORMULARY_NOT_ACTIVE,
  SUITE_PAYER,
} from '../../../data/plans/formularyPicker.data';

/**
 * User story 14326: Formulary selection to active/inactive formularies of the plan's payer.
 * "Can be approved only with an Active formulary": a plan whose formulary is
 * Inactive - from the start, or since it was submitted - is refused at
 * approval, the status being re-checked at decision time.
 *
 * Only an Active formulary can be assigned, so a pending plan carrying an
 * Inactive one is built by deactivating its formulary AFTER submission
 * (fixture `pendingPlanWithInactiveFormulary`; 19204 does it as a step).
 */
test.describe('US 14326 - Formulary status at approval', () => {
  test.describe.configure({ timeout: 15 * 60_000 });

  test(`TC-${CASE.inactiveBlocksApproval}: should refuse to approve the plan with a must-be-Active error when its formulary is Inactive`, async ({
    planManagementPage,
    planDetailPage,
    planApprovalsPage,
    formularyDetailPage,
    pendingPlanWithInactiveFormulary,
    steps,
  }) => {
    const { plan, formulary } = await pendingPlanWithInactiveFormulary();

    await steps.critical('Navigate to the Plans Management module - the landing page is displayed', async () => {
      await planManagementPage.openListFor(SUITE_PAYER);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Open Plan S awaiting approval - its details show the assigned Inactive formulary F4', async () => {
      await planDetailPage.open(plan.id);
      expect(await planDetailPage.formulary().readAssignedFormularyIdViaApi(plan.id)).toBe(formulary.id);
      expect(await formularyDetailPage.readStatusCodeViaApi(formulary.id)).toBe('inactive');
    });

    await steps.step('Attempt to approve Plan S as an approver - the approval is blocked: the formulary must be Active', async () => {
      await planApprovalsPage.open();
      const decision = await planApprovalsPage.attemptApprove(plan.name);
      expect(decision.stillQueued, `the approval must be refused: ${decision.answer}`).toBe(true);
      expect(decision.answer, 'the refusal should say the formulary must be Active').toMatch(FORMULARY_NOT_ACTIVE);
    });
  });

  test(`TC-${CASE.revalidatedAtApproval}: should re-check the formulary and block the approval when it became Inactive while the plan was pending`, async ({
    planManagementPage,
    planApprovalsPage,
    formularyDetailPage,
    disposableFormulary,
    planIn,
    steps,
  }) => {
    const formulary = await disposableFormulary();
    const plan = await planIn('PendingApproval', { formularyId: formulary.id });
    let decision = { answer: '', stillQueued: false };

    await steps.critical('Navigate to the Plans Management module - the landing page is displayed', async () => {
      await planManagementPage.openListFor(SUITE_PAYER);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('While Plan T awaits approval, set F1 to Inactive in formulary management - F1 reads Inactive', async () => {
      const result = await formularyDetailPage.deactivateViaApi(formulary);
      expect(result.statusCode, `the deactivation: ${result.error}`).toBe('inactive');
    });

    await steps.critical('As an approver, open Plan T and attempt to approve it - the formulary status is re-validated', async () => {
      await planApprovalsPage.open();
      decision = await planApprovalsPage.attemptApprove(plan.name);
      expect(decision.answer, 'the server should answer the decision').not.toBe('');
    });

    await steps.step('Confirm the attempt - the approval is blocked because the formulary is no longer Active', async () => {
      expect(decision.stillQueued, `the approval must be refused: ${decision.answer}`).toBe(true);
      expect(decision.answer).toMatch(FORMULARY_NOT_ACTIVE);
    });
  });
});
