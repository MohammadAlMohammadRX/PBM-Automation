import { test, expect } from '../../../fixtures';
import type { TestSteps } from '../../../fixtures/testStatus.fixture';
import type { RoleAdministrationPage } from '../../../pages/role/RoleAdministrationPage';
import { currentRolesAndPermissions, expectedHeadingCount } from '../../../utils/role/roleApi';
import { HolderScreens, isRefused, listRecords, told, viewRightsOf, type ModuleAccess } from '../../../utils/role/writerDHelpers';
import { payerDropdown } from '../../../utils/UserProvisioning';
import { MODULE_SCREEN, WRITER_D_SCREEN } from '../../../constants/role/writerDIds';
import { ROLE_STATUS } from '../../../data/role/common.data';
import { CASES, DEACTIVATION_REASON, HEADING_ONLY, MODULE, ROLE_LABEL, SYSTEM_ADMIN_MODULES } from '../../../data/role/assignPrivilegesToARole.data';

/** Azure step 1 of every case: Role Administration as careconnect. */
async function openModule(steps: TestSteps, roleAdmin: RoleAdministrationPage): Promise<void> {
  await steps.critical('Navigate to the Role Management module - the Role Management list page loads', async () => {
    const answer = await roleAdmin.open();
    expect(answer.status, 'GetRoles answered').toBe(200);
    expect((await roleAdmin.rowIds()).length, 'role rows listed').toBeGreaterThan(0);
  });
}

const networks = MODULE_SCREEN.networks;
const payers = MODULE_SCREEN.payers;

/**
 * User story 21283: Assign Privileges to a Role - what the privileges give a HOLDER (maalmohammad through
 * `roleHolder`, restored at teardown) and what the System Administrator (careconnect) always has.
 */
