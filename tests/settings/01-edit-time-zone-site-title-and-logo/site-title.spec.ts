import { test, expect } from '../../../fixtures';
import { CASES, INSTANT_APPLY_WAIT_MS, KEYS, MESSAGES, NEW_INSTALL_DEFAULTS, STORY, TEXTS } from '../../../data/settings/editTimeZoneSiteTitleAndLogo.data';
import {
  blockUnlessNewInstallDefault,
  clearTitleLikeAUser,
  drawerAndToastText,
  normalise,
  readInArabic,
  signInBranding,
} from '../../../utils/settings/writerAHelpers';

/**
 * User story 20864: Edit Time Zone, Site Title and Logo - the site-title cases:
 * empty (21064) and 101 characters (21067) are refused with the AC's message in
 * English and Arabic (the drawer has no client check - the server answers 422
 * and the drawer shows it as a toast), exactly 100 characters saves (21066), and
 * the new-installation default "PBM" (21068, lead decision 1). Every test takes
 * `settingsGuard`, which restores and reads back the title after the test.
 */
test.describe(`US ${STORY.id} - ${STORY.title}`, () => {
  test.describe.configure({ timeout: 3 * 60_000 });

  test(`TC-${CASES.emptyTitle.azureId}: should refuse the save with the required-title message in English and Arabic when the site title is empty`, async ({ page, steps, settingsHub, settingsGuard }) => {
    const original = settingsGuard.original[KEYS.title];

    await steps.critical('Navigate to the System Setting Management module - the module landing page loads', async () => {
      await settingsHub.open();
      await expect(settingsHub.tabButton('general'), 'the General tab').toBeVisible();
    });

    await steps.critical('Open System Settings > Settings > General tab and select Edit - the Edit Setting side panel opens with the current Site Title populated', async () => {
      await settingsHub.openTab('general');
      await settingsHub.openEdit();
      await expect(settingsHub.control('siteTitleInput'), 'the Site title field').toHaveValue(original);
    });

    await steps.critical('Clear the Site Title field completely - the field shows as empty (0 characters)', async () => {
      await clearTitleLikeAUser(settingsHub);
      await expect(settingsHub.control('siteTitleInput'), 'the Site title field (select all + Delete)').toHaveValue('');
    });

    await steps.step(`Select Save - the save is refused, "${MESSAGES.titleInvalid.en}" / "${MESSAGES.titleInvalid.ar}" is displayed and no changes are persisted`, async () => {
      const outcome = await settingsHub.saveAndCapture();
      const shown = normalise(`${outcome.toast} ${await drawerAndToastText(page)}`);
      const stored = (await settingsGuard.current())[KEYS.title];
      const shownInArabic = await readInArabic(page, settingsHub, async () => {
        await clearTitleLikeAUser(settingsHub);
        const again = await settingsHub.saveAndCapture();
        return normalise(`${again.toast} ${await drawerAndToastText(page)}`);
      });
      expect(outcome.status === null || outcome.status >= 400, `the save should be blocked (no PUT, or a refused PUT) - status ${outcome.status}, sent ${JSON.stringify(outcome.sent)}, answer ${outcome.answer}`).toBe(true);
      expect(shown, 'the message shown after Save (English)').toContain(MESSAGES.titleInvalid.en);
      expect(stored, 'the stored site title').toBe(original);
      expect(shownInArabic, 'the message shown after Save (Arabic UI)').toContain(MESSAGES.titleInvalid.ar);
    });
  });

  test(`TC-${CASES.titleAtMaximum.azureId}: should save the site title and confirm "Setting updated" when it has exactly 100 characters`, async ({ steps, settingsHub, settingsGuard }) => {
    const d = CASES.titleAtMaximum;

    await steps.critical('Navigate to the System Setting Management module - the module landing page loads', async () => {
      await settingsHub.open();
      await expect(settingsHub.tabButton('general'), 'the General tab').toBeVisible();
    });

    await steps.critical('Open System Settings > Settings > General tab and select Edit - the Edit Setting side panel opens', async () => {
      await settingsHub.openTab('general');
      await settingsHub.openEdit();
      await expect(settingsHub.drawerTitle(), 'the Edit Setting drawer').toBeVisible();
    });

    await steps.critical('Enter a site title containing exactly 100 characters - the field accepts all 100 characters without truncation', async () => {
      await settingsHub.setSiteTitle(d.title);
      expect(d.title.length, 'the test title (data)').toBe(100);
      await expect(settingsHub.control('siteTitleInput'), 'the Site title field').toHaveValue(d.title);
    });

    await steps.step(`Select Save - the panel closes and "${TEXTS.settingUpdated}" is displayed; the 100-character title is saved`, async () => {
      const outcome = await settingsHub.saveAndCapture();
      expect({ status: outcome.status, drawerOpen: outcome.drawerOpen }, `the Save (answer ${outcome.answer}; toast "${outcome.toast}")`).toEqual({ status: 200, drawerOpen: false });
      expect(outcome.toast, 'the confirmation').toContain(TEXTS.settingUpdated);
      expect((await settingsGuard.current())[KEYS.title], 'the stored site title').toBe(d.title);
    });
  });

  test(`TC-${CASES.titleOverMaximum.azureId}: should refuse the save with the length message in English and Arabic when the site title has 101 characters`, async ({ page, steps, settingsHub, settingsGuard }) => {
    const d = CASES.titleOverMaximum;
    const original = settingsGuard.original[KEYS.title];

    await steps.critical('Navigate to the System Setting Management module - the module landing page loads', async () => {
      await settingsHub.open();
      await expect(settingsHub.tabButton('general'), 'the General tab').toBeVisible();
    });

    await steps.critical('Open System Settings > Settings > General tab and select Edit - the Edit Setting side panel opens', async () => {
      await settingsHub.openTab('general');
      await settingsHub.openEdit();
      await expect(settingsHub.drawerTitle(), 'the Edit Setting drawer').toBeVisible();
    });

    await steps.critical('Enter a site title containing 101 characters - the field shows the entered text', async () => {
      await settingsHub.setSiteTitle(d.title);
      expect(d.title.length, 'the test title (data)').toBe(101);
      await expect(settingsHub.control('siteTitleInput'), 'the Site title field').toHaveValue(d.title);
    });

    await steps.step(`Select Save - the save is refused and "${MESSAGES.titleInvalid.en}" / "${MESSAGES.titleInvalid.ar}" is displayed`, async () => {
      const outcome = await settingsHub.saveAndCapture();
      const shown = normalise(`${outcome.toast} ${await drawerAndToastText(page)}`);
      const stored = (await settingsGuard.current())[KEYS.title];
      const shownInArabic = await readInArabic(page, settingsHub, async () => {
        await settingsHub.setSiteTitle(d.title);
        const again = await settingsHub.saveAndCapture();
        return normalise(`${again.toast} ${await drawerAndToastText(page)}`);
      });
      expect(outcome.status === null || outcome.status >= 400, `the save should be blocked (no PUT, or a refused PUT) - status ${outcome.status}, answer ${outcome.answer}`).toBe(true);
      expect(shown, 'the message shown after Save (English)').toContain(MESSAGES.titleInvalid.en);
      expect(stored, 'the stored site title').toBe(original);
      expect(shownInArabic, 'the message shown after Save (Arabic UI)').toContain(MESSAGES.titleInvalid.ar);
    });
  });

  test(`TC-${CASES.titleDefault.azureId}: should show "${NEW_INSTALL_DEFAULTS.siteTitle}" as the site title in the General tab, the browser tab and the sign-in screen when the platform is a new installation`, async ({ page, steps, settingsHub, settingsGuard, signedOut }) => {
    await steps.critical('Navigate to the System Setting Management module - the module landing page loads', async () => {
      await settingsHub.open();
      await expect(settingsHub.tabButton('general'), 'the General tab').toBeVisible();
    });

    await steps.critical('Open System Settings > Settings > General tab - the General tab loads', async () => {
      await settingsHub.openTab('general');
      expect(await settingsHub.outletText(), 'the General tab').toContain(TEXTS.label.siteTitle);
    });

    await steps.step(`Inspect the Site Title value - the value shows "${NEW_INSTALL_DEFAULTS.siteTitle}" and appears in the browser tab and sign-in screen`, async () => {
      const shown = await settingsHub.readViewValue(TEXTS.label.siteTitle);
      blockUnlessNewInstallDefault(steps, 'site title', shown, NEW_INSTALL_DEFAULTS.siteTitle);
      expect(normalise(shown), 'the Site title the General tab shows').toBe(NEW_INSTALL_DEFAULTS.siteTitle);
      expect(settingsGuard.original[KEYS.title], 'the stored site title').toBe(NEW_INSTALL_DEFAULTS.siteTitle);
      expect(normalise(await page.title()), 'the browser tab title (administrator)').toBe(NEW_INSTALL_DEFAULTS.siteTitle);
      const w = await signedOut();
      await w.signIn.openSignedOut();
      await expect.poll(() => signInBranding(w.page), { message: 'the sign-in screen: tab title and the title shown with the logo', timeout: INSTANT_APPLY_WAIT_MS }).toMatchObject({ tabTitle: NEW_INSTALL_DEFAULTS.siteTitle, logoAlt: NEW_INSTALL_DEFAULTS.siteTitle });
    });
  });
});
