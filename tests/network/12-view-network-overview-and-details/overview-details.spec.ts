import { test, expect } from '../../../fixtures';
import { NETWORK_LIFECYCLE, uniqueArabic } from '../../../data/networks/network.data';
import {
  AUDIT_METADATA,
  CASE,
  EDIT_WORKFLOW_ACTIONS,
  EMPTY_AUDIT_MESSAGE,
  NETWORK_CODE_PATTERN,
  NONEXISTENT_NETWORK_ID,
  NOT_FOUND_MESSAGE,
  OVERVIEW_DATE_PATTERN,
} from '../../../data/networks/overviewDetails.data';

/**
 * User story 14126: View network overview and details.
 * The Overview's fields and metadata, the tab set, the status shown per
 * lifecycle state, who may open the screen, and the missing-record case.
 *
 * Each case opens a network it provisioned itself (fixture `networkIn`) by id.
 */
test.describe('US 14126 - Network overview and tabs', () => {
  test(`TC-${CASE.overviewFields}: should show every network field, the status and the created/modified metadata when the Overview opens`, async ({
    networkDetailPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(12 * 60_000);
    const network = await networkIn('Active', { descriptionEn: 'Overview field check', descriptionAr: uniqueArabic('وصف') });

    await steps.critical('Navigate to the network - the detail screen loads', async () => {
      await networkDetailPage.open(network.id);
      expect(await networkDetailPage.getName()).toBe(network.name);
    });

    await steps.step('The Overview tab is shown by default', async () => {
      expect(await networkDetailPage.getActiveTab(), 'the screen should open on Overview').toBe('overview');
    });

    await steps.step('Name, description, type, dates, code and status are displayed accurately', async () => {
      const overview = await networkDetailPage.readOverview();
      expect(await networkDetailPage.getName(), 'name').toBe(network.name);
      expect(overview.nameAr, 'Arabic name').toBe(network.nameAr);
      expect(overview.descriptionEn, 'description').toBe('Overview field check');
      expect(overview.type, 'type').toBe('HMO');
      expect(overview.code, 'network code').toMatch(NETWORK_CODE_PATTERN);
      expect(overview.effectiveDate, 'effective date').toMatch(OVERVIEW_DATE_PATTERN);
      expect(overview.expiryDate, 'expiry date').toMatch(OVERVIEW_DATE_PATTERN);
      expect(await networkDetailPage.getStatus(), 'status').toBe(NETWORK_LIFECYCLE.active);
    });

    await steps.step('Created By/At and Modified By/At are shown', async () => {
      const text = await networkDetailPage.getOverviewText();
      for (const label of AUDIT_METADATA) {
        expect(text, `the Overview should show ${label}`).toMatch(label);
      }
    });
  });

  test(`TC-${CASE.tabChecklist}: should load Overview, facilities, policies and audit tabs with the network's data when each tab is opened`, async ({
    networkDetailPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(12 * 60_000);
    const network = await networkIn('Active');

    await steps.critical('Navigate to the network - the Overview tab is shown by default', async () => {
      await networkDetailPage.open(network.id);
      expect(await networkDetailPage.getActiveTab()).toBe('overview');
    });

    await steps.step('The facilities tab lists the facilities assigned to the network', async () => {
      const tab = networkDetailPage.facilities();
      await tab.open();
      expect((await tab.readRows()).length, 'the network\'s own facility should be listed').toBe(network.facilityIds.length);
    });

    await steps.step('The Linked Policies tab lists the network\'s policies (none here)', async () => {
      const tab = networkDetailPage.policies();
      await tab.open();
      expect(await tab.readRows(), 'a new network links no policy').toEqual([]);
      expect(await tab.getEmptyText(), 'the tab should say so').not.toBe('');
    });

    await steps.step('The Audit History tab shows a chronological log of the network\'s changes', async () => {
      const tab = networkDetailPage.audit();
      await tab.open();
      expect((await tab.readEntries()).length, 'an approved, activated network has history').toBeGreaterThan(0);
    });
  });

  test(`TC-${CASE.emptyAudit}: should show a clear empty state when a network with no recorded changes opens Audit History`, async ({
    networkDetailPage,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Draft');

    await steps.critical('Navigate to the new network and open Audit History - the tab opens', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.audit().open();
    });

    await steps.step('An empty-state message is shown rather than an error or a blank panel', async () => {
      const tab = networkDetailPage.audit();
      expect(await tab.readEntries(), 'a never-edited network has no entries').toEqual([]);
      expect(await tab.getPanelText(), 'the tab should say there is no history').toMatch(EMPTY_AUDIT_MESSAGE);
    });
  });

  test(`TC-${CASE.statusMatches}: should show the true lifecycle status when Pending, Active and Expired networks are opened`, async ({
    networkDetailPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(25 * 60_000);
    const pending = await networkIn('Pending');
    const active = await networkIn('Active');
    const expired = await networkIn('Expired');

    await steps.critical('Navigate to the module - the Pending network opens', async () => {
      await networkDetailPage.open(pending.id);
      expect(await networkDetailPage.getName()).toBe(pending.name);
    });

    for (const [network, status] of [
      [pending, NETWORK_LIFECYCLE.pending],
      [active, NETWORK_LIFECYCLE.active],
      [expired, NETWORK_LIFECYCLE.expired],
    ] as const) {
      await steps.step(`A network known to be ${status} displays "${status}"`, async () => {
        await networkDetailPage.open(network.id);
        await networkDetailPage.expectStatus(status);
        expect((await networkDetailPage.readOverview()).status, `the Overview status of the ${status} network`).toBe(status);
      });
    }
  });

  test(`TC-${CASE.accessRestricted}: should deny the overview and tabs when a user without network view permission opens a network`, async ({
    networkDetailPage,
    networkIn,
    shapedNonAdmin,
    steps,
  }) => {
    const network = await networkIn('Draft');

    await steps.critical('Navigate as the administrator - the overview and every tab load', async () => {
      await networkDetailPage.open(network.id);
      for (const tab of ['overview', 'facilities', 'policies', 'versions', 'audit'] as const) {
        expect(await networkDetailPage.hasTab(tab), `the administrator should be offered ${tab}`).toBe(true);
      }
    });

    await steps.step('A user without the view permission is denied the detail screen', async () => {
      const session = await shapedNonAdmin({ without: ['viewNetworkDetails'] });
      await session.networkDetail.openExpectingFailure(network.id);
      expect(await session.networkDetail.isLoaded(), 'the detail screen must not load for this user').toBe(false);
    });
  });

  test(`TC-${CASE.editWorkflowAudit}: should record the edit, its submission and its approval when a network went through the edit workflow`, async ({
    networkDetailPage,
    networkIn,
    publishEdit,
    steps,
  }) => {
    test.setTimeout(12 * 60_000);
    const network = await networkIn('Active');
    await publishEdit(network, { descriptionEn: 'Edited through the approval workflow' });

    await steps.critical('Navigate to the network that went through an edit-approval cycle', async () => {
      await networkDetailPage.open(network.id);
      expect(await networkDetailPage.getName()).toBe(network.name);
    });

    await steps.step('Audit History shows the edit, the Send for Approval and the approval, each with user and time', async () => {
      const tab = networkDetailPage.audit();
      await tab.expectEntry(EDIT_WORKFLOW_ACTIONS[0]);
      const entries = await tab.readEntries();
      const actions = entries.map((entry) => entry.action).join(' | ');
      for (const action of EDIT_WORKFLOW_ACTIONS) {
        expect(actions, `the audit history should record ${action}`).toMatch(action);
      }
      expect(entries.filter((entry) => entry.by === '' || entry.when === ''), 'entries without a user or a time').toEqual([]);
    });
  });

  test(`TC-${CASE.notFound}: should show a clear "network not found" message when a deleted or unknown network id is opened`, async ({
    networkManagementPage,
    networkDetailPage,
    steps,
  }) => {
    await steps.critical('Navigate to the Network Management module - the list loads', async () => {
      await networkManagementPage.openList();
    });

    await steps.step('Opening an id that never existed shows a "Network not found" message, not a broken page', async () => {
      await networkDetailPage.openExpectingFailure(NONEXISTENT_NETWORK_ID);
      expect(await networkDetailPage.isLoaded(), 'no network should render for an unknown id').toBe(false);
      const said = `${await networkDetailPage.readToast()} ${await networkDetailPage.getMainText()}`;
      expect(said, 'the user should be told the network was not found').toMatch(NOT_FOUND_MESSAGE);
    });
  });
});
