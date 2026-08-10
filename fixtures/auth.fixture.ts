import { test as base } from '@playwright/test';
import { LoginPage } from '../pages/auth/LoginPage';
import { DashboardPage } from '../pages/DashboardPage';
import { PayerManagementPage } from '../pages/payer/PayerManagementPage';
import { NetworkManagementPage } from '../pages/network/NetworkManagementPage';
import { UsersAdministrationPage } from '../pages/users/UsersAdministrationPage';

/**
 * Authentication / Page-Object fixture.
 *
 * Actual login happens ONCE per run in tests/setup/auth.setup.ts, whose
 * output (storageState) is wired into every project in playwright.config.ts.
 * This fixture's job is narrower but just as important: it hands each test
 * ready-to-use Page Object instances bound to that already-authenticated
 * `page`, so no spec file ever constructs `new LoginPage(page)` itself or
 * repeats navigation/login boilerplate.
 */
export interface PageObjectFixtures {
  loginPage: LoginPage;
  dashboardPage: DashboardPage;
  payerManagementPage: PayerManagementPage;
  networkManagementPage: NetworkManagementPage;
  usersAdministrationPage: UsersAdministrationPage;
}

export const test = base.extend<PageObjectFixtures>({
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },
  dashboardPage: async ({ page }, use) => {
    await use(new DashboardPage(page));
  },
  payerManagementPage: async ({ page }, use) => {
    await use(new PayerManagementPage(page));
  },
  networkManagementPage: async ({ page }, use) => {
    await use(new NetworkManagementPage(page));
  },
  usersAdministrationPage: async ({ page }, use) => {
    await use(new UsersAdministrationPage(page));
  },
});
