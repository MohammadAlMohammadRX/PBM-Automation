import { test, expect } from '../../../fixtures';
import { NETWORK_STATUS } from '../../../data/networks/networkActivation.data';

/**
 * User story: Enable Network Activation Regardless of Payer Status.
 * The consistency check across the interface.
 *
 * One network, one status, wherever it is shown - and a payer whose own status
 * is a separate fact from its networks'. This one can pass, and does.
 *
 * The missing activation control in the payer's Networks tab is reported by
 * TC-001, at the step where the sheet first calls for it, and is deliberately
 * not re-asserted here: one gap, reported once.
 *
 * The linked pair is one that ALREADY exists rather than one this case makes.
 * Assigning a network needs one from the Assign Network drawer's pool of live,
 * unassigned networks, and that pool is exhausted in this environment - a payer
 * holding a network cannot be deleted, so earlier runs' links were never
 * released. Reading an existing link costs nothing and changes nothing.
 */
test.describe('Network activation - Status consistency across the interface', () => {
  test('TC-010: should report one consistent network status wherever it is shown, independent of the payer', async ({
    payerManagementPage,
    networkManagementPage,
    steps,
  }) => {
    let holderName!: string;
    let network!: string;
    let statusInTab!: string;
    let payerStatus!: string;

    await steps.critical('Navigate to the Payer Management module', async () => {
      await payerManagementPage.open();
      await payerManagementPage.expectRowsRendered();
    });

    await steps.critical('Open a payer that holds a linked network', async () => {
      const holder = await payerManagementPage.findPayerWithNetworkDependency();
      holderName = holder.name;
      payerStatus = await payerManagementPage.getLifecycleStatus(holderName);
      expect(payerStatus, 'the payer should display a lifecycle status').not.toBe('');

      const detail = await payerManagementPage.openDetails(holderName);
      const row = await detail.getFirstLinkedNetwork();
      network = row.name;
      statusInTab = row.status;
      expect(network, 'the linked row should name its network').not.toBe('');
      expect(statusInTab, 'the linked row should report the network a status').not.toBe('');
    });

    await steps.step('The Networks tab reports the network its own status', async () => {
      // Read back through the named accessor as well as the row scan, so the
      // value the rest of the case compares against is the one the tab renders
      // for THIS network rather than whatever sat in the first row.
      const detail = payerManagementPage.detail();
      expect(
        await detail.getLinkedNetworkStatus(network),
        'the tab should report a status for the network it lists',
      ).toBe(statusInTab);
    });

    await steps.step('The Network module outside the payer reports the same status', async () => {
      await networkManagementPage.openList();
      await networkManagementPage.search(network);
      const statusInModule = await networkManagementPage.getStatusText(network);
      expect(
        statusInModule,
        `the payer tab says "${statusInTab}" for "${network}" - the network module must agree`,
      ).toBe(statusInTab);
    });

    await steps.step('The payer keeps its own status, whatever its network reads', async () => {
      // The independence claim as two facts: the payer's status did not move,
      // and what the network reports is drawn from the network's own
      // vocabulary. Both are needed - an unchanged payer status alone would
      // still pass if the two happened to be the same word.
      await payerManagementPage.open();
      await payerManagementPage.search(holderName);
      await payerManagementPage.expectLifecycleStatus(holderName, payerStatus);
      expect(
        [
          NETWORK_STATUS.active,
          NETWORK_STATUS.inactive,
          NETWORK_STATUS.expired,
          NETWORK_STATUS.notLive,
        ],
        `the network reads "${statusInTab}", which should be a network lifecycle status`,
      ).toContain(statusInTab);
    });
  });
});
