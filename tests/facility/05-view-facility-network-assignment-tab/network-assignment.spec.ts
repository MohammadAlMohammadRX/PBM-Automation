import { test, expect } from '../../../fixtures';
import { env } from '../../../constants/EnvironmentConfig';
import { CASES, JOIN_DATE, MANY_MEMBERSHIPS, NO_NETWORKS } from '../../../data/facility/networkAssignment.data';
import { facilityDayText, readFacilityNetworks } from '../../../utils/FacilityProvisioning';
import { networkStatusLabels } from '../../../utils/NetworkProvisioning';
import { Logger } from '../../../utils/Logger';
import {
  ANCHOR_LONG_NETWORK_PREFIX,
  anchorOrBlocked,
  networkMasterStatus,
  networkTabFieldCount,
  networkTableOverflows,
  networkTypeLabels,
  readAllNetworkRows,
  riyadhDayOf,
  setSuiteNetworkActive,
  showNetworkRow,
} from '../../../utils/facility/writerBHelpers';

/**
 * User story 15136: View Facility - Network Assignment tab. The administrator
 * plays the Network Administrator. Facilities in networks are the suite's
 * long-lived anchors (a membership can never be undone - see the data file);
 * a facility in no network is the case's own fresh facility.
 */
test.describe('US 15136 - View Facility - Network Assignment tab', () => {
  test.describe.configure({ timeout: 15 * 60_000 });

  test(`TC-${CASES.codeTypeStatus.azureId}: should show the code, type and current status of every network membership`, async ({
    page,
    facilityManagementPage,
    facilityDetailPage,
    facilityNetworksTab,
    steps,
  }, testInfo) => {
    const data = CASES.codeTypeStatus;
    const anchor = await anchorOrBlocked(page, testInfo, { kind: 'multi', networks: data.minNetworks });
    const types = await networkTypeLabels(page);
    const statuses = await networkStatusLabels(page);

    await steps.critical('Navigate to the Facility Management module - the module loads and displays the facility list', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isListed(anchor.facility.nameEn)).toBe(true);
    });

    await steps.critical('Open a facility and select the "Network Assignment" tab - the network list displays', async () => {
      await facilityDetailPage.open(anchor.facility.id);
      await facilityNetworksTab.open();
      expect(await facilityNetworksTab.countRows()).toBeGreaterThan(0);
    });

    await steps.step('Review each row in the list - each network row shows its code, type and current status matching the network master data', async () => {
      const rows = await readAllNetworkRows(page, facilityNetworksTab);
      const shown: Record<string, unknown>[] = [];
      const expected: Record<string, unknown>[] = [];
      for (const network of anchor.networks) {
        const row = rows.find((r) => r.id === network.id || r.code === network.code);
        const type = types[network.typeId] ?? network.typeId;
        const status = await networkMasterStatus(page, network.id);
        shown.push({ code: row?.code ?? '(not listed)', type: row && row.text.includes(type) ? type : '(no type shown)', status: row?.status ?? '' });
        expected.push({ code: network.code, type, status });
      }
      Logger.info(`Network Assignment headers: ${(await facilityNetworksTab.getHeaders()).join(', ')}; status labels ${JSON.stringify(Object.values(statuses))}`);
      expect(shown, 'each membership row against its network\'s own code, type and status').toEqual(expected);
    });
  });

  test(`TC-${CASES.listMemberships.azureId}: should list every network the facility belongs to`, async ({
    page,
    facilityManagementPage,
    facilityDetailPage,
    facilityNetworksTab,
    steps,
  }, testInfo) => {
    const anchor = await anchorOrBlocked(page, testInfo, { kind: 'multi', networks: CASES.listMemberships.minNetworks });
    const memberships = (await readFacilityNetworks(page, anchor.facility.id, 100)).items.map((n) => n.networkCode).sort();

    await steps.critical('Navigate to the Facility Management module - the module loads and displays the facility list', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isListed(anchor.facility.nameEn)).toBe(true);
    });

    await steps.critical('Open a facility record that belongs to multiple networks - the facility\'s detail view opens', async () => {
      await facilityDetailPage.open(anchor.facility.id);
      expect(await facilityDetailPage.getName()).toBe(anchor.facility.nameEn);
    });

    await steps.step('Select the "Network Assignment" tab - the tab lists all networks the facility is a member of', async () => {
      await facilityNetworksTab.open();
      const shown = (await readAllNetworkRows(page, facilityNetworksTab)).map((r) => r.code).sort();
      expect(memberships.length, 'the facility should hold several networks').toBeGreaterThanOrEqual(CASES.listMemberships.minNetworks);
      expect(shown).toEqual(memberships);
    });
  });

  test(`TC-${CASES.noneOneMany.azureId}: should handle facilities with none, one and many network memberships`, async ({
    page,
    facilityManagementPage,
    facilityDetailPage,
    facilityNetworksTab,
    facilityIn,
    steps,
  }, testInfo) => {
    const none = await facilityIn('Active', { type: 'pharmacy' });
    const one = await anchorOrBlocked(page, testInfo, { kind: 'single' });
    const many = await anchorOrBlocked(page, testInfo, { kind: 'multi', networks: MANY_MEMBERSHIPS });
    const manyCodes = (await readFacilityNetworks(page, many.facility.id, 100)).items.map((n) => n.networkCode).sort();

    await steps.critical('Navigate to the Facility Management module - the module loads and displays the facility list', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isListed(none.nameEn)).toBe(true);
    });

    await steps.step('Open the facility with zero network memberships and select the tab - an empty list with a clear "no networks" message', async () => {
      await facilityDetailPage.open(none.id);
      await facilityNetworksTab.open();
      expect({ rows: await facilityNetworksTab.countRows(), message: await facilityNetworksTab.getEmptyText() })
        .toEqual({ rows: 0, message: expect.stringMatching(NO_NETWORKS) });
    });

    await steps.step('Open the facility with exactly one network membership and select the tab - the single network is displayed', async () => {
      await facilityDetailPage.open(one.facility.id);
      await facilityNetworksTab.open();
      expect((await readAllNetworkRows(page, facilityNetworksTab)).map((r) => r.code)).toEqual(one.networks.map((n) => n.code));
    });

    await steps.step(`Open the facility with many (${MANY_MEMBERSHIPS}) network memberships and select the tab - all memberships are displayed, paginated, none missing`, async () => {
      await facilityDetailPage.open(many.facility.id);
      await facilityNetworksTab.open();
      const shown = (await readAllNetworkRows(page, facilityNetworksTab)).map((r) => r.code).sort();
      expect(manyCodes.length).toBeGreaterThanOrEqual(MANY_MEMBERSHIPS);
      expect(shown).toEqual(manyCodes);
    });
  });

  test(`TC-${CASES.longName.azureId}: should display an unusually long network name without breaking the table layout`, async ({
    page,
    facilityManagementPage,
    facilityDetailPage,
    facilityNetworksTab,
    steps,
  }, testInfo) => {
    const anchor = await anchorOrBlocked(page, testInfo, { kind: 'multi', longName: true });
    const network = anchor.networks.find((n) => n.name.startsWith(ANCHOR_LONG_NETWORK_PREFIX));
    if (!network) steps.blocked(`the multi anchor holds no network named "${ANCHOR_LONG_NETWORK_PREFIX} ..."`);
    const longNetwork = network!;

    await steps.critical('Navigate to the Facility Management module - the module loads and displays the facility list', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isListed(anchor.facility.nameEn)).toBe(true);
    });

    await steps.critical('Open the facility that belongs to the network with an unusually long name and select the "Network Assignment" tab - the tab loads', async () => {
      await facilityDetailPage.open(anchor.facility.id);
      await facilityNetworksTab.open();
      expect(await showNetworkRow(page, facilityNetworksTab, longNetwork.id)).toBe(true);
    });

    await steps.step('Inspect the row for that network - the long name/code displays fully or truncates gracefully without breaking the table layout', async () => {
      const row = (await facilityNetworksTab.readRows()).find((r) => r.id === longNetwork.id);
      const name = row?.name ?? '';
      const fullOrTruncated = name === longNetwork.name || (/(\.\.\.|…)$/.test(name) && longNetwork.name.startsWith(name.replace(/(\.\.\.|…)$/, '').trim()));
      expect({ code: row?.code, nameShown: fullOrTruncated ? 'full or gracefully truncated' : name, layoutBroken: await networkTableOverflows(page) })
        .toEqual({ code: longNetwork.code, nameShown: 'full or gracefully truncated', layoutBroken: false });
    });
  });

  test(`TC-${CASES.everyStatus.azureId}: should show a distinct, correct label for every possible network status`, async ({
    page,
    facilityManagementPage,
    facilityDetailPage,
    facilityNetworksTab,
    steps,
  }, testInfo) => {
    const data = CASES.everyStatus;
    await page.goto(env.baseUrl);
    const known = Object.values(await networkStatusLabels(page)).map((l) => l.toLowerCase());
    const missing = data.statuses.filter((s) => !known.includes(s.toLowerCase()));
    // Active and Inactive are set by the daily network lifecycle job / an approved inactivation of an
    // Active network - neither can be produced while the case runs (foundation notes 2026-11-04).
    const notOnDemand = data.statuses.filter((s) => s === 'Active' || s === 'Inactive');
    if (missing.length > 0 || notOnDemand.length > 0) {
      steps.blocked(`a facility holding memberships in networks of every status ${data.statuses.join(', ')} cannot be built: `
        + `${missing.length > 0 ? `the network status lookup has no ${missing.join(', ')}; ` : ''}`
        + `${notOnDemand.join(' / ')} networks are not producible on demand (the network lifecycle job runs once a day, 09:40 UTC)`);
    }
    const anchor = await anchorOrBlocked(page, testInfo, { kind: 'multi' });

    await steps.critical('Navigate to the Facility Management module - the module loads and displays the facility list', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isListed(anchor.facility.nameEn)).toBe(true);
    });

    await steps.critical('Open the facility and select the "Network Assignment" tab - the network list displays', async () => {
      await facilityDetailPage.open(anchor.facility.id);
      await facilityNetworksTab.open();
      expect(await facilityNetworksTab.countRows()).toBeGreaterThan(0);
    });

    await steps.step('Compare each network\'s displayed status against its configured status for all four values - each displays correctly and distinctly', async () => {
      const rows = await readAllNetworkRows(page, facilityNetworksTab);
      const shown = [...new Set(rows.map((r) => r.status))].sort();
      expect(shown).toEqual([...data.statuses].sort());
    });
  });

  test(`TC-${CASES.readOnly.azureId}: should offer no control to add, edit or remove network memberships`, async ({
    page,
    facilityManagementPage,
    facilityDetailPage,
    facilityNetworksTab,
    steps,
  }, testInfo) => {
    const anchor = await anchorOrBlocked(page, testInfo, { kind: 'single' });

    await steps.critical('Navigate to the Facility Management module - the module loads and displays the facility list', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isListed(anchor.facility.nameEn)).toBe(true);
    });

    await steps.critical('Open the facility and select the "Network Assignment" tab - the network list displays', async () => {
      await facilityDetailPage.open(anchor.facility.id);
      await facilityNetworksTab.open();
      expect(await facilityNetworksTab.countRows()).toBeGreaterThan(0);
    });

    await steps.step('Check the tab against the read-only checklist - no add button, no edit icons, no delete/remove controls, no editable fields', async () => {
      expect({ controls: await facilityNetworksTab.readEditControls(), editableFields: await networkTabFieldCount(page) })
        .toEqual({ controls: [], editableFields: 0 });
    });
  });

  test(`TC-${CASES.switchFacilities.azureId}: should show each facility its own network memberships when moving between facilities`, async ({
    page,
    facilityManagementPage,
    facilityDetailPage,
    facilityNetworksTab,
    facilityIn,
    steps,
  }, testInfo) => {
    const a = await anchorOrBlocked(page, testInfo, { kind: 'single' });
    const b = await anchorOrBlocked(page, testInfo, { kind: 'multi', networks: CASES.switchFacilities.minNetworks });
    const c = await facilityIn('Active');
    const codesOf = async (id: string): Promise<string[]> => (await readFacilityNetworks(page, id, 100)).items.map((n) => n.networkCode).sort();
    const aCodes = await codesOf(a.facility.id);
    const bCodes = await codesOf(b.facility.id);

    await steps.critical('Navigate to the Facility Management module - the module loads and displays the facility list', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isListed(a.facility.nameEn)).toBe(true);
    });

    await steps.step('Open Facility A and view its "Network Assignment" tab - Facility A\'s correct network list displays', async () => {
      await facilityDetailPage.open(a.facility.id);
      await facilityNetworksTab.open();
      expect((await readAllNetworkRows(page, facilityNetworksTab)).map((r) => r.code).sort()).toEqual(aCodes);
    });

    await steps.step('Navigate to Facility B and view its tab, then to Facility C - each shows only its own memberships, nothing left over', async () => {
      await facilityDetailPage.open(b.facility.id);
      await facilityNetworksTab.open();
      const onB = (await readAllNetworkRows(page, facilityNetworksTab)).map((r) => r.code).sort();
      await facilityDetailPage.open(c.id);
      await facilityNetworksTab.open();
      const onC = (await readAllNetworkRows(page, facilityNetworksTab)).map((r) => r.code);
      const cText = await facilityDetailPage.getPageText();
      expect({ onB, onC, leftOnC: [...aCodes, ...bCodes].filter((code) => cText.includes(code)) })
        .toEqual({ onB: bCodes, onC: [], leftOnC: [] });
    });
  });

  test(`TC-${CASES.emptyState.azureId}: should show a clear empty state for a facility with no network memberships`, async ({
    facilityManagementPage,
    facilityDetailPage,
    facilityNetworksTab,
    facilityIn,
    steps,
  }) => {
    const facility = await facilityIn('Active');

    await steps.critical('Navigate to the Facility Management module - the module loads and displays the facility list', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isListed(facility.nameEn)).toBe(true);
    });

    await steps.critical('Open the facility with no network memberships and select the "Network Assignment" tab - the tab loads', async () => {
      await facilityDetailPage.open(facility.id);
      await facilityNetworksTab.open();
      expect(await facilityDetailPage.hasTab('networks')).toBe(true);
    });

    await steps.step('Observe the tab content - a clear message says the facility has no network memberships, not a blank or broken screen', async () => {
      expect({ rows: await facilityNetworksTab.countRows(), message: await facilityNetworksTab.getEmptyText() })
        .toEqual({ rows: 0, message: expect.stringMatching(NO_NETWORKS) });
    });
  });

  test(`TC-${CASES.joinDate.azureId}: should show each network's join date in one consistent format matching the actual join`, async ({
    page,
    facilityManagementPage,
    facilityDetailPage,
    facilityNetworksTab,
    steps,
  }, testInfo) => {
    const anchor = await anchorOrBlocked(page, testInfo, { kind: 'multi', networks: CASES.joinDate.minNetworks });
    const joined = (await readFacilityNetworks(page, anchor.facility.id, 100)).items;

    await steps.critical('Navigate to the Facility Management module - the module loads and displays the facility list', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isListed(anchor.facility.nameEn)).toBe(true);
    });

    await steps.critical('Open the facility and select the "Network Assignment" tab - the network list displays', async () => {
      await facilityDetailPage.open(anchor.facility.id);
      await facilityNetworksTab.open();
      expect(await facilityNetworksTab.countRows()).toBeGreaterThan(0);
    });

    await steps.step('Review the join date shown for each network - consistent, correctly formatted, matching the day the facility joined', async () => {
      const rows = await readAllNetworkRows(page, facilityNetworksTab);
      const shown = joined.map((n) => ({ code: n.networkCode, assignedOn: rows.find((r) => r.code === n.networkCode)?.assignedOn ?? '(not listed)' }));
      const expected = joined.map((n) => ({ code: n.networkCode, assignedOn: facilityDayText(riyadhDayOf(n.assignedOn)) }));
      expect(shown.every((s) => JOIN_DATE.test(s.assignedOn)), `every Assigned On should read DD/MM/YYYY: ${JSON.stringify(shown)}`).toBe(true);
      expect(shown).toEqual(expected);
    });
  });

  test(`TC-${CASES.syncWithNetwork.azureId}: should reflect a status change made in Network Management on the facility's tab`, async ({
    page,
    facilityManagementPage,
    facilityDetailPage,
    facilityNetworksTab,
    steps,
  }, testInfo) => {
    const anchor = await anchorOrBlocked(page, testInfo, { kind: 'multi' });
    const network = anchor.networks.find((n) => !n.name.startsWith(ANCHOR_LONG_NETWORK_PREFIX)) ?? anchor.networks[0];
    const statuses = await networkStatusLabels(page);
    const ids = Object.fromEntries(Object.entries(statuses).map(([id, label]) => [label.toLowerCase(), id]));
    const activeLabel = statuses[ids.active] ?? 'Active';
    if ((await networkMasterStatus(page, network.id)) !== activeLabel) {
      steps.blocked(`the suite's anchor network ${network.code} "${network.name}" is not Active yet (it reads "${await networkMasterStatus(page, network.id)}"): `
        + 'an approved network turns Active only when the daily network lifecycle job (09:40 UTC) runs after its effective time - re-run after that job');
    }
    const types = await networkTypeLabels(page);
    const type = types[network.typeId] ?? network.typeId;

    try {
      await steps.critical('Navigate to the Facility Management module - the module loads and displays the facility list', async () => {
        await facilityManagementPage.openTable();
        expect(await facilityManagementPage.isListed(anchor.facility.nameEn)).toBe(true);
      });

      await steps.step(`Open the facility and select the "Network Assignment" tab - the network displays its current type (${type})`, async () => {
        await facilityDetailPage.open(anchor.facility.id);
        await facilityNetworksTab.open();
        expect(await showNetworkRow(page, facilityNetworksTab, network.id), `${network.code} should be on the tab`).toBe(true);
        const row = (await readAllNetworkRows(page, facilityNetworksTab, 1)).find((r) => r.id === network.id);
        expect({ status: row?.status, typeShown: row?.text.includes(type) ?? false }).toEqual({ status: activeLabel, typeShown: true });
      });

      await steps.critical('In the Network Management module, change that network\'s status from active to inactive and save - the change is confirmed', async () => {
        await facilityDetailPage.open(anchor.facility.id);
        await facilityNetworksTab.open();
        expect(await showNetworkRow(page, facilityNetworksTab, network.id)).toBe(true);
        await facilityNetworksTab.openNetwork(network.code);
        expect(page.url()).toContain('/network-management/');
        await setSuiteNetworkActive(page, network, false);
        expect((await networkMasterStatus(page, network.id)).toLowerCase()).toBe('inactive');
      });

      await steps.step('Return to the facility\'s "Network Assignment" tab and refresh - the network now displays the updated status', async () => {
        await facilityDetailPage.open(anchor.facility.id);
        await page.reload();
        await facilityDetailPage.waitForLoaded();
        await facilityNetworksTab.open();
        expect(await showNetworkRow(page, facilityNetworksTab, network.id)).toBe(true);
        const row = (await facilityNetworksTab.readRows()).find((r) => r.id === network.id);
        expect(row?.status).toBe(await networkMasterStatus(page, network.id));
      });
    } finally {
      // The anchor network goes back to Active - it is shared by the suite.
      if ((await networkMasterStatus(page, network.id).catch(() => activeLabel)) !== activeLabel) {
        await setSuiteNetworkActive(page, network, true).catch((error: unknown) =>
          Logger.warn(`[17481] could not re-activate the anchor network ${network.code}: ${error instanceof Error ? error.message : String(error)}`));
      }
    }
  });
});
