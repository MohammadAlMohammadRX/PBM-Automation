import { test, expect, asShown, drawerAgainstStored, jobControlKinds, normalise, nudgedRate, otherTimeZone } from '../../../utils/settings/writerBHelpers';
import type { DrawerSaveOutcome } from '../../../pages/settings/SettingsHubPage';
import type { DrawerValues } from '../../../utils/settings/writerBHelpers';
import { CASES, DRAWER_SECTIONS, MESSAGE } from '../../../data/settings/editSettingsGeneralTab.data';
import { VIEW_LABEL } from '../../../data/settings/viewSettingsGeneralTab.data';
import { readBranding, GUARDED_SETTING_KEYS } from '../../../utils/settings/systemSettingsApi';

/**
 * User story 20866: Edit Settings - General Tab - the Edit Setting drawer as
 * the administrator uses it: pre-filled values, the control each value gets,
 * Save sending only what changed, Save with nothing changed, and the success
 * toast + refreshed tab. GLOBAL settings: every test takes settingsGuard,
 * which restores and reads back the guarded keys at teardown; the saves here
 * touch only the rate and the time zone, for seconds.
 */
test.describe('US 20866 - Edit Settings - General Tab', () => {
  test.describe.configure({ timeout: 3 * 60_000 });

  test(`TC-${CASES.prefilled.azureId}: should open the Edit Setting panel with every section pre-filled and editable when Edit is selected`, async ({ steps, settingsGuard, settingsView }) => {
    await steps.critical('Navigate to the System Setting Management module - the module landing page loads', async () => {
      await settingsView.open();
      await expect(settingsView.tabButton('general'), 'the General tab').toBeVisible();
    });

    await steps.critical('Open System Settings > Settings > General tab - the General tab loads with current values', async () => {
      await settingsView.openTab('general');
      expect(await settingsView.labelValue(VIEW_LABEL.siteTitle), 'the site title shown').toBe(settingsGuard.original['Site.Title']);
    });

    await steps.critical('Select Edit - the Edit Setting side panel opens', async () => {
      await settingsView.openEdit();
      await expect(settingsView.drawerTitle(), 'the Edit Setting drawer').toBeVisible();
    });

    await steps.step('Inspect the panel - Time Zone & Theme, Currency and Scheduled Jobs show, each pre-filled with its current, editable value', async () => {
      const text = await settingsView.drawerText();
      const { shown, wanted } = drawerAgainstStored(await settingsView.drawerValues(), await settingsGuard.current());
      expect.soft(DRAWER_SECTIONS.filter((s) => !text.includes(s)), 'sections missing from the drawer').toEqual([]);
      expect.soft(await settingsView.unusableDrawerControls(), 'controls that cannot be edited').toEqual([]);
      expect(shown, 'the drawer values vs the stored settings').toEqual(wanted);
    });
  });

  test(`TC-${CASES.timeZoneThemeControls.azureId}: should present a searchable drop-down, a text box and a file picker when the Time Zone & Theme fields are inspected`, async ({ steps, settingsGuard, settingsView }) => {

    await steps.critical('Navigate to the System Setting Management module - the module landing page loads', async () => {
      await settingsView.open();
      await expect(settingsView.editButton(), 'the Edit button').toBeVisible();
    });

    await steps.critical('Open System Settings > Settings > General tab and select Edit - the Edit Setting side panel opens', async () => {
      await settingsView.openEdit();
      await expect(settingsView.drawerTitle(), 'the Edit Setting drawer').toBeVisible();
    });

    await steps.step('Inspect the Time Zone field - it is presented as a searchable drop-down', async () => {
      const kind = await settingsView.timeZoneControlKind();
      expect({ opensList: kind.opensList, searchbox: kind.searchbox }, `the time-zone control (${kind.options} options)`).toEqual({ opensList: true, searchbox: true });
    });

    await steps.step('Inspect the Site Title field - it is presented as a text box', async () => {
      expect(await settingsView.titleControlKind(), 'the site-title control').toEqual({ tag: 'input', type: 'text', editable: true });
    });

    await steps.step('Inspect the Site Logo field - it is presented as a file picker', async () => {
      const kind = await settingsView.logoControlKind();
      expect.soft(kind.accept, 'the image types the file picker takes').toContain(CASES.timeZoneThemeControls.logoAccepts);
      expect({ type: kind.type, buttonVisible: kind.buttonVisible }, `the logo control (button "${kind.buttonText}")`).toEqual({ type: 'file', buttonVisible: true });
    });
  });

  test(`TC-${CASES.jobClocks.azureId}: should present a clock control for each of the six schedules when the Scheduled Jobs fields are inspected`, async ({ steps, settingsGuard, settingsView }) => {

    await steps.critical('Navigate to the System Setting Management module - the module landing page loads', async () => {
      await settingsView.open();
      await expect(settingsView.editButton(), 'the Edit button').toBeVisible();
    });

    await steps.critical('Open System Settings > Settings > General tab and select Edit - the Edit Setting side panel opens', async () => {
      await settingsView.openEdit();
      await expect(settingsView.drawerTitle(), 'the Edit Setting drawer').toBeVisible();
    });

    await steps.step('Inspect each of the six Scheduled Jobs fields - each is presented with a clock / time-picker control', async () => {
      const kinds = jobControlKinds(await settingsView.drawerValues());
      expect(kinds, 'the control of each schedule').toEqual(Object.fromEntries(Object.keys(kinds).map((label) => [label, 'clock'])));
      expect(Object.keys(kinds).length, 'schedules in the drawer').toBe(6);
    });
  });

  test(`TC-${CASES.onlyChangedSent.azureId}: should send and persist only the exchange rate when only the exchange rate is changed and saved`, async ({ steps, settingsGuard, settingsView }) => {
    const original = settingsGuard.original;
    const rate = nudgedRate(original['Currency.UsdToSarRate']);
    let opened: DrawerValues | null = null;
    let outcome: DrawerSaveOutcome | null = null;

    await steps.critical('Navigate to the System Setting Management module - the module landing page loads', async () => {
      await settingsView.open();
      await expect(settingsView.editButton(), 'the Edit button').toBeVisible();
    });

    await steps.critical('Open System Settings > Settings > General tab and select Edit - the Edit Setting side panel opens with current values', async () => {
      await settingsView.openEdit();
      opened = await settingsView.drawerValues();
      expect(Number(opened.rate), 'the rate the drawer opens with').toBe(Number(original['Currency.UsdToSarRate']));
    });

    await steps.critical(`Change only the Exchange Rate value (to ${rate}), leaving every other field untouched - only the Exchange Rate field shows as modified`, async () => {
      await settingsView.setRate(rate);
      expect(await settingsView.drawerValues(), 'the drawer after changing the rate').toEqual({ ...opened, rate });
    });

    await steps.step('Select Save - the panel closes and "Setting updated — The setting was updated successfully." is shown', async () => {
      outcome = await settingsView.saveAndCapture();
      expect.soft(outcome.drawerOpen, `the drawer after Save (status ${outcome.status}, answer ${outcome.answer.slice(0, 160)})`).toBe(false);
      expect(normalise(outcome.toast), 'the toast').toBe(asShown(MESSAGE.updatedEn));
    });

    await steps.step('Inspect the submitted change set - only the Exchange Rate value is included and persisted', async () => {
      const sent = (outcome as DrawerSaveOutcome | null)?.sent?.settings ?? [];
      const stored = await settingsGuard.current();
      expect.soft(sent.map((s) => s.key), `the keys Save sent (${JSON.stringify(sent).slice(0, 300)})`).toEqual([CASES.onlyChangedSent.key]);
      expect.soft(Number(stored['Currency.UsdToSarRate']), 'the rate stored').toBe(Number(rate));
      const others = GUARDED_SETTING_KEYS.filter((k) => k !== CASES.onlyChangedSent.key);
      expect(Object.fromEntries(others.map((k) => [k, stored[k]])), 'every other stored value').toEqual(Object.fromEntries(others.map((k) => [k, original[k]])));
    });
  });

  test(`TC-${CASES.saveNoChanges.azureId}: should close the panel without a request or a message when Save is selected with no changes`, async ({ steps, settingsGuard, settingsView }) => {
    let opened: DrawerValues | null = null;

    await steps.critical('Navigate to the System Setting Management module - the module landing page loads', async () => {
      await settingsView.open();
      await expect(settingsView.editButton(), 'the Edit button').toBeVisible();
    });

    await steps.critical('Open System Settings > Settings > General tab and select Edit - the Edit Setting side panel opens with current values', async () => {
      await settingsView.openEdit();
      opened = await settingsView.drawerValues();
      const { shown, wanted } = drawerAgainstStored(opened, settingsGuard.original);
      expect(shown, 'the drawer values vs the stored settings').toEqual(wanted);
    });

    await steps.step('Make no changes to any field - all fields remain at their original values', async () => {
      expect(await settingsView.drawerValues(), 'the drawer values').toEqual(opened);
    });

    await steps.step('Select Save - the panel closes immediately with no confirmation message and nothing changed', async () => {
      const outcome = await settingsView.saveAndCapture();
      expect.soft({ request: outcome.status, sent: outcome.sent, toast: outcome.toast, confirmation: outcome.confirmationOpened }, 'what Save with no changes produced').toEqual({ request: null, sent: null, toast: '', confirmation: false });
      expect.soft(outcome.drawerOpen, 'the drawer after Save').toBe(false);
      expect(await settingsGuard.current(), 'the stored settings').toEqual(settingsGuard.original);
    });
  });

  test(`TC-${CASES.successAndRefresh.azureId}: should show the bilingual success message and the new time zone at once when a valid time zone is saved`, async ({ page, steps, settingsGuard, settingsView, languageSwitcher }) => {
    const zone = otherTimeZone(settingsGuard.original['Site.TimeZone']);
    let shownRightAfterSave = '';

    await steps.critical('Navigate to the System Setting Management module - the module landing page loads', async () => {
      await settingsView.open();
      await expect(settingsView.editButton(), 'the Edit button').toBeVisible();
    });

    await steps.critical('Open System Settings > Settings > General tab and select Edit - the Edit Setting side panel opens', async () => {
      await settingsView.openEdit();
      await expect(settingsView.drawerTitle(), 'the Edit Setting drawer').toBeVisible();
    });

    await steps.critical(`Change the Time Zone to a valid new value (${zone.label}) - the field reflects the new value`, async () => {
      await settingsView.pick('timeZoneSelect', zone.label, zone.filter);
      expect((await settingsView.drawerValues()).timeZone, 'the time zone the drawer shows').toBe(normalise(zone.label));
    });

    await steps.step('Select Save - the panel closes and "Setting updated — The setting was updated successfully." / "تم تحديث الإعداد — تم تحديث الإعداد بنجاح." is shown', async () => {
      const english = await settingsView.saveAndCapture();
      shownRightAfterSave = await settingsView.labelValue(VIEW_LABEL.timeZone);
      // The Arabic toast: the same save step repeated with the UI in Arabic (a rate nudge - the zone labels are localised).
      await languageSwitcher.switchTo('ar');
      await settingsView.openEdit();
      await settingsView.setRate(nudgedRate(settingsGuard.original['Currency.UsdToSarRate']));
      const arabic = await settingsView.saveAndCapture();
      expect.soft(english.drawerOpen, `the drawer after Save (status ${english.status}, answer ${english.answer.slice(0, 160)})`).toBe(false);
      expect.soft(normalise(english.toast), 'the English toast').toBe(asShown(MESSAGE.updatedEn));
      expect(normalise(arabic.toast), `the Arabic toast (status ${arabic.status})`).toBe(asShown(MESSAGE.updatedAr));
    });

    await steps.step('Inspect the General tab - the tab has refreshed and displays the newly saved Time Zone value', async () => {
      await languageSwitcher.switchTo('en');
      expect.soft(normalise(shownRightAfterSave), 'the time zone the tab showed right after Save (no reload)').toBe(normalise(zone.label));
      expect((await readBranding(page)).timeZone, 'the time zone the platform applies (GetBranding)').toBe(zone.iana);
    });

    // Back to English even when a step above stopped early (no-op when already English).
    await languageSwitcher.switchTo('en');
  });
});
