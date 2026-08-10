import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { BasePage } from './BasePage';
import { SidebarNav } from './components/SidebarNav';
import { AppRoutes } from '../constants/AppRoutes';
import { Timeouts } from '../constants/Timeouts';

/**
 * Page Object for the post-login Dashboard landing page.
 * Exposes the shared SidebarNav component so tests can navigate to any
 * module through a single, reusable object instead of duplicating nav
 * locators per test.
 */
export class DashboardPage extends BasePage {
  readonly sidebar: SidebarNav;

  constructor(page: Page) {
    super(page);
    this.sidebar = new SidebarNav(page);
  }

  async open(): Promise<void> {
    await this.goto(AppRoutes.dashboard);
  }

  async verifyDashboardLoaded(): Promise<void> {
    await expect(this.page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible({
      timeout: Timeouts.default,
    });
  }

  async getLoggedInUserLabel(): Promise<string> {
    return (await this.page.getByRole('button', { name: 'User menu' }).innerText()).trim();
  }
}
