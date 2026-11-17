import { test, expect } from '../../../fixtures';
import { CASES, INSTANT_APPLY_WAIT_MS, KEYS, MESSAGES, PREVIEW, STORY, TEXTS } from '../../../data/settings/editTimeZoneSiteTitleAndLogo.data';
import {
  bmpLogo,
  cancelDrawer,
  clearLogoOrBlock,
  drawerAndToastText,
  gifLogo,
  jpegLogo,
  logoPreviewSrc,
  navLogoSrc,
  pngLogo,
  pressRemoveLogo,
  readInArabic,
  readViewLogoSrc,
  sentKeys,
  signInBranding,
  textOnceShown,
  toDataUrl,
  unreadableLogo,
  uploadButtonLabel,
} from '../../../utils/settings/writerAHelpers';

/** The three logo refusals (English) - none may show after a VALID pick. */
const LOGO_REFUSALS = [MESSAGES.logoType.en, MESSAGES.logoSize.en, MESSAGES.logoUnreadable.en];

/**
 * User story 20864: Edit Time Zone, Site Title and Logo - the site-logo cases.
 * Every image is generated at runtime (utils/settings/writerAHelpers.ts). A
 * valid pick is only a preview until Save; a refused pick (GIF, over 1 MB,
 * unreadable, BMP) must show the AC's message, keep the previous preview and
 * never reach the stored logo - and the server must refuse the same file when
 * it is sent straight to it (lead decision 5). Every test takes
 * `settingsGuard`, which puts the original logo back and reads it back.
 */
