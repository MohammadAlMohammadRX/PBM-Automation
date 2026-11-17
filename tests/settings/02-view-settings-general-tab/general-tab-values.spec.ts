import { test, expect, blockUnlessAStepFailed, cityOf, expectedPicker, logoIdOf, normalise, rateIn, timeIn } from '../../../utils/settings/writerBHelpers';
import {
  CASES,
  CURRENCY_LABEL,
  ENGLISH_GENERAL_TEXT,
  GENERAL_SECTIONS,
  JOB_VIEW_LABEL,
  OTP_KEYS,
  OTP_STEP4_BLOCKED,
  OTP_TEXT,
  VIEW_LABEL,
} from '../../../data/settings/viewSettingsGeneralTab.data';
import { readAllSettings, readBranding } from '../../../utils/settings/systemSettingsApi';
import { JOB_KEYS } from '../../../utils/JobClock';

/** Arabic script. */
const ARABIC = /[؀-ۿ]/;

/**
 * User story 20865: View Settings - General Tab - what the General read view
 * shows, compared with what the server stores (GetSystemSettings /
 * GetBranding), in English and Arabic, and the hidden OTP section. Read-only:
 * nothing is saved (settingsGuard still guards).
 */
test.describe('US 20865 - View Settings - General Tab', () => {
  test.describe.configure({ timeout: 3 * 60_000 });

  test(`TC-${CASES.timeZoneTheme.azureId}: should show the configured time zone, site title and site logo when the General tab is opened`, async ({ page, steps, settingsGuard, settingsView }) => {
    await steps.critical('Navigate to the System Setting Management module - the module landing page loads', async () => {
      await settingsView.open();
      await expect(settingsView.tabButton('general'), 'the General tab').toBeVisible();
    });

    await steps.critical('Open System Settings > Settings > General tab - the General tab loads', async () => {
      await settingsView.openTab('general');
      expect(await settingsView.sectionsShown(), 'the General sections').toContain(GENERAL_SECTIONS[0]);
    });

    await steps.step('Inspect the Time Zone & Theme section - it shows the current Time Zone, Site Title and Site Logo values matching the configured values', async () => {
      const stored = await settingsGuard.current();
      const branding = await readBranding(page);
      const timeZone = normalise(await settingsView.labelValue(VIEW_LABEL.timeZone));
      const title = await settingsView.labelValue(VIEW_LABEL.siteTitle);
      const logo = await settingsView.readViewLogo();
      const logoId = logoIdOf(stored['Site.Logo']);
      const logoMatches = (logoId !== '' && logo.src.includes(logoId)) || (/^(blob|data):/.test(logo.src) && logo.loaded) || (stored['Site.Logo'] === '' && logo.defaultShown);
      expect.soft(timeZone.endsWith(cityOf(stored['Site.TimeZone'])), `the time zone shown "${timeZone}" for the stored "${stored['Site.TimeZone']}" (branding "${branding.timeZone}")`).toBe(true);
      expect.soft(title, `the site title shown (stored "${stored['Site.Title']}", branding "${branding.siteTitle}")`).toBe(stored['Site.Title']);
      expect(logoMatches, `the logo shown: src "${logo.src.slice(0, 120)}", loaded ${logo.loaded}, "Default logo" ${logo.defaultShown}; stored "${stored['Site.Logo'].slice(0, 120)}"`).toBe(true);
    });
  });

  test(`TC-${CASES.currency.azureId}: should show the configured currency and exchange rate when the General tab is opened`, async ({ steps, settingsGuard, settingsView }) => {
    await steps.critical('Navigate to the System Setting Management module - the module landing page loads', async () => {
      await settingsView.open();
      await expect(settingsView.tabButton('general'), 'the General tab').toBeVisible();
    });

    await steps.critical('Open System Settings > Settings > General tab - the General tab loads', async () => {
      await settingsView.openTab('general');
      expect(await settingsView.sectionsShown(), 'the General sections').toContain(GENERAL_SECTIONS[1]);
    });

    await steps.step('Inspect the Currency section - it shows the currently configured Currency and Exchange Rate values', async () => {
      const stored = await settingsGuard.current();
      const code = stored['Currency.Code'];
      const currency = await settingsView.labelValue(VIEW_LABEL.currency);
      const rate = await settingsView.labelValue(VIEW_LABEL.rate);
      expect.soft(normalise(currency), `the currency shown for the stored "${code}"`).toBe(normalise(CURRENCY_LABEL[code] ?? code));
      expect(rateIn(rate), `the exchange rate shown "${rate}" for the stored "${stored['Currency.UsdToSarRate']}"`).toBe(Number(stored['Currency.UsdToSarRate']));
    });
  });

  test(`TC-${CASES.scheduledJobs.azureId}: should list all six schedules with their configured values when the General tab is opened`, async ({ steps, settingsGuard, settingsView }) => {
    await steps.critical('Navigate to the System Setting Management module - the module landing page loads', async () => {
      await settingsView.open();
      await expect(settingsView.tabButton('general'), 'the General tab').toBeVisible();
    });

    await steps.critical('Open System Settings > Settings > General tab - the General tab loads', async () => {
      await settingsView.openTab('general');
      expect(await settingsView.sectionsShown(), 'the General sections').toContain(GENERAL_SECTIONS[2]);
    });

    await steps.step('Inspect the Scheduled Jobs section - it lists the six schedules (benefit-year reset, formulary, medical network, payer, plan, policy) with their configured values', async () => {
      const stored = await settingsGuard.current();
      const shown: Record<string, string> = {};
      const wanted: Record<string, string> = {};
      for (const key of JOB_KEYS) {
        const text = await settingsView.labelValue(JOB_VIEW_LABEL[key]);
        shown[JOB_VIEW_LABEL[key]] = timeIn(text) || text;
        wanted[JOB_VIEW_LABEL[key]] = expectedPicker(stored[key]) || `(the CRON "${stored[key]}")`;
      }
      const missing = Object.entries(shown).filter(([, v]) => v === '').map(([k]) => k);
      expect.soft(missing, 'schedules not listed').toEqual([]);
      expect(shown, 'the time each schedule shows (Riyadh) vs its stored CRON').toEqual(wanted);
    });
  });

  test(`TC-${CASES.arabic.azureId}: should show the section names and values in Arabic when the interface language is Arabic`, async ({ steps, settingsGuard, settingsView, languageSwitcher }) => {
    let lines: string[] = [];

    await steps.critical('Navigate to the System Setting Management module - the module landing page loads', async () => {
      await settingsView.open();
      await expect(settingsView.tabButton('general'), 'the General tab').toBeVisible();
    });

    await steps.critical('Switch the interface language to Arabic - the interface re-renders in Arabic', async () => {
      await languageSwitcher.switchTo('ar');
      await languageSwitcher.expectRightToLeft();
    });

    await steps.critical('Open System Settings > Settings > General tab - the General tab loads', async () => {
      await settingsView.openTab('general');
      await expect(settingsView.editButton(), 'the General tab (its Edit button)').toBeVisible();
      lines = await settingsView.lines();
    });

    await steps.step('Inspect section names and values - Time Zone & Theme, Currency, Scheduled Jobs and their values are displayed in Arabic', async () => {
      await languageSwitcher.switchTo('en');
      const english = ENGLISH_GENERAL_TEXT.filter((t) => lines.some((l) => l === t || l.startsWith(`${t} `)));
      const arabic = lines.filter((l) => ARABIC.test(l));
      expect.soft(english, `English text left on the Arabic General tab (Arabic lines: ${arabic.slice(0, 12).join(' | ')})`).toEqual([]);
      expect(arabic.length, `lines in Arabic script (screen: ${lines.slice(0, 20).join(' | ')})`).toBeGreaterThanOrEqual(GENERAL_SECTIONS.length + JOB_KEYS.length);
    });

    // Back to English even when a step above stopped early (no-op when already English).
    await languageSwitcher.switchTo('en');
  });

  test(`TC-${CASES.otpHidden.azureId}: should show no OTP section on the General tab while the OTP values stay stored`, async ({ page, steps, settingsGuard, settingsView }) => {

    await steps.critical('Navigate to the System Setting Management module - the module landing page loads', async () => {
      await settingsView.open();
      await expect(settingsView.tabButton('general'), 'the General tab').toBeVisible();
    });

    await steps.step('Open System Settings > Settings > General tab - it loads showing only Time Zone & Theme, Currency and Scheduled Jobs', async () => {
      await settingsView.openTab('general');
      expect(await settingsView.sectionsShown(), 'the sections the General tab shows').toEqual([...GENERAL_SECTIONS]);
    });

    await steps.step('Inspect the tab for an OTP / verification-code configuration section - none is visible anywhere on the tab', async () => {
      const text = (await settingsView.lines()).join(' | ');
      expect(OTP_TEXT.exec(text)?.[0] ?? '', `OTP text on the General tab (screen: ${text.slice(0, 300)})`).toBe('');
    });

    await steps.step('Trigger a sensitive action elsewhere that relies on OTP verification - the previously configured OTP behaviour is still enforced', async () => {
      const stored = await readAllSettings(page);
      expect(OTP_KEYS.filter((k) => !stored.some((r) => r.key === k)), 'OTP keys no longer stored').toEqual([]);
      blockUnlessAStepFailed(steps, OTP_STEP4_BLOCKED);
    });
  });
});
