import type { Page } from '@playwright/test';
import { NetworkUtils } from './NetworkUtils';
import { Logger } from './Logger';
import { ApiEndpoints } from '../constants/ApiEndpoints';
import { env } from '../constants/EnvironmentConfig';

/**
 * The shared scheduled-job clock (2026-11-08) - every suite moves a daily job
 * through these helpers (the `jobClock` fixture, and the Member suite's
 * `memberJobClock`, which delegates here).
 *
 * WHAT THE JOBS ARE. System Settings > Settings > General > "Scheduled Jobs"
 * holds six keys, each a UTC CRON. Five lifecycle jobs (formulary, network,
 * payer, plan, policy) take either a daily time (`m h * * *`) or an interval
 * (`* * * * *`, `*\/5|10|15|30 * * * *`, `0 * * * *` - the screen's
 * "Frequency" select); the Accumulator Annual Reset is daily only. The screen
 * shows a daily time in Riyadh time ("Every day at 12:15 am (Riyadh)", picker
 * "12:15 AM", hint "Runs at 21:15 UTC") and stores UTC. Saving is
 * PUT UpsertSystemSettings `{ settings: [{ key, value }] }` (200, audited as
 * a SystemSetting UPDATE with before/after values). ADMINISTRATOR ONLY.
 *
 * HOW A CASE USES IT. A record whose date has passed does not change until
 * the job runs; the case moves the job to fire a couple of minutes ahead,
 * polls the record (`waitFor`), and the fixture puts the ORIGINAL value back
 * in teardown and reads it back. Moving a job runs it for EVERY record, not
 * only the suite's - accepted by the user (2026-11-08).
 *
 * See reports/manual-automation/Foundation-Notes.md for the live timings.
 */

/** The scheduled-job keys (System Settings, stored as UTC CRON). */
export type JobKey =
  | 'Jobs.AccumulatorAnnualResetCron'
  | 'Jobs.PolicyLifecycleCron'
  | 'Jobs.PlanLifecycleCron'
  | 'Jobs.NetworkLifecycleCron'
  | 'Jobs.FormularyLifecycleCron'
  | 'Jobs.PayerLifecycleCron';

/** Every job key, in the screen's order. */
export const JOB_KEYS: readonly JobKey[] = [
  'Jobs.AccumulatorAnnualResetCron',
  'Jobs.FormularyLifecycleCron',
  'Jobs.NetworkLifecycleCron',
  'Jobs.PayerLifecycleCron',
  'Jobs.PlanLifecycleCron',
  'Jobs.PolicyLifecycleCron',
];

/**
 * The values the jobs normally hold (user, 2026-11-08). Only for checks and
 * messages - a fixture restores what it READ before moving, never these.
 */
export const NORMAL_JOB_CRONS: Readonly<Record<JobKey, string>> = {
  'Jobs.AccumulatorAnnualResetCron': '45 0 * * *',
  'Jobs.FormularyLifecycleCron': '15 21 * * *',
  'Jobs.NetworkLifecycleCron': '15 21 * * *',
  'Jobs.PayerLifecycleCron': '20 9 * * *',
  'Jobs.PlanLifecycleCron': '15 21 * * *',
  'Jobs.PolicyLifecycleCron': '15 21 * * *',
};

/** The screen's id fragment for a key: `settings-general-jobs-<fragment>-time|frequency|utc-hint`. */
export function jobIdFragment(key: JobKey): string {
  return key.toLowerCase().replace(/^jobs\./, '');
}

export type JobAnswer = { status: number; text: string; validationErrors: string[] };

const ensureApp = async (page: Page): Promise<void> => {
  if (!/^https?:/.test(page.url())) await page.goto(env.baseUrl);
};

/** Every system setting `{ key, value }` (GetSystemSettings). */
export async function readSystemSettings(page: Page): Promise<{ key: string; value: string; englishDescription?: string }[]> {
  await ensureApp(page);
  const res = await NetworkUtils.requestAsSession(page, 'GET', ApiEndpoints.systemSettingsGet);
  if (res.status !== 200) throw new Error(`GetSystemSettings answered ${res.status} ${res.text.slice(0, 200)}`);
  return (JSON.parse(res.text) as { payload?: { key: string; value: string; englishDescription?: string }[] }).payload ?? [];
}

/** A job's stored CRON (GetSystemSettings), '' when absent. */
export async function readJobCron(page: Page, key: JobKey): Promise<string> {
  return (await readSystemSettings(page)).find((s) => s.key === key)?.value ?? '';
}

