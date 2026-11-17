import { test as base } from '@playwright/test';
import type { Page } from '@playwright/test';
import { SettingsHubPage } from '../pages/settings/SettingsHubPage';
import { Logger } from '../utils/Logger';
import { env } from '../constants/EnvironmentConfig';
import {
  GUARDED_SETTING_KEYS,
  downloadLogo,
  readGuardedSettings,
  upsertSettings,
  type GuardedSettingKey,
  type LogoImage,
  type UpsertAnswer,
} from '../utils/settings/systemSettingsApi';

/**
 * System Setting Management fixtures (Feature 20863, 2026-11-09).
 *
 * `settingsGuard` - EVERY settings test takes it. At setup it reads the
 * guarded keys (time zone, title, logo, currency, rate, the six job CRONs) -
 * the ORIGINAL values. At teardown it re-reads them, puts back every key that
 * differs in ONE upsert, reads them back again, and FAILS the test loudly
 * (annotation `setting-not-restored`) when any key still differs. A case
 * therefore changes settings freely - through the drawer or `set()` - and
 * never restores by hand (it may call `restoreNow()` mid-case, e.g. before a
 * second scenario).
 *
 * The logo is restored from its IMAGE, not its URL: saving a new logo deletes
 * the old file on the server, so the old URL put back answers 404 (full run
 * 2026-11-09 - the environment's original logo was lost that way). At setup
 * the guard downloads the original logo; at restore it sends those bytes as a
 * `data:` URL (the server stores a new file under a new URL) and reads back
 * by comparing the downloaded bytes. When the original logo is already broken
 * (404) it can only put the URL back, and says so in the log.
 *
 * These are GLOBAL settings - every user of the environment sees a changed
 * title, logo, time zone or currency until the restore. Keep each change as
 * short as the case allows.
 *
 * `settingsHub` - the hub page object on the default (administrator) page.
 */
export interface SettingsGuard {
  /** The values read before the test changed anything. */
  readonly original: Readonly<Record<GuardedSettingKey, string>>;
  /** The values now (fresh GET). */
  current(): Promise<Record<GuardedSettingKey, string>>;
  /** Upserts through the API (no client checks) - the original is already held. */
  set(changes: Partial<Record<GuardedSettingKey, string>>): Promise<UpsertAnswer>;
  /** Puts every changed key back now and verifies; throws when it cannot. */
  restoreNow(): Promise<void>;
}

export interface SettingsModuleFixtures {
  settingsGuard: SettingsGuard;
  settingsHub: SettingsHubPage;
}

const LOGO: GuardedSettingKey = 'Site.Logo';

/** The original logo's image, when it is a downloadable file (null: no logo, a data URL, or a broken file). */
async function snapshotLogo(page: Page, value: string): Promise<LogoImage | null> {
  if (!/^https?:\/\//i.test(value)) return null;
  const image = await downloadLogo(page, value).catch((error) => {
    Logger.warn(`[settingsGuard] The original logo could not be downloaded (${String(error).split('\n')[0]}) - only its URL can be put back`);
    return null;
  });
  if (!image) return null;
  if (image.status !== 200 || !image.contentType.startsWith('image/')) {
    Logger.warn(`[settingsGuard] The original logo is already broken (${image.status} ${image.contentType}) - only its URL can be put back: ${value}`);
    return null;
  }
  return image;
}

/** Whether the logo now shows the original image (same URL, or a new file with the same bytes). */
async function sameLogo(page: Page, now: string, original: string, image: LogoImage | null): Promise<boolean> {
  if (now === original) return true;
  if (!image || !/^https?:\/\//i.test(now)) return false;
  const current = await downloadLogo(page, now).catch(() => null);
  return !!current && current.status === 200 && current.bytes.equals(image.bytes);
}

async function differing(
  page: Page,
  now: Record<GuardedSettingKey, string>,
  original: Record<GuardedSettingKey, string>,
  image: LogoImage | null,
): Promise<GuardedSettingKey[]> {
  const out: GuardedSettingKey[] = [];
  for (const k of GUARDED_SETTING_KEYS) {
    const same = k === LOGO ? await sameLogo(page, now[k], original[k], image) : now[k] === original[k];
    if (!same) out.push(k);
  }
  return out;
}

async function restore(page: Page, original: Record<GuardedSettingKey, string>, image: LogoImage | null): Promise<GuardedSettingKey[]> {
  const changed = await differing(page, await readGuardedSettings(page), original, image);
  if (changed.length === 0) return [];
  Logger.step(`[settingsGuard] Restoring ${changed.join(', ')}${changed.includes(LOGO) && image ? ' (the logo from its original image bytes)' : ''}`);
  const answer = await upsertSettings(
    page,
    changed.map((key) => ({ key, value: key === LOGO && image ? image.dataUrl : original[key] })),
  );
  if (answer.status >= 400) throw new Error(`restore upsert answered ${answer.status}: ${answer.errors.join('; ') || answer.text.slice(0, 200)}`);
  const after = await readGuardedSettings(page);
  const still = await differing(page, after, original, image);
  if (still.length > 0) {
    throw new Error(
      `NOT RESTORED - put these back by hand: ${still
        .map((k) => `${k} should be "${original[k].slice(0, 120)}" (now "${after[k].slice(0, 120)}")`)
        .join('; ')}`,
    );
  }
  return changed;
}

export const test = base.extend<SettingsModuleFixtures>({
  settingsGuard: async ({ page }, use, testInfo) => {
    if (!/^https?:/.test(page.url())) await page.goto(env.baseUrl, { waitUntil: 'domcontentloaded' });
    const original = await readGuardedSettings(page);
    const logoImage = await snapshotLogo(page, original[LOGO]);
    Logger.step(
      `[settingsGuard] Original settings: ${JSON.stringify({ ...original, [LOGO]: original[LOGO].slice(0, 80) })}`
        + (logoImage ? ` (logo image ${logoImage.contentType}, ${logoImage.bytes.length} bytes held for the restore)` : ''),
    );
    await use({
      original,
      current: () => readGuardedSettings(page),
      set: (changes) => upsertSettings(page, Object.entries(changes).map(([key, value]) => ({ key, value: value as string }))),
      restoreNow: async () => {
        await restore(page, original, logoImage);
      },
    });
    try {
      // The page may sit on a closed drawer, a dialog or the login page - the API needs only the app origin + token.
      if (!/^https?:/.test(page.url())) await page.goto(env.baseUrl, { waitUntil: 'domcontentloaded' });
      const restored = await restore(page, original, logoImage);
      if (restored.length) Logger.step(`[settingsGuard] Restored and read back: ${restored.join(', ')}`);
    } catch (error) {
      testInfo.annotations.push({ type: 'setting-not-restored', description: String(error) });
      Logger.error(`[settingsGuard] ${String(error)}`);
      throw error;
    }
  },

  settingsHub: async ({ page }, use) => {
    await use(new SettingsHubPage(page));
  },
});
