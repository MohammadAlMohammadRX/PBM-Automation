import { test, expect } from '../../../fixtures';
import { allRoles } from '../../../utils/role/roleApi';
import { arabicNameFrom, shows } from '../../../utils/role/writerBHelpers';
import { ASSIGNER, CASES, QUOTES, STORY } from '../../../data/role/createRole.data';

/**
 * User story 21288: Create Role - exploratory case 22092 as a scripted sequence (lead decision 11): fill Role
 * Information, go to Privileges, come back (values kept), change a field, go forward again, tick some privileges,
 * close without saving. The TC accepts a silent discard or an unsaved-changes prompt; either way no role (whole or
 * partial) may exist afterwards.
 */
test.describe(`US ${STORY.id} - ${STORY.title}`, () => {
  test(`TC-${CASES.wizardBackAndForth.azureId}: should keep Role Information across Back and create nothing when the panel is closed unsaved`, async ({ page, steps, suiteRoles, roleAdmin }) => {
    const d = CASES.wizardBackAndForth;
    const filled = {
      nameEn: suiteRoles.newName(d.label),
      nameAr: arabicNameFrom(d.arabicStem),
      descriptionEn: d.descriptionEn,
      descriptionAr: '',
      allowedToAssignBy: [ASSIGNER.en],
      isActive: true,
      hasAssignedPayers: true,
      canApproveOwnRequests: false,
    };

    await steps.critical('Navigate to the Role Management module - the module home page is displayed', async () => {
      await suiteRoles.watch();
      const answer = await roleAdmin.open();
      expect(answer.status, 'GetRoles behind the Role Administration list').toBe(200);
    });

    await steps.step('Select Add Role, fill in Role Information, proceed to Privileges, then go back to Role Information - the entered values are retained', async () => {
      const form = await roleAdmin.openAdd();
      await form.fill(filled);
      await form.nextToPrivileges();
      await form.back();
      expect(await form.readValues(), 'Role Information after Next and Back').toEqual(filled);
    });

    await steps.step('Change a field, proceed to Privileges again, select some privileges, then close the panel without saving - the in-progress role is discarded (or a discard prompt is shown)', async () => {
      const form = roleAdmin.form;
      await form.fill({ descriptionEn: d.changedDescriptionEn });
      await form.nextToPrivileges();
      for (const key of d.privileges) await form.tree.tick(key);
      const guard = await form.close('x', 'discard');
      expect(guard === '' || shows(guard, QUOTES.unsavedTitle), `what closing showed: "${guard || 'no prompt'}"`).toBe(true);
      expect(await form.isOpen(), 'the panel after closing').toBe(false);
      const listed = await allRoles(page);
      expect(listed.filter((r) => r.name === filled.nameEn || r.arabicName === filled.nameAr).length, `roles named "${filled.nameEn}" or "${filled.nameAr}" (GetRoles)`).toBe(0);
    });
  });
});
