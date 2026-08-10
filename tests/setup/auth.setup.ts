import { test as setup } from '@playwright/test';
import { LoginPage } from '../../pages/auth/LoginPage';
import { DashboardPage } from '../../pages/DashboardPage';
import { getAdminCredentials } from '../../data/users/userData';
import { assertRequiredEnv } from '../../constants/EnvironmentConfig';
import { AUTH_STORAGE_STATE_PATH } from '../../constants/Paths';
import { Logger } from '../../utils/Logger';

/**
 * One-time authentication "setup project" (Playwright's recommended pattern
 * for shared login state). Runs once before the real test projects - which
 * all declare a dependency on the "setup" project in playwright.config.ts -
 * logs in as the admin user, and persists the authenticated session to
 * AUTH_STORAGE_STATE_PATH. Every subsequent test then starts already logged
 * in, with zero login code duplicated in individual spec files.
 */
setup('authenticate as admin (one-time)', async ({ page }) => {
  assertRequiredEnv();
  Logger.info('Running one-time admin authentication for this test run');

  const loginPage = new LoginPage(page);
  await loginPage.open();
  await loginPage.login(getAdminCredentials());
  await loginPage.verifyLoginSucceeded();

  const dashboardPage = new DashboardPage(page);
  await dashboardPage.verifyDashboardLoaded();

  await page.context().storageState({ path: AUTH_STORAGE_STATE_PATH });
  Logger.info(`Admin session saved to ${AUTH_STORAGE_STATE_PATH}`);
});
