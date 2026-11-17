import type { BrowserContext, Locator, Page, WebSocketRoute } from '@playwright/test';
import { test as base, expect } from '../../fixtures';
import type { TestSteps } from '../../fixtures/testStatus.fixture';
import { blockedByPrecondition } from '../../fixtures/testStatus.fixture';
import { BasePage, disableAdminAutoSignIn } from '../../pages/BasePage';
import { AnnouncementBell, NotificationBell, type BellRow, type InboxBell } from '../../pages/notification/InboxBells';
import { GLOBAL, LOGIN } from '../../constants/ElementIds';
import { DEFAULT_VIEWPORT } from '../../constants/BrowserConfig';
import { env } from '../../constants/EnvironmentConfig';
import { Timeouts } from '../../constants/Timeouts';
import { NC_TOAST } from '../../constants/notification/notificationIds';
import { toArabicToken } from '../../data/payers/payer.data';
import { Logger } from '../Logger';
import { deleteNetworkById, pendingRequestId, provisionNetwork, type ProvisionedNetwork } from '../NetworkProvisioning';
import {
  NOTIFICATION_ACTION,
  NOTIFICATION_MODULE,
  SUITE_ANNOUNCEMENT_PREFIX,
  actionVariablesNc,
  inboxAction,
  myAnnouncements,
  myNotifications,
  ncStamp,
  readAnnouncement,
  rejectRequest,
  rejectionReasons,
  setDefinitionActive,
  userAudience,
  type AnnouncementAudience,
  type AnnouncementRecord,
  type InboxAnnouncement,
  type InboxNotification,
  type InboxTab,
} from './notificationApi';

/**
 * Writer F helpers - Notification Center folders 22 (Notifications bell,
 * US 21010) and 29 (Announcements bell, US 21018).
 *
 * The `bellFeed` fixture produces the inbox items the bell cases need for the
 * SECOND USER (maalmohammad - careconnect's inbox is far too big to count):
 *
 *   notifications: ACTIVE suite App Notifications on "Need to Approve - Network"
 *     (module Approval Management; no live definition uses that action) aimed
 *     only at maalmohammad (+ careconnect on request), fired by submitting a
 *     suite network for approval from the admin session. Each batch's
 *     definitions are deactivated once its items arrived; teardown rejects the
 *     network's pending request and deletes the network (the suiteDefinitions
 *     fixture deletes the definitions).
 *   announcements: suite announcements published NOW to maalmohammad (and / or
 *     careconnect); the job delivers them in about a minute; suiteAnnouncements
 *     cancels them at teardown.
 *
 * Every message carries a unique run word so the bell can be SEARCHED for the
 * suite's own rows. Readers here return what the screen / server showed; the
 * spec asserts what its case expects.
 */

// ---------------------------------------------------------------- BLOCKED (lead decision 8)

/** BLOCKED - unless an earlier step already FAILED (the finding then stays a FAIL; the reason becomes a note). */
export function blockUnlessAStepFailed(steps: TestSteps, reason: string): void {
  const info = base.info();
  if (info.errors.length > 0) {
    info.annotations.push({ type: 'note', description: `This step could not be observed either: ${reason}` });
    Logger.warn(`Not marked BLOCKED (an earlier step failed): ${reason}`);
    return;
  }
  steps.blocked(reason);
}

/** Blocks (or, after a failed step, throws) when `ok` is false. */
export function requireOrBlock(steps: TestSteps, ok: boolean, reason: string): void {
  if (ok) return;
  blockUnlessAStepFailed(steps, reason);
  throw new Error(reason);
}

// ---------------------------------------------------------------- words

/** A unique latin search word (letters + digits only, so the server search matches it as typed). */
export const runWord = (label = 'qabell'): string => `${label}${ncStamp()}`.toLowerCase();

/** A unique Arabic word built from the run stamp (letters only). */
export const runArabicWord = (): string => `اختبار${toArabicToken(ncStamp())}`;

// ---------------------------------------------------------------- the feed

/** The action every suite notification definition listens to (Approval Management). */
const FEED_MODULE = NOTIFICATION_MODULE.approvalManagement;
const FEED_ACTION = NOTIFICATION_ACTION.networkNeedApprove;
const ADMIN_NAME = 'CareConnect Admin User';
const CLEANUP_DETAILS = 'QA automation: clean-up of a suite network submitted only to raise a suite notification.';

