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
/** The drawer's placeholder while it fetches, in either UI language ("جارٍ التحميل…" in Arabic, 18302). */
const LOADING = /^\s*(Loading|جارٍ التحميل|جار التحميل)/i;

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
    await expect(this.page.locator(`#${NOTIFICATION_CENTRE.list}`), 'the notifications should finish loading').not.toHaveText(LOADING, { timeout: Timeouts.default });
    return (await this.page.locator(`#${NOTIFICATION_CENTRE.list}`).innerText()).replace(/\s+/g, ' ').trim();
  }

  /**
   * The drawer's text once it holds `wanted`: the drawer shows the newest
   * entries first and loads older ones as it is scrolled, so an entry pushed
   * down by later notifications (18301 / 18309, 2026-11-08: a run's dozens of
   * "Your network is Active" items) is reached by scrolling to the end until
   * it appears or nothing more loads. Returns what was read either way.
   */
  async readTextIncluding(wanted: string): Promise<string> {
    const list = this.page.locator(`#${NOTIFICATION_CENTRE.list}`);
    let text = await this.readText();
    // locator-exception: the drawer's "Load more" control (about 10 items a page,
    // 2026-11-08) was not found with an id of its own, so it is matched by its id
    // fragment or its English / Arabic label inside the drawer.
    const loadMore = this.page
      .locator(`#${NOTIFICATION_CENTRE.drawer}`)
      .locator('[id*="load-more"], :is(button,a,[role="button"]):has-text("Load more"), :is(button,a,[role="button"]):has-text("تحميل المزيد")')
      .first();
    for (let i = 0; i < 30 && wanted && !text.includes(wanted); i += 1) {
      if (await loadMore.isVisible().catch(() => false)) {
        await loadMore.click();
        await this.page.waitForTimeout(1_000);
        const more = (await list.innerText()).replace(/\s+/g, ' ').trim();
        if (more !== text) {
          text = more;
          continue;
        }
      }
      await list.evaluate((el) => {
        for (let n: Element | null = el.lastElementChild ?? el; n; n = n.parentElement) {
          if (n.scrollHeight > n.clientHeight + 4) {
            n.scrollTop = n.scrollHeight;
            break;
          }
        }
        el.lastElementChild?.scrollIntoView({ block: 'end' });
      });
      await this.page.waitForTimeout(700);
      const next = (await list.innerText()).replace(/\s+/g, ' ').trim();
      if (next === text) break;
      text = next;
    }
    return text;
  }

  async close(): Promise<void> {
    await this.page.locator(`#${NOTIFICATION_CENTRE.close}`).click();
    await expect(this.page.locator(`#${NOTIFICATION_CENTRE.title}`)).toBeHidden({ timeout: Timeouts.default });
  }
}
