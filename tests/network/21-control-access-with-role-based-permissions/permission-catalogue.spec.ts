import { test, expect } from '../../../fixtures';
import type { ShapedSession } from '../../../fixtures/shapedNonAdmin.fixture';
import { every, pick } from '../../../data/networks/networkPermissions.data';
import {
  CATALOGUE_CHECKLIST,
  EXPLORATORY_MATRIX,
  NETWORK_REVIEWER,
  VIEW_NOT_REVERT,
} from '../../../data/networks/rolePermissions.data';

/**
 * User story 14140: Control access with role-based permissions.
 * The catalogue itself, a reviewer-style role configured end to end, history
 * without revert, and an exploratory pass over control visibility.
 *
 * Roles are the shared "Payer Admin" role shaped for the case and restored
 * afterwards (fixture `shapedNonAdmin`); the sheet's "create a new role and
 * assign it to a user" is done that way because the environment has a single
 * non-administrator account and no disposable user to assign a role to.
 */
test.describe('US 14140 - Permission catalogue and granular roles', () => {
  test(`TC-${NETWORK_REVIEWER.azureId}: should give the user exactly the granted history and audit access when a role is configured with only those permissions`, async ({
    networkManagementPage,
    shapedNonAdmin,
    requireBaseline,
    networkIn,
    steps,
  }) => {
    test.setTimeout(25 * 60_000);
    const network = await networkIn('Inactive');
    let shaped!: ShapedSession;

    await steps.critical('Navigate to the module - the network list is displayed', async () => {
      const baseline = await networkManagementPage.readActionAccess(network);
      requireBaseline(baseline.versionHistory && baseline.auditLog && baseline.revert && baseline.edit, 'Version History, Audit History, Revert and Edit');
      expect(baseline.viewList, 'the administrator should see the network list').toBe(true);
    });

    await steps.critical('The role is configured with exactly View Version History and View Audit History', async () => {
      shaped = await shapedNonAdmin(NETWORK_REVIEWER.role);
      expect(shaped.granted, 'the role should be granted exactly the two history permissions').toEqual(NETWORK_REVIEWER.granted);
    });

    await steps.critical('The signed-in session reflects the reviewer role', async () => {
      await shaped.networks.openList();
      expect(await shaped.networks.getHeaderTexts(), 'the session should reach the Network list').not.toEqual([]);
    });

    await steps.step('Version history is granted and displayed; revert is blocked', async () => {
      const access = await shaped.networks.readActionAccess(network);
      expect(pick(access, ['versionHistory', 'revert'])).toEqual({ versionHistory: true, revert: false });
    });

    await steps.step('The Audit History tab is granted and shows events; edit is blocked', async () => {
      const access = await shaped.networks.readActionAccess(network);
      expect(pick(access, ['auditLog', 'edit'])).toEqual({ auditLog: true, edit: false });
    });
  });

  test(`TC-${EXPLORATORY_MATRIX.azureId}: should expose exactly the granted controls on every path when roles hold different permission subsets`, async ({
    networkManagementPage,
    shapedNonAdmin,
    networkWithPolicies,
    networkDetailPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(30 * 60_000);
    const network = await networkIn('Active');

    await steps.critical('Navigate to the module - every control is on offer to a session holding all rights', async () => {
      const baseline = await networkManagementPage.readActionAccess(network);
      expect(pick(baseline, ['edit', 'assignFacilities']), 'the administrator baseline').toEqual(every(['edit', 'assignFacilities'], true));
    });

    for (const role of EXPLORATORY_MATRIX.roles) {
      await steps.step(`The ${role.label} role is offered its granted controls and none of the withheld ones`, async () => {
        const shaped = await shapedNonAdmin(role.role);
        const access = await shaped.networks.readActionAccess(network);
        expect(pick(access, role.granted), `${role.label}: granted controls`).toEqual(every(role.granted, true));
        expect(pick(access, role.withheld), `${role.label}: withheld controls`).toEqual(every(role.withheld, false));
      });
    }

    await steps.step('No policy link or unlink control exists anywhere on a network\'s Linked Policies tab', async () => {
      const withPolicies = await networkWithPolicies();
      await networkDetailPage.open(withPolicies.id);
      await networkDetailPage.policies().open();
      expect(await networkDetailPage.policies().offersRowActions(), 'linked policies must be read-only in Network Management').toBe(false);
    });
  });

  test(`TC-${CATALOGUE_CHECKLIST.azureId}: should list each required network permission separately and no policy link permission when the catalogue is reviewed`, async ({
    networkManagementPage,
    roleAdministrationPage,
    steps,
  }) => {
    let networkGroup: string[] = [];

    await steps.critical('Navigate to the Network Management module - the network list is displayed', async () => {
      await networkManagementPage.openList();
    });

    await steps.critical('The role permission catalogue shows the network permissions', async () => {
      const catalogue = await roleAdministrationPage.openFirstRolePermissionCatalogue();
      networkGroup = await catalogue.getGroupPermissions(CATALOGUE_CHECKLIST.group);
      expect(networkGroup.length, 'the Networks group should list its permissions').toBeGreaterThan(0);
    });

    for (const entry of CATALOGUE_CHECKLIST.required) {
      await steps.step(`A distinct "${entry.requirement}" permission is present`, async () => {
        expect(networkGroup, `"${entry.requirement}" should be its own catalogue entry`).toContain(entry.label);
      });
    }

    await steps.step('No Link Policy or Unlink Policy permission remains under Network Management', async () => {
      expect(networkGroup.filter((label) => CATALOGUE_CHECKLIST.obsolete.test(label))).toEqual([]);
      await roleAdministrationPage.closeDrawerDiscarding();
    });
  });

  test(`TC-${VIEW_NOT_REVERT.azureId}: should show version history read-only but refuse revert when View Version History is held without Revert`, async ({
    networkDetailPage,
    shapedNonAdmin,
    requireBaseline,
    networkIn,
    steps,
  }) => {
    test.setTimeout(20 * 60_000);
    const network = await networkIn('Inactive');
    let shaped!: ShapedSession;

    await steps.critical('Navigate to the module - the network list is displayed', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.versions().open();
      requireBaseline(await networkDetailPage.versions().offersRevert(VIEW_NOT_REVERT.previousVersion), 'Revert on an earlier version');
      shaped = await shapedNonAdmin(VIEW_NOT_REVERT.role);
      await shaped.networks.openList();
    });

    await steps.critical('The network\'s Version History lists its historical versions', async () => {
      await shaped.networkDetail.open(network.id);
      await shaped.networkDetail.versions().open();
      expect((await shaped.networkDetail.versions().readRows()).length).toBeGreaterThanOrEqual(VIEW_NOT_REVERT.minimumVersions);
    });

    await steps.step('A previous version\'s details are displayed read-only', async () => {
      const details = await shaped.networkDetail.versions().viewVersion(VIEW_NOT_REVERT.previousVersion);
      expect(details.nameEn, 'the earlier version should show the network it belongs to').toBe(network.name);
      await shaped.networkDetail.versions().closeVersion();
    });

    await steps.step('Revert is unavailable on that previous version', async () => {
      expect(await shaped.networkDetail.versions().offersRevert(VIEW_NOT_REVERT.previousVersion)).toBe(false);
    });
  });
});