export interface NotificationBatch {
  /** The latin word every English message of the batch carries. */
  word: string;
  /** The Arabic word every Arabic message carries. */
  arabicWord: string;
  definitions: { id: string; name: string }[];
  /** The English / Arabic text each definition's message starts with (index = definition). */
  english: string[];
  arabic: string[];
}

export interface BatchOptions {
  /** careconnect is an audience too (21699). */
  alsoAdmin?: boolean;
  english?: (word: string, i: number) => string;
  arabic?: (arabicWord: string, i: number) => string;
}

export interface AnnouncementBatch {
  word: string;
  arabicWord: string;
  records: AnnouncementRecord[];
  english: string[];
  arabic: string[];
}

export interface AnnouncementOptions {
  /** Recipients: the second user (default), careconnect, or both. */
  to?: 'second' | 'admin' | 'both';
  english?: (word: string, i: number) => string;
  arabic?: (arabicWord: string, i: number) => string;
}

export interface BellFeed {
  /** Creates `count` ACTIVE suite definitions (one batch) aimed at the second user; retires every earlier batch first. */
  prepareNotifications(count: number, opts?: BatchOptions): Promise<NotificationBatch>;
  /** The event: submits a suite network for approval from the admin session (BLOCKED when it cannot be made). */
  fireNotificationEvent(): Promise<string>;
  /** Polls the inbox of `page` (default the second user) until `minimum` items of the batch are listed; what arrived (newest first). */
  awaitNotifications(batch: NotificationBatch, minimum: number, opts?: { page?: Page; timeoutMs?: number }): Promise<InboxNotification[]>;
  /** Deactivates a batch's definitions (later events no longer reach the account). */
  retire(batch: NotificationBatch): Promise<void>;
  /** prepare + fire (+ more events if the app sends one per event) + await + retire; BLOCKS when fewer than `count` arrive. */
  notifications(count: number, opts?: BatchOptions): Promise<{ batch: NotificationBatch; items: InboxNotification[] }>;
  /** Makes sure the second user's All tab holds at least `n` notifications; answers the total. */
  ensureNotificationTotal(n: number): Promise<number>;
  /** Creates `count` suite announcements published NOW (does not wait). */
  publishAnnouncements(count: number, opts?: AnnouncementOptions): Promise<AnnouncementBatch>;
  /** Polls the announcement inbox of `page` (default the second user) until `minimum` of the batch are listed (newest first). */
  awaitAnnouncements(batch: AnnouncementBatch, minimum: number, opts?: { page?: Page; timeoutMs?: number }): Promise<InboxAnnouncement[]>;
  /** publish + wait until every recipient holds them; BLOCKS when they did not arrive. Items = the SECOND user's (or the admin's when `to: 'admin'`). */
  announcements(count: number, opts?: AnnouncementOptions): Promise<{ batch: AnnouncementBatch; items: InboxAnnouncement[] }>;
  /** Polls GetAnnouncement (admin) until the suite announcement reads Published; the last status seen. */
  waitPublished(id: string, timeoutMs?: number): Promise<string>;
}

/** A signed-out browser window (21706 / 21833). */
export interface Visitor {
  page: Page;
  screen: AppScreen;
  notificationBell: NotificationBell;
  announcementBell: AnnouncementBell;
}

export interface WriterFFixtures {
  bellFeed: BellFeed;
  visitor: Visitor;
}

const byNewest = <T extends { createdOn: string }>(items: T[]): T[] =>
  [...items].sort((a, b) => new Date(b.createdOn).getTime() - new Date(a.createdOn).getTime());

