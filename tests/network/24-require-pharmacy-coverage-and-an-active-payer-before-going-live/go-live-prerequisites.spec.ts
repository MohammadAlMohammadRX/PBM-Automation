import { test, expect } from '../../../fixtures';
import { NETWORK_LIFECYCLE } from '../../../data/networks/network.data';
import { LIFECYCLE_STATUS } from '../../../data/payers/statusTransition.data';
import {
  ACTIVATION_WAIT_MS,
  DRAFT_EFFECTIVE_IN_MINUTES,
  GO_LIVE_TIMEOUT_MS,
  INACTIVE_PAYER,
  JOB_EFFECTIVE_IN_MINUTES,
  LIFECYCLE_VALUES,
  MISSING_PHARMACY,
  NOT_LIVE,
  NO_PHARMACY_CASES,
  ONE_PHARMACY_CASES,
  PAYER_INACTIVATION_DETAILS,
} from '../../../data/networks/goLivePrerequisites.data';

/**
 * User story 14301: Require pharmacy coverage and an active payer before a
 * network can go live.
 *
 * A never-approved network goes live by Send for Approval + Approve (see the
 * data file); `attemptGoLive` performs that round trip by network id and
 * reports every answer, so a refusal at either stage is visible on the wire.
 * Drafts are the case's own, owned by a payer the case provisioned.
 */
