import { test as base, type Page } from '@playwright/test';
import { LoginPage } from '../pages/auth/LoginPage';
import { PayerManagementPage } from '../pages/payer/PayerManagementPage';
import { PayerMetricsPanel } from '../pages/payer/PayerMetricsPanel';
import { ApprovalManagementPage } from '../pages/approval/ApprovalManagementPage';
import { NetworkManagementPage } from '../pages/network/NetworkManagementPage';
import { SettingsPage } from '../pages/system/SettingsPage';
import { ExportMenu } from '../pages/components/ExportMenu';
import { env } from '../constants/EnvironmentConfig';
import { nonAdminUnfit, type NonAdminRequirement } from '../data/accounts/nonAdminAccount.data';
import { blockedByPrecondition } from './testStatus.fixture';
import { Logger } from '../utils/Logger';

/**
 * A SECOND browser session signed in as the configured non-admin account, with
 * the Page Objects a scoped user's stories read through.
 *
 * Kept apart from the shared admin session on purpose: the scope and
 * permission stories compare what two roles see of the same record, so the
 * administrator's page must stay usable while this one is open. The session is
 * signed in once per test and closed at teardown.
 */
export interface NonAdminSession {
  page: Page;
  payers: PayerManagementPage;
  payerMetrics: PayerMetricsPanel;
  approvals: ApprovalManagementPage;
  networks: NetworkManagementPage;
  settings: SettingsPage;
  exportMenu: ExportMenu;
}

export interface NonAdminSessionFixtures {
  /**
   * Signs the non-admin account in from an isolated context. BLOCKED when the
   * account is not configured or its sign-in fails - nothing about the feature
   * is learned then, so the case must not report a failure.
   */
  nonAdminSession: NonAdminSession;
  /**
   * BLOCKS the test when the configured non-admin account does not fit what the
   * case needs of it (see nonAdminUnfit). Called first thing in a case that
   * needs the account to LACK or HOLD particular rights.
   */
  requireNonAdmin: (requirement: NonAdminRequirement) => void;
}

export const test = base.extend<NonAdminSessionFixtures>({
  requireNonAdmin: async ({}, use, testInfo) => {
    await use((requirement) => {
      const unfit = nonAdminUnfit(requirement);
      if (unfit !== null) blockedByPrecondition(testInfo, 'a fitting non-administrator account', new Error(unfit));
    });
  },

  nonAdminSession: async ({ browser }, use, testInfo) => {
    const unfit = nonAdminUnfit();
    if (unfit !== null) blockedByPrecondition(testInfo, 'a non-administrator session', new Error(unfit));

    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    try {
      Logger.step(`[fixture] Signing in the non-admin account "${env.nonAdminUsername}"`);
      const login = new LoginPage(page);
      await login.open();
      await login.loginAndWaitForDashboard(env.nonAdminUsername, env.nonAdminPassword);
    } catch (error) {
      await context.close();
      blockedByPrecondition(testInfo, 'a non-administrator session', error);
    }

    await use({
      page,
      payers: new PayerManagementPage(page),
      payerMetrics: new PayerMetricsPanel(page),
      approvals: new ApprovalManagementPage(page),
      networks: new NetworkManagementPage(page),
      settings: new SettingsPage(page),
      exportMenu: new ExportMenu(page),
    });

    await context.close();
  },
});
