import type { Locator, Page, Response } from '@playwright/test';
import { expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { Timeouts } from '../../constants/Timeouts';
import { BELL, type BellKind } from '../../constants/notification/notificationIds';
import { Logger } from '../../utils/Logger';

/**
 * The two header bells (global chrome, on every screen) - Notification Center
 * foundation 2026-11-11. Both drawers share one shape (ids `<kind>-drawer-*`):
 *
 *   <kind>-bell-button / -bell-badge          the bell and its unread badge ("9+" above nine)
 *   <kind>-drawer-title / -unread-count       "Notifications" / "Announcements", "3 new"
 *   <kind>-drawer-search-input                "Search notifications" / "Search announcements" (server-side search)
 *   <kind>-drawer-tab-all|unread|read|archived (+ -tab-unread-badge)
 *   <kind>-drawer-list / -empty               rows, or "No archived announcements." etc.
 *   <kind>-drawer-row-<inbox item id>         one row; children -type (definition / announcement name),
 *                                             -time ("now", "5 hours ago", "22 Sept 2026"), -text (message), -archive-button
 *   <kind>-drawer-load-more-button            notification bell only (10 a page); the announcement bell loads all
 *   <kind>-drawer-mark-all-read-button / -close
 *
 * Every list change waits for the drawer's OWN answer (GetMyNotifications /
 * GetMyAnnouncements) - never a fixed sleep. Clicking a row opens its detail
 * page (/notifications/<approval request id> or /announcements/<announcement id>)
 * and closes the drawer.
 *
 * Usable on ANY Page - the admin's `page` or `secondUser.page`.
 */
export interface BellRow {
  /** The inbox item id (the id MarkAsRead / ArchiveForMe take). */
  id: string;
  type: string;
  time: string;
  text: string;
  /** The row element's class list - the unread dot / highlight is a class (read it, do not guess). */
  classes: string;
}

export abstract class InboxBell extends BasePage {
  protected constructor(page: Page, readonly kind: BellKind) {
    super(page);
  }

  /** The drawer's list API (path fragment). */
  protected abstract listApi(): string;
  protected abstract actionApi(): string;

  protected id(suffix: string): Locator {
    return this.byId(`${this.kind}-${suffix}`);
  }

  control(key: keyof typeof BELL.part): Locator {
    return this.id(BELL.part[key]);
  }

  /** Arms a wait for the drawer's list answer BEFORE the action that triggers it. */
  protected listAnswer(timeout: number = Timeouts.default): Promise<Response | null> {
    return this.page.waitForResponse((r) => r.url().includes(this.listApi()) && r.request().method() === 'POST', { timeout }).catch(() => null);
  }

  bellButton(): Locator {
    return this.id('bell-button');
  }

  badge(): Locator {
    return this.id('bell-badge');
  }

  /** The badge text ('' when no badge is shown). */
  async badgeText(): Promise<string> {
    if (!(await this.badge().isVisible().catch(() => false))) return '';
    return (await this.badge().innerText()).trim();
  }

  async isOpen(): Promise<boolean> {
    return this.control('title').isVisible().catch(() => false);
  }

  /** Opens the drawer (no-op when open) and waits for its first list answer. */
  async open(): Promise<void> {
    if (await this.isOpen()) return;
    Logger.step(`Opening the ${this.kind} bell`);
    const answered = this.listAnswer();
    await this.bellButton().click();
    // The p-drawer host never reports visible (no box of its own); its title does.
    await expect(this.control('title'), `the ${this.kind} drawer should open`).toBeVisible({ timeout: Timeouts.default });
    await answered;
    await this.settle();
  }

  async close(): Promise<void> {
    if (!(await this.isOpen())) return;
    await this.control('close').click();
    await expect(this.control('title')).toBeHidden({ timeout: Timeouts.default });
  }

  /** Waits until the list's text stops changing (it re-renders after the answer). */
  async settle(): Promise<void> {
    let previous = '';
    for (let i = 0; i < 12; i += 1) {
      const now = await this.control('list').innerText().catch(() => '');
      if (now === previous && !/^\s*(Loading|جارٍ التحميل|جار التحميل)/i.test(now)) return;
      previous = now;
      await this.page.waitForTimeout(250);
    }
  }

  tab(name: 'all' | 'unread' | 'read' | 'archived'): Locator {
    return this.id(`drawer-tab-${name}`);
  }

  /** Switches tab and waits for that tab's answer. */
  async openTab(name: 'all' | 'unread' | 'read' | 'archived'): Promise<void> {
    await this.open();
    Logger.step(`${this.kind} bell: tab "${name}"`);
    const answered = this.listAnswer();
    await this.tab(name).click();
    await answered;
    await this.settle();
  }

  /** Types into the drawer's search (server-side, debounced) and waits for the answer. */
  async search(term: string): Promise<void> {
    await this.open();
    Logger.step(`${this.kind} bell: searching "${term}"`);
    const answered = this.listAnswer();
    await this.control('search').fill(term);
    await answered;
    await this.settle();
  }

  /** "3 new" in the header ('' when absent). */
  async headerCount(): Promise<string> {
    return (await this.control('unreadCount').isVisible().catch(() => false)) ? (await this.control('unreadCount').innerText()).trim() : '';
  }

  /** The Unread tab's own badge ('' when absent). */
  async unreadTabBadge(): Promise<string> {
    return (await this.control('unreadTabBadge').isVisible().catch(() => false)) ? (await this.control('unreadTabBadge').innerText()).trim() : '';
  }

  /** The empty-state text ('' when rows are shown). */
  async emptyText(): Promise<string> {
    return (await this.control('empty').isVisible().catch(() => false)) ? (await this.control('empty').innerText()).trim() : '';
  }

  /** Every row element (the row div, not its -text / -time / -type / -archive-button children). */
  rowElements(): Locator {
    // locator-exception: rows are keyed by the inbox item id; the :not() filters drop the row's own child ids.
    return this.page.locator(`[id^="${this.kind}-drawer-row-"]:not([id$="-text"]):not([id$="-time"]):not([id$="-type"]):not([id$="-archive-button"])`);
  }

  row(itemId: string): Locator {
    return this.id(`drawer-row-${itemId}`);
  }

  rowPart(itemId: string, part: 'text' | 'time' | 'type' | 'archive-button'): Locator {
    return this.id(`drawer-row-${itemId}-${part}`);
  }

  /** The rows as shown, top to bottom. */
  async readRows(): Promise<BellRow[]> {
    const prefix = `${this.kind}-drawer-row-`;
    return this.rowElements().evaluateAll((els, p) => els.map((el) => {
      const id = el.id.slice(p.length);
      const part = (s: string): string => (document.getElementById(`${el.id}-${s}`)?.textContent ?? '').replace(/\s+/g, ' ').trim();
      return { id, type: part('type'), time: part('time'), text: part('text'), classes: el.className.toString() };
    }), prefix);
  }

  /** The first row whose text / type contains `text` (null when none is listed). */
  async findRow(text: string): Promise<BellRow | null> {
    return (await this.readRows()).find((r) => r.text.includes(text) || r.type.includes(text)) ?? null;
  }

  /** Clicks a row (opens its detail page; the item becomes read). */
  async clickRow(itemId: string): Promise<void> {
    Logger.step(`${this.kind} bell: opening row ${itemId}`);
    await this.rowPart(itemId, 'text').click();
  }

  /** Archives a row through its own button and waits for ArchiveForMe. */
  async archive(itemId: string): Promise<number | null> {
    Logger.step(`${this.kind} bell: archiving row ${itemId}`);
    const done = this.page.waitForResponse((r) => r.url().includes(`${this.actionApi()}/ArchiveForMe`), { timeout: Timeouts.default }).catch(() => null);
    await this.rowPart(itemId, 'archive-button').click();
    return (await done)?.status() ?? null;
  }

  /** Mark all as read; answers the MarkAllAsRead status (null when no request left - e.g. the button was disabled). */
  async markAllRead(): Promise<number | null> {
    await this.open();
    Logger.step(`${this.kind} bell: Mark all as read`);
    const done = this.page.waitForResponse((r) => r.url().includes(`${this.actionApi()}/MarkAllAsRead`), { timeout: Timeouts.short }).catch(() => null);
    await this.control('markAllRead').click();
    return (await done)?.status() ?? null;
  }

  async isMarkAllReadEnabled(): Promise<boolean> {
    return this.control('markAllRead').isEnabled().catch(() => false);
  }

  /** Clicks Load more and waits for the next page's answer; false when the button is not offered. */
  async loadMore(): Promise<boolean> {
    if (!(await this.control('loadMore').isVisible().catch(() => false))) return false;
    const answered = this.listAnswer();
    await this.control('loadMore').click();
    await answered;
    await this.settle();
    return true;
  }
}

/** The bell icon: in-app notifications (GetMyNotifications). */
export class NotificationBell extends InboxBell {
  constructor(page: Page) {
    super(page, 'notification');
  }

  protected listApi(): string {
    return '/api/Notifications/GetMyNotifications';
  }

  protected actionApi(): string {
    return '/api/Notifications';
  }
}

/** The megaphone: announcements (GetMyAnnouncements). */
export class AnnouncementBell extends InboxBell {
  constructor(page: Page) {
    super(page, 'announcement');
  }

  protected listApi(): string {
    return '/api/MyAnnouncements/GetMyAnnouncements';
  }

  protected actionApi(): string {
    return '/api/MyAnnouncements';
  }
}
