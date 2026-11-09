import { test, expect } from '../../fixtures';
import { env } from '../../constants/EnvironmentConfig';
import { Logger } from '../../utils/Logger';
import { JOB_SEED_PURPOSES, deleteSeedDefinitions, seedJobRecords, type JobSeedPurpose } from '../../utils/jobDriven/jobSeeds';

/**
 * SEEDER - builds the suite plans the Plans job-driven cases claim
 * (US 14156 / 14330 / 14338) - payer "Al sharq", formulary FORM-0023 assigned
 * read-only - and fires Jobs.PlanLifecycleCron for all of them at once: F1
 * (activation), the inactivations, then F2 (expiry); the job is restored after
 * each firing. Not a test. Run it the SAME Riyadh day as the cases (~15 min):
 *
 *     npm run seed:plan-jobs
 *     cross-env SEED_PLAN_JOBS=1 SEED_COUNT_PlanVersionExpire=5 npx playwright test tests/seed/seed-plan-jobs.spec.ts --project=chromium --workers=1
 *
 * Purposes, recipes and expected states: utils/jobDriven/jobSeeds.ts
 * (JOB_SEED_PURPOSES). Manifest: reports/job-seeds/<day>-plan.json.
 */
test.describe('SEED - plan lifecycle job records', () => {
  test.skip(!process.env.SEED_PLAN_JOBS, 'set SEED_PLAN_JOBS=1 (npm run seed:plan-jobs) to build the plan job seeds');
  test.setTimeout(40 * 60_000);

  test('builds the plan job seeds and fires the plan job once', async ({ page, jobClock }) => {
    await page.goto(env.baseUrl);
    const counts: Partial<Record<JobSeedPurpose, number>> = {};
    for (const purpose of Object.keys(JOB_SEED_PURPOSES) as JobSeedPurpose[]) {
      const override = process.env[`SEED_COUNT_${purpose}`];
      if (override !== undefined) counts[purpose] = Number(override);
    }
    const manifest = await seedJobRecords(page, { suite: 'plan', clock: jobClock, counts })
      .finally(async () => { await deleteSeedDefinitions(page); });
    Logger.info(`[seed] Expired notification delivered: ${manifest.expiredNotificationDelivered}`);
    for (const r of manifest.records) {
      Logger.info(`[seed] ${r.purpose} ${r.name} (${r.id}): ${r.before?.status} -> ${r.afterF1?.status} -> ${r.after?.status} (expected ${r.expected})`);
    }
    expect(manifest.restored, 'the plan job must be back at its original value').toBe(true);
    expect(manifest.records.length).toBeGreaterThan(0);
  });
});
