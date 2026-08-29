import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { AppRoutes } from '../../constants/AppRoutes';
import { Timeouts } from '../../constants/Timeouts';
import { LOGIN } from '../../constants/ElementIds';
import { Logger } from '../../utils/Logger';

/**
 * Page Object for the PBM login screen.
 *
 * `login-email` and `login-password` predate the QA-id work and deliberately
 * keep their unsuffixed names - each is the target of a `<label for>`, so
 * renaming them to `-input` would have broken that pairing for no gain.
 *
 * None of the app chrome exists on this route (only `auth-shell`), so nothing
 * here waits on the authenticated layout.
 */
export class LoginPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  private emailInput(): Locator {
    return this.byId(LOGIN.email);
  }

  private passwordInput(): Locator {
    return this.byId(LOGIN.password);
  }

  private loginButton(): Locator {
    return this.btn(LOGIN.submit);
  }

  /** The inline failure banner - only in the DOM after a rejected attempt. */
  alert(): Locator {
    return this.byId(LOGIN.alert);
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

    // The submit button is disabled while ANY request is in flight, and this
    // screen fires branding + password-policy calls on load. btn() targets the
    // inner <button> so Playwright waits for it to be enabled - clicking the
    // p-button host instead would skip that check entirely.
    //
    // Even so, a click can land in the gap between that check and the click
    // itself, hitting a button the busy state just disabled: a no-op that
    // reports success. A blind retry is the wrong cure - sign-in takes 4-20s
    // here, and a second click mid-flight sends a second /Account/Login and
    // strands the app on /login. So re-click ONLY when no login request was
    // sent at all, which tells "the click did nothing" apart from "the click
    // worked and the server is slow", and cannot double-submit.
    const loginRequested = this.page
      .waitForRequest((request) => request.url().includes('/Account/Login'), {
        timeout: Timeouts.default,
      })
      .then(() => true)
      .catch(() => false);
    await this.loginButton().click();
    if (!(await loginRequested)) {
      Logger.warn('Login click did not reach the server (button was busy) - retrying once');
      await this.loginButton().click();
    }
  }

  /** Logs in and waits until the post-login dashboard has loaded. */
  async loginAndWaitForDashboard(username: string, password: string): Promise<void> {
    await this.login(username, password);
    await this.page.waitForURL(new RegExp(`${AppRoutes.dashboard}`), { timeout: Timeouts.navigation });
    await this.waitForPageReady();
  }
}