test.describe('US 21283 - Assign Privileges to a Role (access)', () => {
  test(`TC-${CASES.headingOnlyNoAccess.azureId}: should give no Networks access when a role holds only the Networks heading and no permission under it`, async ({ steps, roleAdmin, roleHolder, suiteRoles, page }) => {
    const role = { id: '', name: '' };
    await openModule(steps, roleAdmin);

    await steps.critical('Create a role holding only the Networks module heading (no individual permission under it) - View Role shows Networks with 0 selected permissions', async () => {
      const made = await suiteRoles.create({ label: ROLE_LABEL.headingOnly, rights: [HEADING_ONLY.target, HEADING_ONLY.other] });
      role.id = made.id;
      role.name = made.name;
      await roleAdmin.search(role.name);
      const view = await roleAdmin.openView(role.id);
      const total = expectedHeadingCount(await suiteRoles.catalogue(), HEADING_ONLY.target, []).total;
      expect(await view.tree.countOf(HEADING_ONLY.target)).toEqual({ selected: 0, total });
      await view.close();
    });

    await steps.step("Assign this role to a test user and sign in as that user - the user cannot access the module's menus, pages, tabs or actions", async () => {
      expect(await new HolderScreens(page).menuOffers(networks.nav), 'baseline: careconnect is offered Network Management').toBe(true);
      await roleHolder.become({ role: { roleId: role.id } });
      const screens = new HolderScreens(roleHolder.page);
      expect(await screens.menuOffers(networks.nav), 'the holder is offered Network Management').toBe(false);
      const visit = await screens.module('networks', false);
      expect(visit.shown, `the holder opened ${networks.route} (ended on ${visit.path}: "${visit.text}")`).toBe(false);
      const api = await listRecords(roleHolder.page, 'networks');
      expect(isRefused(api.status), `GetNetworks as the holder answered ${told(api)}`).toBe(true);
    });
  });

  test(`TC-${CASES.unionOfRoles.azureId}: should give the union of both roles' access when a user holds a Payers role and a Networks role`, async ({ steps, roleAdmin, roleHolder, suiteRoles }) => {
    const rights = { a: [] as string[], b: [] as string[] };
    await openModule(steps, roleAdmin);

    await steps.critical('Assign both Role A (Payers) and Role B (Networks) to a test user - the user is saved holding both active roles', async () => {
      const catalogue = await suiteRoles.catalogue();
      rights.a = viewRightsOf(catalogue, MODULE.payers);
      rights.b = viewRightsOf(catalogue, MODULE.networks);
      const a = await suiteRoles.create({ label: ROLE_LABEL.roleA, rights: rights.a });
      const b = await suiteRoles.create({ label: ROLE_LABEL.roleB, rights: rights.b });
      await roleHolder.become([{ role: a }, { role: b }]);
      expect((await roleHolder.currentGrants()).map((g) => g.name).sort()).toEqual([a.name, b.name].sort());
      expect([a.record.isActive, b.record.isActive]).toEqual([true, true]);
    });

    await steps.step('Sign in as the test user and browse the application - the user can access both the Payers and Networks menus and pages', async () => {
      const screens = new HolderScreens(roleHolder.page);
      expect(await screens.menuOffers(payers.nav), 'Payer Management offered').toBe(true);
      expect(await screens.menuOffers(networks.nav), 'Network Management offered').toBe(true);
      const payerVisit = await screens.module('payers');
      expect(payerVisit.shown, `the payer list (ended on ${payerVisit.path}: "${payerVisit.text}")`).toBe(true);
      const networkVisit = await screens.module('networks');
      expect(networkVisit.shown, `the network list (ended on ${networkVisit.path}: "${networkVisit.text}")`).toBe(true);
      expect((await roleHolder.permissions()).permissions).toEqual(expect.arrayContaining([...rights.a, ...rights.b]));
    });
  });

  test(`TC-${CASES.deactivatedRoleNoAccess.azureId}: should take the module away from its holder when the holder's only role is deactivated`, async ({ steps, roleAdmin, roleHolder, suiteRoles }) => {
    const role = { id: '', name: '' };
    await steps.critical('Precondition: the test user holds only one active role granting Network Management, and reaches it', async () => {
      const made = await roleHolder.becomeSuiteRole({ label: ROLE_LABEL.deactivated, rights: viewRightsOf(await suiteRoles.catalogue(), MODULE.networks) });
      role.id = made.id;
      role.name = made.name;
      const screens = new HolderScreens(roleHolder.page);
      expect(await screens.menuOffers(networks.nav)).toBe(true);
      expect((await screens.module('networks')).shown, 'the holder reaches the network list').toBe(true);
    });
    await openModule(steps, roleAdmin);

    await steps.critical('Locate the role assigned to the test user and deactivate it - the role status changes to Inactive', async () => {
      await roleAdmin.search(role.name);
      const drawer = await roleAdmin.openDeactivate(role.id);
      await drawer.chooseReason(DEACTIVATION_REASON);
      const out = await drawer.confirm();
      expect(out.status, `SetActive: ${out.apiMessage}`).toBe(200);
      await expect(roleAdmin.statusBadge(role.id)).toHaveText(ROLE_STATUS.inactive);
    });

    await steps.step("Refresh the test user's session - the user no longer has access to the menus / pages the role granted", async () => {
      const screens = new HolderScreens(roleHolder.page);
      await roleHolder.page.reload();
      expect(await screens.menuOffers(networks.nav), 'Network Management still offered').toBe(false);
      const visit = await screens.module('networks', false);
      expect(visit.shown, `the holder opened ${networks.route} (ended on ${visit.path}: "${visit.text}")`).toBe(false);
      const api = await listRecords(roleHolder.page, 'networks');
      expect(isRefused(api.status), `GetNetworks as the holder answered ${told(api)}`).toBe(true);
    });
  });

  test(`TC-${CASES.missingPermissionBlocked.azureId}: should hide and block Network Management when the user's role has no Networks permission`, async ({ steps, roleAdmin, roleHolder, suiteRoles, page }) => {
    const role = { id: '', name: '' };
    await openModule(steps, roleAdmin);

    await steps.critical("Confirm the test user's role shows 0/N for the Networks module - no Networks permissions are selected", async () => {
      const catalogue = await suiteRoles.catalogue();
      const made = await suiteRoles.create({ label: ROLE_LABEL.missing, rights: viewRightsOf(catalogue, MODULE.payers) });
      role.id = made.id;
      role.name = made.name;
      await roleAdmin.search(role.name);
      const view = await roleAdmin.openView(role.id);
      expect(await view.tree.countOf(MODULE.networks)).toEqual({ selected: 0, total: expectedHeadingCount(catalogue, MODULE.networks, []).total });
      await view.close();
    });

    await steps.step('Sign in as the test user and look for the Networks menu - the menu / page is hidden', async () => {
      expect(await new HolderScreens(page).menuOffers(networks.nav), 'baseline: careconnect is offered Network Management').toBe(true);
      await roleHolder.become({ role: { roleId: role.id } });
      expect(await new HolderScreens(roleHolder.page).menuOffers(networks.nav), 'the holder is offered Network Management').toBe(false);
    });

    await steps.step('Attempt to access the Networks page directly through a known link - the system blocks the action', async () => {
      const visit = await new HolderScreens(roleHolder.page).module('networks', false);
      expect(visit.shown, `the holder opened ${networks.route} (ended on ${visit.path}: "${visit.text}")`).toBe(false);
      const api = await listRecords(roleHolder.page, 'networks');
      expect(isRefused(api.status), `GetNetworks as the holder answered ${told(api)}`).toBe(true);
    });
  });

  test(`TC-${CASES.systemAdminAllAccess.azureId}: should give the System Administrator every module, permission and payer whatever the privilege tree says`, async ({ steps, roleAdmin, suiteRoles, page }) => {
    await openModule(steps, roleAdmin);

    await steps.step('Sign in as System Administrator and browse across modules (Payers, Networks, Plans, Approval Management) - every menu, page, tab and action is accessible', async () => {
      const screens = new HolderScreens(page);
      const seen: ModuleAccess[] = [];
      for (const m of SYSTEM_ADMIN_MODULES) seen.push(await screens.module(m));
      expect(seen.map((s) => ({ module: s.module, shown: s.shown, add: s.add, export: s.export }))).toEqual(SYSTEM_ADMIN_MODULES.map((m) => ({ module: m, shown: true, add: true, export: true })));
      const hub = await screens.approvalsHub();
      expect(hub.shown, `Approval Management (ended on ${hub.path}: "${hub.text}")`).toBe(true);
      const catalogue = await suiteRoles.catalogue();
      const mine = new Set((await currentRolesAndPermissions(page)).permissions);
      expect([...catalogue.byKey.keys()].filter((k) => !mine.has(k)), 'catalogue permissions careconnect does not hold').toEqual([]);
    });

    await steps.step('Attempt to view data under any payer - all payers are visible regardless of privilege configuration', async () => {
      const offered = await payerDropdown(page);
      const listed = await listRecords(page, 'payers', {}, 10);
      expect(listed.status).toBe(200);
      expect(listed.totalRows, `GetPayers lists ${listed.totalRows} payers; the payer selector offers ${offered.length}`).toBeGreaterThanOrEqual(offered.length);
      expect(await new HolderScreens(page).menuOffers(WRITER_D_SCREEN.approvals.nav)).toBe(true);
    });
  });
});
