import { test, expect } from '../../../fixtures';
import { NETWORK_COLUMN } from '../../../constants/ElementIds';
import type { LinkedNetworkCandidate } from '../../../fixtures/networkLinkState.fixture';
import {
  DRAFT_REMOVAL_LABEL,
  IN_FLIGHT_STATE,
  REMOVAL_REJECTION_REASON,
} from '../../../data/payers/draftAssignmentStates.data';
import {
  BLOCKED_CASES,
  NO_DEPENDENT_POLICIES,
  UNASSIGN_ACTION,
  UNOWNED_MARKER,
} from '../../../data/payers/removalDependency.data';

/**
 * User story: Re-check Network Removal Dependency at Both Staging and Approval.
 *
 * The positive path runs for real on the removals the register already holds -
 * submitted, undecided, on networks with no policies - and approving one also
 * frees a network for every story blocked on an empty assignable pool. Every
 * case that needs a network WITH dependent policies is BLOCKED on one.
 */
test.describe('Network removal dependency re-check', () => {
  test('TC-001: should remove the network when a dependency-free removal is staged and approved', async ({
    payerManagementPage,
    approvalManagementPage,
    networkManagementPage,
    linkedNetwork,
    steps,
  }) => {
    test.slow();
    let candidate!: LinkedNetworkCandidate;

    await steps.critical('Navigate to the module and find a submitted removal of a network with no dependent policies', async () => {
      candidate = await linkedNetwork('pendingRemoval');
      await networkManagementPage.openList();
      await networkManagementPage.search(candidate.network);
      const policies = await networkManagementPage.getCellValue(
        candidate.network,
        NETWORK_COLUMN.linkedPolicies,
      );
      expect(
        policies,
        `the case needs a network with no dependent policies; "${candidate.network}" shows ${policies}`,
      ).toBe(NO_DEPENDENT_POLICIES);
    });

    await steps.step('The staged request is awaiting approval', async () => {
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(candidate.payer);
    });

    await steps.step('The reviewer approves and the re-check finds no dependency', async () => {
      await approvalManagementPage.approve(candidate.payer);
    });

    await steps.step('The network is no longer linked to the payer', async () => {
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(candidate.payer);
      const linked = (await detail.getLinkedNetworkRows()).map((row) => row.name);
      expect(
        linked,
        `"${candidate.network}" should have been removed from "${candidate.payer}"`,
      ).not.toContain(candidate.network);
    });

    await steps.step('And the Network list shows it as owned by no payer', async () => {
      await networkManagementPage.openList();
      await networkManagementPage.search(candidate.network);
      const owner = await networkManagementPage.getCellValue(candidate.network, NETWORK_COLUMN.payer);
      expect(
        owner === '' || UNOWNED_MARKER.test(owner),
        `"${candidate.network}" should be released; the Network list still shows owner "${owner}"`,
      ).toBe(true);
    });
  });

  test('TC-006: should complete the removal when a rejected request is reviewed, re-staged and approved', async ({
    payerManagementPage,
    approvalManagementPage,
    linkedNetwork,
    steps,
  }) => {
    test.slow();
    let candidate!: LinkedNetworkCandidate;

    await steps.critical('Navigate to the module and find a submitted removal awaiting approval', async () => {
      candidate = await linkedNetwork('pendingRemoval');
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(candidate.payer);
    });

    await steps.step('The approver rejects the request', async () => {
      await approvalManagementPage.reject(candidate.payer, REMOVAL_REJECTION_REASON);
    });

    await steps.step('The requester finds the link restored for review', async () => {
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(candidate.payer);
      const state = await detail.getLinkedNetworkAssignmentState(candidate.network);
      expect(
        IN_FLIGHT_STATE.test(state),
        `after rejection the link should be back to its published state; it reads "${state}"`,
      ).toBe(false);
    });

    await steps.step('The requester re-stages the removal and resubmits it', async () => {
      const detail = payerManagementPage.detail();
      await detail.unassignNetwork(candidate.network);
      expect(await detail.getLinkedNetworkAssignmentState(candidate.network)).toBe(DRAFT_REMOVAL_LABEL);
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(candidate.payer);
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(candidate.payer);
    });

    await steps.step('Approval removes the network', async () => {
      await approvalManagementPage.approve(candidate.payer);
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(candidate.payer);
      const linked = (await detail.getLinkedNetworkRows()).map((row) => row.name);
      expect(linked, `"${candidate.network}" should have been removed`).not.toContain(candidate.network);
    });
  });

  test('TC-011: should offer removal only against a linked network row', async ({
    payerManagementPage,
    linkedNetwork,
    steps,
  }) => {
    let candidate!: LinkedNetworkCandidate;

    await steps.critical('Navigate to the module and open a payer that holds a network', async () => {
      candidate = await linkedNetwork('any');
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(candidate.payer);
      expect(await detail.getLinkedNetworkColumnKeys(), 'the Linked Networks table should render').not.toEqual([]);
    });

    await steps.step('The linked row offers its own Unassign action', async () => {
      const actions = await payerManagementPage.detail().getLinkedNetworkActions(candidate.network);
      expect(actions, `"${candidate.network}" should offer ${UNASSIGN_ACTION}; it offers: ${actions.join(', ')}`)
        .toContain(UNASSIGN_ACTION);
    });

    await steps.step('The section offers no free-standing removal that could be submitted without a network', async () => {
      // A removal can only be requested FROM a row, so "submit a removal with
      // no network selected" is structurally impossible - which is how the
      // sheet's data-validation case is satisfied in this interface.
      const controls = await payerManagementPage.detail().getLinkedNetworksControlIds();
      const loose = controls.filter((id) => /unassign|remove/i.test(id));
      expect(loose, `removal must be row-bound only; the toolbar carries: ${loose.join(', ')}`).toEqual([]);
    });
  });

  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.id}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
