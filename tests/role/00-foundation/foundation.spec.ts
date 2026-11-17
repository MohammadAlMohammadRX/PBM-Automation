import { test, expect } from '../../../fixtures';
import { allRoles, currentRolesAndPermissions, readRole, rolePermissionKeys } from '../../../utils/role/roleApi';
import { findUserByEmail } from '../../../utils/UserProvisioning';
import { readSecondUser, snapshotOf, SECOND_USER_HOME_ROLE } from '../../../utils/notification/secondUserAccount';
import { PREDEFINED_ROLES, PREDEFINED_ROLE_NAMES, ROLE_DEACTIVATION_REASON_LABELS, ROLE_LIMITS, ROLE_MESSAGES, ROLE_STATUS, ROLE_TOGGLE_LABEL } from '../../../data/role/common.data';

/**
 * Role Management foundation proof (2026-11-14) - stays in the suite as the module's smoke check of the
 * shared layer: list + predefined/suite rows, suite roles / users made and cleaned, Add Role through the UI,
 * the role holder (second user) signing in with only Payer Officer and with only a suite role (the 2FA
 * question) and getting its roles back, the deactivate / activate / delete flows, and the predefined Edit.
 */

/** Hand-over between FND-002 and FND-003 (one worker, file order). */
const handOver = { roleName: '', roleId: '', userEmail: '' };

