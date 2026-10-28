import { test, expect } from '../../../fixtures';
import { NETWORK_LIFECYCLE, NETWORK_TOAST } from '../../../data/networks/network.data';
import { ACTIVATION_PROMPT } from '../../../data/networks/networkActivation.data';
import { minutesUntilEndOfToday } from '../../../data/networks/lifecycleJob.data';
import {
  ACTIVATION_AUDIT,
  BLOCKER_MESSAGE,
  CLEARED_INACTIVATION_FIELDS,
  FIXTURE_INACTIVATION_DETAILS,
  LIFECYCLE_TIMEOUT_MS,
  UNAUTHORISED,
  duplicateName,
} from '../../../data/networks/activateNetwork.data';
import { APPROVAL_CELL, AUDIT_EXPECTATION } from '../../../data/networks/deactivateNetwork.data';

/**
 * User story 14128: Activate network manually from Inactive status.
 * Eligibility (expiry, facility, owning payer, unique name), the approval
 * gate, what reactivation clears, and who may do it.
 *
 * Networks are the case's own (fixture `networkIn`); a network that needs an
 * owning payer is provisioned under a payer the case also provisioned.
 */
test.describe('US 14128 - Manual activation from Inactive', () => {
  test('TC-17822: should make an eligible Inactive network Active when its activation is approved', async ({
    networkManagementPage,
    networkIn,
    publishedPayer,
    toast,
    steps,
  }) => {
    test.setTimeout(LIFECYCLE_TIMEOUT_MS);
    const payer = publishedPayer.nameEn;
    const network = await networkIn('Inactive', { payerName: payer });

    await steps.critical('Navigate to the module - the network is listed Inactive under its active payer', async () => {
      await networkManagementPage.openListShowing(payer);
      await networkManagementPage.search(network.name);
      await networkManagementPage.expectStatusText(network.name, NETWORK_LIFECYCLE.inactive);
    });

    await steps.step('The detail screen shows Inactive with an enabled Activate action', async () => {
      const detail = await networkManagementPage.openDetails(network.name);
      await detail.expectStatus(NETWORK_LIFECYCLE.inactive);
      expect(await detail.getActionAvailability('activate'), 'Activate should be offered and enabled').toBe('available');
    });

    await steps.step('Activating passes the eligibility checks and is staged for approval', async () => {
      await networkManagementPage.openListShowing(payer);
      const wording = await networkManagementPage.stageStatusChange(network.name, 'activate');
      expect(wording.explanation, 'the prompt should state the approval step').toContain(ACTIVATION_PROMPT.approvalCaveat);
      await toast.expectText(NETWORK_TOAST.savedAsDraft);
    });

    await steps.step('Once the approver approves, the network is Active', async () => {
      await networkManagementPage.publishStagedChange(network.name, payer);
      expect(await networkManagementPage.readStatus(network.name, payer)).toBe(NETWORK_LIFECYCLE.active);
    });
  });

  test('TC-17823: should not offer Activate when the network is already Active', async ({
    networkManagementPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(LIFECYCLE_TIMEOUT_MS);
    const network = await networkIn('Active');

    await steps.critical('Navigate to the module - the network is listed Active', async () => {
      await networkManagementPage.openList();
      await networkManagementPage.search(network.name);
      await networkManagementPage.expectStatusText(network.name, NETWORK_LIFECYCLE.active);
    });

    await steps.step('The detail screen shows Active and offers no usable Activate', async () => {
      const detail = await networkManagementPage.openDetails(network.name);
      await detail.expectStatus(NETWORK_LIFECYCLE.active);
      expect(await detail.getActionAvailability('activate')).not.toBe('available');
    });

    await steps.step('The list row offers no usable Activate either', async () => {
      await networkManagementPage.openList();
      await networkManagementPage.search(network.name);
      await networkManagementPage.expectRowActionUnavailable(network.name, 'activate');
    });
  });

  test('TC-17824: should not offer a manual Activate when the network is Pending', async ({
    networkManagementPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(LIFECYCLE_TIMEOUT_MS);
    const network = await networkIn('Pending');

    await steps.critical('Navigate to the module - the network is listed Pending', async () => {
      await networkManagementPage.openList();
      await networkManagementPage.search(network.name);
      await networkManagementPage.expectStatusText(network.name, NETWORK_LIFECYCLE.pending);
    });

    await steps.step('The detail screen shows Pending and offers no usable Activate', async () => {
      const detail = await networkManagementPage.openDetails(network.name);
      await detail.expectStatus(NETWORK_LIFECYCLE.pending);
      expect(await detail.getActionAvailability('activate')).not.toBe('available');
    });

    await steps.step('The list row offers no usable Activate either', async () => {
      await networkManagementPage.openList();
      await networkManagementPage.search(network.name);
      await networkManagementPage.expectRowActionUnavailable(network.name, 'activate');
    });
  });

  test('TC-17825: should block activation and ask for an extended expiry when the network is past its expiry date', async ({
    networkManagementPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(LIFECYCLE_TIMEOUT_MS);
    const network = await networkIn('Expired');

    await steps.critical('Navigate to the module - the network past its expiry is listed', async () => {
      await networkManagementPage.openList();
      await networkManagementPage.search(network.name);
      await networkManagementPage.expectStatusText(network.name, NETWORK_LIFECYCLE.expired);
    });

    await steps.step('The detail screen shows the past expiry date', async () => {
      const detail = await networkManagementPage.openDetails(network.name);
      expect(await detail.readOverviewField('expiryDate'), 'the expiry date should be shown').not.toBe('');
    });

    await steps.step('Activate is blocked with a message to extend the expiry date first', async () => {
      await networkManagementPage.openList();
      await networkManagementPage.search(network.name);
      await networkManagementPage.expectRowActionUnavailable(network.name, 'activate');
      expect(await networkManagementPage.getRowActionMessage(network.name, 'activate')).toMatch(BLOCKER_MESSAGE.expiry);
    });
  });

  test('TC-17826: should treat an expiry date of today as not expired when an Inactive network is activated', async ({
    networkManagementPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(LIFECYCLE_TIMEOUT_MS);
    const network = await networkIn('Inactive', { expiryInMinutes: minutesUntilEndOfToday() });

    await steps.critical('Navigate to the module - the network is Inactive and expires today', async () => {
      await networkManagementPage.openList();
      await networkManagementPage.search(network.name);
      await networkManagementPage.expectStatusText(network.name, NETWORK_LIFECYCLE.inactive);
    });

    await steps.step('Activate is offered and the expiry date is not flagged as expired', async () => {
      await networkManagementPage.expectRowActionsEnabled(network.name, ['activate']);
      const result = await networkManagementPage.attemptActivation(network.name);
      expect(result.status, `activation should be accepted for checking: ${result.text.slice(0, 200)}`).toBeLessThan(300);
      expect(`${result.text} ${result.toast}`, 'no expiry blocker may be raised').not.toMatch(BLOCKER_MESSAGE.expiry);
    });
  });

  test('TC-17827: should block activation and require a pharmacy when the Inactive network has no assigned facility', async ({
    networkManagementPage,
    networkDetailPage,
    networkApprovalsPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(LIFECYCLE_TIMEOUT_MS);
    const network = await networkIn('Inactive');

    await steps.critical('Navigate to the module and empty the Inactive network\'s facility list', async () => {
      await networkDetailPage.open(network.id);
      const tab = networkDetailPage.facilities();
      await tab.open();
      const [facility] = await tab.readRows();
      expect(facility, 'the network should start with a facility to remove').toBeDefined();
      const removed = await tab.remove(facility.name);
      expect(removed?.status ?? 0, `removing from an Inactive network should be accepted: ${removed?.text.slice(0, 200)}`).toBeLessThan(300);
      await networkDetailPage.submitForApproval();
      await networkApprovalsPage.open();
      await networkApprovalsPage.approve(network.name);
    });

    await steps.critical('The detail screen shows Inactive with an empty facility list', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.expectStatus(NETWORK_LIFECYCLE.inactive);
      expect(await networkDetailPage.getTabCount('facilities'), 'no facility should remain').toBe(0);
    });

    await steps.step('Activate is blocked with a message requiring an assigned pharmacy', async () => {
      await networkManagementPage.openList();
      const result = await networkManagementPage.attemptActivation(network.name);
      expect(result.status, 'the activation must be refused').toBeGreaterThanOrEqual(400);
      expect(`${result.text} ${result.toast}`).toMatch(BLOCKER_MESSAGE.facility);
    });
  });

  test('TC-17829: should block activation when another Active network under the same payer has the same English name', async ({
    networkDetailPage,
    networkIn,
    publishedPayer,
    steps,
  }) => {
    test.setTimeout(35 * 60_000);
    const payer = publishedPayer.nameEn;
    const name = duplicateName();
    const networkB = await networkIn('Inactive', { nameEn: name, payerName: payer });
    const networkA = await networkIn('Active', { nameEn: name, payerName: payer });

    await steps.critical('Navigate to network A - it is Active under the payer', async () => {
      await networkDetailPage.open(networkA.id);
      await networkDetailPage.expectStatus(NETWORK_LIFECYCLE.active);
    });

    await steps.critical('Network B shows Inactive with the same name', async () => {
      await networkDetailPage.open(networkB.id);
      await networkDetailPage.expectStatus(NETWORK_LIFECYCLE.inactive);
      expect(await networkDetailPage.getName()).toBe(name);
    });

    await steps.step('Activating B is blocked: a network with that name is already Active under the payer', async () => {
      const result = await networkDetailPage.attemptActivation();
      expect(result.status, 'the activation must be refused').toBeGreaterThanOrEqual(400);
      expect(`${result.text} ${result.toast}`).toMatch(BLOCKER_MESSAGE.duplicateName);
    });
  });

  test('TC-17830: should activate the network when the same English name is Active only under a different payer', async ({
    networkDetailPage,
    networkApprovalsPage,
    networkIn,
    publishedPayer,
    secondPublishedPayer,
    steps,
  }) => {
    test.setTimeout(40 * 60_000);
    const name = duplicateName();
    const networkA = await networkIn('Active', { nameEn: name, payerName: publishedPayer.nameEn });
    const networkC = await networkIn('Inactive', { nameEn: name, payerName: secondPublishedPayer.nameEn });

    await steps.critical('Navigate to network A - it is Active under the first payer', async () => {
      await networkDetailPage.open(networkA.id);
      await networkDetailPage.expectStatus(NETWORK_LIFECYCLE.active);
    });

    await steps.step('Network C, same name under the second payer, is activated without a duplicate-name conflict', async () => {
      await networkDetailPage.open(networkC.id);
      await networkDetailPage.expectStatus(NETWORK_LIFECYCLE.inactive);
      const result = await networkDetailPage.attemptActivation();
      expect(result.status, `activation should be accepted: ${result.text.slice(0, 200)}`).toBeLessThan(300);
    });

    await steps.step('Once approved, network C is Active', async () => {
      await networkDetailPage.open(networkC.id);
      await networkDetailPage.submitForApproval();
      await networkApprovalsPage.open();
      await networkApprovalsPage.approve(name);
      await networkDetailPage.expectStatusEventually(networkC.id, NETWORK_LIFECYCLE.active, 3 * 60_000);
    });
  });

  test('TC-17831: should keep the network Inactive until an approval, and Inactive again after a rejection', async ({
    networkManagementPage,
    networkApprovalsPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(LIFECYCLE_TIMEOUT_MS);
    const network = await networkIn('Inactive');

    await steps.critical('Navigate to the module - the network is Inactive', async () => {
      await networkManagementPage.openList();
      await networkManagementPage.search(network.name);
      await networkManagementPage.expectStatusText(network.name, NETWORK_LIFECYCLE.inactive);
    });

    await steps.step('After submission the network awaits approval and is not yet Active', async () => {
      await networkManagementPage.stageStatusChange(network.name, 'activate');
      await networkManagementPage.openList();
      await networkManagementPage.submitForApproval(network.name);
      await networkManagementPage.expectApprovalCell(network.name, APPROVAL_CELL.pendingApproval);
      await networkManagementPage.expectStatusText(network.name, NETWORK_LIFECYCLE.inactive);
    });

    await steps.step('A rejection leaves the network Inactive', async () => {
      await networkApprovalsPage.open();
      await networkApprovalsPage.reject(network.name);
      expect(await networkManagementPage.readStatus(network.name)).toBe(NETWORK_LIFECYCLE.inactive);
    });

    await steps.step('Resubmitted and approved, the network becomes Active', async () => {
      await networkManagementPage.stageStatusChange(network.name, 'activate');
      await networkManagementPage.publishStagedChange(network.name);
      expect(await networkManagementPage.readStatus(network.name)).toBe(NETWORK_LIFECYCLE.active);
    });
  });

  test('TC-17832: should clear the recorded inactivation reason, details, performer and time when the network is reactivated', async ({
    networkManagementPage,
    networkDetailPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(LIFECYCLE_TIMEOUT_MS);
    const network = await networkIn('Inactive');

    await steps.critical('Navigate to the module - the Inactive network carries its inactivation record', async () => {
      await networkManagementPage.openList();
      const record = await networkManagementPage.readNetworkRecord(network.id);
      for (const field of CLEARED_INACTIVATION_FIELDS) {
        expect(record[field], `${field} should be recorded while Inactive`).toBeTruthy();
      }
    });

    await steps.step('The detail screen displays the prior inactivation details', async () => {
      await networkDetailPage.open(network.id);
      expect(await networkDetailPage.getMainText(), 'the recorded details should be shown').toContain(FIXTURE_INACTIVATION_DETAILS);
    });

    await steps.step('Activated and approved, the network is Active', async () => {
      await networkManagementPage.openList();
      await networkManagementPage.stageStatusChange(network.name, 'activate');
      await networkManagementPage.publishStagedChange(network.name);
      expect(await networkManagementPage.readStatus(network.name)).toBe(NETWORK_LIFECYCLE.active);
    });

    await steps.step('The reason, details, performer and time are cleared', async () => {
      const record = await networkManagementPage.readNetworkRecord(network.id);
      for (const field of CLEARED_INACTIVATION_FIELDS) {
        expect(record[field] ?? null, `${field} should be cleared on reactivation`).toBeNull();
      }
      await networkDetailPage.open(network.id);
      expect(await networkDetailPage.getMainText()).not.toContain(FIXTURE_INACTIVATION_DETAILS);
    });
  });

  test('TC-17836: should record the old and new status, the user and the time when an activation is approved', async ({
    networkManagementPage,
    networkDetailPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(LIFECYCLE_TIMEOUT_MS);
    const network = await networkIn('Inactive');

    await steps.critical('Navigate to the module - activate the network and have it approved', async () => {
      await networkManagementPage.openList();
      await networkManagementPage.stageStatusChange(network.name, 'activate');
      await networkManagementPage.publishStagedChange(network.name);
      expect(await networkManagementPage.readStatus(network.name)).toBe(NETWORK_LIFECYCLE.active);
    });

    await steps.step('The Audit History lists the status change', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.audit().open();
      await networkDetailPage.audit().expectEntry(ACTIVATION_AUDIT.action);
    });

    await steps.step('The entry shows Inactive -> Active, the user and the time', async () => {
      const audit = networkDetailPage.audit();
      const entries = await audit.readEntries();
      const index = entries.findIndex((e) => ACTIVATION_AUDIT.action.test(e.action) && e.by !== AUDIT_EXPECTATION.systemActor);
      expect(index, `a user-made Status Change entry should exist among ${JSON.stringify(entries)}`).toBeGreaterThanOrEqual(0);
      const entry = await audit.openEntry(index);
      expect(entry.changes.find((c) => ACTIVATION_AUDIT.statusField.test(c.field)), JSON.stringify(entry.changes)).toMatchObject({
        before: expect.stringContaining(ACTIVATION_AUDIT.before),
        after: expect.stringContaining(ACTIVATION_AUDIT.after),
      });
      expect(entry.meta).toMatch(ACTIVATION_AUDIT.meta);
      await audit.closeEntry();
    });
  });

  test('TC-17834: should withhold Activate from a user without the activation permission when they open an Inactive network', async ({
    networkManagementPage,
    networkIn,
    shapedNonAdmin,
    steps,
  }) => {
    test.setTimeout(LIFECYCLE_TIMEOUT_MS);
    const network = await networkIn('Inactive');

    await steps.critical('Navigate to the module - the administrator is offered Activate (baseline)', async () => {
      await networkManagementPage.openList();
      await networkManagementPage.search(network.name);
      await networkManagementPage.expectRowActionsEnabled(network.name, ['activate']);
    });

    const session = await shapedNonAdmin({ without: ['activateNetwork'] });

    await steps.step('Signed in without the permission, the Inactive network offers no usable Activate', async () => {
      await session.networks.openList();
      await session.networks.search(network.name);
      expect(await session.networks.getRowActionAvailability(network.name, 'activate')).not.toBe('available');
    });

    await steps.step('A direct activation request from that user is refused as unauthorised', async () => {
      const answer = await session.networks.submitStatusRequest('activate', network.id);
      expect(UNAUTHORISED, `the server must refuse: ${answer.status} ${answer.text.slice(0, 200)}`).toContain(answer.status);
    });
  });
});
