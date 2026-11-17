import { test, expect } from '../../../fixtures';
import {
  arabicNameFrom,
  describeErrors,
  describeTyped,
  fieldErrors,
  lengthRefused,
  lettersOfLength,
  typeThenNext,
  valueRefused,
} from '../../../utils/role/writerBHelpers';
import { ASSIGNER, CASES, LIMITS, STORY } from '../../../data/role/createRole.data';

/**
 * User story 21288: Create Role - the field rules of Role Information: English name max 100 characters, English
 * letters only in the English name, Arabic letters only in the Arabic name, English description max 250. No case
 * quotes a message, so each asserts the behaviour - the value refused by the box, or the field marked and Next kept
 * on Role Information - and its failure says what the box kept and what the screen showed (lead decision 3).
 * Nothing is saved.
 */
test.describe(`US ${STORY.id} - ${STORY.title}`, () => {
  test(`TC-${CASES.englishNameLength.azureId}: should keep a 100-letter English name whole and refuse a 101st letter`, async ({ page, steps, suiteRoles, roleAdmin }) => {
    const d = CASES.englishNameLength;
    const exact = lettersOfLength(LIMITS.name);
    const over = lettersOfLength(LIMITS.name + 1);

    await steps.critical('Navigate to the Role Management module - the module home page is displayed', async () => {
      await suiteRoles.watch();
      const answer = await roleAdmin.open();
      expect(answer.status, 'GetRoles behind the Role Administration list').toBe(200);
    });

    await steps.step(`Select Add Role, enter exactly ${LIMITS.name} English letters in Role Name (English) and fill the other mandatory fields - the value is accepted without truncation or error`, async () => {
      const form = await roleAdmin.openAdd();
      await form.fill({ nameEn: exact, nameAr: arabicNameFrom(d.arabicStem), allowedToAssignBy: [ASSIGNER.en] });
      await expect(form.field('englishName'), `Role Name (English) after typing ${LIMITS.name} letters`).toHaveValue(exact);
      const errors = await fieldErrors(form);
      expect(errors.englishName, `field errors shown: ${describeErrors(errors)}`).toBe('');
    });

    await steps.step(`Change Role Name (English) to ${LIMITS.name + 1} English letters - the value is refused or a maximum length error prevents proceeding`, async () => {
      const out = await typeThenNext(page, roleAdmin.form, 'englishName', over);
      expect(lengthRefused(out, LIMITS.name), `the ${LIMITS.name + 1}-letter name (${describeTyped(out)})`).toBe(true);
    });
  });

  test(`TC-${CASES.arabicInEnglishName.azureId}: should refuse Arabic letters in Role Name (English)`, async ({ page, steps, suiteRoles, roleAdmin }) => {
    const d = CASES.arabicInEnglishName;

    await steps.critical('Navigate to the Role Management module - the module home page is displayed', async () => {
      await suiteRoles.watch();
      const answer = await roleAdmin.open();
      expect(answer.status, 'GetRoles behind the Role Administration list').toBe(200);
    });

    await steps.step(`Select Add Role and enter Arabic letters ("${d.typed}") into Role Name (English) - the field rejects the input or shows an English-letters-only validation error`, async () => {
      const form = await roleAdmin.openAdd();
      await form.fill({ nameAr: arabicNameFrom(d.arabicStem), allowedToAssignBy: [ASSIGNER.en] });
      const out = await typeThenNext(page, form, 'englishName', d.typed);
      expect(valueRefused(out), `Arabic text in Role Name (English) (${describeTyped(out)})`).toBe(true);
    });
  });

  test(`TC-${CASES.englishInArabicName.azureId}: should refuse English letters in Role Name (Arabic)`, async ({ page, steps, suiteRoles, roleAdmin }) => {
    const d = CASES.englishInArabicName;

    await steps.critical('Navigate to the Role Management module - the module home page is displayed', async () => {
      await suiteRoles.watch();
      const answer = await roleAdmin.open();
      expect(answer.status, 'GetRoles behind the Role Administration list').toBe(200);
    });

    await steps.step(`Select Add Role and enter English letters ("${d.typed}") into Role Name (Arabic) - the field rejects the input or shows an Arabic-letters-only validation error`, async () => {
      const form = await roleAdmin.openAdd();
      await form.fill({ nameEn: suiteRoles.newName(d.label), allowedToAssignBy: [ASSIGNER.en] });
      const out = await typeThenNext(page, form, 'arabicName', d.typed);
      expect(valueRefused(out), `English text in Role Name (Arabic) (${describeTyped(out)})`).toBe(true);
    });
  });

  test(`TC-${CASES.descriptionLength.azureId}: should keep a 250-letter English description whole and refuse a 251st letter`, async ({ page, steps, suiteRoles, roleAdmin }) => {
    const d = CASES.descriptionLength;
    const exact = lettersOfLength(LIMITS.description);
    const over = lettersOfLength(LIMITS.description + 1);

    await steps.critical('Navigate to the Role Management module - the module home page is displayed', async () => {
      await suiteRoles.watch();
      const answer = await roleAdmin.open();
      expect(answer.status, 'GetRoles behind the Role Administration list').toBe(200);
    });

    await steps.step(`Select Add Role and enter exactly ${LIMITS.description} English letters in Role Description (English) - the field accepts the full value`, async () => {
      const form = await roleAdmin.openAdd();
      await form.fill({ nameEn: suiteRoles.newName(d.label), nameAr: suiteRoles.newArabicName(), allowedToAssignBy: [ASSIGNER.en], descriptionEn: exact });
      await expect(form.field('englishDescription'), `Role Description (English) after typing ${LIMITS.description} letters`).toHaveValue(exact);
    });

    await steps.step(`Try to enter a ${LIMITS.description + 1}st character - the field rejects further input or shows a maximum length error`, async () => {
      const out = await typeThenNext(page, roleAdmin.form, 'englishDescription', over);
      expect(lengthRefused(out, LIMITS.description), `the ${LIMITS.description + 1}-letter description (${describeTyped(out)})`).toBe(true);
    });
  });
});
