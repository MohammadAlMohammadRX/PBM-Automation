import { test, expect } from '../../../fixtures';
import type { ConfirmDialog } from '../../../pages/components/ConfirmDialog';
import type { FacilityInactivateDrawer } from '../../../pages/facility/FacilityInactivateDrawer';
import type { FacilityRowValues } from '../../../pages/facility/FacilityManagementPage';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import { FACILITY_COLUMN, type FacilityKpiKey } from '../../../constants/facility/facilityIds';
import {
  ACTIONS_ACTIVE,
  ACTIONS_INACTIVE,
  CASES,
  CASE_TILES,
  EMPTY_LIST,
  IRREVERSIBLE_WARNING,
  LIST_COLUMNS,
} from '../../../data/facility/facilityListAndDashboardTiles.data';
import { NetworkUtils } from '../../../utils/NetworkUtils';
import { facilityDayText, facilityStatusCodes, readFacilityOrNull } from '../../../utils/FacilityProvisioning';
import { countByStatus, dayValue, openAsIs, tileNumbers } from '../../../utils/facility/writerAHelpers';

type Tiles = Record<FacilityKpiKey, { label: string; value: string }>;

/** The tiles the case names that are missing or not numeric, worded for the report. */
const missingTiles = (tiles: Tiles): string[] =>
  CASE_TILES.filter((t) => !t.label.test(tiles[t.key]?.label ?? '') || !/^\d+$/.test(tiles[t.key]?.value ?? '')).map((t) => `${t.name} ("${tiles[t.key]?.label ?? ''}" ${tiles[t.key]?.value ?? ''})`);

/**
 * User story 15131: Facility list and dashboard tiles.
 * The five tiles against the register, Expired apart from Inactive, the Cards /
 * Table views and the default view, row actions per status, Inactivate,
 * Activate and Delete from the list with their tiles, the list's columns, an
 * empty register, and View opening the right facility. 17506 (a role without
 * Delete) is in list-delete-permission.spec.ts. See the data file for how the
 * cases map onto the live list.
 */
