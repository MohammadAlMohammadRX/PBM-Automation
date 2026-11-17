import { test, expect } from '../../../fixtures';
import {
  changeableControls,
  describeRows,
  editSnapshot,
  enabledRows,
  headingsNot,
  openViewOf,
  rowsNotIn,
  stepControls,
  tryToToggle,
  viewChecked,
  viewGaps,
  viewMoveTo,
  writeButtonsIn,
  type EditSnapshot,
} from '../../../utils/role/writerBHelpers';
import { WRITER_B_IDS } from '../../../constants/role/writerBIds';
import { CASES, FULL_ROLE, STORY, TITLES, VIEW_LABELS, YES_NO } from '../../../data/role/viewRole.data';

/**
 * User story 21289: View Role - careconnect opens View on suite roles: View vs Edit (same information, same
 * privileges), nothing changeable, a role with no privilege and one with every privilege, and the step navigation
 * the TC expects (View is one page today - 22094 / 22099 are expected to fail on what View leaves out).
 */
test.describe(`US ${STORY.id} - ${STORY.title}`, () => {
  test(`TC-${CASES.sameAsEdit.azureId}: should show in View Role the same Role Information and privileges as Edit Role`, async ({ steps, suiteRoles, roleAdmin }) => {
    const role = { id: '', name: '' };
    let edit!: EditSnapshot;
    const view = { checked: [] as string[] };

    await steps.critical('Navigate to the Role Management module - the Role Administration screen lists the roles (the role\'s Edit Role values are read first, for the comparison)', async () => {
      const made = await suiteRoles.create({ ...FULL_ROLE });
      role.id = made.id;
      role.name = made.name;
      const answer = await roleAdmin.open();
      expect(answer.status, 'GetRoles behind the Role Administration list').toBe(200);
      edit = await editSnapshot(roleAdmin, role);
      expect(edit.values.nameEn, 'the role Edit Role opened').toBe(role.name);
    });

    await steps.critical('Select the non-predefined role and choose View - the View Role panel opens showing the Role Information', async () => {
      const drawer = await openViewOf(roleAdmin, role);
      expect(await drawer.title()).toBe(TITLES.view);
      expect((await drawer.values())[VIEW_LABELS.nameEn], 'the Role Name shown').toBe(role.name);
    });

    await steps.step('Review the Role Information fields (names, description, Allowed To Assign By, checkboxes) - the same values Edit Role shows are displayed', async () => {
      const gaps = viewGaps(edit.values, await roleAdmin.view.values(), VIEW_LABELS, YES_NO);
      expect(gaps, `what View Role shows differently from Edit Role: ${gaps.join('; ') || 'nothing'}`).toEqual([]);
    });

    await steps.step('Proceed to the Privileges - the same privileges and categories Edit Role shows are displayed', async () => {
      view.checked = await viewChecked(roleAdmin.view);
      expect(view.checked, 'privileges ticked in View Role vs Edit Role').toEqual(edit.checked);
    });
  });

  test(`TC-${CASES.readOnly.azureId}: should keep every field and privilege of View Role read-only with no Save`, async ({ page, steps, suiteRoles, roleAdmin }) => {
    const d = CASES.readOnly;
    const role = { id: '', name: '' };

    await steps.critical('Navigate to the Role Management module - the Role Administration screen is displayed', async () => {
      const made = await suiteRoles.create({ label: d.label, rights: d.rights, descriptionAr: 'وصف للقراءة فقط' });
      role.id = made.id;
      role.name = made.name;
      const answer = await roleAdmin.open();
      expect(answer.status, 'GetRoles behind the Role Administration list').toBe(200);
    });

    await steps.critical('Open the role with View - the View Role panel opens with Role Information displayed', async () => {
      const drawer = await openViewOf(roleAdmin, role);
      expect(await drawer.title()).toBe(TITLES.view);
      expect((await drawer.values())[VIEW_LABELS.nameEn], 'the Role Name shown').toBe(role.name);
    });

    await steps.step('Try to type into the role name and description fields - they do not accept input and stay read-only', async () => {
      const changeable = await changeableControls(page, WRITER_B_IDS.textInputs);
      expect(changeable, `name / description boxes View Role lets a user type into: ${changeable.join(', ') || 'none'}`).toEqual([]);
    });

    await steps.step('Try to toggle the checkboxes and change Allowed To Assign By - the controls stay disabled', async () => {
      const changeable = await changeableControls(page, WRITER_B_IDS.choiceInputs);
      expect(changeable, `checkboxes / Allowed To Assign By View Role lets a user change: ${changeable.join(', ') || 'none'}`).toEqual([]);
    });

    await steps.step('Go to the Privileges and try to check or uncheck a privilege - the privilege checkboxes stay disabled and unchanged', async () => {
      const tree = roleAdmin.view.tree;
      await tree.expandAll();
      const enabled = enabledRows(await tree.readRows());
      expect(enabled.length, `privilege checkboxes enabled in View Role: ${describeRows(enabled)}`).toBe(0);
      const held = await tryToToggle(page, tree, d.heldLeaf);
      const notHeld = await tryToToggle(page, tree, d.notHeldLeaf);
      expect([held.after, notHeld.after], `states after clicking ${d.heldLeaf} (was ${held.before}) and ${d.notHeldLeaf} (was ${notHeld.before})`).toEqual([held.before, notHeld.before]);
    });

    await steps.step('Look for a Save or Apply control on the panel - none is available', async () => {
      const writers = await writeButtonsIn(roleAdmin.view);
      expect(writers, `save / apply / next buttons in View Role: ${writers.join(', ') || 'none'}`).toEqual([]);
    });
  });

  test(`TC-${CASES.zeroPrivileges.azureId}: should open View Role for a role with no privilege and show nothing selected`, async ({ steps, suiteRoles, roleAdmin }) => {
    const d = CASES.zeroPrivileges;
    const role = { id: '', name: '' };

    await steps.critical('Navigate to the Role Management module - the Role Administration screen is displayed (a role with zero privileges exists)', async () => {
      const made = await suiteRoles.create({ label: d.label, rights: d.rights });
      role.id = made.id;
      role.name = made.name;
      const answer = await roleAdmin.open();
      expect(answer.status, 'GetRoles behind the Role Administration list').toBe(200);
    });

    await steps.critical('Open the zero-privilege role with View - the View Role panel opens showing Role Information', async () => {
      const drawer = await openViewOf(roleAdmin, role);
      expect(await drawer.title()).toBe(TITLES.view);
      expect((await drawer.values())[VIEW_LABELS.nameEn], 'the Role Name shown').toBe(role.name);
    });

    await steps.step('Go to the Privileges - they display with no privilege checkbox selected', async () => {
      const tree = roleAdmin.view.tree;
      await tree.expandAll();
      const rows = await tree.readRows();
      expect(rows.length, 'rows of the permission tree').toBeGreaterThan(0);
      const selected = rowsNotIn(rows, 'unchecked');
      expect(selected.length, `rows shown checked or partial: ${describeRows(selected)}`).toBe(0);
      const counted = headingsNot(rows, 'empty');
      expect(counted.length, `headings counting a selection: ${describeRows(counted)}`).toBe(0);
    });
  });

  test(`TC-${CASES.stepNavigation.azureId}: should move between Role Information and Privileges in View Role and stay read-only in both`, async ({ page, steps, suiteRoles, roleAdmin }) => {
    const d = CASES.stepNavigation;
    const role = { id: '', name: '' };

    await steps.critical('Navigate to the Role Management module - the Role Administration screen is displayed', async () => {
      const made = await suiteRoles.create({ label: d.label, rights: ['Roles.GetRoles', 'Roles.ExportRoles'] });
      role.id = made.id;
      role.name = made.name;
      const answer = await roleAdmin.open();
      expect(answer.status, 'GetRoles behind the Role Administration list').toBe(200);
    });

    await steps.step('Open the role with View - the Role Information step is shown as the initial state', async () => {
      const drawer = await openViewOf(roleAdmin, role);
      expect(await drawer.title()).toBe(TITLES.view);
      expect((await drawer.values())[VIEW_LABELS.nameEn], 'the Role Name shown').toBe(role.name);
      const stepLabels = await stepControls(page).step1Label.allInnerTexts();
      expect(stepLabels.map((t) => t.trim()), `View Role shows a "${TITLES.stepInformation}" step - it showed ${stepLabels.length ? `"${stepLabels.join(' / ')}"` : 'no stepper at all (one page: Role Information and the privilege tree together)'}`).toEqual([TITLES.stepInformation]);
    });

    await steps.step('Navigate forward to the Privileges step - the panel shows the Privileges content in read-only mode', async () => {
      const used = await viewMoveTo(page, 2);
      const enabled = enabledRows(await roleAdmin.view.tree.readRows());
      expect(
        { wayToPrivileges: used !== 'none', enabledCheckboxes: enabled.length },
        `View Role offers a way to the Privileges step (${used === 'none' ? 'none: no stepper, no Next - one page' : used}); privilege checkboxes enabled: ${describeRows(enabled)}`,
      ).toEqual({ wayToPrivileges: true, enabledCheckboxes: 0 });
    });

    await steps.step('Navigate back to the Role Information step - the original read-only Role Information is shown again', async () => {
      const used = await viewMoveTo(page, 1);
      const shownName = (await roleAdmin.view.values())[VIEW_LABELS.nameEn];
      const changeable = await changeableControls(page, [...WRITER_B_IDS.textInputs, ...WRITER_B_IDS.choiceInputs]);
      expect(
        { wayBack: used !== 'none', roleName: shownName, changeable },
        `View Role offers a way back to Role Information (${used === 'none' ? 'none: no stepper, no Back - one page' : used}); controls a user could change: ${changeable.join(', ') || 'none'}`,
      ).toEqual({ wayBack: true, roleName: role.name, changeable: [] });
    });
  });

  test(`TC-${CASES.allPrivileges.azureId}: should open View Role for a role holding every privilege and show every privilege selected`, async ({ steps, suiteRoles, roleAdmin }) => {
    const d = CASES.allPrivileges;
    const role = { id: '', name: '' };

    await steps.critical('Navigate to the Role Management module - the Role Administration screen is displayed (a role with every privilege exists)', async () => {
      const every = [...(await suiteRoles.catalogue()).byKey.keys()];
      const made = await suiteRoles.create({ label: d.label, rights: every });
      role.id = made.id;
      role.name = made.name;
      const answer = await roleAdmin.open();
      expect(answer.status, 'GetRoles behind the Role Administration list').toBe(200);
    });

    await steps.critical('Open the fully-privileged role with View - the View Role panel opens showing Role Information', async () => {
      const drawer = await openViewOf(roleAdmin, role);
      expect(await drawer.title()).toBe(TITLES.view);
      expect((await drawer.values())[VIEW_LABELS.nameEn], 'the Role Name shown').toBe(role.name);
    });

    await steps.step('Go to the Privileges - every available privilege is displayed as selected', async () => {
      const tree = roleAdmin.view.tree;
      await tree.expandAll();
      const rows = await tree.readRows();
      expect(rows.length, 'rows of the permission tree').toBeGreaterThan(0);
      const notFull = headingsNot(rows, 'full');
      expect(notFull.length, `headings not counting every privilege: ${describeRows(notFull)}`).toBe(0);
      const unticked = rowsNotIn(rows, 'checked');
      expect(unticked.length, `rows not shown checked: ${describeRows(unticked)}`).toBe(0);
    });
  });
});