const pause = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export const test = base.extend<WriterFFixtures>({
  bellFeed: async ({ page, steps, secondUser, suiteDefinitions, suiteAnnouncements }, use, testInfo) => {
    const networks: ProvisionedNetwork[] = [];
    const active: NotificationBatch[] = [];

    const retire = async (batch: NotificationBatch): Promise<void> => {
      for (const d of batch.definitions) {
        await setDefinitionActive(page, d.id, false).catch((e: unknown) => Logger.warn(`[bellFeed] could not deactivate "${d.name}": ${String(e)}`));
      }
      const at = active.indexOf(batch);
      if (at >= 0) active.splice(at, 1);
    };

    const adminAudience = async (): Promise<AnnouncementAudience> => userAudience(await suiteAnnouncements.adminUserId(), ADMIN_NAME);

    const prepareNotifications = async (count: number, opts: BatchOptions = {}): Promise<NotificationBatch> => {
      for (const b of [...active]) await retire(b);
      const word = runWord();
      const arabicWord = runArabicWord();
      const required = (await actionVariablesNc(page, FEED_ACTION)).filter((v) => v.isRequired).map((v) => `{{${v.name}}}`).join(' ');
      const audiences = [secondUser.audience(), ...(opts.alsoAdmin ? [await adminAudience()] : [])];
      const batch: NotificationBatch = { word, arabicWord, definitions: [], english: [], arabic: [] };
      for (let i = 0; i < count; i += 1) {
        const english = opts.english ? opts.english(word, i) : `QA automation bell ${word} item ${i + 1}`;
        const arabic = opts.arabic ? opts.arabic(arabicWord, i) : `إشعار ${arabicWord} رقم ${i + 1}`;
        const made = await suiteDefinitions.create({
          name: suiteDefinitions.newName(`bell ${i + 1}`),
          moduleId: FEED_MODULE,
          actionId: FEED_ACTION,
          englishMessageTemplate: `${english} ${required}`.trim(),
          arabicMessageTemplate: `${arabic} ${required}`.trim(),
          description: 'Created by an automated bell case (Writer F); deleted after it.',
          isActive: true,
          audiences,
        });
        batch.definitions.push(made);
        batch.english.push(english);
        batch.arabic.push(arabic);
      }
      active.push(batch);
      Logger.step(`[bellFeed] ${count} active suite definition(s) on "Need to Approve - Network", word "${word}"`);
      return batch;
    };

    const fireNotificationEvent = async (): Promise<string> => {
      try {
        const network = await provisionNetwork(page, { submitOnly: true, descriptionEn: 'Submitted by an automated bell case only to raise a suite notification.' });
        networks.push(network);
        Logger.step(`[bellFeed] Submitted "${network.name}" for approval (the notification event)`);
        return network.name;
      } catch (error) {
        return blockedByPrecondition(testInfo, 'a suite network submitted for approval (the event behind the suite notifications)', error);
      }
    };

    const awaitNotifications = async (batch: NotificationBatch, minimum: number, opts: { page?: Page; timeoutMs?: number } = {}): Promise<InboxNotification[]> => {
      const end = Date.now() + (opts.timeoutMs ?? 90_000);
      let items: InboxNotification[] = [];
      for (;;) {
        const p = opts.page ?? secondUser.page;
        try {
          items = (await myNotifications(p, { search: batch.word, rows: 100 })).items.filter((n) => `${n.englishMessage} ${n.arabicMessage}`.includes(batch.word));
        } catch (error) {
          Logger.warn(`[bellFeed] inbox read failed (retrying): ${String(error).slice(0, 160)}`);
        }
        if (items.length >= minimum || Date.now() > end) return byNewest(items);
        await pause(3_000);
      }
    };

    const notifications = async (count: number, opts: BatchOptions = {}): Promise<{ batch: NotificationBatch; items: InboxNotification[] }> => {
      const batch = await prepareNotifications(count, opts);
      await fireNotificationEvent();
      let items = await awaitNotifications(batch, count);
      // One notification per event (not per definition)? Then submit again until the count is reached.
      for (let fired = 1; items.length > 0 && items.length < count && fired < count; fired += 1) {
        const had = items.length;
        await fireNotificationEvent();
        items = await awaitNotifications(batch, Math.min(count, had + 1));
        if (items.length === had) break;
      }
      if (opts.alsoAdmin) await awaitNotifications(batch, items.length, { page });
      await retire(batch);
      requireOrBlock(steps, items.length >= count,
        `${count} suite notification(s) for the second user (active suite definitions on "Need to Approve - Network" + a suite network submitted for approval) - only ${items.length} reached its inbox within 90 s`);
      return { batch, items };
    };

    const publishAnnouncements = async (count: number, opts: AnnouncementOptions = {}): Promise<AnnouncementBatch> => {
      const word = runWord('qaann');
      const arabicWord = runArabicWord();
      const to = opts.to ?? 'second';
      const audiences = [
        ...(to === 'admin' ? [] : [secondUser.audience()]),
        ...(to === 'second' ? [] : [await adminAudience()]),
      ];
      const batch: AnnouncementBatch = { word, arabicWord, records: [], english: [], arabic: [] };
      for (let i = 0; i < count; i += 1) {
        const english = opts.english ? opts.english(word, i) : `QA automation announcement ${word} item ${i + 1}`;
        const arabic = opts.arabic ? opts.arabic(arabicWord, i) : `إعلان ${arabicWord} رقم ${i + 1}`;
        const record = await suiteAnnouncements.create({ name: suiteAnnouncements.newName(`bell ${i + 1}`), englishMessage: english, arabicMessage: arabic, publishAt: new Date(), audiences });
        batch.records.push(record);
        batch.english.push(english);
        batch.arabic.push(arabic);
      }
      Logger.step(`[bellFeed] ${count} suite announcement(s) published now to ${to}, word "${word}"`);
      return batch;
    };

    const awaitAnnouncements = async (batch: AnnouncementBatch, minimum: number, opts: { page?: Page; timeoutMs?: number } = {}): Promise<InboxAnnouncement[]> => {
      const end = Date.now() + (opts.timeoutMs ?? 210_000);
      const ids = new Set(batch.records.map((r) => r.id));
      let items: InboxAnnouncement[] = [];
      for (;;) {
        const p = opts.page ?? secondUser.page;
        try {
          items = (await myAnnouncements(p, { search: batch.word, rows: 100 })).items.filter((a) => ids.has(a.announcementId));
        } catch (error) {
          Logger.warn(`[bellFeed] announcement inbox read failed (retrying): ${String(error).slice(0, 160)}`);
        }
        if (items.length >= minimum || Date.now() > end) return byNewest(items);
        await pause(5_000);
      }
    };

    const announcements = async (count: number, opts: AnnouncementOptions = {}): Promise<{ batch: AnnouncementBatch; items: InboxAnnouncement[] }> => {
      const batch = await publishAnnouncements(count, opts);
      const to = opts.to ?? 'second';
      const items = await awaitAnnouncements(batch, count, { page: to === 'admin' ? page : secondUser.page });
      const adminItems = to === 'both' ? await awaitAnnouncements(batch, count, { page }) : items;
      requireOrBlock(steps, items.length >= count && adminItems.length >= count,
        `${count} suite announcement(s) published now to ${to} - only ${items.length} (second user) / ${adminItems.length} (admin) reached the inbox within 210 s (publishing job about every minute)`);
      return { batch, items };
    };

    const ensureNotificationTotal = async (n: number): Promise<number> => {
      const total = (await myNotifications(secondUser.page, { rows: 1 })).totalRows;
      if (total >= n) return total;
      await notifications(n - total);
      return (await myNotifications(secondUser.page, { rows: 1 })).totalRows;
    };

    const waitPublished = async (id: string, timeoutMs = 210_000): Promise<string> => {
      const end = Date.now() + timeoutMs;
      let status = '';
      for (;;) {
        status = String((await readAnnouncement(page, id).catch(() => null))?.status ?? status);
        if (/publish/i.test(status) || Date.now() > end) return status;
        await pause(5_000);
      }
    };

    await use({
      prepareNotifications,
      fireNotificationEvent,
      awaitNotifications,
      retire,
      notifications,
      ensureNotificationTotal,
      publishAnnouncements,
      awaitAnnouncements,
      announcements,
      waitPublished,
    });

    // ---- teardown: stop the definitions, then take the suite networks back out of the approval queue
    for (const b of [...active]) await retire(b);
    for (const network of networks) {
      try {
        const requestId = await pendingRequestId(page, network.name);
        if (requestId) {
          const reasons = await rejectionReasons(page);
          const reason = reasons.find((r) => r.isActive) ?? reasons[0];
          if (reason) {
            const rejected = await rejectRequest(page, requestId, reason.id, CLEANUP_DETAILS);
            Logger.step(`[bellFeed] Rejected the request of "${network.name}" (${rejected.status})`);
          }
        }
        const del = await deleteNetworkById(page, network.id);
        if (del.status >= 300 && del.status !== 404) {
          testInfo.annotations.push({ type: 'leftover', description: `suite network "${network.name}" (${network.id}) could not be deleted (${del.status}: ${del.text.slice(0, 120)})` });
        }
      } catch (error) {
        testInfo.annotations.push({ type: 'leftover', description: `suite network "${network.name}" (${network.id}) clean-up failed: ${String(error).slice(0, 160)}` });
      }
    }
  },

  visitor: async ({ browser }, use) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] }, viewport: DEFAULT_VIEWPORT });
    disableAdminAutoSignIn(context);
    const p = await context.newPage();
    await use({ page: p, screen: new AppScreen(p), notificationBell: new NotificationBell(p), announcementBell: new AnnouncementBell(p) });
    await context.close().catch(() => undefined);
  },
});

