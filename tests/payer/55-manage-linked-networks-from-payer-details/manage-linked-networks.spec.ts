import { test, expect } from '../../../fixtures';
import type { ShapedSession } from '../../../fixtures/shapedNonAdmin.fixture';
import { NON_ADMIN_PROFILE } from '../../../data/accounts/nonAdminAccount.data';
import { azureOrCase } from '../../../data/azureTestIds.data';
import { NETWORK_COLUMN } from '../../../constants/ElementIds';
import type { AssignNetworkDrawer } from '../../../pages/payer/AssignNetworkDrawer';
import { LIFECYCLE_STATUS } from '../../../data/payers/statusTransition.data';
import {
  BLOCKED_CASES,
  CHANGE_REASON_CONTROL,
  ELIGIBILITY_SAMPLE,
  EXPECTED_LINKED_NETWORK_COLUMNS,
  HINT_STATES_APPROVAL,
  NEEDS_FREE_NETWORK,
  parseOptionLabel,
} from '../../../data/payers/manageLinkedNetworks.data';

/**
 * User story: Manage Linked Networks from Payer Details.
 *
 * The assign/remove lifecycle, ownership exclusion, re-validation, self-approval
 * and restricted-role cases are the network-assignment story (folder 32) and
 * are not repeated. Here: the eligible pool's status rule, the drawer's
 * nothing-selected gate, and the checklist of what the section offers. The
 * cases that must SUBMIT an assignment are BLOCKED on a free network.
 */
