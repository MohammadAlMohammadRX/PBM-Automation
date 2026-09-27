import { test, expect } from '../../../fixtures';
import { azureOrCase } from '../../../data/azureTestIds.data';
import type { ShapedSession } from '../../../fixtures/shapedNonAdmin.fixture';
import type { PayerDetailPage } from '../../../pages/payer/PayerDetailPage';
import { UNMODIFIED_INDICATORS } from '../../../data/payers/overviewMetadata.data';
import { EMPTY_STATE_PATTERN } from '../../../data/payers/linkedPolicies.data';
import { NON_ADMIN_PROFILE } from '../../../data/accounts/nonAdminAccount.data';
import {
  ACTION_WITHHELD_FROM_PAYER_ADMIN,
  ATTRIBUTE_FORMAT,
  BLOCKED_CASES,
  DETAIL_TAB_LABELS,
  OVERVIEW_LABELS,
  RAPID_TAB_CYCLES,
} from '../../../data/payers/detailsTabs.data';

/**
 * User story: View Comprehensive Payer Details with Tabs.
 *
 * The detail view as a whole: a read-only, complete Overview; empty states on
 * the linked sections; nothing lost when switching tabs; a consistent view
 * after rapid switching and browser navigation. Cases needing policies,
 * pagination or other roles are BLOCKED on those resources.
 */
const isBlank = (value: string): boolean =>
  value.trim() === '' || UNMODIFIED_INDICATORS.includes(value.trim() as (typeof UNMODIFIED_INDICATORS)[number]);

/** Visits every tab once, ending on the Overview. */
async function cycleTabs(detail: PayerDetailPage): Promise<void> {
  await detail.openLinkedNetworks();
  await detail.openLinkedPolicies();
  await detail.versionHistory().open();
  await detail.openAuditHistory();
  await detail.openOverview('Payer Code');
}

