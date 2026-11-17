import { test, expect } from '../../../fixtures';
import { CASES, INSTANT_APPLY_WAIT_MS, KEYS, PREVIEW, STORY, TEXTS } from '../../../data/settings/editTimeZoneSiteTitleAndLogo.data';
import { readBranding } from '../../../utils/settings/systemSettingsApi';
import {
  isSameDocument,
  logoPreviewSrc,
  markDocument,
  navLogoSrc,
  normalise,
  pngLogo,
  sentKeys,
  signInBranding,
} from '../../../utils/settings/writerAHelpers';

/**
 * User story 20864: Edit Time Zone, Site Title and Logo - the saves that must
 * apply everywhere at once: time zone + title + logo in one save (21062), the
 * title and logo reaching a sign-in screen that is already open, without a
 * reload (21078), and the "Setting updated" confirmation (21079). A signed-out
 * window is put on the sign-in screen BEFORE the save and never reloaded; a
 * marker on its window proves it. Every test takes `settingsGuard`, which puts
 * the time zone, title and logo back and reads them back.
 */
test.describe(`US ${STORY.id} - ${STORY.title}`, () => {
  test.describe.configure({ timeout: 4 * 60_000 });

  test(`TC-${CASES.updateAllInOneSave.azureId}: should save the time zone, site title and logo in one save and show them on every screen including the sign-in screen without a reload`, async ({ page, steps, settingsHub, settingsGuard, signedOut }) => {
    const d = CASES.updateAllInOneSave;
    const w = await signedOut();
    let signInBefore = '';
    let navBefore = '';
    let timeZoneShown = '';

    await steps.critical('Navigate to the System Setting Management module - the module landing page loads showing the Settings option (a sign-in screen is open in a second window)', async () => {
      await w.signIn.openSignedOut();
      await markDocument(w.page);
      const signIn = await signInBranding(w.page);
      signInBefore = signIn.logoSrc;
      expect(
        { set: signInBefore !== '', loads: signIn.logoLoaded },
        `the sign-in screen logo (precondition: a previous logo exists and shows - ${signInBefore.slice(0, 80)})`,
      ).toEqual({ set: true, loads: true });
      await settingsHub.open();
      await markDocument(page);
      navBefore = await navLogoSrc(page);
      await expect(settingsHub.tabButton('general'), 'the General tab').toBeVisible();
    });

    await steps.critical('Open System Settings > Settings > General tab - the General tab displays current Time Zone & Theme, Currency and Scheduled Jobs values', async () => {
      await settingsHub.openTab('general');
      const text = await settingsHub.outletText();
      expect(TEXTS.generalSections.filter((s) => !text.includes(s)), 'sections missing from the General tab').toEqual([]);
      timeZoneShown = normalise(await settingsHub.readViewValue(TEXTS.label.timeZone));
      expect(timeZoneShown, 'the Time zone shown').toMatch(TEXTS.timeZoneFormat);
    });

    await steps.critical('Select Edit - the Edit Setting side panel opens pre-filled with current values', async () => {
      await settingsHub.openEdit();
      await expect(settingsHub.control('timeZoneSelect'), 'the Time zone field').toHaveText(timeZoneShown);
      await expect(settingsHub.control('siteTitleInput'), 'the Site title field').toHaveValue(settingsGuard.original[KEYS.title]);
      expect(await logoPreviewSrc(page), 'the logo preview (current logo)').not.toBe('');
    });

    await steps.critical(`Change Time Zone to "${d.timeZone}", Site Title to "${d.siteTitle}" and upload a valid PNG logo under 1MB - the new values appear as pending changes / preview in the panel`, async () => {
      await settingsHub.pick('timeZoneSelect', d.timeZone, d.timeZoneFilter);
      await settingsHub.setSiteTitle(d.siteTitle);
      await settingsHub.pickLogo(pngLogo(d.logo));
      await expect(settingsHub.control('timeZoneSelect'), 'the Time zone field').toHaveText(d.timeZone);
      await expect(settingsHub.control('siteTitleInput'), 'the Site title field').toHaveValue(d.siteTitle);
      await expect.poll(() => logoPreviewSrc(page), { message: 'the logo preview', timeout: 10_000 }).toMatch(PREVIEW.png);
      expect((await settingsGuard.current())[KEYS.title], 'the stored title (still pending)').toBe(settingsGuard.original[KEYS.title]);
    });

    await steps.step(`Select Save - the panel closes, "${TEXTS.settingUpdated}" is displayed, and the time zone, title and logo are updated instantly on every screen including the sign-in screen without a page reload`, async () => {
      const outcome = await settingsHub.saveAndCapture();
      expect({ status: outcome.status, drawerOpen: outcome.drawerOpen }, `the Save (answer ${outcome.answer})`).toEqual({ status: 200, drawerOpen: false });
      expect(outcome.toast, 'the confirmation').toContain(TEXTS.settingUpdated);
      expect([...sentKeys(outcome)].sort(), 'the keys the Save sent').toEqual([KEYS.logo, KEYS.timeZone, KEYS.title].sort());
      // The administrator's own screens.
      await expect.poll(async () => normalise(await page.title()), { message: 'the browser tab title (administrator)', timeout: INSTANT_APPLY_WAIT_MS }).toBe(d.siteTitle);
      await expect.poll(() => settingsHub.readViewValue(TEXTS.label.timeZone), { message: 'the Time zone in the General tab', timeout: INSTANT_APPLY_WAIT_MS }).toBe(d.timeZone);
      await expect.poll(() => settingsHub.readViewValue(TEXTS.label.siteTitle), { message: 'the Site title in the General tab', timeout: INSTANT_APPLY_WAIT_MS }).toBe(d.siteTitle);
      await expect.poll(() => navLogoSrc(page), { message: `the navigation menu logo (was ${navBefore.slice(0, 80)})`, timeout: INSTANT_APPLY_WAIT_MS }).not.toBe(navBefore);
      expect((await readBranding(page)).timeZone, 'the time zone every screen loads (GetBranding)').toBe(d.timeZoneIana);
      expect(await isSameDocument(page), 'the administrator page was not reloaded').toBe(true);
      // The sign-in screen that was already open in the second window.
      await expect.poll(() => signInBranding(w.page), { message: 'the open sign-in screen (tab title, title with the logo)', timeout: INSTANT_APPLY_WAIT_MS }).toMatchObject({ tabTitle: d.siteTitle, logoAlt: d.siteTitle });
      await expect.poll(async () => (await signInBranding(w.page)).logoSrc, { message: `the open sign-in screen's logo (was ${signInBefore.slice(0, 80)})`, timeout: INSTANT_APPLY_WAIT_MS }).not.toBe(signInBefore);
      expect(await isSameDocument(w.page), 'the sign-in window was not reloaded').toBe(true);
    });
  });

  test(`TC-${CASES.instantApply.azureId}: should show the new title and logo on an already open sign-in screen without a reload when they are saved`, async ({ page, steps, settingsHub, settingsGuard, signedOut }) => {
    const d = CASES.instantApply;
    const w = await signedOut();
    let signInBefore = '';

    await steps.critical('Navigate to the System Setting Management module - the module landing page loads (another window shows the sign-in screen)', async () => {
      await w.signIn.openSignedOut();
      await markDocument(w.page);
      const before = await signInBranding(w.page);
      signInBefore = before.logoSrc;
      expect(before.tabTitle, 'the sign-in screen tab title before the save').toBe(normalise(settingsGuard.original[KEYS.title]));
      await settingsHub.open();
      await expect(settingsHub.tabButton('general'), 'the General tab').toBeVisible();
    });

    await steps.critical('Open System Settings > Settings > General tab and select Edit - the Edit Setting side panel opens', async () => {
      await settingsHub.openTab('general');
      await settingsHub.openEdit();
      await expect(settingsHub.drawerTitle(), 'the Edit Setting drawer').toBeVisible();
    });

    await steps.critical(`Change the Site Title and Site Logo, then select Save - "${TEXTS.settingUpdated}" is shown in the admin session`, async () => {
      await settingsHub.setSiteTitle(d.siteTitle);
      await settingsHub.pickLogo(pngLogo(d.logo));
      await expect.poll(() => logoPreviewSrc(page), { message: 'the logo preview', timeout: 10_000 }).toMatch(PREVIEW.png);
      const outcome = await settingsHub.saveAndCapture();
      expect({ status: outcome.status, drawerOpen: outcome.drawerOpen }, `the Save (answer ${outcome.answer})`).toEqual({ status: 200, drawerOpen: false });
      expect(outcome.toast, 'the confirmation').toContain(TEXTS.settingUpdated);
    });

    await steps.step('Switch to the other window showing the sign-in screen without refreshing it - the sign-in screen and browser tab title reflect the new title and logo immediately', async () => {
      await w.page.bringToFront();
      await expect.poll(() => signInBranding(w.page), { message: 'the open sign-in screen (tab title, title with the logo)', timeout: INSTANT_APPLY_WAIT_MS }).toMatchObject({ tabTitle: d.siteTitle, logoAlt: d.siteTitle });
      await expect.poll(async () => (await signInBranding(w.page)).logoSrc, { message: `the open sign-in screen's logo (was ${signInBefore.slice(0, 80)})`, timeout: INSTANT_APPLY_WAIT_MS }).not.toBe(signInBefore);
      expect(await isSameDocument(w.page), 'the sign-in window was not reloaded').toBe(true);
    });
  });

  test(`TC-${CASES.confirmation.azureId}: should close the panel and show "${TEXTS.settingUpdated}" when a valid new time zone is saved`, async ({ steps, settingsHub, settingsGuard }) => {
    const d = CASES.confirmation;

    await steps.critical('Navigate to the System Setting Management module - the module landing page loads', async () => {
      await settingsHub.open();
      await expect(settingsHub.tabButton('general'), 'the General tab').toBeVisible();
    });

    await steps.critical('Open System Settings > Settings > General tab and select Edit - the Edit Setting side panel opens', async () => {
      await settingsHub.openTab('general');
      await settingsHub.openEdit();
      await expect(settingsHub.drawerTitle(), 'the Edit Setting drawer').toBeVisible();
    });

    await steps.critical(`Change the Time Zone to a valid new value ("${d.timeZone}") - the field shows the newly selected value`, async () => {
      await settingsHub.pick('timeZoneSelect', d.timeZone, d.timeZoneFilter);
      await expect(settingsHub.control('timeZoneSelect'), 'the Time zone field').toHaveText(d.timeZone);
    });

    await steps.step(`Select Save - the panel closes and "${TEXTS.settingUpdated}" is displayed`, async () => {
      const outcome = await settingsHub.saveAndCapture();
      expect({ status: outcome.status, drawerOpen: outcome.drawerOpen, timeZoneSent: sentKeys(outcome).includes(KEYS.timeZone) }, `the Save (answer ${outcome.answer})`).toEqual({ status: 200, drawerOpen: false, timeZoneSent: true });
      expect(outcome.toast, 'the confirmation').toContain(TEXTS.settingUpdated);
      expect((await settingsGuard.current())[KEYS.timeZone], 'the stored time zone').not.toBe(settingsGuard.original[KEYS.timeZone]);
    });
  });
});
