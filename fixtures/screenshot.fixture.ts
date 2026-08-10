import { test as base } from '@playwright/test';
import { ScreenshotUtils } from '../utils/ScreenshotUtils';
import { Logger } from '../utils/Logger';

/**
 * Overrides the built-in `page` fixture to automatically capture a
 * screenshot to the EXTERNAL failed-screenshots directory whenever a test
 * fails or times out (see utils/ScreenshotUtils.ts and .env FAILED_SCREENSHOTS_PATH).
 * This runs for every test automatically - no per-test code required.
 */
export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    await use(page);

    const failed = testInfo.status !== testInfo.expectedStatus;
    if (failed && !page.isClosed()) {
      Logger.error(`Test failed: ${testInfo.title} (${testInfo.status})`);
      await ScreenshotUtils.captureFailureScreenshot(page, testInfo);
    }
  },
});
