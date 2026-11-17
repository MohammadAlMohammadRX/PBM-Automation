import { test, expect } from '../../../fixtures';
import type { RoleAdministrationPage } from '../../../pages/role/RoleAdministrationPage';
import type { RoleViewDrawer } from '../../../pages/role/RoleViewDrawer';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import { MODULE_SCREEN, WRITER_D_SCREEN } from '../../../constants/role/writerDIds';
import { updateSuiteUser } from '../../../utils/UserProvisioning';
import {
  HolderScreens,
  asSession,
  auditKeyOf,
  auditLogsOf,
  auditRowUnder,
  blockWhenMissing,
  directEntries,
  holderRights,
  isRefused,
  listRecords,
  need,
  norm,
  openEditPrivileges,
  formularyWithHistory,
  replayAudit,
  reversedAuthorizationId,
  told,
  type AuditCall,
} from '../../../utils/role/writerDHelpers';
import {
  CASES,
  EDITED_SECOND_NAME,
  ENGINE_AUDIT_ENTITY,
  ENGINE_GET_AUTHORIZATION,
  ENGINE_MODULE,
  GLOBAL_AUDIT_RIGHTS,
  MIXED,
  MODULE_KEY,
  OTHER_AUDIT_MODULES,
  ROLE_LABEL,
  SYSTEM_SETTINGS_MODULE,
  SYSTEM_SETTING_ENTITY,
  SYSTEM_SETTING_ROW,
  VIEW_AUDIT_LOGS,
} from '../../../data/role/viewingAuditHistoryPermissions.data';

/** Opens View Role of a suite role on careconnect's page. */
async function viewRole(roleAdmin: RoleAdministrationPage, role: { id: string; name: string }): Promise<RoleViewDrawer> {
  await roleAdmin.open();
  await roleAdmin.search(role.name);
  return roleAdmin.openView(role.id);
}

/**
 * User story 21302: Viewing Audit History Permissions - a holder (maalmohammad through `roleHolder`) with or without a
 * module's "View Audit Logs" opening that module's records. See data/role/viewingAuditHistoryPermissions.data.ts.
 */
