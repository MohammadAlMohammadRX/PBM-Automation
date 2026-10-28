import { test, expect } from '../../../fixtures';
import {
  APPROVAL,
  BLOCKED_CASES,
  CASE,
  EXPIRY_GUIDANCE,
  FORCED_DETAILS,
  FUTURE_DATE_MESSAGE,
  STATUS,
  dayNumber,
  today,
  todayNumber,
} from '../../../data/plans/activationEligibility.data';

/**
 * User story 14329: Block activation when the plan's timing, payer status, or
 * name is not eligible - the TIMING rules: before the effective date, on it,
 * after expiry (both directions), the eligible happy path, and the same check
 * from every entry point. A refusal is asserted on the screen AND on the wire.
 * Twins: tests/network/39 (status prerequisites) and 24 (go-live prerequisites).
 */
test.describe('US 14329 - Activation timing eligibility', () => {
  test(`TC-${CASE.futureEffective}: should refuse to activate an Inactive plan when its effective date has not arrived`, async ({
    planManagementPage,
    planDetailPage,
    planIn,
    steps,
  }) => {
    test.setTimeout(15 * 60_000);
    const plan = await planIn('InactiveFuture');
    let entriesBefore = 0;
    let outcome = { status: 0, text: '', toast: '' };

    await steps.critical('Navigate to the Plans Management module - the list shows the plan with its status', async () => {
      await planDetailPage.open(plan.id);
      await planDetailPage.audit().open();
      entriesBefore = (await planDetailPage.audit().readEntries()).length;
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Locate the Inactive plan with a future effective date - its badge reads Inactive', async () => {
      await planManagementPage.expectStatusText(plan.name, STATUS.inactive);
    });

    await steps.critical('Select the plan\'s Activate action - a confirmation dialog opens', async () => {
      const prompt = await planManagementPage.openActivationPrompt(plan.name);
      expect(await prompt.getMessage(), 'the prompt should name the plan').toContain(plan.name);
      outcome = await planManagementPage.confirmActivationAndCapture(prompt);
    });

    await steps.step('Confirm the activation - the system evaluates eligibility and rejects it', async () => {
      expect(outcome.status, `SetPlanActive should refuse: ${outcome.text.slice(0, 200)}`).toBeGreaterThanOrEqual(400);
    });

    await steps.step('A message says the effective date has not arrived, the plan stays Inactive and no activation is audited', async () => {
      expect(`${outcome.text} ${outcome.toast}`, 'the timing message').toMatch(FUTURE_DATE_MESSAGE);
      expect(await planManagementPage.readStatus(plan.name)).toBe(STATUS.inactive);
      await planDetailPage.open(plan.id);
      await planDetailPage.audit().open();
      expect((await planDetailPage.audit().readEntries()).length, 'no new audit entry').toBe(entriesBefore);
    });
  });

  test(`TC-${CASE.effectiveToday}: should let the activation proceed when the plan's effective date is exactly today`, async ({
    planManagementPage,
    planDetailPage,
    planIn,
    steps,
  }) => {
    test.setTimeout(15 * 60_000);
    const plan = await planIn('Inactive');
    let outcome = { status: 0, text: '', toast: '' };

    await steps.critical('Navigate to the Plans Management module - the list shows the plan with its status', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Open the plan whose effective date is today - the detail shows that date', async () => {
      await planManagementPage.openDetails(plan.name);
      expect((await planDetailPage.readOverview()).effectiveDate, 'the effective date').toMatch(new RegExp(`^${today()}`));
    });

    await steps.critical('Choose Activate and confirm - the dialog closes and the request is submitted', async () => {
      outcome = await planDetailPage.attemptActivation();
      expect(outcome.status, 'the request should have been sent').toBeGreaterThan(0);
    });

    await steps.step('The activation is allowed to proceed because the effective date has arrived', async () => {
      expect(outcome.status, `SetPlanActive should accept: ${outcome.text.slice(0, 200)}`).toBeLessThan(300);
      expect(`${outcome.text} ${outcome.toast}`, 'no timing refusal').not.toMatch(FUTURE_DATE_MESSAGE);
    });
  });

  test(`TC-${CASE.expiredActivate}: should block the activation with MSG-PLN-025 asking to extend the expiry date when the plan is Expired`, async ({
    planManagementPage,
    planDetailPage,
    planIn,
    steps,
  }) => {
    test.setTimeout(20 * 60_000);
    const plan = await planIn('Expired');
    let forced = { status: 0, text: '' };

    await steps.critical('Navigate to the Plans Management module - the list shows the plan with its status', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Open the Expired plan - the detail shows Expired and an expiry date already passed', async () => {
      await planManagementPage.openDetails(plan.name);
      await planDetailPage.expectStatus(STATUS.expired);
      expect(dayNumber((await planDetailPage.readOverview()).expiryDate), 'the expiry date').toBeLessThanOrEqual(todayNumber());
    });

    await steps.step('Choosing Activate is not possible, and a forced activation is evaluated against the expiry rule', async () => {
      expect(await planDetailPage.getActionAvailability('activate'), 'Activate on an Expired plan').not.toBe('available');
      forced = await planDetailPage.requestActivationViaApi(plan.id);
      expect(forced.status, 'the server must refuse').toBeGreaterThanOrEqual(400);
    });

    await steps.step('The refusal shows MSG-PLN-025 (extend the expiry date first) and the plan stays Expired', async () => {
      const said = `${await planDetailPage.getActionMessage('activate')} ${forced.text}`;
      expect(said, 'MSG-PLN-025').toMatch(EXPIRY_GUIDANCE);
      await planDetailPage.open(plan.id);
      await planDetailPage.expectStatus(STATUS.expired);
    });
  });

  test(`TC-${CASE.expiredDeactivate}: should block the deactivation with MSG-PLN-025 asking to extend the expiry date when the plan is Expired`, async ({
    planManagementPage,
    planDetailPage,
    planIn,
    steps,
  }) => {
    test.setTimeout(20 * 60_000);
    const plan = await planIn('Expired');
    let forced = { status: 0, text: '' };

    await steps.critical('Navigate to the Plans Management module - the list shows the plan with its status', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Open the Expired plan\'s detail - it shows Expired', async () => {
      await planManagementPage.openDetails(plan.name);
      await planDetailPage.expectStatus(STATUS.expired);
    });

    await steps.step('Choosing Deactivate is not possible, and a forced deactivation is evaluated', async () => {
      expect(await planDetailPage.getActionAvailability('inactivate'), 'Deactivate on an Expired plan').not.toBe('available');
      forced = await planDetailPage.requestInactivationViaApi(plan.id, FORCED_DETAILS);
      expect(forced.status, 'the server must refuse').toBeGreaterThanOrEqual(400);
    });

    await steps.step('The refusal shows MSG-PLN-025 requiring the expiry date to be extended first', async () => {
      const said = `${await planDetailPage.getActionMessage('inactivate')} ${forced.text}`;
      expect(said, 'MSG-PLN-025').toMatch(EXPIRY_GUIDANCE);
      await planDetailPage.open(plan.id);
      await planDetailPage.expectStatus(STATUS.expired);
    });
  });

  test(`TC-${CASE.eligible}: should activate the plan through approval when its timing, payer and name are all eligible`, async ({
    planManagementPage,
    planDetailPage,
    planIn,
    steps,
  }) => {
    test.setTimeout(15 * 60_000);
    const plan = await planIn('Inactive');

    await steps.critical('Navigate to the Plans Management module - the list shows the plan with its status', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Open the eligible Inactive plan - effective date passed, expiry ahead, payer and name valid', async () => {
      await planManagementPage.openDetails(plan.name);
      const overview = await planDetailPage.readOverview();
      expect(dayNumber(overview.effectiveDate), 'the effective date has arrived').toBeLessThanOrEqual(todayNumber());
      expect(dayNumber(overview.expiryDate), 'the expiry date is ahead').toBeGreaterThan(todayNumber());
      expect(overview.payer, 'the owning payer').toBe(plan.payerName);
      expect(await planDetailPage.getName()).toBe(plan.name);
    });

    await steps.step('Choose Activate and confirm - the request is submitted for approval', async () => {
      const outcome = await planDetailPage.attemptActivation();
      expect(outcome.status, `SetPlanActive should accept: ${outcome.text.slice(0, 200)}`).toBeLessThan(300);
      // Activate stages a draft ("Saved as draft"); Send for Approval submits it (2026-10-27).
      await planManagementPage.sendStagedChangeIfDraft(plan.name, plan.payerName);
      await planManagementPage.expectApprovalCell(plan.name, APPROVAL.pendingApproval);
    });

    await steps.critical('Approve the request through the approval gate - the plan becomes Active', async () => {
      await planManagementPage.publishStagedChange(plan.name, plan.payerName);
      await planDetailPage.open(plan.id);
      await planDetailPage.expectStatusEventually(STATUS.active);
    });

    await steps.step('Back on the list, the plan shows the Active badge and is still in the directory', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
      await planManagementPage.expectStatusText(plan.name, STATUS.active);
    });
  });

  test(`TC-${CASE.alternateEntryPoints}: should block the ineligible activation consistently when it is tried from the list, the detail, after a refresh and through history navigation`, async ({
    planManagementPage,
    planDetailPage,
    planIn,
    steps,
  }) => {
    test.setTimeout(15 * 60_000);
    const plan = await planIn('InactiveFuture');

    await steps.critical('Navigate to the Plans Management module - the list shows the ineligible plan', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.step('Activating from the list row is blocked with the timing message', async () => {
      const outcome = await planManagementPage.attemptRowActivation(plan.name);
      expect(outcome.status, 'the row activation must be refused').toBeGreaterThanOrEqual(400);
      expect(`${outcome.text} ${outcome.toast}`).toMatch(FUTURE_DATE_MESSAGE);
    });

    await steps.step('Activating from the detail screen applies the same check and is blocked', async () => {
      await planDetailPage.open(plan.id);
      const outcome = await planDetailPage.attemptActivation();
      expect(outcome.status, 'the detail activation must be refused').toBeGreaterThanOrEqual(400);
      expect(`${outcome.text} ${outcome.toast}`).toMatch(FUTURE_DATE_MESSAGE);
    });

    await steps.step('Refreshing and resubmitting straight away is re-evaluated and blocked again', async () => {
      await planDetailPage.reload();
      await planDetailPage.waitForLoaded();
      const outcome = await planDetailPage.attemptActivation();
      expect(outcome.status, 'the resubmission must be refused').toBeGreaterThanOrEqual(400);
    });

    await steps.step('Navigating back and forward in history still shows the plan Inactive, with no stale Active state', async () => {
      await planDetailPage.goBack();
      await planDetailPage.goForward();
      await planDetailPage.waitForLoaded();
      await planDetailPage.expectStatus(STATUS.inactive);
    });
  });

  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.azureId}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
