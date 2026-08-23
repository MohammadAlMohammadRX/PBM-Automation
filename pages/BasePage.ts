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

  /**
   * Every list module (Payer, Approval, ...) offers a "Table view" / "Cards view"
   * toggle and REMEMBERS the last choice for the signed-in user. All list
   * assertions read the table, so this waits out the loading spinner and keeps
   * switching to Table view until the table is actually rendered.
   */
  protected async ensureTableView(): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await this.page
        .getByRole('progressbar', { name: 'Loading' })
        .waitFor({ state: 'hidden', timeout: Timeouts.loadingIndicator })
        .catch(() => undefined);
      if (await this.page.getByRole('table').isVisible({ timeout: Timeouts.short }).catch(() => false)) {
        return;
      }
      // In Arabic the view tabs render icon-only with no accessible name, so fall
      // back to the first tab by position - Table view is always the first one.
      const namedTab = this.page.getByRole('tab', { name: 'Table view' });
      const tableTab = (await namedTab.count()) > 0
        ? namedTab
        : this.page.getByRole('tab').first();
      if (await tableTab.isVisible().catch(() => false)) {
        Logger.step('Switching list to Table view');
        await tableTab.click();
        await this.waitForPageReady();
        continue;
      }
      await this.reload();
    }
    await expect(this.page.getByRole('table')).toBeVisible({ timeout: Timeouts.default });
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
    // Only real toasts. The wizard renders a permanent informational banner with
    // role="alert" ("Initial status will be set to Pending..."), which would
    // otherwise be matched first and mask the message under test.
    return this.page.locator('.p-toast-message').first();
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
