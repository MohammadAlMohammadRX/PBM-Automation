import { test, expect } from '../../../fixtures';
import {
  CASES,
  DEACTIVATION_DETAILS,
  EMPTY_STATE,
  PENDING_CAPTION,
  PENDING_REGISTRATION_BLOCKED,
  SCOPE_PAYER,
  TILE_LABELS,
} from '../../../data/user/userListDashboardCounters.data';
import { USER_LIST } from '../../../constants/user/userIds';
import { Timeouts } from '../../../constants/Timeouts';
import { listUsers, readUserDashboard, type UserDashboard } from '../../../utils/UserProvisioning';
import { earlierFailures, pressEnterOn, readTiles, type Tiles } from '../../../utils/user/writerAHelpers';

/**
 * User story 20408: User List - Dashboard Counters.
 * The four tiles of Users Administration (Total Users, Active, Inactive -
 * clickable filters; Pending Approval - not clickable, with its caption)
 * against the register at the moment. Pending registrations cannot be produced
 * (story 20422 is MANUAL): those parts are BLOCKED. See the data file.
 */
test.describe('US 20408 - User List - Dashboard Counters', () => {
  test.describe.configure({ timeout: 6 * 60_000 });

  test(`TC-${CASES.totalTile.azureId}: should show Active plus Inactive on the Total Users tile and list every user when it is clicked`, async ({
    steps,
    userIn,
    userListPage: list,
  }) => {
    await userIn('Active');
    await userIn('InactiveAtCreate');
    let tiles!: Tiles;

    await steps.critical('Navigate to the User Management module - the module landing page is displayed', async () => {
      await list.openTable();
      await list.expectToolbar();
    });

    await steps.step('View the Total Users tile - it displays Active users plus Inactive users', async () => {
      tiles = await readTiles(list);
      const api = await list.fetchDashboard();
      expect({ tile: tiles.total, platform: api.total }, `Active ${tiles.active} + Inactive ${tiles.inactive}`)
        .toEqual({ tile: tiles.active + tiles.inactive, platform: tiles.total });
    });

    await steps.step('Click the Total Users tile - the list refreshes and displays all users regardless of status', async () => {
      await list.clickKpi('inactive');
      const { request, answer } = await list.clickKpi('total');
      expect({
        statusFilter: 'isActive' in request ? request.isActive : 'none',
        totalRows: answer.totalRows,
        bothStatuses: answer.items.some((u) => u.isActive) && answer.items.some((u) => !u.isActive),
      }, JSON.stringify(request)).toEqual({ statusFilter: 'none', totalRows: tiles.total, bothStatuses: true });
    });
  });

  test(`TC-${CASES.activeTile.azureId}: should filter the list to active users when the Active tile is clicked`, async ({
    page,
    steps,
    userIn,
    userListPage: list,
  }) => {
    await userIn('Active');
    await userIn('InactiveAtCreate');
    let tile = -1;

    await steps.critical('Navigate to the User Management module - the module landing page is displayed', async () => {
      await list.openTable();
      await list.expectToolbar();
    });

    await steps.step('View the Active tile - it shows the current count of active users', async () => {
      tile = (await readTiles(list)).active;
      expect(tile).toBe((await listUsers(page, { isActive: true }, 1)).totalRows);
    });

    await steps.step('Click the Active tile - the list updates to show only users with Active status', async () => {
      const { request, answer } = await list.clickKpi('active');
      const statuses = await list.readColumn('status');
      expect({
        statusFilter: request.isActive,
        totalRows: answer.totalRows,
        inactiveInAnswer: answer.items.filter((u) => !u.isActive).length,
        otherOnScreen: statuses.filter((s) => s !== 'Active'),
      }).toEqual({ statusFilter: true, totalRows: tile, inactiveInAnswer: 0, otherOnScreen: [] });
    });
  });

  test(`TC-${CASES.pendingCaption.azureId}: should show the pending registration count with the caption on the Pending Approval tile`, async ({
    steps,
    userListPage: list,
  }) => {
    let tiles!: Tiles;
    let api!: UserDashboard;

    await steps.critical('Navigate to the User Management module - the module landing page is displayed', async () => {
      await list.openTable();
      await list.expectToolbar();
    });

    await steps.step('View the Pending Approval tile - it displays the count of registrations waiting for a decision', async () => {
      tiles = await readTiles(list);
      api = await list.fetchDashboard();
      expect({ label: TILE_LABELS.pendingApproval.test(tiles.labels.pendingApproval), value: tiles.pendingApproval })
        .toEqual({ label: true, value: api.pendingApproval });
    });

    await steps.step(`Read the tile caption text - it reads "${PENDING_CAPTION}"`, async () => {
      expect(tiles.caption).toContain(PENDING_CAPTION);
      if (api.pendingApproval === 0) {
        expect(earlierFailures(steps), `NOT EXERCISED - ${PENDING_REGISTRATION_BLOCKED}`).toEqual([]);
        steps.blocked(`the tile reads 0, so "shows the 5 pending registrations" cannot be observed - ${PENDING_REGISTRATION_BLOCKED}`);
      }
    });
  });

  test(`TC-${CASES.inactiveTile.azureId}: should filter the list to inactive users when the Inactive tile is clicked`, async ({
    page,
    steps,
    userIn,
    userListPage: list,
  }) => {
    await userIn('Active');
    await userIn('Deactivated');
    let tile = -1;

    await steps.critical('Navigate to the User Management module - the module landing page is displayed', async () => {
      await list.openTable();
      await list.expectToolbar();
    });

    await steps.step('View the Inactive tile - it shows the current count of inactive users', async () => {
      tile = (await readTiles(list)).inactive;
      expect(tile).toBe((await listUsers(page, { isActive: false }, 1)).totalRows);
    });

    await steps.step('Click the Inactive tile - the list updates to show only users with Inactive status', async () => {
      const { request, answer } = await list.clickKpi('inactive');
      const statuses = await list.readColumn('status');
      expect({
        statusFilter: request.isActive,
        totalRows: answer.totalRows,
        activeInAnswer: answer.items.filter((u) => u.isActive).length,
        otherOnScreen: statuses.filter((s) => s !== 'Inactive'),
      }).toEqual({ statusFilter: false, totalRows: tile, activeInAnswer: 0, otherOnScreen: [] });
    });
  });

  test(`TC-${CASES.pendingNotClickable.azureId}: should not navigate, filter or change the screen when the Pending Approval tile is clicked`, async ({
    page,
    steps,
    userListPage: list,
  }) => {
    await steps.critical('Navigate to the User Management module - the module landing page is displayed', async () => {
      await list.openTable();
      await list.expectToolbar();
    });

    await steps.step('Click directly on the Pending Approval tile - no navigation, filtering or screen change occurs', async () => {
      const before = await list.rowIdsOnScreen();
      const click = await list.clickPendingApproval();
      expect({ sameUrl: click.urlAfter === click.urlBefore, listRequested: click.listRequested, sameRows: (await list.rowIdsOnScreen()).join() === before.join(), inButton: (await readTiles(list)).clickable.pendingApproval })
        .toEqual({ sameUrl: true, listRequested: false, sameRows: true, inButton: false });
    });

    await steps.step('Click the tile several times and press Enter on it with keyboard focus - the tile stays static with no interactive response', async () => {
      const clicks = [await list.clickPendingApproval(), await list.clickPendingApproval(), await list.clickPendingApproval()];
      const enter = await pressEnterOn(page, USER_LIST.kpi.pendingApproval);
      expect({
        clicksMoved: clicks.filter((c) => c.urlAfter !== c.urlBefore || c.listRequested).length,
        enterMoved: enter.urlAfter !== enter.urlBefore || enter.listRequested,
      }).toEqual({ clicksMoved: 0, enterMoved: false });
    });
  });

  test(`TC-${CASES.pendingNeverListed.azureId}: should never list a pending registration in Users Administration whatever the filter`, async ({
    steps,
    userListPage: list,
  }) => {
    await steps.critical('Navigate to the User Management module - the module landing page is displayed', async () => {
      await list.openTable();
      await list.expectToolbar();
    });

    await steps.step('Click the Total Users tile - the list shows only active and inactive users, no pending registrations', async () => {
      expect(earlierFailures(steps), `NOT EXERCISED - ${PENDING_REGISTRATION_BLOCKED}`).toEqual([]);
      steps.blocked(PENDING_REGISTRATION_BLOCKED);
    });
  });

  test(`TC-${CASES.approvalManagementOnly.azureId}: should leave the decision on a pending registration to Approval Management only`, async ({
    steps,
    userListPage: list,
  }) => {
    await steps.critical('Navigate to the User Management module - the module landing page is displayed', async () => {
      await list.openTable();
      await list.expectToolbar();
    });

    await steps.step('Confirm the pending registration is not actionable from Users Administration - no approve / reject controls exist for it there', async () => {
      expect(earlierFailures(steps), `NOT EXERCISED - ${PENDING_REGISTRATION_BLOCKED}`).toEqual([]);
      steps.blocked(PENDING_REGISTRATION_BLOCKED);
    });
  });

  test(`TC-${CASES.zeroTiles.azureId}: should show 0 on the tiles and an empty list when a category holds no user`, async ({
    steps,
    suiteSession,
  }) => {
    const s = await suiteSession({ payers: [SCOPE_PAYER] });

    await steps.critical(`Navigate to the User Management module as an administrator scoped to "${SCOPE_PAYER}" - the module landing page is displayed`, async () => {
      await s.users.openTable();
      await s.users.expectToolbar();
      const scoped = await readUserDashboard(s.page);
      expect(scoped.total, 'the scope lists its own users').toBeGreaterThan(0);
      if (scoped.inactive !== 0 || scoped.pendingApproval !== 0) {
        steps.blocked(`the precondition "zero inactive users and zero pending registrations" does not hold in the "${SCOPE_PAYER}" scope: ${JSON.stringify(scoped)}`);
      }
    });

    await steps.step('View the Inactive tile - it displays a count of 0', async () => {
      expect((await readTiles(s.users)).inactive).toBe(0);
    });

    await steps.step('View the Pending Approval tile - it displays 0 with its caption still shown', async () => {
      const tiles = await readTiles(s.users);
      expect({ value: tiles.pendingApproval, caption: tiles.caption.includes(PENDING_CAPTION) }).toEqual({ value: 0, caption: true });
    });

    await steps.step('Click the Inactive tile - the list displays zero results with an appropriate empty state', async () => {
      const { request, answer } = await s.users.clickKpi('inactive');
      const empty = await s.users.getEmptyStateText();
      expect({ statusFilter: request.isActive, totalRows: answer.totalRows, rowsShown: (await s.users.rowIdsOnScreen().catch(() => [])).length, emptyState: EMPTY_STATE.test(empty) }, `empty state: "${empty}"`)
        .toEqual({ statusFilter: false, totalRows: 0, rowsShown: 0, emptyState: true });
    });
  });

  test(`TC-${CASES.allTilesChecklist.azureId}: should show all four tiles labelled and counted in line with the user data`, async ({
    page,
    steps,
    userIn,
    userListPage: list,
  }) => {
    await userIn('Active');
    await userIn('Deactivated');
    let tiles!: Tiles;

    await steps.critical('Navigate to the User Management module - the module landing page is displayed', async () => {
      await list.openTable();
      await list.expectToolbar();
    });

    await steps.step('Review the dashboard against the checklist - all four tiles are present, labelled and accurate, the Pending Approval tile with its caption', async () => {
      tiles = await readTiles(list);
      const register = {
        total: (await listUsers(page, {}, 1)).totalRows,
        active: (await listUsers(page, { isActive: true }, 1)).totalRows,
        inactive: (await listUsers(page, { isActive: false }, 1)).totalRows,
        pendingApproval: (await readUserDashboard(page)).pendingApproval,
      };
      expect({
        labels: (Object.keys(TILE_LABELS) as (keyof typeof TILE_LABELS)[]).map((k) => TILE_LABELS[k].test(tiles.labels[k])),
        values: { total: tiles.total, active: tiles.active, inactive: tiles.inactive, pendingApproval: tiles.pendingApproval },
        caption: tiles.caption.includes(PENDING_CAPTION),
      }, JSON.stringify(tiles.labels)).toEqual({ labels: [true, true, true, true], values: register, caption: true });
    });

    await steps.step('Verify Total Users = Active + Inactive exactly - the totals reconcile with no discrepancy', async () => {
      expect(tiles.total).toBe(tiles.active + tiles.inactive);
    });
  });

  test(`TC-${CASES.totalBothPartitions.azureId}: should list users of both the Active and Inactive partitions when the Total Users tile is clicked`, async ({
    steps,
    userIn,
    userListPage: list,
  }) => {
    await userIn('Active');
    await userIn('InactiveAtCreate');
    let tiles!: Tiles;
    let rows = -1;
    let statusesShown: string[] = [];
    let answerStatuses: boolean[] = [];

    await steps.critical('Navigate to the User Management module - the module landing page is displayed', async () => {
      await list.openTable();
      await list.expectToolbar();
      tiles = await readTiles(list);
    });

    await steps.step('Click the Total Users tile - the list loads', async () => {
      await list.clickKpi('active');
      const { answer } = await list.clickKpi('total');
      rows = answer.totalRows;
      answerStatuses = answer.items.map((u) => u.isActive);
      statusesShown = await list.readColumn('status');
      expect(rows).toBeGreaterThan(0);
    });

    await steps.step('Verify the list holds users of both the Active and Inactive partitions - both statuses are represented and pending users are excluded', async () => {
      expect({
        activeShown: statusesShown.includes('Active') && answerStatuses.includes(true),
        inactiveShown: statusesShown.includes('Inactive') && answerStatuses.includes(false),
        onlyThePartitions: rows === tiles.active + tiles.inactive,
      }, `${rows} rows; tiles ${JSON.stringify({ active: tiles.active, inactive: tiles.inactive, pending: tiles.pendingApproval })}`)
        .toEqual({ activeShown: true, inactiveShown: true, onlyThePartitions: true });
    });
  });

  test(`TC-${CASES.countersRefresh.azureId}: should refresh the counters when a user's status changes or a registration is decided`, async ({
    steps,
    userIn,
    userListPage: list,
  }) => {
    const target = await userIn('Active');
    let before!: Tiles;

    await steps.critical('Navigate to the User Management module - the module landing page is displayed', async () => {
      await list.openTable();
      await list.expectToolbar();
    });

    await steps.critical('Note the current Total, Active, Inactive and Pending Approval counts - baseline counts are recorded', async () => {
      before = await readTiles(list);
      expect([before.total, before.active, before.inactive, before.pendingApproval].every(Number.isFinite), JSON.stringify(before)).toBe(true);
    });

    await steps.step(`Deactivate the active user "${target.displayNameEn}" (the approval of a pending registration: BLOCKED, see the last step) - Active -1, Inactive +1, Total = Active + Inactive`, async () => {
      await list.revealRow(target.displayNameEn);
      const drawer = await list.openDeactivate(target.id);
      const done = await drawer.deactivate('Other', DEACTIVATION_DETAILS);
      expect(done.status, `${done.text.slice(0, 200)} ${done.messages.join(' | ')}`).toBe(200);
      await expect.poll(async () => {
        const t = await readTiles(list);
        return { total: t.total, active: t.active, inactive: t.inactive };
      }, { timeout: Timeouts.default, message: 'the tiles should update without navigating' })
        .toEqual({ total: before.total, active: before.active - 1, inactive: before.inactive + 1 });
    });

    await steps.step('Refresh / reopen the dashboard - the counters keep the updated values', async () => {
      await list.openTable();
      const after = await readTiles(list);
      expect({ total: after.total, active: after.active, inactive: after.inactive, pendingApproval: after.pendingApproval })
        .toEqual({ total: before.total, active: before.active - 1, inactive: before.inactive + 1, pendingApproval: before.pendingApproval });
      expect(earlierFailures(steps), `NOT EXERCISED - the approval part: ${PENDING_REGISTRATION_BLOCKED}`).toEqual([]);
      steps.blocked(`the deactivation part passed; the approval part (Pending Approval -1) needs ${PENDING_REGISTRATION_BLOCKED}`);
    });
  });
});
