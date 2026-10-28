import { test, expect } from '../../../fixtures';
import {
  CASE,
  DUPLICATE_NAME_MESSAGE,
  GOLD,
  RESOLVE_CONFLICT,
  SILVER,
  STATUS,
  sharedName,
} from '../../../data/plans/activationEligibility.data';

/**
 * User story 14329: Block activation when the plan's timing, payer status, or
 * name is not eligible - the NAME rule: another Active plan with the same name
 * blocks the activation, and the block lifts once that plan leaves Active.
 *
 * Plan B is built first (Active, then Inactive) and Plan A second with the same
 * name (Active) - fixture `planIn`. The two share a name, so every action is
 * taken on the DETAIL screen by id, never on a list row picked by name.
 */
test.describe('US 14329 - Activation name eligibility', () => {
  test(`TC-${CASE.duplicateName}: should block activating a plan when another Active plan already has the same name`, async ({
    planManagementPage,
    planDetailPage,
    planIn,
    steps,
  }) => {
    test.setTimeout(20 * 60_000);
    const name = sharedName(GOLD);
    const planB = await planIn('Inactive', { nameEn: name });
    const planA = await planIn('Active', { nameEn: name });
    let outcome = { status: 0, text: '', toast: '' };

    await steps.critical('Navigate to the Plans Management module - the list shows both plans with the same name', async () => {
      await planManagementPage.openListFor(planA.payerName);
      await planManagementPage.search(name);
      expect((await planManagementPage.getPlanRows()).filter((row) => row.name === name).length, 'Plan A and Plan B').toBe(2);
    });

    await steps.critical('Open Plan B (Inactive) and choose Activate - the confirmation dialog opens', async () => {
      await planDetailPage.open(planB.id);
      await planDetailPage.expectStatus(STATUS.inactive);
      const prompt = await planDetailPage.openActivationPrompt();
      expect(await prompt.getMessage(), 'the prompt should name the plan').toContain(name);
      outcome = await planDetailPage.confirmActivationAndCapture(prompt);
    });

    await steps.step('Confirm the activation - the system checks the name against the other Active plans and refuses', async () => {
      expect(outcome.status, `SetPlanActive should refuse: ${outcome.text.slice(0, 200)}`).toBeGreaterThanOrEqual(400);
    });

    await steps.step('A validation message says another plan is already Active with the name, and Plan B stays Inactive', async () => {
      expect(`${outcome.text} ${outcome.toast}`, 'the duplicate-name message').toMatch(DUPLICATE_NAME_MESSAGE);
      await planDetailPage.open(planB.id);
      await planDetailPage.expectStatus(STATUS.inactive);
      await planDetailPage.open(planA.id);
      await planDetailPage.expectStatus(STATUS.active);
    });
  });

  test(`TC-${CASE.conflictResolved}: should allow the activation when the conflicting Active plan has been deactivated`, async ({
    planManagementPage,
    planDetailPage,
    planApprovalsPage,
    planIn,
    steps,
  }) => {
    test.setTimeout(30 * 60_000);
    const name = sharedName(SILVER);
    const planB = await planIn('Inactive', { nameEn: name });
    const planA = await planIn('Active', { nameEn: name });

    await steps.critical('Navigate to the Plans Management module - the list shows both plans', async () => {
      await planManagementPage.openListFor(planA.payerName);
      await planManagementPage.search(name);
      expect((await planManagementPage.getPlanRows()).filter((row) => row.name === name).length, 'Plan A and Plan B').toBe(2);
    });

    await steps.step('Activating Plan B while Plan A is Active is blocked for the duplicate name', async () => {
      await planDetailPage.open(planB.id);
      const outcome = await planDetailPage.attemptActivation();
      expect(outcome.status, 'the activation must be refused').toBeGreaterThanOrEqual(400);
      expect(`${outcome.text} ${outcome.toast}`).toMatch(DUPLICATE_NAME_MESSAGE);
    });

    await steps.critical('Deactivate Plan A with a valid reason and approve it - Plan A becomes Inactive', async () => {
      await planDetailPage.open(planA.id);
      await planDetailPage.stageInactivation(RESOLVE_CONFLICT.details, RESOLVE_CONFLICT.reason);
      await planDetailPage.submitForApproval();
      await planApprovalsPage.open();
      await planApprovalsPage.approve(name);
      await planDetailPage.open(planA.id);
      await planDetailPage.expectStatusEventually(STATUS.inactive);
    });

    await steps.critical('Attempt to activate Plan B again - the name conflict no longer exists', async () => {
      await planDetailPage.open(planB.id);
      const outcome = await planDetailPage.attemptActivation();
      expect(outcome.status, `SetPlanActive should accept now: ${outcome.text.slice(0, 200)}`).toBeLessThan(300);
      expect(`${outcome.text} ${outcome.toast}`).not.toMatch(DUPLICATE_NAME_MESSAGE);
    });

    await steps.step('Confirm the activation and approve it - Plan B becomes Active', async () => {
      await planDetailPage.open(planB.id);
      await planDetailPage.submitForApproval();
      await planApprovalsPage.open();
      await planApprovalsPage.approve(name);
      await planDetailPage.open(planB.id);
      await planDetailPage.expectStatusEventually(STATUS.active);
    });
  });
});
