import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { Timeouts } from '../../constants/Timeouts';
import { ANNOUNCEMENT_DETAIL, NOTIFICATION_DETAIL } from '../../constants/notification/notificationIds';
import { Logger } from '../../utils/Logger';
import { chooseSelectOption, readSelectOptions } from '../components/PrimeControls';

/**
 * Notification Detail page - /notifications/<approval request id>, opened by
 * clicking a "Need to Approve" notification (its relatedEntityId). Verified
 * live 2026-11-11 (foundation probe):
 *
 *   header: action ("Add Payer"), entity type ("Payer"), status badge ("Pending"),
 *   Requested By (the submitter's user name, e.g. "1256468886"), Requested On ("11/11/2026 12:24"),
 *   "Notification" = the message, "Changes" = a Field / Before / After table (diff-row-<field>).
 *   Approve / Reject for a reviewer; for the SUBMITTER without self-approval:
 *   "You submitted this request. A different reviewer must approve or reject it." and no buttons.
 *   Reject opens the "Reject Submission" drawer: reason select (7 reasons) + details (500, required for "Other").
 *
 * Usable on any Page (`secondUser.page` too).
 */
export class NotificationDetailPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  el(key: Exclude<keyof typeof NOTIFICATION_DETAIL, 'reject' | 'diffRow' | 'diffCell' | 'routePrefix' | 'diffRowPrefix'>): Locator {
    return this.byId(NOTIFICATION_DETAIL[key] as string);
  }

  rejectEl(key: keyof typeof NOTIFICATION_DETAIL.reject): Locator {
    return this.byId(NOTIFICATION_DETAIL.reject[key]);
  }

  /** Opens the page for an approval request id directly (waits for GetApprovalDetail). */
  async open(requestId: string): Promise<void> {
    const loaded = this.page.waitForResponse((r) => r.url().includes('/api/Approvals/GetApprovalDetail'), { timeout: Timeouts.default }).catch(() => null);
    await this.goto(`${NOTIFICATION_DETAIL.routePrefix}${requestId}`);
    await loaded;
    await this.waitForLoaded();
  }

  /** Waits until the page shows its header (after a bell click too). */
  async waitForLoaded(): Promise<void> {
    await expect(this.el('header'), 'the Notification Detail page should render').toBeVisible({ timeout: Timeouts.default });
  }

  /** The request id from the URL ('' when not on the page). */
  requestIdFromUrl(): string {
    const m = /\/notifications\/([0-9a-f-]{36})/i.exec(this.page.url());
    return m ? m[1] : '';
  }

  async text(key: Parameters<NotificationDetailPage['el']>[0]): Promise<string> {
    const l = this.el(key);
    return (await l.isVisible().catch(() => false)) ? (await l.innerText()).replace(/\s+/g, ' ').trim() : '';
  }

  /** The Changes table: `{ field: { label, before, after } }` keyed by the row id's field key. */
  async readDiff(): Promise<Record<string, { label: string; before: string; after: string }>> {
    return this.page.locator(`[id^="${NOTIFICATION_DETAIL.diffRowPrefix}"][id$="-field"]`).evaluateAll((cells, prefix) => {
      const out: Record<string, { label: string; before: string; after: string }> = {};
      for (const c of cells) {
        const key = c.id.slice(prefix.length, -'-field'.length);
        const get = (p: string): string => (document.getElementById(`${prefix}${key}-${p}`)?.textContent ?? '').replace(/\s+/g, ' ').trim();
        out[key] = { label: get('field'), before: get('before'), after: get('after') };
      }
      return out;
    }, NOTIFICATION_DETAIL.diffRowPrefix);
  }

  async hasDecisionButtons(): Promise<{ approve: boolean; reject: boolean }> {
    return {
      approve: await this.el('approveButton').isVisible().catch(() => false),
      reject: await this.el('rejectButton').isVisible().catch(() => false),
    };
  }

  /** Clicks Approve and returns the ApproveRequest answer (status + text) - asserts nothing. */
  async approve(): Promise<{ status: number | null; text: string }> {
    Logger.step('Notification Detail: Approve');
    const answer = this.page.waitForResponse((r) => r.url().includes('/api/Approvals/ApproveRequest'), { timeout: Timeouts.default }).catch(() => null);
    await this.el('approveButton').click();
    const r = await answer;
    return { status: r?.status() ?? null, text: (await r?.text().catch(() => '')) ?? '' };
  }

  async openReject(): Promise<void> {
    await this.el('rejectButton').click();
    await expect(this.rejectEl('title'), 'the Reject Submission drawer should open').toBeVisible({ timeout: Timeouts.default });
  }

  async rejectReasons(): Promise<string[]> {
    return readSelectOptions(this.page, this.rejectCombo());
  }

  private rejectCombo(): Locator {
    return this.rejectEl('reasonSelect').locator('xpath=ancestor-or-self::*[@role="combobox"][1] | descendant-or-self::*[@role="combobox"]').first();
  }

  /** Fills the Reject drawer (reason by its label, optional details) and submits; returns RejectRequest's answer (null status = nothing sent). */
  async reject(reason: string | null, details?: string): Promise<{ status: number | null; text: string }> {
    if (!(await this.rejectEl('title').isVisible().catch(() => false))) await this.openReject();
    if (reason) await chooseSelectOption(this.page, this.rejectCombo(), reason);
    if (details !== undefined) await this.rejectEl('details').fill(details);
    Logger.step(`Notification Detail: Reject (${reason ?? 'no reason'})`);
    const answer = this.page.waitForResponse((r) => r.url().includes('/api/Approvals/RejectRequest'), { timeout: Timeouts.short }).catch(() => null);
    await this.rejectEl('confirm').click();
    const r = await answer;
    return { status: r?.status() ?? null, text: (await r?.text().catch(() => '')) ?? '' };
  }

  async cancelReject(): Promise<void> {
    await this.rejectEl('cancel').click();
    await expect(this.rejectEl('title')).toBeHidden({ timeout: Timeouts.default });
  }
}

