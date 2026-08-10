import type { Page } from '@playwright/test';
import { Timeouts } from '../constants/Timeouts';
import { Logger } from './Logger';

/**
 * Common selectors used by loading/busy indicators across the PBM app
 * (PrimeNG-based). Kept as a list (rather than one guess) so waitForIdle()
 * stays resilient if the exact spinner implementation differs per module.
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