export { expect };

// ---------------------------------------------------------------- a plain screen of the app

/** Any application screen: visits a route, exposes the header and the sign-in form (by id). */
export class AppScreen extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  /** Navigates to an AppRoutes path and waits for the page to settle (asserts nothing). */
  async visit(path: string): Promise<void> {
    await this.goto(path);
  }

  header(): Locator {
    return this.byId(GLOBAL.headerTitle);
  }

  loginForm(): Locator {
    return this.byId(LOGIN.email);
  }

  /** The current path (no origin). */
  path(): string {
    return new URL(this.page.url()).pathname;
  }
}

// ---------------------------------------------------------------- live checks

/** Puts a marker on the window; `pageKept` is false after any reload / full navigation. */
export async function markPage(page: Page): Promise<string> {
  const token = `qa${Date.now().toString(36)}`;
  await page.evaluate((t) => {
    (window as unknown as { __qaBellMark?: string }).__qaBellMark = t;
  }, token);
  return token;
}

export async function pageKept(page: Page, token: string): Promise<boolean> {
  return page.evaluate((t) => (window as unknown as { __qaBellMark?: string }).__qaBellMark === t, token).catch(() => false);
}

/**
 * Records the text of every pop-up shown from now on (the real-time host
 * `pbm-toast-notif`, and the ordinary toast host as a fallback) - a pop-up that
 * comes and goes between two polls is still caught. Re-arm after a full navigation.
 */