/**
 * Announcement detail page - /announcements/<announcement id>, opened by a
 * bell row. Shows the name, the date ("11/11/2026, 17:02:59") and the
 * message in the UI language (`dir` ltr / rtl), with Back. Verified live
 * 2026-11-11: a CANCELLED announcement still renders here for a recipient who
 * opens the URL (no "Announcement not found." seen) - a writer asserting the
 * not-found message reads it from the page, it is not assumed.
 */
export class AnnouncementDetailPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  el(key: Exclude<keyof typeof ANNOUNCEMENT_DETAIL, 'routePrefix'>): Locator {
    return this.byId(ANNOUNCEMENT_DETAIL[key]);
  }

  /** Opens the page directly (waits for GetMyAnnouncement). */
  async open(announcementId: string): Promise<void> {
    const loaded = this.page.waitForResponse((r) => r.url().includes('/api/MyAnnouncements/GetMyAnnouncement'), { timeout: Timeouts.default }).catch(() => null);
    await this.goto(`${ANNOUNCEMENT_DETAIL.routePrefix}${announcementId}`);
    await loaded;
  }

  async waitForLoaded(): Promise<void> {
    await expect(this.el('root'), 'the announcement detail should render').toBeVisible({ timeout: Timeouts.default });
  }

  idFromUrl(): string {
    const m = /\/announcements\/([0-9a-f-]{36})/i.exec(this.page.url());
    return m ? m[1] : '';
  }

  async read(): Promise<{ title: string; date: string; message: string; dir: string; pageText: string }> {
    const t = async (l: Locator): Promise<string> => ((await l.isVisible().catch(() => false)) ? (await l.innerText()).replace(/\s+/g, ' ').trim() : '');
    return {
      title: await t(this.el('title')),
      date: await t(this.el('date')),
      message: await t(this.el('message')),
      dir: (await this.el('message').getAttribute('dir').catch(() => null)) ?? '',
      pageText: (await this.byId('app-layout-outlet').innerText().catch(() => '')).replace(/\s+/g, ' ').trim(),
    };
  }

  async back(): Promise<void> {
    await this.el('back').click();
  }
}
