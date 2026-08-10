import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { AppRoutes } from '../../constants/AppRoutes';
import { Logger } from '../../utils/Logger';

/**
 * Reusable component object for the left-hand navigation drawer, present on
 * every authenticated page. Verified locators (stable, framework-generated
 * classes - NOT random/hashed):
 *   nav.pbm-drawer__nav > ul.pbm-drawer__list
 *   a.pbm-drawer__link[href="..."]        -> direct-link items (Dashboard, Payer Mgmt, ...)
 *   button.pbm-drawer__group-header       -> expandable groups (Users Mgmt, System Settings)
 */
export class SidebarNav {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  private linkFor(href: string) {
    return this.page.locator(`a.pbm-drawer__link[href="${href}"]`);
  }

  private groupHeader(label: string) {
    return this.page.locator('button.pbm-drawer__group-header', { hasText: label });
  }

  async goToDashboard(): Promise<void> {
    Logger.step('Navigating via sidebar: Dashboard');
    await this.linkFor(AppRoutes.dashboard).click();
  }

  async goToPayerManagement(): Promise<void> {
    Logger.step('Navigating via sidebar: Payer Mgmt');
    await this.linkFor(AppRoutes.payerManagement).click();
  }

  async goToNetworkManagement(): Promise<void> {
    Logger.step('Navigating via sidebar: Network Mgmt');
    await this.linkFor(AppRoutes.networkManagement).click();
  }

  /** Expands the "Users Mgmt" group and navigates to "Users Administration". */
  async goToUsersAdministration(): Promise<void> {
    Logger.step('Navigating via sidebar: Users Mgmt > Users Administration');
    const usersAdminLink = this.linkFor(AppRoutes.usersAdministration);
    if (!(await usersAdminLink.isVisible().catch(() => false))) {
      await this.groupHeader('Users Mgmt').click();
    }
    await usersAdminLink.click();
  }

  async verifyLinkIsActive(href: string): Promise<void> {
    await expect(this.linkFor(href)).toHaveClass(/is-active/);
  }
}
