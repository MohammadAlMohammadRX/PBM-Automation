import { test, expect } from '../../../fixtures';
import { NETWORK_COLUMN } from '../../../constants/ElementIds';
import type { AssignNetworkDrawer } from '../../../pages/payer/AssignNetworkDrawer';
import { LIFECYCLE_STATUS } from '../../../data/payers/statusTransition.data';
import {
  BLOCKED_CASES,
  CHANGE_REASON_CONTROL,
  ELIGIBILITY_SAMPLE,
  EXPECTED_LINKED_NETWORK_COLUMNS,
  HINT_STATES_APPROVAL,
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
  test('TC-001: should not offer an Inactive network when adding a network', async ({
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

  test('TC-002: should keep the submit action disabled when no network is selected', async ({
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

  test('TC-010: should offer every required element when the Linked Networks tab is opened', async ({
    payerManagementPage,
    linkedNetwork,
    steps,
  }) => {
    test.slow();
    let keys: string[] = [];

    await steps.critical('Navigate to the module and open the Linked Networks tab of a payer that holds a network', async () => {
      // A payer with no networks renders an empty section with no header row,
      // so the column checklist needs a payer that actually holds a link.
      const candidate = await linkedNetwork('any');
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(candidate.payer);
      keys = await detail.getLinkedNetworkColumnKeys();
      expect(keys, 'the Linked Networks table should render its header').not.toEqual([]);
    });

    await steps.step('The table carries name, code, facilities, status, assignment state and actions', async () => {
      for (const expected of EXPECTED_LINKED_NETWORK_COLUMNS) {
        expect(keys, `the Linked Networks table should carry a "${expected}" column`).toContain(expected);
      }
    });

    await steps.step('The Add Network action, a search box and the approval hint are present', async () => {
      const detail = payerManagementPage.detail();
      expect(await detail.getAssignNetworkAvailability(), 'Assign Network should be offered').toBe('available');
      expect(await detail.hasLinkedNetworksSearch(), 'the section should offer a search box').toBe(true);
      const hint = await detail.getLinkedNetworksHintText();
      expect(hint, `the hint should state the maker-checker rule; it read "${hint}"`).toMatch(HINT_STATES_APPROVAL);
    });

    await steps.step('Submitting a change asks for a Reason for Change', async () => {
      // The sheet's checklist requires a mandatory reason on submission. The
      // drawer's controls are read rather than assumed, so a drawer that asks
      // for no reason is reported as exactly that.
      const drawer = await payerManagementPage.detail().openAssignNetwork();
      const controls = await drawer.getControlIds();
      expect(
        controls.some((id) => CHANGE_REASON_CONTROL.test(id)),
        `the network-change drawer should carry a Reason for Change field; its controls are: ${controls.join(', ')}`,
      ).toBe(true);
      await drawer.cancel();
    });
  });

  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.id}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
