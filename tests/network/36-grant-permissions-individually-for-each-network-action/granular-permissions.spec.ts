import { test, expect } from '../../../fixtures';
import type { ShapedSession } from '../../../fixtures/shapedNonAdmin.fixture';
import type { NetworkAccessAction } from '../../../pages/network/NetworkManagementPage';
import { NETWORK_PERMISSION } from '../../../data/accounts/payerAdminRole.data';
import { every, offeredIn, pick, sevenActionsExcept, SEVEN_ACTIONS } from '../../../data/networks/networkPermissions.data';
import {
  ALL_SEVEN,
  DETAILS_AND_EXPORT,
  EXPORT_ONLY,
  INACTIVATE_ONLY,
  ONLY_ACTION_CASES,
  REVERT_ONLY,
  ZERO_PERMISSIONS,
} from '../../../data/networks/granularPermissions.data';
import { NETWORK_LIFECYCLE } from '../../../data/networks/network.data';

/**
 * User story 14315: Grant permissions individually for each network action.
 * Seven network actions, each granted on its own catalogue permission.
 *
 * "A role with no network permissions, then grant only X" is the shared
 * Payer Admin role shaped for the case (fixture `shapedNonAdmin`) and restored
 * in teardown. What is compared is ACCESS, read in one pass by
 * NetworkManagementPage.readActionAccess: a control counts only when it is
 * offered and usable, a tab only when it loads its data.
 *
 * Every "denied" comparison covers only the actions the administrator is
 * offered on the same network (the 2026-09-21 baseline rule) - an action that
 * nobody is offered proves nothing by its absence.
 */
