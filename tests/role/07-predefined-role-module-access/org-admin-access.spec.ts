import { test, expect } from '../../../fixtures';
import type { TestSteps } from '../../../fixtures/testStatus.fixture';
import type { RoleAdministrationPage } from '../../../pages/role/RoleAdministrationPage';
import { PayerFormDialog } from '../../../pages/payer/PayerFormDialog';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import { Timeouts } from '../../../constants/Timeouts';
import { MODULE_SCREEN, WRITER_D_SCREEN } from '../../../constants/role/writerDIds';
import { HolderScreens, asSession, isRefused, listRecords, told, type ModuleAccess } from '../../../utils/role/writerDHelpers';
import { PREDEFINED_ROLES } from '../../../data/role/common.data';
import { CASES, ORG_ADMIN_ACCESS, ORG_ADMIN_MODULES, RESET_PROBE_POLICY_ID, RESET_PROBE_REASON } from '../../../data/role/predefinedRoleModuleAccess.data';

const OA = PREDEFINED_ROLES.organizationAdministrator.en;

/** Azure step 1 of every case: Role Administration as careconnect. */
async function openModule(steps: TestSteps, roleAdmin: RoleAdministrationPage): Promise<void> {
  await steps.critical('Navigate to the Role Management module - the module home page is displayed', async () => {
    const answer = await roleAdmin.open();
    expect(answer.status, 'GetRoles answered').toBe(200);
  });
}

/**
 * User story 21286: Predefined Role Module Access - the Organization Administrator (maalmohammad holding exactly
 * Organization Administrator through `roleHolder`). See data/role/predefinedRoleModuleAccess.data.ts.
 */
