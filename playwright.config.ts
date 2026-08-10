import { defineConfig } from '@playwright/test';
import { env } from './constants/EnvironmentConfig';
import { Timeouts } from './constants/Timeouts';
import { AUTH_STORAGE_STATE_PATH } from './constants/Paths';
import {
  SUPPORTED_BROWSERS,
  buildProjectForBrowser,
  resolveActiveBrowser,
  type SupportedBrowser,
} from './constants/BrowserConfig';

/**
 * Determines which browser project(s) to run.
 * - BROWSER=<name>  -> runs only that browser (default: chromium)
 * - BROWSER=all     -> runs every supported browser in the same execution
 * This is the ONLY place `npx playwright test` decides which browser(s) to
 * launch - no test file ever needs to change when switching browsers.
 */
const browsersToRun: SupportedBrowser[] =
  env.browser === 'all' ? SUPPORTED_BROWSERS : [resolveActiveBrowser()];

const browserProjects = browsersToRun.map((browser) => {
  const project = buildProjectForBrowser(browser);
  return {
    ...project,
    dependencies: ['setup'],
    use: {
      ...project.use,
      storageState: AUTH_STORAGE_STATE_PATH,
    },
  };
});

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  timeout: 60_000,
  expect: {
    timeout: Timeouts.expect,
  },

  // Independent tests + safe parallel execution (see README > Test Independence).
  fullyParallel: true,
  forbidOnly: !!process.env.CI,

  // Retries hide flakiness if used to mask real defects - kept conservative
  // and configurable via .env / CI env vars rather than hardcoded.
  retries: process.env.CI ? Math.max(env.retries, 1) : env.retries,
  workers: env.workers,

  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['list'],
  ],

  use: {
    baseURL: env.baseUrl,
    actionTimeout: env.actionTimeout,
    navigationTimeout: env.navigationTimeout,

    // Built-in screenshot is OFF: failure screenshots are captured explicitly
    // by fixtures/screenshot.fixture.ts and written OUTSIDE the project
    // (see utils/ScreenshotUtils.ts + FAILED_SCREENSHOTS_PATH), then attached
    // to the HTML report - avoiding Playwright's default in-repo screenshots.
    screenshot: 'off',

    // Trace and video are kept inside the project's gitignored test-results/
    // folder (no external-storage requirement applies to these).
    trace: 'on-first-retry',
    video: 'retain-on-failure',
  },

  projects: [
    // One-time authentication - every browser project below depends on this.
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },
    ...browserProjects,
  ],
});
