import * as fs from 'fs';
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

// Once tests/setup/auth.setup.ts exists (see fixtures/auth.fixture.ts for the
// full pattern) and has produced a saved session, every browser project
// automatically depends on the "setup" project and reuses that session -
// no per-test login. Until then, projects run standalone.
const authStateExists = fs.existsSync(AUTH_STORAGE_STATE_PATH);

const browserProjects = browsersToRun.map((browser) => {
  const project = buildProjectForBrowser(browser);
  return {
    ...project,
    ...(authStateExists
      ? {
          dependencies: ['setup'],
          use: { ...project.use, storageState: AUTH_STORAGE_STATE_PATH },
        }
      : {}),
  };
});

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  // The payer wizard is multi-step and the app slows noticeably under parallel
  // load, so a single test needs more than the default budget end-to-end.
  timeout: 120_000,
  expect: {
    timeout: Timeouts.expect,
  },

  // Parallelism is at FILE level, not test level.
  //
  // Tests within one user story share workflow state - a record moves through
  // draft, submit and approve across several cases - and the application is
  // load-sensitive, so running cases from one file concurrently produces
  // failures that do not reproduce serially. Keeping each file serial while
  // letting different files run side by side gives most of the speedup with
  // none of that noise. At WORKERS=1 this setting changes nothing.
  //
  // Measured: 1 worker ~75m, 2 workers ~41m, 3 workers ~28m. Beyond 3 there is
  // no gain - the edit story alone is 28m and becomes the critical path.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,

  // Retries hide flakiness if used to mask real defects - kept conservative
  // and configurable via .env / CI env vars rather than hardcoded.
  retries: process.env.CI ? Math.max(env.retries, 1) : env.retries,
  // WORKERS in .env overrides this; unset falls back to serial (1).
  workers: env.workers ?? 1,

  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['list'],
    // Machine-readable results consumed by the report scripts. Written to
    // reports/ (not the volatile test-results/, which Playwright wipes each run).
    ['json', { outputFile: 'reports/results.json' }],
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
    // One-time authentication project. Empty until tests/setup/auth.setup.ts
    // is added - see fixtures/auth.fixture.ts for the full pattern.
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },
    ...browserProjects,
  ],
});
