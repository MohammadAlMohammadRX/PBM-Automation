import { test, expect } from '../../../fixtures';
import { attemptOnSuiteRole, readRole, rolePermissionKeys } from '../../../utils/role/roleApi';
import {
  addRoleButton,
  attemptOnListedRole,
  describeAttempt,
  openEditOf,
  predefinedEditOffers,
  sorted,
} from '../../../utils/role/writerBHelpers';
import { CASES, STORY, TITLES } from '../../../data/role/editRole.data';
import { PREDEFINED_ROLES } from '../../../data/role/common.data';

/**
 * User story 21290: Edit Role - who may edit and what an edit reaches: a privilege removed in Edit Role is gone at
 * once for the holder (maalmohammad) of that suite role (22107), a holder without the edit right is offered no Edit
 * and refused by the API (22108, careconnect baseline first), and Edit is hidden for the predefined roles (22112 -
 * READ ONLY: their rows and cards are looked at, nothing is opened or saved; expected to fail while Edit shows).
 */
test.describe(`US ${STORY.id} - ${STORY.title}`, () => {
  test(`TC-${CASES.privilegeChangeImmediate.azureId}: should take a removed privilege away from a signed-in holder of the role at once`, async ({ page, steps, suiteRoles, roleHolder, roleAdmin }) => {
    test.setTimeout(8 * 60_000);
    const d = CASES.privilegeChangeImmediate;
    const role = { id: '', name: '' };

    await steps.critical('Navigate to the Role Management module - the Role Administration screen is displayed (the role is held by a signed-in user, who is offered Add Role)', async () => {
      const made = await roleHolder.becomeSuiteRole({ label: d.label, rights: d.rights });
      Object.assign(role, { id: made.id, name: made.name });
      expect((await roleHolder.permissions()).permissions, 'the holder\'s session holds every right of the role').toEqual(expect.arrayContaining([...d.rights]));
      await roleHolder.roles.open();
      await expect(addRoleButton(roleHolder.roles), `Add Role for the holder while the role grants ${d.rights.join(' + ')} - baseline`).toBeVisible();
      const answer = await roleAdmin.open();
      expect(answer.status, 'GetRoles behind the Role Administration list').toBe(200);
    });

    await steps.critical('Open the role with Edit and proceed to the Privileges step - the current privileges are displayed', async () => {
      const form = await openEditOf(roleAdmin, role);
      expect(await form.title()).toBe(TITLES.edit);
      await form.nextToPrivileges();
      await form.tree.expandAll();
      expect(await form.tree.stateOf(d.removed), `the privilege ${d.removed}`).toBe('checked');
    });

    await steps.critical(`Remove a privilege the role grants (${d.removed}) and save - the role is updated`, async () => {
      const form = roleAdmin.form;
      await form.tree.untick(d.removed);
      const out = await form.save();
      expect(out.status ?? 0, `UpdateRole answered ${out.status ?? 'nothing (not sent)'} "${out.apiMessage}", toast "${out.toast || 'none'}"`).toBeLessThan(300);
      expect(out.closed, 'the panel after Save').toBe(true);
      expect(sorted(await rolePermissionKeys(page, role.id)), 'the role\'s stored privileges').toEqual(sorted(d.kept));
    });

    await steps.step('As the user holding the role, try to use the removed privilege - it is no longer available to that user', async () => {
      const me = await roleHolder.permissions();
      expect(me.permissions, `the holder's session (no new sign-in) still holds ${d.removed}`).not.toContain(d.removed);
      await roleHolder.roles.open();
      await expect(addRoleButton(roleHolder.roles), 'Add Role for the holder after the privilege was removed').toHaveCount(0);
    });
  });

  test(`TC-${CASES.noEditPermission.azureId}: should offer no Edit and refuse UpdateRole to a user without the edit-roles permission`, async ({ page, steps, suiteRoles, roleHolder, roleAdmin }) => {
    test.setTimeout(8 * 60_000);
    const d = CASES.noEditPermission;
    const target = { id: '', name: '', description: '' };

    await steps.critical('Navigate to the Role Management module - the Role Administration screen is displayed or restricted by permission (careconnect is offered Edit first)', async () => {
      const made = await suiteRoles.create({ label: d.targetLabel });
      Object.assign(target, { id: made.id, name: made.name, description: made.record.englishDescription });
      await roleAdmin.open();
      await roleAdmin.search(target.name);
      await expect(roleAdmin.action(target.id, 'edit'), 'Edit for careconnect - baseline').toBeEnabled();
      await roleHolder.becomeSuiteRole({ label: d.holderLabel, rights: d.holderRights });
      expect((await roleHolder.permissions()).permissions, 'the holder\'s session lacks the edit right').not.toContain('Roles.UpdateRole');
    });

    await steps.step('Try the Edit action on a non-predefined role as the unprivileged user - Edit is unavailable or access is denied', async () => {
      const attempt = await attemptOnListedRole(roleHolder.roles, target, 'edit');
      expect(attempt.opened, `the holder's Edit on "${target.name}" (list ${attempt.listShown ? 'shown' : 'refused'}; ${describeAttempt(attempt)})`).toBe(false);
      const update = await attemptOnSuiteRole(page, roleHolder.page, target.id, 'update', suiteRoles.owned);
      expect(update.status, `UpdateRole as the holder answered ${update.status}: ${update.text.slice(0, 160)}`).toBeGreaterThanOrEqual(400);
      expect((await readRole(page, target.id))?.englishDescription, 'the target role\'s description (unchanged)').toBe(target.description);
    });
  });

  test(`TC-${CASES.predefinedEditHidden.azureId}: should hide the Edit action for the predefined roles`, async ({ page, steps, roleAdmin }) => {
    await steps.critical('Navigate to the Role Management module - the Role Administration screen is displayed', async () => {
      const answer = await roleAdmin.open();
      expect(answer.status, 'GetRoles behind the Role Administration list').toBe(200);
    });

    await steps.step('Locate a predefined role in the roles list - the role row is displayed', async () => {
      const po = PREDEFINED_ROLES.payerOfficer;
      const result = await roleAdmin.search(po.en);
      expect(result.items.map((r) => r.name), `roles found for "${po.en}"`).toContain(po.en);
      const id = result.items.find((r) => r.name === po.en)?.id ?? po.id;
      await expect(roleAdmin.row(id), `the ${po.en} row`).toBeVisible();
      await expect(roleAdmin.predefinedBadge(id), 'the predefined badge').toBeVisible();
    });

    await steps.step('Check the actions offered for the predefined roles - Edit is not offered or visible', async () => {
      const offers = await predefinedEditOffers(roleAdmin, page);
      const withEdit = offers.filter((o) => o.table.some((a) => a.startsWith('edit')) || o.card.some((a) => a.startsWith('edit')));
      expect(withEdit.map((o) => o.role), `predefined roles offering Edit: ${offers.map((o) => `${o.role} - table [${o.table.join(', ')}], card [${o.card.join(', ')}]`).join('; ')}`).toEqual([]);
    });
  });
});
