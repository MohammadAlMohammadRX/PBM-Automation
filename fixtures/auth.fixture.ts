import { test as base } from '@playwright/test';
import { LoginPage } from '../pages/auth/LoginPage';
import { PayerManagementPage } from '../pages/payer/PayerManagementPage';
import { ApprovalManagementPage } from '../pages/approval/ApprovalManagementPage';

/**
 * Page-Object fixture registry.
 *
 * Specs request a ready-made Page Object by name (e.g. `payerManagementPage`)
 * instead of constructing `new PayerManagementPage(page)` themselves. Every
 * project already starts authenticated via the "setup" project + saved
 * storageState (see playwright.config.ts and tests/setup/auth.setup.ts), so
 * these Page Objects assume an already-logged-in session.
 *
 * Register each new Page Object here as its module is added.
 */
export interface PageObjectFixtures {
  loginPage: LoginPage;
  payerManagementPage: PayerManagementPage;
  approvalManagementPage: ApprovalManagementPage;
}

export const test = base.extend<PageObjectFixtures>({
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },
  payerManagementPage: async ({ page }, use) => {
    await use(new PayerManagementPage(page));
  },
  approvalManagementPage: async ({ page }, use) => {
    await use(new ApprovalManagementPage(page));
  },
});
