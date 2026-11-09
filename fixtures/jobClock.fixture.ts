import { test as base } from '@playwright/test';
import { SettingsPage } from '../pages/system/SettingsPage';
import { Logger } from '../utils/Logger';
import { createJobClock, type JobClock } from '../utils/JobClock';

/**
 * The administrator's scheduled-job clock for EVERY suite (2026-11-08) - see
 * utils/JobClock.ts.
 *
 *   const move = await jobClock.moveTo('Jobs.NetworkLifecycleCron', 2);
 *   ... wait for the record (waitFor) ...
 *   // teardown restores the original and reads it back - even when the case fails
 *
 * Runs on the default `page` (the saved ADMINISTRATOR session). Teardown
 * restores every moved key, re-reads it, and logs a loud "NOT RESTORED ...
 * restore it by hand" warning when a key does not read its original value.
 * An expired session is signed in again (through the Settings screen's
 * navigation) before the restore is retried.
 */
export interface JobClockFixtures {
  jobClock: JobClock;
}

export const test = base.extend<JobClockFixtures>({
  jobClock: async ({ page }, use, testInfo) => {
    const clock = createJobClock(page, {
      label: 'jobClock',
      reauth: async () => {
        Logger.warn('[jobClock] the session answered 401 / nothing - signing in again before restoring');
        await new SettingsPage(page).open();
      },
    });
    await use(clock);
    if (clock.moved().size === 0) return;
    const restored = await clock.restoreAll();
    if (!restored) {
      testInfo.annotations.push({
        type: 'job-not-restored',
        description: `One or more scheduled jobs were NOT restored: ${[...clock.moved()].map(([k, v]) => `${k} should be "${v}"`).join('; ')}`,
      });
    }
  },
});
