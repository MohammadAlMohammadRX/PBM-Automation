import { test, expect, WriterBSettings, blockUnlessSingleTab, permittedTabs } from '../../../utils/settings/writerBHelpers';
import { CASES, GENERAL_SECTIONS, TAB_LABEL, TAB_SIGNATURE } from '../../../data/settings/viewSettingsGeneralTab.data';
import { currentPermissions } from '../../../utils/UserProvisioning';

/**
 * User story 20865: View Settings - General Tab - which tabs a user is offered.
 * The administrator side runs on the default page; every restricted side is a
 * SUITE user whose suite role holds exactly the rights in the data file
 * (lead decision 7), signed in in a second window and thrown away at teardown.
 * "Absent" cases baseline first: the administrator is offered what the
 * restricted user must not be. Nothing is saved (settingsGuard still guards).
 */
test.describe('US 20865 - View Settings - General Tab', () => {
  test.describe.configure({ timeout: 5 * 60_000 });

  test(`TC-${CASES.allTabs.azureId}: should show every permitted tab and open General with its three sections when an administrator with full permissions opens Settings`, async ({ page, steps, settingsGuard, settingsView }) => {
    let expected: string[] = [];

    await steps.critical('Navigate to the System Setting Management module - the module landing page loads', async () => {
      await settingsView.open();
      expected = permittedTabs(await currentPermissions(page));
      await expect(settingsView.tabButton('general'), 'the General tab button').toBeVisible();
    });

    await steps.step('Open System Settings > Settings - the Settings screen opens showing a tab strip', async () => {
      await expect(settingsView.tabStrip(), 'the Settings tab strip').toBeVisible();
    });

    await steps.step('Inspect the tab strip - all tabs the user is permitted to see are displayed, including General, Two-Factor Authentication and Password Policy (Generate = General)', async () => {
      const labels = await settingsView.tabLabels();
      expect(labels, `the tabs shown; the administrator's rights permit [${expected.join(', ')}]`).toEqual(expect.arrayContaining([...CASES.allTabs.namedTabs]));
      expect([...labels].sort(), 'every permitted tab, and only those').toEqual([...expected].sort());
    });

    await steps.step('Select the General tab - it opens showing Time Zone & Theme, Currency and Scheduled Jobs', async () => {
      await settingsView.openTab('general');
      expect(await settingsView.sectionsShown(), 'the General sections shown').toEqual(expect.arrayContaining([...GENERAL_SECTIONS]));
    });
  });

  test(`TC-${CASES.singleTab.azureId}: should hide the tab strip and open straight on General when the user may view only one settings tab`, async ({ steps, settingsGuard, settingsView, userRole, requireShapeApplied }) => {
    const rights = CASES.singleTab.candidates[0];

    await steps.critical('Baseline: the administrator, who may view several tabs, is shown the tab strip', async () => {
      await settingsView.open();
      await expect(settingsView.tabStrip(), 'the strip for the administrator').toBeVisible();
    });

    const s = await userRole.signIn({ with: [...rights] });
    requireShapeApplied(s);
    const view = new WriterBSettings(s.page);

    await steps.critical('Navigate to the System Setting Management module - the module landing page loads', async () => {
      await view.open();
      const labels = await view.tabLabels();
      blockUnlessSingleTab(steps, rights, labels);
      expect(labels.length, `tabs offered to "${s.role.name}" (${s.rights.join(', ')}): [${labels.join(', ')}]`).toBeLessThan(2);
    });

    await steps.step('Open System Settings > Settings - the Settings screen opens directly on the General tab content', async () => {
      expect(await view.shows(TAB_SIGNATURE.general), `the General content; the screen shows: ${(await view.lines()).slice(0, 12).join(' | ')}`).toBe(true);
    });

    await steps.step('Inspect the screen for a tab strip - no tab strip / tab selector is displayed since only one tab is available', async () => {
      await expect(view.tabStrip(), `the tab strip with only one tab (labels [${(await view.tabLabels()).join(', ')}])`).toBeHidden();
    });
  });

  test(`TC-${CASES.twoOrMoreTabs.azureId}: should show the tab strip listing the permitted tabs when the user may view two or more settings tabs`, async ({ steps, settingsGuard, userRole, requireShapeApplied }) => {
    const s = await userRole.signIn({ with: [...CASES.twoOrMoreTabs.rights] });
    requireShapeApplied(s);
    const view = new WriterBSettings(s.page);

    await steps.critical('Navigate to the System Setting Management module - the module landing page loads', async () => {
      await view.open();
      await expect(view.tabButton('general'), `the General tab for "${s.role.name}" (${s.rights.join(', ')})`).toBeVisible();
    });

    await steps.step('Open System Settings > Settings - the Settings screen opens', async () => {
      expect(await view.shows(TAB_SIGNATURE.general), 'the General content of the Settings screen').toBe(true);
    });

    await steps.step('Inspect the screen for a tab strip - a tab strip is displayed listing the General (Generate) tab and the other permitted tab', async () => {
      await expect(view.tabStrip(), 'the tab strip').toBeVisible();
      const labels = await view.tabLabels();
      expect(labels, 'the tabs listed').toEqual(expect.arrayContaining([...CASES.twoOrMoreTabs.listed]));
      expect(labels.filter((l) => (CASES.twoOrMoreTabs.notListed as readonly string[]).includes(l)), `unpermitted tabs listed (all: ${labels.join(', ')})`).toEqual([]);
      await view.openTab('sms');
      expect(await view.shows(TAB_SIGNATURE.sms), `the ${TAB_LABEL.sms} content after switching`).toBe(true);
    });
  });

  test(`TC-${CASES.noViewPermission.azureId}: should block the Settings screen and every tab when the user lacks the permission to view system settings`, async ({ steps, settingsGuard, settingsView, userRole, requireShapeApplied }) => {

    await steps.critical('Baseline: the administrator, who holds the view permission, opens the Settings screen', async () => {
      await settingsView.open();
      await expect(settingsView.tabButton('general'), 'the General tab for the administrator').toBeVisible();
    });

    const s = await userRole.signIn({ with: [...CASES.noViewPermission.rights] });
    requireShapeApplied(s);
    const view = new WriterBSettings(s.page);

    await steps.step('Navigate to the System Setting Management module - the landing page loads without a visible System Settings entry, or access is denied', async () => {
      const entryShown = await view.settingsMenuEntryShown();
      await view.visitHub();
      const access = await view.accessState();
      expect(!entryShown || access.denied, `the menu ${entryShown ? 'OFFERS' : 'does not offer'} System Settings > Settings; the route ${access.denied ? 'was denied' : 'OPENED'} (${access.url}): ${access.seen}`).toBe(true);
    });

    await steps.step('Attempt to open System Settings > Settings directly - the request is blocked and no tab opens', async () => {
      await view.visitHub();
      const access = await view.accessState();
      expect(access.denied, `"${s.role.name}" (${s.rights.join(', ')}) at ${access.url}: ${access.seen}`).toBe(true);
      expect(await view.visibleTabs(), 'settings tabs offered').toEqual([]);
    });
  });
});
