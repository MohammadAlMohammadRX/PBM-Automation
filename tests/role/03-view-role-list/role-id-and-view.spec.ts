import { test, expect } from '../../../fixtures';
import { ROLE_MESSAGES } from '../../../data/role/common.data';
import {
  CASES,
  ROLE_ID_FORMAT,
  UI_CREATE_RIGHT,
  VIEW_DESCRIPTION,
  VIEW_RIGHT_LEAF,
  VIEW_STATUS_LABEL,
  VIEW_STATUS_VALUES,
  VOLLEY_LABELS,
  VOLLEY_SIZE,
} from '../../../data/role/viewRoleList.data';
import {
  createRoleOnScreen,
  groupToken,
  idsShownInRows,
  readViewRole,
  roleIdShownInList,
  viewValue,
} from '../../../utils/role/writerAHelpers';

/**
 * User story 21282: View Role List - the Role ID (generated, unique, shown - asserted literally, decision 6),
 * also under a volley of creations, and View Role's read-only details. Roles created through the screen are
 * adopted by `suiteRoles` (watch() first) and deleted at teardown. See the data file.
 */
test.describe('US 21282 - View Role List (role ID and View)', () => {
  test(`TC-${CASES.roleIdGenerated.azureId}: should give every new role a unique, system-generated role ID`, async ({ steps, suiteRoles, roleAdmin, page }) => {
    const first = { id: '', name: '' };

    await steps.critical('Navigate to the Role Management module - the module loads (the user may create roles)', async () => {
      await suiteRoles.watch();
      const answer = await roleAdmin.open();
      expect(answer.status, `GetRoles answered ${answer.status}`).toBe(200);
    });

    await steps.step('Create a new role and save it - the role is created and assigned a role ID automatically, without manual entry', async () => {
      first.name = suiteRoles.newName('id one');
      const saved = await createRoleOnScreen(roleAdmin, page, { nameEn: first.name, nameAr: suiteRoles.newArabicName(), right: UI_CREATE_RIGHT });
      first.id = await suiteRoles.adopt(first.name);
      const listed = await roleIdShownInList(roleAdmin, first.name, first.id);
      expect({ manualIdField: saved.roleIdFields, generated: ROLE_ID_FORMAT.test(saved.id), sameAsListed: saved.id === first.id, idShown: listed.shown },
        `CreateRole answered ${saved.status} "${saved.apiMessage}" with id "${saved.id}"; the list row reads "${listed.rowText}"`)
        .toEqual({ manualIdField: [], generated: true, sameAsListed: true, idShown: true });
    });

    await steps.step('Create a second new role and save it - the second role receives a different, unique role ID', async () => {
      const name = suiteRoles.newName('id two');
      const saved = await createRoleOnScreen(roleAdmin, page, { nameEn: name, nameAr: suiteRoles.newArabicName(), right: UI_CREATE_RIGHT });
      const id = await suiteRoles.adopt(name);
      const listed = await roleIdShownInList(roleAdmin, name, id);
      expect({ generated: ROLE_ID_FORMAT.test(saved.id), sameAsListed: saved.id === id, different: id !== first.id, idShown: listed.shown },
        `second id "${saved.id}", first id "${first.id}"; the list row reads "${listed.rowText}"`)
        .toEqual({ generated: true, sameAsListed: true, different: true, idShown: true });
    });
  });

  test(`TC-${CASES.viewDetails.azureId}: should show a role's ID, name, description, status and permissions read-only through View`, async ({ steps, suiteRoles, roleAdmin, page }) => {
    const role = { id: '', name: '' };

    await steps.critical('Navigate to the Role Management module - the module loads (a suite role with descriptions and one permission is listed)', async () => {
      const made = await suiteRoles.create({ label: 'view details', descriptionEn: VIEW_DESCRIPTION.en, descriptionAr: VIEW_DESCRIPTION.ar, rights: [VIEW_RIGHT_LEAF] });
      role.id = made.id;
      role.name = made.name;
      await roleAdmin.open();
      const found = await roleAdmin.search(role.name);
      expect(found.items.map((i) => i.id)).toEqual([role.id]);
    });

    await steps.step('Select the View action on a role - a read-only detail view opens showing the role\'s ID, name, description, status and permissions', async () => {
      await roleAdmin.openView(role.id);
      const title = await roleAdmin.view.title();
      const shown = await readViewRole(roleAdmin, page);
      await roleAdmin.view.close();
      const status = viewValue(shown.values, VIEW_STATUS_LABEL);
      expect({
        title,
        roleId: shown.text.includes(role.id),
        name: shown.text.includes(role.name),
        description: shown.text.includes(VIEW_DESCRIPTION.en),
        status: (VIEW_STATUS_VALUES as readonly string[]).includes(status),
        permission: shown.checked.includes(VIEW_RIGHT_LEAF),
        editable: shown.editable,
      }, `View Role rows: ${Object.entries(shown.values).map(([k, v]) => `${k} = ${v}`).join('; ')}; ticked: ${shown.checked.join(', ')}; role ID ${role.id}`)
        .toEqual({ title: ROLE_MESSAGES.viewTitle, roleId: true, name: true, description: true, status: true, permission: true, editable: [] });
    });
  });

  test(`TC-${CASES.roleIdUnderVolley.azureId}: should keep role IDs unique and non-blank when several roles are created in quick succession`, async ({ steps, suiteRoles, roleAdmin }) => {
    const group = groupToken();
    let ids: string[] = [];

    await steps.critical('Navigate to the Role Management module - the module loads (the user may create roles)', async () => {
      await suiteRoles.watch();
      const answer = await roleAdmin.open();
      expect(answer.status, `GetRoles answered ${answer.status}`).toBe(200);
    });

    await steps.step(`Create several roles in quick succession (${VOLLEY_SIZE} at once) - each role is saved and listed`, async () => {
      const made = await Promise.all(VOLLEY_LABELS.map((label) => suiteRoles.create({ label: `${group} ${label}` })));
      ids = made.map((r) => r.id);
      const listed = await roleAdmin.search(group);
      expect({ created: made.length, listed: listed.items.map((i) => i.id).sort() }, `listed: ${listed.items.map((i) => i.name).join(' | ')}`).toEqual({ created: VOLLEY_SIZE, listed: [...ids].sort() });
    });

    await steps.step('Review the role IDs assigned to the new roles - every role ID is unique and none are blank or duplicated', async () => {
      const shown = await idsShownInRows(roleAdmin, ids);
      expect({ unique: new Set(ids).size, blank: ids.filter((id) => !ROLE_ID_FORMAT.test(id)).length, shownOnScreen: shown.length },
        `API ids: ${ids.join(', ')}; ids visible in the rows: ${shown.join(', ') || 'none'}`)
        .toEqual({ unique: VOLLEY_SIZE, blank: 0, shownOnScreen: VOLLEY_SIZE });
    });
  });
});