/** All six job CRONs in one read. */
export async function readAllJobCrons(page: Page): Promise<Record<JobKey, string>> {
  const settings = await readSystemSettings(page);
  return Object.fromEntries(JOB_KEYS.map((k) => [k, settings.find((s) => s.key === k)?.value ?? ''])) as Record<JobKey, string>;
}

/**
 * Saves a job's CRON through the General drawer's own call (PUT
 * UpsertSystemSettings `{ settings: [{ key, value }] }`) - ADMIN ONLY. An
 * unparseable value is refused server-side (see the notes for the answer).
 */
export async function writeJobCron(page: Page, key: JobKey, cron: string): Promise<JobAnswer> {
  await ensureApp(page);
  return NetworkUtils.requestAsSession(page, 'PUT', ApiEndpoints.systemSettingsUpsert, { settings: [{ key, value: cron }] });
}

// ---- time helpers ---------------------------------------------------------------------

/** Riyadh is UTC+3 all year (no daylight saving). */
export const RIYADH_OFFSET_MINUTES = 180;

/** The daily UTC CRON (`m h * * *`) that fires at `at` (seconds ignored). */
export function cronAt(at: Date): string {
  return `${at.getUTCMinutes()} ${at.getUTCHours()} * * *`;
}

/** The daily UTC CRON (`m h * * *`) that fires `minutes` from now (the minute `now + minutes` falls in). */
export function cronInMinutes(minutes: number, from = Date.now()): string {
  return cronAt(new Date(from + minutes * 60_000));
}

/**
 * The next instant a CRON fires after `from` - daily `m h * * *` and the
 * screen's intervals (`* * * * *`, `*\/N * * * *`, `0 * * * *`). null for
 * anything else.
 */
export function nextFiring(cron: string, from = new Date()): Date | null {
  const t = cron.trim();
  const daily = /^(\d{1,2})\s+(\d{1,2})\s+\*\s+\*\s+\*$/.exec(t);
  const base = new Date(from.getTime());
  base.setUTCSeconds(0, 0);
  if (daily) {
    const at = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), Number(daily[2]), Number(daily[1])));
    if (at.getTime() <= from.getTime()) at.setUTCDate(at.getUTCDate() + 1);
    return at;
  }
  const every = /^\*\s+\*\s+\*\s+\*\s+\*$/.test(t) ? 1 : /^0\s+\*\s+\*\s+\*\s+\*$/.test(t) ? 60 : Number(/^\*\/(\d{1,2})\s+\*\s+\*\s+\*\s+\*$/.exec(t)?.[1] ?? NaN);
  if (!Number.isFinite(every)) return null;
  const next = new Date(base.getTime() + 60_000);
  while (next.getUTCMinutes() % every !== 0) next.setTime(next.getTime() + 60_000);
  return next;
}

/** The Riyadh calendar date of an instant, `YYYY-MM-DD`. */
export function riyadhDate(at: Date | string | number = Date.now()): string {
  return new Date(new Date(at).getTime() + RIYADH_OFFSET_MINUTES * 60_000).toISOString().slice(0, 10);
}

/** The UTC calendar date of an instant, `YYYY-MM-DD`. */
export function utcDate(at: Date | string | number = Date.now()): string {
  return new Date(at).toISOString().slice(0, 10);
}

/** The Riyadh wall-clock time of an instant, `HH:mm` (24 h). */
export function riyadhTime(at: Date | string | number = Date.now()): string {
  return new Date(new Date(at).getTime() + RIYADH_OFFSET_MINUTES * 60_000).toISOString().slice(11, 16);
}

