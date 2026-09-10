import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { Timeouts } from '../constants/Timeouts';
import { Logger } from './Logger';

/**
 * Busy-indicator selectors, by CSS class rather than by id.
 *
 * This is deliberate and is the one place in the framework that cannot be
 * id-based: the application documents no GLOBAL loading id. Loading state is
 * exposed per screen instead (`{screen}-table-loading`, `dashboard-loading`),
 * and this helper is module-agnostic - it is called from BasePage before the
 * screen is even known. Callers that DO know their screen use its own loading
 * id; see BasePage.ensureTableView().
 */
const LOADING_INDICATOR_SELECTORS = [
  '.p-progressspinner',
  '.p-progress-bar',
  '.pbm-loader',
  '.pbm-spinner',
  '[data-loading="true"]',
  '.loading-overlay',
].join(', ');

/**
 * Explicit-wait helpers that wrap Playwright's own auto-waiting mechanisms.
 * Deliberately does NOT expose a generic `waitForTimeout` wrapper - see the
 * README "Wait Strategy" section for why hardcoded waits are avoided.
 */
export class WaitUtils {
  /**
   * Gives the application a fair chance to say something, then reports whatever
   * it said.
   *
   * THE POINT OF THIS HELPER, and it is a correctness matter rather than a
   * convenience. The strongest finding in the payer module is that several
   * server refusals produce no user-visible feedback at all - and that claim is
   * only worth making if the interface was actually given time to speak. The
   * screens collect their messages with a single DOM read, which taken the
   * instant a response lands happens before any toast has rendered: it would
   * report "nothing was shown" for a message that appeared 200ms later, and
   * every no-feedback finding built on it would be suspect.
   *
   * So the caller's own collector is polled until it finds something, and an
   * empty result is returned only once the window really has passed in silence.
   *
   * `snapshot` stays the caller's because each screen looks in different places
   * for its messages - toasts, inline field errors, the shared dialog.
   */
  static async settleMessages(
    snapshot: () => Promise<string[]>,
    timeout: number = Timeouts.short,
  ): Promise<string[]> {
    let messages: string[] = [];
    await expect
      .poll(
        async () => {
          messages = await snapshot().catch(() => []);
          return messages.length;
        },
        { timeout, intervals: [100, 200, 300, 500, 1_000] },
      )
      .toBeGreaterThan(0)
      .catch(() => undefined);
    return messages;
  }

  /**
   * Waits for any known loading indicator to disappear, if one is present.
   * Safe to call even when no indicator is showing (resolves immediately).
   */
  static async waitForLoadingToFinish(page: Page, timeout: number = Timeouts.loadingIndicator): Promise<void> {
    const indicator = page.locator(LOADING_INDICATOR_SELECTORS).first();
    try {
      if (await indicator.isVisible({ timeout: 1_000 }).catch(() => false)) {
        Logger.step('Waiting for loading indicator to disappear');
        await indicator.waitFor({ state: 'hidden', timeout });
      }
    } catch (error) {
      Logger.warn('Loading indicator did not disappear within timeout - continuing', error);
    }
  }

  /** Waits until the network is idle (no in-flight requests) or times out. */
  static async waitForNetworkIdle(page: Page, timeout: number = Timeouts.default): Promise<void> {
    await page.waitForLoadState('networkidle', { timeout }).catch((error) => {
      Logger.warn('Network did not reach idle state within timeout - continuing', error);
    });
  }

  /** Waits for the DOM/document to finish loading (cheaper than networkidle). */
  static async waitForDomReady(page: Page, timeout: number = Timeouts.default): Promise<void> {
    await page.waitForLoadState('domcontentloaded', { timeout });
  }

  /** Waits for the URL to match the given pattern (string or RegExp). */
  static async waitForUrl(page: Page, urlOrPattern: string | RegExp, timeout: number = Timeouts.navigation): Promise<void> {
    await page.waitForURL(urlOrPattern, { timeout });
  }
}
