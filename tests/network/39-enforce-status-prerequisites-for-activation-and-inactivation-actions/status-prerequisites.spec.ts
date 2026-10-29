import { test, expect } from '../../../fixtures';
import { NETWORK_LIFECYCLE, NETWORK_MESSAGE, NETWORK_TOAST } from '../../../data/networks/network.data';
import { ACTIVATION_PROMPT } from '../../../data/networks/networkActivation.data';
import { minutesUntilEndOfToday } from '../../../data/networks/lifecycleJob.data';
import {
  EXPIRY_GUIDANCE,
  EXTENDED_EXPIRY,
  LIFECYCLE_TIMEOUT_MS,
  MATRIX_TIMEOUT_MS,
  UNAUTHORISED,
} from '../../../data/networks/statusPrerequisites.data';
import { APPROVAL_CELL } from '../../../data/networks/deactivateNetwork.data';

/**
 * User story 14318: Enforce status prerequisites for activation and
 * inactivation actions.
 * Which status allows which lifecycle action - asserted on the screen AND on
 * the wire, because a hidden button proves nothing about the server.
 */
test.describe('US 14318 - Status prerequisites for lifecycle actions', () => {
  test('TC-18236: should make an Active network Inactive when it is inactivated and approved', async ({
    networkManagementPage,
    networkDetailPage,
    networkIn,
    toast,
    steps,
  }) => {
    test.setTimeout(LIFECYCLE_TIMEOUT_MS);
    const network = await networkIn('Active');

    await steps.critical('Navigate to the module - the network is listed Active', async () => {
      await networkManagementPage.openList();
      await networkManagementPage.search(network.name);
      await networkManagementPage.expectStatusText(network.name, NETWORK_LIFECYCLE.active);
    });

    await steps.step('Inactivate opens the inactivation dialog and confirming reports success', async () => {
      const wording = await networkManagementPage.stageStatusChange(network.name, 'inactivate');
      expect(wording.title).toBe(NETWORK_MESSAGE.inactivateTitle);
      await toast.expectText(NETWORK_TOAST.savedAsDraft);
    });

    await steps.step('Reopened after approval, the network reads Inactive', async () => {
      await networkManagementPage.publishStagedChange(network.name);
      await networkDetailPage.open(network.id);
      await networkDetailPage.expectStatus(NETWORK_LIFECYCLE.inactive);
    });
  });

  test('TC-18238: should make an Inactive network Active when it is activated and approved', async ({
    networkManagementPage,
    networkDetailPage,
    networkIn,
    toast,
    steps,
  }) => {
    test.setTimeout(LIFECYCLE_TIMEOUT_MS);
    const network = await networkIn('Inactive');

    await steps.critical('Navigate to the module - the network is listed Inactive', async () => {
      await networkManagementPage.openList();
      await networkManagementPage.search(network.name);
      await networkManagementPage.expectStatusText(network.name, NETWORK_LIFECYCLE.inactive);
    });

    await steps.step('Activate raises a confirmation prompt', async () => {
      const prompt = await networkManagementPage.openActivationPrompt(network.name);
      expect(await prompt.getTitle()).toBe(ACTIVATION_PROMPT.title);
      expect(await prompt.getMessage()).toContain(network.name);
      await prompt.confirm('activate');
    });

    await steps.step('Confirming reports success', async () => {
      await toast.expectText(NETWORK_TOAST.savedAsDraft);
    });

    await steps.step('Reopened after approval, the network reads Active', async () => {
      await networkManagementPage.publishStagedChange(network.name);
      await networkDetailPage.open(network.id);
      await networkDetailPage.expectStatus(NETWORK_LIFECYCLE.active);
    });
  });

  test('TC-18243: should offer exactly the allowed lifecycle action for each of Active, Inactive and Expired', async ({
    networkManagementPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(MATRIX_TIMEOUT_MS);
    const active = await networkIn('Active');
    const inactive = await networkIn('Inactive');
    const expired = await networkIn('Expired');

    await steps.critical('Navigate to the module - the three networks are listed', async () => {
      await networkManagementPage.openList();
      await networkManagementPage.search(active.name);
      await networkManagementPage.expectStatusText(active.name, NETWORK_LIFECYCLE.active);
    });

    await steps.step('Active: Inactivate enabled, Activate not offered', async () => {
      await networkManagementPage.openList();
      await networkManagementPage.search(active.name);
      await networkManagementPage.expectRowActionsEnabled(active.name, ['inactivate']);
      await networkManagementPage.expectRowActionUnavailable(active.name, 'activate');
    });

    await steps.step('Inactive: Activate enabled, Inactivate not offered', async () => {
      await networkManagementPage.openList();
      await networkManagementPage.search(inactive.name);
      await networkManagementPage.expectRowActionsEnabled(inactive.name, ['activate']);
      await networkManagementPage.expectRowActionUnavailable(inactive.name, 'inactivate');
    });

    await steps.step('Expired: neither action usable, with a message that the expiry must be extended', async () => {
      await networkManagementPage.openList();
      await networkManagementPage.search(expired.name);
      await networkManagementPage.expectRowActionUnavailable(expired.name, 'activate');
      await networkManagementPage.expectRowActionUnavailable(expired.name, 'inactivate');
      expect(await networkManagementPage.getRowActionMessage(expired.name, 'activate')).toMatch(EXPIRY_GUIDANCE);
    });
  });

  test('TC-18244: should take an Expired network out of Expired when its expiry date is extended and approved', async ({
    networkManagementPage,
    networkApprovalsPage,
    networkDetailPage,
    networkIn,
    toast,
    steps,
  }) => {
    test.setTimeout(LIFECYCLE_TIMEOUT_MS);
    const network = await networkIn('Expired');

    await steps.critical('Navigate to the module - the network is listed Expired', async () => {
      await networkManagementPage.openList();
      await networkManagementPage.search(network.name);
      await networkManagementPage.expectStatusText(network.name, NETWORK_LIFECYCLE.expired);
    });

    await steps.step('A valid future expiry date is accepted and saved', async () => {
      const form = await networkManagementPage.openEditForm(network.name);
      await form.editField('expiryDate', EXTENDED_EXPIRY);
      const outcome = await form.saveEditAndCapture();
      expect(outcome?.status ?? 0, `the extended expiry should save: ${outcome?.text.slice(0, 200)}`).toBeLessThan(300);
      await toast.expectText(NETWORK_TOAST.savedAsDraft);
    });

    await steps.step('Sent for approval, the change awaits a decision', async () => {
      await networkManagementPage.openList();
      await networkManagementPage.submitForApproval(network.name);
      await networkManagementPage.expectApprovalCell(network.name, APPROVAL_CELL.pendingApproval);
    });

    await steps.step('Approved, the network leaves Expired and reads Active', async () => {
      await networkApprovalsPage.open();
      await networkApprovalsPage.approve(network.name);
      await networkDetailPage.expectStatusEventually(network.id, NETWORK_LIFECYCLE.active, 4 * 60_000);
    });
  });

  test('TC-18245: should cycle Active -> Inactive -> Active -> Inactive when the transitions are repeated', async ({
    networkManagementPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(35 * 60_000);
    const network = await networkIn('Active');

    await steps.critical('Navigate to the module - the network is listed Active', async () => {
      await networkManagementPage.openList();
      await networkManagementPage.search(network.name);
      await networkManagementPage.expectStatusText(network.name, NETWORK_LIFECYCLE.active);
    });

    await steps.critical('Inactivated, it reads Inactive', async () => {
      await networkManagementPage.stageStatusChange(network.name, 'inactivate');
      await networkManagementPage.publishStagedChange(network.name);
      expect(await networkManagementPage.readStatus(network.name)).toBe(NETWORK_LIFECYCLE.inactive);
    });

    await steps.critical('Reactivated, it reads Active', async () => {
      await networkManagementPage.stageStatusChange(network.name, 'activate');
      await networkManagementPage.publishStagedChange(network.name);
      expect(await networkManagementPage.readStatus(network.name)).toBe(NETWORK_LIFECYCLE.active);
    });

    await steps.step('Inactivated again, it reads Inactive - the transition repeats', async () => {
      await networkManagementPage.stageStatusChange(network.name, 'inactivate');
      await networkManagementPage.publishStagedChange(network.name);
      expect(await networkManagementPage.readStatus(network.name)).toBe(NETWORK_LIFECYCLE.inactive);
    });
  });

  test('TC-18246: should allow lifecycle actions on the expiry day and block them once the date has passed', async ({
    networkManagementPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(MATRIX_TIMEOUT_MS);
    const expiresToday = await networkIn('Active', { expiryInMinutes: minutesUntilEndOfToday() });
    const expired = await networkIn('Expired');

    await steps.critical('Navigate to the module - the network expiring today is still Active', async () => {
      await networkManagementPage.openList();
      await networkManagementPage.search(expiresToday.name);
      await networkManagementPage.expectStatusText(expiresToday.name, NETWORK_LIFECYCLE.active);
      await networkManagementPage.expectRowActionsEnabled(expiresToday.name, ['inactivate']);
    });

    await steps.step('Inactivating it on its expiry day succeeds', async () => {
      await networkManagementPage.stageStatusChange(expiresToday.name, 'inactivate');
      await networkManagementPage.publishStagedChange(expiresToday.name);
      expect(await networkManagementPage.readStatus(expiresToday.name)).toBe(NETWORK_LIFECYCLE.inactive);
    });

    await steps.step('The network past its expiry reads Expired with both actions blocked', async () => {
      await networkManagementPage.openList();
      await networkManagementPage.search(expired.name);
      await networkManagementPage.expectStatusText(expired.name, NETWORK_LIFECYCLE.expired);
      await networkManagementPage.expectRowActionUnavailable(expired.name, 'activate');
      await networkManagementPage.expectRowActionUnavailable(expired.name, 'inactivate');
    });
  });

  test('TC-18248: should withhold Activate and Inactivate from a user without the lifecycle permissions', async ({
    networkManagementPage,
    networkIn,
    shapedNonAdmin,
    steps,
  }) => {
    test.setTimeout(MATRIX_TIMEOUT_MS);
    const active = await networkIn('Active');
    const inactive = await networkIn('Inactive');

    await steps.critical('Navigate to the module - the administrator is offered both actions (baseline)', async () => {
      await networkManagementPage.openList();
      await networkManagementPage.search(active.name);
      await networkManagementPage.expectRowActionsEnabled(active.name, ['inactivate']);
      await networkManagementPage.openList();
      await networkManagementPage.search(inactive.name);
      await networkManagementPage.expectRowActionsEnabled(inactive.name, ['activate']);
    });

    const session = await shapedNonAdmin({ without: ['activateNetwork', 'inactivateNetwork'] });

    await steps.step('The restricted user is offered no usable Inactivate on the Active network', async () => {
      await session.networks.openList();
      await session.networks.search(active.name);
      expect(await session.networks.getRowActionAvailability(active.name, 'inactivate')).not.toBe('available');
    });

    await steps.step('The restricted user is offered no usable Activate on the Inactive network', async () => {
      await session.networks.openList();
      await session.networks.search(inactive.name);
      expect(await session.networks.getRowActionAvailability(inactive.name, 'activate')).not.toBe('available');
    });

    await steps.step('Direct requests from that user are refused as unauthorised', async () => {
      const activate = await session.networks.submitStatusRequest('activate', inactive.id);
      const inactivate = await session.networks.submitStatusRequest('inactivate', active.id);
      expect(UNAUTHORISED, `activate answered ${activate.status}`).toContain(activate.status);
      expect(UNAUTHORISED, `inactivate answered ${inactivate.status}`).toContain(inactivate.status);
    });
  });

  test('TC-18250: should show the same allowed actions in the list and the detail view and survive a refresh mid-change', async ({
    networkManagementPage,
    networkDetailPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(MATRIX_TIMEOUT_MS);
    const networks = [await networkIn('Active'), await networkIn('Inactive'), await networkIn('Expired')];

    await steps.critical('Navigate to the module - the networks are listed', async () => {
      await networkManagementPage.openList();
      await networkManagementPage.search(networks[0].name);
      await networkManagementPage.expectRowsRendered();
    });

    await steps.step('Each network\'s detail view offers the same lifecycle actions as its list row', async () => {
      for (const network of networks) {
        await networkManagementPage.openList();
        await networkManagementPage.search(network.name);
        const listed = {
          activate: (await networkManagementPage.getRowActionAvailability(network.name, 'activate')) === 'available',
          inactivate: (await networkManagementPage.getRowActionAvailability(network.name, 'inactivate')) === 'available',
        };
        await networkDetailPage.open(network.id);
        const detailed = {
          activate: (await networkDetailPage.getActionAvailability('activate')) === 'available',
          inactivate: (await networkDetailPage.getActionAvailability('inactivate')) === 'available',
        };
        expect(detailed, `"${network.name}": detail view vs list row`).toEqual(listed);
      }
    });

    await steps.step('Refreshed right after a change is staged, the network shows a consistent state', async () => {
      await networkManagementPage.openList();
      await networkManagementPage.stageStatusChange(networks[0].name, 'inactivate');
      await networkManagementPage.reload();
      await networkManagementPage.expectApprovalCell(networks[0].name, APPROVAL_CELL.draft);
      await networkManagementPage.expectStatusText(networks[0].name, NETWORK_LIFECYCLE.active);
    });
  });
});
