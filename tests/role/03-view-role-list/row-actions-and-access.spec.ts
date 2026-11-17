import { test, expect } from '../../../fixtures';
import { AppRoutes } from '../../../constants/AppRoutes';
import { ROLE_ROUTE } from '../../../constants/role/roleIds';
import { ROLE_STATUS, ROLE_TOGGLE_LABEL } from '../../../data/role/common.data';
import {
  ALL_ROW_ACTIONS,
  CASES,
  DEACTIVATION,
  NO_ROLES_RIGHTS,
  PREDEFINED_ALL,
  VIEW_ONLY_ACTIONS,
  VIEW_ONLY_RIGHTS,
  VIEW_ROLES_RIGHTS,
} from '../../../data/role/viewRoleList.data';
import {
  describeAccess,
  describeMenu,
  describeRow,
  openRolesFromMenu,
  predefinedCardControls,
  predefinedRowControls,
  putTableViewBack,
  readRowFull,
  roleScreenAccess,
} from '../../../utils/role/writerAHelpers';

/**
 * User story 21282: View Role List - which row actions each user is offered (careconnect with every Roles
 * right vs the role holder with view rights only), predefined rows offering View only, access to the screen
 * with and without the view-roles right (the holder = maalmohammad, restored by the fixture), and the
 * Activate / Inactivate round trip of an inactive suite role. See the data file.
 */
