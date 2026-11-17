import { test, expect } from '../../../fixtures';
import { readRole, rolePermissionKeys } from '../../../utils/role/roleApi';
import {
  createRoleWithoutAssigner,
  describeErrors,
  fieldErrors,
  noFieldErrors,
  openEditOf,
  sorted,
  stepControls,
  type FormValues,
} from '../../../utils/role/writerBHelpers';
import { CASES, EDIT_ROLE_RIGHTS, PREFILLED_ROLE, STORY, TITLES } from '../../../data/role/editRole.data';

/**
 * User story 21290: Edit Role - careconnect edits suite roles through the row's Edit: the pre-filled panel, a
 * required field completed before Privileges, name + description, Allowed To Assign By, the flags, and Cancel.
 * Every role here is a suite role made in the test (deleted at teardown).
 */
test.describe(`US ${STORY.id} - ${STORY.title}`, () => {
  test(`TC-${CASES.prefilled.azureId}: should open Edit Role on Role Information pre-filled with the role's saved values`, async ({ page, steps, suiteRoles, roleAdmin }) => {
    const role = { id: '', name: '', arabicName: '' };

    await steps.critical('Navigate to the Role Management module - the Role Administration screen is displayed', async () => {
      const made = await suiteRoles.create({ ...PREFILLED_ROLE });
      Object.assign(role, { id: made.id, name: made.name, arabicName: made.arabicName });
      const answer = await roleAdmin.open();
      expect(answer.status, 'GetRoles behind the Role Administration list').toBe(200);
    });

    await steps.critical('Select the non-predefined role and choose Edit - the two-step Edit Role panel opens on the Role Information step', async () => {
      const form = await openEditOf(roleAdmin, role);
      expect(await form.title()).toBe(TITLES.edit);
      const stepper = stepControls(page);
      await expect(stepper.step1Label, 'step 1 of the panel').toHaveText(TITLES.stepInformation);
      await expect(stepper.step2Label, 'step 2 of the panel').toHaveText(TITLES.stepPrivileges);
      expect(await form.currentStep(), 'the step the panel opens on').toBe(1);
    });

    await steps.step('Review the pre-filled fields (names, descriptions, Allowed To Assign By, checkboxes) - every field displays the role\'s saved value', async () => {
      const values = await roleAdmin.form.readValues();
      expect({ ...values, allowedToAssignBy: sorted(values.allowedToAssignBy) }, 'the Edit Role fields vs the saved role').toEqual({
        nameEn: role.name,
        nameAr: role.arabicName,
        descriptionEn: PREFILLED_ROLE.descriptionEn,
        descriptionAr: PREFILLED_ROLE.descriptionAr,
        allowedToAssignBy: sorted(PREFILLED_ROLE.allowedToAssignBy),
        isActive: PREFILLED_ROLE.isActive,
        hasAssignedPayers: PREFILLED_ROLE.hasAssignedPayers,
        canApproveOwnRequests: PREFILLED_ROLE.canApproveOwnRequests,
      });
    });
  });

  test(`TC-${CASES.completeRequiredFields.azureId}: should reach Privileges once the incomplete required field of a saved role is filled`, async ({ page, steps, suiteRoles, roleAdmin }) => {
    const d = CASES.completeRequiredFields;
    const role = { id: '', name: '' };

    await steps.critical('Navigate to the Role Management module - the Role Administration screen is displayed (a role is saved with Allowed To Assign By empty)', async () => {
      const made = await createRoleWithoutAssigner(page, suiteRoles, d.label, d.rights);
      Object.assign(role, { id: made.id, name: made.name });
      expect(made.record.assignableRoleIds, 'Allowed To Assign By of the saved role').toEqual([]);
      const answer = await roleAdmin.open();
      expect(answer.status, 'GetRoles behind the Role Administration list').toBe(200);
    });

    await steps.critical('Open the role with Edit - the Edit Role panel opens on Role Information', async () => {
      const form = await openEditOf(roleAdmin, role);
      expect(await form.title()).toBe(TITLES.edit);
      expect(await form.currentStep(), 'the step the panel opens on').toBe(1);
      expect(await form.readAllowedToAssignBy(), 'Allowed To Assign By (the incomplete required field)').toEqual([]);
    });

    await steps.step('Fill in every required Role Information field - the fields show as valid and complete', async () => {
      const form = roleAdmin.form;
      await form.chooseAllowedToAssignBy([d.assigner]);
      const values = await form.readValues();
      expect([values.nameEn, values.nameAr].every(Boolean), 'both names filled').toBe(true);
      expect(values.allowedToAssignBy, 'Allowed To Assign By').toEqual([d.assigner]);
      await expect.poll(async () => describeErrors(await fieldErrors(form)), { message: 'field errors once every required field is filled' }).toBe('none');
    });

    await steps.step('Proceed to the Privileges step - the panel shows the role\'s privilege checkboxes', async () => {
      const form = roleAdmin.form;
      expect(await form.next(), `the step after Next (field errors: ${describeErrors(await fieldErrors(form))})`).toBe(2);
      await form.tree.expandAll();
      expect(await form.tree.stateOf(d.rights[1]), `the role's privilege ${d.rights[1]}`).toBe('checked');
    });
  });

  test(`TC-${CASES.updateNameAndDescription.azureId}: should save a new name and description and show them in the roles list`, async ({ page, steps, suiteRoles, roleAdmin }) => {
    const d = CASES.updateNameAndDescription;
    const role = { id: '', name: '' };
    const newName = suiteRoles.newName(d.newLabel);

    await steps.critical('Navigate to the Role Management module - the Role Administration screen is displayed', async () => {
      const made = await suiteRoles.create({ label: d.label, rights: EDIT_ROLE_RIGHTS });
      Object.assign(role, { id: made.id, name: made.name });
      const answer = await roleAdmin.open();
      expect(answer.status, 'GetRoles behind the Role Administration list').toBe(200);
    });

    await steps.critical('Open the role with Edit - the Edit Role panel opens pre-filled', async () => {
      const form = await openEditOf(roleAdmin, role);
      expect(await form.title()).toBe(TITLES.edit);
      await expect(form.field('englishName'), 'Role Name (English)').toHaveValue(role.name);
    });

    await steps.step('Update the role name and description with valid values - the fields accept the new values without validation errors', async () => {
      const form = roleAdmin.form;
      await form.fill({ nameEn: newName, descriptionEn: d.descriptionEn });
      await expect(form.field('englishName'), 'Role Name (English)').toHaveValue(newName);
      await expect(form.field('englishDescription'), 'Role Description (English)').toHaveValue(d.descriptionEn);
      const errors = await fieldErrors(form);
      expect(noFieldErrors(errors), `field errors shown: ${describeErrors(errors)}`).toBe(true);
    });

    await steps.step('Save the change - the role is updated and the new name and description display in the roles list', async () => {
      const form = roleAdmin.form;
      await form.nextToPrivileges();
      const out = await form.save();
      expect(out.status ?? 0, `UpdateRole answered ${out.status ?? 'nothing (not sent)'} "${out.apiMessage}", toast "${out.toast || 'none'}"`).toBeLessThan(300);
      expect(out.closed, 'the panel after Save').toBe(true);
      await roleAdmin.search(newName);
      const row = await roleAdmin.readRow(role.id);
      expect({ name: row.name, description: row.description }, 'the role row in the list').toEqual({ name: newName, description: d.descriptionEn });
      const record = await readRole(page, role.id);
      expect({ name: record?.name, description: record?.englishDescription }, 'the stored role (GetRole)').toEqual({ name: newName, description: d.descriptionEn });
    });
  });

  test(`TC-${CASES.allowedToAssignBy.azureId}: should save Allowed To Assign By changed to another valid role`, async ({ page, steps, suiteRoles, roleAdmin }) => {
    const d = CASES.allowedToAssignBy;
    const role = { id: '', name: '' };

    await steps.critical('Navigate to the Role Management module - the Role Administration screen is displayed', async () => {
      const made = await suiteRoles.create({ label: d.label, rights: EDIT_ROLE_RIGHTS, allowedToAssignBy: [d.from.en] });
      Object.assign(role, { id: made.id, name: made.name });
      const answer = await roleAdmin.open();
      expect(answer.status, 'GetRoles behind the Role Administration list').toBe(200);
    });

    await steps.critical('Open the role with Edit - the Edit Role panel opens pre-filled', async () => {
      const form = await openEditOf(roleAdmin, role);
      expect(await form.title()).toBe(TITLES.edit);
      expect(await form.readAllowedToAssignBy(), 'Allowed To Assign By').toEqual([d.from.en]);
    });

    await steps.step(`Change Allowed To Assign By to a different valid role ("${d.to.en}") and save - the change is accepted and saved without validation errors`, async () => {
      const form = roleAdmin.form;
      await form.chooseAllowedToAssignBy([d.to.en]);
      const errors = await fieldErrors(form);
      expect(noFieldErrors(errors), `field errors shown: ${describeErrors(errors)}`).toBe(true);
      await form.nextToPrivileges();
      const out = await form.save();
      expect(out.status ?? 0, `UpdateRole answered ${out.status ?? 'nothing (not sent)'} "${out.apiMessage}", toast "${out.toast || 'none'}"`).toBeLessThan(300);
      const toId = await suiteRoles.idOf(d.to.en);
      expect((await readRole(page, role.id))?.assignableRoleIds, `Allowed To Assign By stored (GetRole) - "${d.to.en}" is ${toId}`).toEqual([toId]);
    });
  });

  test(`TC-${CASES.toggleFlags.azureId}: should save the role's flag checkboxes changed`, async ({ page, steps, suiteRoles, roleAdmin }) => {
    const d = CASES.toggleFlags;
    const role = { id: '', name: '' };

    await steps.critical('Navigate to the Role Management module - the Role Administration screen is displayed', async () => {
      const made = await suiteRoles.create({ label: d.label, rights: EDIT_ROLE_RIGHTS, ...d.before });
      Object.assign(role, { id: made.id, name: made.name });
      const answer = await roleAdmin.open();
      expect(answer.status, 'GetRoles behind the Role Administration list').toBe(200);
    });

    await steps.critical('Open the role with Edit - the Edit Role panel opens pre-filled', async () => {
      const form = await openEditOf(roleAdmin, role);
      expect(await form.title()).toBe(TITLES.edit);
      const values = await form.readValues();
      expect({ isActive: values.isActive, hasAssignedPayers: values.hasAssignedPayers, canApproveOwnRequests: values.canApproveOwnRequests }, 'the flags as saved').toEqual(d.before);
    });

    await steps.step('Toggle the role\'s checkboxes (Is Active?, Has Assigned Payers?, Can a user approve their own requests?) and save - the new checkbox states are accepted and saved', async () => {
      const form = roleAdmin.form;
      await form.fill(d.after);
      await form.nextToPrivileges();
      const out = await form.save();
      expect(out.status ?? 0, `UpdateRole answered ${out.status ?? 'nothing (not sent)'} "${out.apiMessage}", toast "${out.toast || 'none'}", panel ${out.closed ? 'closed' : 'open'}`).toBeLessThan(300);
      const record = await readRole(page, role.id);
      expect({ isActive: record?.isActive, hasAssignedPayers: record?.hasAssignedPayers, canApproveOwnRequests: record?.canApproveOwnRequests }, 'the flags stored (GetRole)').toEqual(d.after);
    });
  });

  test(`TC-${CASES.cancelEdit.azureId}: should leave the role unchanged when an edit is cancelled`, async ({ page, steps, suiteRoles, roleAdmin }) => {
    const d = CASES.cancelEdit;
    const role = { id: '', name: '', stamp: '' };
    const original = { values: null as FormValues | null, checked: [] as string[] };

    await steps.critical('Navigate to the Role Management module - the Role Administration screen is displayed', async () => {
      const made = await suiteRoles.create({ label: d.label, rights: d.rights });
      Object.assign(role, { id: made.id, name: made.name, stamp: made.record.concurrencyStamp });
      const answer = await roleAdmin.open();
      expect(answer.status, 'GetRoles behind the Role Administration list').toBe(200);
    });

    await steps.critical('Open the role with Edit - the Edit Role panel opens pre-filled', async () => {
      const form = await openEditOf(roleAdmin, role);
      expect(await form.title()).toBe(TITLES.edit);
      original.values = await form.readValues();
      expect(original.values.nameEn, 'Role Name (English)').toBe(role.name);
    });

    await steps.step('Modify several fields and privileges, then choose Cancel instead of Save - the panel closes without applying the changes', async () => {
      const form = roleAdmin.form;
      await form.nextToPrivileges();
      await form.tree.expandAll();
      original.checked = sorted(await form.tree.checkedKeys());
      await form.tree.tick(d.tickedThenCancelled);
      await form.back();
      await form.fill({ nameEn: suiteRoles.newName('Cancelled'), ...d.changes });
      await form.close('cancel', 'discard');
      expect(await form.isOpen(), 'the panel after Cancel').toBe(false);
      expect((await readRole(page, role.id))?.concurrencyStamp, 'the role\'s concurrency stamp (unchanged = nothing saved)').toBe(role.stamp);
    });

    await steps.step('Reopen the same role - the original, unmodified details and privileges are displayed', async () => {
      const form = await openEditOf(roleAdmin, role);
      expect(await form.readValues(), 'the reopened Edit Role fields').toEqual(original.values);
      await form.nextToPrivileges();
      await form.tree.expandAll();
      expect(sorted(await form.tree.checkedKeys()), 'the reopened privileges').toEqual(original.checked);
      expect(sorted(await rolePermissionKeys(page, role.id)), 'the stored privileges').toEqual(sorted(d.rights));
      await form.close('x', 'discard');
    });
  });
});
