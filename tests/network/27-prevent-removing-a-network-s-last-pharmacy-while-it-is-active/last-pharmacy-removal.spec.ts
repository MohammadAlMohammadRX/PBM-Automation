import { test, expect } from '../../../fixtures';
import { BUDGET, SERVER_ERROR_MARKERS } from '../../../data/networks/facilities.data';
import {
  BLOCKED_CASES,
  CASE,
  LAST_PHARMACY_REFUSAL,
  PHARMACY_X,
  PHARMACY_Y,
  STATUS,
  TECHNICAL_MARKERS,
} from '../../../data/networks/lastPharmacyGuard.data';

/**
 * User story 14304: Prevent removing a network's last pharmacy while it is
 * active - the REMOVAL half of the rule.
 *
 * Every network is the case's own. Removals that must succeed on a live
 * network are maker-checker changes and are sent for approval and approved
 * (`publishStagedChange`) before the result is read.
 */
test.describe('US 14304 - Last-pharmacy removal guard', () => {
  test(`TC-${CASE.lastRefused}: should refuse to remove the only pharmacy when the network is Active`, async ({
    networkDetailPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(BUDGET.oneLiveNetwork);
    const network = await networkIn('Active', { facilityCodes: [PHARMACY_X.code] });
    let attempt = { outcome: null as { status: number; text: string } | null, toast: '', title: '', message: '' };

    await steps.critical('Navigate to the Active network - its single pharmacy is listed', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.expectStatus(STATUS.active);
      await networkDetailPage.facilities().open();
      expect(await networkDetailPage.facilities().getSettledCodes()).toEqual([PHARMACY_X.code]);
    });

    await steps.step('Removing it is blocked with a message that the network must keep a pharmacy', async () => {
      attempt = await networkDetailPage.facilities().attemptRemove(PHARMACY_X.code);
      expect(attempt.outcome?.status, `the removal should be refused: ${attempt.outcome?.text.slice(0, 200)}`).toBeGreaterThanOrEqual(400);
      expect(attempt.toast, 'the refusal should state the rule').toMatch(LAST_PHARMACY_REFUSAL);
    });

    await steps.step('The pharmacy remains linked', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      expect(await networkDetailPage.facilities().getSettledCodes()).toEqual([PHARMACY_X.code]);
    });
  });

  test(`TC-${CASE.oneOfTwoAllowed}: should allow removing one of two pharmacies when the network is Active`, async ({
    networkDetailPage,
    networkManagementPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(BUDGET.oneLiveNetwork);
    const network = await networkIn('Active', { facilityCodes: [PHARMACY_X.code, PHARMACY_Y.code] });

    await steps.critical('Navigate to the Active network - two pharmacies are listed', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      expect((await networkDetailPage.facilities().getSettledCodes()).length).toBe(2);
    });

    await steps.step('Removing one is allowed and confirmed', async () => {
      const attempt = await networkDetailPage.facilities().attemptRemove(PHARMACY_Y.code);
      expect(attempt.outcome?.status, `the removal should be accepted: ${attempt.outcome?.text.slice(0, 200)}`).toBeLessThan(300);
      await networkManagementPage.publishStagedChange(network.name);
    });

    await steps.step('Exactly one pharmacy remains linked', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      expect(await networkDetailPage.facilities().getSettledCodes()).toEqual([PHARMACY_X.code]);
    });
  });

  test(`TC-${CASE.notActiveAllowed}: should allow removing the last pharmacy when the network is not Active`, async ({
    networkDetailPage,
    networkManagementPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(BUDGET.twoLiveNetworks);
    const network = await networkIn('Inactive', { facilityCodes: [PHARMACY_X.code] });

    await steps.critical('Navigate to the Inactive network - its single pharmacy is listed', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.expectStatus(STATUS.inactive);
      await networkDetailPage.facilities().open();
      expect(await networkDetailPage.facilities().getCodes()).toEqual([PHARMACY_X.code]);
    });

    await steps.step('Removing it is allowed because the network is not Active', async () => {
      const attempt = await networkDetailPage.facilities().attemptRemove(PHARMACY_X.code);
      expect(attempt.outcome?.status, `the removal should be accepted: ${attempt.outcome?.text.slice(0, 200)}`).toBeLessThan(300);
      await networkManagementPage.publishStagedChange(network.name);
    });

    await steps.step('The network now has no pharmacy linked', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      expect(await networkDetailPage.facilities().readRows()).toEqual([]);
    });
  });

  test(`TC-${CASE.boundaryTwoToZero}: should allow 2 to 1 and block 1 to 0 when pharmacies are removed from an Active network`, async ({
    networkDetailPage,
    networkManagementPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(BUDGET.oneLiveNetwork);
    const network = await networkIn('Active', { facilityCodes: [PHARMACY_X.code, PHARMACY_Y.code] });

    await steps.critical('Navigate to the Active network - two pharmacies are listed', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      expect((await networkDetailPage.facilities().getSettledCodes()).length).toBe(2);
    });

    await steps.critical('Removing one (2 -> 1) succeeds', async () => {
      const attempt = await networkDetailPage.facilities().attemptRemove(PHARMACY_Y.code);
      expect(attempt.outcome?.status).toBeLessThan(300);
      await networkManagementPage.publishStagedChange(network.name);
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      expect(await networkDetailPage.facilities().getSettledCodes()).toEqual([PHARMACY_X.code]);
    });

    await steps.step('Removing the remaining one (1 -> 0) is blocked with an error', async () => {
      const attempt = await networkDetailPage.facilities().attemptRemove(PHARMACY_X.code);
      expect(attempt.outcome?.status, 'the last removal should be refused').toBeGreaterThanOrEqual(400);
      expect(attempt.toast).toMatch(LAST_PHARMACY_REFUSAL);
    });
  });

  test(`TC-${CASE.clearMessage}: should explain the rule in a clear business message when a last-pharmacy removal is blocked`, async ({
    networkDetailPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(BUDGET.oneLiveNetwork);
    const network = await networkIn('Active', { facilityCodes: [PHARMACY_X.code] });
    let toast = '';

    await steps.critical('Navigate to the Active network and attempt to remove its only pharmacy - it is blocked', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      const attempt = await networkDetailPage.facilities().attemptRemove(PHARMACY_X.code);
      toast = attempt.toast;
      expect(attempt.outcome?.status).toBeGreaterThanOrEqual(400);
    });

    await steps.step('The message names the rule - the network must retain at least one active pharmacy', async () => {
      expect(toast).toMatch(LAST_PHARMACY_REFUSAL);
      for (const marker of TECHNICAL_MARKERS) expect(toast, `no technical text ("${marker}")`).not.toContain(marker);
    });
  });

  test(`TC-${CASE.rolesOnly}: should offer pharmacy removal only to an authorised role`, async ({
    networkDetailPage,
    networkManagementPage,
    networkIn,
    shapedNonAdmin,
    steps,
  }) => {
    test.setTimeout(BUDGET.oneLiveNetwork);
    const network = await networkIn('Active', { facilityCodes: [PHARMACY_X.code, PHARMACY_Y.code] });

    await steps.critical('Navigate to the network as the authorised user - Remove is visible and enabled', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      expect(await networkDetailPage.facilities().isRemoveOffered(PHARMACY_Y.code)).toBe(true);
    });

    const viewer = await shapedNonAdmin({ without: ['unassignFacility'] });

    await steps.step('The view-only user is not offered Remove', async () => {
      await viewer.networkDetail.open(network.id);
      await viewer.networkDetail.facilities().open();
      expect(await viewer.networkDetail.facilities().isRemoveOffered(PHARMACY_Y.code)).toBe(false);
    });

    await steps.step('The authorised user\'s removal is processed by the business rules', async () => {
      const attempt = await networkDetailPage.facilities().attemptRemove(PHARMACY_Y.code);
      expect(attempt.outcome?.status, 'a removal leaving one pharmacy should be accepted').toBeLessThan(300);
      await networkManagementPage.publishStagedChange(network.name);
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      expect(await networkDetailPage.facilities().getSettledCodes()).toEqual([PHARMACY_X.code]);
    });
  });

  test(`TC-${CASE.replaceThenRemove}: should allow removing the pharmacy once a replacement is added after a blocked removal`, async ({
    networkDetailPage,
    networkManagementPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(BUDGET.oneLiveNetwork);
    const network = await networkIn('Active', { facilityCodes: [PHARMACY_X.code] });

    await steps.critical('Navigate to the Active network and try to remove Pharmacy X - it is blocked', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      const attempt = await networkDetailPage.facilities().attemptRemove(PHARMACY_X.code);
      expect(attempt.outcome?.status).toBeGreaterThanOrEqual(400);
      expect(attempt.toast).toMatch(LAST_PHARMACY_REFUSAL);
    });

    await steps.critical('Adding Pharmacy Y gives the network two pharmacies', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      expect((await networkDetailPage.facilities().assign([PHARMACY_Y.code]))?.status).toBeLessThan(300);
      await networkManagementPage.publishStagedChange(network.name);
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      expect((await networkDetailPage.facilities().getSettledCodes()).sort()).toEqual([PHARMACY_X.code, PHARMACY_Y.code].sort());
    });

    await steps.step('Removing Pharmacy X now succeeds', async () => {
      const attempt = await networkDetailPage.facilities().attemptRemove(PHARMACY_X.code);
      expect(attempt.outcome?.status).toBeLessThan(300);
      await networkManagementPage.publishStagedChange(network.name);
    });

    await steps.step('Only Pharmacy Y remains linked', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      expect(await networkDetailPage.facilities().getSettledCodes()).toEqual([PHARMACY_Y.code]);
    });
  });

  test(`TC-${CASE.blockedLogged}: should log the blocked attempt and change nothing when a last-pharmacy removal is refused`, async ({
    networkDetailPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(BUDGET.oneLiveNetwork);
    const network = await networkIn('Active', { facilityCodes: [PHARMACY_X.code] });
    let entriesBefore = 0;

    await steps.critical('Navigate to the network and note its audit history', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.audit().open();
      entriesBefore = (await networkDetailPage.audit().readEntries()).length;
      expect(entriesBefore).toBeGreaterThanOrEqual(0);
    });

    await steps.critical('Attempting to remove the only pharmacy is blocked with a validation message', async () => {
      await networkDetailPage.facilities().open();
      const attempt = await networkDetailPage.facilities().attemptRemove(PHARMACY_X.code);
      expect(attempt.outcome?.status).toBeGreaterThanOrEqual(400);
      expect(attempt.toast).toMatch(LAST_PHARMACY_REFUSAL);
    });

    await steps.step('The audit history records the blocked attempt', async () => {
      await expect
        .poll(async () => {
          await networkDetailPage.open(network.id);
          await networkDetailPage.audit().open();
          return (await networkDetailPage.audit().readEntries()).length;
        }, { timeout: 60_000, message: 'a new audit entry should capture the blocked removal attempt' })
        .toBeGreaterThan(entriesBefore);
    });

    await steps.step('The pharmacy stays linked and the status is unchanged - no partial update', async () => {
      await networkDetailPage.facilities().open();
      expect(await networkDetailPage.facilities().getSettledCodes()).toEqual([PHARMACY_X.code]);
      await networkDetailPage.expectStatus(STATUS.active);
    });
  });

  test(`TC-${CASE.apiEnforced}: should refuse a direct API removal of the last pharmacy from an Active network`, async ({
    networkDetailPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(BUDGET.oneLiveNetwork);
    const network = await networkIn('Active', { facilityCodes: [PHARMACY_X.code] });
    let answer = { status: 0, text: '' };

    await steps.critical('Navigate to the network - its single pharmacy is confirmed in the UI', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      expect(await networkDetailPage.facilities().getSettledCodes()).toEqual([PHARMACY_X.code]);
    });

    await steps.step('A direct removal request bypassing the UI is rejected with a validation error', async () => {
      answer = await networkDetailPage.facilities().removeViaApi(network.id, PHARMACY_X.id);
      expect(answer.status, `the API should refuse it: ${answer.text.slice(0, 200)}`).toBeGreaterThanOrEqual(400);
      expect(answer.status, 'a validation error, not a server fault').toBeLessThan(500);
      for (const marker of SERVER_ERROR_MARKERS) expect(answer.text).not.toContain(marker);
    });

    await steps.step('The UI still shows the pharmacy linked', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      expect(await networkDetailPage.facilities().getSettledCodes()).toEqual([PHARMACY_X.code]);
    });
  });

  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.azureId}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
