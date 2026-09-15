import { test, expect } from '../../../fixtures';
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
  test('TC-001: should show every Overview attribute as a read-only field', async ({
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

  test('TC-002: should list the assigned networks with their management actions on the Linked Networks tab', async ({
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

  test('TC-004: should show empty states on the Linked Networks and Linked Policies tabs when nothing is linked', async ({
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

  test('TC-007: should preserve each tab\'s data when switching between tabs', async ({
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

  test('TC-009: should keep a consistent view through rapid tab switching and browser navigation', async ({
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

  test('TC-010: should present every required Overview attribute, labelled and formatted', async ({
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

  test('TC-006: should vary tab and management-action visibility by user role', async ({
    payerManagementPage,
    publishedPayer,
    nonAdminSession,
    steps,
  }) => {
    test.slow();

    await steps.critical('Navigate to the module and read the administrator\'s view of a payer', async () => {
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      await detail.waitForLoaded();
      expect(await detail.getHeaderActionIds(), 'the administrator should hold the full action set').toContain(ACTION_WITHHELD_FROM_PAYER_ADMIN);
      expect(await detail.getTabLabels()).toEqual(expect.arrayContaining([...DETAIL_TAB_LABELS]));
    });

    await steps.step('The Payer Admin sees every tab of its own payer', async () => {
      await nonAdminSession.payers.open();
      const detail = await nonAdminSession.payers.openDetails(NON_ADMIN_PROFILE.scopedPayers[0]);
      await detail.waitForLoaded();
      expect(await detail.getTabLabels(), 'the tabs should be the same set').toEqual(expect.arrayContaining([...DETAIL_TAB_LABELS]));
    });

    await steps.step('The Payer Admin is not offered the action its role lacks', async () => {
      // The role is defined without payer deletion (nonAdminAccount.data).
      // VERIFIED the control renders for it anyway - this step reports that.
      const actions = await nonAdminSession.payers.detail().getHeaderActionIds();
      expect(
        actions,
        `the ${NON_ADMIN_PROFILE.role} should not be offered "${ACTION_WITHHELD_FROM_PAYER_ADMIN}"; it is offered: ${actions.join(', ')}`,
      ).not.toContain(ACTION_WITHHELD_FROM_PAYER_ADMIN);
    });

    await steps.step('The Payer Admin is not offered Add Payer on the list', async () => {
      await nonAdminSession.payers.open();
      await nonAdminSession.payers.expectCreateActionDenied();
    });
  });

  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.id}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
