import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { Timeouts } from '../../constants/Timeouts';
import { NOTIFICATION_CENTRE } from '../../constants/ElementIds';
import { Logger } from '../../utils/Logger';

/**
 * The header's notification bell and the drawer it opens - the in-app
 * Notification Centre (global chrome). Added 2026-10-29 for the terminology
 * import stories, which ask whether an import's outcome is announced there.
 * The drawer's entries carry no ids of their own, so they are read as text.
 */
export class NotificationCentre {
  constructor(private readonly page: Page) {}

  async open(): Promise<void> {
    Logger.step('Opening the Notification Centre');
    await this.page.locator(`#${NOTIFICATION_CENTRE.bell}`).click();
    // The p-drawer host never reports visible (it has no box of its own); its title does.
    await expect(this.page.locator(`#${NOTIFICATION_CENTRE.title}`), 'the notification drawer should open').toBeVisible({ timeout: Timeouts.default });
  }

  /** The drawer's entries as text, newest first as it lists them. */
  async readText(): Promise<string> {
    // The list first reads 'Loading…' (20139 / 20140 read it at that moment, 2026-10-30).
    await expect(this.page.locator(`#${NOTIFICATION_CENTRE.list}`), 'the notifications should finish loading').not.toHaveText(/^\s*Loading/i, { timeout: Timeouts.default });
    return (await this.page.locator(`#${NOTIFICATION_CENTRE.list}`).innerText()).replace(/\s+/g, ' ').trim();
  }

  async close(): Promise<void> {
    await this.page.locator(`#${NOTIFICATION_CENTRE.close}`).click();
    await expect(this.page.locator(`#${NOTIFICATION_CENTRE.title}`)).toBeHidden({ timeout: Timeouts.default });
  }
}
