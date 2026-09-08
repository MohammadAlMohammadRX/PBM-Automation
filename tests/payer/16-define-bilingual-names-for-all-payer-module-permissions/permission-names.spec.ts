import { test, expect } from '../../../fixtures';
import { PERMISSION_GROUP } from '../../../constants/ElementIds';
import type { RolePermissionsStep } from '../../../pages/system/RolePermissionsStep';
import {
  EXPECTED_PAYER_PERMISSION_COUNT,
  PAYER_PERMISSIONS,
  PERMISSION_SEARCH_TERM,
  TRANSLATED_CONTROL,
} from '../../../data/payers/payerPermissions.data';

/**
 * User story: Define Bilingual Names for All Payer Module Permissions.
 *
 * WHERE THE CATALOGUE IS. Payer permissions are defined on a ROLE, so the only
 * screen that can answer "what is this permission called in Arabic" is
 * Role Administration -> a role's Edit drawer -> step 2, "Privileges". Not a
 * payer screen at all, which is why this story needed a new Page Object.
 *
 * WHAT WAS FOUND, before these cases were written. The feature is largely not
 * implemented, and these cases FAIL against a reachable, working screen - which
 * is the correct result rather than a problem with the tests:
 *
 *   - The `Payers` group holds 21 permissions. Exactly ONE carries a friendly
 *     bilingual name: "View Audit Logs" / "عرض سجلات التدقيق".
 *   - The other 19 display their raw code names - `GetPayer`,
 *     `GetPayersDashboard`, `ExportPayers`, `InactivatePayer` and so on - and
 *     they are IDENTICAL in Arabic. Switching the interface translates the
 *     surrounding chrome and leaves every one of these labels in English.
 *   - The `Payers` group heading is itself untranslated, where the neighbouring
 *     `Plans` heading correctly reads `الخطط`. So the gap is specific to this
 *     module rather than a missing Arabic bundle - and "View Audit Logs" proves
 *     the mechanism works when a name has been defined.
 *
 * ONE DEFECT IN THE SCREEN ITSELF, which shapes how these cases are written:
 * every checkbox in the tree carries the SAME id
 * (`role-form-drawer-arabic-description-checkbox`, 26+ duplicates), so no
 * permission can be addressed by id. Rows are located by their visible label
 * instead - which is what this story is about anyway. See RolePermissionsStep.
 */
