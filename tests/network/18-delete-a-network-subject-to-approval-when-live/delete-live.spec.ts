import { test, expect } from '../../../fixtures';
import { NETWORK_LIFECYCLE, NETWORK_SERVER_MESSAGE } from '../../../data/networks/network.data';
import {
  BLOCKED_CASES,
  CASE,
  DELETE_CHANGE_TYPE,
  FACILITY_BLOCKER,
} from '../../../data/networks/deleteNetwork.data';

/**
 * User story 14137: Delete a network, subject to approval when live.
 * The published half: a deletion staged as a draft, sent for review, decided
 * by a checker and applied - and the facility blocker.
 *
 * "Live with no dependencies" is an approved network with no facility (state
 * Pending, effective two days out) - see the data file for why.
 */
test.describe('US 14137 - Deleting a published network', () => {
  test(`TC-${CASE.liveWorkflow}: should stage, review, approve and only then apply the deletion when a live network is deleted`, async ({
    networkManagementPage,
    networkDetailPage,
    networkApprovalsPage,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Pending', { facilities: 0 });

    await steps.critical('Navigate to the live network and Delete - a deletion request is staged and the network stays live', async () => {
      await networkDetailPage.open(network.id);
      const result = await networkDetailPage.deleteAndCapture();
      expect(result.outcome?.status, `DeleteNetwork: ${result.outcome?.text.slice(0, 200)}`).toBeLessThan(300);
      expect(result.outcome?.text, 'a published network must not be discarded outright').not.toContain(NETWORK_SERVER_MESSAGE.draftDiscarded);
      expect(await networkManagementPage.isListed(network.name), 'the network stays listed until approved').toBe(true);
    });

    await steps.critical('Submit the deletion for review - it awaits review as a Delete request', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.submitForApproval();
      await networkApprovalsPage.open();
      await networkApprovalsPage.expectInQueue(network.name);
      await networkApprovalsPage.expectChangeType(network.name, DELETE_CHANGE_TYPE);
    });

    await steps.step('A reviewer approves the deletion request', async () => {
      await networkApprovalsPage.approve(network.name);
      await networkApprovalsPage.expectNotInQueue(network.name);
    });

    await steps.step('The approved deletion is applied - the network no longer appears as active', async () => {
      expect(await networkManagementPage.isListed(network.name), 'the deleted network must leave the list').toBe(false);
    });
  });

  test(`TC-${CASE.facilityBoundary}: should block deletion at exactly one facility and allow it at zero when the facility count crosses the boundary`, async ({
    networkManagementPage,
    networkDetailPage,
    networkIn,
    steps,
  }) => {
    const withOne = await networkIn('Pending', { facilities: 1 });
    const withNone = await networkIn('Pending', { facilities: 0 });

    await steps.critical('Navigate to Network X (one facility)', async () => {
      await networkDetailPage.open(withOne.id);
      expect(await networkDetailPage.getTabCount('facilities')).toBe(1);
    });

    await steps.step('Deleting Network X is blocked and the message names facilities', async () => {
      const result = await networkDetailPage.deleteAndCapture();
      const said = `${result.outcome?.text ?? ''} ${result.messages.join(' ')}`;
      expect(result.outcome?.status ?? 0, 'the deletion should be refused').toBeGreaterThanOrEqual(400);
      expect(said, 'the refusal should identify facilities as the blocker').toMatch(FACILITY_BLOCKER);
    });

    await steps.step('Removing the single facility brings the count to 0', async () => {
      await networkDetailPage.open(withOne.id);
      const tab = networkDetailPage.facilities();
      await tab.open();
      const [facility] = await tab.readRows();
      const outcome = await tab.remove(facility.name);
      expect(outcome?.status, `the removal should be accepted: ${outcome?.text.slice(0, 200)}`).toBeLessThan(300);
      await networkDetailPage.open(withOne.id);
      expect(await networkDetailPage.getTabCount('facilities')).toBe(0);
    });

    await steps.step('Retrying the deletion of Network X is now permitted', async () => {
      const result = await networkDetailPage.deleteAndCapture();
      expect(result.outcome?.status, `DeleteNetwork: ${result.outcome?.text.slice(0, 200)}`).toBeLessThan(300);
    });

    await steps.step('Deleting Network Y (no facility, no policy) is not blocked', async () => {
      await networkDetailPage.open(withNone.id);
      const result = await networkDetailPage.deleteAndCapture();
      expect(result.outcome?.status, `DeleteNetwork: ${result.outcome?.text.slice(0, 200)}`).toBeLessThan(300);
      expect(await networkManagementPage.isListed(withNone.name)).toBe(true);
    });
  });

  test(`TC-${CASE.facilityMessage}: should block the deletion with a message naming facilities when the network has assigned facilities`, async ({
    networkDetailPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(12 * 60_000);
    const network = await networkIn('Active');

    await steps.critical('Navigate to the network with an assigned facility', async () => {
      await networkDetailPage.open(network.id);
      expect(await networkDetailPage.getTabCount('facilities')).toBeGreaterThan(0);
    });

    await steps.step('Delete is prevented', async () => {
      const result = await networkDetailPage.deleteAndCapture();
      expect(result.outcome?.status ?? 0, `the deletion should be refused: ${result.outcome?.text.slice(0, 200)}`).toBeGreaterThanOrEqual(400);
      expect(`${result.outcome?.text ?? ''} ${result.messages.join(' ')}`, 'the message should name facilities').toMatch(FACILITY_BLOCKER);
    });

    await steps.step('The network is untouched - still Active', async () => {
      await networkDetailPage.open(network.id);
      expect(await networkDetailPage.getStatus()).toBe(NETWORK_LIFECYCLE.active);
    });
  });

  test(`TC-${CASE.selfApproval}: should not let the drafter approve the deletion request when they drafted it`, async ({
    networkDetailPage,
    networkApprovalsPage,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Pending', { facilities: 0 });

    await steps.critical('Navigate to the live network and draft its deletion - it is pending approval', async () => {
      await networkDetailPage.open(network.id);
      expect((await networkDetailPage.deleteAndCapture()).outcome?.status).toBeLessThan(300);
      await networkDetailPage.open(network.id);
      await networkDetailPage.submitForApproval();
      await networkApprovalsPage.open();
      await networkApprovalsPage.expectInQueue(network.name);
    });

    await steps.step('The same user cannot approve it - the action is hidden or refused', async () => {
      await networkApprovalsPage.expectSelfApprovalPrevented(network.name);
    });
  });

  test(`TC-${CASE.reviewerOnly}: should let only a reviewer approve a pending deletion when users with and without approval rights open it`, async ({
    networkManagementPage,
    networkDetailPage,
    networkApprovalsPage,
    nonAdminSession,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Pending', { facilities: 0 });

    await steps.critical('Navigate to the live network and stage its deletion for review', async () => {
      await networkDetailPage.open(network.id);
      expect((await networkDetailPage.deleteAndCapture()).outcome?.status).toBeLessThan(300);
      await networkDetailPage.open(network.id);
      await networkDetailPage.submitForApproval();
    });

    await steps.step('A user without approval permission is offered no usable Approve', async () => {
      await nonAdminSession.networkApprovals.open();
      expect((await nonAdminSession.networkApprovals.getDecisionAvailability(network.name)).approve).toBe(false);
    });

    await steps.step('A reviewer is offered an enabled Approve', async () => {
      await networkApprovalsPage.open();
      expect((await networkApprovalsPage.getDecisionAvailability(network.name)).approve).toBe(true);
    });

    await steps.step('The reviewer approves - the request is decided and the deletion applied', async () => {
      await networkApprovalsPage.approve(network.name);
      await networkApprovalsPage.expectNotInQueue(network.name);
      expect(await networkManagementPage.isListed(network.name)).toBe(false);
    });
  });

  test(`TC-${CASE.rejection}: should leave the network live and allow a new request when a deletion request is rejected`, async ({
    networkManagementPage,
    networkDetailPage,
    networkApprovalsPage,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Pending', { facilities: 0 });

    await steps.critical('Navigate to the pending deletion as a reviewer - Approve and Reject are offered', async () => {
      await networkDetailPage.open(network.id);
      expect((await networkDetailPage.deleteAndCapture()).outcome?.status).toBeLessThan(300);
      await networkDetailPage.open(network.id);
      await networkDetailPage.submitForApproval();
      await networkApprovalsPage.open();
      expect(await networkApprovalsPage.getDecisionAvailability(network.name)).toEqual({ inQueue: true, approve: true, reject: true });
    });

    await steps.step('Rejecting it leaves the network live and unaffected', async () => {
      await networkApprovalsPage.reject(network.name);
      await networkApprovalsPage.expectNotInQueue(network.name);
      expect(await networkManagementPage.isListed(network.name)).toBe(true);
      await networkDetailPage.open(network.id);
      expect(await networkDetailPage.getStatus()).toBe(NETWORK_LIFECYCLE.pending);
    });

    await steps.step('A new deletion request can be drafted afterwards', async () => {
      const result = await networkDetailPage.deleteAndCapture();
      expect(result.outcome?.status, `DeleteNetwork: ${result.outcome?.text.slice(0, 200)}`).toBeLessThan(300);
    });
  });

  test(`TC-${CASE.crossModule}: should drop the network from every selection list when its deletion is applied`, async ({
    networkManagementPage,
    networkDetailPage,
    networkApprovalsPage,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Pending', { facilities: 0 });

    await steps.critical('Navigate to the module - the network is selectable elsewhere before deletion', async () => {
      await networkManagementPage.openList();
      const before = await networkManagementPage.readSelectableNetworks(network.name);
      expect(before.status, 'the cross-module network feed should answer').toBe(200);
      expect(before.names, 'baseline: the live network is offered').toContain(network.name);
    });

    await steps.critical('Apply the approved deletion', async () => {
      await networkDetailPage.open(network.id);
      expect((await networkDetailPage.deleteAndCapture()).outcome?.status).toBeLessThan(300);
      await networkDetailPage.open(network.id);
      await networkDetailPage.submitForApproval();
      await networkApprovalsPage.open();
      await networkApprovalsPage.approve(network.name);
    });

    await steps.step('The deleted network no longer appears in the active list', async () => {
      expect(await networkManagementPage.isListed(network.name)).toBe(false);
    });

    await steps.step('It is no longer offered as a selectable network elsewhere', async () => {
      const after = await networkManagementPage.readSelectableNetworks(network.name);
      expect(after.names, 'other modules must not offer a deleted network').not.toContain(network.name);
    });
  });

  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.azureId}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
