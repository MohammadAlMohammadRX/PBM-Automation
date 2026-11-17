import { test, expect } from '../../../fixtures';
import type { TestSteps } from '../../../fixtures/testStatus.fixture';
import type { RoleAdministrationPage } from '../../../pages/role/RoleAdministrationPage';
import { UserListPage } from '../../../pages/user/UserListPage';
import { InvitationListPage } from '../../../pages/user/InvitationListPage';
import { allRoles, assignableRoles, expectedHeadingCount, moduleKeys, rolePermissionKeys } from '../../../utils/role/roleApi';
import {
  addUserToRolesStep,
  alternatingStates,
  countText,
  describeRows,
  discardUserDrawer,
  duplicateKeys,
  duplicateLabels,
  openAddPrivileges,
  openEditPrivileges,
  rowsUnderHeading,
  searchPrivilegesInArabic,
  toggleRepeatedly,
} from '../../../utils/role/writerDHelpers';
import { ROLE_MESSAGES } from '../../../data/role/common.data';
import {
  AVAILABLE_ROLE_RIGHT,
  CASES,
  COMBINED,
  EXAMPLE_HEADINGS,
  MODULE,
  PAYERS_SINGLE_PICK,
  PAYERS_TOTAL_TC,
  ROLE_LABEL,
  TC_LABEL,
  TC_PICKS,
  TC_PICK_COUNT,
  TREE_SEARCH,
} from '../../../data/role/assignPrivilegesToARole.data';
import { permissionToggleId } from '../../../constants/role/roleIds';

/** Azure step 1 of every case: Role Administration as careconnect. */
async function openModule(steps: TestSteps, roleAdmin: RoleAdministrationPage, expected = 'the Role Management list page loads'): Promise<void> {
  await steps.critical(`Navigate to the Role Management module - ${expected}`, async () => {
    const answer = await roleAdmin.open();
    expect(answer.status, 'GetRoles answered').toBe(200);
    expect((await roleAdmin.rowIds()).length, 'role rows listed').toBeGreaterThan(0);
  });
}

/**
 * User story 21283: Assign Privileges to a Role - the permission tree of the Add / Edit drawer (careconnect, on the
 * suite's own roles). See data/role/assignPrivilegesToARole.data.ts for the lead defaults applied.
 */
