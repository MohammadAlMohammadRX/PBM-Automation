import { test, expect } from '../../../fixtures';
import { azureOrCase } from '../../../data/azureTestIds.data';
import type { RolePermissionsStep } from '../../../pages/system/RolePermissionsStep';
import {
  ARABIC_LETTER,
  EXPECTED_PAYER_PERMISSION_COUNT,
  PAYER_APPROVALS_GROUP,
  PAYER_PERMISSION_GROUP,
  PAYER_PERMISSIONS,
  TRANSLATED_CONTROL,
  findPermission,
  samePermission,
} from '../../../data/payers/payerPermissions.data';

/**
 * User story: Define Bilingual Names for All Payer Module Permissions.
 *
 * WHERE THE CATALOGUE IS. Payer permissions are defined on a ROLE, so the only
 * screen that can answer "what is this permission called in Arabic" is
 * Role Administration -> a role's Edit drawer -> step 2, "Privileges". Not a
 * payer screen at all, which is why this story needed its own Page Object.
 *
 * HOW THE CATALOGUE IS READ, and why it changed. These cases used to filter the
 * tree to "Payer" and look for a name among the results. Two things were wrong
 * with that:
 *
 *   - The search term matches rows in OTHER modules - "Payer Approvals" sits
 *     under Approval Management - so finding a name after searching was not
 *     evidence that the PAYERS group offered it.
 *   - A name was compared literally, so "ExportPayers" did not count as
 *     "Export Payers". They are the same permission written two ways, and
 *     reporting it as a missing name was wrong.
 *
 * So the section is now scrolled to and read row by row, and names are compared
 * on their letters rather than their punctuation. VERIFIED live: the Payers
 * group holds 21 rows - "View Audit Logs" plus a "GetPayers (19/19)" subgroup
 * of 19 codes.
 *
 * WHAT THAT LEAVES. Two of the checklist names ARE present once spelling is set
 * aside - ExportPayers and InactivatePayer. The rest are genuinely different
 * words: "GetPayer" is not a spelling of "View Payer Details". And in Arabic
 * every one of these rows keeps its English text, which is the finding this
 * story exists to record. The group heading "Payers" is itself untranslated
 * where its neighbour "Plans" correctly reads "الخطط", so the gap is specific
 * to this module rather than a missing bundle.
 *
 * ONE DEFECT IN THE SCREEN ITSELF: every checkbox in the tree carries the SAME
 * id (`role-form-drawer-arabic-description-checkbox`, 26+ duplicates), so no
 * permission can be addressed by id. Rows are located by their visible label -
 * which is what this story is about anyway. See RolePermissionsStep.
 */
