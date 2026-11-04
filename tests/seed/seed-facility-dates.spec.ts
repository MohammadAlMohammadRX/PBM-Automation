import { test, expect } from '../../fixtures';
import { env } from '../../constants/EnvironmentConfig';
import { Logger } from '../../utils/Logger';
import {
  SEED_DEFAULT_COUNT,
  listFacilitySeeds,
  seedFacilityDates,
  type FacilitySeedPurpose,
} from '../../utils/facility/writerBHelpers';

/**
 * SEEDER - creates the facilities the Facility suite's DATE-ARRIVAL cases need
 * (story 15139: 17548, 17552, 17554). Not a test.
 *
 * WHY THIS DATA CANNOT BE MADE ON DEMAND (verified 2026-11-04). A facility's
 * status is computed when it is saved and moved afterwards only by a facility
 * job at ~00:00 Riyadh (modifiedBy null, audit STATUS_CHANGE by "System") that
 * is NOT in System Settings, so the administrator cannot move it. "The start
 * date arrives" and "the expiry day ends" therefore happen only overnight: the
 * seeds are made today and read tomorrow; the cases claim one each
 * (utils/facility/writerBHelpers claimFacilitySeed) and their teardown discards it.
 *
 * IT IS INERT UNLESS ASKED FOR:
 *
 *     npm run seed:facility                       3 StartArrives + 2 ExpiryPasses + 2 ExpiryArrives
 *     cross-env SEED_FACILITY=1 SEED_FACILITY_STARTARRIVES=5 npx playwright test tests/seed/seed-facility-dates.spec.ts --project=chromium
 *
 * Seeds are named "QA Automation Facility Seed <purpose> <stamp>":
 *   StartArrives   licence start = tomorrow, Is Active OFF      -> 17548 / 17554 (start date arrives, not activated)
 *   ExpiryPasses   licence expiry = today, Is Active ON         -> 17552 (Expired once the expiry day has ended)
 *   ExpiryArrives  licence expiry = tomorrow, Is Active ON      -> 17552 (still Active on its expiry day)
 */
test.describe('SEED - date-arrival facilities for the Facility suite', () => {
  test.skip(!process.env.SEED_FACILITY, 'set SEED_FACILITY=1 (npm run seed:facility) to create the facility date seeds');
  test.setTimeout(10 * 60_000);

  test('creates facilities whose licence dates arrive overnight', async ({ page }) => {
    await page.goto(env.baseUrl);
    const purposes: FacilitySeedPurpose[] = ['StartArrives', 'ExpiryPasses', 'ExpiryArrives'];
    let expected = 0;
    const made: string[] = [];
    for (const purpose of purposes) {
      Logger.info(`${purpose} seeds already in the register: ${(await listFacilitySeeds(page, purpose)).length}`);
      const count = Number(process.env[`SEED_FACILITY_${purpose.toUpperCase()}`] ?? SEED_DEFAULT_COUNT[purpose]);
      expected += count;
      made.push(...(await seedFacilityDates(page, purpose, count)));
    }
    Logger.info(`Seeded ${made.length} facilities: ${made.join(', ')}`);
    expect(made).toHaveLength(expected);
  });
});
