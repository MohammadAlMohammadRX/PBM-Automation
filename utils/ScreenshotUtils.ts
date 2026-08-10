import * as path from 'path';
import type { Page, TestInfo } from '@playwright/test';
import { env } from '../constants/EnvironmentConfig';
import { CommonUtils } from './CommonUtils';
import { DateUtils } from './DateUtils';
import { Logger } from './Logger';

/**
 * Handles capturing and storing screenshots for FAILED tests only, outside
 * the project directory (per framework requirements).
 *
 * Directory layout:
 *   <FAILED_SCREENSHOTS_PATH>/<run-date_run-time>/<TestName>_<Browser>.png
 *
 * If FAILED_SCREENSHOTS_PATH is not configured, falls back to a folder one
 * level ABOVE the project root so screenshots never land inside the repo.
 */
export class ScreenshotUtils {
  private static runFolderName: string | undefined;

  private static getRunRoot(): string {
    const configured = env.failedScreenshotsPath;
    const root = configured && configured.trim() !== ''
      ? configured
      : path.resolve(process.cwd(), '..', 'PBM-Automation-Artifacts', 'FailedScreenshots');
    return CommonUtils.toAbsolutePath(root);
  }

  /** One timestamped subfolder per test execution/run, computed once and cached. */
  private static getRunFolder(): string {
    if (!this.runFolderName) {
      this.runFolderName = DateUtils.timestampForFilename();
    }
    const runFolder = path.join(this.getRunRoot(), this.runFolderName);
    CommonUtils.ensureDirectoryExists(runFolder);
    return runFolder;
  }

  /**
   * Captures a full-page screenshot for a failed test and returns the
   * absolute path written. Also attaches the file to the Playwright HTML
   * report via testInfo.attach so it's visible there too.
   */
  static async captureFailureScreenshot(page: Page, testInfo: TestInfo): Promise<string | undefined> {
    try {
      const browserName = testInfo.project.name;
      const safeTitle = CommonUtils.sanitizeForFilename(testInfo.title);
      const filename = `${safeTitle}_${browserName}.png`;
      const destination = path.join(this.getRunFolder(), filename);

      const buffer = await page.screenshot({ fullPage: true, path: destination });
      await testInfo.attach(`failure-screenshot-${browserName}`, {
        body: buffer,
        contentType: 'image/png',
      });

      Logger.info(`Failure screenshot saved: ${destination}`);
      return destination;
    } catch (error) {
      Logger.error('Failed to capture failure screenshot', error);
      return undefined;
    }
  }
}
