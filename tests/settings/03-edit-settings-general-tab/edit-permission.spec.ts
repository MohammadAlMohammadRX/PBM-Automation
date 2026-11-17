import { test, expect, WriterBSettings } from '../../../utils/settings/writerBHelpers';
import { CASES } from '../../../data/settings/editSettingsGeneralTab.data';
import { VIEW_LABEL } from '../../../data/settings/viewSettingsGeneralTab.data';

/**
 * User story 20866: Edit Settings - General Tab - who is offered Edit. Both
 * sides are SUITE users whose suite role holds exactly the rights in the data
 * file (lead decision 7): view + edit, and view only. The view-only case
 * baselines first (the administrator is offered Edit). Nothing is saved.
 */
test.describe('US 20866 - Edit Settings - General Tab', () => {
  test.describe.configure({ timeout: 5 * 60_000 });

  test(`TC-${CASES.editShown.azureId}: should show an enabled Edit button on the General tab when the user holds the edit permission`, async ({ steps, settingsGuard, userRole, requireShapeApplied }) => {
    const s = await userRole.signIn({ with: [...CASES.editShown.rights] });
    requireShapeApplied(s);
    const view = new WriterBSettings(s.page);

    await steps.critical('Navigate to the System Setting Management module - the module landing page loads', async () => {
      await view.open();
      await expect(view.tabButton('general'), `the General tab for "${s.role.name}" (${s.rights.join(', ')})`).toBeVisible();
    });

    await steps.step('Open System Settings > Settings > General tab - the General tab loads showing current values', async () => {
      await view.openTab('general');
      expect(await view.labelValue(VIEW_LABEL.siteTitle), 'the site title shown').toBe(settingsGuard.original['Site.Title']);
    });

    await steps.step('Inspect the tab for an Edit button - the Edit button is visible and enabled', async () => {
      await expect(view.editButton(), 'the Edit button').toBeVisible();
      await expect(view.editButton(), 'the Edit button').toBeEnabled();
    });
  });

  test(`TC-${CASES.editHidden.azureId}: should show no Edit button and keep the values read-only when the user lacks the edit permission`, async ({ steps, settingsGuard, settingsView, userRole, requireShapeApplied }) => {
    const title = settingsGuard.original['Site.Title'];

    await steps.critical('Baseline: the administrator, who holds the edit permission, is offered an enabled Edit button', async () => {
      await settingsView.open();
      expect(await settingsView.editState(), 'Edit for the administrator').toEqual({ shown: true, enabled: true });
    });

    const s = await userRole.signIn({ with: [...CASES.editHidden.rights] });
    requireShapeApplied(s);
    const view = new WriterBSettings(s.page);

    await steps.critical('Navigate to the System Setting Management module - the module landing page loads', async () => {
      await view.open();
      await expect(view.tabButton('general'), `the General tab for "${s.role.name}" (${s.rights.join(', ')})`).toBeVisible();
    });

    await steps.step('Open System Settings > Settings > General tab - the General tab loads showing current values', async () => {
      await view.openTab('general');
      expect(await view.labelValue(VIEW_LABEL.siteTitle), 'the site title shown').toBe(title);
    });

    await steps.step('Inspect the tab for an Edit button - no Edit button is present anywhere on the tab', async () => {
      await expect(view.editButton(), 'the Edit button for a view-only user').toBeHidden();
    });

    await steps.step('Attempt to modify a displayed value directly - the values remain read-only and cannot be changed', async () => {
      expect.soft(await view.editableControlsInView(), 'editable controls in the read view').toBe(0);
      expect.soft(await view.typeOnReadValue(VIEW_LABEL.siteTitle, CASES.editHidden.typed), 'the site title after typing on it').toBe(title);
      expect((await settingsGuard.current())['Site.Title'], 'the stored site title').toBe(title);
    });
  });
});
