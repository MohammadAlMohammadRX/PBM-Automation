import type { Project } from '@playwright/test';
import { env } from './EnvironmentConfig';

/**
 * Centralized browser configuration.
 * playwright.config.ts and every other file in the framework MUST read
 * browser-related settings from here instead of hardcoding them. Switching
 * browsers is done via the BROWSER environment variable (see .env.example) -
 * no test file ever needs to change.
 */

export type SupportedBrowser = 'chromium' | 'chrome' | 'edge' | 'firefox' | 'webkit';

export const SUPPORTED_BROWSERS: SupportedBrowser[] = ['chromium', 'chrome', 'edge', 'firefox', 'webkit'];

export const DEFAULT_BROWSER: SupportedBrowser = 'chrome';

export const DEFAULT_VIEWPORT = { width: 1920, height: 1080 } as const;

export const BROWSER_LAUNCH_ARGS: string[] = [
  '--disable-gpu',
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--start-maximized',
];

export interface BrowserExecutionSettings {
  headless: boolean;
  slowMo: number;
  viewport: { width: number; height: number };
  launchArgs: string[];
  actionTimeout: number;
  navigationTimeout: number;
}

export const browserExecutionSettings: BrowserExecutionSettings = {
  headless: env.headless,
  slowMo: env.slowMo,
  viewport: DEFAULT_VIEWPORT,
  launchArgs: BROWSER_LAUNCH_ARGS,
  actionTimeout: env.actionTimeout,
  navigationTimeout: env.navigationTimeout,
};

/**
 * Resolves the browser requested via the BROWSER env var, falling back to the
 * framework default and warning (not throwing) on an unknown value so a typo
 * doesn't break the whole run.
 */
export function resolveActiveBrowser(): SupportedBrowser {
  const requested = env.browser as SupportedBrowser;
  if (SUPPORTED_BROWSERS.includes(requested)) {
    return requested;
  }
  // eslint-disable-next-line no-console
  console.warn(
    `[BrowserConfig] Unknown BROWSER "${env.browser}". Falling back to "${DEFAULT_BROWSER}". ` +
      `Supported values: ${SUPPORTED_BROWSERS.join(', ')}.`,
  );
  return DEFAULT_BROWSER;
}

/**
 * Maps a SupportedBrowser to the Playwright project definition it needs
 * (engine + channel). Centralizing this mapping means playwright.config.ts
 * never has to know the Chrome/Edge channel details itself.
 */
export function buildProjectForBrowser(browser: SupportedBrowser): Project {
  const base = {
    use: {
      viewport: browserExecutionSettings.viewport,
      actionTimeout: browserExecutionSettings.actionTimeout,
      navigationTimeout: browserExecutionSettings.navigationTimeout,
      launchOptions: {
        headless: browserExecutionSettings.headless,
        slowMo: browserExecutionSettings.slowMo,
        args: browserExecutionSettings.launchArgs,
      },
    },
  };

  switch (browser) {
    case 'chromium':
      return { name: 'chromium', use: { ...base.use, browserName: 'chromium' } };
    case 'chrome':
      return { name: 'chrome', use: { ...base.use, browserName: 'chromium', channel: 'chrome' } };
    case 'edge':
      return { name: 'edge', use: { ...base.use, browserName: 'chromium', channel: 'msedge' } };
    case 'firefox':
      return { name: 'firefox', use: { ...base.use, browserName: 'firefox' } };
    case 'webkit':
      return { name: 'webkit', use: { ...base.use, browserName: 'webkit' } };
    default:
      throw new Error(`[BrowserConfig] Unsupported browser: ${browser}`);
  }
}
