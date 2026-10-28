import { test, expect } from '../../../fixtures';
import {
  CASES,
  KPI_SETTLE_MS,
  KPI_STATUS_FILTERS,
  KPI_TYPE_FILTER,
  REMOVED_TILE,
  REQUIRED_KPI_KEYS,
  kpiSearchTerm,
} from '../../../data/plans/planDirectoryKpis.data';

/**
 * User story 14145: View plan directory with KPI tiles and filtering.
 * The KPI band - register-wide tiles that keep their values under every
 * filter, the removed Draft tile, Pending and Inactive counted apart, and who
 * may see the directory at all.
 *
 * The tiles count the WHOLE register and never follow the list's filters or
 * search (business rule, 2026-10-27): 18947 and 18952 no longer compare a tile
 * with a filtered list total, they check that filtering leaves the tiles alone.
 */
test.describe('US 14145 - KPI tiles', () => {
  test(`TC-${CASES.kpiCounts.azureId}: should keep every KPI tile at its register-wide count when status, type and search filters are applied`, async ({
    planManagementPage,
    steps,
  }) => {
    let tiles: Record<string, number> = {};

    await steps.critical('Navigate to the Plans Management module - the directory loads with KPI tiles visible', async () => {
      await planManagementPage.openList();
      tiles = await planManagementPage.readKpis();
      expect(tiles.total, 'the Total tile should count the register').toBeGreaterThan(0);
    });

    await steps.step('The Total tile is at least the count on each status tile', async () => {
      for (const key of REQUIRED_KPI_KEYS) {
        expect(Number.isInteger(tiles[key]) && tiles[key] >= 0, `the ${key} tile should show a whole number`).toBe(true);
        expect(tiles.total, `Total vs the ${key} tile`).toBeGreaterThanOrEqual(tiles[key]);
      }
    });

    await steps.step('Each Status filter in turn leaves every KPI tile unchanged', async () => {
      for (const status of KPI_STATUS_FILTERS) {
        await planManagementPage.openList();
        await planManagementPage.applyQuickFilter('status', status);
        await expect
          .poll(() => planManagementPage.readKpis(), { message: `the KPI tiles with the Status filter "${status}"`, timeout: KPI_SETTLE_MS })
          .toEqual(tiles);
      }
    });

    await steps.step('A Type filter and a search leave every KPI tile unchanged', async () => {
      await planManagementPage.openList();
      await planManagementPage.applyQuickFilter('type', KPI_TYPE_FILTER);
      await expect
        .poll(() => planManagementPage.readKpis(), { message: `the KPI tiles with the Type filter "${KPI_TYPE_FILTER}"`, timeout: KPI_SETTLE_MS })
        .toEqual(tiles);
      await planManagementPage.search(kpiSearchTerm());
      await expect
        .poll(() => planManagementPage.readKpis(), { message: 'the KPI tiles after a search', timeout: KPI_SETTLE_MS })
        .toEqual(tiles);
    });
  });

  test(`TC-${CASES.noDraftTile.azureId}: should show no Draft tile among the KPI tiles when a Draft plan exists`, async ({
    planManagementPage,
    planIn,
    steps,
  }) => {
    await planIn('Draft');

    await steps.critical('Navigate to the Plans Management module - the directory loads with KPI tiles visible', async () => {
      await planManagementPage.openList();
      expect(await planManagementPage.isKpiBandVisible(), 'the KPI band should render').toBe(true);
    });

    await steps.step('Only the Total, Active, Pending, Inactive and Expired tiles are shown', async () => {
      expect(await planManagementPage.getKpiTileKeys()).toEqual(REQUIRED_KPI_KEYS);
    });

    await steps.step('No Draft tile appears anywhere in the tile row although a Draft plan exists', async () => {
      const keys = await planManagementPage.getKpiTileKeys();
      const labels = await planManagementPage.getKpiLabels();
      expect([...keys, ...labels].filter((text) => REMOVED_TILE.test(text)), 'a Draft tile').toEqual([]);
    });
  });

  test(`TC-${CASES.pendingInactiveSeparate.azureId}: should count Pending and Inactive plans on separate tiles that the Status filter does not change when both statuses exist`, async ({
    planManagementPage,
    planIn,
    steps,
  }) => {
    test.setTimeout(15 * 60_000);
    await planIn('Pending');
    await planIn('Inactive');
    const data = CASES.pendingInactiveSeparate;
    let tiles: Record<string, number> = {};

    await steps.critical('Navigate to the Plans Management module - the directory loads with KPI tiles visible', async () => {
      await planManagementPage.openList();
      tiles = await planManagementPage.readKpis();
      expect(tiles.pending, 'a Pending plan exists').toBeGreaterThan(0);
      expect(tiles.inactive, 'an Inactive plan exists').toBeGreaterThan(0);
    });

    await steps.step('Filtering by Pending and then by Inactive leaves both tiles at their own counts', async () => {
      for (const status of [data.pending, data.inactive]) {
        await planManagementPage.openList();
        await planManagementPage.applyQuickFilter('status', status);
        await expect
          .poll(async () => {
            const now = await planManagementPage.readKpis();
            return { pending: now.pending, inactive: now.inactive };
          }, { message: `the Pending and Inactive tiles with the Status filter "${status}"`, timeout: KPI_SETTLE_MS })
          .toEqual({ pending: tiles.pending, inactive: tiles.inactive });
      }
    });

    await steps.step('Neither tile carries the combined Pending plus Inactive count', async () => {
      const combined = tiles.pending + tiles.inactive;
      expect(tiles.pending, 'the Pending tile must not include the Inactive plans').toBeLessThan(combined);
      expect(tiles.inactive, 'the Inactive tile must not include the Pending plans').toBeLessThan(combined);
    });
  });

  test(`TC-${CASES.directoryAccess.azureId}: should give the directory, KPI tiles, filters and search only to a Plan Administrator when each role opens the module`, async ({
    planManagementPage,
    shapedNonAdmin,
    requireBaseline,
    steps,
  }) => {
    const session = await shapedNonAdmin({ without: CASES.directoryAccess.permissions });

    await steps.critical('A user without Plan Administrator permissions is denied the directory', async () => {
      await planManagementPage.openList();
      requireBaseline(await planManagementPage.isKpiBandVisible(), 'the plan directory and its KPI band for a session holding the plan read rights');
      const access = await session.plans.readListAccess();
      expect(access.kpis, 'the KPI tiles must not render without the plan read rights').toBe(false);
      expect(access.table, 'the plan list must not render without the plan read rights').toBe(false);
    });

    await steps.step('A Plan Administrator gets the directory with KPI tiles, filters and search', async () => {
      const access = await planManagementPage.readListAccess();
      expect(access.table, 'the plan list should render').toBe(true);
      expect(access.kpis, 'the KPI tiles should render').toBe(true);
      expect(await planManagementPage.getFilterOptions('status'), 'the Status filter should offer options').not.toEqual([]);
      expect(await planManagementPage.isAdvancedSearchOffered(), 'search and filtering should be offered').toBe(true);
    });
  });
});
