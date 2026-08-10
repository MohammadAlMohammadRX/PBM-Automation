import { test, expect } from '../../fixtures';
import { getAdminCredentials } from '../../data/users/userData';

// These tests exercise the LOGIN FLOW ITSELF, so they intentionally start
// from a clean, unauthenticated context instead of the shared admin session
// used by every other spec file (see tests/setup/auth.setup.ts).
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Login', () => {
  test('admin can log in with valid credentials @smoke', async ({ loginPage, dashboardPage }) => {
    await loginPage.open();

    await loginPage.login(getAdminCredentials());
    await loginPage.verifyLoginSucceeded();

    await dashboardPage.verifyDashboardLoaded();
  });

  test('login is rejected with an invalid password', async ({ loginPage }) => {
    await loginPage.open();

    await loginPage.login({ username: getAdminCredentials().username, password: 'WrongPassword!123' });

    await loginPage.verifyLoginFailed();
  });

  test('login button remains on the login page for an unknown user', async ({ loginPage }) => {
    await loginPage.open();

    await loginPage.login({ username: 'unknown.user@example.com', password: 'SomePassword!123' });

    await loginPage.verifyLoginFailed();
  });
});