test.describe(`US ${STORY.id} - ${STORY.title}`, () => {
  test.describe.configure({ timeout: 4 * 60_000 });

  test(`TC-${CASES.validJpg.azureId}: should preview, label "Replace logo", save and show the new logo in the menu and sign-in screen when a valid 300 KB JPG is picked`, async ({ page, steps, settingsHub, settingsGuard, signedOut }) => {
    const d = CASES.validJpg;
    const w = await signedOut();
    let navBefore = '';
    let signInBefore = '';

    await steps.critical('Navigate to the System Setting Management module - the module landing page loads', async () => {
      await w.signIn.openSignedOut();
      signInBefore = (await signInBranding(w.page)).logoSrc;
      await settingsHub.open();
      navBefore = await navLogoSrc(page);
      await expect(settingsHub.tabButton('general'), 'the General tab').toBeVisible();
    });

    await steps.critical('Open System Settings > Settings > General tab and select Edit - the Edit Setting side panel opens', async () => {
      await settingsHub.openTab('general');
      await settingsHub.openEdit();
      await expect(settingsHub.drawerTitle(), 'the Edit Setting drawer').toBeVisible();
    });

    await steps.critical(`Select the logo upload control and choose a valid JPG file of 300KB - the file is accepted, a preview is shown and the control reads "${TEXTS.replaceLogo}"`, async () => {
      const file = await jpegLogo(page, d.logo);
      expect(file.buffer.length, 'the generated JPG (bytes)').toBe(d.logo.bytes);
      await settingsHub.pickLogo(file);
      await expect.poll(() => logoPreviewSrc(page), { message: 'the logo preview', timeout: 10_000 }).toMatch(PREVIEW.jpeg);
      expect(await uploadButtonLabel(page), 'the upload control').toBe(TEXTS.replaceLogo);
      const shown = await drawerAndToastText(page);
      expect(LOGO_REFUSALS.filter((m) => shown.includes(m)), 'refusal messages shown for a valid file').toEqual([]);
    });

    await steps.step(`Select Save - "${TEXTS.settingUpdated}" is shown and the new logo replaces the logo in the navigation menu and sign-in screens`, async () => {
      const outcome = await settingsHub.saveAndCapture();
      expect({ status: outcome.status, logoSent: sentKeys(outcome).includes(KEYS.logo) }, `the Save (answer ${outcome.answer})`).toEqual({ status: 200, logoSent: true });
      expect(outcome.toast, 'the confirmation').toContain(TEXTS.settingUpdated);
      expect((await settingsGuard.current())[KEYS.logo], 'the stored logo').not.toBe(settingsGuard.original[KEYS.logo]);
      await expect.poll(() => navLogoSrc(page), { message: `the navigation menu logo (was ${navBefore.slice(0, 80)})`, timeout: INSTANT_APPLY_WAIT_MS }).not.toBe(navBefore);
      expect(await navLogoSrc(page), 'the navigation menu logo').not.toBe('');
      await w.signIn.openSignedOut();
      const signIn = await signInBranding(w.page);
      expect({ shown: signIn.logoLoaded, changed: signIn.logoSrc !== signInBefore }, `the sign-in screen logo (now ${signIn.logoSrc.slice(0, 80)}, was ${signInBefore.slice(0, 80)}; shown = the image loads)`).toEqual({ shown: true, changed: true });
    });
  });

  test(`TC-${CASES.unsupportedGif.azureId}: should refuse a GIF logo at pick time and when saved, with the file-type message in English and Arabic`, async ({ page, steps, settingsHub, settingsGuard }) => {
    const d = CASES.unsupportedGif;
    const original = settingsGuard.original[KEYS.logo];
    let previewBefore = '';

    await steps.critical('Navigate to the System Setting Management module - the module landing page loads', async () => {
      await settingsHub.open();
      await expect(settingsHub.tabButton('general'), 'the General tab').toBeVisible();
    });

    await steps.critical('Open System Settings > Settings > General tab and select Edit - the Edit Setting side panel opens', async () => {
      await settingsHub.openTab('general');
      await settingsHub.openEdit();
      await expect(settingsHub.drawerTitle(), 'the Edit Setting drawer').toBeVisible();
      previewBefore = await logoPreviewSrc(page);
    });

    await steps.step(`Select the logo upload control and choose a GIF file - it is rejected on picking with "${MESSAGES.logoType.en}" / "${MESSAGES.logoType.ar}", both at pick time and if Save is attempted`, async () => {
      const file = gifLogo(d.logo);
      await settingsHub.pickLogo(file);
      const shown = await textOnceShown(page, MESSAGES.logoType.en);
      const previewAfter = await logoPreviewSrc(page);
      const outcome = await settingsHub.saveAndCapture();
      const stored = (await settingsGuard.current())[KEYS.logo];
      const server = await settingsGuard.set({ [KEYS.logo]: toDataUrl(file) });
      const shownInArabic = await readInArabic(page, settingsHub, async () => {
        await settingsHub.pickLogo(file);
        return textOnceShown(page, MESSAGES.logoType.ar);
      });
      expect(shown, 'the message on picking the GIF').toContain(MESSAGES.logoType.en);
      expect(previewAfter, 'the logo preview after the refused pick').toBe(previewBefore);
      expect(sentKeys(outcome), `the keys the drawer's Save sent (status ${outcome.status})`).not.toContain(KEYS.logo);
      expect(stored, 'the stored logo after Save').toBe(original);
      expect({ refused: server.status >= 400, message: `${server.errors.join(' ')} ${server.text}`.includes(MESSAGES.logoType.en) }, `the server's answer to the GIF sent at save time: ${server.status} ${server.errors.join('; ') || server.text.slice(0, 200)}`).toEqual({ refused: true, message: true });
      expect(shownInArabic, 'the message on picking the GIF (Arabic UI)').toContain(MESSAGES.logoType.ar);
    });
  });

  test(`TC-${CASES.exactlyOneMb.azureId}: should preview and save the logo when the PNG is exactly 1 MB`, async ({ page, steps, settingsHub, settingsGuard }) => {
    const d = CASES.exactlyOneMb;

    await steps.critical('Navigate to the System Setting Management module - the module landing page loads', async () => {
      await settingsHub.open();
      await expect(settingsHub.tabButton('general'), 'the General tab').toBeVisible();
    });

    await steps.critical('Open System Settings > Settings > General tab and select Edit - the Edit Setting side panel opens', async () => {
      await settingsHub.openTab('general');
      await settingsHub.openEdit();
      await expect(settingsHub.drawerTitle(), 'the Edit Setting drawer').toBeVisible();
    });

    await steps.critical('Select the logo upload control and choose a PNG file exactly 1 MB in size - the file is accepted and previewed', async () => {
      const file = pngLogo(d.logo);
      expect(file.buffer.length, 'the generated PNG (bytes)').toBe(d.logo.bytes);
      await settingsHub.pickLogo(file);
      await expect.poll(() => logoPreviewSrc(page), { message: 'the logo preview', timeout: 10_000 }).toMatch(PREVIEW.png);
      const shown = await drawerAndToastText(page);
      expect(LOGO_REFUSALS.filter((m) => shown.includes(m)), 'refusal messages shown for a 1 MB PNG').toEqual([]);
    });

    await steps.step(`Select Save - "${TEXTS.settingUpdated}" is shown; the 1 MB logo is saved`, async () => {
      const outcome = await settingsHub.saveAndCapture();
      expect({ status: outcome.status, drawerOpen: outcome.drawerOpen, logoSent: sentKeys(outcome).includes(KEYS.logo) }, `the Save (answer ${outcome.answer})`).toEqual({ status: 200, drawerOpen: false, logoSent: true });
      expect(outcome.toast, 'the confirmation').toContain(TEXTS.settingUpdated);
      expect((await settingsGuard.current())[KEYS.logo], 'the stored logo').not.toBe(settingsGuard.original[KEYS.logo]);
    });
  });

  test(`TC-${CASES.overOneMb.azureId}: should refuse a 1.1 MB logo at pick time and when saved, with the size message in English and Arabic`, async ({ page, steps, settingsHub, settingsGuard }) => {
    const d = CASES.overOneMb;
    const original = settingsGuard.original[KEYS.logo];
    let previewBefore = '';

    await steps.critical('Navigate to the System Setting Management module - the module landing page loads', async () => {
      await settingsHub.open();
      await expect(settingsHub.tabButton('general'), 'the General tab').toBeVisible();
    });

    await steps.critical('Open System Settings > Settings > General tab and select Edit - the Edit Setting side panel opens', async () => {
      await settingsHub.openTab('general');
      await settingsHub.openEdit();
      await expect(settingsHub.drawerTitle(), 'the Edit Setting drawer').toBeVisible();
      previewBefore = await logoPreviewSrc(page);
    });

    await steps.step(`Select the logo upload control and choose a PNG file of 1.1 MB - it is rejected on picking with "${MESSAGES.logoSize.en}" / "${MESSAGES.logoSize.ar}", both at pick time and if Save is attempted`, async () => {
      const file = pngLogo(d.logo);
      expect(file.buffer.length, 'the generated PNG (bytes)').toBe(d.logo.bytes);
      await settingsHub.pickLogo(file);
      const shown = await textOnceShown(page, MESSAGES.logoSize.en);
      const previewAfter = await logoPreviewSrc(page);
      const outcome = await settingsHub.saveAndCapture();
      const stored = (await settingsGuard.current())[KEYS.logo];
      const server = await settingsGuard.set({ [KEYS.logo]: toDataUrl(file) });
      const shownInArabic = await readInArabic(page, settingsHub, async () => {
        await settingsHub.pickLogo(file);
        return textOnceShown(page, MESSAGES.logoSize.ar);
      });
      expect(shown, 'the message on picking the 1.1 MB PNG').toContain(MESSAGES.logoSize.en);
      expect(previewAfter, 'the logo preview after the refused pick').toBe(previewBefore);
      expect(sentKeys(outcome), `the keys the drawer's Save sent (status ${outcome.status})`).not.toContain(KEYS.logo);
      expect(stored, 'the stored logo after Save').toBe(original);
      expect({ refused: server.status >= 400, message: `${server.errors.join(' ')} ${server.text}`.includes(MESSAGES.logoSize.en) }, `the server's answer to the 1.1 MB PNG sent at save time: ${server.status} ${server.errors.join('; ') || server.text.slice(0, 200)}`).toEqual({ refused: true, message: true });
      expect(shownInArabic, 'the message on picking the 1.1 MB PNG (Arabic UI)').toContain(MESSAGES.logoSize.ar);
    });
  });

  test(`TC-${CASES.unreadable.azureId}: should show the could-not-be-read message in English and Arabic and apply no logo change when an unreadable PNG is picked`, async ({ page, steps, settingsHub, settingsGuard }) => {
    const d = CASES.unreadable;
    const original = settingsGuard.original[KEYS.logo];
    let previewBefore = '';

    await steps.critical('Navigate to the System Setting Management module - the module landing page loads', async () => {
      await settingsHub.open();
      await expect(settingsHub.tabButton('general'), 'the General tab').toBeVisible();
    });

    await steps.critical('Open System Settings > Settings > General tab and select Edit - the Edit Setting side panel opens', async () => {
      await settingsHub.openTab('general');
      await settingsHub.openEdit();
      await expect(settingsHub.drawerTitle(), 'the Edit Setting drawer').toBeVisible();
      previewBefore = await logoPreviewSrc(page);
    });

    await steps.step(`Select the logo upload control and choose a corrupted/unreadable PNG file - "${MESSAGES.logoUnreadable.en}" / "${MESSAGES.logoUnreadable.ar}" is displayed and no logo change is applied`, async () => {
      const file = unreadableLogo(d.logo);
      await settingsHub.pickLogo(file);
      const shown = await textOnceShown(page, MESSAGES.logoUnreadable.en);
      const previewAfter = await logoPreviewSrc(page);
      const stored = (await settingsGuard.current())[KEYS.logo];
      const shownInArabic = await readInArabic(page, settingsHub, async () => {
        await settingsHub.pickLogo(file);
        return textOnceShown(page, MESSAGES.logoUnreadable.ar);
      });
      expect(shown, 'the message on picking the unreadable PNG').toContain(MESSAGES.logoUnreadable.en);
      expect(previewAfter, 'the logo preview after the unreadable pick').toBe(previewBefore);
      expect(stored, 'the stored logo').toBe(original);
      expect(shownInArabic, 'the message on picking the unreadable PNG (Arabic UI)').toContain(MESSAGES.logoUnreadable.ar);
    });
  });

  test(`TC-${CASES.removeLogo.azureId}: should restore the default logo in the overview, the menu and the sign-in screen when the logo is removed and saved`, async ({ page, steps, settingsHub, settingsGuard, signedOut }) => {
    const w = await signedOut();
    let navBefore = '';
    let signInBefore = '';
    let previewBefore = '';

    await steps.critical('Navigate to the System Setting Management module - the module landing page loads', async () => {
      expect(settingsGuard.original[KEYS.logo], 'a custom logo is set (precondition)').not.toBe('');
      await w.signIn.openSignedOut();
      signInBefore = (await signInBranding(w.page)).logoSrc;
      await settingsHub.open();
      navBefore = await navLogoSrc(page);
      await expect(settingsHub.tabButton('general'), 'the General tab').toBeVisible();
    });

    await steps.critical('Open System Settings > Settings > General tab and select Edit - the Edit Setting side panel opens showing the current custom logo', async () => {
      await settingsHub.openTab('general');
      await settingsHub.openEdit();
      await expect(settingsHub.drawerTitle(), 'the Edit Setting drawer').toBeVisible();
      previewBefore = await logoPreviewSrc(page);
      expect(previewBefore, 'the logo preview (current custom logo)').not.toBe('');
    });

    await steps.critical('Select Remove on the logo control - the logo control reverts to a "no logo" state', async () => {
      await pressRemoveLogo(page);
      await expect.poll(() => logoPreviewSrc(page), { message: 'the logo preview after Remove', timeout: 10_000 }).not.toBe(previewBefore);
      expect(await uploadButtonLabel(page), 'the upload control after Remove').not.toBe(TEXTS.replaceLogo);
    });

    await steps.critical(`Select Save - "${TEXTS.settingUpdated}" confirmation is shown`, async () => {
      const outcome = await settingsHub.saveAndCapture();
      expect({ status: outcome.status, drawerOpen: outcome.drawerOpen, logoSent: sentKeys(outcome).includes(KEYS.logo) }, `the Save (answer ${outcome.answer})`).toEqual({ status: 200, drawerOpen: false, logoSent: true });
      expect(outcome.toast, 'the confirmation').toContain(TEXTS.settingUpdated);
    });

    await steps.step(`Open the General tab overview again - the logo section shows "${TEXTS.defaultLogo}" and the default logo is back in the menu and sign-in screens`, async () => {
      await settingsHub.open();
      await settingsHub.openTab('general');
      await expect.poll(() => settingsHub.readViewValue(TEXTS.label.siteLogo), { message: 'the Site logo in the overview', timeout: 10_000 }).toBe(TEXTS.defaultLogo);
      expect(await navLogoSrc(page), 'the navigation menu logo (must no longer be the custom one)').not.toBe(navBefore);
      await w.signIn.openSignedOut();
      expect((await signInBranding(w.page)).logoSrc, 'the sign-in screen logo (must no longer be the custom one)').not.toBe(signInBefore);
    });
  });

  test(`TC-${CASES.cancelPreview.azureId}: should discard the picked logo and keep the saved one when the drawer is cancelled`, async ({ page, steps, settingsHub, settingsGuard }) => {
    const d = CASES.cancelPreview;
    const original = settingsGuard.original[KEYS.logo];
    let readViewBefore = '';
    let previewBefore = '';

    await steps.critical('Navigate to the System Setting Management module - the module landing page loads', async () => {
      await settingsHub.open();
      await expect(settingsHub.tabButton('general'), 'the General tab').toBeVisible();
    });

    await steps.critical('Open System Settings > Settings > General tab and select Edit - the Edit Setting side panel opens showing the current logo', async () => {
      await settingsHub.openTab('general');
      readViewBefore = await readViewLogoSrc(page);
      await settingsHub.openEdit();
      await expect(settingsHub.drawerTitle(), 'the Edit Setting drawer').toBeVisible();
      previewBefore = await logoPreviewSrc(page);
      expect(previewBefore, 'the logo preview (current logo)').not.toBe('');
    });

    await steps.critical('Select the logo upload control and choose a new valid logo file - the new logo is shown as a preview only, not yet saved', async () => {
      await settingsHub.pickLogo(pngLogo(d.logo));
      await expect.poll(() => logoPreviewSrc(page), { message: 'the logo preview', timeout: 10_000 }).toMatch(PREVIEW.png);
      expect((await settingsGuard.current())[KEYS.logo], 'the stored logo (preview only)').toBe(original);
    });

    await steps.critical('Select Cancel and confirm discarding changes if prompted - the panel closes', async () => {
      expect(await cancelDrawer(page, settingsHub), 'the Edit Setting drawer closed').toBe(true);
    });

    await steps.step('Reopen the General tab - the previously saved logo is still displayed, not the preview', async () => {
      await settingsHub.open();
      await settingsHub.openTab('general');
      await expect.poll(() => readViewLogoSrc(page), { message: 'the Site logo in the General tab', timeout: 10_000 }).toBe(readViewBefore);
      expect(readViewBefore, 'the logo shown before the pick').not.toMatch(PREVIEW.picked);
      expect((await settingsGuard.current())[KEYS.logo], 'the stored logo').toBe(original);
    });
  });

  test(`TC-${CASES.replaceLabel.azureId}: should label the upload control "Replace logo" when a logo has been set`, async ({ page, steps, settingsHub, settingsGuard }) => {
    const d = CASES.replaceLabel;

    await steps.critical('Navigate to the System Setting Management module - the module landing page loads', async () => {
      await clearLogoOrBlock(steps, settingsGuard);
      expect((await settingsGuard.current())[KEYS.logo], 'the stored logo (precondition: no logo set)').toBe(d.noLogo);
      await settingsHub.open();
      await expect(settingsHub.tabButton('general'), 'the General tab').toBeVisible();
    });

    await steps.critical('Open System Settings > Settings > General tab and select Edit - the Edit Setting side panel opens; the logo control shows an upload prompt since no logo is set', async () => {
      await settingsHub.openTab('general');
      await settingsHub.openEdit();
      await expect(settingsHub.drawerTitle(), 'the Edit Setting drawer').toBeVisible();
      const label = await uploadButtonLabel(page);
      expect({ offered: label !== '', replace: label === TEXTS.replaceLogo }, `the upload control with no logo set (reads "${label}")`).toEqual({ offered: true, replace: false });
    });

    await steps.critical(`Upload a valid logo and select Save - "${TEXTS.settingUpdated}" confirmation is shown`, async () => {
      await settingsHub.pickLogo(pngLogo(d.logo));
      await expect.poll(() => logoPreviewSrc(page), { message: 'the logo preview', timeout: 10_000 }).toMatch(PREVIEW.png);
      const outcome = await settingsHub.saveAndCapture();
      expect({ status: outcome.status, drawerOpen: outcome.drawerOpen }, `the Save (answer ${outcome.answer})`).toEqual({ status: 200, drawerOpen: false });
      expect(outcome.toast, 'the confirmation').toContain(TEXTS.settingUpdated);
    });

    await steps.step(`Reopen the Edit panel - the logo upload control now reads "${TEXTS.replaceLogo}"`, async () => {
      await settingsHub.openEdit();
      await expect(settingsHub.drawerTitle(), 'the Edit Setting drawer').toBeVisible();
      await expect.poll(() => uploadButtonLabel(page), { message: 'the upload control once a logo is set', timeout: 10_000 }).toBe(TEXTS.replaceLogo);
    });

    await cancelDrawer(page, settingsHub);
  });

  test(`TC-${CASES.serverRevalidation.azureId}: should refuse an invalid logo at pick time and again when it reaches the save request`, async ({ page, steps, settingsHub, settingsGuard }) => {
    const d = CASES.serverRevalidation;
    let previewBefore = '';

    await steps.critical('Navigate to the System Setting Management module - the module landing page loads', async () => {
      await settingsHub.open();
      await expect(settingsHub.tabButton('general'), 'the General tab').toBeVisible();
    });

    await steps.critical('Open System Settings > Settings > General tab and select Edit - the Edit Setting side panel opens', async () => {
      await settingsHub.openTab('general');
      await settingsHub.openEdit();
      await expect(settingsHub.drawerTitle(), 'the Edit Setting drawer').toBeVisible();
      previewBefore = await logoPreviewSrc(page);
    });

    await steps.step(`Attempt to pick an invalid-type, oversized file (a 2MB BMP) - it is rejected at pick time with "${MESSAGES.logoType.en}"`, async () => {
      const file = bmpLogo(d.bmp);
      expect(file.buffer.length, 'the generated BMP (bytes)').toBe(d.bmp.bytes);
      await settingsHub.pickLogo(file);
      const shown = await textOnceShown(page, MESSAGES.logoType.en);
      expect(shown, 'the message on picking the BMP').toContain(MESSAGES.logoType.en);
      expect(await logoPreviewSrc(page), 'the logo preview after the refused pick').toBe(previewBefore);
    });

    await steps.step('Pick a valid file, then bypass the client check to submit an invalid file in the save request - the server re-validates and refuses it with the type / size message', async () => {
      await settingsHub.pickLogo(pngLogo(d.valid));
      await expect.poll(() => logoPreviewSrc(page), { message: 'the valid logo preview', timeout: 10_000 }).toMatch(PREVIEW.png);
      const badType = await settingsGuard.set({ [KEYS.logo]: toDataUrl(gifLogo(d.badType)) });
      const tooBig = await settingsGuard.set({ [KEYS.logo]: toDataUrl(pngLogo(d.tooBig)) });
      expect({ refused: badType.status >= 400, message: `${badType.errors.join(' ')} ${badType.text}`.includes(MESSAGES.logoType.en) }, `the server's answer to a GIF in the save request: ${badType.status} ${badType.errors.join('; ') || badType.text.slice(0, 200)}`).toEqual({ refused: true, message: true });
      expect({ refused: tooBig.status >= 400, message: `${tooBig.errors.join(' ')} ${tooBig.text}`.includes(MESSAGES.logoSize.en) }, `the server's answer to a 1.1 MB PNG in the save request: ${tooBig.status} ${tooBig.errors.join('; ') || tooBig.text.slice(0, 200)}`).toEqual({ refused: true, message: true });
    });

    // The valid pick is discarded - nothing of this case is saved through the drawer.
    await cancelDrawer(page, settingsHub);
  });
});
