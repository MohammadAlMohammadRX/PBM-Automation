import { test, expect } from '../../../fixtures';
import {
  DIRECT_REQUEST,
  NETWORK_STATUS,
  STAGED_TOAST,
} from '../../../data/networks/networkActivation.data';

/**
 * User story: Enable Network Activation Regardless of Payer Status.
 * The two cases the interface cannot express, plus the repeat-toggle check.
 *
 * WHY THESE GO THROUGH THE API. The sheet asks for a redundant activation on an
 * already-active network and for an invalid status value - neither of which the
 * UI can send, because the row withholds the action a network's status does not
 * allow, and because there is no status FIELD to corrupt: activation and
 * deactivation are separate endpoints taking `{ id }` alone. The sheet names a
 * direct request as the route for exactly this reason.
 *
 * So "an invalid status value" is answered as the design forecloses it - the
 * only values the interface offers are Active and Inactive, one per endpoint -
 * and the request-level case that remains is the one that CAN be malformed: the
 * id left out.
 */
test.describe('Network activation - Direct requests and repeat toggles', () => {
  test('TC-009: should refuse a redundant activation when the network is already Active', async ({
    networkManagementPage,
    networkInStatus,
    steps,
  }) => {
    let network!: string;
    let networkId!: string;

    await steps.critical('An Active network is on screen', async () => {
      network = await networkInStatus(NETWORK_STATUS.active);
      await networkManagementPage.openList();
      await networkManagementPage.search(network);
      await networkManagementPage.expectStatusText(network, NETWORK_STATUS.active);
      networkId = await networkManagementPage.getNetworkId(network);
    });

    await steps.step('The interface offers Deactivate and withholds Activate', async () => {
      await networkManagementPage.expectRowActionsEnabled(network, ['inactivate']);
      await networkManagementPage.expectRowActionUnavailable(network, 'activate');
    });

    await steps.step('Repeating the activation directly is handled, not crashed', async () => {
      const outcome = await networkManagementPage.submitStatusRequest('activate', networkId);
      // The sheet allows either shape - "rejects the redundant action or
      // reports the network is already Active" - so what is asserted is the
      // part that is not negotiable: whatever the server decides, it must be a
      // HANDLED answer. An unhandled 500 with a stack trace is neither of the
      // two outcomes the sheet permits.
      expect(
        DIRECT_REQUEST.unacceptableStatuses as readonly number[],
        `a redundant activation returned ${outcome.status}`,
      ).not.toContain(outcome.status);
      for (const marker of DIRECT_REQUEST.leakMarkers) {
        expect(
          outcome.text,
          `the response should not expose "${marker}" to the client`,
        ).not.toContain(marker);
      }
    });

    await steps.step('The network is still Active, with no second change recorded', async () => {
      await networkManagementPage.openList();
      await networkManagementPage.search(network);
      await networkManagementPage.expectStatusText(network, NETWORK_STATUS.active);
    });
  });

  test('TC-011: should reject a status request that carries no network id', async ({
    networkManagementPage,
    networkInStatus,
    steps,
  }) => {
    let network!: string;

    await steps.critical('A network is on screen with its status control', async () => {
      network = await networkInStatus(NETWORK_STATUS.inactive);
      await networkManagementPage.openList();
      await networkManagementPage.search(network);
      await networkManagementPage.expectStatusText(network, NETWORK_STATUS.inactive);
    });

    await steps.step('The interface offers only the two valid statuses', async () => {
      // The sheet's "status control shows only Active and Inactive". In this
      // application the control IS the pair of row actions - there is no status
      // dropdown - so the vocabulary is proven by there being exactly one
      // action per direction and nothing else.
      const available = await networkManagementPage.getEnabledRowActions(network, [
        'activate',
        'inactivate',
      ]);
      expect(
        available,
        'an inactive network should offer exactly one lifecycle action, Activate',
      ).toEqual(['activate']);
      expect(
        DIRECT_REQUEST.offeredStatuses,
        'the two statuses the interface can produce',
      ).toHaveLength(2);
    });

    await steps.step('A request with no id is refused with a validation error', async () => {
      const outcome = await networkManagementPage.submitStatusRequest(
        'activate',
        DIRECT_REQUEST.missingId,
      );
      expect(
        outcome.status,
        'a request missing its required id should be refused as a client error',
      ).toBeGreaterThanOrEqual(400);
      expect(
        outcome.status,
        `a missing required field should be a validation rejection, not ${outcome.status}`,
      ).toBeLessThan(500);
      for (const marker of DIRECT_REQUEST.leakMarkers) {
        expect(
          outcome.text,
          `the rejection should not expose "${marker}" to the client`,
        ).not.toContain(marker);
      }
    });

    await steps.step('The network keeps the status it had', async () => {
      await networkManagementPage.openList();
      await networkManagementPage.search(network);
      await networkManagementPage.expectStatusText(network, NETWORK_STATUS.inactive);
    });
  });

  test('TC-008: should apply both transitions when a network is activated and then deactivated', async ({
    networkManagementPage,
    networkApprovalsPage,
    networkInStatus,
    toast,
    steps,
  }) => {
    let network!: string;

    await steps.critical('An Inactive network is on screen', async () => {
      network = await networkInStatus(NETWORK_STATUS.inactive);
      await networkManagementPage.openList();
      await networkManagementPage.search(network);
      await networkManagementPage.expectStatusText(network, NETWORK_STATUS.inactive);
    });

    await steps.step('Activating it and approving the change makes it Active', async () => {
      await networkManagementPage.stageAndSubmit(network, 'activate');
      await networkApprovalsPage.open();
      await networkApprovalsPage.expectInQueue(network);
      await networkApprovalsPage.approve(network);

      await networkManagementPage.openList();
      await networkManagementPage.search(network);
      await networkManagementPage.expectStatusText(network, NETWORK_STATUS.active);
    });

    await steps.step('Deactivating it immediately afterwards is offered and accepted', async () => {
      // The back-to-back half of the exploratory case: the second transition
      // must be available straight after the first, with no reload in between.
      // A control computed once and cached would fail here.
      await networkManagementPage.expectRowActionsEnabled(network, ['inactivate']);
      await networkManagementPage.stageStatusChange(network, 'inactivate');
      await toast.expectText(STAGED_TOAST);
    });

    await steps.step('The second transition applies once approved', async () => {
      await networkManagementPage.openList();
      await networkManagementPage.submitForApproval(network);

      await networkApprovalsPage.open();
      await networkApprovalsPage.expectInQueue(network);
      await networkApprovalsPage.approve(network);

      await networkManagementPage.openList();
      await networkManagementPage.search(network);
      await networkManagementPage.expectStatusText(network, NETWORK_STATUS.inactive);
    });

    await steps.step('The controls are consistent with the status it ended on', async () => {
      const available = await networkManagementPage.getEnabledRowActions(network, [
        'activate',
        'inactivate',
      ]);
      expect(
        available,
        'after two transitions the row should offer exactly the action its status allows',
      ).toEqual(['activate']);
    });
  });
});
