import { test, expect } from '../../../fixtures';
import { NETWORK_COLUMN } from '../../../constants/ElementIds';
import {
  BLOCKED_CASES,
  CASES,
  DIRECTORY_PERMISSIONS,
  KPI_LABELS,
  KPI_PARTITIONS,
} from '../../../data/networks/directoryKpis.data';

/**
 * User story 14120: View network directory with KPI dashboard.
 * The five KPI tiles: their labels, their partition counts, their
 * independence from list filters, their server-side aggregation, the
 * Total = sum rule, and who may see them.
 *
 * The band is scoped to the top-bar payer; every comparison stays inside one
 * scope by reading the list's OWN requests (see the data file).
 */
test.describe('US 14120 - KPI dashboard', () => {
  test(`TC-${CASES.partitions.azureId}: should show on each status tile the number of networks in that status when the module loads`, async ({
    networkManagementPage,
    steps,
  }) => {
    let tiles: Record<string, number> = {};

    await steps.critical('Navigate to the Network Management module - the KPI tiles and list load', async () => {
      await networkManagementPage.openList();
      tiles = await networkManagementPage.readKpis();
      expect(tiles.total, 'the Total tile should count the register').toBeGreaterThan(0);
    });

    for (const partition of KPI_PARTITIONS) {
      await steps.step(`The ${partition.kpi} tile equals the number of ${partition.status} networks`, async () => {
        await networkManagementPage.openList();
        const listed = await networkManagementPage.captureListTotal(() =>
          networkManagementPage.applyQuickFilter('status', partition.status),
        );
        expect(tiles[partition.kpi], `${partition.kpi} tile vs networks listed as ${partition.status}`).toBe(listed);
      });
    }
  });

  test(`TC-${CASES.filterIndependence.azureId}: should keep every KPI tile unchanged when a list filter is applied`, async ({
    networkManagementPage,
    steps,
  }) => {
    const data = CASES.filterIndependence;
    let before: Record<string, number> = {};

    await steps.critical('Navigate to the module and note the five tiles - they count the whole register', async () => {
      await networkManagementPage.openList();
      before = await networkManagementPage.readKpis();
      const unfiltered = await networkManagementPage.captureListTotal(() => networkManagementPage.openList());
      expect(before.total, 'the Total tile should equal the unfiltered list total').toBe(unfiltered);
    });

    await steps.step(`Filtering by Type ${data.type} narrows the list to ${data.type} networks`, async () => {
      await networkManagementPage.applyQuickFilter('type', data.type);
      const types = await networkManagementPage.readColumn(NETWORK_COLUMN.networkType);
      expect(types.filter((type) => type !== data.type)).toEqual([]);
    });

    await steps.step('The KPI tiles still show the whole-register counts', async () => {
      expect(await networkManagementPage.readKpis(), 'list filters must not change the tiles').toEqual(before);
    });
  });

  test(`TC-${CASES.serverAggregation.azureId}: should render exactly what the KPI and list endpoints aggregated when the module loads`, async ({
    networkManagementPage,
    steps,
  }) => {
    let dashboard: Record<string, number> = {};
    let items: Record<string, unknown>[] = [];

    await steps.critical('Navigate to the module - the KPI and list requests are made', async () => {
      dashboard = await networkManagementPage.captureDashboardTotals();
      items = await networkManagementPage.reloadAndCaptureItems();
      expect(items.length, 'the list request should return a page of rows').toBeGreaterThan(0);
    });

    await steps.step('The tiles render the dashboard endpoint\'s counts', async () => {
      expect(await networkManagementPage.readKpis()).toEqual({
        total: dashboard.total,
        active: dashboard.active,
        pending: dashboard.pending,
        inactive: dashboard.inactive,
        expired: dashboard.expired,
      });
    });

    await steps.step('Each row renders the facility and policy counts the list endpoint returned', async () => {
      const names = await networkManagementPage.readColumn(NETWORK_COLUMN.networkName);
      const facilities = await networkManagementPage.readColumn(NETWORK_COLUMN.facilities);
      const policies = await networkManagementPage.readColumn(NETWORK_COLUMN.linkedPolicies);
      expect(names).toEqual(items.map((item) => String(item.networkNameEn)));
      expect(facilities).toEqual(items.map((item) => String(item.linkedFacilitiesCount)));
      expect(policies).toEqual(items.map((item) => String(item.linkedPoliciesCount)));
    });
  });

  test(`TC-${CASES.totalIsSum.azureId}: should show a Total equal to Active plus Pending plus Inactive plus Expired when the tiles load`, async ({
    networkManagementPage,
    steps,
  }) => {
    let tiles: Record<string, number> = {};

    await steps.critical('Navigate to the module - all five tiles load with counts', async () => {
      await networkManagementPage.openList();
      tiles = await networkManagementPage.readKpis();
      expect(await networkManagementPage.getKpiLabels()).toEqual(KPI_LABELS);
    });

    await steps.step('The four status tiles sum to the Total tile', async () => {
      const sum = tiles.active + tiles.pending + tiles.inactive + tiles.expired;
      expect(sum, `Active ${tiles.active} + Pending ${tiles.pending} + Inactive ${tiles.inactive} + Expired ${tiles.expired}`).toBe(
        tiles.total,
      );
    });
  });

  test(`TC-${CASES.permission.azureId}: should show neither the KPI tiles nor the list when the user lacks the directory permission`, async ({
    shapedNonAdmin,
    steps,
  }) => {
    const session = await shapedNonAdmin({ without: [...DIRECTORY_PERMISSIONS] });

    await steps.critical('The restricted user is signed in with the directory permissions removed', async () => {
      expect(session.removed.length, 'the role should have had the directory permissions taken off').toBeGreaterThan(0);
    });

    await steps.step('Opening the directory renders neither the KPI band nor the list', async () => {
      const access = await session.networks.readListAccess();
      expect(access.kpis, 'the KPI tiles must not render').toBe(false);
      expect(access.table, 'the network list must not render').toBe(false);
    });
  });

  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.azureId}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