test.describe('US 14315 - One permission, one network action', () => {
  for (const scenario of [...ONLY_ACTION_CASES, DETAILS_AND_EXPORT]) {
    test(`TC-${scenario.azureId}: ${scenario.title}`, async ({
      networkManagementPage,
      shapedNonAdmin,
      requireBaseline,
      networkIn,
      steps,
    }) => {
      test.setTimeout(20 * 60_000);
      const network = await networkIn('Active');
      let shaped!: ShapedSession;
      let deniedOffered: NetworkAccessAction[] = [];
      let access!: Record<NetworkAccessAction, boolean>;

      await steps.critical('Navigate to the Network Management module - the network list is displayed', async () => {
        const baseline = await networkManagementPage.readActionAccess(network);
        requireBaseline(scenario.granted.every((action) => baseline[action]), scenario.granted.join(' + '));
        deniedOffered = offeredIn(baseline, sevenActionsExcept(...scenario.granted));
        expect(baseline.viewList).toBe(true);
      });

      await steps.critical('The role shows only the granted permission checked and the others unchecked', async () => {
        shaped = await shapedNonAdmin(scenario.role);
        expect(shaped.granted).toEqual(scenario.role.with.map((key) => NETWORK_PERMISSION[key]));
        expect(shaped.removed).toEqual(scenario.role.without.map((key) => NETWORK_PERMISSION[key]));
      });

      await steps.step('The user with that role is given the granted action', async () => {
        access = await shaped.networks.readActionAccess(network);
        expect(pick(access, scenario.granted)).toEqual(every(scenario.granted, true));
      });

      await steps.step('Every other network action is denied or hidden', async () => {
        expect(pick(access, deniedOffered)).toEqual(every(deniedOffered, false));
      });
    });
  }

  test(`TC-${EXPORT_ONLY.azureId}: ${EXPORT_ONLY.title}`, async ({
    networkManagementPage,
    shapedNonAdmin,
    requireBaseline,
    networkIn,
    steps,
  }) => {
    test.setTimeout(20 * 60_000);
    const network = await networkIn('Active');
    let shaped!: ShapedSession;
    let deniedOffered: NetworkAccessAction[] = [];

    await steps.critical('Navigate to the Network Management module - the network list is displayed', async () => {
      const baseline = await networkManagementPage.readActionAccess(network);
      requireBaseline(baseline.export, 'Export');
      deniedOffered = offeredIn(baseline, sevenActionsExcept('export'));
      expect(baseline.viewList).toBe(true);
    });

    await steps.critical('The role shows only Export Networks checked', async () => {
      shaped = await shapedNonAdmin(EXPORT_ONLY.role);
      expect(shaped.granted).toEqual([NETWORK_PERMISSION.exportNetworks]);
    });

    await steps.step('Triggering an export completes and generates a file', async () => {
      await shaped.networks.openList();
      const file = await shaped.networks.exportMenu().exportCsv('all');
      expect(file.rows.length, 'the exported file should carry networks').toBeGreaterThan(0);
    });

    await steps.step('Every other network action is denied', async () => {
      const access = await shaped.networks.readActionAccess(network);
      expect(pick(access, deniedOffered)).toEqual(every(deniedOffered, false));
    });
  });

  test(`TC-${INACTIVATE_ONLY.azureId}: ${INACTIVATE_ONLY.title}`, async ({
    networkManagementPage,
    shapedNonAdmin,
    requireBaseline,
    networkIn,
    steps,
  }) => {
    test.setTimeout(25 * 60_000);
    const network = await networkIn('Active');
    let shaped!: ShapedSession;
    let deniedOffered: NetworkAccessAction[] = [];

    await steps.critical('Navigate to the Network Management module - the network list is displayed', async () => {
      const baseline = await networkManagementPage.readActionAccess(network);
      requireBaseline(baseline.inactivate, 'Inactivate on an Active network');
      deniedOffered = offeredIn(baseline, sevenActionsExcept('inactivate'));
      expect(baseline.viewList).toBe(true);
    });

    await steps.critical('The role shows only Inactivate Network checked', async () => {
      shaped = await shapedNonAdmin(INACTIVATE_ONLY.role);
      expect(shaped.granted).toEqual([NETWORK_PERMISSION.inactivateNetwork]);
    });

    await steps.step('The user inactivates the Active network and it becomes Inactive once approved', async () => {
      await shaped.networks.openList();
      const wording = await shaped.networks.stageStatusChange(network.name, 'inactivate');
      expect(wording.title, 'the inactivation drawer should open for the role').not.toBe('');
      await networkManagementPage.publishStagedChange(network.name);
      expect(await networkManagementPage.readStatus(network.name)).toBe(NETWORK_LIFECYCLE.inactive);
    });

    await steps.step('Every other network action is denied', async () => {
      const access = await shaped.networks.readActionAccess(network);
      expect(pick(access, deniedOffered)).toEqual(every(deniedOffered, false));
    });
  });

  test(`TC-${REVERT_ONLY.azureId}: ${REVERT_ONLY.title}`, async ({
    networkManagementPage,
    networkDetailPage,
    shapedNonAdmin,
    requireBaseline,
    networkIn,
    steps,
  }) => {
    test.setTimeout(25 * 60_000);
    const network = await networkIn('Inactive');
    let shaped!: ShapedSession;
    let deniedOffered: NetworkAccessAction[] = [];

    await steps.critical('Navigate to the Network Management module - the network list is displayed', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.versions().open();
      requireBaseline(await networkDetailPage.versions().offersRevert(REVERT_ONLY.priorVersion), 'Revert on a prior version');
      deniedOffered = offeredIn(await networkManagementPage.readActionAccess(network), sevenActionsExcept('revert'));
      expect(deniedOffered.length).toBeGreaterThan(0);
    });

    await steps.critical('The role shows only Request Version Revert checked', async () => {
      shaped = await shapedNonAdmin(REVERT_ONLY.role);
      expect(shaped.granted).toEqual([NETWORK_PERMISSION.revertNetworkVersion]);
    });

    await steps.step('The user submits a revert request on the prior version and it is accepted', async () => {
      await shaped.networkDetail.open(network.id);
      await shaped.networkDetail.versions().open();
      const outcome = await shaped.networkDetail.versions().revertTo(REVERT_ONLY.priorVersion);
      expect(outcome?.status ?? 0, 'RevertNetworkVersion should accept the revert-only role').toBeGreaterThanOrEqual(200);
      expect(outcome?.status ?? 0).toBeLessThan(300);
    });

    await steps.step('Every other network action is denied', async () => {
      const access = await shaped.networks.readActionAccess(network);
      expect(pick(access, deniedOffered)).toEqual(every(deniedOffered, false));
    });
  });

  test(`TC-${ZERO_PERMISSIONS.azureId}: should deny all seven network actions when the role holds no network permission`, async ({
    networkManagementPage,
    shapedNonAdmin,
    networkIn,
    steps,
  }) => {
    test.setTimeout(20 * 60_000);
    const network = await networkIn('Active');
    let shaped!: ShapedSession;
    let offered: NetworkAccessAction[] = [];

    await steps.critical('Navigate to the Network Management module - the network list is displayed', async () => {
      offered = offeredIn(await networkManagementPage.readActionAccess(network), SEVEN_ACTIONS.map((entry) => entry.action));
      expect(offered.length, 'the administrator should be offered the seven actions').toBeGreaterThan(0);
    });

    await steps.critical('The role shows every network permission unchecked', async () => {
      shaped = await shapedNonAdmin(ZERO_PERMISSIONS.role);
      expect(shaped.granted).toEqual([]);
      expect(shaped.removed.length).toBe(ZERO_PERMISSIONS.role.without.length);
    });

    await steps.step('Details, dashboard, export, inactivate, history, revert and audit are each denied or hidden', async () => {
      const access = await shaped.networks.readActionAccess(network);
      expect(pick(access, offered)).toEqual(every(offered, false));
    });
  });

  test(`TC-${ALL_SEVEN.azureId}: should allow every one of the seven actions when all seven permissions are granted`, async ({
    networkManagementPage,
    shapedNonAdmin,
    requireBaseline,
    networkIn,
    steps,
  }) => {
    test.setTimeout(20 * 60_000);
    const network = await networkIn('Active');
    const seven = SEVEN_ACTIONS.map((entry) => entry.action);
    let shaped!: ShapedSession;

    await steps.critical('Navigate to the Network Management module - the network list is displayed', async () => {
      const baseline = await networkManagementPage.readActionAccess(network);
      requireBaseline(seven.every((action) => baseline[action]), 'all seven network actions');
      expect(baseline.viewList).toBe(true);
    });

    await steps.critical('All seven permissions show as checked on the role', async () => {
      shaped = await shapedNonAdmin(ALL_SEVEN.role);
      expect(shaped.granted).toEqual(ALL_SEVEN.role.with.map((key) => NETWORK_PERMISSION[key]));
    });

    await steps.step('Each of the seven actions is available to the user', async () => {
      const access = await shaped.networks.readActionAccess(network);
      expect(pick(access, seven)).toEqual(every(seven, true));
    });
  });
});