export async function armPopupRecorder(page: Page): Promise<void> {
  await page.evaluate((hosts) => {
    const w = window as unknown as { __qaPopups?: string[]; __qaPopupObserver?: MutationObserver };
    if (w.__qaPopupObserver) return;
    w.__qaPopups = [];
    const read = (): void => {
      for (const host of hosts) {
        for (const el of Array.from(document.querySelectorAll(`[id="${host}"]`))) {
          const t = ((el as HTMLElement).innerText ?? '').replace(/\s+/g, ' ').trim();
          if (t && !(w.__qaPopups as string[]).includes(t)) (w.__qaPopups as string[]).push(t);
        }
      }
    };
    w.__qaPopupObserver = new MutationObserver(read);
    w.__qaPopupObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
    read();
  }, [NC_TOAST.notifRoot, NC_TOAST.root]);
}

/** Every pop-up text recorded since `armPopupRecorder` (whitespace collapsed). */
export async function recordedPopups(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __qaPopups?: string[] }).__qaPopups ?? []).catch(() => [] as string[]);
}

/** The first recorded pop-up whose text contains `text` ('' when none yet). */
export async function popupWith(page: Page, text: string): Promise<string> {
  return (await recordedPopups(page)).find((t) => t.includes(text)) ?? '';
}

/**
 * The text the signed-in screen shows below the top bar (the layout's content
 * area, breadcrumb included), whitespace collapsed; the whole body when that
 * area carries no id. The detail page's own `pageText` (the `app-layout-outlet`
 * element) read nothing while the screen plainly showed "Announcement not found."
 * (full run 2026-11-12, 21817 / 21835 screenshots) - the routed view does not
 * render inside that element on this page.
 */
export async function screenContentText(page: Page): Promise<string> {
  return page
    .evaluate(() => {
      const area = document.getElementById('app-layout-content') ?? document.body;
      return ((area as HTMLElement).innerText ?? '').replace(/\s+/g, ' ').trim();
    })
    .catch(() => '');
}

/** Browser online flag of the page (21819). */
export async function isOnline(page: Page): Promise<boolean> {
  return page.evaluate(() => navigator.onLine).catch(() => false);
}

/**
 * Arms - BEFORE a full navigation - a wait for the app's live connection in
 * `page`: its next WebSocket and the first frame the server sends on it (the
 * hub's handshake answer). Publishing before that point is missed by the page
 * (full run 2026-11-12, 21821: the announcement was published 1.5 s after the
 * dashboard navigation and neither the pop-up nor the badge ever came, while
 * 21834 on an already-loaded page got it in under a second). Answers one line
 * for failure messages; never throws.
 */
