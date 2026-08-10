import { test as base } from '@playwright/test';
import { Logger } from '../utils/Logger';

type CleanupTask = () => Promise<void>;

export interface CleanupRegistry {
  /** Registers a task to run after the test, regardless of pass/fail (LIFO order). */
  register: (task: CleanupTask) => void;
}

export interface CleanupFixtures {
  cleanup: CleanupRegistry;
}

/**
 * Cleanup fixture. Tests that create data (a payer, a network, a user)
 * should register a matching cleanup task instead of relying on a separate
 * "afterEach" per spec file - this keeps teardown next to the creation code
 * and guarantees it still runs even if a later assertion in the test fails.
 *
 * Example:
 *   test('create payer', async ({ payerManagementPage, uniquePayer, cleanup }) => {
 *     await payerManagementPage.startCreatePayer(uniquePayer);
 *     cleanup.register(() => payerManagementPage.deletePayer(uniquePayer.nameEn));
 *     ...
 *   });
 */
export const test = base.extend<CleanupFixtures>({
  cleanup: async ({}, use) => {
    const tasks: CleanupTask[] = [];
    await use({ register: (task) => tasks.push(task) });

    for (const task of tasks.reverse()) {
      try {
        await task();
      } catch (error) {
        Logger.error('Cleanup task failed - continuing with remaining cleanup tasks', error);
      }
    }
  },
});
