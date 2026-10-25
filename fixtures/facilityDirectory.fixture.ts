import { test as base } from '@playwright/test';
import { blockedByPrecondition } from './testStatus.fixture';
import { env } from '../constants/EnvironmentConfig';
import {
  isActiveFacility,
  isPharmacy,
  readFacilityDirectory,
  type DirectoryFacility,
} from '../utils/FacilityDirectory';

/** The facility classes the eligibility stories partition on. */
export interface FacilityClass {
  pharmacy: boolean;
  active: boolean;
}

export interface FacilityDirectoryFixtures {
  /**
   * The whole facility directory, type and status resolved. BLOCKED when the
   * directory cannot be read - a case about which facilities are eligible has
   * nothing to compare the pool against then.
   */
  facilityDirectory: () => Promise<DirectoryFacility[]>;
  /**
   * DISCOVERS a facility of the wanted class (e.g. a non-pharmacy, or an
   * inactive pharmacy) and returns it - or reports BLOCKED naming the missing
   * class. The environment offers three facilities (2026-10-21); a facility is
   * never created or deactivated here, because every network and payer suite
   * shares them.
   */
  facilityOfClass: (wanted: FacilityClass) => Promise<DirectoryFacility>;
}

export const test = base.extend<FacilityDirectoryFixtures>({
  facilityDirectory: async ({ page }, use, testInfo) => {
    await use(async () => {
      try {
        if (!/^https?:/.test(page.url())) await page.goto(env.baseUrl);
        return await readFacilityDirectory(page);
      } catch (error) {
        return blockedByPrecondition(testInfo, 'a readable facility directory (type and status per facility)', error);
      }
    });
  },

  facilityOfClass: async ({ page }, use, testInfo) => {
    await use(async (wanted) => {
      const label = `${wanted.active ? 'an active' : 'an inactive'} ${wanted.pharmacy ? 'pharmacy' : 'non-pharmacy'} facility`;
      try {
        if (!/^https?:/.test(page.url())) await page.goto(env.baseUrl);
        const directory = await readFacilityDirectory(page);
        const match = directory.find((f) => isPharmacy(f) === wanted.pharmacy && isActiveFacility(f) === wanted.active);
        if (!match) {
          throw new Error(
            `the directory holds no such facility - it has ${directory.map((f) => `${f.code} (${f.type || '?'} / ${f.status || '?'})`).join(', ')}. `
            + 'Seed one in Facility Mgmt to unblock this case.',
          );
        }
        return match;
      } catch (error) {
        return blockedByPrecondition(testInfo, label, error);
      }
    });
  },
});
