import type { Page } from '@playwright/test';
import { Logger } from './Logger';

/**
 * Network fault-injection helpers for negative/resilience tests.
 * Keeps route-handler branching out of spec files (tests stay declarative).
 */
export class NetworkUtils {
  /**
   * Fails every mutating (non-GET) request with an HTTP 500 while leaving read
   * traffic intact, simulating a backend error during a save. A 500 response
   * (rather than a severed connection) lets the SPA surface its own error and
   * stay interactive. Pair with `restore()` once the failure window is over.
   */
  static async failMutatingRequests(page: Page): Promise<void> {
    Logger.step('Injecting HTTP 500 failure for all mutating requests');
    await page.route('**/*', async (route) => {
      if (route.request().method() === 'GET') {
        await route.continue();
      } else {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Injected server error for resilience test.' }),
        });
      }
    });
  }

  /** Removes any route interception previously installed by this util. */
  static async restore(page: Page): Promise<void> {
    await page.unroute('**/*');
  }
}
