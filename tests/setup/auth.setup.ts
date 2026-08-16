import { test as setup } from '@playwright/test';
import * as path from 'path';
import { LoginPage } from '../../pages/auth/LoginPage';
import { env, assertRequiredEnv } from '../../constants/EnvironmentConfig';
import { AUTH_STORAGE_STATE_PATH } from '../../constants/Paths';
import { CommonUtils } from '../../utils/CommonUtils';
import { Logger } from '../../utils/Logger';

/**
 * One-time authentication "setup" project. Logs in as the admin once and saves
 * the session to AUTH_STORAGE_STATE_PATH; playwright.config.ts then wires that
 * saved session into every browser project, so no spec ever logs in itself.
 */
setup('authenticate as admin', async ({ page }) => {
  assertRequiredEnv();
  CommonUtils.ensureDirectoryExists(path.dirname(AUTH_STORAGE_STATE_PATH));

  const loginPage = new LoginPage(page);
  await loginPage.open();
  await loginPage.loginAndWaitForDashboard(env.adminUsername, env.adminPassword);

  await page.context().storageState({ path: AUTH_STORAGE_STATE_PATH });
  Logger.info(`Saved admin session to ${AUTH_STORAGE_STATE_PATH}`);
});
