import type { Page } from '@playwright/test';
import { readAllSettings, upsertSettings, type UpsertAnswer } from '../settings/systemSettingsApi';
import { Logger } from '../Logger';

/**
 * The GLOBAL settings the notification stories change (System Settings >
 * General, verified 2026-11-11): the notification archive / reminder keys, the
 * SMTP keys and the job CRONs. `notificationSettingsGuard` snapshots them,
 * restores whatever differs at teardown and reads it back.
 *
 *   Notifi.AutoArchiveAnnouncementsAfterRead   "1"  Auto-archive announcements after read (days)
 *   Notifi.AutoArchiveNotificationsAfterRead   "1"  Auto-archive notifications after read (days)
 *   NotifiConfig.ExpiryReminderBeforeDays      "7"  Reminder before (days)
 *   NotifiConfig.ExpiryReminderEveryDays       "1"  Remind every (1 = Every day ...)
 *   SMTP.FromEmail / SMTP.Port / SMTP.Server / SMTP.User
 *   Engine.JobFailureNotificationEmail         ""   (fallback address of the System Job Failed trigger)
 *   Jobs.*Cron                                      the six job CRONs (UTC)
 *
 * NO password key exists in GetSystemSettings (2026-11-11) - and any key whose
 * name mentions a password or secret is excluded here on purpose, so its value
 * is never held, logged or written back by the guard.
 */
export const NOTIFICATION_SETTING_PATTERN = /^(Notifi\.|NotifiConfig\.|SMTP\.|Jobs\.|Engine\.JobFailureNotificationEmail$)/;
const SECRET = /pass|secret|token|key$/i;

export function isGuardedNotificationKey(key: string): boolean {
  return NOTIFICATION_SETTING_PATTERN.test(key) && !SECRET.test(key);
}

/** The current values of every guarded key (never a secret). */
export async function readNotificationSettings(page: Page): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const row of await readAllSettings(page)) if (isGuardedNotificationKey(row.key)) out[row.key] = row.value ?? '';
  return out;
}

/** Keys whose value now differs from `original` (a key that vanished counts as differing). */
export function differingKeys(now: Record<string, string>, original: Record<string, string>): string[] {
  return Object.keys(original).filter((k) => now[k] !== original[k]);
}

/** A log-safe one-liner of the values (SMTP user / from e-mail are kept - they are not secrets). */
export function describeSettings(values: Record<string, string>): string {
  return Object.entries(values).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ');
}

/**
 * Puts back every key that differs from `original` in ONE upsert and reads it
 * back. Answers the keys it restored; throws (with what is still wrong) when
 * the read-back still differs.
 */
export async function restoreNotificationSettings(page: Page, original: Record<string, string>): Promise<string[]> {
  const changed = differingKeys(await readNotificationSettings(page), original);
  if (changed.length === 0) return [];
  Logger.step(`[notificationSettingsGuard] Restoring ${changed.join(', ')}`);
  const answer: UpsertAnswer = await upsertSettings(page, changed.map((key) => ({ key, value: original[key] })));
  if (answer.status >= 400) throw new Error(`restore upsert answered ${answer.status}: ${answer.errors.join('; ') || answer.text.slice(0, 200)}`);
  const after = await readNotificationSettings(page);
  const still = differingKeys(after, original);
  if (still.length) {
    throw new Error(`NOT RESTORED - put these back by hand: ${still.map((k) => `${k} should be "${original[k]}" (now "${after[k] ?? '<missing>'}")`).join('; ')}`);
  }
  return changed;
}
