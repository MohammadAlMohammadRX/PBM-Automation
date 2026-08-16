import type { Dialog, Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { env } from '../constants/EnvironmentConfig';
import { Timeouts } from '../constants/Timeouts';
import { Logger } from '../utils/Logger';
import { WaitUtils } from '../utils/WaitUtils';

/**
 * Base class for every Page Object in the framework.
 * Holds only genuinely shared behaviour: navigation, readiness waits,
 * unexpected-dialog handling, and toast/notification helpers. Page-specific
 * locators and actions belong in the concrete Page Object, never here.
 */
export abstract class BasePage {
  protected readonly page: Page;

  protected constructor(page: Page) {
    this.page = page;
    this.attachUnexpectedDialogHandler();
  }

  /**
   * Auto-handles native browser dialogs (alert/confirm/prompt) that the
   * application might unexpectedly trigger, so a stray dialog never hangs a
   * test run. PBM's own confirmation modals are custom components (not
   * native dialogs) and are handled explicitly in the relevant Page Object.
   */
  private attachUnexpectedDialogHandler(): void {
    this.page.on('dialog', async (dialog: Dialog) => {
      Logger.warn(`Unexpected native dialog appeared: [${dialog.type()}] ${dialog.message()}`);
      await dialog.dismiss().catch(() => undefined);
    });
  }

  /** Navigates to a path relative to BASE_URL and waits for the page to settle. */
  async goto(relativePath: string): Promise<void> {
    const url = new URL(relativePath, env.baseUrl).toString();
    Logger.navigation(url);
    await this.page.goto(url, { timeout: Timeouts.navigation, waitUntil: 'domcontentloaded' });
    await this.waitForPageReady();
  }

  /** Waits for the DOM to be ready and any loading indicator to disappear. */
  async waitForPageReady(): Promise<void> {
    await WaitUtils.waitForDomReady(this.page);
    await WaitUtils.waitForLoadingToFinish(this.page);
  }

  /** Reloads the current page and waits for it to settle. */
  async reload(): Promise<void> {
    await this.page.reload({ timeout: Timeouts.navigation, waitUntil: 'domcontentloaded' });
    await this.waitForPageReady();
  }

  async getCurrentUrl(): Promise<string> {
    return this.page.url();
  }

  async getPageTitle(): Promise<string> {
    return this.page.title();
  }

  /** Asserts the current URL matches (contains) the expected relative path. */
  async verifyUrlContains(expectedPathFragment: string): Promise<void> {
    await expect(this.page).toHaveURL(new RegExp(expectedPathFragment), { timeout: Timeouts.navigation });
  }

  /**
   * Generic toast/notification reader. PBM (PrimeNG-based) surfaces
   * success/error messages via toast components; the selector list covers
   * the common PrimeNG toast markup and is safe to extend per-module if a
   * module uses a different notification pattern.
   */
  protected toastLocator(): Locator {
    return this.page.locator('.p-toast-message, [role="alert"]').first();
  }

  async getToastMessage(timeout: number = Timeouts.toast): Promise<string> {
    const toast = this.toastLocator();
    await toast.waitFor({ state: 'visible', timeout });
    return (await toast.innerText()).trim();
  }

  async isToastVisible(timeout: number = Timeouts.short): Promise<boolean> {
    return this.toastLocator()
      .isVisible({ timeout })
      .catch(() => false);
  }
}