test.describe('US 15131 - Facility list and dashboard tiles', () => {
  test.describe.configure({ timeout: 10 * 60_000 });

  test(`TC-${CASES.accurateTiles.azureId}: should show Total, Active, Future, Inactive and Expired Licences tiles each matching the facility records`, async ({
    facilityManagementPage: list,
    facilityIn,
    page,
    steps,
  }) => {
    for (const state of ['Active', 'Future', 'Inactive', 'Expired'] as const) await facilityIn(state);
    let tiles = {} as Tiles;

    await steps.critical('Navigate to the Facility Management module - the module home page loads', async () => {
      await list.openTable();
      expect(await list.countRows(), 'the facility list').toBeGreaterThan(0);
    });

    await steps.step('Open the facility dashboard - tiles for Total, Active, Future, Inactive and Expired Licenses are displayed', async () => {
      expect(await list.isKpiBandVisible(), 'the dashboard tiles').toBe(true);
      tiles = await list.readKpis();
      expect(missingTiles(tiles), `tiles shown: ${Object.values(tiles).map((t) => `"${t.label}" ${t.value}`).join(', ')}`).toEqual([]);
    });

    await steps.step('Compare each tile value against the known facility records - each tile shows the correct count', async () => {
      const register = await countByStatus(page);
      const shown = tileNumbers(tiles);
      expect(shown, 'the tiles against the register counted by displayed status')
        .toEqual({ total: register.total, active: register.active, pending: register.pending, inactive: register.inactive, expired: register.expired });
    });
  });

  test(`TC-${CASES.expiredApartFromInactive.azureId}: should count expired licences separately from facilities set to inactive`, async ({
    facilityManagementPage: list,
    facilityIn,
    page,
    steps,
  }) => {
    const facilityA = await facilityIn('Inactive'); // Inactive, valid licence
    const facilityB = await facilityIn('Expired'); // Is Active on, licence expired
    let shown = {} as Record<FacilityKpiKey, number>;

    await steps.critical('Navigate to the Facility Management module - the module home page loads', async () => {
      await list.openTable();
      expect(await list.countRows()).toBeGreaterThan(0);
    });

    await steps.step('Open the facility dashboard - dashboard tiles are displayed', async () => {
      const tiles = await list.readKpis();
      expect(missingTiles(tiles)).toEqual([]);
      shown = tileNumbers(tiles);
    });

    await steps.step('Note the value on the Inactive tile - it shows only facilities manually set to inactive', async () => {
      const register = await countByStatus(page);
      const codes = await facilityStatusCodes(page);
      const manuallyInactive = register.items.filter((i) => !i.isActive && codes[i.statusId] !== 'expired');
      expect({ tile: shown.inactive, facilityA: manuallyInactive.some((i) => i.id === facilityA.id), facilityB: manuallyInactive.some((i) => i.id === facilityB.id) },
        `"${facilityA.nameEn}" (inactive, valid licence) / "${facilityB.nameEn}" (active, expired licence)`)
        .toEqual({ tile: manuallyInactive.length, facilityA: true, facilityB: false });
    });

    await steps.step('Note the value on the Expired Licences tile - it shows only facilities whose licence has expired, independent of the Inactive count', async () => {
      const register = await countByStatus(page);
      const codes = await facilityStatusCodes(page);
      const expiredLicences = register.items.filter((i) => codes[i.statusId] === 'expired');
      expect({ tile: shown.expired, facilityB: expiredLicences.some((i) => i.id === facilityB.id), facilityA: expiredLicences.some((i) => i.id === facilityA.id) })
        .toEqual({ tile: expiredLicences.length, facilityB: true, facilityA: false });
      expect(shown.active + shown.pending + shown.inactive + shown.expired, 'Active + Future + Inactive + Expired against Total (no facility counted twice)').toBe(shown.total);
    });
  });

  test(`TC-${CASES.cardView.azureId}: should re-render the facility records as cards with their summary when Card View is selected`, async ({
    facilityManagementPage: list,
    facilityIn,
    steps,
  }) => {
    const facility = await facilityIn('Active');

    await steps.critical('Navigate to the Facility Management module - the module loads with the list view displayed', async () => {
      await list.openTable();
      expect(await list.readView()).toBe('table');
    });

    await steps.step('Select the Card View option - the facility records are re-rendered as cards', async () => {
      await list.switchToCards();
      expect(await list.readView(), 'the view after choosing Cards').toBe('cards');
      expect(await list.loadCardsUntilShown(facility.nameEn), `a card for "${facility.nameEn}"`).toBe(true);
    });

    await steps.step('Review the card layout - each facility card shows the relevant facility summary information', async () => {
      const card = await list.readCard(facility.nameEn);
      expect({ name: card.title, type: card.typeTag, code: card.code, licenceNo: card.licenseNo, expiryDay: dayValue(card.licenseExpiry), status: card.statusBadge }, `card "${card.header}"`)
        .toEqual({ name: facility.nameEn, type: 'Pharmacy', code: facility.code, licenceNo: facility.licenseNo, expiryDay: dayValue(facility.licenseExpiryDate), status: 'Active' });
    });

    // The view is remembered per user: leave it on Table for the cases that follow.
    await list.switchToTable().catch(() => undefined);
  });

  test(`TC-${CASES.defaultListView.azureId}: should open the facility list in List View when the module is opened without changing the view`, async ({
    facilityManagementPage: list,
    page,
    steps,
  }) => {
    await steps.critical('Navigate to the Facility Management module - the module loads', async () => {
      await openAsIs(list, page);
      expect(await list.isKpiBandVisible()).toBe(true);
    });

    await steps.step('Observe the facility list on first load without changing any view setting - the facility records are shown in List View', async () => {
      const view = await list.readView();
      expect(view, 'the view the module opened in').toBe('table');
      expect(await list.getRowCount(), 'rows in the list').toBeGreaterThan(0);
    });
  });

  test(`TC-${CASES.tableView.azureId}: should re-render the facility records in a table grid when Table View is selected`, async ({
    facilityManagementPage: list,
    facilityIn,
    steps,
  }) => {
    const facility = await facilityIn('Active');

    await steps.critical('Navigate to the Facility Management module - the module loads', async () => {
      await list.openTable();
      await list.switchToCards();
      expect(await list.readView(), 'starting from Cards, so choosing Table is a real switch').toBe('cards');
    });

    await steps.step('Select the Table View option - the facility records are re-rendered in a tabular grid', async () => {
      await list.switchToTable();
      expect(await list.readView()).toBe('table');
      expect(await list.countRows(), 'table rows').toBeGreaterThan(0);
    });

    await steps.step('Review the table columns - facility data is presented in table rows and columns', async () => {
      expect((await list.getHeaderTexts()).length, 'column headers').toBeGreaterThanOrEqual(LIST_COLUMNS.length);
      const row = await list.readRow(facility.nameEn);
      expect(row).toEqual({ name: facility.nameEn, type: 'Pharmacy', code: facility.code, licenseNo: facility.licenseNo, licenseExpiry: facilityDayText(facility.licenseExpiryDate), status: 'Active' });
    });
  });

  test(`TC-${CASES.actionsByStatus.azureId}: should offer Inactivate on an Active facility and Activate on an Inactive one, with View, Edit and Delete on both`, async ({
    facilityManagementPage: list,
    facilityIn,
    steps,
  }) => {
    const active = await facilityIn('Active');
    const inactive = await facilityIn('Inactive');

    await steps.critical('Navigate to the Facility Management module - the module loads', async () => {
      await list.openTable();
      expect(await list.countRows()).toBeGreaterThan(0);
    });

    await steps.step('Locate an Active facility row and review its Actions column - View, Edit, Inactivate and Delete are available; Activate is not offered', async () => {
      const states = await list.readActionStates(active.nameEn);
      expect({
        notAvailable: ACTIONS_ACTIVE.offered.filter((a) => states[a].availability !== 'available'),
        offered: ACTIONS_ACTIVE.absent.filter((a) => states[a].availability !== 'absent'),
      }, `"${active.nameEn}" actions: ${JSON.stringify(states)}`).toEqual({ notAvailable: [], offered: [] });
    });

    await steps.step('Locate an Inactive facility row and review its Actions column - View, Edit, Activate and Delete are available; Inactivate is not offered', async () => {
      const states = await list.readActionStates(inactive.nameEn);
      expect({
        notAvailable: ACTIONS_INACTIVE.offered.filter((a) => states[a].availability !== 'available'),
        offered: ACTIONS_INACTIVE.absent.filter((a) => states[a].availability !== 'absent'),
      }, `"${inactive.nameEn}" actions: ${JSON.stringify(states)}`).toEqual({ notAvailable: [], offered: [] });
    });
  });

  test(`TC-${CASES.inactivate.azureId}: should change an Active facility to Inactive and raise the Inactive tile by one when Inactivate is confirmed`, async ({
    facilityManagementPage: list,
    facilityIn,
    steps,
  }) => {
    const facility = await facilityIn('Active');
    let before = NaN;
    let drawer!: FacilityInactivateDrawer;

    await steps.critical('Navigate to the Facility Management module - the module loads', async () => {
      await list.openTable();
      before = await list.readKpi('inactive');
      expect(Number.isNaN(before), 'the Inactive tile before').toBe(false);
    });

    await steps.critical('Locate the active facility and select Inactivate - a confirmation prompt is displayed', async () => {
      drawer = await list.openInactivateDrawer(facility.nameEn);
      expect(await drawer.getTitleText(), 'the Inactivate prompt').toMatch(/inactivate/i);
    });

    await steps.step('Confirm the action - the facility status changes to Inactive and the dashboard Inactive tile count increases by one', async () => {
      const answer = await drawer.inactivate(CASES.inactivate.details);
      expect(answer.status, `SetFacilityActive: ${answer.text.slice(0, 200)} ${answer.messages.join(' | ')}`).toBe(200);
      await list.openTable();
      expect({ status: (await list.readRow(facility.nameEn)).status, inactiveTile: await list.readKpi('inactive') })
        .toEqual({ status: 'Inactive', inactiveTile: before + 1 });
    });
  });

  test(`TC-${CASES.activate.azureId}: should change an Inactive facility to Active and raise the Active tile by one when Activate is confirmed`, async ({
    facilityManagementPage: list,
    facilityIn,
    page,
    steps,
  }) => {
    const facility = await facilityIn('Inactive');
    let before = NaN;
    let dialog!: ConfirmDialog;

    await steps.critical('Navigate to the Facility Management module - the module loads', async () => {
      await list.openTable();
      before = await list.readKpi('active');
      expect(Number.isNaN(before), 'the Active tile before').toBe(false);
    });

    await steps.critical('Locate the inactive facility and select Activate - a confirmation prompt is displayed', async () => {
      dialog = await list.requestAction(facility.nameEn, 'activate');
      expect(await dialog.getTitle(), 'the Activate prompt').toMatch(/activate/i);
    });

    await steps.step('Confirm the action - the facility status changes to Active and the dashboard Active tile count increases by one', async () => {
      const answer = await NetworkUtils.captureResponse(page, ApiEndpoints.facilitySetActive, () => dialog.confirm());
      expect(answer?.status, `SetFacilityActive: ${answer?.text.slice(0, 200) ?? 'no answer'}`).toBe(200);
      await list.openTable();
      expect({ status: (await list.readRow(facility.nameEn)).status, activeTile: await list.readKpi('active') })
        .toEqual({ status: 'Active', activeTile: before + 1 });
    });
  });

  test(`TC-${CASES.columns.azureId}: should show Facility Name, Facility Type, Code, License Number, License Expiry Date, Status and Actions populated for each record`, async ({
    facilityManagementPage: list,
    facilityIn,
    steps,
  }) => {
    const facility = await facilityIn('Active');

    await steps.critical('Navigate to the Facility Management module - the module loads', async () => {
      await list.openTable();
    });

    await steps.step('Open the facility list - the list of facilities is displayed', async () => {
      expect(await list.countRows(), 'rows in the list').toBeGreaterThan(0);
    });

    await steps.step('Check the list of columns against the required set - all required columns are present and populated with correct data for each row', async () => {
      const headers = await list.getHeaderTexts();
      expect(LIST_COLUMNS.filter(([, header]) => !headers.some((h) => header.test(h))).map(([name]) => name), `columns missing - headers shown: ${headers.join(', ')}`).toEqual([]);
      const blanks = (await list.readRowsOnScreen()).flatMap((row) => Object.entries(row).filter(([, value]) => value === '').map(([column]) => `${row.name || row.code}: ${column}`));
      expect(blanks, 'blank cells').toEqual([]);
      const own = await list.readRow(facility.nameEn);
      expect(own).toEqual({ name: facility.nameEn, type: 'Pharmacy', code: facility.code, licenseNo: facility.licenseNo, licenseExpiry: facilityDayText(facility.licenseExpiryDate), status: 'Active' });
      expect(await list.readOfferedActions(facility.nameEn), 'the Actions column').toEqual(expect.arrayContaining(['View', 'Edit', 'Delete']));
    });
  });

  test(`TC-${CASES.delete.azureId}: should warn the delete is irreversible, then remove the facility and lower the Total tile by one`, async ({
    facilityManagementPage: list,
    facilityIn,
    page,
    steps,
  }) => {
    const facility = await facilityIn('Active');
    let total = NaN;
    let dialog!: ConfirmDialog;

    await steps.critical('Navigate to the Facility Management module - the module loads', async () => {
      await list.openTable();
      total = await list.readKpi('total');
      expect(Number.isNaN(total), 'the Total tile before').toBe(false);
    });

    await steps.step('Select Delete on a facility row - a confirmation prompt warns that the action is irreversible', async () => {
      dialog = await list.requestAction(facility.nameEn, 'delete');
      const prompt = `${await dialog.getTitle()} / ${await dialog.getMessage()}`;
      expect(prompt, 'the delete prompt').toMatch(IRREVERSIBLE_WARNING);
    });

    await steps.step('Confirm the deletion - the facility is removed from the list and the Total tile count decreases by one', async () => {
      const answer = await NetworkUtils.captureResponse(page, ApiEndpoints.facilityDelete, () => dialog.confirm());
      expect(answer?.status, `DeleteFacility: ${answer?.text.slice(0, 200) ?? 'no answer'}`).toBe(200);
      await list.openTable();
      expect({ listed: await list.isListed(facility.nameEn), totalTile: await list.readKpi('total'), record: await readFacilityOrNull(page, facility.id) })
        .toEqual({ listed: false, totalTile: total - 1, record: null });
    });
  });

  test(`TC-${CASES.zeroTiles.azureId}: should show zero on every tile and an empty-state message when no facility exists`, async ({
    facilityManagementPage: list,
    steps,
  }) => {
    let tiles = {} as Tiles;

    await steps.critical('Navigate to the Facility Management module - the module loads with no facility records', async () => {
      await list.simulateEmptyRegister();
      await list.open();
      expect(await list.isKpiBandVisible(), 'the dashboard tiles').toBe(true);
    });

    await steps.step('Open the facility dashboard - dashboard tiles are displayed', async () => {
      tiles = await list.readKpis();
      expect(CASE_TILES.filter((t) => !t.label.test(tiles[t.key].label)).map((t) => t.name), `tiles shown: ${Object.values(tiles).map((t) => t.label).join(', ')}`).toEqual([]);
    });

    await steps.step('Review each tile value - Total, Active, Pending, Inactive and Expired Licences all show zero and the list shows an empty state message', async () => {
      const empty = await list.getEmptyStateText();
      const rows = await list.getRowCount().catch(() => -1);
      await list.restoreEndpoints();
      expect({ tiles: tileNumbers(tiles), rows, emptyState: EMPTY_LIST.test(empty) }, `empty state "${empty}"`)
        .toEqual({ tiles: { total: 0, active: 0, pending: 0, inactive: 0, expired: 0 }, rows: 0, emptyState: true });
    });

    await list.restoreEndpoints().catch(() => undefined);
  });

  test(`TC-${CASES.tilesAfterChange.azureId}: should update the list and the tiles without a manual refresh after a facility's status changes`, async ({
    facilityManagementPage: list,
    facilityIn,
    steps,
  }) => {
    const facility = await facilityIn('Active');
    const data = CASES.tilesAfterChange;
    let before = {} as Record<FacilityKpiKey, number>;

    await steps.critical('Navigate to the Facility Management module - the module loads and the tile counts are recorded', async () => {
      await list.openTable();
      before = tileNumbers(await list.readKpis());
      await list.revealRow(facility.nameEn);
      expect(Number.isNaN(before.total), 'the tiles before').toBe(false);
    });

    await steps.critical('Change the status of an existing facility (inactivate it) - the facility list updates immediately', async () => {
      const drawer = await list.openInactivateDrawer(facility.nameEn);
      const answer = await drawer.inactivate(data.details);
      expect(answer.status, `SetFacilityActive: ${answer.text.slice(0, 200)}`).toBe(200);
      await expect.poll(() => list.getCellValueById(facility.id, FACILITY_COLUMN.status), { timeout: data.settleMs, message: 'the row\'s status without a reload' }).toBe('Inactive');
    });

    await steps.step('Return to the dashboard and compare the tile counts to the pre-change values - they reflect the new facility standing without a manual refresh', async () => {
      await expect.poll(async () => {
        const now = tileNumbers(await list.readKpis());
        return { total: now.total, active: now.active, inactive: now.inactive };
      }, { timeout: data.settleMs, message: 'the tiles without a reload' }).toEqual({ total: before.total, active: before.active - 1, inactive: before.inactive + 1 });
    });
  });

  test(`TC-${CASES.viewOpensRow.azureId}: should open the selected facility's details matching its row when View is selected`, async ({
    facilityManagementPage: list,
    facilityDetailPage: detail,
    facilityIn,
    steps,
  }) => {
    const facility = await facilityIn('Active');
    await facilityIn('Active'); // the list holds several facilities
    let row = {} as FacilityRowValues;

    await steps.critical('Navigate to the Facility Management module - the module loads', async () => {
      await list.openTable();
      row = await list.readRow(facility.nameEn);
      expect(row.name).toBe(facility.nameEn);
    });

    await steps.critical('Select View on a specific facility row - the facility\'s detail page opens', async () => {
      await list.openDetails(facility.nameEn);
      expect(detail.idFromUrl(), 'the detail opened').toBe(facility.id);
    });

    await steps.step('Confirm the details shown match the selected row - the name, type, code, licence number, expiry date and status match', async () => {
      const header = await detail.getHeaderText();
      const shown = {
        name: await detail.getName(),
        type: await detail.getTypeTag(),
        code: await detail.readOverviewField('facilityCode'),
        licenseNo: header.includes(row.licenseNo) ? row.licenseNo : header,
        expiryDay: dayValue(await detail.readOverviewField('licenseExpiry')),
        status: await detail.getStatus(),
      };
      expect(shown).toEqual({ name: row.name, type: row.type, code: row.code, licenseNo: row.licenseNo, expiryDay: dayValue(row.licenseExpiry), status: row.status });
    });
  });
});
