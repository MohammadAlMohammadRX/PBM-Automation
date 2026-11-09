import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { ChangePasswordDrawer } from './ChangePasswordDrawer';
import { clickDialogAction, readDialog } from './userCommon';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import { AppRoutes } from '../../constants/AppRoutes';
import { Timeouts } from '../../constants/Timeouts';
import { SESSION_EXPIRED, USER_MENU } from '../../constants/user/userIds';
import { NetworkUtils } from '../../utils/NetworkUtils';
import { ACCESS_TOKEN_KEY } from '../../data/payers/lifecycleGuardrails.data';

/**
 * The header user menu (initials + name -> My Profile / Change Password /
 * Logout) and the Session Expired dialog (verified 2026-11-08).
 *
 * Logout -> POST Account/Logout -> /login; a deep link afterwards lands on
 * `/login?returnUrl=<path>` and, after signing in, the app navigates to the
 * returnUrl. Session Expired is the shared `#pbm-dialog` the HTTP interceptor
 * raises on ANY 401: "Session Expired" / "Your session has expired. Please
 * sign in again to continue." / "Go to Login Page" (`pbm-dialog-action-login`).
 * There is NO idle timer or pre-expiry warning in the bundle and NO session
 * setting in System Settings (2026-11-08): the session is the access token's
 * life (`exp` claim) with a refresh token. `expireSessionNow` simulates the
 * end of a session by removing the tokens from local storage (nothing on the
 * server changes).
 */
export class UserMenu extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async open(): Promise<void> {
    await this.byId(USER_MENU.trigger).click();
    await expect(this.byId(USER_MENU.panel)).toBeVisible({ timeout: Timeouts.default });
  }

  async isOffered(): Promise<boolean> {
    return this.byId(USER_MENU.trigger).isVisible().catch(() => false);
  }

  /** The menu's entries (My Profile, Change Password, Logout). */
  async readItems(): Promise<string[]> {
    await this.open();
    const items = (await this.byId(USER_MENU.panel).locator('button').allInnerTexts()).map((t) => t.trim()).filter(Boolean);
    await this.byId(USER_MENU.trigger).click();
    return items;
  }

  async readUserName(): Promise<string> {
    return (await this.byId(USER_MENU.trigger).innerText()).replace(/\s+/g, ' ').trim();
  }

  async openMyProfile(): Promise<void> {
    await this.open();
    await this.byId(USER_MENU.profile).click();
    await this.page.waitForURL(new RegExp(AppRoutes.myProfile), { timeout: Timeouts.navigation });
  }

  async openChangePassword(): Promise<ChangePasswordDrawer> {
    await this.open();
    await this.byId(USER_MENU.changePassword).click();
    const drawer = new ChangePasswordDrawer(this.page);
    await drawer.waitForOpen();
    return drawer;
  }

  /** Logout -> the Account/Logout status (-1 when none was sent) and the path landed on. */
  async logout(): Promise<{ status: number; path: string }> {
    await this.open();
    const answer = await NetworkUtils.captureResponse(this.page, ApiEndpoints.accountLogout, () => this.byId(USER_MENU.logout).click()).catch(() => null);
    await this.page.waitForURL(new RegExp(AppRoutes.login), { timeout: Timeouts.navigation }).catch(() => undefined);
    return { status: answer?.status ?? -1, path: new URL(this.page.url()).pathname };
  }

  /** Whether this page still holds a session token. */
  async hasSession(): Promise<boolean> {
    return (await this.page.evaluate((key) => window.localStorage.getItem(key), ACCESS_TOKEN_KEY).catch(() => null)) !== null;
  }

  /** Minutes between the access token's issue and its `exp` (null when unreadable). Never returns the token. */
  async accessTokenLifetimeMinutes(): Promise<number | null> {
    return this.page.evaluate((key) => {
      const t = window.localStorage.getItem(key);
      if (!t) return null;
      try {
        const p = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number; iat?: number; nbf?: number; RefreshTokenAt?: string };
        const start = p.iat ?? p.nbf ?? (p.RefreshTokenAt ? Date.parse(p.RefreshTokenAt) / 1000 : null);
        return p.exp && start ? Math.round((p.exp - start) / 60) : null;
      } catch {
        return null;
      }
    }, ACCESS_TOKEN_KEY);
  }

  /** Seconds until the access token's `exp` (null when unreadable). */
  async secondsUntilExpiry(): Promise<number | null> {
    return this.page.evaluate((key) => {
      const t = window.localStorage.getItem(key);
      if (!t) return null;
      try {
        const p = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number };
        return p.exp ? Math.round(p.exp - Date.now() / 1000) : null;
      } catch {
        return null;
      }
    }, ACCESS_TOKEN_KEY);
  }

  /**
   * SIMULATES the end of this page's session WITHOUT a reload: the access token
   * is made invalid (its signature altered) and the refresh token removed, so
   * the next API call the app makes answers 401 and the Session Expired dialog
   * opens. Nothing on the server changes. (Removing the tokens and reloading
   * instead lands on /login with no dialog - the route guard runs first.)
   */
  async expireSessionNow(): Promise<void> {
    await this.page.evaluate((key) => {
      const t = window.localStorage.getItem(key);
      if (t) window.localStorage.setItem(key, `${t.slice(0, -4)}AAAA`);
      for (const k of Object.keys(window.localStorage)) if (/refresh/i.test(k)) window.localStorage.removeItem(k);
    }, ACCESS_TOKEN_KEY);
  }

  /** Signs the window out client-side (tokens removed): the next navigation goes to /login (?returnUrl=). */
  async dropSession(): Promise<void> {
    await this.page.evaluate(() => {
      for (const k of Object.keys(window.localStorage)) if (/token/i.test(k)) window.localStorage.removeItem(k);
    });
  }

  /** Makes the NEXT call to `urlFragment` answer 401 (one shot) - another way to raise Session Expired. */
  async failNextCallWith401(urlFragment = '/api/Notifications/GetUnreadCount'): Promise<void> {
    let done = false;
    await this.page.route(`**${urlFragment}*`, async (route) => {
      if (done) return route.continue();
      done = true;
      await route.fulfill({ status: 401, body: '' });
    });
  }

  /** The Session Expired dialog, when shown. */
  async readSessionExpired(): Promise<{ visible: boolean; title: string; message: string; actions: string[] }> {
    const d = await readDialog(this.page);
    return { visible: d.visible && /Session Expired|انتهت/.test(d.title), title: d.title, message: d.message, actions: d.actions };
  }

  async waitForSessionExpired(timeout: number = Timeouts.default): Promise<boolean> {
    return this.byId(SESSION_EXPIRED.loginAction).waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false);
  }

  async goToLoginPage(): Promise<string> {
    await clickDialogAction(this.page, 'login');
    await this.page.waitForURL(new RegExp(AppRoutes.login), { timeout: Timeouts.navigation });
    return this.page.url();
  }
}