test.describe('US 21302 - Viewing Audit History Permissions (holder)', () => {
  test(`TC-${CASES.withPermissionViews.azureId}: should show and load a user's Audit History when the role holds Users > View Audit Logs`, async ({ steps, roleAdmin, roleHolder, suiteRoles, suiteUsers, page }) => {
    const ctx = { role: { id: '', name: '' }, userId: '' };

    await steps.critical('Navigate to the Role Management module - Role Management confirms the Users > View Audit Logs permission is enabled for the role', async () => {
      const catalogue = await suiteRoles.catalogue();
      const role = await suiteRoles.create({ label: ROLE_LABEL.users, rights: holderRights(catalogue, [{ moduleKey: MODULE_KEY.users, audit: true }], GLOBAL_AUDIT_RIGHTS) });
      ctx.role = { id: role.id, name: role.name };
      const user = await suiteUsers.create({ role });
      ctx.userId = user.id;
      const edited = await updateSuiteUser(page, user.id, { englishSecondName: EDITED_SECOND_NAME });
      expect(edited.status, `UpdateUser (history entry) answered ${told(edited)}`).toBeLessThan(300);
      const view = await viewRole(roleAdmin, ctx.role);
      expect(await view.tree.stateOf(auditKeyOf(catalogue, MODULE_KEY.users))).toBe('checked');
      await view.close();
    });

    await steps.step('Log in as the user and open the Users module - the Users module loads', async () => {
      await roleHolder.become({ role: { roleId: ctx.role.id } });
      const visit = await new HolderScreens(roleHolder.page).module('users');
      expect(visit.shown, `Users Administration (ended on ${visit.path}: "${visit.text}")`).toBe(true);
    });

    await steps.step('Open a user record and select the Audit History tab - the tab is visible and loads the change history for that user record', async () => {
      const screens = new HolderScreens(roleHolder.page);
      const visit = await screens.record('users', ctx.userId);
      expect(visit.opened, `the user profile (ended on ${visit.path}: "${visit.text}")`).toBe(true);
      expect(visit.auditTab, `an Audit History tab on the user profile, which shows no tabs and no audit or history control (audit tabs found: ${(await screens.auditTabsShown()).join(', ') || 'none'})`).toBe(true);
      const call = await screens.openAuditTab('users');
      expect(call.status, `the audit request ${call.path || '(none sent)'}`).toBe(200);
      expect(call.rows, 'history entries of the user').toBeGreaterThan(0);
    });
  });

  test(`TC-${CASES.withoutPermissionHidden.azureId}: should hide a payer's Audit History and refuse its request when the role lacks Payers > View Audit Logs`, async ({ steps, roleAdmin, roleHolder, suiteRoles, suitePayers, page }) => {
    const ctx = { role: { id: '', name: '' }, payerId: '' };
    let baseline: AuditCall | null = null;

    await steps.critical('Navigate to the Role Management module - Role Management confirms Payers > View Audit Logs is disabled for the role', async () => {
      const catalogue = await suiteRoles.catalogue();
      const role = await suiteRoles.create({ label: ROLE_LABEL.payers, rights: holderRights(catalogue, [{ moduleKey: MODULE_KEY.payers, audit: false }], GLOBAL_AUDIT_RIGHTS) });
      ctx.role = { id: role.id, name: role.name };
      ctx.payerId = (await suitePayers.existing(1))[0].id;
      const view = await viewRole(roleAdmin, ctx.role);
      expect(await view.tree.stateOf(auditKeyOf(catalogue, MODULE_KEY.payers))).toBe('unchecked');
      await view.close();
    });

    await steps.step('Log in as the user and open the Payers module - the Payers module loads', async () => {
      const admin = new HolderScreens(page);
      expect((await admin.record('payers', ctx.payerId)).auditTab, 'baseline: the System Administrator sees the payer Audit History tab').toBe(true);
      baseline = await admin.openAuditTab('payers');
      await roleHolder.become({ role: { roleId: ctx.role.id } });
      const visit = await new HolderScreens(roleHolder.page).module('payers');
      expect(visit.shown, `Payer Administration (ended on ${visit.path}: "${visit.text}")`).toBe(true);
    });

    await steps.step('Open a payer record and look for an Audit History tab - no Audit History tab is present and it cannot be opened', async () => {
      const visit = await new HolderScreens(roleHolder.page).record('payers', ctx.payerId);
      expect(visit.opened, `the payer detail (ended on ${visit.path}: "${visit.text}")`).toBe(true);
      expect(visit.auditTab, 'Audit History tab on the payer').toBe(false);
      const replay = await replayAudit(roleHolder.page, baseline);
      expect(isRefused(replay.status), `the payer's audit request replayed as the holder answered ${told(replay)} (${replay.totalRows} rows)`).toBe(true);
    });
  });

  test(`TC-${CASES.mixedPermissions.azureId}: should show Audit History on Plans and Networks but not on Facilities and Policies when only those two are granted`, async ({ steps, roleAdmin, roleHolder, suiteRoles, page }) => {
    const ctx = { role: { id: '', name: '' } };
    const records: Record<string, string> = {};
    const screens = (): HolderScreens => new HolderScreens(roleHolder.page);

    await steps.critical('Navigate to the Role Management module - Role Management confirms the mixed permission state across the four record types', async () => {
      const catalogue = await suiteRoles.catalogue();
      const rights = holderRights(catalogue, MIXED.map((m) => ({ moduleKey: MODULE_KEY[m.module], audit: m.audit })), GLOBAL_AUDIT_RIGHTS);
      const role = await suiteRoles.create({ label: ROLE_LABEL.mixed, rights });
      ctx.role = { id: role.id, name: role.name };
      for (const m of MIXED) records[m.module] = (await listRecords(page, m.module, {}, 1)).items[0]?.id ?? '';
      blockWhenMissing(steps, MIXED.flatMap((m) => need(records[m.module], `a ${m.module} record`)), 'No record to open');
      const view = await viewRole(roleAdmin, ctx.role);
      const states = [];
      for (const m of MIXED) states.push({ module: m.module, audit: (await view.tree.stateOf(auditKeyOf(catalogue, MODULE_KEY[m.module]))) === 'checked' });
      await view.close();
      expect(states).toEqual(MIXED.map((m) => ({ module: m.module, audit: m.audit })));
    });

    await steps.step('Log in as the user and open the Plans module, then open a plan record - the Audit History tab is visible and accessible', async () => {
      await roleHolder.become({ role: { roleId: ctx.role.id } });
      const visit = await screens().record('plans', records.plans);
      expect({ opened: visit.opened, auditTab: visit.auditTab }, `the plan (ended on ${visit.path}: "${visit.text}")`).toEqual({ opened: true, auditTab: true });
      expect((await screens().openAuditTab('plans')).status).toBe(200);
    });

    await steps.step('Open the Networks module and a network record - the Audit History tab is visible and accessible', async () => {
      const visit = await screens().record('networks', records.networks);
      expect({ opened: visit.opened, auditTab: visit.auditTab }, `the network (ended on ${visit.path}: "${visit.text}")`).toEqual({ opened: true, auditTab: true });
      expect((await screens().openAuditTab('networks')).status).toBe(200);
    });

    await steps.step('Open the Facilities module and a facility record - no Audit History tab is present', async () => {
      const visit = await screens().record('facilities', records.facilities);
      expect({ opened: visit.opened, auditTab: visit.auditTab }, `the facility (ended on ${visit.path}: "${visit.text}")`).toEqual({ opened: true, auditTab: false });
    });

    await steps.step('Open the Policies module and a policy record - no Audit History tab is present', async () => {
      const visit = await screens().record('policies', records.policies);
      expect({ opened: visit.opened, auditTab: visit.auditTab }, `the policy (ended on ${visit.path}: "${visit.text}")`).toEqual({ opened: true, auditTab: false });
    });
  });

  test(`TC-${CASES.grantThenView.azureId}: should let the user open a formulary's Audit History once Formularies > View Audit Logs is granted`, async ({ steps, roleAdmin, roleHolder, suiteRoles, page }) => {
    const ctx = { role: { id: '', name: '' }, formularyId: '', owner: '', auditKey: '' };

    await steps.critical("Navigate to the Role Management module - Role Management shows the user's role with no View Audit Logs permissions enabled", async () => {
      const catalogue = await suiteRoles.catalogue();
      const role = await suiteRoles.create({ label: ROLE_LABEL.formularies, rights: holderRights(catalogue, [{ moduleKey: MODULE_KEY.formularies, audit: false }], GLOBAL_AUDIT_RIGHTS) });
      ctx.role = { id: role.id, name: role.name };
      ctx.auditKey = auditKeyOf(catalogue, MODULE_KEY.formularies);
      const formulary = await formularyWithHistory(page);
      Object.assign(ctx, { formularyId: formulary.id, owner: formulary.payerName });
      blockWhenMissing(steps, need(ctx.formularyId, 'a formulary whose Audit History lists an entry'), 'No formulary with change history');
      const view = await viewRole(roleAdmin, ctx.role);
      const rows = await view.tree.rowsByKey();
      expect([...rows.entries()].filter(([k, r]) => k.endsWith('.AuditLogs') && r.state !== 'unchecked').map(([k]) => k), 'View Audit Logs permissions enabled').toEqual([]);
      await view.close();
    });

    await steps.step(`Enable the "${VIEW_AUDIT_LOGS}" permission under the Formularies heading and save the role - a confirmation message confirms the role was updated`, async () => {
      const form = await openEditPrivileges(roleAdmin, ctx.role);
      await form.tree.tick(ctx.auditKey);
      const out = await form.save();
      expect(out.status, `UpdateRole: ${out.apiMessage}`).toBe(200);
      expect(out.toast, 'a confirmation toast after the save').not.toBe('');
      expect((await suiteRoles.read(ctx.role.id))?.selectedPermissionIds.length).toBeGreaterThan(0);
    });

    await steps.step('Log in as the user and open the Formularies module - the Formularies module loads', async () => {
      await roleHolder.become({ role: { roleId: ctx.role.id } });
      expect((await roleHolder.permissions()).permissions).toContain(ctx.auditKey);
      const visit = await new HolderScreens(roleHolder.page).module('formularies');
      expect(visit.shown, `Formulary Management (ended on ${visit.path}: "${visit.text}")`).toBe(true);
    });

    await steps.step('Open a formulary record and select Audit History - the tab opens and displays the recorded change history entries', async () => {
      const screens = new HolderScreens(roleHolder.page);
      const visit = await screens.record('formularies', ctx.formularyId, true, ctx.owner);
      expect({ opened: visit.opened, auditTab: visit.auditTab }, `the formulary (ended on ${visit.path}: "${visit.text}")`).toEqual({ opened: true, auditTab: true });
      const call = await screens.openAuditTab('formularies');
      expect(call.status, `the audit request ${call.path || '(none sent)'}`).toBe(200);
      expect(call.rows, 'history entries of the formulary').toBeGreaterThan(0);
    });
  });

  test(`TC-${CASES.revokeHides.azureId}: should hide a member's Audit History after the next login once Members > View Audit Logs is revoked`, async ({ steps, roleAdmin, roleHolder, suiteRoles, page }) => {
    const ctx = { role: { id: '', name: '' }, memberId: '', auditKey: '' };

    await steps.critical('Precondition: a member record exists and the user holds a role with Members view rights', async () => {
      const catalogue = await suiteRoles.catalogue();
      ctx.auditKey = auditKeyOf(catalogue, MODULE_KEY.members);
      ctx.memberId = (await listRecords(page, 'members', {}, 1)).items[0]?.id ?? '';
      blockWhenMissing(steps, need(ctx.memberId, 'a member record'), 'No member to open');
      const rights = [...holderRights(catalogue, [{ moduleKey: MODULE_KEY.members, audit: true }], GLOBAL_AUDIT_RIGHTS)];
      const role = await suiteRoles.create({ label: ROLE_LABEL.members, rights });
      ctx.role = { id: role.id, name: role.name };
      expect(role.rights.length).toBeGreaterThan(0);
    });

    await steps.step(`Navigate to the Role Management module - Role Management confirms Members > ${VIEW_AUDIT_LOGS} is currently enabled`, async () => {
      const view = await viewRole(roleAdmin, ctx.role);
      const row = await auditRowUnder(view.tree, MODULE_KEY.members, VIEW_AUDIT_LOGS);
      const holds = await directEntries(view.tree, MODULE_KEY.members);
      await view.close();
      expect(row?.state ?? 'no such entry', `the Members "${VIEW_AUDIT_LOGS}" entry (${holds})`).toBe('checked');
    });

    await steps.step("Confirm current access by logging in as the user and opening a Member record's Audit History tab - the tab is visible and loads history", async () => {
      await roleHolder.become({ role: { roleId: ctx.role.id } });
      const screens = new HolderScreens(roleHolder.page);
      const visit = await screens.record('members', ctx.memberId);
      expect(visit.opened, `the member (ended on ${visit.path}: "${visit.text}")`).toBe(true);
      expect(visit.auditTab, `Audit History tab ${MODULE_SCREEN.members.auditTab}; audit tabs shown: ${(await screens.auditTabsShown()).join(', ') || 'none'}`).toBe(true);
      expect((await screens.openAuditTab('members')).rows).toBeGreaterThan(0);
    });

    await steps.step(`As the System Administrator, disable the Members > ${VIEW_AUDIT_LOGS} permission and save the role - a confirmation message confirms the update`, async () => {
      expect(ctx.auditKey, `the Members heading holds no "${VIEW_AUDIT_LOGS}" permission to disable`).not.toBe('');
      const form = await openEditPrivileges(roleAdmin, ctx.role);
      await form.tree.untick(ctx.auditKey);
      const out = await form.save();
      expect(out.status, `UpdateRole: ${out.apiMessage}`).toBe(200);
      expect(out.toast, 'a confirmation toast after the save').not.toBe('');
    });

    await steps.step('Log the user out and log back in, then open the same Member record - the Audit History tab is no longer present', async () => {
      await roleHolder.signInAgain();
      const visit = await new HolderScreens(roleHolder.page).record('members', ctx.memberId);
      expect({ opened: visit.opened, auditTab: visit.auditTab }, `the member (ended on ${visit.path}: "${visit.text}")`).toEqual({ opened: true, auditTab: false });
    });
  });

  test(`TC-${CASES.reversalOwnPermission.azureId}: should keep an authorization reversal's Audit History hidden when only the PBM Engine's View Audit Logs is missing`, async ({ steps, roleAdmin, roleHolder, suiteRoles, page }) => {
    const ctx = { role: { id: '', name: '' }, reversalId: '' };
    const portal = WRITER_D_SCREEN.enginePortal;

    await steps.critical('Navigate to the Role Management module - Role Management confirms Authorization reversals (PBM Engine) > View Audit Logs is disabled while other audit permissions are enabled', async () => {
      const catalogue = await suiteRoles.catalogue();
      const rights = holderRights(catalogue, [{ moduleKey: ENGINE_MODULE, audit: false }, ...OTHER_AUDIT_MODULES.map((moduleKey) => ({ moduleKey, audit: true }))], GLOBAL_AUDIT_RIGHTS);
      const role = await suiteRoles.create({ label: ROLE_LABEL.engine, rights });
      ctx.role = { id: role.id, name: role.name };
      const view = await viewRole(roleAdmin, ctx.role);
      const states = { engine: await view.tree.stateOf(auditKeyOf(catalogue, ENGINE_MODULE)), others: [] as string[] };
      for (const m of OTHER_AUDIT_MODULES) states.others.push(await view.tree.stateOf(auditKeyOf(catalogue, m)));
      await view.close();
      expect(states).toEqual({ engine: 'unchecked', others: OTHER_AUDIT_MODULES.map(() => 'checked') });
      ctx.reversalId = await reversedAuthorizationId(page);
      blockWhenMissing(steps, need(ctx.reversalId, 'a reversed authorization in the PBM Engine (GetAuthorizations; the suite cannot post one - it needs the partner API)'), 'No authorization reversal to open');
    });

    await steps.step("Log in as the user and open the PBM Engine's Authorization reversals area - the area loads listing authorization reversal records", async () => {
      await roleHolder.become({ role: { roleId: ctx.role.id } });
      const visit = await new HolderScreens(roleHolder.page).visit(portal.route, portal.root);
      expect(visit.shown, `the Integration Portal (ended on ${visit.path}: "${visit.text}")`).toBe(true);
      const listed = await asSession(roleHolder.page, 'POST', ApiEndpoints.engineAuthorizations, { pageNumber: 1, rowsPerPage: 200 });
      expect(listed.status, told(listed)).toBe(200);
      expect(listed.text, 'the reversed authorization is listed').toContain(ctx.reversalId);
    });

    await steps.step('Open a reversal record and check for Audit History - no Audit History tab is present, even though the user has audit access to other record types', async () => {
      const record = await asSession(roleHolder.page, 'POST', ENGINE_GET_AUTHORIZATION, { id: ctx.reversalId });
      expect(record.status, `GetAuthorization as the holder answered ${told(record)}`).toBe(200);
      expect(await new HolderScreens(roleHolder.page).auditTabsShown(), 'Audit History tabs on the Integration Portal').toEqual([]);
      const audit = await auditLogsOf(roleHolder.page, ENGINE_AUDIT_ENTITY);
      expect(isRefused(audit.status) || audit.totalRows === 0, `the reversal audit log as the holder answered ${told(audit)} with ${audit.totalRows} rows`).toBe(true);
    });
  });

  test(`TC-${CASES.noDirectBypass.azureId}: should not expose the SystemSettings audit history by URL, bookmark or Back / Forward without SystemSettings > View Audit Logs`, async ({ steps, roleAdmin, roleHolder, suiteRoles, page }) => {
    const ctx = { role: { id: '', name: '' }, rights: [] as string[], auditKey: '' };
    const logs = WRITER_D_SCREEN.auditLogs;
    const settingsShown = async (): Promise<string[]> => (await new HolderScreens(roleHolder.page).auditLogEntityTypes()).filter((t) => SYSTEM_SETTING_ROW.test(norm(t)));

    await steps.critical('Navigate to the Role Management module - Role Management confirms SystemSettings > View Audit Logs is disabled', async () => {
      const catalogue = await suiteRoles.catalogue();
      ctx.auditKey = auditKeyOf(catalogue, SYSTEM_SETTINGS_MODULE);
      ctx.rights = holderRights(catalogue, [{ moduleKey: SYSTEM_SETTINGS_MODULE, audit: false }], GLOBAL_AUDIT_RIGHTS);
      const role = await suiteRoles.create({ label: ROLE_LABEL.settings, rights: ctx.rights });
      ctx.role = { id: role.id, name: role.name };
      const view = await viewRole(roleAdmin, ctx.role);
      expect(await view.tree.stateOf(ctx.auditKey)).toBe('unchecked');
      await view.close();
      const baseline = await auditLogsOf(page, SYSTEM_SETTING_ENTITY);
      expect(baseline.totalRows, `baseline: the System Administrator's ${SYSTEM_SETTING_ENTITY} audit log (${told(baseline)})`).toBeGreaterThan(0);
    });

    await steps.step('Log in as the user and attempt to reach the SystemSettings audit history directly (saved link / constructed URL) - access is denied or no SystemSettings history is shown', async () => {
      await roleHolder.become({ role: { roleId: ctx.role.id } });
      await new HolderScreens(roleHolder.page).visit(logs.route, logs.screen, false);
      expect(await settingsShown(), `${SYSTEM_SETTING_ENTITY} rows on ${logs.route}`).toEqual([]);
      const api = await auditLogsOf(roleHolder.page, SYSTEM_SETTING_ENTITY);
      expect(isRefused(api.status) || api.totalRows === 0, `the ${SYSTEM_SETTING_ENTITY} audit log as the holder answered ${told(api)} with ${api.totalRows} rows`).toBe(true);
    });

    await steps.step('Attempt the same direct access via browser Back / Forward to a previously cached audit page - the audit history content is not rendered', async () => {
      expect((await suiteRoles.setRights(ctx.role.id, [...ctx.rights, ctx.auditKey])).status, 'granting SystemSettings > View Audit Logs for the cached page').toBeLessThan(300);
      const screens = new HolderScreens(roleHolder.page);
      await screens.visit(logs.route, logs.screen);
      await screens.visit(WRITER_D_SCREEN.dashboard.route, WRITER_D_SCREEN.outlet);
      expect((await suiteRoles.setRights(ctx.role.id, ctx.rights)).status, 'revoking it again').toBeLessThan(300);
      await screens.back();
      expect(await settingsShown(), `${SYSTEM_SETTING_ENTITY} rows after Back`).toEqual([]);
      await screens.forward();
      await screens.back();
      expect(await settingsShown(), `${SYSTEM_SETTING_ENTITY} rows after Forward / Back`).toEqual([]);
      const api = await auditLogsOf(roleHolder.page, SYSTEM_SETTING_ENTITY);
      expect(isRefused(api.status) || api.totalRows === 0, `the ${SYSTEM_SETTING_ENTITY} audit log after the revoke answered ${told(api)} with ${api.totalRows} rows`).toBe(true);
    });
  });
});