test.describe('US 21283 - Assign Privileges to a Role', () => {
  test(`TC-${CASES.multiModuleRole.azureId}: should create a role whose privileges span Payers and Networks when permissions of both modules are ticked`, async ({ steps, roleAdmin, suiteRoles, page }) => {
    const made = { nameEn: '' };
    await openModule(steps, roleAdmin, 'the Role Management list page loads showing existing roles');

    await steps.critical('Click "Add Role" and enter a unique role name on the details step - the Privileges step opens showing the full permission tree grouped by module', async () => {
      made.nameEn = (await openAddPrivileges(roleAdmin, suiteRoles, ROLE_LABEL.multiModule)).nameEn;
      const catalogue = await suiteRoles.catalogue();
      const headings = (await roleAdmin.form.tree.readHeadings()).map((h) => h.label);
      expect(headings, 'one heading per catalogue module').toHaveLength(catalogue.modules.length);
      expect(headings).toEqual(expect.arrayContaining([...EXAMPLE_HEADINGS]));
    });

    await steps.step(`Expand the Payers module and select "${TC_LABEL.addPayer}" and "${TC_LABEL.viewPayer}" - the Payers heading updates to show ${TC_PICK_COUNT.payers} selected permissions`, async () => {
      const tree = roleAdmin.form.tree;
      await tree.setExpanded(MODULE.payers, true);
      for (const key of TC_PICKS.payers) await tree.tick(key);
      expect((await tree.countOf(MODULE.payers)).selected, `the Payers heading reads ${await countText(tree, MODULE.payers)}`).toBe(TC_PICK_COUNT.payers);
      const labels = (await rowsUnderHeading(tree, MODULE.payers)).map((r) => r.label);
      expect(labels, `the Payers branch lists: ${labels.join(', ')}`).toEqual(expect.arrayContaining([TC_LABEL.addPayer, TC_LABEL.viewPayer]));
    });

    await steps.step(`Expand the Networks module and select "${TC_LABEL.viewNetwork}" - the Networks heading updates to show ${TC_PICK_COUNT.networks} selected permission`, async () => {
      const tree = roleAdmin.form.tree;
      await tree.setExpanded(MODULE.networks, true);
      for (const key of TC_PICKS.networks) await tree.tick(key);
      expect((await tree.countOf(MODULE.networks)).selected, `the Networks heading reads ${await countText(tree, MODULE.networks)}`).toBe(TC_PICK_COUNT.networks);
      const labels = (await rowsUnderHeading(tree, MODULE.networks)).map((r) => r.label);
      expect(labels, `the Networks branch lists: ${labels.join(', ')}`).toContain(TC_LABEL.viewNetwork);
    });

    await steps.step('Proceed to save the role - "Role created" is shown, the role holds privileges of both modules and is available for assignment', async () => {
      const out = await roleAdmin.form.save();
      expect(out.status, `CreateRole: ${out.apiMessage}`).toBe(200);
      expect(out.toast).toContain(ROLE_MESSAGES.createdSummary);
      const id = await suiteRoles.adopt(made.nameEn);
      const keys = await rolePermissionKeys(page, id);
      expect(keys).toEqual(expect.arrayContaining([...TC_PICKS.payers, ...TC_PICKS.networks]));
      expect((await assignableRoles(page)).items.map((r) => r.name), 'GetAssignableRoles offers the new role').toContain(made.nameEn);
    });
  });

  test(`TC-${CASES.noPrivilegeRefused.azureId}: should refuse to save a role and stay on Privileges when no privilege is selected`, async ({ steps, roleAdmin, suiteRoles, page }) => {
    const made = { nameEn: '' };
    await openModule(steps, roleAdmin);

    await steps.critical('Click "Add Role" and enter a valid role name - the Privileges step opens with every permission unselected', async () => {
      made.nameEn = (await openAddPrivileges(roleAdmin, suiteRoles, ROLE_LABEL.empty)).nameEn;
      const rows = await roleAdmin.form.tree.readRows();
      expect(rows.filter((r) => r.state !== 'unchecked').map((r) => r.label), 'rows not unselected').toEqual([]);
    });

    await steps.step(`Leave all permissions unchecked and click Save - "${ROLE_MESSAGES.selectAtLeastOnePrivilege}" is shown, the Privileges step stays open and the role is not saved`, async () => {
      const out = await roleAdmin.form.save();
      expect(out.status, 'no CreateRole request is sent').toBeNull();
      await expect(roleAdmin.form.tree.message(ROLE_MESSAGES.selectAtLeastOnePrivilege)).toBeVisible();
      expect(await roleAdmin.form.currentStep()).toBe(2);
      expect((await allRoles(page)).some((r) => r.name === made.nameEn), 'a role with that name is listed').toBe(false);
    });
  });

  test(`TC-${CASES.headingCountBoundaries.azureId}: should show 0/24, 1/24, 24/24 and 23/24 on the Payers heading when none, one, all and all but one are selected`, async ({ steps, roleAdmin, suiteRoles }) => {
    await openModule(steps, roleAdmin);

    await steps.critical(`Open Add Role and go to the Privileges step, locate the Payers module - the heading shows "0/${PAYERS_TOTAL_TC}" and is empty`, async () => {
      await openAddPrivileges(roleAdmin, suiteRoles, ROLE_LABEL.boundaries);
      const tree = roleAdmin.form.tree;
      expect(await tree.stateOf(MODULE.payers)).toBe('unchecked');
      expect((await tree.countOf(MODULE.payers)).selected).toBe(0);
      expect(await countText(tree, MODULE.payers)).toBe(`0/${PAYERS_TOTAL_TC}`);
    });

    await steps.step(`Select 1 permission under Payers - the heading updates to "1/${PAYERS_TOTAL_TC}" and appears half-filled`, async () => {
      const tree = roleAdmin.form.tree;
      await tree.tick(PAYERS_SINGLE_PICK);
      expect(await tree.stateOf(MODULE.payers)).toBe('partial');
      expect((await tree.countOf(MODULE.payers)).selected).toBe(1);
      expect(await countText(tree, MODULE.payers)).toBe(`1/${PAYERS_TOTAL_TC}`);
    });

    await steps.step(`Select all remaining permissions under Payers - the heading updates to "${PAYERS_TOTAL_TC}/${PAYERS_TOTAL_TC}" and appears fully checked`, async () => {
      const tree = roleAdmin.form.tree;
      await tree.tick(MODULE.payers);
      const count = await tree.countOf(MODULE.payers);
      expect(await tree.stateOf(MODULE.payers)).toBe('checked');
      expect(count.selected, 'every Payers permission selected').toBe(count.total);
      expect(await countText(tree, MODULE.payers)).toBe(`${PAYERS_TOTAL_TC}/${PAYERS_TOTAL_TC}`);
    });

    await steps.step(`Clear one permission - the heading reverts to "${PAYERS_TOTAL_TC - 1}/${PAYERS_TOTAL_TC}" and appears half-filled`, async () => {
      const tree = roleAdmin.form.tree;
      await tree.untick(PAYERS_SINGLE_PICK);
      const count = await tree.countOf(MODULE.payers);
      expect(await tree.stateOf(MODULE.payers)).toBe('partial');
      expect(count.selected, 'all but one selected').toBe(count.total - 1);
      expect(await countText(tree, MODULE.payers)).toBe(`${PAYERS_TOTAL_TC - 1}/${PAYERS_TOTAL_TC}`);
    });
  });

  test(`TC-${CASES.clearHeading.azureId}: should clear every Plans permission in one action when the full Plans heading is clicked in Edit Role`, async ({ steps, roleAdmin, suiteRoles }) => {
    const role = { id: '', name: '', total: 0 };
    await steps.critical('Precondition: a suite role exists with every Plans permission selected', async () => {
      const catalogue = await suiteRoles.catalogue();
      const made = await suiteRoles.create({ label: ROLE_LABEL.clear, rights: moduleKeys(catalogue, MODULE.plans) });
      role.id = made.id;
      role.name = made.name;
      role.total = expectedHeadingCount(catalogue, MODULE.plans, []).total;
      expect(role.total).toBeGreaterThan(0);
    });
    await openModule(steps, roleAdmin);

    await steps.critical('Open Edit Role for the role with all Plans permissions selected - the heading shows fully checked at N/N', async () => {
      const form = await openEditPrivileges(roleAdmin, role);
      expect(await form.tree.stateOf(MODULE.plans)).toBe('checked');
      expect(await form.tree.countOf(MODULE.plans)).toEqual({ selected: role.total, total: role.total });
    });

    await steps.step('Click the Plans module heading checkbox to clear it - every individual Plans permission becomes unchecked and the heading shows 0/N, empty', async () => {
      const tree = roleAdmin.form.tree;
      await tree.untick(MODULE.plans);
      expect(await tree.countOf(MODULE.plans)).toEqual({ selected: 0, total: role.total });
      expect(await tree.stateOf(MODULE.plans)).toBe('unchecked');
      const catalogue = await suiteRoles.catalogue();
      const rows = await tree.rowsByKey();
      const stillTicked = moduleKeys(catalogue, MODULE.plans, false).filter((k) => rows.get(k)?.state !== 'unchecked');
      expect(stillTicked, 'Plans permissions not cleared').toEqual([]);
      await roleAdmin.form.close('x');
    });
  });

  test(`TC-${CASES.selectHeading.azureId}: should select every Plans permission in one action when the empty Plans heading is clicked`, async ({ steps, roleAdmin, suiteRoles }) => {
    const plans = { total: 0 };
    await openModule(steps, roleAdmin);

    await steps.critical('Open Add Role Privileges step and locate the Plans module - the heading checkbox is empty, showing 0/N', async () => {
      await openAddPrivileges(roleAdmin, suiteRoles, ROLE_LABEL.select);
      plans.total = expectedHeadingCount(await suiteRoles.catalogue(), MODULE.plans, []).total;
      expect(await roleAdmin.form.tree.stateOf(MODULE.plans)).toBe('unchecked');
      expect(await roleAdmin.form.tree.countOf(MODULE.plans)).toEqual({ selected: 0, total: plans.total });
    });

    await steps.step('Click the Plans module heading checkbox - every individual permission under Plans becomes selected and the heading shows N/N, fully checked', async () => {
      const tree = roleAdmin.form.tree;
      await tree.tick(MODULE.plans);
      expect(await tree.countOf(MODULE.plans)).toEqual({ selected: plans.total, total: plans.total });
      expect(await tree.stateOf(MODULE.plans)).toBe('checked');
      const rows = await tree.rowsByKey();
      const notTicked = moduleKeys(await suiteRoles.catalogue(), MODULE.plans, false).filter((k) => rows.get(k)?.state !== 'checked');
      expect(notTicked, 'Plans permissions not selected').toEqual([]);
      await roleAdmin.form.close('x');
    });
  });

  test(`TC-${CASES.noDuplicatePermission.azureId}: should list each Payers action exactly once when the Payers module is expanded and searched`, async ({ steps, roleAdmin, suiteRoles }) => {
    await openModule(steps, roleAdmin);

    await steps.step(`Open Add Role Privileges step and expand the Payers module - the "${TC_LABEL.addPayer}" action is listed exactly once`, async () => {
      await openAddPrivileges(roleAdmin, suiteRoles, ROLE_LABEL.duplicates);
      await roleAdmin.form.tree.setExpanded(MODULE.payers, true);
      const labels = (await rowsUnderHeading(roleAdmin.form.tree, MODULE.payers)).map((r) => r.label);
      expect(labels.filter((l) => l === TC_LABEL.addPayer), `the Payers branch lists: ${labels.join(', ')}`).toHaveLength(1);
    });

    await steps.step(`Search the tree for any additional "${TC_LABEL.addPayer}" entry within the Payers module - no duplicate permission entry is found`, async () => {
      const tree = roleAdmin.form.tree;
      await tree.search(TREE_SEARCH.english);
      const found = (await tree.readRows()).filter((r) => r.label === TC_LABEL.addPayer);
      expect(found.length, `"${TC_LABEL.addPayer}" rows found by the search`).toBeLessThanOrEqual(1);
      await tree.clearSearch();
      const rows = await rowsUnderHeading(tree, MODULE.payers);
      expect(duplicateLabels(rows), 'labels listed twice under Payers').toEqual([]);
      expect(duplicateKeys(await suiteRoles.catalogue()), 'permission keys listed twice in the catalogue').toEqual([]);
    });
  });

  test(`TC-${CASES.searchEnglish.azureId}: should filter the tree to the Payers branch, expanded, when "Add Payer" is searched in English`, async ({ steps, roleAdmin, suiteRoles }) => {
    await openModule(steps, roleAdmin);

    await steps.step(`Open the Privileges step and type "${TREE_SEARCH.english}" into the search box - the tree filters to the matching branch with the Payers module automatically expanded`, async () => {
      await openAddPrivileges(roleAdmin, suiteRoles, ROLE_LABEL.search);
      const tree = roleAdmin.form.tree;
      await tree.search(TREE_SEARCH.english);
      const rows = await tree.readRows();
      const noMatch = await tree.message(ROLE_MESSAGES.noPrivilegesMatch).isVisible();
      const shown = describeRows(rows, `"${ROLE_MESSAGES.noPrivilegesMatch}" shown: ${noMatch}`);
      expect(rows.map((r) => r.label), shown).toContain(TC_LABEL.addPayer);
      expect(rows.filter((r) => r.depth === 0).map((r) => r.label), shown).toEqual([MODULE.payers]);
      await expect(roleAdmin.form.tree.searchInput()).toHaveValue(TREE_SEARCH.english);
      expect(await tree.rowInfo(MODULE.payers).then((r) => r.expanded), 'the Payers branch is expanded').toBe(true);
    });
  });

  test(`TC-${CASES.searchArabic.azureId}: should filter the tree to the Payers branch, expanded, when the Arabic name of "Add Payer" is searched`, async ({ steps, roleAdmin, suiteRoles, page }) => {
    await openModule(steps, roleAdmin);

    await steps.step(`Open the Privileges step and type the Arabic equivalent of "Add Payer" ("${TREE_SEARCH.arabic}") into the search box - the tree filters to the matching branch and auto-expands the Payers module`, async () => {
      const result = await searchPrivilegesInArabic(page, roleAdmin, suiteRoles, TREE_SEARCH.arabic);
      const shown = `in the Arabic UI (lang "${result.lang}") the tree showed ${result.rows.length} row(s) [${result.rows.map((r) => r.label).join(', ')}]`;
      expect(result.lang).toBe('ar');
      expect(result.rows.map((r) => r.label), shown).toContain(TREE_SEARCH.arabic);
      expect(result.rows.filter((r) => r.depth === 0), shown).toHaveLength(1);
      expect(result.payersToggleExpanded, `${shown}; the Payers chevron ${permissionToggleId(MODULE.payers)}`).toBe('true');
    });
  });

  test(`TC-${CASES.searchNoMatch.azureId}: should show "No privileges match the search." and no branches when the search matches nothing`, async ({ steps, roleAdmin, suiteRoles }) => {
    await openModule(steps, roleAdmin);

    await steps.step(`Open the Privileges step and type "${TREE_SEARCH.noMatch}" into the search box - the tree shows no branches and no permissions, and "${ROLE_MESSAGES.noPrivilegesMatch}"`, async () => {
      await openAddPrivileges(roleAdmin, suiteRoles, ROLE_LABEL.search);
      const tree = roleAdmin.form.tree;
      await tree.search(TREE_SEARCH.noMatch);
      expect(await tree.readRows()).toEqual([]);
      await expect(tree.message(ROLE_MESSAGES.noPrivilegesMatch)).toBeVisible();
    });
  });

  test(`TC-${CASES.expandCollapseAll.azureId}: should open fully expanded and collapse to the headings and back when Collapse All and Expand All are clicked`, async ({ steps, roleAdmin, suiteRoles }) => {
    await openModule(steps, roleAdmin);

    await steps.critical('Open Add Role Privileges step - the tree is fully expanded by default with every module and permission visible', async () => {
      await openAddPrivileges(roleAdmin, suiteRoles, ROLE_LABEL.expand);
      const catalogue = await suiteRoles.catalogue();
      const rendered = await roleAdmin.form.tree.rowsByKey();
      expect([...catalogue.byKey.keys()].filter((k) => !rendered.has(k)), 'permissions not rendered by default').toEqual([]);
    });

    await steps.step('Click "Collapse All" - all module branches collapse to show only module headings', async () => {
      const tree = roleAdmin.form.tree;
      await tree.collapseAll();
      const rows = await tree.readRows();
      expect(rows.filter((r) => r.depth > 0).map((r) => r.label), 'rows still shown below the headings').toEqual([]);
      expect(rows).toHaveLength((await suiteRoles.catalogue()).modules.length);
    });

    await steps.step('Click "Expand All" - all branches re-expand to show every permission again', async () => {
      const tree = roleAdmin.form.tree;
      await tree.expandAll();
      const catalogue = await suiteRoles.catalogue();
      const rendered = await tree.rowsByKey();
      expect([...catalogue.byKey.keys()].filter((k) => !rendered.has(k)), 'permissions not rendered after Expand All').toEqual([]);
    });
  });

  test(`TC-${CASES.combinedTreeActions.azureId}: should keep selections, counts and expand state accurate when searching, expanding and selecting are combined`, async ({ steps, roleAdmin, suiteRoles }) => {
    await openModule(steps, roleAdmin);

    await steps.step('Open the Privileges step and combine: search a term, clear it, collapse / expand one module, select a few permissions, then search again - selections, counts and expand state stay accurate after each', async () => {
      await openAddPrivileges(roleAdmin, suiteRoles, ROLE_LABEL.combined);
      const tree = roleAdmin.form.tree;
      const catalogue = await suiteRoles.catalogue();
      const total = expectedHeadingCount(catalogue, COMBINED.module, []).total;
      await tree.search(COMBINED.searchTerm);
      expect((await tree.readRows()).length, `rows matching "${COMBINED.searchTerm}"`).toBeGreaterThan(0);
      await tree.clearSearch();
      expect((await tree.rowsByKey()).size, 'every permission rendered after clearing the search').toBe(catalogue.byKey.size);
      await tree.setExpanded(COMBINED.module, false);
      expect(await tree.isRendered(COMBINED.ticks[0]), 'children hidden while collapsed').toBe(false);
      await tree.setExpanded(COMBINED.module, true);
      expect(await tree.isRendered(COMBINED.branch), "the module's branches shown again once expanded").toBe(true);
      await tree.expandAll();
      for (const key of COMBINED.ticks) await tree.tick(key);
      expect(await tree.countOf(COMBINED.module)).toEqual(expectedHeadingCount(catalogue, COMBINED.module, [...COMBINED.ticks]));
      expect(await tree.stateOf(COMBINED.module)).toBe('partial');
      await tree.search(COMBINED.searchAgain);
      expect(await tree.stateOf(COMBINED.ticks[0]), 'the ticked permission found by the search').toBe('checked');
      await tree.clearSearch();
      expect(await tree.countOf(COMBINED.module), 'the count after searching again').toEqual({ selected: COMBINED.ticks.length, total });
      expect(await tree.checkedKeys()).toEqual(expect.arrayContaining([...COMBINED.ticks]));
    });

    await steps.step(`Rapidly toggle a module heading on and off several times (${COMBINED.toggles}) - counts and fill-states update correctly each time`, async () => {
      const tree = roleAdmin.form.tree;
      const total = expectedHeadingCount(await suiteRoles.catalogue(), COMBINED.toggledHeading, []).total;
      const seen = await toggleRepeatedly(tree, COMBINED.toggledHeading, COMBINED.toggles);
      expect(seen).toEqual(alternatingStates(total, COMBINED.toggles));
      expect(await tree.countOf(COMBINED.module), 'the other module kept its selection').toEqual({ selected: COMBINED.ticks.length, total: expectedHeadingCount(await suiteRoles.catalogue(), COMBINED.module, []).total });
      await roleAdmin.form.close('x');
    });
  });

  test(`TC-${CASES.availableAfterSave.azureId}: should offer the new role in Add User and Invite User right after it is saved`, async ({ steps, roleAdmin, suiteRoles, page, newSuiteUserName }) => {
    const made = { nameEn: '' };
    await openModule(steps, roleAdmin);

    await steps.critical('Create a new role, select at least one privilege, and save - the system displays "Role created"', async () => {
      const opened = await openAddPrivileges(roleAdmin, suiteRoles, ROLE_LABEL.available);
      made.nameEn = opened.nameEn;
      await opened.form.tree.tick(AVAILABLE_ROLE_RIGHT);
      const out = await opened.form.save();
      expect(out.status, `CreateRole: ${out.apiMessage}`).toBe(200);
      expect(out.toast).toContain(ROLE_MESSAGES.createdSummary);
      await suiteRoles.adopt(made.nameEn);
    });

    await steps.step('Go to the Add User and the Invite User forms and open the role dropdown - the newly created role appears in the list and can be selected', async () => {
      const users = new UserListPage(page);
      await users.openTable();
      const drawer = await users.openAddForm();
      const reached = await addUserToRolesStep(page, drawer, newSuiteUserName());
      expect(reached.onStep3, 'Add User reached Roles and Privileges').toBe(true);
      await drawer.addRoleCard();
      const userOptions = await drawer.getRoleOptions();
      await discardUserDrawer(drawer);
      expect(userOptions, 'Add User role options').toContain(made.nameEn);

      const invitations = new InvitationListPage(page);
      await invitations.openTable();
      const invite = await invitations.openAddForm();
      const inviteOptions = await invite.getRoleOptions();
      await invite.close();
      expect(inviteOptions, 'Invite User role options').toContain(made.nameEn);
    });
  });
});
