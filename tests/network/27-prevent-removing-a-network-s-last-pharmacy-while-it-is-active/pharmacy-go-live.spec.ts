import { test, expect } from '../../../fixtures';
import { BUDGET } from '../../../data/networks/facilities.data';
import {
  ACTIVATION_WAIT_MS,
  CASE,
  LAST_PHARMACY_REFUSAL,
  NO_PHARMACY_REFUSAL,
  PHARMACY_X,
  PHARMACY_Y,
  STATUS,
} from '../../../data/networks/lastPharmacyGuard.data';

/**
 * User story 14304: Prevent removing a network's last pharmacy while it is
 * active - the ACTIVATION half, the decision table, and rapid toggling.
 *
 * A Draft goes live through Send for Approval + Approve
 * (`networkManagementPage.attemptGoLive`, which reports each answer and the
 * status the row ends on); the lifecycle job then makes it Active.
 */
test.describe('US 14304 - Pharmacy coverage for going live', () => {
  test(`TC-${CASE.zeroCannotGoLive}: should refuse activation and keep the Draft when the network has no pharmacy`, async ({
    networkDetailPage,
    networkManagementPage,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Draft', { facilities: 0 });

    await steps.critical('Navigate to the Draft network - it shows zero pharmacies', async () => {
      await networkDetailPage.open(network.id);
      expect(await networkDetailPage.getTabCount('facilities')).toBe(0);
    });

    await steps.step('Activating it is blocked with an error requiring a pharmacy, and it stays a Draft', async () => {
      const outcome = await networkManagementPage.attemptGoLive(network);
      expect(`${outcome.toast} ${outcome.submitText} ${outcome.approveAnswer}`, 'the refusal should require a pharmacy').toMatch(NO_PHARMACY_REFUSAL);
      expect(outcome.status, 'the network should remain a Draft (Not Live)').toBe(STATUS.notLive);
    });
  });

  test(`TC-${CASE.oneCanGoLive}: should activate the network when it has exactly one pharmacy`, async ({
    networkDetailPage,
    networkManagementPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(BUDGET.oneLiveNetwork);
    const network = await networkIn('Draft', { facilityCodes: [PHARMACY_X.code] });

    await steps.critical('Navigate to the Draft network - it shows one pharmacy', async () => {
      await networkDetailPage.open(network.id);
      expect(await networkDetailPage.getTabCount('facilities')).toBe(1);
    });

    await steps.step('Activating it is accepted and the status becomes Active', async () => {
      const outcome = await networkManagementPage.attemptGoLive(network);
      expect(outcome.submitStatus, `submission should be accepted: ${outcome.submitText.slice(0, 200)}`).toBeLessThan(300);
      expect(outcome.queued, 'the approval should clear the queue').toBe(false);
      await networkManagementPage.waitForStatus(network.name, STATUS.active, ACTIVATION_WAIT_MS);
    });
  });

  test(`TC-${CASE.matrix}: should produce the rule's outcome for every status and pharmacy-count combination`, async ({
    networkDetailPage,
    networkManagementPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(BUDGET.matrix);
    const activeOne = await networkIn('Active', { facilityCodes: [PHARMACY_X.code] });
    const activeTwo = await networkIn('Active', { facilityCodes: [PHARMACY_X.code, PHARMACY_Y.code] });
    const inactiveOne = await networkIn('Inactive', { facilityCodes: [PHARMACY_X.code] });
    const draftZero = await networkIn('Draft', { facilities: 0 });
    const draftOne = await networkIn('Draft', { facilityCodes: [PHARMACY_X.code] });

    await steps.critical('Navigate to the Network Management module - the list loads', async () => {
      await networkManagementPage.openList();
    });

    await steps.step('Active + 1 pharmacy: removing it is blocked', async () => {
      await networkDetailPage.open(activeOne.id);
      await networkDetailPage.facilities().open();
      const attempt = await networkDetailPage.facilities().attemptRemove(PHARMACY_X.code);
      expect(attempt.outcome?.status).toBeGreaterThanOrEqual(400);
      expect(attempt.toast).toMatch(LAST_PHARMACY_REFUSAL);
    });

    await steps.step('Active + 2 pharmacies: removing one is allowed', async () => {
      await networkDetailPage.open(activeTwo.id);
      await networkDetailPage.facilities().open();
      expect((await networkDetailPage.facilities().attemptRemove(PHARMACY_Y.code)).outcome?.status).toBeLessThan(300);
    });

    await steps.step('Inactive + 1 pharmacy: removing it is allowed', async () => {
      await networkDetailPage.open(inactiveOne.id);
      await networkDetailPage.facilities().open();
      expect((await networkDetailPage.facilities().attemptRemove(PHARMACY_X.code)).outcome?.status).toBeLessThan(300);
    });

    await steps.step('Draft + 0 pharmacies: activation is blocked', async () => {
      const outcome = await networkManagementPage.attemptGoLive(draftZero);
      expect(outcome.status).toBe(STATUS.notLive);
    });

    await steps.step('Draft + 1 pharmacy: activation is allowed', async () => {
      const outcome = await networkManagementPage.attemptGoLive(draftOne);
      expect(outcome.submitStatus).toBeLessThan(300);
      await networkManagementPage.waitForStatus(draftOne.name, STATUS.active, ACTIVATION_WAIT_MS);
    });
  });

  test(`TC-${CASE.rapidToggle}: should keep enforcing the rule and stay consistent when activation and removals are toggled quickly`, async ({
    networkDetailPage,
    networkManagementPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(BUDGET.oneLiveNetwork);
    const network = await networkIn('Draft', { facilityCodes: [PHARMACY_X.code] });

    await steps.critical('Navigate to the Draft network and activate it - it becomes Active with one pharmacy', async () => {
      const outcome = await networkManagementPage.attemptGoLive(network);
      expect(outcome.submitStatus).toBeLessThan(300);
      await networkManagementPage.waitForStatus(network.name, STATUS.active, ACTIVATION_WAIT_MS);
    });

    await steps.step('Removing the last pharmacy, starting a deactivation and removing again: every removal is blocked', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      const first = await networkDetailPage.facilities().attemptRemove(PHARMACY_X.code);
      expect(first.outcome?.status, 'first removal').toBeGreaterThanOrEqual(400);
      await networkManagementPage.openList();
      const wording = await networkManagementPage.cancelStatusChange(network.name, 'inactivate');
      expect(wording.title, 'the deactivation drawer should open and close cleanly').not.toBe('');
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      const second = await networkDetailPage.facilities().attemptRemove(PHARMACY_X.code);
      expect(second.outcome?.status, 'second removal').toBeGreaterThanOrEqual(400);
    });

    await steps.step('The final state is consistent: one pharmacy, Active, no duplicates', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.expectStatus(STATUS.active);
      await networkDetailPage.facilities().open();
      expect(await networkDetailPage.facilities().getCodes()).toEqual([PHARMACY_X.code]);
    });
  });
});