test.describe('US 21282 - View Role List (actions and access)', () => {
  test.afterEach(async ({ roleAdmin }) => {
    await putTableViewBack(roleAdmin);
  });

  test(`TC-${CASES.actionsByPermission.azureId}: should show View, Edit, Activate/Inactivate and Delete to a fully permitted user and only View to a view-only user`, async ({ steps, suiteRoles, roleHolder, roleAdmin }) => {
    const target = { id: '', name: '' };

    await steps.critical('Navigate to the Role Management module - the module loads (a non-predefined suite role is listed)', async () => {
      const made = await suiteRoles.create({ label: 'actions target' });
      target.id = made.id;
      target.name = made.name;
      await roleAdmin.open();
      const found = await roleAdmin.search(target.name);
      expect(found.items.map((i) => i.id)).toEqual([target.id]);
    });

    await steps.step('Log in as the fully-permissioned user (careconnect) and review a non-predefined role - View, Edit, Activate/Inactivate and Delete actions are all shown', async () => {
      const row = await readRowFull(roleAdmin, target.id);
      expect({ shown: row.actions, enabled: row.enabledActions }, describeRow(row)).toEqual({ shown: [...ALL_ROW_ACTIONS], enabled: [...ALL_ROW_ACTIONS] });
    });

    await steps.critical(`Precondition: the view-only user (the role holder with ONLY a suite role holding ${VIEW_ONLY_RIGHTS.join(' + ')}) signs in`, async () => {
      const viewer = await roleHolder.becomeSuiteRole({ label: 'view only', rights: VIEW_ONLY_RIGHTS });
      const me = await roleHolder.permissions();
      expect({ roles: me.roles, rights: me.permissions.filter((p) => p.startsWith('Roles.')).sort() }).toEqual({ roles: [viewer.name], rights: [...VIEW_ONLY_RIGHTS].sort() });
    });

    await steps.step('Log in as the view-only user and review the same role - only the View action is shown; Edit, Activate/Inactivate and Delete are not displayed', async () => {
      await roleHolder.roles.open();
      await roleHolder.roles.search(target.name);
      const row = await readRowFull(roleHolder.roles, target.id);
      expect(row.actions, describeRow(row)).toEqual([...VIEW_ONLY_ACTIONS]);
    });
  });

  test(`TC-${CASES.predefinedViewOnly.azureId}: should offer only View on a predefined role, with Edit, Delete and Activate/Inactivate hidden`, async ({ steps, roleAdmin, page }) => {
    await steps.critical('Navigate to the Role Management module - the module loads (as careconnect, every Roles right)', async () => {
      const answer = await roleAdmin.open();
      expect(answer.status, `GetRoles answered ${answer.status}`).toBe(200);
    });

    await steps.step('Review a predefined role\'s available actions as the fully-permissioned user - only the View action is shown', async () => {
      const controls = await predefinedRowControls(roleAdmin, PREDEFINED_ALL);
      const want = Object.fromEntries(PREDEFINED_ALL.map((r) => [r.en, [...VIEW_ONLY_ACTIONS]]));
      expect(controls, `row controls: ${Object.entries(controls).map(([n, c]) => `${n} [${c.join(', ')}]`).join('; ')}`).toEqual(want);
    });

    await steps.step('Check for the Edit, Delete and Activate/Inactivate controls (rows and cards) - these controls are disabled and hidden, not merely greyed out', async () => {
      const rows = await predefinedRowControls(roleAdmin, PREDEFINED_ALL);
      const cards = await predefinedCardControls(roleAdmin, page, PREDEFINED_ALL);
      const extra = (controls: Record<string, string[]>) => Object.fromEntries(Object.entries(controls).map(([n, c]) => [n, c.filter((x) => !x.startsWith('view'))]));
      const none = Object.fromEntries(PREDEFINED_ALL.map((r) => [r.en, [] as string[]]));
      expect({ rows: extra(rows), cards: extra(cards) }, `rows: ${Object.entries(rows).map(([n, c]) => `${n} [${c.join(', ')}]`).join('; ')}; cards: ${Object.entries(cards).map(([n, c]) => `${n} [${c.join(', ')}]`).join('; ')}`)
        .toEqual({ rows: none, cards: none });
    });
  });

  test(`TC-${CASES.viewRightOpensScreen.azureId}: should let a non-administrator holding only the view-roles right open the Role Administration screen`, async ({ steps, roleHolder }) => {
    await steps.critical(`Navigate to the Role Management module - the non-administrator (the role holder with ONLY a suite role holding ${VIEW_ROLES_RIGHTS.join(' + ')}) is signed in`, async () => {
      const viewer = await roleHolder.becomeSuiteRole({ label: 'viewer', rights: VIEW_ROLES_RIGHTS });
      const me = await roleHolder.permissions();
      expect({ roles: me.roles, rights: me.permissions.filter((p) => p.startsWith('Roles.')).sort() }).toEqual({ roles: [viewer.name], rights: [...VIEW_ROLES_RIGHTS].sort() });
    });

    await steps.step('Log in as the non-administrator user holding the view-roles permission and open the Role Administration screen - the screen opens and displays the roles list', async () => {
      const opened = await openRolesFromMenu(roleHolder.roles, roleHolder.page);
      expect({ menu: opened.menu.linkShown, route: new URL(opened.url).pathname, status: opened.answer?.status ?? -1, rows: (await roleHolder.roles.rowIds()).length > 0 }, `${describeMenu(opened.menu)}; landed on ${opened.url}`)
        .toEqual({ menu: true, route: ROLE_ROUTE, status: 200, rows: true });
    });
  });

  test(`TC-${CASES.noViewRightNoScreen.azureId}: should keep a user without the view-roles right out of the Role Administration screen`, async ({ steps, roleHolder, roleAdmin, page }) => {
    await steps.critical('Navigate to the Role Management module - baseline: careconnect (holding the view-roles right) reaches Role Administration from the side menu', async () => {
      await roleAdmin.goto(AppRoutes.dashboard);
      const opened = await openRolesFromMenu(roleAdmin, page);
      expect({ menu: opened.menu.linkShown, status: opened.answer?.status ?? -1 }, describeMenu(opened.menu)).toEqual({ menu: true, status: 200 });
    });

    await steps.critical(`Precondition: the unpermitted user (the role holder with ONLY a suite role holding ${NO_ROLES_RIGHTS.join(' + ')}, no Roles right) signs in`, async () => {
      const plain = await roleHolder.becomeSuiteRole({ label: 'no roles right', rights: NO_ROLES_RIGHTS });
      const me = await roleHolder.permissions();
      expect({ roles: me.roles, rolesRights: me.permissions.filter((p) => p.startsWith('Roles.')) }).toEqual({ roles: [plain.name], rolesRights: [] });
    });

    await steps.step('Attempt to open the Role Administration screen as the unpermitted user - access is denied or the menu option is not shown', async () => {
      const access = await roleScreenAccess(roleHolder.roles, roleHolder.page);
      expect({ menuOption: access.menu.linkShown, screenReached: access.listShown, apiRefused: access.apiStatus >= 400 }, describeAccess(access))
        .toEqual({ menuOption: false, screenReached: false, apiRefused: true });
    });
  });

  test(`TC-${CASES.reactivateInactive.azureId}: should activate an inactive custom role and inactivate it again`, async ({ steps, suiteRoles, roleAdmin }) => {
    const role = { id: '', name: '' };

    await steps.critical('Navigate to the Role Management module - the module loads (an Inactive suite role is listed with Activate)', async () => {
      const made = await suiteRoles.create({ label: 'reactivate', isActive: false });
      role.id = made.id;
      role.name = made.name;
      await roleAdmin.open();
      await roleAdmin.search(role.name);
      await expect(roleAdmin.statusBadge(role.id)).toHaveText(ROLE_STATUS.inactive);
      await expect(roleAdmin.action(role.id, 'toggle-active')).toHaveText(ROLE_TOGGLE_LABEL.activate);
    });

    await steps.step('Locate the inactive role and select the Activate action (confirmed) - the role\'s status changes to Active', async () => {
      const outcome = await (await roleAdmin.openActivate(role.id)).confirmActivate();
      await expect(roleAdmin.statusBadge(role.id), `SetActive answered ${outcome.status} "${outcome.apiMessage}", toast "${outcome.toast}"`).toHaveText(ROLE_STATUS.active);
      expect({ status: outcome.status, stored: (await suiteRoles.read(role.id))?.isActive }).toEqual({ status: 200, stored: true });
    });

    await steps.step(`Select the Inactivate action on the same role (reason "${DEACTIVATION.reason}") - the role's status changes back to Inactive`, async () => {
      const outcome = await (await roleAdmin.openDeactivate(role.id)).deactivate(DEACTIVATION.reason, DEACTIVATION.details);
      await expect(roleAdmin.statusBadge(role.id), `SetActive answered ${outcome.status} "${outcome.apiMessage}", toast "${outcome.toast}"`).toHaveText(ROLE_STATUS.inactive);
      expect({ status: outcome.status, stored: (await suiteRoles.read(role.id))?.isActive }).toEqual({ status: 200, stored: false });
    });
  });
});
