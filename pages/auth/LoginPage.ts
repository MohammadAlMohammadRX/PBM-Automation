import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { AppRoutes } from '../../constants/AppRoutes';
import { Timeouts } from '../../constants/Timeouts';
import { Logger } from '../../utils/Logger';

/**
 * Page Object for the PBM login screen.
 *
 * Verified against the live app: the email/password controls expose their
 * visible label ("* Email Address" / "* Password") as their accessible name,
 * so they are located by role + name rather than by a fragile id.
 */
export class LoginPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  private emailInput(): Locator {
    return this.page.getByRole('textbox', { name: 'Email Address' });
  }

  private passwordInput(): Locator {
    return this.page.getByRole('textbox', { name: 'Password' });
  }

  private loginButton(): Locator {
    return this.page.getByRole('button', { name: 'Login', exact: true });
  }

  /** Navigates to the login screen. */
  async open(): Promise<void> {
    await this.goto(AppRoutes.login);
    await expect(this.emailInput()).toBeVisible({ timeout: Timeouts.navigation });
  }

  /** Fills credentials and submits the login form. */
  async login(username: string, password: string): Promise<void> {
    Logger.step(`Logging in as "${username}"`);
    await this.emailInput().fill(username);
    await this.passwordInput().fill(password);
    await this.loginButton().click();
  }

  /** Logs in and waits until the post-login dashboard has loaded. */
  async loginAndWaitForDashboard(username: string, password: string): Promise<void> {
    await this.login(username, password);
    await this.page.waitForURL(new RegExp(`${AppRoutes.dashboard}`), { timeout: Timeouts.navigation });
    await this.waitForPageReady();
  }
}
