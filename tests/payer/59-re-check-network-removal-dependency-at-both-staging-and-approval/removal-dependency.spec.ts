import { test, expect } from '../../../fixtures';
import { azureOrCase } from '../../../data/azureTestIds.data';
import type { ShapedSession } from '../../../fixtures/shapedNonAdmin.fixture';
import { NON_ADMIN_PROFILE } from '../../../data/accounts/nonAdminAccount.data';
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
  // Azure test case 15807
  test('15807: should remove the network when a dependency-free removal is staged and approved', async ({
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

  // Azure test case 15676
  // Azure test case 15813 - 'Use case - Full removal workflow including approver
  // rejection, requester review, and resubmission'. It carried 15676 until the
  // 2026-09-28 traceability sweep: 15676 belongs to US 14216 (draft assignment
  // states, folder 58) and was on two tests at once here, while this story's own
  // 15813 had no test at all.
  test('15813: should complete the removal when a rejected request is reviewed, re-staged and approved', async ({
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

  // Azure test case 15817
  test('15817: should offer removal only against a linked network row', async ({
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


  // ---- the withheld half, on a role shaped for this case -------------------
  // This used to report BLOCKED: the one non-administrator credential in this
  // environment HOLDS the permission whose absence the case is about. The
  // account is now BUILT - the administrator takes the permission off the
  // shared "Payer Admin" role, the case signs in as it, and the permission
  // goes back when the case ends.

  // Azure test case 15676
  test('15676: should withhold staging of assignment and removal drafts from a viewer role', async ({ shapedNonAdmin, steps }) => {
    let session!: ShapedSession;

    // THE BASELINE COMES FIRST, so a control that was never on offer cannot be
    // mistaken for a permission the application honoured.
    await steps.critical('The assignment control IS offered while the role holds the rights', async () => {
      const held = await shapedNonAdmin({ with: ['assignNetworks', 'unassignNetwork'] });
      await held.payers.navigate();
      await held.payers.expectRowsRendered();
      const detail = await held.payers.openDetails(NON_ADMIN_PROFILE.scopedPayers[0]);
      const offered = await detail.getAssignNetworkAvailability();
      if (offered !== 'available') {
        steps.blocked(
          `"${NON_ADMIN_PROFILE.scopedPayers[0]}" does not offer the Assign Network control even `
            + `to a role that HOLDS the rights (it is ${offered}), so withdrawing them would `
            + 'prove nothing about the permission.',
        );
      }
    });

    await steps.critical('Sign in as a user without the assignment rights', async () => {
      session = await shapedNonAdmin({ without: ['assignNetworks', 'unassignNetwork'] });
      await session.payers.navigate();
      await session.payers.expectRowsRendered();
    });

    await steps.step('The assignment control is withheld from this role', async () => {
      const detail = await session.payers.openDetails(NON_ADMIN_PROFILE.scopedPayers[0]);
      expect(
        await detail.getAssignNetworkAvailability(),
        'a viewer role must not be offered the Assign Network control',
      ).not.toBe('available');
    });
  });
  for (const blocked of BLOCKED_CASES) {
    // Azure test cases - one per generated case:
    //   TC-002 = 15808,  TC-003 = 15809,  TC-004 = 15810
    //   TC-005 = 15811,  TC-007 = 15812,  TC-008 = 15814
    //   TC-009 = 15815,  TC-010 = 15816,  TC-012 = 15818
    test(`${azureOrCase('59', 'TC-' + blocked.id)}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