test.describe('US 14301 - Go-live prerequisites', () => {
  for (const azureId of ONE_PHARMACY_CASES) {
    test(`TC-${azureId}: should go live and become Active when the network has exactly one pharmacy and an active payer`, async ({
      networkManagementPage,
      networkDetailPage,
      networkIn,
      publishedPayer,
      steps,
    }) => {
      test.setTimeout(GO_LIVE_TIMEOUT_MS);
      const network = await networkIn('Draft', {
        facilities: 1,
        payerName: publishedPayer.nameEn,
        effectiveInMinutes: DRAFT_EFFECTIVE_IN_MINUTES,
      });

      await steps.critical('Navigate to the module - the draft network is listed Not Live', async () => {
        await networkDetailPage.open(network.id);
        await networkDetailPage.expectStatus(NOT_LIVE);
      });

      await steps.step('The detail screen confirms one pharmacy is assigned', async () => {
        expect(await networkDetailPage.getTabCount('facilities'), 'exactly the minimum of one pharmacy').toBe(1);
      });

      await steps.step('Taken live, it is accepted and the network becomes Active', async () => {
        const result = await networkManagementPage.attemptGoLive(network);
        expect(result.submitStatus, `submission accepted: ${result.submitText.slice(0, 200)}`).toBeLessThan(300);
        expect(result.queued, `approval accepted: ${result.approveAnswer}`).toBe(false);
        await networkDetailPage.expectStatusEventually(network.id, NETWORK_LIFECYCLE.active, ACTIVATION_WAIT_MS);
      });
    });
  }

  for (const azureId of NO_PHARMACY_CASES) {
    test(`TC-${azureId}: should block going live and keep the network Not Live when no pharmacy is assigned`, async ({
      networkManagementPage,
      networkDetailPage,
      networkIn,
      publishedPayer,
      steps,
    }) => {
      test.setTimeout(GO_LIVE_TIMEOUT_MS);
      const network = await networkIn('Draft', {
        facilities: 0,
        payerName: publishedPayer.nameEn,
        effectiveInMinutes: DRAFT_EFFECTIVE_IN_MINUTES,
      });

      await steps.critical('Navigate to the module - the draft network is listed Not Live', async () => {
        await networkDetailPage.open(network.id);
        await networkDetailPage.expectStatus(NOT_LIVE);
      });

      await steps.step('The detail screen shows no pharmacy assigned', async () => {
        expect(await networkDetailPage.getTabCount('facilities'), 'no pharmacy').toBe(0);
        const tab = networkDetailPage.facilities();
        await tab.open();
        expect(await tab.readRows()).toEqual([]);
      });

      await steps.step('Going live is refused with a message that a pharmacy is required, and it stays Not Live', async () => {
        const result = await networkManagementPage.attemptGoLive(network);
        expect(result.status, 'the network must not leave Not Live').toBe(NOT_LIVE);
        expect(`${result.submitText} ${result.toast} ${result.approveAnswer}`, 'the refusal should name the missing pharmacy')
          .toMatch(MISSING_PHARMACY);
      });
    });
  }

  test('TC-18037: should allow going live only when both a pharmacy and an active payer are present', async ({
    networkManagementPage,
    networkDetailPage,
    networkIn,
    publishedPayer,
    inactivePayer,
    steps,
  }) => {
    test.setTimeout(45 * 60_000);
    const spec = { effectiveInMinutes: DRAFT_EFFECTIVE_IN_MINUTES };
    const both = await networkIn('Draft', { ...spec, facilities: 1, payerName: publishedPayer.nameEn });
    const noPayer = await networkIn('Draft', { ...spec, facilities: 1, payerName: inactivePayer.nameEn });
    const noPharmacy = await networkIn('Draft', { ...spec, facilities: 0, payerName: publishedPayer.nameEn });
    const neither = await networkIn('Draft', { ...spec, facilities: 0, payerName: inactivePayer.nameEn });

    await steps.critical('Navigate to the module - the four draft networks are Not Live', async () => {
      for (const network of [both, noPayer, noPharmacy, neither]) {
        await networkDetailPage.open(network.id);
        await networkDetailPage.expectStatus(NOT_LIVE);
      }
    });

    await steps.step('Pharmacy = Yes, Payer = Active: going live succeeds and the network becomes Active', async () => {
      const result = await networkManagementPage.attemptGoLive(both);
      expect(result.queued, `approval accepted: ${result.approveAnswer}`).toBe(false);
      await networkDetailPage.expectStatusEventually(both.id, NETWORK_LIFECYCLE.active, ACTIVATION_WAIT_MS);
    });

    await steps.step('Pharmacy = Yes, Payer = Inactive: blocked, stays Not Live', async () => {
      const result = await networkManagementPage.attemptGoLive(noPayer);
      expect(result.status).toBe(NOT_LIVE);
      expect(`${result.submitText} ${result.toast} ${result.approveAnswer}`).toMatch(INACTIVE_PAYER);
    });

    await steps.step('Pharmacy = No, Payer = Active: blocked, stays Not Live', async () => {
      const result = await networkManagementPage.attemptGoLive(noPharmacy);
      expect(result.status).toBe(NOT_LIVE);
      expect(`${result.submitText} ${result.toast} ${result.approveAnswer}`).toMatch(MISSING_PHARMACY);
    });

    await steps.step('Pharmacy = No, Payer = Inactive: blocked, stays Not Live', async () => {
      const result = await networkManagementPage.attemptGoLive(neither);
      expect(result.status).toBe(NOT_LIVE);
    });
  });

  test('TC-18039: should leave the network Not Live after a blocked go-live when the page is refreshed', async ({
    networkManagementPage,
    networkDetailPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(GO_LIVE_TIMEOUT_MS);
    const network = await networkIn('Draft', { facilities: 0, effectiveInMinutes: DRAFT_EFFECTIVE_IN_MINUTES });

    await steps.critical('Navigate to the module - the draft network is Not Live', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.expectStatus(NOT_LIVE);
    });

    await steps.step('Going live reports that the preconditions are not met', async () => {
      const result = await networkManagementPage.attemptGoLive(network);
      expect(`${result.submitText} ${result.toast} ${result.approveAnswer}`).toMatch(MISSING_PHARMACY);
    });

    await steps.step('Refreshed, the network is still Not Live', async () => {
      await networkDetailPage.reload();
      await networkDetailPage.expectStatus(NOT_LIVE);
    });
  });

  test('TC-18043: should be activated by the scheduled job without intervention when both preconditions are met', async ({
    networkManagementPage,
    networkDetailPage,
    networkIn,
    publishedPayer,
    steps,
  }) => {
    test.setTimeout(GO_LIVE_TIMEOUT_MS);
    const network = await networkIn('Draft', {
      facilities: 1,
      payerName: publishedPayer.nameEn,
      effectiveInMinutes: JOB_EFFECTIVE_IN_MINUTES,
    });

    await steps.critical('Navigate to the module - the ready network is approved and waits for its effective time', async () => {
      const result = await networkManagementPage.attemptGoLive(network);
      expect(result.queued, `approval accepted: ${result.approveAnswer}`).toBe(false);
      expect(result.status, 'approved ahead of its effective time, it should read Pending').toBe(NETWORK_LIFECYCLE.pending);
    });

    await steps.step('The scheduled job runs and the network reads Active with no manual step', async () => {
      await networkDetailPage.expectStatusEventually(network.id, NETWORK_LIFECYCLE.active, ACTIVATION_WAIT_MS + JOB_EFFECTIVE_IN_MINUTES * 60_000);
    });
  });

  test('TC-18042: should handle an owning payer becoming Inactive after its network is Active without an unhandled error', async ({
    networkDetailPage,
    networkIn,
    publishedPayer,
    payerManagementPage,
    payerInactivateDialog,
    approvalManagementPage,
    steps,
  }) => {
    test.setTimeout(35 * 60_000);
    const payer = publishedPayer.nameEn;
    const network = await networkIn('Active', { payerName: payer });

    await steps.critical('Navigate to the module - the network is Active under its active payer', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.expectStatus(NETWORK_LIFECYCLE.active);
    });

    await steps.critical('The owning payer is changed to Inactive in the Payer module', async () => {
      await payerManagementPage.findAndInactivateRow(payer);
      await payerInactivateDialog.inactivateWithFirstReason(PAYER_INACTIVATION_DETAILS);
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(payer);
      await approvalManagementPage.open();
      await approvalManagementPage.approve(payer);
      await payerManagementPage.open();
      await payerManagementPage.search(payer);
      await payerManagementPage.expectLifecycleStatus(payer, LIFECYCLE_STATUS.inactive.en);
    });

    await steps.step('The network screen loads without error and shows a recognised status, which is recorded', async () => {
      await networkDetailPage.open(network.id);
      const status = await networkDetailPage.getStatus();
      test.info().annotations.push({ type: 'observation', description: `network status after its payer became Inactive: ${status}` });
      expect(LIFECYCLE_VALUES as readonly string[], `"${status}" should be a recognised status`).toContain(status);
    });
  });
});