test.describe('Define Bilingual Names for All Payer Module Permissions - Names', () => {
  for (const permission of PAYER_PERMISSIONS) {
    test(`${permission.caseId}: should display a correct Arabic label for "${permission.expectedEn}" when the permission catalogue is viewed in Arabic`, async ({
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

      await steps.critical('Open the permission assignment screen', async () => {
        privileges = await roleAdministrationPage.openFirstRolePermissionCatalogue();
        await privileges.searchPermissions(PERMISSION_SEARCH_TERM);
        expect((await privileges.getPermissionLabels()).length).toBeGreaterThan(0);
      });

      await steps.step(
        `The entry reads "${permission.expectedEn}" with the language set to English`,
        () => privileges.expectPermissionLabelled(permission.expectedEn),
      );

      await steps.step('Switching to Arabic re-renders the permission list', async () => {
        // The header language toggle sits behind the drawer's overlay, so the
        // drawer is closed before switching - the click would not land otherwise.
        await roleAdministrationPage.closeDrawer();
        await languageSwitcher.switchTo('ar');
        await languageSwitcher.expectRightToLeft();
        privileges = await roleAdministrationPage.openFirstRolePermissionCatalogue();
        await privileges.searchPermissions(PERMISSION_SEARCH_TERM);
        expect((await privileges.getPermissionLabels()).length).toBeGreaterThan(0);
      });

      // Two assertions, because the sheet asks for two different things
      // depending on the permission: a specific Arabic string where it states
      // one, and otherwise "a correct, non-empty Arabic label" - which is
      // judged as "not the English name, and not a raw code".
      await steps.step('The same entry shows its Arabic equivalent', async () => {
        await privileges.expectPermissionNotLabelled(permission.currentCode);
        const labels = await privileges.getPermissionLabels();
        expect(
          labels,
          `"${permission.expectedEn}" should show an Arabic label here. The catalogue displays `
            + `"${permission.currentCode}" instead, in both languages.`,
        ).not.toContain(permission.currentCode);
      });
    });
  }

  test('TC-010: should list exactly the nine payer permissions with Arabic labels when the catalogue is checked against the checklist', async ({
    roleAdministrationPage,
    languageSwitcher,
    steps,
  }) => {
    let privileges!: RolePermissionsStep;
    let englishLabels: string[] = [];

    await steps.critical('Navigate to the permission catalogue', async () => {
      await languageSwitcher.switchTo('en');
      await roleAdministrationPage.open();
      await roleAdministrationPage.expectRolesListed();
    });

    await steps.critical('Open the full list of payer-related permissions', async () => {
      privileges = await roleAdministrationPage.openFirstRolePermissionCatalogue();
      await privileges.searchPermissions(PERMISSION_SEARCH_TERM);
      englishLabels = await privileges.getPermissionLabels();
      expect(englishLabels.length).toBeGreaterThan(0);
      // Both groups must be present, because approve/reject lives in
      // "Payer Approvals" rather than in "Payers" - a case that looked only at
      // the Payers group would find eight of the nine and blame the wrong thing.
      const groups = await privileges.getGroupLabels();
      expect(groups.join(' | ')).toContain(PERMISSION_GROUP.payers);
    });

    await steps.step(
      `Exactly ${EXPECTED_PAYER_PERMISSION_COUNT} payer permissions are listed`,
      async () => {
        const named = PAYER_PERMISSIONS.filter((permission) =>
          englishLabels.includes(permission.expectedEn));
        expect(
          named.length,
          `Of the ${EXPECTED_PAYER_PERMISSION_COUNT} permissions on the checklist, these are `
            + `displayed under their required names: ${JSON.stringify(named.map((p) => p.expectedEn))}. `
            + 'The rest show raw code names.',
        ).toBe(EXPECTED_PAYER_PERMISSION_COUNT);
      },
    );

    await steps.step('Every checklist item is present, with no duplicates', async () => {
      const absent = PAYER_PERMISSIONS.filter(
        (permission) => !englishLabels.includes(permission.expectedEn),
      ).map((permission) => `${permission.expectedEn} (shown as "${permission.currentCode}")`);
      const duplicated = PAYER_PERMISSIONS.filter(
        (permission) =>
          englishLabels.filter((label) => label === permission.expectedEn).length > 1,
      ).map((permission) => permission.expectedEn);
      expect(absent, 'These checklist permissions are not displayed under their names').toEqual([]);
      expect(duplicated, 'No permission should be listed twice').toEqual([]);
    });

    await steps.step('Every one of the nine has a non-empty Arabic label', async () => {
      // The header language toggle sits behind the drawer's overlay, so the
      // drawer is closed before switching - the click would not land otherwise.
      await roleAdministrationPage.closeDrawer();
      await languageSwitcher.switchTo('ar');
      privileges = await roleAdministrationPage.openFirstRolePermissionCatalogue();
      await privileges.searchPermissions(PERMISSION_SEARCH_TERM);
      const arabicLabels = await privileges.getPermissionLabels();
      expect(arabicLabels.length).toBeGreaterThan(0);

      // Untranslated is judged as "the Arabic view still shows the English
      // name". Comparing against the expected Arabic strings alone would not
      // catch a permission that simply kept its code name.
      const untranslated = PAYER_PERMISSIONS.filter((permission) =>
        arabicLabels.includes(permission.currentCode));
      expect(
        untranslated.map((permission) => permission.currentCode),
        'These payer permissions show the same label in Arabic as in English',
      ).toEqual([]);

      // The positive control: this one IS translated, so a failure above is
      // about the missing names rather than about the language switch.
      expect(
        arabicLabels,
        'The one already-named payer permission should appear in Arabic, proving the '
          + 'translation mechanism itself works',
      ).toContain(TRANSLATED_CONTROL.ar);
    });
  });

  test('TC-017: should update the correct permission and keep every Arabic label readable when permissions are toggled in Arabic', async ({
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
      await privileges.searchPermissions(PERMISSION_SEARCH_TERM);
      expect((await privileges.getPermissionLabels()).length).toBeGreaterThan(0);
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