test.describe('Comprehensive payer details', () => {
  // Azure test case 14638
  test('14638: should show every Overview attribute as a read-only field', async ({
    payerManagementPage,
    publishedPayer,
    steps,
  }) => {
    await steps.critical('Navigate to the module and open the payer\'s details', async () => {
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      await detail.waitForLoaded();
    });

    await steps.step('The Overview carries no editable control', async () => {
      const detail = payerManagementPage.detail();
      expect(await detail.isOverviewReadOnly(), 'the Overview must be read-only').toBe(true);
      for (const label of OVERVIEW_LABELS) {
        expect(await detail.getFieldValue(label), `"${label}" should be displayed`).not.toBe('');
      }
    });
  });

  // Azure test case 14637
  test('14637: should list the assigned networks with their management actions on the Linked Networks tab', async ({
    payerManagementPage,
    linkedNetwork,
    steps,
  }) => {
    let network = '';

    await steps.critical('Navigate to the module and open a payer that holds a network', async () => {
      const candidate = await linkedNetwork('any');
      network = candidate.network;
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(candidate.payer);
      expect((await detail.getLinkedNetworkRows()).map((r) => r.name), 'the linked network should be listed').toContain(network);
    });

    await steps.step('Each network row offers its action and the tab offers Assign', async () => {
      const detail = payerManagementPage.detail();
      const actions = await detail.getLinkedNetworkActions(network);
      expect(actions.length, `"${network}" should offer a management action; it offers: ${actions.join(', ')}`).toBeGreaterThan(0);
      expect(await detail.getAssignNetworkAvailability(), 'Assign Network should be offered').toBe('available');
    });
  });

  // Azure test case 14646
  test('14646: should show empty states on the Linked Networks and Linked Policies tabs when nothing is linked', async ({
    payerManagementPage,
    publishedPayer,
    steps,
  }) => {
    await steps.critical('Navigate to the module and open a payer with nothing linked', async () => {
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      expect(await detail.linkedNetworkCount(), 'the payer should hold no networks').toBe(0);
    });

    await steps.step('The Linked Networks tab renders its section rather than breaking', async () => {
      const detail = payerManagementPage.detail();
      expect(await detail.getLinkedNetworksHintText(), 'the section should still explain itself').not.toBe('');
      expect(await detail.getAssignNetworkAvailability(), 'and still offer Assign').toBe('available');
    });

    await steps.step('The Linked Policies tab shows its empty state', async () => {
      const section = await payerManagementPage.detail().getLinkedPoliciesSection();
      expect(EMPTY_STATE_PATTERN.test(section.text), `an empty-state message should show; it read "${section.text}"`).toBe(true);
    });
  });

  // Azure test case 14650
  test('14650: should preserve each tab\'s data when switching between tabs', async ({
    payerManagementPage,
    publishedPayer,
    steps,
  }) => {
    let licence = '';
    let networks = 0;

    await steps.critical('Navigate to the module and read the Overview and Linked Networks', async () => {
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      licence = await detail.getFieldValue('License Number');
      networks = await detail.linkedNetworkCount();
      expect(licence).not.toBe('');
    });

    await steps.step('After visiting every tab, the Overview and Linked Networks read the same', async () => {
      const detail = payerManagementPage.detail();
      await cycleTabs(detail);
      expect(await detail.getFieldValue('License Number'), 'the Overview should be intact').toBe(licence);
      expect(await detail.linkedNetworkCount(), 'the Linked Networks should be intact').toBe(networks);
    });
  });

  // Azure test case 14658
  test('14658: should keep a consistent view through rapid tab switching and browser navigation', async ({
    payerManagementPage,
    publishedPayer,
    steps,
  }) => {
    test.slow();
    let licence = '';

    await steps.critical('Navigate to the module and open the payer\'s details', async () => {
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      licence = await detail.getFieldValue('License Number');
      expect(licence).not.toBe('');
    });

    await steps.step('Rapid switching leaves the Overview intact', async () => {
      const detail = payerManagementPage.detail();
      for (let cycle = 0; cycle < RAPID_TAB_CYCLES; cycle += 1) await cycleTabs(detail);
      expect(await detail.getFieldValue('License Number')).toBe(licence);
    });

    await steps.step('Browser back returns to the list and forward restores the details', async () => {
      await payerManagementPage.goBack();
      await payerManagementPage.expectRowsRendered();
      await payerManagementPage.goForward();
      await payerManagementPage.detail().waitForLoaded();
      expect(await payerManagementPage.detail().getFieldValue('License Number')).toBe(licence);
    });
  });

  // Azure test case 14644
  test('14644: should present every required Overview attribute, labelled and formatted', async ({
    payerManagementPage,
    publishedPayer,
    steps,
  }) => {
    await steps.critical('Navigate to the module and open a fully populated payer', async () => {
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      await detail.waitForLoaded();
    });

    await steps.step('Each attribute is present and correctly formatted', async () => {
      const detail = payerManagementPage.detail();
      for (const label of OVERVIEW_LABELS) {
        const value = await detail.getFieldValue(label);
        expect(isBlank(value), `"${label}" should be populated; it read "${value}"`).toBe(false);
        const format = ATTRIBUTE_FORMAT[label];
        expect(format === undefined || format.test(value), `"${label}" should be formatted as expected; it read "${value}"`).toBe(true);
      }
    });
  });


  // ---- the withheld half, on a role shaped for this case -------------------
  // This used to report BLOCKED: the one non-administrator credential in this
  // environment HOLDS the permission whose absence the case is about. The
  // account is now BUILT - the administrator takes the permission off the
  // shared "Payer Admin" role, the case signs in as it, and the permission
  // goes back when the case ends.

  // Azure test case 14654
  test('14654: should deny the Payer Details view to a user without Payer Management view permission', async ({ shapedNonAdmin, steps }) => {
    let session!: ShapedSession;

    await steps.critical('Sign in as a user without View Payer Details', async () => {
      session = await shapedNonAdmin({ without: ['viewPayerDetails'] });
      await session.payers.navigate();
      await session.payers.expectRowsRendered();
    });

    await steps.step('The payer record is not reachable by this role', async () => {
      // Two refusals are acceptable and they are not the same: the row may
      // withhold the route, or the page may refuse the record. Only a rendered
      // record is a failure.
      const route = await session.payers.getRowActionAvailability(NON_ADMIN_PROFILE.scopedPayers[0], 'view');
      if (route !== 'available') return;

      const detail = await session.payers.openDetails(NON_ADMIN_PROFILE.scopedPayers[0]);
      expect(
        (await detail.getTabOrder()).length,
        'a role without View Payer Details should not be shown the tabbed record',
      ).toBe(0);
    });
  });
  // Azure test case 14645
  test('14645: should show an empty state on Linked Networks when the payer has none', async ({
    payerManagementPage,
    draftPayer,
    steps,
  }) => {
    let detail!: PayerDetailPage;

    // A payer created in this run owns nothing, which is exactly the state the
    // case needs - and it is built rather than searched for, so the assertion
    // cannot be satisfied by a payer that merely happens to have no networks.
    await steps.critical('Open a payer that owns no networks', async () => {
      await payerManagementPage.open();
      detail = await payerManagementPage.openDetails(draftPayer.nameEn);
      await detail.waitForLoaded();
    });

    await steps.step('The Linked Networks tab says so rather than showing an empty table', async () => {
      await detail.openLinkedNetworks().catch(() => undefined);
      const rows = await detail.getLinkedNetworkRows().catch(() => []);
      expect(rows, 'a payer with no networks should list none').toHaveLength(0);

      const text = (await detail.getLinkedNetworksHintText().catch(() => '')).trim();
      expect(
        text,
        'an empty tab should explain itself; a bare empty table reads as a loading failure',
      ).not.toBe('');
    });
  });

  // Azure test case 14653
  test('14653: should fail clearly when the payer is removed while its details are open', async ({
    payerManagementPage,
    draftPayer,
    steps,
  }) => {
    let payerId = '';

    await steps.critical('Open the payer and note the record it is showing', async () => {
      await payerManagementPage.open();
      payerId = await payerManagementPage.getPayerIdFromDetailUrl(draftPayer.nameEn);
      expect(payerId, 'the detail screen should be showing a record').not.toBe('');
    });

    // Deleted from under the open screen, then revisited by its own URL - which
    // is what "viewed concurrently" comes down to for a single session. The
    // screen must say the record is gone; rendering a shell of a payer that no
    // longer exists is the failure.
    await steps.step('Once it is deleted, its detail URL reports the record as gone', async () => {
      await payerManagementPage.open();
      await payerManagementPage.deletePayer(draftPayer.nameEn);
      await payerManagementPage.openPayerById(payerId);
      await payerManagementPage.expectRecordNotFound();
    });
  });

  // Azure test case 14660
  test('14660: should show each linked policy\'s status consistently with its expiry', async ({
    steps,
  }) => {
    // The comparison needs a payer owning at least one expired and one active
    // policy, and no payer in this environment owns a policy at all - the
    // Policies module that would create one is outside this framework. Left
    // BLOCKED rather than run against an empty tab, which would pass without
    // ever reading a status.
    steps.blocked(
      'This case needs a payer owning both an active and an expired policy so the Status column '
      + 'can be checked against each policy\'s expiry date. No payer in this environment owns a '
      + 'policy; the Policies module is outside this framework. Provide one and re-run - the '
      + 'readers for the tab already exist.',
    );
  });

  for (const blocked of BLOCKED_CASES) {
    // Azure test cases - one per generated case:
    //   TC-003 = 14639,  TC-005 = 14652,  TC-012 = 14661
    test(`${azureOrCase('73', 'TC-' + blocked.id)}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
