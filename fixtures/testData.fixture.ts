import { test as base } from '@playwright/test';

/**
 * Test-data fixture (placeholder).
 *
 * Intended pattern: for each module, add a factory under `data/<module>/` that
 * returns a fresh, VALID, unique record per call (using `utils/RandomDataUtils.ts`
 * so parallel tests never collide), then expose it here as a fixture, e.g.:
 *
 *   import { buildUniquePayer } from '../data/payers/payerData';
 *   import type { PayerData } from '../data/common/types';
 *
 *   export interface TestDataFixtures {
 *     uniquePayer: PayerData;
 *   }
 *
 *   export const test = base.extend<TestDataFixtures>({
 *     uniquePayer: async ({}, use) => { await use(buildUniquePayer()); },
 *   });
 *
 * Until the first data factory exists, this fixture is a pass-through so
 * `fixtures/index.ts` has something valid to merge.
 */
export const test = base;