export function awaitLiveConnection(page: Page, timeoutMs = 20_000): Promise<string> {
  const started = Date.now();
  const secs = (): number => Math.round((Date.now() - started) / 1000);
  return page
    .waitForEvent('websocket', { timeout: timeoutMs })
    .then(async (ws) => {
      const path = new URL(ws.url()).pathname;
      const answered = await ws.waitForEvent('framereceived', { timeout: timeoutMs }).then(() => true, () => false);
      return answered ? `live connection ${path} open and answering ${secs()} s after the navigation` : `live connection ${path} opened but the server sent nothing within ${timeoutMs / 1000} s`;
    })
    .catch(() => `no live (WebSocket) connection was opened within ${timeoutMs / 1000} s of the navigation`);
}

/**
 * Control over the live connection of a browser context (21819 "a temporary
 * network interruption that drops the live connection"). `setOffline` alone
 * does NOT close an already-open WebSocket in Chromium, so it cannot drop the
 * live connection; this routes the context's WebSockets (install it BEFORE the
 * page loads), proxies them to the server untouched, and on `drop()` closes the
 * open ones and refuses new ones until `restore()`.
 */
export interface LiveLink {
  /** Sockets opened (and let through) since the link was installed. */
  opened(): number;
  /** Sockets open right now. */
  openNow(): number;
  /** Closes every open socket (the page sees the connection drop) and refuses new ones; answers how many were closed. */
  drop(): Promise<number>;
  /** Lets new sockets through again. */
  restore(): void;
  /** Waits until a socket opened after `openedBefore` is open; answers whether one is. */
  waitForNew(openedBefore: number, timeoutMs: number): Promise<boolean>;
  /** Waits until at least one socket is open and answered by the server. */
  waitForLive(timeoutMs: number): Promise<boolean>;
}

const OUTAGE = { code: 4000, reason: 'QA automation: simulated network interruption' } as const;

/** A close code a WebSocket may send (1000 or 3000-4999); anything else is closed as 1000. */
const sendableClose = (code: number | undefined, reason: string | undefined): { code: number; reason?: string } =>
  code === 1000 || (code !== undefined && code >= 3000 && code <= 4999) ? { code, reason } : { code: 1000, reason };

export async function controlLiveConnection(context: BrowserContext): Promise<LiveLink> {
  /** page side -> server side of every socket let through and still open. */
  const open = new Map<WebSocketRoute, WebSocketRoute>();
  const answered = new Set<WebSocketRoute>();
  let opened = 0;
  let refusing = false;
  await context.routeWebSocket(() => true, (ws) => {
    if (refusing) {
      Logger.step(`[liveLink] refusing ${ws.url()} (simulated outage)`);
      void ws.close(OUTAGE).catch(() => undefined);
      return;
    }
    opened += 1;
    const server = ws.connectToServer();
    open.set(ws, server);
    // With handlers set, Playwright stops forwarding on its own: messages and closes are passed on by hand.
    server.onMessage((m) => {
      answered.add(ws);
      ws.send(m);
    });
    ws.onMessage((m) => server.send(m));
    ws.onClose((code, reason) => {
      open.delete(ws);
      void server.close(sendableClose(code, reason)).catch(() => undefined);
    });
    server.onClose((code, reason) => {
      open.delete(ws);
      void ws.close(sendableClose(code, reason)).catch(() => undefined);
    });
  });
  const until = async (ok: () => boolean, timeoutMs: number): Promise<boolean> => {
    const end = Date.now() + timeoutMs;
    while (!ok() && Date.now() < end) await pause(500);
    return ok();
  };
  return {
    opened: () => opened,
    openNow: () => open.size,
    drop: async () => {
      refusing = true;
      const now = [...open.entries()];
      open.clear();
      for (const [ws, server] of now) {
        await ws.close(OUTAGE).catch(() => undefined);
        await server.close(OUTAGE).catch(() => undefined);
      }
      Logger.step(`[liveLink] dropped ${now.length} live socket(s)`);
      return now.length;
    },
    restore: () => {
      refusing = false;
    },
    waitForNew: (openedBefore, timeoutMs) => until(() => opened > openedBefore && open.size > 0, timeoutMs),
    waitForLive: (timeoutMs) => until(() => [...open.keys()].some((ws) => answered.has(ws)), timeoutMs),
  };
}

// ---------------------------------------------------------------- bell readers

export const BELL_TABS: readonly InboxTab[] = ['all', 'unread', 'read', 'archived'];

/** Types `word` into the bell's search unless it already holds it (an unchanged value sends no request to wait for). */
export async function searchFor(bell: InboxBell, word: string): Promise<void> {
  const current = await bell.control('search').inputValue().catch(() => '');
  if (current !== word) await bell.search(word);
}

