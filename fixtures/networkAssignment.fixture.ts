import { test as base } from '@playwright/test';
import { PayerManagementPage } from '../pages/payer/PayerManagementPage';
import { Logger } from '../utils/Logger';
import { blockedByPrecondition } from './testStatus.fixture';

/**
 * The assignable-network pool.
 *
 * WHAT THE POOL IS. The Assign Network drawer offers only networks that belong
 * to no payer. Assigning one is maker-checker, so a network leaves the pool the
 * moment a request for it is submitted - not when it is approved.
 *
 * IT IS EMPTY IN THIS ENVIRONMENT, and this suite emptied it: every dependency
 * test links a network to a payer, a payer holding a network cannot be deleted,
 * and so no link was ever released. The drawer renders "No results found", and
 * `AssignNetworkDrawer.selectNetwork` already turns that into a readable
 * failure.
 *
 * WHY THIS FIXTURE DOES NOT REFILL IT. An earlier version did: it unassigned a
 * network from an automation payer, submitted the removal and approved it. That
 * failed repeatedly here - the payers holding networks already carried staged
 * changes, their submissions raised no confirmation dialog, and each attempt
 * left ANOTHER pending removal behind on a shared record. A fixture that
 * mutates shared data on every attempt and still cannot guarantee the
 * precondition is worse than one that reports the precondition missing. So this
 * one reports.
 *
 * The message names the remedy, and it is a short job by hand: unassign a
 * network from any payer and approve the removal, or create a network in
 * Network Management and approve it. Once the pool holds anything, every case
 * in this story runs for real with no change here.
 */
export interface NetworkAssignmentFixtures {
  /**
   * The name of a network that can be assigned; BLOCKED when the pool is empty.
   *
   * Takes the payer whose drawer should be looked through - see
   * `PayerManagementPage.peekAssignableNetwork` for why that is a parameter
   * rather than "whichever payer happens to be first".
   */
  assignableNetwork: (payerName: string) => Promise<string>;
}

/** What to do about an empty pool, stated where a reader will need it. */
const EMPTY_POOL_REMEDY =
  'the Assign Network drawer offers no network: every network in this environment already '
  + 'belongs to a payer, and a payer holding one cannot be deleted, so the links were never '
  + 'released. Free one by unassigning it from a payer and approving the removal, or create a '
  + 'network in Network Management and approve it - then every case in this story runs.';

export const test = base.extend<NetworkAssignmentFixtures>({
  assignableNetwork: async ({ page }, use, testInfo) => {
    const payerPage = new PayerManagementPage(page);

    await use(async (payerName: string) => {
      const available = await payerPage.peekAssignableNetwork(payerName).catch(() => null);

      if (available === null) {
        blockedByPrecondition(
          testInfo,
          'a network available to assign',
          new Error(EMPTY_POOL_REMEDY),
        );
      }

      Logger.step(`[fixture] The assignable pool offers "${available}"`);
      return available!;
    });
  },
});