/** The picker text the screen shows for a daily CRON ("12:15 AM"), or '' for an interval. */
export function cronToRiyadhPicker(cron: string): string {
  const m = /^(\d{1,2})\s+(\d{1,2})\s+\*\s+\*\s+\*$/.exec(cron.trim());
  if (!m) return '';
  const total = (Number(m[2]) * 60 + Number(m[1]) + RIYADH_OFFSET_MINUTES) % (24 * 60);
  const h = Math.floor(total / 60);
  const mm = String(total % 60).padStart(2, '0');
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(h12).padStart(2, '0')}:${mm} ${h < 12 ? 'AM' : 'PM'}`;
}

/** The UTC hint the screen shows under the picker ("Runs at 21:15 UTC"), or ''. */
export function cronToUtcHint(cron: string): string {
  const m = /^(\d{1,2})\s+(\d{1,2})\s+\*\s+\*\s+\*$/.exec(cron.trim());
  return m ? `Runs at ${m[2].padStart(2, '0')}:${m[1].padStart(2, '0')} UTC` : '';
}

/** The daily UTC CRON for a Riyadh wall-clock time ("00:00" .. "23:59"). */
export function riyadhTimeToCron(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) throw new Error(`"${hhmm}" is not HH:mm`);
  const total = (Number(m[1]) * 60 + Number(m[2]) - RIYADH_OFFSET_MINUTES + 24 * 60) % (24 * 60);
  return `${total % 60} ${Math.floor(total / 60)} * * *`;
}

// ---- waiting ------------------------------------------------------------------------

export interface WaitForOptions {
  /** Give up after this long (default 4 min). */
  timeoutMs?: number;
  /** Poll interval (default 10 s). */
  intervalMs?: number;
  /** What is being waited for, for the log. */
  describe?: string;
}

export interface WaitForResult<T> {
  /** Whether the predicate held before the timeout. */
  ok: boolean;
  /** The last value read. */
  value: T;
  /** How long it took (or the whole timeout). */
  elapsedMs: number;
}

/**
 * Polls `read` until `predicate(value)` holds or the timeout passes - the
 * bounded "the job has run" wait. Never throws on a timeout (the case asserts
 * on `ok` / `value`, so a job that changed nothing is a reported outcome, not
 * a crash); a read that throws is retried until the deadline.
 */
export async function waitFor<T>(
  page: Page,
  read: () => Promise<T>,
  predicate: (value: T) => boolean,
  options: WaitForOptions = {},
): Promise<WaitForResult<T>> {
  const timeoutMs = options.timeoutMs ?? 4 * 60_000;
  const intervalMs = options.intervalMs ?? 10_000;
  const started = Date.now();
  let value = undefined as T;
  for (;;) {
    try {
      value = await read();
      if (predicate(value)) {
        const elapsedMs = Date.now() - started;
        if (options.describe) Logger.step(`[job] ${options.describe} - after ${Math.round(elapsedMs / 1000)} s`);
        return { ok: true, value, elapsedMs };
      }
    } catch (error) {
      Logger.warn(`[job] read failed while waiting${options.describe ? ` for ${options.describe}` : ''}: ${(error as Error).message.slice(0, 200)}`);
    }
    if (Date.now() - started + intervalMs > timeoutMs) break;
    await page.waitForTimeout(intervalMs);
  }
  if (options.describe) Logger.warn(`[job] ${options.describe} - NOT within ${Math.round(timeoutMs / 1000)} s`);
  return { ok: false, value, elapsedMs: Date.now() - started };
}

/** Waits (in the page) until `at` plus `graceMs` has passed. */
export async function waitUntilInstant(page: Page, at: Date, graceMs = 0): Promise<void> {
  const remaining = at.getTime() + graceMs - Date.now();
  if (remaining > 0) {
    Logger.step(`[job] Waiting ${Math.ceil(remaining / 1000)} s (until ${at.toISOString()}${graceMs ? ` + ${graceMs / 1000} s` : ''})`);
    await page.waitForTimeout(remaining);
  }
}

// ---- the clock ----------------------------------------------------------------------

/** What a move did. */
export interface JobMove {
  key: JobKey;
  /** The value read before the FIRST move in this clock (what teardown restores). */
  original: string;
  /** The value written now. */
  cron: string;
  /** When the job is due to fire (UTC instant, second 0 of the minute). */
  firesAt: Date;
}

/** A clock bound to one admin page - what both fixtures hand the cases. */
export interface JobClock {
  /** The job's stored CRON now. */
  read: (key: JobKey) => Promise<string>;
  /** All six stored CRONs. */
  readAll: () => Promise<Record<JobKey, string>>;
  /**
   * Moves the job to fire `minutesFromNow` from now (daily UTC CRON). The
   * ORIGINAL value is remembered on the first move and ALWAYS restored (and
   * read back) at teardown. Moving several jobs at once is fine; each is
   * restored. Throws when the server refuses the value.
   */
  moveTo: (key: JobKey, minutesFromNow: number) => Promise<JobMove>;
  /** Writes an exact value (an interval, a boundary time, an invalid value for a negative case) - restored like moveTo. */
  set: (key: JobKey, cron: string) => Promise<JobAnswer>;
  /** Restores one job now (teardown restores the rest). */
  restore: (key: JobKey) => Promise<boolean>;
  /** Restores every moved job and reads each back; false when any did not restore. */
  restoreAll: () => Promise<boolean>;
  /** The keys moved and not yet restored, with their originals. */
  moved: () => ReadonlyMap<JobKey, string>;
}

/**
 * Builds a clock on an administrator page. `reauth` signs the page in again
 * when a restore meets an expired session. The fixtures call `restoreAll` in
 * teardown; a case may call `restore` early to shorten the window in which
 * every record of that module is processed at an unusual time.
 */
export function createJobClock(page: Page, options: { label?: string; reauth?: () => Promise<void> } = {}): JobClock {
  const label = options.label ?? 'jobClock';
  const originals = new Map<JobKey, string>();

  const remember = async (key: JobKey): Promise<string> => {
    if (!originals.has(key)) originals.set(key, await readJobCron(page, key));
    return originals.get(key) as string;
  };

  const restore = async (key: JobKey): Promise<boolean> => {
    const original = originals.get(key);
    if (original === undefined) return true;
    let res: JobAnswer | null = null;
    let now = '';
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      res = await writeJobCron(page, key, original).catch((e: Error) => ({ status: 0, text: e.message, validationErrors: [] }));
      now = await readJobCron(page, key).catch(() => '');
      if (res.status > 0 && res.status < 300 && now === original) break;
      // An expired token (the saved session lives ~1 h) answers 401 - sign in again and retry.
      if ((res.status === 401 || now === '') && options.reauth) await options.reauth().catch(() => undefined);
      await page.waitForTimeout(2_000).catch(() => undefined);
    }
    if (now !== original) {
      Logger.warn(
        `[${label}] !!!!! ${key} NOT RESTORED: the save answered ${res?.status ?? 'nothing'} `
          + `(${(res?.text ?? '').slice(0, 160)}), it now reads "${now}", the original was "${original}". `
          + `RESTORE IT BY HAND (System Settings > Settings > General > Scheduled Jobs, or PUT ${ApiEndpoints.systemSettingsUpsert}) !!!!!`,
      );
      return false;
    }
    Logger.step(`[${label}] ${key} restored to "${original}" (read back)`);
    originals.delete(key);
    return true;
  };

  return {
    read: (key) => readJobCron(page, key),
    readAll: () => readAllJobCrons(page),
    moveTo: async (key, minutesFromNow) => {
      const original = await remember(key);
      const firesAt = new Date(Date.now() + minutesFromNow * 60_000);
      firesAt.setUTCSeconds(0, 0);
      const cron = cronAt(firesAt);
      const res = await writeJobCron(page, key, cron);
      if (res.status >= 300) throw new Error(`UpsertSystemSettings ${key}="${cron}" answered ${res.status} ${res.text.slice(0, 200)}`);
      Logger.step(`[${label}] ${key} moved "${original}" -> "${cron}" (fires ${firesAt.toISOString()}, Riyadh ${riyadhTime(firesAt)})`);
      return { key, original, cron, firesAt };
    },
    set: async (key, cron) => {
      const original = await remember(key);
      const res = await writeJobCron(page, key, cron);
      Logger.step(`[${label}] ${key} "${original}" -> "${cron}" answered ${res.status}`);
      return res;
    },
    restore,
    restoreAll: async () => {
      let all = true;
      for (const key of [...originals.keys()]) all = (await restore(key)) && all;
      return all;
    },
    moved: () => originals,
  };
}

/**
 * Polls `fn` until it returns a truthy value and resolves that value; throws
 * naming `what` when the timeout passes (the writers' contract, 2026-11-08).
 * A call that throws is retried until the deadline. No page needed (Node timers).
 */
export async function waitUntil<T>(
  fn: () => Promise<T | null | undefined | false> | T | null | undefined | false,
  options: { timeoutMs?: number; intervalMs?: number; what?: string } = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 4 * 60_000;
  const intervalMs = options.intervalMs ?? 10_000;
  const what = options.what ?? 'the condition';
  const started = Date.now();
  let lastError = '';
  for (;;) {
    try {
      const value = await fn();
      if (value) return value as T;
    } catch (error) {
      lastError = (error as Error).message.slice(0, 200);
    }
    if (Date.now() - started + intervalMs > timeoutMs) break;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`timed out after ${Math.round(timeoutMs / 1000)} s waiting for ${what}${lastError ? ` (last error: ${lastError})` : ''}`);
}