test.describe('US 21286 - Predefined Role Module Access (Organization Administrator)', () => {
  test(`TC-${CASES.orgAdminEveryPayer.azureId}: should list and open for edit every payer's records when the user holds Organization Administrator`, async ({ steps, roleAdmin, roleHolder, suitePayers, page }) => {
    const target = { id: '' };
    await openModule(steps, roleAdmin);

    await steps.critical('Sign in as a user holding the Organization Administrator role - the application loads the home dashboard for the role', async () => {
      target.id = (await suitePayers.existing(1))[0].id;
      const signIn = await roleHolder.become({ role: OA });
      expect(new URL(signIn.url).pathname).not.toMatch(/\/login/);
      expect((await roleHolder.permissions()).roles).toEqual([OA]);
    });

    await steps.step('Open the Payer Administration module and view the payer list - the list shows records for all payers, with no payer filter applied', async () => {
      const visit = await new HolderScreens(roleHolder.page).module('payers');
      expect(visit.shown, `the payer list (ended on ${visit.path}: "${visit.text}")`).toBe(true);
      const mine = await listRecords(roleHolder.page, 'payers', {}, 10);
      const all = await listRecords(page, 'payers', {}, 10);
      expect(mine.status, told(mine)).toBe(200);
      expect(mine.totalRows, `the holder lists ${mine.totalRows} payers, the System Administrator ${all.totalRows}`).toBe(all.totalRows);
    });

    await steps.step("Select a payer record of a payer other than the administrator's own organization and open it for edit - the record opens and its fields are editable", async () => {
      const screens = new HolderScreens(roleHolder.page);
      const visit = await screens.record('payers', target.id);
      expect(visit.opened, `the payer detail (ended on ${visit.path}: "${visit.text}")`).toBe(true);
      expect(await screens.shows(WRITER_D_SCREEN.payerEdit), 'Edit offered on the payer').toBe(true);
      await screens.click(WRITER_D_SCREEN.payerEdit);
      // One more click when the first opens nothing: in the full run of 2026-11-15 the holder's click landed while
      // the detail page was still settling and no drawer came (the same click opens "Edit Payer" at once later).
      const formTitle = roleHolder.page.locator('#payer-form-drawer-title');
      const opened = await formTitle.waitFor({ state: 'visible', timeout: Timeouts.short }).then(() => true, () => false);
      if (!opened) await screens.click(WRITER_D_SCREEN.payerEdit);
      const dialog = new PayerFormDialog(roleHolder.page);
      await dialog.waitForOpen();
      await dialog.waitForPopulated();
      const editable = await dialog.isFieldEditable('Payer Name');
      await dialog.closeAndDiscard();
      expect(editable, 'the Payer Name field is editable').toBe(true);
    });
  });

  test(`TC-${CASES.orgAdminAllModules.azureId}: should open every business module but not the Integration Portal when the user holds Organization Administrator`, async ({ steps, roleAdmin, roleHolder, page }) => {
    await openModule(steps, roleAdmin);

    await steps.critical('Sign in as the Organization Administrator - the home dashboard loads with the full navigation menu', async () => {
      await roleHolder.become({ role: OA });
      const screens = new HolderScreens(roleHolder.page);
      expect(await screens.menuOffers(MODULE_SCREEN.payers.nav), 'Payer Management in the menu').toBe(true);
      expect(await screens.menuOffers(MODULE_SCREEN.networks.nav), 'Network Management in the menu').toBe(true);
    });

    await steps.step(`Open each business module (${ORG_ADMIN_MODULES.map((m) => MODULE_SCREEN[m].label).join(', ')}) in turn - each opens with full functionality available`, async () => {
      const screens = new HolderScreens(roleHolder.page);
      const seen: ModuleAccess[] = [];
      for (const m of ORG_ADMIN_MODULES) seen.push(await screens.module(m));
      expect(seen.map((s) => ({ module: s.module, shown: s.shown, add: s.add, export: s.export })), seen.filter((s) => !s.shown).map((s) => `${s.module} ended on ${s.path}: "${s.text}"`).join('; ')).toEqual([...ORG_ADMIN_ACCESS]);
    });

    await steps.step('Locate the Integration Portal entry in the navigation menu - it is not present and stays inaccessible', async () => {
      const portal = WRITER_D_SCREEN.enginePortal;
      expect(await new HolderScreens(page).menuOffers(portal.nav), 'baseline: the System Administrator is offered the Integration Portal').toBe(true);
      const screens = new HolderScreens(roleHolder.page);
      expect(await screens.menuOffers(portal.nav), 'the Organization Administrator is offered the Integration Portal').toBe(false);
      const visit = await screens.visit(portal.route, portal.root, false);
      expect(visit.path.startsWith(portal.route), `the holder stayed on ${visit.path} ("${visit.text}")`).toBe(false);
    });
  });

  test(`TC-${CASES.benefitResetsRefused.azureId}: should show Policy Benefit Resets in the menu but refuse the page and a manual reset to the Organization Administrator`, async ({ steps, roleAdmin, roleHolder }) => {
    const resets = WRITER_D_SCREEN.benefitResets;
    await openModule(steps, roleAdmin);

    await steps.critical('Sign in as the Organization Administrator - the home dashboard loads', async () => {
      const signIn = await roleHolder.become({ role: OA });
      expect(new URL(signIn.url).pathname).not.toMatch(/\/login/);
    });

    await steps.step('Locate Policy Benefit Resets in the navigation menu - the menu item is visible', async () => {
      expect(await new HolderScreens(roleHolder.page).menuOffers(resets.nav)).toBe(true);
    });

    await steps.step('Select Policy Benefit Resets from the menu - access to the page is refused (an authorization message is shown or the page fails to load)', async () => {
      const visit = await new HolderScreens(roleHolder.page).visit(resets.route, resets.root, false);
      expect(visit.shown, `the Policy Benefit Resets page rendered for the holder (on ${visit.path})`).toBe(false);
    });

    await steps.step('If a manual reset action can be triggered directly, attempt to trigger a manual benefit reset - the manual reset action is refused', async () => {
      const answer = await asSession(roleHolder.page, 'POST', ApiEndpoints.policyResetBenefits, {
        policyId: RESET_PROBE_POLICY_ID,
        reason: RESET_PROBE_REASON,
        attachmentUri: null,
        attachmentFileName: null,
        attachmentContentType: null,
        attachmentSizeBytes: null,
        deductibleAmount: null,
        coinsurancePercent: null,
        outOfPocketMaximum: null,
        sublimitAmount: null,
      });
      expect(isRefused(answer.status), `ResetPolicyBenefits (non-existent policy) as the holder answered ${told(answer)}`).toBe(true);
    });
  });
});
