import type { Page } from '@playwright/test';
import { Logger } from './Logger';
import { createJobClock, type JobKey } from './JobClock';

/**
 * Waits for a record to reach a status that only a LIFECYCLE JOB sets (Future -> Active, Active -> Expired),
 * moving that job to fire soon while it waits (2026-11-17).
 *
 * WHY. The lifecycle jobs used to run every minute in this environment; they are back on their daily schedule
 * (Jobs.NetworkLifecycleCron / PlanLifecycleCron "15 21 * * *", PayerLifecycleCron "20 9 * * *"), and since the
 * 2026-11-14 build a record may not start before "now" - so an approved payer / network / plan reads "Future" for
 * the rest of the day. The Sprint 1 retest lost ~20 cases to fixtures that waited 4-6 minutes for an "Active" that
 * could not come.
 *
 * HOW. `reached()` is polled every 10 s. If it is not true at once, the job is moved to fire in 2 minutes (the
 * same move the job-driven suites make, accepted by the user 2026-11-08); if the record still has not moved a
 * minute after the job fired (an expiry time not yet passed, a slow run), the job is moved again. The ORIGINAL
 * schedule is restored and read back in `finally`, whatever happens - a job left moved would process every
 * record of that module at an odd time for everyone.
 */
export async function waitWithLifecycleJob(
  page: Page,
  key: JobKey,
  reached: () => Promise<boolean>,
  options: { timeoutMs?: number; what?: string } = {},
): Promise<boolean> {
  const timeoutMs = options.timeoutMs ?? 6 * 60_000;
  const what = options.what ?? 'the record';
  if (await reached().catch(() => false)) return true;
  const clock = createJobClock(page, { label: 'lifecycleNudge' });
  const deadline = Date.now() + Math.max(timeoutMs, 5 * 60_000);
  let firesAt = 0;
  try {
    while (Date.now() < deadline) {
      if (!firesAt || Date.now() > firesAt + 60_000) {
        const move = await clock.moveTo(key, 2);
        firesAt = move.firesAt.getTime();
        Logger.step(`[lifecycleNudge] waiting for ${what}: ${key} fires ${move.firesAt.toISOString()}`);
      }
      await page.waitForTimeout(10_000);
      if (await reached().catch(() => false)) return true;
    }
    return false;
  } finally {
    await clock.restoreAll();
  }
}
