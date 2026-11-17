import { test, expect } from '../../../fixtures';
import { readRole, rolePermissionKeys } from '../../../utils/role/roleApi';
import {
  arabicNameFrom,
  collapsedBranches,
  describeErrors,
  describeRows,
  fieldErrors,
  noFieldErrors,
  rowsBelowTop,
  rowsOutsideSearch,
  shows,
  treeControls,
} from '../../../utils/role/writerBHelpers';
import { ASSIGNER, CASES, QUOTES, SAMPLE_PRIVILEGE, STORY } from '../../../data/role/createRole.data';
import { ROLE_MESSAGES } from '../../../data/role/common.data';

/**
 * User story 21288: Create Role - the successful Add Role path (with and without descriptions), the Privileges
 * step banner and the tree's Search / Expand all / Collapse all. Every role saved here is a stamped suite role
 * (`suiteRoles.watch()` + adopt -> deleted at teardown).
 */
test.describe(`US ${STORY.id} - ${STORY.title}`, () => {
  test(`TC-${CASES.createSuccess.azureId}: should create the role and show "Role created" when every required field and one privilege are given`, async ({ page, steps, suiteRoles, roleAdmin }) => {
    const d = CASES.createSuccess;
    const nameEn = suiteRoles.newName(d.label);
    const nameAr = arabicNameFrom(d.arabicStem);

    await steps.critical('Navigate to the Role Management module - the module home page is displayed', async () => {
      await suiteRoles.watch();
      const answer = await roleAdmin.open();
      expect(answer.status, 'GetRoles behind the Role Administration list').toBe(200);
    });

    await steps.critical('Select Add Role - the Add New Role panel opens showing the Role Information step', async () => {
      const form = await roleAdmin.openAdd();
      expect(await form.title()).toBe(ROLE_MESSAGES.addTitle);
      expect(await form.currentStep(), 'the step the panel opens on').toBe(1);
      await expect(form.field('englishName')).toBeVisible();
    });

    await steps.critical('Enter both role names, an English and Arabic description and one role in Allowed To Assign By - all mandatory fields are filled and accepted', async () => {
      const form = roleAdmin.form;
      await form.fill({ nameEn, nameAr, descriptionEn: d.descriptionEn, descriptionAr: d.descriptionAr, allowedToAssignBy: [ASSIGNER.en] });
      expect(await form.readValues()).toEqual({ nameEn, nameAr, descriptionEn: d.descriptionEn, descriptionAr: d.descriptionAr, allowedToAssignBy: [ASSIGNER.en], isActive: true, hasAssignedPayers: false, canApproveOwnRequests: false });
      const errors = await fieldErrors(form);
      expect(noFieldErrors(errors), `field errors shown: ${describeErrors(errors)}`).toBe(true);
    });

    await steps.critical('Proceed to the Privileges step - the permission tree, Search, Expand all, Collapse all and the English / Arabic name banner are displayed', async () => {
      const form = roleAdmin.form;
      expect(await form.next(), 'the step reached by Next').toBe(2);
      const controls = treeControls(page);
      await expect(controls.search, 'the tree Search box').toBeVisible();
      await expect(controls.expandAll, 'Expand all').toBeVisible();
      await expect(controls.collapseAll, 'Collapse all').toBeVisible();
      expect((await form.tree.readRows()).length, 'rows of the permission tree').toBeGreaterThan(0);
      const banner = await form.banner();
      expect(banner, 'the banner shows the English name').toContain(nameEn);
      expect(banner, 'the banner shows the Arabic name').toContain(nameAr);
    });

    await steps.step(`Select at least one privilege and Save - the system displays "${QUOTES.created}"`, async () => {
      const form = roleAdmin.form;
      await form.tree.tick(SAMPLE_PRIVILEGE);
      const out = await form.save();
      const seen = `CreateRole ${out.status ?? 'not sent'} "${out.apiMessage}"; toast "${out.toast || 'none'}"; drawer ${out.closed ? 'closed' : 'open'}`;
      expect(shows(out.toast, QUOTES.created), `the toast after Save (${seen})`).toBe(true);
      expect(out.closed, `the panel after Save (${seen})`).toBe(true);
      const id = await suiteRoles.adopt(nameEn);
      const record = await readRole(page, id);
      expect({ name: record?.name, arabicName: record?.arabicName, isActive: record?.isActive }, 'the created role (GetRole)').toEqual({ name: nameEn, arabicName: nameAr, isActive: true });
      expect(await rolePermissionKeys(page, id), 'the privileges the role was created with').toEqual([SAMPLE_PRIVILEGE]);
    });
  });

  test(`TC-${CASES.noDescriptions.azureId}: should create the role when both descriptions are left blank`, async ({ page, steps, suiteRoles, roleAdmin }) => {
    const d = CASES.noDescriptions;
    const nameEn = suiteRoles.newName(d.label);
    const nameAr = arabicNameFrom(d.arabicStem);

    await steps.critical('Navigate to the Role Management module - the module home page is displayed', async () => {
      await suiteRoles.watch();
      const answer = await roleAdmin.open();
      expect(answer.status, 'GetRoles behind the Role Administration list').toBe(200);
    });

    await steps.critical('Select Add Role, enter unique English and Arabic names, one role in Allowed To Assign By and leave both descriptions blank - all mandatory fields are satisfied', async () => {
      const form = await roleAdmin.openAdd();
      await form.fill({ nameEn, nameAr, allowedToAssignBy: [ASSIGNER.en] });
      const values = await form.readValues();
      expect({ nameEn: values.nameEn, nameAr: values.nameAr, descriptionEn: values.descriptionEn, descriptionAr: values.descriptionAr, allowedToAssignBy: values.allowedToAssignBy }).toEqual({ nameEn, nameAr, descriptionEn: '', descriptionAr: '', allowedToAssignBy: [ASSIGNER.en] });
      const errors = await fieldErrors(form);
      expect(noFieldErrors(errors), `field errors shown: ${describeErrors(errors)}`).toBe(true);
    });

    await steps.step(`Proceed to Privileges, select at least one privilege and Save - the system displays "${QUOTES.created}"`, async () => {
      const form = roleAdmin.form;
      await form.nextToPrivileges();
      await form.tree.tick(SAMPLE_PRIVILEGE);
      const out = await form.save();
      const seen = `CreateRole ${out.status ?? 'not sent'} "${out.apiMessage}"; toast "${out.toast || 'none'}"; drawer ${out.closed ? 'closed' : 'open'}`;
      expect(shows(out.toast, QUOTES.created), `the toast after Save (${seen})`).toBe(true);
      const id = await suiteRoles.adopt(nameEn);
      const record = await readRole(page, id);
      expect({ englishDescription: record?.englishDescription ?? '', arabicDescription: record?.arabicDescription ?? '' }, 'the stored descriptions').toEqual({ englishDescription: '', arabicDescription: '' });
    });
  });

  test(`TC-${CASES.banner.azureId}: should show both role names on the Privileges step banner`, async ({ page, steps, suiteRoles, roleAdmin }) => {
    const d = CASES.banner;
    const nameEn = suiteRoles.newName(d.label);
    const nameAr = arabicNameFrom(d.arabicStem);

    await steps.critical('Navigate to the Role Management module - the module home page is displayed', async () => {
      await suiteRoles.watch();
      const answer = await roleAdmin.open();
      expect(answer.status, 'GetRoles behind the Role Administration list').toBe(200);
    });

    await steps.critical(`Select Add Role, enter "${d.label}" / "${d.arabicStem}" and proceed to Privileges - the Privileges step opens`, async () => {
      const form = await roleAdmin.openAdd();
      await form.fill({ nameEn, nameAr, allowedToAssignBy: [ASSIGNER.en] });
      expect(await form.next(), 'the step reached by Next').toBe(2);
      await expect(treeControls(page).search, 'the tree Search box').toBeVisible();
    });

    await steps.step('Review the banner at the top of the Privileges step - it displays both the English and the Arabic name', async () => {
      const banner = await roleAdmin.form.banner();
      expect(banner, 'the banner shows the English name').toContain(nameEn);
      expect(banner, 'the banner shows the Arabic name').toContain(nameAr);
    });
  });

  test(`TC-${CASES.treeControls.azureId}: should expand, collapse and filter the privilege tree with Expand all, Collapse all and Search`, async ({ page, steps, suiteRoles, roleAdmin }) => {
    const d = CASES.treeControls;
    const full = { rows: 0, keys: 0 };

    await steps.critical('Navigate to the Role Management module - the module home page is displayed', async () => {
      await suiteRoles.watch();
      const answer = await roleAdmin.open();
      expect(answer.status, 'GetRoles behind the Role Administration list').toBe(200);
      full.keys = (await suiteRoles.catalogue()).byKey.size;
    });

    await steps.step('Select Add Role, complete Role Information and proceed to Privileges - the tree loads collapsed with Search, Expand all and Collapse all visible', async () => {
      const form = await roleAdmin.openAdd();
      await form.fill({ nameEn: suiteRoles.newName(d.label), nameAr: suiteRoles.newArabicName(), allowedToAssignBy: [ASSIGNER.en] });
      await form.nextToPrivileges();
      const controls = treeControls(page);
      await expect(controls.search).toBeVisible();
      await expect(controls.expandAll).toBeVisible();
      await expect(controls.collapseAll).toBeVisible();
      const open = rowsBelowTop(await form.tree.readRows());
      expect(open.length, `the tree opened EXPANDED, not collapsed - rows shown below the top-level modules (first: ${describeRows(open.filter((r) => !r.count), 4)})`).toBe(0);
    });

    await steps.step('Select Expand all - every node and privilege of the tree is displayed expanded', async () => {
      const tree = roleAdmin.form.tree;
      await tree.expandAll();
      const rows = await tree.readRows();
      full.rows = rows.length;
      const closed = collapsedBranches(rows);
      expect(closed.length, `branches still collapsed: ${describeRows(closed)}`).toBe(0);
      expect((await tree.rowsByKey()).size, `catalogue nodes rendered after Expand all (${rows.length} rows)`).toBe(full.keys);
    });

    await steps.step('Select Collapse all - the tree collapses back to its top-level nodes', async () => {
      const tree = roleAdmin.form.tree;
      await tree.collapseAll();
      const rows = await tree.readRows();
      const open = rowsBelowTop(rows);
      expect(open.length, `rows below the top level after Collapse all: ${describeRows(open)}`).toBe(0);
      expect(rows.length, 'top-level nodes').toBeGreaterThan(0);
    });

    await steps.step(`Enter "${d.keyword}" in Search - the tree filters to show only matching nodes / privileges`, async () => {
      const tree = roleAdmin.form.tree;
      await tree.search(d.keyword);
      const rows = await tree.readRows();
      expect(rows.filter((r) => d.keywordPattern.test(r.label)).length, `rows matching "${d.keyword}"`).toBeGreaterThan(0);
      const others = rowsOutsideSearch(rows, d.keywordPattern);
      expect(others.length, `rows left that neither match "${d.keyword}" nor lead to a match: ${describeRows(others)}`).toBe(0);
      expect(rows.length, `rows shown by the search (the expanded tree has ${full.rows})`).toBeLessThan(full.rows);
    });
  });
});
