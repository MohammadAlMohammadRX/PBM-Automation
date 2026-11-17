import { test, expect } from '../../../fixtures';
import { ROLE_FILTER } from '../../../constants/role/roleIds';
import { ROLE_MESSAGES, ROLE_STATUS } from '../../../data/role/common.data';
import {
  ADVANCE_DESCRIPTION,
  ADVANCE_FIELD_KEYS,
  ADVANCE_FIELD_LABELS,
  ADVANCE_ROLES,
  ADVANCE_TRY_VALUES,
  CASES,
  EXAMPLE_NAMES,
  NO_MATCH_DESCRIPTION,
  STATUS_ACTIVE,
} from '../../../data/role/searchAndFilterRoles.data';
import type { RoleListResult } from '../../../pages/role/RoleAdministrationPage';
import { advancedFields, createSuiteRoles, groupToken, sameLabel, screenShows, useAdvancedFields, wholeListFor } from '../../../utils/role/writerAHelpers';

/**
 * User story 21287: Search and Filter Roles - "Advance Search for Roles": name + description + status together,
 * Status = Active only, a description that matches nothing, and the panel's exact fields. Results are checked
 * on the whole answer (the screen's own request replayed with 1000 rows). Suite roles only. See the data file.
 */
test.describe('US 21287 - Search and Filter Roles (Advance Search)', () => {
  test(`TC-${CASES.advanceSearchAllThree.azureId}: should list only the roles matching name, description and status entered together`, async ({ steps, suiteRoles, roleAdmin, page }) => {
    const group = groupToken();
    const keyword = groupToken();
    const ids = { full: '' };

    await steps.critical(`Navigate to the Role Management module - the module home page shows the role list (four suite roles: one "... ${EXAMPLE_NAMES.networkOfficer}" matching all criteria, three missing one each)`, async () => {
      const roles = [ADVANCE_ROLES.full, ADVANCE_ROLES.missName, ADVANCE_ROLES.missDescription, ADVANCE_ROLES.missStatus];
      const made = await createSuiteRoles(suiteRoles, roles.map((spec) => ({ label: `${group} ${spec.label}`, descriptionEn: ADVANCE_DESCRIPTION(spec.keyword ? keyword : null), isActive: spec.isActive })));
      ids.full = made[0].id;
      const answer = await roleAdmin.open();
      expect(answer.status, `GetRoles answered ${answer.status}`).toBe(200);
    });

    await steps.step('Open Advance Search - fields for Role name, Description and Status are displayed', async () => {
      await roleAdmin.openFilter();
      const fields = await advancedFields(page);
      await roleAdmin.closeFilter();
      expect(fields.map((f) => f.key), `fields: ${fields.map((f) => `${f.key} "${f.label}"`).join(', ')}`).toEqual([...ADVANCE_FIELD_KEYS]);
    });

    await steps.step(`Enter a role name ("${group} ${EXAMPLE_NAMES.networkOfficer}"), a description keyword and select status ${STATUS_ACTIVE}, then run the search - the list shows only roles matching all three criteria`, async () => {
      const filtered = await roleAdmin.filter({ name: `${group} ${EXAMPLE_NAMES.networkOfficer}`, description: keyword, status: STATUS_ACTIVE });
      const whole = await wholeListFor(page, filtered);
      const screen = await screenShows(roleAdmin, filtered);
      expect({ status: filtered.status, ids: whole.map((r) => r.id), screen: screen.shown }, `the search answered: ${whole.map((r) => r.name).join(' | ') || 'nothing'}`)
        .toEqual({ status: 200, ids: [ids.full], screen: [ids.full] });
    });
  });

  test(`TC-${CASES.activeOnly.azureId}: should list only Active roles when Advance Search Status is Active`, async ({ steps, suiteRoles, roleAdmin, page }) => {
    const inactive = { id: '', name: '' };
    let filtered: RoleListResult | null = null;

    await steps.critical('Navigate to the Role Management module - the module home page shows the role list (an Inactive suite role exists)', async () => {
      const made = await suiteRoles.create({ label: 'inactive filter', isActive: false });
      inactive.id = made.id;
      inactive.name = made.name;
      const answer = await roleAdmin.open();
      expect(answer.status, `GetRoles answered ${answer.status}`).toBe(200);
    });

    await steps.step(`Open Advance Search and set Status to ${STATUS_ACTIVE}, leaving other fields blank, then search - the list refreshes`, async () => {
      filtered = await roleAdmin.filter({ status: STATUS_ACTIVE });
      const screen = await screenShows(roleAdmin, filtered);
      expect({ status: filtered.status, screenIsAnswer: screen.shown.join(',') === screen.expected.join(','), rows: screen.shown.length > 0 }).toEqual({ status: 200, screenIsAnswer: true, rows: true });
    });

    await steps.step(`Review the returned roles - only roles with ${STATUS_ACTIVE} status are listed, no inactive roles appear`, async () => {
      const answer = filtered ?? (await roleAdmin.filter({ status: STATUS_ACTIVE }));
      const whole = await wholeListFor(page, answer);
      const onScreen = await roleAdmin.readRows();
      expect({
        inactiveInResult: whole.filter((r) => !r.isActive).map((r) => r.name),
        inactiveOnScreen: onScreen.filter((r) => r.status !== ROLE_STATUS.active).map((r) => `${r.name} (${r.status})`),
        suiteInactiveListed: whole.some((r) => r.id === inactive.id),
      }, `${whole.length} roles returned`).toEqual({ inactiveInResult: [], inactiveOnScreen: [], suiteInactiveListed: false });
    });
  });

  test(`TC-${CASES.descriptionNoMatch.azureId}: should say "${ROLE_MESSAGES.noRolesFound}" when the Advance Search description matches no role`, async ({ steps, roleAdmin }) => {
    let filtered: RoleListResult | null = null;

    await steps.critical('Navigate to the Role Management module - the module home page shows the role list', async () => {
      const answer = await roleAdmin.open();
      expect({ status: answer.status, rows: answer.totalRows > 0 }).toEqual({ status: 200, rows: true });
    });

    await steps.step(`Open Advance Search, enter "${NO_MATCH_DESCRIPTION}" in Description and leave Role name and Status blank, then search - the search executes`, async () => {
      filtered = await roleAdmin.filter({ description: NO_MATCH_DESCRIPTION });
      expect({ status: filtered.status, total: filtered.totalRows }).toEqual({ status: 200, total: 0 });
    });

    await steps.step(`Review the result area - the message "${ROLE_MESSAGES.noRolesFound}" is displayed`, async () => {
      await expect(roleAdmin.emptyText()).toHaveText(ROLE_MESSAGES.noRolesFound);
      expect((await roleAdmin.rowIds()).length, `the search answered ${filtered?.totalRows ?? '-'} role(s)`).toBe(0);
    });
  });

  test(`TC-${CASES.advanceSearchFields.azureId}: should offer exactly Role name, Description and Status in the Advance Search panel, each usable`, async ({ steps, roleAdmin, page }) => {
    await steps.critical('Navigate to the Role Management module - the module home page shows the role list', async () => {
      const answer = await roleAdmin.open();
      expect(answer.status, `GetRoles answered ${answer.status}`).toBe(200);
    });

    await steps.step('Open Advance Search - the Advance Search panel opens', async () => {
      await roleAdmin.openFilter();
      await expect(roleAdmin.el(ROLE_FILTER.title)).toBeVisible();
    });

    await steps.step(`Check the panel for the presence of ${ADVANCE_FIELD_LABELS.join(', ')} fields - all three fields are present and usable`, async () => {
      const fields = await advancedFields(page);
      const used = await useAdvancedFields(page, ADVANCE_TRY_VALUES);
      await roleAdmin.closeFilter();
      expect({
        keys: fields.map((f) => f.key),
        labels: fields.map((f, i) => sameLabel(f.label, ADVANCE_FIELD_LABELS[i] ?? '')),
        used,
      }, `fields: ${fields.map((f) => `${f.key} "${f.label}"`).join(', ')}`)
        .toEqual({ keys: [...ADVANCE_FIELD_KEYS], labels: ADVANCE_FIELD_LABELS.map(() => true), used: { ...ADVANCE_TRY_VALUES } });
    });
  });
});
