import type { Page } from '@playwright/test';
import { NetworkUtils } from '../NetworkUtils';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import { env } from '../../constants/EnvironmentConfig';

/**
 * System Settings through the API (2026-11-09) - the readers and the single
 * writer the settings suite and its restore fixture share.
 *
 *   GET  /api/SystemSettings/GetSystemSettings   -> payload [{ key, value, englishDescription, arabicDescription, ... }]
 *   GET  /api/SystemSettings/GetBranding         -> payload { siteTitle, logoUri, timeZone }  (what every screen and the sign-in page use)
 *   PUT  /api/SystemSettings/UpsertSystemSettings { settings: [{ key, value }] } -> 200, or 422 with ValidationErrors [{ Name, Reason }]
 *
 * The drawer sends ONLY the changed keys. A picked logo is sent as a
 * `data:image/...;base64,` value and stored by the server as a file
 * (`.../api/FileUpload/Download/<guid>`); a logo URL value is accepted back
 * as-is - BUT saving a new logo DELETES the old file, so putting the old URL
 * back leaves a logo that answers 404 "The requested file was not found."
 * (full run 2026-11-09: the original logo was lost that way). `settingsGuard`
 * therefore restores the logo from its downloaded BYTES (see `downloadLogo`).
 * The currency confirmation is client-side only: the API takes Currency.Code
 * directly.
 */

/** The keys the System Setting Management stories change. Every one is snapshotted and restored by `settingsGuard`. */
export const GUARDED_SETTING_KEYS = [
  'Site.TimeZone',
  'Site.Title',
  'Site.Logo',
  'Currency.Code',
  'Currency.UsdToSarRate',
  'Jobs.AccumulatorAnnualResetCron',
  'Jobs.FormularyLifecycleCron',
  'Jobs.NetworkLifecycleCron',
  'Jobs.PayerLifecycleCron',
  'Jobs.PlanLifecycleCron',
  'Jobs.PolicyLifecycleCron',
] as const;

export type GuardedSettingKey = (typeof GUARDED_SETTING_KEYS)[number];

export interface SystemSettingRow {
  key: string;
  value: string;
  englishDescription?: string;
  arabicDescription?: string;
}

export interface Branding {
  siteTitle: string;
  logoUri: string;
  timeZone: string;
}

export interface UpsertAnswer {
  status: number;
  text: string;
  /** "Name: Reason" per validation error of a 422. */
  errors: string[];
}

async function onApp(page: Page): Promise<void> {
  if (!/^https?:/.test(page.url())) await page.goto(env.baseUrl, { waitUntil: 'domcontentloaded' });
}

export async function readAllSettings(page: Page): Promise<SystemSettingRow[]> {
  await onApp(page);
  const res = await NetworkUtils.requestAsSession(page, 'GET', ApiEndpoints.systemSettingsGet);
  if (res.status !== 200) throw new Error(`GetSystemSettings answered ${res.status}: ${res.text.slice(0, 200)}`);
  return (JSON.parse(res.text) as { payload?: SystemSettingRow[] }).payload ?? [];
}

/** The current values of the guarded keys. */
export async function readGuardedSettings(page: Page): Promise<Record<GuardedSettingKey, string>> {
  const rows = await readAllSettings(page);
  const out = {} as Record<GuardedSettingKey, string>;
  for (const key of GUARDED_SETTING_KEYS) {
    const row = rows.find((r) => r.key === key);
    if (!row) throw new Error(`GetSystemSettings has no "${key}"`);
    out[key] = row.value ?? '';
  }
  return out;
}

export async function readBranding(page: Page): Promise<Branding> {
  await onApp(page);
  const res = await NetworkUtils.requestAsSession(page, 'GET', ApiEndpoints.systemSettingsBranding);
  if (res.status !== 200) throw new Error(`GetBranding answered ${res.status}: ${res.text.slice(0, 200)}`);
  return (JSON.parse(res.text) as { payload: Branding }).payload;
}

/** A stored logo file, as the sign-in screen downloads it (no session needed). */
export interface LogoImage {
  status: number;
  contentType: string;
  bytes: Buffer;
  /** `data:<type>;base64,...` - what the drawer sends, so the server stores a NEW file with these bytes. */
  dataUrl: string;
}

/**
 * Downloads a logo URL (`.../api/FileUpload/Download/<guid>`). The stored URL
 * may name another host than the suite's BASE_URL (qc-pbm.care-connect.health
 * vs the IP), so a network error retries on the BASE_URL origin. Answers the
 * status even when it is not 200 (404 = the file was deleted).
 */
export async function downloadLogo(page: Page, url: string): Promise<LogoImage> {
  const read = async (u: string): Promise<LogoImage> => {
    const res = await page.request.get(u, { timeout: 30_000 });
    const contentType = (res.headers()['content-type'] ?? '').split(';')[0].trim();
    const bytes = await res.body();
    return { status: res.status(), contentType, bytes, dataUrl: `data:${contentType};base64,${bytes.toString('base64')}` };
  };
  try {
    return await read(url);
  } catch {
    return read(new URL(new URL(url).pathname, env.baseUrl).toString());
  }
}

/**
 * Upserts settings directly (no drawer, no client checks) - for the cases that
 * must reach the server with a value the screen would not send (EUR, a bad
 * logo, a raw CRON), and for the restore. Never call it on a key that is not
 * in GUARDED_SETTING_KEYS unless the case restores that key itself.
 */
export async function upsertSettings(page: Page, settings: { key: string; value: string }[]): Promise<UpsertAnswer> {
  await onApp(page);
  const res = await NetworkUtils.requestAsSession(page, 'PUT', ApiEndpoints.systemSettingsUpsert, { settings });
  let errors: string[] = res.validationErrors ?? [];
  if (res.status >= 400) {
    try {
      const body = JSON.parse(res.text) as { ValidationErrors?: { Name?: string; Reason?: string }[] };
      errors = (body.ValidationErrors ?? []).map((e) => `${e.Name ?? ''}: ${e.Reason ?? ''}`);
    } catch {
      /* not JSON - keep the raw text in `text` */
    }
  }
  return { status: res.status, text: res.text, errors };
}