test.describe('Define Bilingual Names for All Payer Module Permissions - Names', () => {
  /** The group a permission is listed under, as a top-level section. */
  const sectionFor = (group: string): readonly string[] =>
    (group === PAYER_PERMISSION_GROUP[0] ? PAYER_PERMISSION_GROUP : PAYER_APPROVALS_GROUP);

  for (const permission of PAYER_PERMISSIONS) {
    // Azure test cases - one per generated case:
    //   TC-001 = 15377,  TC-002 = 15378,  TC-003 = 15379
    //   TC-004 = 15380,  TC-005 = 15381,  TC-006 = 15382
    //   TC-007 = 15383,  TC-008 = 15384,  TC-009 = 15385
    test(`${azureOrCase('16', permission.caseId)}: should display a correct Arabic label for "${permission.expectedEn}" when the permission catalogue is viewed in Arabic`, async ({
      roleAdministrationPage,
      languageSwitcher,
      steps,
    }) => {
      let privileges!: RolePermissionsStep;
      let english: string[] = [];
      let shownEn = '';
      let position = -1;

      await steps.critical('Navigate to the permission catalogue', async () => {
        await languageSwitcher.switchTo('en');
        await roleAdministrationPage.open();
        await roleAdministrationPage.expectRolesListed();
      });

      await steps.critical(`Scroll to the "${sectionFor(permission.group)[0]}" section`, async () => {
        privileges = await roleAdministrationPage.openFirstRolePermissionCatalogue();
        english = await privileges.getGroupPermissions(sectionFor(permission.group));
        expect(
          english.length,
          `the "${sectionFor(permission.group)[0]}" section should list its permissions`,
        ).toBeGreaterThan(0);
      });

      await steps.step(
        `The section offers "${permission.expectedEn}", however it is spelled`,
        async () => {
          // Matched on letters, not punctuation: the catalogue writes
          // "ExportPayers" where the story writes "Export Payers", and those
          // are one permission, not a missing one.
          shownEn = findPermission(english, permission.expectedEn);
          position = english.findIndex((label) => samePermission(label, permission.expectedEn));
          expect(
            shownEn,
            `the ${sectionFor(permission.group)[0]} section should offer "${permission.expectedEn}". `
              + `It lists: ${english.join(', ')}`,
          ).not.toBe('');
        },
      );

      await steps.step('Switching to Arabic re-renders the same section', async () => {
        // The header language toggle sits behind the drawer's overlay, so the
        // drawer is closed before switching - the click would not land otherwise.
        await roleAdministrationPage.closeDrawer();
        await languageSwitcher.switchTo('ar');
        await languageSwitcher.expectRightToLeft();
        privileges = await roleAdministrationPage.openFirstRolePermissionCatalogue();
        const arabic = await privileges.getGroupPermissions(sectionFor(permission.group));
        expect(
          arabic.length,
          'the Arabic section should list the same number of permissions as the English one',
        ).toBe(english.length);
      });

      await steps.step('That row reads in Arabic, not in English', async () => {
        // Read at the SAME POSITION rather than by name: a translated row no
        // longer carries the English text, so there is nothing to match on.
        const arabic = await privileges.getGroupPermissions(sectionFor(permission.group));
        const shownAr = arabic[position] ?? '';
        expect(
          ARABIC_LETTER.test(shownAr),
          `"${permission.expectedEn}" is listed as "${shownEn}" in English and "${shownAr}" in `
            + 'Arabic - the Arabic view still shows the English text.',
        ).toBe(true);

        if (permission.expectedAr !== undefined) {
          expect(
            shownAr,
            `the sheet names this permission "${permission.expectedAr}" in Arabic`,
          ).toBe(permission.expectedAr);
        }
      });
    });
  }

  // Azure test case 15387
  test('15387: should list exactly the nine payer permissions with Arabic labels when the catalogue is checked against the checklist', async ({
    roleAdministrationPage,
    languageSwitcher,
    steps,
  }) => {
    let privileges!: RolePermissionsStep;
    let payers: string[] = [];
    let approvals: string[] = [];

    await steps.critical('Navigate to the permission catalogue', async () => {
      await languageSwitcher.switchTo('en');
      await roleAdministrationPage.open();
      await roleAdministrationPage.expectRolesListed();
    });

    await steps.critical('Scroll to both sections that hold payer permissions', async () => {
      privileges = await roleAdministrationPage.openFirstRolePermissionCatalogue();
      payers = await privileges.getGroupPermissions(PAYER_PERMISSION_GROUP);
      // Approve/reject lives under Approval Management, not under Payers - a
      // case that read only the Payers section would find eight of the nine and
      // blame the wrong thing.
      approvals = await privileges.getGroupPermissions(PAYER_APPROVALS_GROUP);
      expect(payers.length, 'the Payers section should list its permissions').toBeGreaterThan(0);
      expect(approvals.length, 'the Approval Management section should list its permissions').toBeGreaterThan(0);
    });

    await steps.step(
      `All ${EXPECTED_PAYER_PERMISSION_COUNT} checklist permissions are offered`,
      async () => {
        const absent = PAYER_PERMISSIONS.filter((permission) => {
          const pool = permission.group === PAYER_PERMISSION_GROUP[0] ? payers : approvals;
          return findPermission(pool, permission.expectedEn) === '';
        }).map((permission) => `${permission.expectedEn} (the section shows "${permission.currentCode}")`);

        expect(
          absent,
          'These checklist permissions are not offered under a name that matches, even ignoring '
            + 'spacing and punctuation',
        ).toEqual([]);
      },
    );

    await steps.step('No permission is listed twice', async () => {
      const duplicated = PAYER_PERMISSIONS.filter((permission) => {
        const pool = permission.group === PAYER_PERMISSION_GROUP[0] ? payers : approvals;
        return pool.filter((label) => samePermission(label, permission.expectedEn)).length > 1;
      }).map((permission) => permission.expectedEn);
      expect(duplicated, 'No permission should be listed twice').toEqual([]);
    });

    await steps.step('Every row of the Payers section reads in Arabic', async () => {
      await roleAdministrationPage.closeDrawer();
      await languageSwitcher.switchTo('ar');
      privileges = await roleAdministrationPage.openFirstRolePermissionCatalogue();
      const arabic = await privileges.getGroupPermissions(PAYER_PERMISSION_GROUP);
      expect(arabic.length, 'the Arabic section should list the same rows').toBe(payers.length);

      const untranslated = arabic.filter((label) => !ARABIC_LETTER.test(label));
      expect(
        untranslated,
        `${untranslated.length} of the ${arabic.length} permissions in the Payers section still `
          + 'show their English text when the interface is Arabic',
      ).toEqual([]);
    });

    await steps.step('The one already-named permission proves the mechanism works', async () => {
      const arabic = await privileges.getGroupPermissions(PAYER_PERMISSION_GROUP);
      expect(
        findPermission(arabic, TRANSLATED_CONTROL.ar),
        'The one already-named payer permission should appear in Arabic, proving the translation '
          + 'mechanism itself works',
      ).not.toBe('');
      await roleAdministrationPage.closeDrawer();
    });
  });

  // Azure test case 15393
  test('15393: should update the correct permission and keep every Arabic label readable when permissions are toggled in Arabic', async ({
    roleAdministrationPage,
    languageSwitcher,
    steps,
  }) => {
    let privileges!: RolePermissionsStep;

    await steps.critical('Navigate to the permission catalogue', async () => {
      await languageSwitcher.switchTo('en');
      await roleAdministrationPage.open();
      await roleAdministrationPage.expectRolesListed();
    });

    // No drawer to close here, unlike the cases above: this one switches
    // language before opening the catalogue at all, so the header toggle is
    // reachable straight away.
    await steps.step('The permission screen renders in Arabic', async () => {
      await languageSwitcher.switchTo('ar');
      await languageSwitcher.expectRightToLeft();
      privileges = await roleAdministrationPage.openFirstRolePermissionCatalogue();
      await privileges.scrollGroupIntoView(PAYER_PERMISSION_GROUP);
      expect((await privileges.getGroupPermissions(PAYER_PERMISSION_GROUP)).length)
        .toBeGreaterThan(0);
    });

    // Toggled and then restored, so the role is left exactly as it was: this is
    // a shared environment and the drawer is closed without saving, but a
    // half-toggled tree would still mislead anyone looking at the screen mid-run.
    await steps.step('Toggling a permission updates that row and no other', async () => {
      const before = await privileges.getPermissionLabels();
      const target = TRANSLATED_CONTROL.ar;
      const after = await privileges.togglePermission(target);
      // The toggle took, and the row it took on is the row asked for - which is
      // what "no cross-wiring between rows" means.
      expect(await privileges.isPermissionChecked(target)).toBe(after);
      const restored = await privileges.togglePermission(target);
      expect(restored).toBe(!after);
      expect(await privileges.getPermissionLabels()).toEqual(before);
    });

    await steps.step('No Arabic label is truncated, overlapped or misaligned', () =>
      privileges.expectNoTruncatedLabels());

    await steps.step('No label is a raw translation key, blank or "undefined"', async () => {
      await privileges.expectNoRawTranslationKeys();
      await roleAdministrationPage.closeDrawer();
    });
  });
});
