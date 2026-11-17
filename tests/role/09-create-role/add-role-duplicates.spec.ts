import { test, expect } from '../../../fixtures';
import { allRoles } from '../../../utils/role/roleApi';
import {
  arabicNameFrom,
  closeIfOpen,
  describeErrors,
  describeProceed,
  fieldErrors,
  flat,
  inArabicUi,
  noFieldErrors,
  proceedAndSave,
  proceedRefused,
  proceedText,
  shows,
} from '../../../utils/role/writerBHelpers';
import { ARABIC_LETTERS, ASSIGNER, CASES, QUOTES, SAMPLE_PRIVILEGE, STORY } from '../../../data/role/createRole.data';

/**
 * User story 21288: Create Role - role names are unique: a new role repeating an existing role's English name,
 * then its Arabic name. The "existing role" is a suite role made first (lead decision 2 - "Network Officer" /
 * "ضابط الشبكة" are examples). 22080 runs with the UI in Arabic (lead decision 10) and is switched back.
 */
test.describe(`US ${STORY.id} - ${STORY.title}`, () => {
  test(`TC-${CASES.duplicateEnglish.azureId}: should refuse a new role whose English name is already taken with "Role name '<name>' is already taken."`, async ({ page, steps, suiteRoles, roleAdmin }) => {
    const d = CASES.duplicateEnglish;
    const existing = { name: '' };

    await steps.critical('Navigate to the Role Management module - the module home page is displayed (a role with the name already exists)', async () => {
      existing.name = (await suiteRoles.create({ label: d.label })).name;
      await suiteRoles.watch();
      const answer = await roleAdmin.open();
      expect(answer.status, 'GetRoles behind the Role Administration list').toBe(200);
    });

    await steps.step('Select Add Role, enter the existing English role name and fill the remaining mandatory fields - the fields accept the values', async () => {
      const form = await roleAdmin.openAdd();
      await form.fill({ nameEn: existing.name, nameAr: suiteRoles.newArabicName(), allowedToAssignBy: [ASSIGNER.en] });
      await expect(form.field('englishName'), 'Role Name (English)').toHaveValue(existing.name);
      const errors = await fieldErrors(form);
      expect(noFieldErrors(errors), `field errors shown: ${describeErrors(errors)}`).toBe(true);
    });

    await steps.step(`Try to proceed / save - the system displays "Role name '<name>' is already taken." and the role is not created`, async () => {
      const out = await proceedAndSave(page, roleAdmin.form, SAMPLE_PRIVILEGE);
      const quote = QUOTES.nameTaken(existing.name);
      expect(shows(proceedText(out), quote), `"${quote}" (${describeProceed(out)})`).toBe(true);
      expect(proceedRefused(out), `the attempt (${describeProceed(out)})`).toBe(true);
      expect((await allRoles(page)).filter((r) => r.name === existing.name).length, `roles named "${existing.name}" (GetRoles)`).toBe(1);
      await closeIfOpen(roleAdmin.form);
    });
  });

  test(`TC-${CASES.duplicateArabic.azureId}: should refuse a new role whose Arabic name is already taken with the Arabic message`, async ({ page, steps, suiteRoles, roleAdmin }) => {
    const d = CASES.duplicateArabic;
    const existing = { arabicName: arabicNameFrom(d.arabicStem), name: '' };
    const nameEn = suiteRoles.newName(d.label);

    await steps.critical('Navigate to the Role Management module - the module home page is displayed (a role with the Arabic name already exists)', async () => {
      existing.name = (await suiteRoles.create({ label: d.label, nameAr: existing.arabicName })).name;
      await suiteRoles.watch();
      const answer = await roleAdmin.open();
      expect(answer.status, 'GetRoles behind the Role Administration list').toBe(200);
    });

    await steps.step('Select Add Role (UI in Arabic), enter the existing Arabic role name and fill the remaining mandatory fields - the fields accept the values', async () => {
      const accepted = await inArabicUi(page, async () => {
        await roleAdmin.open();
        const form = await roleAdmin.openAdd();
        await form.fill({ nameEn, nameAr: existing.arabicName, allowedToAssignBy: [ASSIGNER.ar] });
        const values = await form.readValues();
        const errors = await fieldErrors(form);
        await closeIfOpen(form);
        return { nameAr: values.nameAr, errors };
      });
      expect(accepted.nameAr, 'Role Name (Arabic)').toBe(existing.arabicName);
      expect(noFieldErrors(accepted.errors), `field errors shown: ${describeErrors(accepted.errors)}`).toBe(true);
    });

    await steps.step('Try to proceed / save (UI in Arabic) - the system displays the Arabic message that the role name is already taken and creates nothing', async () => {
      const out = await inArabicUi(page, async () => {
        await roleAdmin.open();
        const form = await roleAdmin.openAdd();
        await form.fill({ nameEn, nameAr: existing.arabicName, allowedToAssignBy: [ASSIGNER.ar] });
        const result = await proceedAndSave(page, form, SAMPLE_PRIVILEGE);
        await closeIfOpen(form);
        return result;
      });
      const text = proceedText(out);
      expect(proceedRefused(out), `the attempt (${describeProceed(out)})`).toBe(true);
      expect(text, `a message naming the Arabic name as taken (${describeProceed(out)})`).toContain(existing.arabicName);
      expect(ARABIC_LETTERS.test(flat(text.split(existing.arabicName).join(' '))), `with the UI in Arabic the duplicate-name message is worded in Arabic - it read "${text.split(' | ').join(' / ') || 'nothing'}" (${describeProceed(out)})`).toBe(true);
      const listed = await allRoles(page);
      expect(listed.filter((r) => r.arabicName === existing.arabicName).length, `roles with the Arabic name (GetRoles)`).toBe(1);
      expect(listed.filter((r) => r.name === nameEn).length, `roles named "${nameEn}" (GetRoles)`).toBe(0);
    });
  });
});
