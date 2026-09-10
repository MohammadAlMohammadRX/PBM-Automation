import { test as base } from '@playwright/test';
import { NetworkManagementPage } from '../pages/network/NetworkManagementPage';
import { ApprovalManagementPage } from '../pages/approval/ApprovalManagementPage';
import { NETWORK_STATUS } from '../data/networks/networkActivation.data';
import { Logger } from '../utils/Logger';
import { blockedByPrecondition } from './testStatus.fixture';

/**
 * Network-state fixtures.
 *
 * The network-activation story needs a network in a KNOWN lifecycle state, and
 * that state has to come from the environment: a network cannot be created into
 * one - a new one is an unapproved draft reading "Not Live", with no lifecycle
 * action at all until it has been approved.
 *
 * So this SAMPLES first and FLIPS when sampling comes up empty. The flip is
 * symmetric, and it has to be: this environment holds exactly ONE network in a
 * live status. Sampling alone worked for the first case and then blocked the
 * second, because the first case had just flipped the only candidate to the
 * other state. Manufacturing in one direction only would have kept doing that.
 *
 * A flip is a real, approved status change to a shared record - which is
 * acceptable here for two reasons: the networks in question are this suite's
 * own leftovers ("Automation Network ..."), and flipping status is precisely
 * the operation the story is about, performed the way the application intends.
 * Nothing is deleted and no other data is touched.
 *
 * When the environment holds no live network at all, the fixture reports
 * BLOCKED rather than failing: the rule under test was never exercised, and
 * calling that a defect would assert something never observed.
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
      const found = await networkPage.findNetworkWithStatus(status);
      if (found !== null) return found;

      // Nothing in the wanted state, so flip one from the other live state.
      // Expired and Not Live are deliberately not candidates: an expired
      // network's Activate is disabled by the expiry guardrail, and a Not Live
      // draft has no status to change.
      const opposite = status === NETWORK_STATUS.active
        ? NETWORK_STATUS.inactive
        : NETWORK_STATUS.active;
      // { settled: true }: a candidate carrying a pending change cannot be
      // flipped - the server validates against the staged state while the list
      // shows the published one, and the refusal reads as nonsense against what
      // is on screen. See NetworkManagementPage.findNetworkWithStatus.
      const candidate = await networkPage.findNetworkWithStatus(opposite, { settled: true });
      if (candidate === null) {
        blockedByPrecondition(
          testInfo,
          `a network displaying ${status}`,
          new Error(
            `the environment holds no network displaying ${status} or ${opposite}, so there is `
            + 'nothing whose activation could be exercised. Approve a network draft, or free an '
            + 'expired network by extending its expiry date.',
          ),
        );
      }

      const direction = status === NETWORK_STATUS.active ? 'activate' : 'inactivate';
      Logger.step(`[fixture] Flipping "${candidate}" to ${status} to provision the precondition`);
      try {
        await networkPage.stageAndSubmit(candidate!, direction);
        await approvals.open();
        await approvals.expectInQueue(candidate!);
        await approvals.approve(candidate!);

        // Confirm the flip actually landed. Without this a fixture that failed
        // silently would hand the case a network in the WRONG state, and the
        // case would then report "the action was withheld" - true, but for a
        // reason that has nothing to do with the rule under test.
        await networkPage.openList();
        await networkPage.search(candidate!);
        await networkPage.expectStatusText(candidate!, status);
      } catch (error) {
        blockedByPrecondition(testInfo, `a network displaying ${status} ("${candidate}")`, error);
      }
      return candidate!;
    });
  },
});