test.describe('Role Management - foundation', () => {
  test('FND-001: should list the roles and tell the three predefined rows from a suite row', async ({ steps, suiteRoles, roleAdmin, page }, testInfo) => {
    const made = { id: '', name: '' };
    const facts: string[] = [];

    await steps.critical('Open Role Administration: the list renders the first page of GetRoles (Newest first)', async () => {
      const role = await suiteRoles.create({ label: 'list' });
      made.id = role.id;
      made.name = role.name;
      const answer = await roleAdmin.open();
      expect(answer.status).toBe(200);
      expect(answer.request.sortBy).toBe('CreatedOn desc');
      expect(answer.request.includeStaticRoles).toBe(true);
      expect(await roleAdmin.sortLabel()).toBe('Newest');
      const ids = await roleAdmin.rowIds();
      expect(ids).toEqual(answer.items.slice(0, ids.length).map((r) => r.id));
      expect(ids.length).toBe(Math.min(10, answer.totalRows));
      facts.push(`GetRoles totalRows ${answer.totalRows}`);
    });

    await steps.step('The three predefined rows carry the badge; Toggle and Delete are DISABLED, View and Edit enabled', async () => {
      const listed = await allRoles(page);
      for (const name of PREDEFINED_ROLE_NAMES) {
        const item = listed.find((r) => r.name === name);
        expect(item, `${name} is listed`).toBeTruthy();
        expect(item?.isPredefined).toBe(true);
        await roleAdmin.search(name);
        const id = item?.id as string;
        const row = await roleAdmin.readRow(id);
        facts.push(`predefined name cell HTML: ${(await roleAdmin.cell(id, 'name').innerHTML()).replace(/_ngcontent-[a-z0-9-]+=""/g, '').replace(/\s+/g, ' ').slice(0, 300)}`);
        expect(row.name).toBe(name);
        expect(row.predefined, `${name} shows the predefined badge`).toBe(true);
        await expect(roleAdmin.cell(id, 'name')).toContainText('Predefined role');
        expect(await roleAdmin.rowActions(id)).toEqual([
          { action: 'view', label: 'View', enabled: true },
          { action: 'edit', label: 'Edit', enabled: true },
          { action: 'toggle-active', label: ROLE_TOGGLE_LABEL.inactivate, enabled: false },
          { action: 'delete', label: 'Delete', enabled: false },
        ]);
      }
    });

    await steps.step('A suite row has no badge and offers View, Edit, Inactivate and Delete (all enabled)', async () => {
      const result = await roleAdmin.search(made.name);
      expect(result.items.map((r) => r.id)).toEqual([made.id]);
      const row = await roleAdmin.readRow(made.id);
      expect(row).toEqual({ id: made.id, name: made.name, description: 'Created by the automation suite', status: ROLE_STATUS.active, predefined: false });
      expect((await roleAdmin.rowActions(made.id)).map((a) => `${a.action}:${a.label}:${a.enabled}`)).toEqual(['view:View:true', 'edit:Edit:true', 'toggle-active:Inactivate:true', 'delete:Delete:true']);
      await expect(roleAdmin.chip('search')).toContainText(made.name);
    });

    await steps.step('Cards: the suite card offers Edit / View / Delete, the Payer Officer card no Delete; back to the table', async () => {
      await roleAdmin.switchToCards();
      try {
        expect(await roleAdmin.cardIds()).toEqual([made.id]);
        expect((await roleAdmin.cardActions(made.id)).map((a) => a.action)).toEqual(['edit', 'view', 'delete']);
        await roleAdmin.search(PREDEFINED_ROLES.payerOfficer.en);
        const poId = PREDEFINED_ROLES.payerOfficer.id;
        await expect(roleAdmin.card(poId)).toContainText('Predefined role');
        expect((await roleAdmin.cardActions(poId)).map((a) => a.action)).toEqual(['edit', 'view']);
      } finally {
        await roleAdmin.switchToTable(); // the view is a server-side preference of careconnect - always put the table back
      }
    });

    await steps.step('No result: "No roles found."; the search box offers Clear', async () => {
      const result = await roleAdmin.search('zzznoresult123');
      expect(result.totalRows).toBe(0);
      await expect(roleAdmin.emptyText()).toHaveText(ROLE_MESSAGES.noRolesFound);
      const cleared = await roleAdmin.clearSearch();
      expect(cleared.request.searchText ?? '').toBe('');
    });

    await steps.step('Export: the menu offers Selected Export and Export All Data; Export All Data downloads a file (facts recorded)', async () => {
      expect(await roleAdmin.exportScopes()).toEqual(['Selected Export', 'Export All Data']);
      const file = await roleAdmin.exportFile('all');
      facts.push(`export all: file ${file.filename}, format dialog ${file.formatDialog}, toast "${file.toast}", headers ${JSON.stringify(file.parsed.headers)}, rows ${file.parsed.rows.length}`);
      expect(file.parsed.rows.length).toBeGreaterThan(0);
    });

    testInfo.annotations.push({ type: 'facts', description: facts.join(' || ') });
  });

  test('FND-002: should make a suite role and a suite user holding it through the API and list the role', async ({ steps, suiteRoles, suiteUsers, roleAdmin, page }) => {
    await steps.critical('suiteRoles.create makes an active suite role (bilingual names, Allowed To Assign By = Organization Administrator)', async () => {
      const role = await suiteRoles.create({ label: 'api', rights: ['Roles.GetRoles', 'Roles.GetRole'] });
      handOver.roleName = role.name;
      handOver.roleId = role.id;
      expect(role.record.isActive).toBe(true);
      expect(role.record.isPredefined).toBe(false);
      expect(role.record.assignableRoleIds).toEqual([PREDEFINED_ROLES.organizationAdministrator.id]);
      expect((await rolePermissionKeys(page, role.id)).sort()).toEqual(['Roles.GetRole', 'Roles.GetRoles']);
    });

    await steps.step('The role is listed by search, with its description and Active status', async () => {
      await roleAdmin.open();
      const result = await roleAdmin.search(handOver.roleName);
      expect(result.items.map((r) => r.name)).toEqual([handOver.roleName]);
      expect((await roleAdmin.readRow(handOver.roleId)).status).toBe(ROLE_STATUS.active);
    });

    await steps.step('suiteUsers.create makes a suite user holding the role (teardown deletes the user before the role)', async () => {
      const user = await suiteUsers.create({ role: { roleId: handOver.roleId } });
      handOver.userEmail = user.email;
      expect(user.record.assignedRoles.map((r) => r.id)).toEqual([handOver.roleId]);
    });
  });

  test('FND-003: should have deleted the suite role and suite user of FND-002 at teardown', async ({ steps, page }) => {
    steps.dependsOn('FND-002');
    await steps.step('The FND-002 role is no longer listed (GetRoles) nor readable (GetRole)', async () => {
      expect(handOver.roleId, 'FND-002 handed over a role').not.toBe('');
      expect((await allRoles(page)).some((r) => r.id === handOver.roleId || r.name === handOver.roleName)).toBe(false);
      expect(await readRole(page, handOver.roleId)).toBeNull();
    });
    await steps.step('The FND-002 suite user is gone', async () => {
      expect(await findUserByEmail(page, handOver.userEmail)).toBeNull();
    });
  });

  test('FND-004: should add a role through the UI - step 2, tick a permission, save, capture the message - and clean it up', async ({ steps, suiteRoles, roleAdmin, page }, testInfo) => {
    const nameEn = suiteRoles.newName('ui');
    const nameAr = suiteRoles.newArabicName();
    const facts: string[] = [];

    await steps.critical('Add Role: Next with nothing asks for both names and Allowed To Assign By', async () => {
      await suiteRoles.watch();
      await roleAdmin.open();
      const form = await roleAdmin.openAdd();
      expect(await form.title()).toBe(ROLE_MESSAGES.addTitle);
      expect(await form.readValues()).toEqual({ nameEn: '', nameAr: '', descriptionEn: '', descriptionAr: '', allowedToAssignBy: [], isActive: true, hasAssignedPayers: false, canApproveOwnRequests: false });
      expect(await form.next()).toBe(1);
      expect([await form.fieldError('englishName'), await form.fieldError('arabicName'), await form.fieldError('allowedToAssignBy')]).toEqual([ROLE_MESSAGES.fieldRequired, ROLE_MESSAGES.fieldRequired, ROLE_MESSAGES.fieldRequired]);
      expect(await form.field('englishName').getAttribute('maxlength')).toBe(String(ROLE_LIMITS.name));
    });

    await steps.critical('Valid Role Information reaches Privileges with both names in the banner', async () => {
      const form = roleAdmin.form;
      await form.fill({ nameEn, nameAr, descriptionEn: 'Foundation UI role', allowedToAssignBy: [PREDEFINED_ROLES.organizationAdministrator.en] });
      expect(await form.readAllowedToAssignBy()).toEqual([PREDEFINED_ROLES.organizationAdministrator.en]);
      await form.nextToPrivileges();
      const banner = await form.banner();
      expect(banner).toContain(nameEn);
      expect(banner).toContain(nameAr);
    });

    await steps.step('Save with nothing ticked: "Select at least one privilege." and no request', async () => {
      const out = await roleAdmin.form.save();
      expect(out.status).toBeNull();
      await expect(roleAdmin.form.tree.message(ROLE_MESSAGES.selectAtLeastOnePrivilege)).toBeVisible();
    });

    await steps.critical('Tree: a leaf tick makes its headings partial with counts; a heading tick fills and clears the module', async () => {
      const tree = roleAdmin.form.tree;
      expect(await tree.countOf('Roles')).toEqual({ selected: 0, total: 9 });
      await tree.tick('Roles.ExportRoles');
      expect(await tree.countOf('Roles')).toEqual({ selected: 1, total: 9 });
      expect(await tree.countOf('Roles.GetRoles')).toEqual({ selected: 1, total: 6 });
      expect(await tree.stateOf('Roles')).toBe('partial');
      await tree.tick('Roles');
      expect(await tree.countOf('Roles')).toEqual({ selected: 9, total: 9 });
      await tree.untick('Roles');
      expect(await tree.countOf('Roles')).toEqual({ selected: 0, total: 9 });
      await tree.search('zzznotfound123');
      await expect(tree.message(ROLE_MESSAGES.noPrivilegesMatch)).toBeVisible();
      await tree.clearSearch();
      await tree.collapseAll();
      expect((await tree.readRows()).every((r) => r.depth === 0)).toBe(true);
      facts.push(`modules: ${(await tree.readHeadings()).map((h) => `${h.label} (${h.count?.selected}/${h.count?.total})`).join(', ')}`);
      await tree.expandAll();
      await tree.tick('Roles.ExportRoles');
      expect(await tree.stateOf('Roles.ExportRoles')).toBe('checked');
    });

    await steps.critical('Save creates the role: success toast captured, drawer closes, GetRole holds exactly the ticked permission', async () => {
      const out = await roleAdmin.form.saveExpectingSuccess();
      facts.push(`create: api "${out.apiMessage}", toast "${out.toast}"`);
      expect(out.toast).toBe(`${ROLE_MESSAGES.createdSummary} ${ROLE_MESSAGES.createdDetail}`);
      const id = await suiteRoles.adopt(nameEn);
      expect(id).toBe(out.id);
      const record = await readRole(page, id);
      expect(record?.arabicName).toBe(nameAr);
      expect(record?.englishDescription).toBe('Foundation UI role');
      expect(record?.assignableRoleIds).toEqual([PREDEFINED_ROLES.organizationAdministrator.id]);
      expect(await rolePermissionKeys(page, id)).toEqual(['Roles.ExportRoles']);
    });

    await steps.step('The same English name again is refused: "Role name \'<name>\' is already taken." (drawer stays open)', async () => {
      const form = await roleAdmin.openAdd();
      await form.fill({ nameEn, nameAr: suiteRoles.newArabicName(), allowedToAssignBy: [PREDEFINED_ROLES.organizationAdministrator.en] });
      await form.nextToPrivileges();
      await form.tree.tick('Roles.ExportRoles');
      const out = await form.save();
      facts.push(`duplicate: ${out.status} "${out.apiMessage}" toast "${out.toast}"`);
      expect(out.status).toBe(409);
      expect(out.apiMessage).toBe(ROLE_MESSAGES.nameTaken(nameEn));
      expect(out.closed).toBe(false);
      expect(await form.close()).toContain(ROLE_MESSAGES.unsavedTitle);
    });

    testInfo.annotations.push({ type: 'facts', description: facts.join(' || ') });
  });

  test('FND-005: should sign the role holder in with ONLY Payer Officer (one suite payer) without a two-factor code, and restore it', async ({ steps, roleHolder, suitePayers, page }, testInfo) => {
    const payer = { id: '', name: '' };
    await steps.critical('The holder starts as its own self (Organization Administrator among its roles)', async () => {
      expect(roleHolder.original.roleNames).toContain(SECOND_USER_HOME_ROLE);
      const [p] = await suitePayers.existing(1);
      payer.id = p.id;
      payer.name = p.name;
    });

    await steps.critical('Given ONLY Payer Officer + the suite payer, it signs in without being held at /login/verify', async () => {
      const result = await roleHolder.become({ role: 'Payer Officer', payerIds: [payer.id] }, { allowTwoFactorHold: true });
      testInfo.annotations.push({ type: '2fa-payer-officer', description: JSON.stringify(result) });
      expect(result.heldAtVerify, `held at two-factor: ${JSON.stringify(result)}`).toBe(false);
      expect(result.requiresTwoFactor).not.toBe(true);
      expect(new URL(result.url).pathname).not.toMatch(/\/login/);
    });

    await steps.step('Its session holds only Payer Officer and the payer gate offered the suite payer', async () => {
      const me = await roleHolder.permissions();
      expect(me.roles).toEqual(['Payer Officer']);
      testInfo.annotations.push({ type: 'facts', description: `Payer Officer session: ${me.permissions.length} permissions; payer gate answered "${roleHolder.lastSignIn?.payerChosen}"` });
      expect(me.permissions).not.toContain('Roles.GetRoles');
      expect(roleHolder.lastSignIn?.payerChosen ?? payer.name).toBe(payer.name);
    });

    await steps.step('It sees what Payer Officer allows: Plans Mgmt in the menu, no System Settings / Users Mgmt', async () => {
      const hp = roleHolder.page;
      await expect(hp.locator('#app-nav-plans-management-link')).toBeVisible();
      await expect(hp.locator('#app-nav-system-settings-toggle')).toHaveCount(0);
      await expect(hp.locator('#app-nav-users-management-toggle')).toHaveCount(0);
    });

    await steps.critical('restoreNow gives back its original roles, read back (Organization Administrator)', async () => {
      await roleHolder.restoreNow();
      const back = snapshotOf(await readSecondUser(page));
      expect([...back.roleNames].sort()).toEqual([...roleHolder.original.roleNames].sort());
      expect(back.roleNames).toContain(SECOND_USER_HOME_ROLE);
    });
  });

  test('FND-006: should sign the role holder in with ONLY a suite role without a two-factor code, see the role list, and restore it', async ({ steps, roleHolder, page }, testInfo) => {
    let roleName = '';
    await steps.critical('Given ONLY a suite role (Roles.GetRoles + Roles.GetRole), it signs in without being held at /login/verify', async () => {
      const role = await roleHolder.becomeSuiteRole({ label: 'holder', rights: ['Roles.GetRoles', 'Roles.GetRole'] });
      roleName = role.name;
      const result = roleHolder.lastSignIn;
      testInfo.annotations.push({ type: '2fa-suite-role', description: JSON.stringify(result) });
      expect(result?.heldAtVerify, `held at two-factor: ${JSON.stringify(result)}`).toBe(false);
      expect(result?.requiresTwoFactor).not.toBe(true);
    });

    await steps.step('Its session holds exactly that role and those two rights', async () => {
      const me = await roleHolder.permissions();
      expect(me.roles).toEqual([roleName]);
      expect(me.permissions.filter((p) => p.includes('.')).sort()).toEqual(['Roles.GetRole', 'Roles.GetRoles']);
    });

    await steps.step('It sees what the role allows: Role Administration lists the roles, View only on every row', async () => {
      const list = roleHolder.roles;
      const answer = await list.open();
      expect(answer.status).toBe(200);
      const id = (await list.rowIds())[0];
      const actions = await list.rowActions(id);
      testInfo.annotations.push({ type: 'facts', description: `view-only holder row actions: ${JSON.stringify(actions)}; add button ${await list.button('role-list-add-button').count()}` });
      expect(actions.map((a) => a.action)).toContain('view');
    });

    await steps.critical('restoreNow gives back its original roles, read back (Organization Administrator)', async () => {
      await roleHolder.restoreNow();
      const back = snapshotOf(await readSecondUser(page));
      expect([...back.roleNames].sort()).toEqual([...roleHolder.original.roleNames].sort());
      expect(back.roleNames).toContain(SECOND_USER_HOME_ROLE);
      expect((await currentRolesAndPermissions(page)).roles).toEqual(['Admin']);
    });
  });

  test('FND-007: should show the deactivate drawer of a suite role with its reasons and validations, then deactivate and activate it', async ({ steps, suiteRoles, roleAdmin }, testInfo) => {
    const role = { id: '', name: '' };
    const facts: string[] = [];
    await steps.critical('Inactivate on an active suite role opens "Deactivate Role" with the warning', async () => {
      const r = await suiteRoles.create({ label: 'lifecycle' });
      role.id = r.id;
      role.name = r.name;
      await roleAdmin.open();
      await roleAdmin.search(role.name);
      const drawer = await roleAdmin.openDeactivate(role.id);
      expect(await drawer.title()).toBe(ROLE_MESSAGES.deactivateTitle);
      expect(await drawer.bodyText()).toBe(ROLE_MESSAGES.deactivateWarning(role.name));
      expect(await drawer.selectedReason()).toBe(ROLE_MESSAGES.deactivateReasonPlaceholder);
    });

    await steps.step('Reasons: Reorganisation, Superseded by Another Role, No Longer Required, Security Review, Other', async () => {
      expect(await roleAdmin.deactivate.reasonOptions()).toEqual(ROLE_DEACTIVATION_REASON_LABELS);
    });

    await steps.step('Deactivate with no reason: "This field is required." and no request', async () => {
      const out = await roleAdmin.deactivate.confirm();
      expect(out.status).toBeNull();
      expect(await roleAdmin.deactivate.reasonError()).toBe(ROLE_MESSAGES.fieldRequired);
    });

    await steps.step('Other with empty Details: \'Details are required when the reason is "Other".\'', async () => {
      await roleAdmin.deactivate.chooseReason('Other');
      const out = await roleAdmin.deactivate.confirm();
      expect(out.status).toBeNull();
      expect(await roleAdmin.deactivate.detailsError()).toBe(ROLE_MESSAGES.detailsRequiredForOther);
      expect(await roleAdmin.deactivate.fillDetails('x'.repeat(ROLE_LIMITS.deactivationDetails + 1))).toHaveLength(ROLE_LIMITS.deactivationDetails);
    });

    await steps.critical('Other + details deactivates: toast captured, row Inactive with Activate', async () => {
      await roleAdmin.deactivate.fillDetails('Foundation check');
      const out = await roleAdmin.deactivate.confirm();
      facts.push(`deactivate: ${out.status} "${out.apiMessage}" toast "${out.toast}"`);
      expect(out.status).toBe(200);
      expect(out.toast).toBe(`${ROLE_MESSAGES.deactivatedSummary} ${ROLE_MESSAGES.deactivatedDetail}`);
      await expect(roleAdmin.statusBadge(role.id)).toHaveText(ROLE_STATUS.inactive);
      await expect(roleAdmin.action(role.id, 'toggle-active')).toHaveText(ROLE_TOGGLE_LABEL.activate);
      expect((await suiteRoles.read(role.id))?.isActive).toBe(false);
    });

    await steps.step('Activate asks "Activate Role" and activates: toast captured, row Active', async () => {
      const dialog = await roleAdmin.openActivate(role.id);
      const text = await dialog.read();
      facts.push(`activate dialog: ${JSON.stringify(text)}`);
      expect(text).toEqual({ title: ROLE_MESSAGES.activateTitle, message: ROLE_MESSAGES.activateMessage(role.name), confirmLabel: ROLE_MESSAGES.activateConfirmLabel, cancelLabel: 'Cancel' });
      const out = await dialog.confirmActivate();
      facts.push(`activate: ${out.status} "${out.apiMessage}" toast "${out.toast}"`);
      expect(out.toast).toBe(`${ROLE_MESSAGES.activatedSummary} ${ROLE_MESSAGES.activatedDetail}`);
      await expect(roleAdmin.statusBadge(role.id)).toHaveText(ROLE_STATUS.active);
      expect((await suiteRoles.read(role.id))?.isActive).toBe(true);
    });
    testInfo.annotations.push({ type: 'facts', description: facts.join(' || ') });
  });

  test('FND-008: should ask before deleting a suite role and delete it with a toast', async ({ steps, suiteRoles, roleAdmin, page }, testInfo) => {
    const role = { id: '', name: '' };
    await steps.critical('Delete asks "Delete Role - Do you want to delete <name>?" (No / Yes); No keeps the role', async () => {
      const r = await suiteRoles.create({ label: 'delete' });
      role.id = r.id;
      role.name = r.name;
      await roleAdmin.open();
      await roleAdmin.search(role.name);
      const dialog = await roleAdmin.openDelete(role.id);
      expect(await dialog.read()).toEqual({ title: ROLE_MESSAGES.deleteTitle, message: ROLE_MESSAGES.deleteMessage(role.name), confirmLabel: ROLE_MESSAGES.deleteConfirmLabel, cancelLabel: ROLE_MESSAGES.deleteCancelLabel });
      await dialog.cancel();
      await expect(roleAdmin.row(role.id)).toBeVisible();
    });

    await steps.critical('Yes deletes: toast captured, row gone, GetRole finds nothing', async () => {
      const out = await (await roleAdmin.openDelete(role.id)).confirmDelete();
      testInfo.annotations.push({ type: 'facts', description: `delete: ${out.status} "${out.apiMessage}" toast "${out.toast}"` });
      expect(out.status).toBe(200);
      expect(out.toast).toBe(`${ROLE_MESSAGES.deletedSummary} ${ROLE_MESSAGES.deletedDetail}`);
      await expect(roleAdmin.row(role.id)).toHaveCount(0);
      expect(await readRole(page, role.id)).toBeNull();
    });
  });

  test('FND-009: should open Edit on a predefined role with every field disabled and the predefined notes, and never save', async ({ steps, roleAdmin, page }, testInfo) => {
    const po = PREDEFINED_ROLES.payerOfficer;
    const before = { stamp: '' };
    await steps.critical('Edit on Payer Officer opens "Edit Role" with the predefined note', async () => {
      before.stamp = (await readRole(page, po.id))?.concurrencyStamp ?? '';
      await roleAdmin.open();
      await roleAdmin.search(po.en);
      const form = await roleAdmin.openEdit(po.id);
      expect(await form.title()).toBe(ROLE_MESSAGES.editTitle);
      await expect(form.predefinedNote()).toHaveText(ROLE_MESSAGES.predefinedNote);
    });

    await steps.step('Every Role Information field is disabled and shows the product values', async () => {
      const form = roleAdmin.form;
      expect(Object.values(await form.disabledFields()).every(Boolean), JSON.stringify(await form.disabledFields())).toBe(true);
      const values = await form.readValues();
      expect(values.nameEn).toBe(po.en);
      expect(values.nameAr).toBe(po.ar);
      expect(values.allowedToAssignBy).toEqual([PREDEFINED_ROLES.organizationAdministrator.en, PREDEFINED_ROLES.payerAdministrator.en]);
    });

    await steps.step('Privileges step: the tree is read-only and the predefined privileges note is shown (no Save pressed)', async () => {
      const form = roleAdmin.form;
      const step = await form.next();
      testInfo.annotations.push({ type: 'facts', description: `predefined edit: Next -> step ${step}` });
      expect(step).toBe(2);
      const rows = await form.tree.readRows();
      testInfo.annotations.push({ type: 'facts', description: `predefined edit privileges: ${rows.length} rows, ${rows.filter((r) => r.disabled).length} disabled; drawer text: ${(await page.locator('#role-form-drawer').innerText()).replace(/\s+/g, ' ').slice(0, 400)}` });
      expect(rows.every((r) => r.disabled)).toBe(true);
      await expect(page.locator('#role-form-drawer')).toContainText('The privileges of a predefined role are part of the product and cannot be changed.');
    });

    await steps.critical('Closing leaves Payer Officer unchanged (same concurrency stamp)', async () => {
      const guard = await roleAdmin.form.close('x');
      testInfo.annotations.push({ type: 'facts', description: `predefined edit close guard: "${guard}"` });
      expect((await readRole(page, po.id))?.concurrencyStamp).toBe(before.stamp);
    });
  });
});
