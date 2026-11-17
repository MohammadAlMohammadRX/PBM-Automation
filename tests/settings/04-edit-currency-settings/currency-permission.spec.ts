import { test, expect } from '../../../fixtures';
import { SettingsHubPage } from '../../../pages/settings/SettingsHubPage';
import { CASES } from '../../../data/settings/editCurrencySettings.data';
import { currencySectionShown, restrictedEditAccess } from '../../../utils/settings/writerCHelpers';

/**
 * User story 20867: Edit Currency Settings - a user WITHOUT the permission to
 * edit settings. Baseline first: the administrator is offered Edit on the same
 * screen. The restricted user is a SUITE user (User-module `suiteSession`)
 * whose suite role holds only the view right SystemSettings.GetSystemSettings;
 * the role and user are discarded at teardown. Nothing is saved.
 */
test.describe('US 20867 - Edit Currency Settings', () => {
  test.describe.configure({ timeout: 5 * 60_000 });

  test(`TC-${CASES.nonAdminCannotEdit.azureId}: should not let a user edit the currency settings when the user lacks the settings edit permission`, async ({ steps, settingsGuard, settingsHub, suiteSession }) => {
    const d = CASES.nonAdminCannotEdit;

    await steps.critical('Navigate to the System Setting Management module - the Platform Currency section shows its settings controls (baseline: the administrator is offered Edit)', async () => {
      await settingsHub.open();
      expect(await currencySectionShown(settingsHub), 'the Currency section for the administrator').toBe(true);
      await expect(settingsHub.editButton(), 'Edit for the administrator').toBeVisible();
    });

    const s = await suiteSession({ rights: d.rights });

    await steps.step('Attempt to open the Currency Settings panel as a non-administrator user - the panel is inaccessible (no Edit, no drawer)', async () => {
      const access = await restrictedEditAccess(new SettingsHubPage(s.page), s.page);
      expect({ editShown: access.editShown, drawerOpen: access.drawerOpen }, `for "${s.role.name}" (${d.rights.join(', ')}) at ${access.url}, Currency section shown ${access.sectionShown}`)
        .toEqual({ editShown: false, drawerOpen: false });
    });
  });
});
