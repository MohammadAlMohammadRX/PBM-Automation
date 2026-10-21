import { test as base } from '@playwright/test';
import { NetworkManagementPage } from '../pages/network/NetworkManagementPage';
import { ApprovalManagementPage } from '../pages/approval/ApprovalManagementPage';
import { NETWORK_STATUS } from '../data/networks/networkActivation.data';
import { Logger } from '../utils/Logger';
import { blockedByPrecondition } from './testStatus.fixture';
import { provisionDisposableNetwork } from '../utils/NetworkProvisioning';

/**
 * Network-state fixtures.
 *
 * The network-activation story needs a network in a KNOWN lifecycle state.
 *
 * CHANGED 2026-10-19: the fixture now CREATES a network for the case instead of
 * sampling the list. Sampling picked the first network in the wanted status,
 * which by then was almost always a NETWORK-SEED pool network - ProtectedData
 * refuses to inactivate those, so seven cases reported BLOCKED and two FAILED
 * on the suite's own guard. Flipping a real team network is not acceptable
 * either. A disposable "Automation Network ..." (utils/NetworkProvisioning.ts)
 * is created Active and approved through the API; when the case wants it
 * Inactive, it is flipped through the screen and the approval queue, the way
 * the application intends. Nothing shared is touched.
 *
 * If the network cannot be provisioned the case reports BLOCKED rather than
 * failing: the rule under test was never exercised.
 */
export interface NetworkStateFixtures {
  /**
   * The name of a network displaying `status`, flipping one if none does.
   *
   * A function rather than a value because sampling costs a list walk per
   * status, and a flip costs an approval round trip - so nothing should be paid
   * for a status the case does not ask for.
   */
  networkInStatus: (status: 'Active' | 'Inactive') => Promise<string>;
}

export const test = base.extend<NetworkStateFixtures>({
  networkInStatus: async ({ page }, use, testInfo) => {
    const networkPage = new NetworkManagementPage(page);
    const approvals = new ApprovalManagementPage(page, 'network');

    await use(async (status) => {
      let network = '';
      try {
        if (!page.url().startsWith('http')) await networkPage.openList();
        network = await provisionDisposableNetwork(page);
        // Approved with an effective time a minute ahead, so it reads Pending
        // until the lifecycle job runs; wait (up to ~4 min) for Active.
        let shown = '';
        for (let attempt = 1; attempt <= 24 && shown !== NETWORK_STATUS.active; attempt += 1) {
          await networkPage.openList();
          await networkPage.search(network);
          shown = (await networkPage.getStatusText(network).catch(() => '')).trim();
          if (shown !== NETWORK_STATUS.active) await page.waitForTimeout(10_000);
        }
        if (shown !== NETWORK_STATUS.active) throw new Error(`"${network}" was approved but still reads "${shown}" after ~4 minutes`);
      } catch (error) {
        blockedByPrecondition(testInfo, `a network displaying ${status} (a disposable network for this case)`, error);
      }
      if (status === NETWORK_STATUS.active) return network;

      Logger.step(`[fixture] Flipping "${network}" to ${status} to provision the precondition`);
      try {
        await networkPage.stageAndSubmit(network, 'inactivate');
        await approvals.open();
        await approvals.expectInQueue(network);
        await approvals.approve(network);
        // Confirm the flip landed, so a silent failure cannot hand the case a
        // network in the wrong state.
        await networkPage.openList();
        await networkPage.search(network);
        await networkPage.expectStatusText(network, status);
      } catch (error) {
        blockedByPrecondition(testInfo, `a network displaying ${status} ("${network}")`, error);
      }
      return network;
    });
  },
});