export type TabPresence = Record<InboxTab, string[]>;

/**
 * Which of `ids` each tab lists, with the bell searched for `word` (the suite's
 * rows only): Unread, Read, Archived, then All (the search is typed once).
 */
export async function presenceByTab(bell: InboxBell, word: string, ids: readonly string[]): Promise<TabPresence> {
  const out: TabPresence = { all: [], unread: [], read: [], archived: [] };
  await bell.open();
  await bell.openTab('unread');
  await searchFor(bell, word);
  for (const tab of ['unread', 'read', 'archived', 'all'] as const) {
    if (tab !== 'unread') await bell.openTab(tab);
    const shown = new Set((await bell.readRows()).map((r) => r.id));
    out[tab] = ids.filter((id) => shown.has(id));
  }
  return out;
}

/** How many rows carrying `word` (in the type or the text) each tab lists, the bell searched for it. */
export async function wordRowsByTab(bell: InboxBell, word: string): Promise<Record<InboxTab, number>> {
  const out: Record<InboxTab, number> = { all: 0, unread: 0, read: 0, archived: 0 };
  await bell.open();
  await bell.openTab('unread');
  await searchFor(bell, word);
  for (const tab of ['unread', 'read', 'archived', 'all'] as const) {
    if (tab !== 'unread') await bell.openTab(tab);
    out[tab] = (await bell.readRows()).filter((r) => r.text.includes(word) || r.type.includes(word)).length;
  }
  return out;
}

/** The ids the bell lists now, top to bottom. */
export async function shownIds(bell: InboxBell): Promise<string[]> {
  return (await bell.readRows()).map((r) => r.id);
}

/** The top row's text + type ('' when the list is empty). */
export async function topRowText(bell: InboxBell): Promise<string> {
  const top = (await bell.readRows())[0];
  return top ? `${top.type} ${top.text}` : '';
}

/** Class tokens the unread row carries and the read row does not (the unread dot / highlight). */
export function unreadOnlyClasses(unread: BellRow | undefined, read: BellRow | undefined): string[] {
  if (!unread || !read) return [];
  const readTokens = new Set(read.classes.split(/\s+/).filter(Boolean));
  return unread.classes.split(/\s+/).filter((c) => c && !readTokens.has(c));
}

/** Pairs of neighbouring rows listed oldest-before-newer (by the inbox's createdOn); [] when newest first. */
export function orderProblems(ids: readonly string[], items: readonly { id: string; createdOn: string }[]): string[] {
  const at = new Map(items.map((i) => [i.id, new Date(i.createdOn).getTime()]));
  const problems: string[] = [];
  for (let i = 1; i < ids.length; i += 1) {
    const a = at.get(ids[i - 1]);
    const b = at.get(ids[i]);
    if (a === undefined || b === undefined) problems.push(`row ${i}/${i + 1}: ${a === undefined ? ids[i - 1] : ids[i]} has no inbox createdOn`);
    else if (a < b) problems.push(`row ${i} (${new Date(a).toISOString()}) is older than row ${i + 1} (${new Date(b).toISOString()})`);
  }
  return problems;
}

/** Controls whose id names a restore / unarchive / move-back action inside the bell's drawer. */
export async function restoreControlCount(bell: InboxBell, fragments: readonly string[]): Promise<number> {
  return bell.control('drawer').locator(fragments.map((f) => `[id*="${f}"]`).join(', ')).count();
}

/** Buttons inside one row (the archive button is the only one a main-tab row has). */
export async function rowButtonCount(bell: InboxBell, itemId: string): Promise<number> {
  return bell.row(itemId).locator('button').count();
}

/** The inbox items of the batch word (both languages searched) for a status tab. */
export async function notificationsOf(page: Page, word: string, status: InboxTab = 'all'): Promise<InboxNotification[]> {
  return (await myNotifications(page, { status, search: word, rows: 100 })).items;
}

export async function announcementsOf(page: Page, word: string, status: InboxTab = 'all'): Promise<InboxAnnouncement[]> {
  return (await myAnnouncements(page, { status, search: word, rows: 100 })).items;
}

/** The inbox items (any language) whose English or Arabic message contains `term` - what a search must show. */
export function messagesContaining<T extends { englishMessage: string; arabicMessage: string }>(items: readonly T[], term: string): T[] {
  const t = term.toLowerCase();
  return items.filter((i) => `${i.englishMessage ?? ''}`.toLowerCase().includes(t) || `${i.arabicMessage ?? ''}`.includes(term));
}

