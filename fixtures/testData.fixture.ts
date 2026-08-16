import { test as base } from '@playwright/test';
import { buildUniquePayer } from '../data/payers/payer.data';
import type { PayerData } from '../data/payers/payerTypes';

/**
 * Test-data fixture registry.
 *
 * `uniquePayer` yields a fresh, valid, unique payer record per test so tests
 * never collide when run in parallel. Tests that need specific fields (e.g. a
 * fixed effective date) build their own record via `buildUniquePayer(overrides)`.
 */
export interface TestDataFixtures {
  uniquePayer: PayerData;
}

export const test = base.extend<TestDataFixtures>({
  uniquePayer: async ({}, use) => {
    await use(buildUniquePayer());
  },
});