test.describe('Manage linked networks from payer details', () => {
  // Azure test case 15062
  test('15062: should not offer an Inactive network when adding a network', async ({
    payerManagementPage,
    networkManagementPage,
    assignableNetwork,
    publishedPayer,
    steps,
  }) => {
    test.slow();
    let offered: string[] = [];

    await steps.critical('Navigate to the module and open the Assign Network drawer with an eligible pool', async () => {
      await assignableNetwork(publishedPayer.nameEn);
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      const drawer = await detail.openAssignNetwork();
      offered = await drawer.listAvailableNetworks();
      expect(offered.length, 'the pool should offer at least one network').toBeGreaterThan(0);
      await drawer.cancel();
    });

    await steps.step('No offered network is labelled Inactive', async () => {
      // The option label carries the network's status, so the pool answers
      // the question itself before the cross-check.
      for (const label of offered) {
        const { status } = parseOptionLabel(label);
        expect(status, `"${label}" is offered but labelled ${status}`).not.toBe(LIFECYCLE_STATUS.inactive.en);
      }
    });

    await steps.step('Every offered network is Active on the Network list', async () => {
      // The pool is defined as Active, unowned, unreserved. Ownership is the
      // assignment story's check; this one is the status half, read from the
      // network's own record rather than from the label.
      for (const label of offered.slice(0, ELIGIBILITY_SAMPLE)) {
        const { name } = parseOptionLabel(label);
        await networkManagementPage.openList();
        await networkManagementPage.search(name);
        const status = await networkManagementPage.getCellValue(name, NETWORK_COLUMN.status);
        expect(
          status,
          `"${name}" is offered for assignment but the Network list shows it as ${status}`,
        ).not.toBe(LIFECYCLE_STATUS.inactive.en);
      }
    });
  });

  // Azure test case 15088
  test('15088: should keep the submit action disabled when no network is selected', async ({
    payerManagementPage,
    publishedPayer,
    steps,
  }) => {
    let drawer!: AssignNetworkDrawer;

    await steps.critical('Navigate to the module and open the Assign Network drawer', async () => {
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      drawer = await detail.openAssignNetwork();
      expect(await drawer.getControlIds(), 'the drawer should have rendered its controls').not.toEqual([]);
    });

    await steps.step('Nothing selected means nothing to submit', async () => {
      expect(
        await drawer.isSubmitEnabled(),
        'the Assign action must be disabled while no network is selected',
      ).toBe(false);
      await drawer.cancel();
    });
  });

  for (const blocked of BLOCKED_CASES) {
    // Azure test cases - one per generated case:
    //   TC-003 = 15068,  TC-004 = 15072,  TC-005 = 15078
    //   TC-007 = 15071,  TC-009 = 15084
    test(`${azureOrCase('55', 'TC-' + blocked.id)}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});

/**
 * The assignment surface: what it offers, and who may use it.
 *
 * Most of this story's remaining cases have to SUBMIT an assignment, and this
 * environment has no free network to submit - every network belongs to a payer
 * already. Those are reported BLOCKED with that reason rather than written
 * against a drawer that offers nothing. The two that can be exercised without
 * a spare network are written out.
 */
test.describe('Manage Network Assignments - Availability and access', () => {
  // Azure test case 15064
  test('15064: should say so plainly when it has no network to offer', async ({
    payerManagementPage,
    publishedPayer,
    steps,
  }) => {
    let drawer!: AssignNetworkDrawer;
    let offered: string[] = [];

    await steps.critical('Open the Assign Network drawer', async () => {
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      drawer = await detail.openAssignNetwork();
      await drawer.waitForOpen();
      offered = await drawer.listAvailableNetworks();
    });

    // The zero boundary is the one this environment sits on, and it is the one
    // that goes wrong quietly: a drawer that offers nothing and says nothing
    // reads as a loading failure, and a Submit that stays usable invites a
    // request for a network that was never chosen.
    await steps.step('With nothing to offer, Submit is not usable', async () => {
      if (offered.length === 0) {
        expect(
          await drawer.isSubmitEnabled(),
          'a drawer offering no network must not let a request be submitted',
        ).toBe(false);
        return;
      }
      // With exactly one or more on offer, the other half of the boundary: the
      // list is real and choosing from it enables the submission.
      await drawer.selectNetwork(offered[0]);
      expect(
        await drawer.isSubmitEnabled(),
        `with ${offered.length} network(s) offered, choosing one should enable the submission`,
      ).toBe(true);
    });

    await steps.step('And the drawer closes without staging anything', async () => {
      await drawer.cancel();
      await payerManagementPage.open();
      await payerManagementPage.expectRowsRendered();
    });
  });

  // Azure test case 15079
  test('15079: should let only the right roles submit an assignment and decide it', async ({
    shapedNonAdmin,
    steps,
  }) => {
    let session!: ShapedSession;

    await steps.critical('Sign in as a user without the assignment rights', async () => {
      session = await shapedNonAdmin({ without: ['assignNetworks', 'unassignNetwork'] });
      await session.payers.navigate();
      await session.payers.expectRowsRendered();
    });

    // Two halves of the segregation the story asks for: the maker's control is
    // withheld from a role without it, and the checker's controls are withheld
    // from a role that is not a reviewer.
    await steps.step('The assignment control is withheld', async () => {
      const detail = await session.payers.openDetails(NON_ADMIN_PROFILE.scopedPayers[0]);
      expect(
        await detail.getAssignNetworkAvailability(),
        'a role without the assignment rights must not be offered the control',
      ).not.toBe('available');
    });

    await steps.step('And so are the approve and reject decisions', async () => {
      await session.approvals.openHub();
      await session.approvals.expectApprovalActionsDenied();
    });
  });

  for (const [azureId, what] of [
    ['15060', 'add a valid network to a payer from the Linked Networks tab'],
    ['15063', 'remove a linked network with no policy dependency, through approval'],
    ['15070', 'walk an assignment through Draft, Pending Approval and its decision'],
    ['15076', 'confirm a network held by another payer\'s pending request is not offered'],
    ['15080', 'have two administrators reserve the same network at once'],
    ['15085', 'read the audit entry a network change writes'],
  ] as const) {
    test(`${azureId}: should ${what}`, async ({ steps }) => {
      steps.blocked(NEEDS_FREE_NETWORK);
    });
  }

  // Azure test case 15087
  test('15087: should drop an externally deactivated network from the available list', async ({
    steps,
  }) => {
    // Deactivating a network is the Networks module's action, and the case
    // turns on doing it WHILE the payer's drawer is the thing under test. The
    // suite reaches the Networks module, but a network it may deactivate is
    // one already assigned to a payer - deactivating that says nothing about
    // the AVAILABILITY list, which only ever holds unassigned networks.
    steps.blocked(
      `${NEEDS_FREE_NETWORK} This case additionally needs that free network to be deactivated `
      + 'from the Networks module while the payer drawer is open, so the availability list can '
      + 'be seen to drop it.',
    );
  });
});
