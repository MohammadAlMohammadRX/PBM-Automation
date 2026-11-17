import { test, expect } from '../../../fixtures';
import { allRoles } from '../../../utils/role/roleApi';
import {
  arabicNameFrom,
  describeErrors,
  describeNext,
  describeRows,
  fieldErrors,
  headingsNot,
  nextAndRead,
  nextShows,
  noFieldErrors,
} from '../../../utils/role/writerBHelpers';
import { ASSIGNER, CASES, QUOTES, STORY } from '../../../data/role/createRole.data';
import { ROLE_MESSAGES } from '../../../data/role/common.data';

/**
 * User story 21288: Create Role - what the Role Information step refuses: a missing Arabic name, both names
 * blank, no role in Allowed To Assign By, and a Save with no privilege. The cases quote "Missing information -
 * Please fill in all required fields before continuing." (lead decision 3: asserted literally - the foundation saw
 * only the field errors, so 22079 / 22084 are expected to fail on that text). Nothing is saved here; a stray save
 * would carry the suite prefix and be deleted at teardown (`suiteRoles.watch()`).
 */
test.describe(`US ${STORY.id} - ${STORY.title}`, () => {
  test(`TC-${CASES.missingArabicName.azureId}: should keep Add Role on Role Information with "Missing information" until the Arabic name is filled`, async ({ page, steps, suiteRoles, roleAdmin }) => {
    const d = CASES.missingArabicName;
    const nameEn = suiteRoles.newName(d.label);

    await steps.critical('Navigate to the Role Management module - the module home page is displayed', async () => {
      await suiteRoles.watch();
      const answer = await roleAdmin.open();
      expect(answer.status, 'GetRoles behind the Role Administration list').toBe(200);
    });

    await steps.critical('Select Add Role - the Add New Role panel opens on the Role Information step', async () => {
      const form = await roleAdmin.openAdd();
      expect(await form.title()).toBe(ROLE_MESSAGES.addTitle);
      expect(await form.currentStep()).toBe(1);
    });

    await steps.step(`Leave Role Name (Arabic) blank, fill all other mandatory fields and try to proceed - navigation is blocked with "${QUOTES.missingInformation}"`, async () => {
      const form = roleAdmin.form;
      await form.fill({ nameEn, nameAr: '', allowedToAssignBy: [ASSIGNER.en] });
      const out = await nextAndRead(page, form);
      expect(out.step, `the step after Next (${describeNext(out)})`).toBe(1);
      expect(nextShows(out, QUOTES.missingInformation), `"${QUOTES.missingInformation}" (${describeNext(out)})`).toBe(true);
    });

    await steps.step('Fill in Role Name (Arabic) and try to proceed again - the Privileges step opens', async () => {
      const form = roleAdmin.form;
      await form.fill({ nameAr: arabicNameFrom(d.arabicStem) });
      const out = await nextAndRead(page, form);
      expect(out.step, `the step after Next with every required field (${describeNext(out)})`).toBe(2);
    });
  });

  test(`TC-${CASES.bothNamesEmpty.azureId}: should block the Privileges step with "Missing information" when both role names are blank`, async ({ page, steps, suiteRoles, roleAdmin }) => {
    const d = CASES.bothNamesEmpty;

    await steps.critical('Navigate to the Role Management module - the module home page is displayed', async () => {
      await suiteRoles.watch();
      const answer = await roleAdmin.open();
      expect(answer.status, 'GetRoles behind the Role Administration list').toBe(200);
    });

    await steps.step('Select Add Role and leave Role Name (English) and Role Name (Arabic) blank, filling all other fields - the fields remain empty', async () => {
      const form = await roleAdmin.openAdd();
      await form.fill({ nameEn: '', nameAr: '', descriptionEn: d.descriptionEn, allowedToAssignBy: [ASSIGNER.en] });
      const values = await form.readValues();
      expect({ nameEn: values.nameEn, nameAr: values.nameAr }, 'the two name boxes').toEqual({ nameEn: '', nameAr: '' });
    });

    await steps.step(`Try to proceed to the Privileges step - the system shows "${QUOTES.missingInformation}" and blocks navigation`, async () => {
      const out = await nextAndRead(page, roleAdmin.form);
      expect(out.step, `the step after Next (${describeNext(out)})`).toBe(1);
      expect(nextShows(out, QUOTES.missingInformation), `"${QUOTES.missingInformation}" (${describeNext(out)})`).toBe(true);
    });
  });

  test(`TC-${CASES.allowedToAssignByRequired.azureId}: should show "This field is required." at Allowed To Assign By until one role is chosen`, async ({ page, steps, suiteRoles, roleAdmin }) => {
    const d = CASES.allowedToAssignByRequired;

    await steps.critical('Navigate to the Role Management module - the module home page is displayed', async () => {
      await suiteRoles.watch();
      const answer = await roleAdmin.open();
      expect(answer.status, 'GetRoles behind the Role Administration list').toBe(200);
    });

    await steps.step('Select Add Role and fill every mandatory field except Allowed To Assign By - the field remains empty', async () => {
      const form = await roleAdmin.openAdd();
      await form.fill({ nameEn: suiteRoles.newName(d.label), nameAr: suiteRoles.newArabicName() });
      expect(await form.readAllowedToAssignBy(), 'Allowed To Assign By').toEqual([]);
    });

    await steps.step(`Try to proceed - the system shows "${QUOTES.fieldRequired}" next to Allowed To Assign By`, async () => {
      const out = await nextAndRead(page, roleAdmin.form);
      expect(out.step, `the step after Next (${describeNext(out)})`).toBe(1);
      expect(out.errors.allowedToAssignBy, `the Allowed To Assign By error (${describeNext(out)})`).toBe(QUOTES.fieldRequired);
    });

    await steps.step('Select one role in Allowed To Assign By and try again - the validation error clears and navigation proceeds', async () => {
      const form = roleAdmin.form;
      await form.chooseAllowedToAssignBy([ASSIGNER.en]);
      await expect.poll(async () => (await fieldErrors(form)).allowedToAssignBy, { message: 'the Allowed To Assign By error after choosing a role' }).toBe('');
      const out = await nextAndRead(page, form);
      expect(out.step, `the step after Next (${describeNext(out)})`).toBe(2);
    });
  });

  test(`TC-${CASES.noPrivilege.azureId}: should refuse Save with "Select at least one privilege." and create nothing when no privilege is ticked`, async ({ page, steps, suiteRoles, roleAdmin }) => {
    const d = CASES.noPrivilege;
    const nameEn = suiteRoles.newName(d.label);

    await steps.critical('Navigate to the Role Management module - the module home page is displayed', async () => {
      await suiteRoles.watch();
      const answer = await roleAdmin.open();
      expect(answer.status, 'GetRoles behind the Role Administration list').toBe(200);
    });

    await steps.critical('Select Add Role, complete every mandatory Role Information field and proceed - the Privileges step opens with no privilege selected', async () => {
      const form = await roleAdmin.openAdd();
      await form.fill({ nameEn, nameAr: suiteRoles.newArabicName(), allowedToAssignBy: [ASSIGNER.en] });
      const errors = await fieldErrors(form);
      expect(noFieldErrors(errors), `field errors shown: ${describeErrors(errors)}`).toBe(true);
      await form.nextToPrivileges();
      const ticked = headingsNot(await form.tree.readHeadings(), 'empty');
      expect(ticked.length, `headings with something selected: ${describeRows(ticked)}`).toBe(0);
    });

    await steps.step(`Select Save without ticking any privilege - the system shows "${QUOTES.selectAtLeastOnePrivilege}" and the role is not created`, async () => {
      const form = roleAdmin.form;
      const out = await form.save();
      expect(out.status, `the Save request (answered "${out.apiMessage}", toast "${out.toast || 'none'}")`).toBeNull();
      await expect(form.tree.message(QUOTES.selectAtLeastOnePrivilege), 'the tree message').toBeVisible();
      expect((await allRoles(page)).filter((r) => r.name === nameEn).length, `roles named "${nameEn}" (GetRoles)`).toBe(0);
    });
  });
});
