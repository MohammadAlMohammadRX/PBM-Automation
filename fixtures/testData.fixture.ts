import { test as base } from '@playwright/test';
import { buildUniquePayer } from '../data/payers/payerData';
import { buildUniqueNetwork } from '../data/networks/networkData';
import { buildUniqueUser } from '../data/users/userData';
import type { PayerData, NetworkData, UserData } from '../data/common/types';

/**
 * Test-data fixture. Provides a FRESH, unique record per test (safe for
 * parallel execution) so tests don't need to import factories directly.
 * Use `overrides.use({...})` per test-file if a specific scenario needs a
 * non-default field value.
 */
export interface TestDataFixtures {
  uniquePayer: PayerData;
  uniqueNetwork: NetworkData;
  uniqueUser: UserData;
}

export const test = base.extend<TestDataFixtures>({
  uniquePayer: async ({}, use) => {
    await use(buildUniquePayer());
  },
  uniqueNetwork: async ({}, use) => {
    await use(buildUniqueNetwork());
  },
  uniqueUser: async ({}, use) => {
    await use(buildUniqueUser());
  },
});