/** Arms a wait for the bell's FIRST list request and answers its `status` (the default tab). */
export async function openCapturingStatus(page: Page, bell: InboxBell, listApiFragment: string): Promise<string> {
  const req = page.waitForRequest((r) => r.url().includes(listApiFragment) && r.method() === 'POST', { timeout: Timeouts.default }).catch(() => null);
  await bell.open();
  const r = await req;
  if (!r) return '';
  try {
    // The lead's inbox helpers send `status` (all / unread / read / archived). A body
    // without it but with no unread / archived filter asks for the All list.
    const body = JSON.parse(r.postData() ?? '{}') as { status?: string; tab?: string; unreadOnly?: boolean; archived?: boolean; isArchived?: boolean };
    const derived = body.unreadOnly ? 'unread' : body.archived || body.isArchived ? 'archived' : 'all';
    return String(body.status ?? body.tab ?? derived).toLowerCase();
  } catch {
    return '';
  }
}

/** Clicks a row and waits for the URL to leave the current one (the detail page). */
export async function clickRowAndLeave(page: Page, bell: InboxBell, itemId: string, routeFragment: string): Promise<string> {
  await bell.clickRow(itemId);
  await page.waitForURL((u) => u.pathname.includes(routeFragment), { timeout: Timeouts.default }).catch(() => undefined);
  // Leaving closes the drawer with an animation: a bell.open() during it saw the title still visible, did
  // nothing, and the next read found the drawer gone (smoke 2: 21704 / 21707 read the Unread label as '').
  await bell.control('title').waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => undefined);
  return new URL(page.url()).pathname;
}

// ---------------------------------------------------------------- the 21823 / 21685 preconditions

/** The names of the announcements on the second user's main tabs that are NOT the suite's (read only - look first). */
export async function nonSuiteAnnouncementsOnMainTabs(page: Page): Promise<string[]> {
  return (await myAnnouncements(page, { status: 'all', rows: 200 })).items.filter((x) => !x.name.startsWith(SUITE_ANNOUNCEMENT_PREFIX)).map((x) => x.name);
}

/** Archives the SUITE announcements on the second user's main tabs; answers the names of the others left there. */
export async function archiveSuiteAnnouncementsOnMainTabs(page: Page): Promise<{ archived: number; others: string[] }> {
  const listed = (await myAnnouncements(page, { status: 'all', rows: 200 })).items;
  let archived = 0;
  for (const a of listed.filter((x) => x.name.startsWith(SUITE_ANNOUNCEMENT_PREFIX))) {
    const res = await inboxAction.archiveAnnouncement(page, a.id);
    if (res.status < 300) archived += 1;
  }
  const others = (await myAnnouncements(page, { status: 'all', rows: 200 })).items.filter((x) => !x.name.startsWith(SUITE_ANNOUNCEMENT_PREFIX)).map((x) => x.name);
  return { archived, others };
}

// ---------------------------------------------------------------- signed-out requests

/** A request with NO session (no token): status and whether a payload came back. */
export async function unauthenticated(page: Page, method: 'GET' | 'POST', path: string, body?: unknown): Promise<{ status: number; hasPayload: boolean; text: string }> {
  const res = await page.request.fetch(`${env.baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { data: body as Record<string, unknown> }),
    failOnStatusCode: false,
  });
  const text = await res.text();
  let hasPayload = false;
  try {
    const p = (JSON.parse(text) as { payload?: unknown }).payload;
    hasPayload = p !== undefined && p !== null;
  } catch {
    hasPayload = false;
  }
  return { status: res.status(), hasPayload, text: text.slice(0, 200) };
}

// ---------------------------------------------------------------- dates

/** The publish day in Riyadh time as DD/MM/YYYY and MM/DD/YYYY (the detail date shows one of them). */
export function riyadhDayForms(iso: string): string[] {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Riyadh', day: '2-digit', month: '2-digit', year: 'numeric' }).formatToParts(new Date(iso));
  const get = (t: string): string => parts.find((p) => p.type === t)?.value ?? '';
  const [d, m, y] = [get('day'), get('month'), get('year')];
  const strip = (s: string): string => String(Number(s));
  return [`${d}/${m}/${y}`, `${m}/${d}/${y}`, `${strip(d)}/${strip(m)}/${y}`, `${strip(m)}/${strip(d)}/${y}`];
}
