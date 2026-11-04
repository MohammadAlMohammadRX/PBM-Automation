import { test, expect } from '../../fixtures';
import { env } from '../../constants/EnvironmentConfig';
import { Logger } from '../../utils/Logger';
import { availableActiveSeeds, seedActivePolicies } from '../../utils/PolicyProvisioning';

/**
 * SEEDER - creates the policies the Policy suite's ACTIVE state needs. Not a test.
 *
 * WHY THIS DATA CANNOT BE MADE ON DEMAND (verified 2026-11-03). A policy's
 * first approval gives status Future even when approved after its effective
 * time, and no later approved change - nor an Inactivate -> Activate round -
 * moves it on: it turns Active only when the policy lifecycle job runs, seen
 * once a day. So the seeds are made today (effective in two minutes, approved)
 * and read tomorrow; `policyIn('Active')` (fixtures/policyModule.fixture.ts)
 * claims one per case and the case's teardown discards it.
 *
 * IT IS INERT UNLESS ASKED FOR:
 *
 *     npm run seed:policy                                   6 Individual + 3 Group
 *     cross-env SEED_POLICY=1 SEED_POLICY_INDIVIDUAL=10 SEED_POLICY_GROUP=4 npx playwright test tests/seed/seed-policy-active.spec.ts --project=chromium
 *
 * Seeds are named "QA Automation Policy Seed <Individual|Group> <stamp>" under
 * the suite payer "Al sharq"; an Individual seed carries two members, a Group
 * seed none (a group takes members only once Active), each one network.
 */
test.describe('SEED - Active policies for the Policy suite', () => {
  test.skip(!process.env.SEED_POLICY, 'set SEED_POLICY=1 (npm run seed:policy) to create the Active policy seeds');
  test.setTimeout(30 * 60_000);

  test('creates Future policies that the lifecycle job turns Active by the next day', async ({ page }) => {
    await page.goto(env.baseUrl);
    const individual = Number(process.env.SEED_POLICY_INDIVIDUAL ?? 6);
    const group = Number(process.env.SEED_POLICY_GROUP ?? 3);
    Logger.info(`Active seeds already available: ${(await availableActiveSeeds(page)).length}`);
    const made = [
      ...(await seedActivePolicies(page, individual, 'individual')),
      ...(await seedActivePolicies(page, group, 'group')),
    ];
    Logger.info(`Seeded ${made.length} policies: ${made.join(', ')}`);
    expect(made).toHaveLength(individual + group);
  });
});
