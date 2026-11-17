import { test, expect } from '../../../fixtures';
import type { TestSteps } from '../../../fixtures/testStatus.fixture';
import type { RoleAdministrationPage } from '../../../pages/role/RoleAdministrationPage';
import { MODULE_SCREEN } from '../../../constants/role/writerDIds';
import {
  HolderScreens,
  blockWhenMissing,
  deniedOrEmpty,
  getRecord,
  listRecords,
  probeOutOfScope,
  recordsOutsideScope,
  scopeDataFor,
  scopeGaps,
  scopeLeaks,
  told,
  type ModuleAccess,
  type OutOfScopeProbe,
  type ScopeData,
} from '../../../utils/role/writerDHelpers';
import { PREDEFINED_ROLES } from '../../../data/role/common.data';
import { BYPASS_MODULES, CASES, PAYER_ADMIN_ACCESS, PAYER_ADMIN_MODULES, PAYER_SCOPED_LISTS } from '../../../data/role/predefinedRoleModuleAccess.data';

const PA = PREDEFINED_ROLES.payerAdministrator.en;
const PO = PREDEFINED_ROLES.payerOfficer.en;

/** Azure step 1 of every case: Role Administration as careconnect. */
async function openModule(steps: TestSteps, roleAdmin: RoleAdministrationPage): Promise<void> {
  await steps.critical('Navigate to the Role Management module - the module home page is displayed', async () => {
    const answer = await roleAdmin.open();
    expect(answer.status, 'GetRoles answered').toBe(200);
  });
}

/**
 * User story 21286: Predefined Role Module Access - payer scope of Payer Administrator / Payer Officer (maalmohammad
 * through `roleHolder`). See data/role/predefinedRoleModuleAccess.data.ts for how "Payer A / B / C" are chosen.
 */
