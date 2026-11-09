import { test, expect } from '../../fixtures';
import { env } from '../../constants/EnvironmentConfig';
import { Logger } from '../../utils/Logger';
import { JOB_SEED_PURPOSES, deleteSeedDefinitions, seedJobRecords, type JobSeedPurpose } from '../../utils/jobDriven/jobSeeds';

/**
 * SEEDER - builds the suite networks the Network job-driven cases claim
 * (US 14129 / 14130 / 14308 / 14309 / 14310 / 14323) and fires
 * Jobs.NetworkLifecycleCron for all of them at once: F1 (activation), the
 * inactivations, then F2 (expiry) - the job is restored after each firing.
 * Not a test. Run it the SAME Riyadh day as the cases (~15 min):
 *
 *     npm run seed:network-jobs
 *     cross-env SEED_NETWORK_JOBS=1 SEED_COUNT_ExpireAfterExpiry=5 npx playwright test tests/seed/seed-network-jobs.spec.ts --project=chromium --workers=1
 *
 * Purposes, recipes and expected states: utils/jobDriven/jobSeeds.ts
 * (JOB_SEED_PURPOSES). Manifest (before / after F1 / after F2 per record):
 * reports/job-seeds/<day>-network.json. Cases claim with findJobSeed / requireJobSeed.
 */
test.describe('SEED - network lifecycle job records', () => {
  test.skip(!process.env.SEED_NETWORK_JOBS, 'set SEED_NETWORK_JOBS=1 (npm run seed:network-jobs) to build the network job seeds');
  test.setTimeout(40 * 60_000);

  test('builds the network job seeds and fires the network job once', async ({ page, jobClock }) => {
    await page.goto(env.baseUrl);
    const counts: Partial<Record<JobSeedPurpose, number>> = {};
    for (const purpose of Object.keys(JOB_SEED_PURPOSES) as JobSeedPurpose[]) {
      const override = process.env[`SEED_COUNT_${purpose}`];
      if (override !== undefined) counts[purpose] = Number(override);
    }
    const manifest = await seedJobRecords(page, { suite: 'network', clock: jobClock, counts })
      .finally(async () => { await deleteSeedDefinitions(page); });
    Logger.info(`[seed] Expired notification delivered: ${manifest.expiredNotificationDelivered}`);
    for (const r of manifest.records) {
      Logger.info(`[seed] ${r.purpose} ${r.name} (${r.id}): ${r.before?.status} -> ${r.afterF1?.status} -> ${r.after?.status} (expected ${r.expected})`);
    }
    expect(manifest.restored, 'the network job must be back at its original value').toBe(true);
    expect(manifest.records.length).toBeGreaterThan(0);
  });
});
