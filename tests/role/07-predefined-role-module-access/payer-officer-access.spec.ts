import { test, expect } from '../../../fixtures';
import type { TestSteps } from '../../../fixtures/testStatus.fixture';
import type { RoleAdministrationPage } from '../../../pages/role/RoleAdministrationPage';
import { MODULE_SCREEN, type HolderModule } from '../../../constants/role/writerDIds';
import {
  HolderScreens,
  blockWhenMissing,
  isRefused,
  listRecords,
  scopeDataFor,
  scopeGaps,
  told,
  type ModuleAccess,
  type ScopeData,
} from '../../../utils/role/writerDHelpers';
import { PREDEFINED_ROLES } from '../../../data/role/common.data';
import {
  CASES,
  PAYER_OFFICER_ACCESS,
  PAYER_OFFICER_DENIED,
  PAYER_OFFICER_MODULES,
  WELCOME_TEXT,
} from '../../../data/role/predefinedRoleModuleAccess.data';

const PO = PREDEFINED_ROLES.payerOfficer.en;
const PAYER_OWNED: readonly HolderModule[] = ['networks', 'plans', 'policies', 'formularies', 'members'];

/** Azure step 1 of every case: Role Administration as careconnect. */
async function openModule(steps: TestSteps, roleAdmin: RoleAdministrationPage): Promise<void> {
  await steps.critical('Navigate to the Role Management module - the module home page is displayed', async () => {
    const answer = await roleAdmin.open();
    expect(answer.status, 'GetRoles answered').toBe(200);
  });
}

/**
 * User story 21286: Predefined Role Module Access - the Payer Officer (maalmohammad holding exactly Payer Officer
 * + one payer through `roleHolder`). See data/role/predefinedRoleModuleAccess.data.ts.
 */
test.describe('US 21286 - Predefined Role Module Access (Payer Officer)', () => {
  test(`TC-${CASES.payerOfficerWelcome.azureId}: should show only the welcome card and no dashboard content when a Payer Officer signs in`, async ({ steps, roleAdmin, roleHolder, suitePayers }) => {
    await openModule(steps, roleAdmin);

    await steps.critical('Sign in as the Payer Officer scoped to Payer A - the authentication succeeds and the home page loads', async () => {
      const [payer] = await suitePayers.existing(1);
      const signIn = await roleHolder.become({ role: PO, payerIds: [payer.id] });
      expect(signIn.heldAtVerify).toBe(false);
      expect(new URL(signIn.url).pathname).not.toMatch(/\/login/);
      expect((await roleHolder.permissions()).permissions.filter((p) => p.startsWith('Dashboard.')), 'dashboard permissions held').toEqual([]);
    });

    await steps.step('Observe the home page content - a welcome card is displayed and no dashboard widgets or analytics panels appear', async () => {
      const home = await new HolderScreens(roleHolder.page).home();
      expect(home.text, `the home page (${home.path}) read: "${home.text.slice(0, 160)}"`).toMatch(WELCOME_TEXT);
      expect(home.dashboardStatuses.filter((s) => s < 300), `Dashboard API answers while the home page loaded: ${home.dashboardStatuses.join(', ') || 'none'}`).toEqual([]);
    });
  });

  test(`TC-${CASES.payerOfficerModules.azureId}: should give the Payer Officer its six modules for payer A and no Users or Invitations`, async ({ steps, roleAdmin, roleHolder, page }) => {
    let data!: ScopeData;
    await openModule(steps, roleAdmin);

    await steps.critical('Sign in as the Payer Officer scoped to Payer A - the home dashboard loads', async () => {
      data = await scopeDataFor(page, PAYER_OWNED);
      const signIn = await roleHolder.become({ role: PO, payerIds: [data.payer.id] });
      expect(new URL(signIn.url).pathname).not.toMatch(/\/login/);
    });

    await steps.step(`Open ${PAYER_OFFICER_MODULES.map((m) => MODULE_SCREEN[m].label).join(', ')} in turn - each opens with full functionality scoped to Payer A`, async () => {
      const screens = new HolderScreens(roleHolder.page);
      const seen: ModuleAccess[] = [];
      for (const m of PAYER_OFFICER_MODULES) seen.push(await screens.module(m));
      expect(seen.map((s) => ({ module: s.module, shown: s.shown, add: s.add, export: s.export })), seen.filter((s) => !s.shown).map((s) => `${s.module} ended on ${s.path}: "${s.text}"`).join('; ')).toEqual([...PAYER_OFFICER_ACCESS]);
    });

    await steps.step('Attempt to open Users Administration or Invitations from the navigation menu - the module is not listed or access is denied', async () => {
      expect(await new HolderScreens(page).menuOffers(MODULE_SCREEN.users.nav), 'baseline: the System Administrator is offered Users Administration').toBe(true);
      const screens = new HolderScreens(roleHolder.page);
      const seen = [];
      for (const m of PAYER_OFFICER_DENIED) {
        const offered = await screens.menuOffers(MODULE_SCREEN[m].nav);
        const visit = await screens.module(m, false);
        const api = await listRecords(roleHolder.page, m);
        seen.push({ module: m, offered, shown: visit.shown, apiRefused: isRefused(api.status), said: `${m}: ended on ${visit.path}, list API ${told(api)}` });
      }
      expect(seen.map(({ module, offered, shown, apiRefused }) => ({ module, offered, shown, apiRefused })), seen.map((s) => s.said).join(' | ')).toEqual(
        PAYER_OFFICER_DENIED.map((module) => ({ module, offered: false, shown: false, apiRefused: true })),
      );
    });
  });

  test(`TC-${CASES.payerOfficerNoAudit.azureId}: should show no Audit History tab on any record of the Payer Officer's six modules`, async ({ steps, roleAdmin, roleHolder, page }) => {
    let data!: ScopeData;
    const records: Partial<Record<HolderModule, string>> = {};
    await openModule(steps, roleAdmin);

    await steps.critical('Sign in as the Payer Officer scoped to Payer A - the home dashboard loads', async () => {
      data = await scopeDataFor(page, PAYER_OWNED);
      blockWhenMissing(steps, scopeGaps(data, PAYER_OWNED), 'No record of the Payer Officer\'s payer to open');
      Object.assign(records, data.inScope, { facilities: (await listRecords(page, 'facilities', {}, 1)).items[0]?.id ?? '' });
      const signIn = await roleHolder.become({ role: PO, payerIds: [data.payer.id] });
      expect(new URL(signIn.url).pathname).not.toMatch(/\/login/);
    });

    await steps.step(`Open ${PAYER_OFFICER_MODULES.map((m) => MODULE_SCREEN[m].label).join(', ')} in turn, checking each module's tabs - the Audit History tab is absent from every module checked`, async () => {
      const screens = new HolderScreens(roleHolder.page);
      const seen = [];
      for (const m of PAYER_OFFICER_MODULES) {
        const visit = await screens.record(m, records[m] ?? '');
        seen.push({ module: m, opened: visit.opened, auditTab: visit.auditTab, said: `${m} ${records[m]}: ended on ${visit.path} "${visit.text}"` });
      }
      expect(seen.map(({ module, opened, auditTab }) => ({ module, opened, auditTab })), seen.map((s) => s.said).join(' | ')).toEqual(
        PAYER_OFFICER_MODULES.map((module) => ({ module, opened: true, auditTab: false })),
      );
    });
  });
});
