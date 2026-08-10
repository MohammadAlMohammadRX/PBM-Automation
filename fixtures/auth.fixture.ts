import { test as base } from '@playwright/test';

/**
 * Authentication / Page-Object fixture (placeholder).
 *
 * Intended pattern (per the framework's authentication requirement):
 *   1. Add `pages/auth/LoginPage.ts` (locators + `login()` for the real login form).
 *   2. Add `tests/setup/auth.setup.ts` as a Playwright "setup" project that logs
 *      in once using LoginPage and persists the session via
 *      `page.context().storageState({ path: AUTH_STORAGE_STATE_PATH })`
 *      (see constants/Paths.ts).
 *   3. In playwright.config.ts, give every browser project
 *      `dependencies: ['setup']` and `use: { storageState: AUTH_STORAGE_STATE_PATH }`
 *      so every test starts already authenticated - no spec file calls login() itself.
 *   4. Register each new Page Object here as a fixture, e.g.:
 *
 *        export interface PageObjectFixtures {
 *          loginPage: LoginPage;
 *          dashboardPage: DashboardPage;
 *        }
 *
 *        export const test = base.extend<PageObjectFixtures>({
 *          loginPage: async ({ page }, use) => { await use(new LoginPage(page)); },
 *          dashboardPage: async ({ page }, use) => { await use(new DashboardPage(page)); },
 *        });
 *
 * Until the first Page Object exists, this fixture is a pass-through so
 * `fixtures/index.ts` has something valid to merge.
 */
export const test = base;
