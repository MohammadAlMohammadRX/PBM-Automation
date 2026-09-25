import { test, expect } from '../../../fixtures';
import { azureOrCase } from '../../../data/azureTestIds.data';
import { NETWORK_COLUMN } from '../../../constants/ElementIds';
import type { LinkedNetworkCandidate } from '../../../fixtures/networkLinkState.fixture';
import type { LinkedNetworkRow, PayerDetailPage } from '../../../pages/payer/PayerDetailPage';
import {
  ARABIC_SCRIPT,
  ASSIGNMENT_STATE_VOCABULARY_EN,
  BLOCKED_CASES,
  DRAFT_REMOVAL_LABEL,
  DRAFT_STATE_LABELS_AR,
  IN_FLIGHT_STATE,
  SETTLED_MARKER,
} from '../../../data/payers/draftAssignmentStates.data';

/**
 * User story: Show Draft Assignment/Removal States and Reserve Networks Being
 * Staged.
 *
 * The state transitions are the network-assignment story (folder 32). Here:
 * what a freshly staged removal reads as, the exact bilingual vocabulary of the
 * state column, and what a rejected Pending Removal reverts to. Candidates are
 * DISCOVERED from the links the register already holds; a class that no link
 * occupies reports BLOCKED naming what was found.
 */
test.describe('Draft and pending assignment states', () => {
  test.afterEach(async ({ languageSwitcher }) => {
    await languageSwitcher.switchTo('en');
  });

  // Azure test case 15669
  test('15669: should mark the row Draft Removal when the removal of a published network link is staged', async ({
    payerManagementPage,
    linkedNetwork,
    steps,
  }) => {
    test.slow();
    let candidate!: LinkedNetworkCandidate;

    await steps.critical('Navigate to the module and find a payer whose network link is published and unstaged', async () => {
      candidate = await linkedNetwork('settled');
      expect(
        IN_FLIGHT_STATE.test(candidate.row.assignmentState),
        `the link should start settled; it reads "${candidate.row.assignmentState}"`,
      ).toBe(false);
    });

    await steps.step('Staging its removal marks the row Draft Removal', async () => {
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(candidate.payer);
      await detail.unassignNetwork(candidate.network);
      // The assignment-state cell settles a beat behind the staging request, so
      // the payer detail is re-opened fresh and the state polled rather than
      // read once - a single read caught the pre-refresh "—".
      await expect
        .poll(async () => {
          await payerManagementPage.open();
          const fresh = await payerManagementPage.openDetails(candidate.payer);
          return fresh.getLinkedNetworkAssignmentState(candidate.network);
        }, {
          message: `a staged removal should read "${DRAFT_REMOVAL_LABEL}"`,
          timeout: 30_000,
        })
        .toBe(DRAFT_REMOVAL_LABEL);
    });
  });

  // Azure test case 15678
  test('15678: should label every assignment state with the exact English and Arabic text', async ({
    payerManagementPage,
    languageSwitcher,
    linkedNetwork,
    steps,
  }) => {
    test.slow();
    let detail!: PayerDetailPage;
    let english: LinkedNetworkRow[] = [];

    await steps.critical('Navigate to the module and open a payer that holds a network', async () => {
      const candidate = await linkedNetwork('any');
      await payerManagementPage.open();
      detail = await payerManagementPage.openDetails(candidate.payer);
      english = await detail.getLinkedNetworkRows();
      expect(english.length, 'the payer should list at least one linked network').toBeGreaterThan(0);
    });

    await steps.step('Every English state label is one of the defined states', async () => {
      for (const row of english) {
        expect(
          ASSIGNMENT_STATE_VOCABULARY_EN as readonly string[],
          `"${row.name}" shows the state "${row.assignmentState}", which is not a defined label`,
        ).toContain(row.assignmentState);
      }
    });

    await steps.step('In Arabic, each row shows the Arabic label for the same state', async () => {
      // Rows are matched by network CODE, which does not translate. The two
      // new draft states have required Arabic text; the pending states keep
      // their pre-existing text, so for those the check is that it IS Arabic.
      await languageSwitcher.switchTo('ar');
      const arabic = await detail.getLinkedNetworkRows();
      expect(arabic.length, 'the Arabic table should list the same rows').toBe(english.length);
      for (const row of english) {
        const translated = arabic.find((candidate) => candidate.code === row.code);
        const label = translated?.assignmentState ?? '';
        // A settled link shows a dash in either language; every worded state
        // must be rendered in Arabic script.
        expect(
          ARABIC_SCRIPT.test(label) || SETTLED_MARKER.test(label),
          `"${row.name}" (${row.assignmentState}) should show an Arabic state label; it read "${label}"`,
        ).toBe(true);
        const required = DRAFT_STATE_LABELS_AR[row.assignmentState] ?? label;
        expect(label, `the Arabic label for "${row.assignmentState}" must match exactly`).toBe(required);
      }
      await languageSwitcher.switchTo('en');
    });
  });

  // Azure test case 15671
  test('15671: should keep a network reserved to the payer while its removal is pending', async ({
    payerManagementPage,
    networkManagementPage,
    linkedNetwork,
    steps,
  }) => {
    test.slow();
    let candidate!: LinkedNetworkCandidate;

    await steps.critical('Navigate to the module and find a network whose removal is awaiting approval', async () => {
      candidate = await linkedNetwork('pendingRemoval');
      expect(
        candidate.row.assignmentState,
        `the link should be pending removal; it reads "${candidate.row.assignmentState}"`,
      ).toMatch(/pending\s*removal/i);
    });

    await steps.step('The payer\'s tab still lists the network while the removal is staged', async () => {
      // "Reserve networks being staged": a removal that is only submitted, not
      // yet approved, must not drop the link early - the network stays the
      // payer's until a reviewer decides.
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(candidate.payer);
      const rows = await detail.getLinkedNetworkRows();
      const names = rows.map((linked) => linked.name);
      expect(
        names,
        `"${candidate.network}" should still be linked to "${candidate.payer}" while its removal is pending; `
          + `linked now: ${names.join(', ') || '(none)'}`,
      ).toContain(candidate.network);
    });

    await steps.step('And the Network list still reserves it to that payer', async () => {
      // The reservation is visible from the network side too: the network is
      // not offered back to the pool while a decision on it is outstanding.
      await networkManagementPage.openList();
      await networkManagementPage.search(candidate.network);
      const owner = await networkManagementPage.getCellValue(candidate.network, NETWORK_COLUMN.payer);
      expect(
        owner,
        `"${candidate.network}" should stay reserved to "${candidate.payer}" while its removal is pending`,
      ).toBe(candidate.payer);
    });
  });

  for (const blocked of BLOCKED_CASES) {
    // Azure test cases - one per generated case:
    //   TC-002 = 15672,  TC-003 = 15675,  TC-004 = 15674
    //   TC-005 = 15673,  TC-007 = 15677,  TC-008 = 15679
    //   TC-011 = 15682
    test(`${azureOrCase('58', 'TC-' + blocked.id)}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