test.describe('US 21286 - Predefined Role Module Access (payer scope)', () => {
  test(`TC-${CASES.payerAdminScoped.azureId}: should list only the users of payers A and B and refuse a payer C user when the Payer Administrator is scoped to A and B`, async ({ steps, roleAdmin, roleHolder, suitePayers, suiteUsers, page }) => {
    const ids = { a: '', b: '', userA: '', emailA: '', userC: '', emailC: '' };
    await openModule(steps, roleAdmin);

    await steps.critical('Sign in as the Payer Administrator user scoped to Payer A and Payer B - the home dashboard loads', async () => {
      const [a, b, c] = await suitePayers.existing(3);
      ids.a = a.id;
      ids.b = b.id;
      const userA = await suiteUsers.create({ role: PO, payerIds: [a.id] });
      const userC = await suiteUsers.create({ role: PO, payerIds: [c.id] });
      Object.assign(ids, { userA: userA.id, emailA: userA.email, userC: userC.id, emailC: userC.email });
      const signIn = await roleHolder.become({ role: PA, payerIds: [a.id, b.id] });
      expect(new URL(signIn.url).pathname).not.toMatch(/\/login/);
    });

    await steps.step('Open Users Administration and view the payer filter / list - only Payer A and Payer B records are listed', async () => {
      const visit = await new HolderScreens(roleHolder.page).module('users');
      expect(visit.shown, `Users Administration (ended on ${visit.path}: "${visit.text}")`).toBe(true);
      const listed = await listRecords(roleHolder.page, 'users', {}, 25);
      expect(listed.status, told(listed)).toBe(200);
      expect(await recordsOutsideScope(page, 'users', listed.items, { ids: [ids.a, ids.b], names: [] }), 'users listed outside payers A and B').toEqual([]);
      expect((await listRecords(roleHolder.page, 'users', { searchText: ids.emailA })).items.map((u) => u.id), 'the Payer A suite user is listed').toContain(ids.userA);
      expect((await listRecords(roleHolder.page, 'users', { searchText: ids.emailC })).items.map((u) => u.id), 'the Payer C suite user is listed').not.toContain(ids.userC);
    });

    await steps.step('Attempt to open a record belonging to Payer C (not assigned) by direct navigation - the system blocks access or the record is not shown', async () => {
      const probe = await probeOutOfScope(page, roleHolder.page, 'users', ids.userC);
      expect({ adminOpened: probe.adminOpened, holderOpened: probe.holderOpened, holderDenied: probe.holderDenied }, probe.told).toEqual({ adminOpened: true, holderOpened: false, holderDenied: true });
    });
  });

  test(`TC-${CASES.payerOfficerScoped.azureId}: should list only payer A's networks and refuse payer B's when the Payer Officer is scoped to A`, async ({ steps, roleAdmin, roleHolder, page }) => {
    let data!: ScopeData;
    await openModule(steps, roleAdmin);

    await steps.critical('Sign in as the Payer Officer user scoped to Payer A - the home dashboard loads', async () => {
      data = await scopeDataFor(page, ['networks']);
      blockWhenMissing(steps, scopeGaps(data, ['networks'], ['networks']), 'No network to tell the payer scopes apart');
      const signIn = await roleHolder.become({ role: PO, payerIds: [data.payer.id] });
      expect(new URL(signIn.url).pathname).not.toMatch(/\/login/);
    });

    await steps.step(`Open Network Management and view the payer-scoped records - only Payer A records are listed`, async () => {
      const visit = await new HolderScreens(roleHolder.page).module('networks');
      expect(visit.shown, `Network Management (ended on ${visit.path}: "${visit.text}")`).toBe(true);
      const leaks = await scopeLeaks(page, roleHolder.page, ['networks'], { ids: [data.payer.id], names: [data.payer.name] });
      expect(leaks, `networks of other payers listed to the Payer Officer of ${data.payer.name}`).toEqual({});
      const own = await getRecord(roleHolder.page, 'networks', data.inScope.networks as string);
      expect(deniedOrEmpty(own), `GetNetwork of the Payer A network answered ${told(own)}`).toBe(false);
    });

    await steps.step('Attempt to open a record belonging to Payer B (not assigned) by direct navigation - the system blocks access or the record is not shown', async () => {
      const other = data.outOfScope.networks as { id: string; payerName: string };
      const probe = await probeOutOfScope(page, roleHolder.page, 'networks', other.id, other.payerName);
      expect({ adminOpened: probe.adminOpened, holderOpened: probe.holderOpened, holderDenied: probe.holderDenied }, `${probe.told} (payer ${other.payerName})`).toEqual({ adminOpened: true, holderOpened: false, holderDenied: true });
    });
  });

  test(`TC-${CASES.payerAdminModules.azureId}: should open every Payer Administrator module with full functionality and only payer A's data when scoped to A`, async ({ steps, roleAdmin, roleHolder, page }) => {
    let data!: ScopeData;
    await openModule(steps, roleAdmin);

    await steps.critical('Sign in as the Payer Administrator scoped to Payer A - the home dashboard loads', async () => {
      data = await scopeDataFor(page, ['networks', 'plans', 'policies', 'formularies', 'members']);
      const signIn = await roleHolder.become({ role: PA, payerIds: [data.payer.id] });
      expect(new URL(signIn.url).pathname).not.toMatch(/\/login/);
    });

    await steps.step(`Open ${PAYER_ADMIN_MODULES.map((m) => MODULE_SCREEN[m].label).join(', ')} in turn - each opens with full functionality (add, edit, view) scoped to Payer A`, async () => {
      const screens = new HolderScreens(roleHolder.page);
      const seen: ModuleAccess[] = [];
      for (const m of PAYER_ADMIN_MODULES) seen.push(await screens.module(m));
      expect(seen.map((s) => ({ module: s.module, shown: s.shown, add: s.add, export: s.export })), seen.filter((s) => !s.shown).map((s) => `${s.module} ended on ${s.path}: "${s.text}"`).join('; ')).toEqual([...PAYER_ADMIN_ACCESS]);
    });

    await steps.step('Confirm no data from other payers appears in any of the above modules - only Payer A records are visible throughout', async () => {
      const leaks = await scopeLeaks(page, roleHolder.page, PAYER_SCOPED_LISTS, { ids: [data.payer.id], names: [data.payer.name] });
      expect(leaks, `records of other payers listed to the Payer Administrator of ${data.payer.name}`).toEqual({});
    });
  });

  test(`TC-${CASES.noScopeBypass.azureId}: should deny payer B's records by URL and request in Users, Networks and Members when the Payer Administrator is scoped to A`, async ({ steps, roleAdmin, roleHolder, suitePayers, suiteUsers, page }) => {
    let data!: ScopeData;
    const userB = { id: '' };
    await openModule(steps, roleAdmin);

    await steps.critical('Sign in as the Payer Administrator scoped to Payer A - the home dashboard loads', async () => {
      data = await scopeDataFor(page, ['networks', 'members']);
      blockWhenMissing(steps, scopeGaps(data, [], ['networks', 'members']), `No out-of-scope record for the Payer Administrator of ${data.payer.name}`);
      const otherPayer = (await suitePayers.existing(2)).filter((p) => p.id !== data.payer.id)[0];
      userB.id = (await suiteUsers.create({ role: PO, payerIds: [otherPayer.id] })).id;
      const signIn = await roleHolder.become({ role: PA, payerIds: [data.payer.id] });
      expect(new URL(signIn.url).pathname).not.toMatch(/\/login/);
    });

    await steps.step('Modify the URL or request to reference a Payer B record directly (a network id) - the system denies access or returns no data', async () => {
      const other = data.outOfScope.networks as { id: string; payerName: string };
      const probe = await probeOutOfScope(page, roleHolder.page, 'networks', other.id, other.payerName);
      expect({ adminOpened: probe.adminOpened, holderOpened: probe.holderOpened, holderDenied: probe.holderDenied }, probe.told).toEqual({ adminOpened: true, holderOpened: false, holderDenied: true });
    });

    await steps.step(`Attempt the same probing against ${BYPASS_MODULES.map((m) => MODULE_SCREEN[m].label).join(', ')} - access is consistently denied across all tested modules`, async () => {
      const networkB = data.outOfScope.networks as { id: string; payerName: string };
      const memberB = data.outOfScope.members as { id: string; payerName: string };
      const targets: Record<string, { id: string; owner: string }> = {
        users: { id: userB.id, owner: '' },
        networks: { id: networkB.id, owner: networkB.payerName },
        members: { id: memberB.id, owner: memberB.payerName },
      };
      const probes: OutOfScopeProbe[] = [];
      for (const m of BYPASS_MODULES) probes.push(await probeOutOfScope(page, roleHolder.page, m, targets[m].id, targets[m].owner));
      expect(probes.map((p) => ({ module: p.module, adminOpened: p.adminOpened, holderOpened: p.holderOpened, holderDenied: p.holderDenied })), probes.map((p) => p.told).join(' | ')).toEqual(
        BYPASS_MODULES.map((module) => ({ module, adminOpened: true, holderOpened: false, holderDenied: true })),
      );
    });
  });
});
