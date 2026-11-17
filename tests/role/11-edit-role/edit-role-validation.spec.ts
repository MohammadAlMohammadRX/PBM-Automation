import { test, expect } from '../../../fixtures';
import { readRole } from '../../../utils/role/roleApi';
import {
  attemptOverLimitSave,
  closeIfOpen,
  describeProceed,
  openEditOf,
  proceedAndSave,
  proceedRefused,
  proceedText,
  rulesDifferingInEdit,
  shows,
  suiteNameOfLength,
  unusedLetter,
} from '../../../utils/role/writerBHelpers';
import { CASES, EDIT_ROLE_RIGHTS, LIMITS, QUOTES, STORY, TITLES, VALIDATION_RULES } from '../../../data/role/editRole.data';
import { PREDEFINED_ROLES, ROLE_MESSAGES } from '../../../data/role/common.data';
import { QUOTES as CREATE_QUOTES } from '../../../data/role/createRole.data';

/**
 * User story 21290: Edit Role - the name rules in Edit (1 character and the maximum accepted, one more refused, a
 * duplicate refused) and the whole Add Role validation list replayed in Edit (22113). Every role edited is a suite
 * role made in the test, tracked by id - so even the one-letter name of 22104 is deleted at teardown.
 */
test.describe(`US ${STORY.id} - ${STORY.title}`, () => {
  test(`TC-${CASES.nameLengthBounds.azureId}: should save a 1-character and a ${LIMITS.name}-character role name`, async ({ page, steps, suiteRoles, roleAdmin }) => {
    const d = CASES.nameLengthBounds;
    const role = { id: '', name: '' };
    const names = { one: '', max: suiteNameOfLength(suiteRoles, LIMITS.name) };

    await steps.critical('Navigate to the Role Management module - the Role Administration screen is displayed', async () => {
      const made = await suiteRoles.create({ label: d.label, rights: EDIT_ROLE_RIGHTS });
      Object.assign(role, { id: made.id, name: made.name });
      names.one = await unusedLetter(page);
      const answer = await roleAdmin.open();
      expect(answer.status, 'GetRoles behind the Role Administration list').toBe(200);
    });

    await steps.critical('Open the role with Edit - the Edit Role panel opens pre-filled', async () => {
      const form = await openEditOf(roleAdmin, role);
      expect(await form.title()).toBe(TITLES.edit);
      await expect(form.field('englishName'), 'Role Name (English)').toHaveValue(role.name);
    });

    await steps.step('Enter a role name of exactly 1 character and save - the name is accepted and saved', async () => {
      const form = roleAdmin.form;
      await form.fill({ nameEn: names.one });
      const out = await proceedAndSave(page, form);
      expect(out.save?.status ?? 0, `saving the name "${names.one}" (${describeProceed(out)})`).toBeLessThan(300);
      expect(out.save?.status ?? 0, `saving the name "${names.one}" (${describeProceed(out)})`).toBeGreaterThanOrEqual(200);
      expect((await readRole(page, role.id))?.name, 'the stored name (GetRole)').toBe(names.one);
      await closeIfOpen(form);
    });

    await steps.step(`Reopen Edit, enter a role name of exactly ${LIMITS.name} characters and save - the name is accepted and saved`, async () => {
      const current = (await readRole(page, role.id))?.name ?? role.name;
      const form = await openEditOf(roleAdmin, { id: role.id, name: current });
      await form.fill({ nameEn: names.max });
      await expect(form.field('englishName'), `Role Name (English) after typing ${LIMITS.name} characters`).toHaveValue(names.max);
      const out = await proceedAndSave(page, form);
      expect(out.save?.status ?? 0, `saving the ${LIMITS.name}-character name (${describeProceed(out)})`).toBeLessThan(300);
      expect(out.save?.status ?? 0, `saving the ${LIMITS.name}-character name (${describeProceed(out)})`).toBeGreaterThanOrEqual(200);
      expect((await readRole(page, role.id))?.name, 'the stored name (GetRole)').toBe(names.max);
    });
  });

  test(`TC-${CASES.nameTooLong.azureId}: should refuse a role name one character over the maximum with a validation message and save nothing`, async ({ page, steps, suiteRoles, roleAdmin }) => {
    const d = CASES.nameTooLong;
    const role = { id: '', name: '' };
    const tooLong = suiteNameOfLength(suiteRoles, LIMITS.name + 1, d.label);

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

    await steps.step(`Enter a role name ${LIMITS.name + 1} characters long and try to save - a validation message says it is too long and the change is not saved`, async () => {
      const form = roleAdmin.form;
      const attempt = await attemptOverLimitSave(page, form, 'englishName', tooLong);
      expect.soft(attempt.messages.length, `a validation message about the length (${attempt.seen})`).toBeGreaterThan(0);
      expect((await readRole(page, role.id))?.name, `the stored name (GetRole) after the attempt (${attempt.seen})`).toBe(role.name);
      await closeIfOpen(form);
    });
  });

  test(`TC-${CASES.duplicateName.azureId}: should refuse a rename to another role's name and keep the role unchanged`, async ({ page, steps, suiteRoles, roleAdmin }) => {
    const d = CASES.duplicateName;
    const first = { id: '', name: '' };
    const second = { id: '', name: '' };

    await steps.critical('Navigate to the Role Management module - the Role Administration screen is displayed (another role with a known name exists)', async () => {
      const a = await suiteRoles.create({ label: d.firstLabel, rights: EDIT_ROLE_RIGHTS });
      const b = await suiteRoles.create({ label: d.secondLabel, rights: EDIT_ROLE_RIGHTS });
      Object.assign(first, { id: a.id, name: a.name });
      Object.assign(second, { id: b.id, name: b.name });
      const answer = await roleAdmin.open();
      expect(answer.status, 'GetRoles behind the Role Administration list').toBe(200);
    });

    await steps.critical('Open a non-predefined role with Edit - the Edit Role panel opens pre-filled', async () => {
      const form = await openEditOf(roleAdmin, second);
      expect(await form.title()).toBe(TITLES.edit);
      await expect(form.field('englishName'), 'Role Name (English)').toHaveValue(second.name);
    });

    await steps.step('Change the role name to the name of the other existing role and try to save - a validation message says the name already exists and the save is blocked', async () => {
      const form = roleAdmin.form;
      await form.fill({ nameEn: first.name });
      const out = await proceedAndSave(page, form);
      const quote = QUOTES.nameTaken(first.name);
      expect(shows(proceedText(out), quote), `"${quote}" (${describeProceed(out)})`).toBe(true);
      expect(proceedRefused(out), `the save (${describeProceed(out)})`).toBe(true);
      expect((await readRole(page, second.id))?.name, 'the stored name of the edited role (GetRole)').toBe(second.name);
      await closeIfOpen(form);
    });
  });

  test(`TC-${CASES.sameValidations.azureId}: should apply every Add Role validation in Edit Role with the same message and blocking`, async ({ page, steps, suiteRoles, roleAdmin }) => {
    test.setTimeout(12 * 60_000);
    const d = CASES.sameValidations;
    const role = { id: '', name: '' };
    const other = { name: '' };
    const known = [ROLE_MESSAGES.fieldRequired, ROLE_MESSAGES.selectAtLeastOnePrivilege, CREATE_QUOTES.missingInformation];

    await steps.critical('Navigate to the Role Management module - the Role Administration screen is displayed', async () => {
      const made = await suiteRoles.create({ label: d.label, rights: d.rights });
      Object.assign(role, { id: made.id, name: made.name });
      other.name = (await suiteRoles.create({ label: d.otherLabel, rights: d.rights })).name;
      await suiteRoles.watch();
      const answer = await roleAdmin.open();
      expect(answer.status, 'GetRoles behind the Role Administration list').toBe(200);
    });

    await steps.critical('Open a non-predefined role with Edit - the Edit Role panel opens pre-filled', async () => {
      const form = await openEditOf(roleAdmin, role);
      expect(await form.title()).toBe(TITLES.edit);
      await expect(form.field('englishName'), 'Role Name (English)').toHaveValue(role.name);
      await form.close('x', 'discard');
    });

    await steps.step('Trigger each Add Role validation (required fields, format, length, privileges, uniqueness) in Edit Role - each triggers the same message and blocking behaviour as in Add Role', async () => {
      const addBase = () => ({ nameEn: suiteRoles.newName('Validation Add'), nameAr: suiteRoles.newArabicName(), allowedToAssignBy: [PREDEFINED_ROLES.organizationAdministrator.en] });
      const mismatches = await rulesDifferingInEdit(page, roleAdmin, VALIDATION_RULES, addBase, d.rights[1], { role, rights: d.rights }, other.name, known);
      expect(mismatches, `rules Edit Role applies differently from Add Role: ${mismatches.join(' || ') || 'none'}`).toEqual([]);
      expect((await readRole(page, role.id))?.name, 'the edited role kept its name (GetRole)').toBe(role.name);
    });
  });
});
