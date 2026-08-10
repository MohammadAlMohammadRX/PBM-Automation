import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { AppRoutes } from '../../constants/AppRoutes';
import { Timeouts } from '../../constants/Timeouts';
import { Logger } from '../../utils/Logger';
import type { AdminCredentials } from '../../data/common/types';

/**
 * Page Object for the Login screen.
 * Verified locators (stable HTML ids, confirmed against the live app):
 *   #login-email    - email/username input
 *   #login-password - password input
 *   button[type=submit].pbm-auth__submit - Login button
 */
export class LoginPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  private emailInput(): Locator {
    return this.page.locator('#login-email');
  }

  private passwordInput(): Locator {
    return this.page.locator('#login-password');
  }

  private loginButton(): Locator {
    return this.page.locator('button[type="submit"].pbm-auth__submit');
  }

  private fieldErrorLocator(): Locator {
    return this.page.locator('pbm-field-error').filter({ hasText: /.+/ }).first();
  }

  async open(): Promise<void> {
    await this.goto(AppRoutes.login);
    await expect(this.emailInput()).toBeVisible({ timeout: Timeouts.default });
  }

  /**
   * Performs a full login. Prefer using the `authenticatedPage` fixture in
   * tests instead of calling this directly - see fixtures/auth.fixture.ts.
   * This method exists so the one-time global-setup login and any ad-hoc
   * "verify bad credentials are rejected" test share the same implementation.
   */
  async login(credentials: AdminCredentials): Promise<void> {
    Logger.step(`Logging in as "${credentials.username}"`);
    await this.emailInput().fill(credentials.username);
    await this.passwordInput().fill(credentials.password);
    await this.loginButton().click();
  }

  async verifyLoginSucceeded(): Promise<void> {
    await this.page.waitForURL(new RegExp(AppRoutes.dashboard), { timeout: Timeouts.navigation });
  }

  async verifyLoginFailed(): Promise<void> {
    await expect(this.page).toHaveURL(new RegExp(AppRoutes.login));
  }

  async getFieldErrorMessage(): Promise<string> {
    await this.fieldErrorLocator().waitFor({ state: 'visible', timeout: Timeouts.short });
    return (await this.fieldErrorLocator().innerText()).trim();
  }
}
