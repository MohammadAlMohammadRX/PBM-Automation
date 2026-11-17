import { test, expect } from '../../../fixtures';
import { CASES, NEW_INSTALL_DEFAULTS, STORY, TEXTS } from '../../../data/settings/editTimeZoneSiteTitleAndLogo.data';
import {
  blockUnlessNewInstallDefault,
  cancelDrawer,
  chooseVisibleOption,
  normalise,
  typeInTimeZoneFilter,
  visibleOptions,
} from '../../../utils/settings/writerAHelpers';

/**
 * User story 20864: Edit Time Zone, Site Title and Logo - the time-zone cases
 * that do not save: the new-installation default (21063, lead decision 1) and
 * the searchable drop-down (21065, which cancels the drawer). The saving
 * time-zone cases (21062, 21079) are in save-and-apply.spec.ts. Every test
 * takes `settingsGuard` (global settings - snapshot + restore + read-back).
 */
test.describe(`US ${STORY.id} - ${STORY.title}`, () => {
  test.describe.configure({ timeout: 3 * 60_000 });

  test(`TC-${CASES.timeZoneDefault.azureId}: should show "${NEW_INSTALL_DEFAULTS.timeZone}" as the time zone when the platform is a new installation`, async ({ steps, settingsHub, settingsGuard }) => {
    await steps.critical('Navigate to the System Setting Management module - the module landing page loads', async () => {
      await settingsHub.open();
      await expect(settingsHub.tabButton('general'), 'the General tab').toBeVisible();
    });

    await steps.critical('Open System Settings > Settings > General tab - the General tab loads showing the Time Zone & Theme section', async () => {
      await settingsHub.openTab('general');
      expect(await settingsHub.outletText(), 'the General tab').toContain(TEXTS.generalSections[0]);
    });

    await steps.step(`Inspect the Time Zone field value - the field displays "${NEW_INSTALL_DEFAULTS.timeZone}" as the default value`, async () => {
      const shown = await settingsHub.readViewValue(TEXTS.label.timeZone);
      blockUnlessNewInstallDefault(steps, 'time zone', shown, NEW_INSTALL_DEFAULTS.timeZone);
      expect(normalise(shown), 'the Time zone the General tab shows').toBe(NEW_INSTALL_DEFAULTS.timeZone);
    });
  });

  test(`TC-${CASES.timeZoneSearch.azureId}: should filter the time zones to "${CASES.timeZoneSearch.term}" and select it when the term is typed in the drop-down`, async ({ page, steps, settingsHub, settingsGuard }) => {
    const d = CASES.timeZoneSearch;

    await steps.critical('Navigate to the System Setting Management module - the module landing page loads', async () => {
      await settingsHub.open();
      await expect(settingsHub.tabButton('general'), 'the General tab').toBeVisible();
    });

    await steps.critical('Open System Settings > Settings > General tab and select Edit - the Edit Setting side panel opens', async () => {
      await settingsHub.openTab('general');
      await settingsHub.openEdit();
      await expect(settingsHub.drawerTitle(), 'the Edit Setting drawer').toBeVisible();
    });

    await steps.critical(`Open the Time Zone drop-down and type "${d.term}" - the list filters to show only time zones matching "${d.term}", e.g. "${d.option}"`, async () => {
      await typeInTimeZoneFilter(page, settingsHub, d.term);
      await expect.poll(() => visibleOptions(page), { message: `the options offered after typing "${d.term}"`, timeout: 10_000 }).toContain(d.option);
      const offered = await visibleOptions(page);
      expect(offered.filter((o) => !o.toLowerCase().includes(d.term.toLowerCase())), `options that do not match "${d.term}" (all offered: ${offered.join(' | ')})`).toEqual([]);
    });

    await steps.step('Select the filtered time zone - the field updates to show the selected time zone', async () => {
      await chooseVisibleOption(page, d.option);
      await expect(settingsHub.control('timeZoneSelect'), 'the Time zone field').toHaveText(d.option);
    });

    // Nothing is saved: the drawer is cancelled (the guard reads back the time zone anyway).
    await cancelDrawer(page, settingsHub);
  });
});
