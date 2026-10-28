import type { Page, TestInfo } from '@playwright/test';
import { Logger } from './Logger';

/**
 * Records what the application SHOWED while a test ran - toasts, alerts,
 * inline field errors, dialogs, failed API calls, console and page errors -
 * each with the time it appeared, and photographs messages at the instant
 * they appear.
 *
 * Why (2026-10-27, asked for by the QA lead): the step-failure screenshot is
 * taken after the assertion has waited out its timeout, so the toast that
 * explained the failure ("Only an active plan can be inactivated.") had
 * usually expired and the image showed a healthy screen. This keeps the
 * message, and a picture of the screen at that moment, for the step report.
 *
 * Never fatal: anything it cannot record is skipped, and a test never fails
 * because of it.
 */

export interface UiEvent {
  /** Epoch milliseconds the event was seen. */
  at: number;
  /** toast, alert, field error, dialog, API <status>, console error, page error. */
  kind: string;
  text: string;
  /** A picture of the screen taken when the message appeared, for messages only. */
  shot?: Promise<Buffer | undefined>;
}

/** The kinds whose appearance is photographed - the messages a user reads. */
const PHOTOGRAPHED = new Set(['toast', 'alert', 'field error']);

/** Kept per page, newest last - enough for any one step, bounded for memory. */
const MAX_EVENTS = 200;
const MAX_SHOTS = 8;
/**
 * At most one photograph per KIND per this many ms - a burst of field errors is
 * one screen, but a toast right after a field error still gets its own picture.
 */
const SHOT_INTERVAL_MS = 700;

const BINDING = '__pbmUiEvent';

/**
 * Runs in the page. Watches the DOM for the application's message surfaces and
 * reports each new or changed text once. Throttled: one scan per 100 ms of
 * DOM activity, never per mutation.
 */
const WATCHER = `(() => {
  if (window.__pbmUiWatch) return;
  window.__pbmUiWatch = true;
  const KINDS = [
    ['toast', '.p-toast-message, #pbm-toast-summary'],
    ['alert', '[role="alert"], .p-message, .p-inline-message, #pbm-dialog-alert'],
    ['field error', '[id$="-error"], .p-error, small.p-invalid'],
    ['dialog', '[role="alertdialog"], #pbm-dialog-title, .p-dialog-title, .p-drawer-title, [id$="-dialog-title"]'],
  ];
  const seen = new WeakMap();
  const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  let queued = false;
  const scan = () => {
    queued = false;
    for (const [kind, selector] of KINDS) {
      for (const el of document.querySelectorAll(selector)) {
        if (!visible(el)) continue;
        const text = (el.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 400);
        if (!text || seen.get(el) === text) continue;
        seen.set(el, text);
        try { window.${BINDING}({ kind, text }); } catch (e) { /* binding not ready */ }
      }
    }
  };
  const start = () => {
    new MutationObserver(() => {
      if (!queued) { queued = true; setTimeout(scan, 100); }
    }).observe(document.documentElement, {
      subtree: true, childList: true, characterData: true,
      attributes: true, attributeFilter: ['class', 'style', 'hidden'],
    });
    scan();
  };
  if (document.documentElement) start(); else document.addEventListener('DOMContentLoaded', start);
})()`;

/** The server's own message out of an error body - JSON message/title/detail, else the text. */
function messageOf(body: string): string {
  try {
    const json = JSON.parse(body) as Record<string, unknown>;
    const pick = json.message ?? json.title ?? json.detail ?? json.error ?? json.errors;
    if (pick !== undefined) return (typeof pick === 'string' ? pick : JSON.stringify(pick)).slice(0, 300);
  } catch {
    // not JSON - fall through to the raw text
  }
  return body.replace(/\s+/g, ' ').trim().slice(0, 300);
}

export class UiEventRecorder {
  private static readonly events = new WeakMap<Page, UiEvent[]>();
  private static readonly watched = new WeakMap<TestInfo, Page[]>();
  private static readonly lastShot = new WeakMap<Page, Map<string, number>>();

  /**
   * Starts recording a window for this test. Idempotent per page; safe to call
   * after the page has already navigated (the watcher is injected into the
   * current document as well as every later one).
   */
  static async watch(testInfo: TestInfo, page: Page): Promise<void> {
    const pages = this.watched.get(testInfo) ?? [];
    if (!pages.includes(page)) this.watched.set(testInfo, [...pages, page]);
    if (this.events.has(page)) return;
    this.events.set(page, []);

    try {
      await page.exposeBinding(BINDING, (_source, event: { kind: string; text: string }) => {
        this.record(page, event.kind, event.text);
      });
      await page.addInitScript(WATCHER);
      if (page.url() !== 'about:blank') await page.evaluate(WATCHER).catch(() => undefined);
    } catch (error) {
      Logger.warn(`UI event recorder could not watch the page: ${String(error)}`);
    }

    page.on('response', (response) => {
      const type = response.request().resourceType();
      if (response.status() < 400 || (type !== 'xhr' && type !== 'fetch')) return;
      const { pathname } = new URL(response.url());
      void response
        .text()
        .catch(() => '')
        .then((body) => this.record(page, `API ${response.status()}`, `${response.request().method()} ${pathname}: ${messageOf(body) || '(no body)'}`));
    });
    page.on('console', (message) => {
      if (message.type() === 'error') this.record(page, 'console error', message.text().slice(0, 300));
    });
    page.on('pageerror', (error) => this.record(page, 'page error', error.message.slice(0, 300)));
  }

  private static record(page: Page, kind: string, text: string): void {
    const list = this.events.get(page);
    if (!list) return;
    const event: UiEvent = { at: Date.now(), kind, text };

    if (PHOTOGRAPHED.has(kind) && !page.isClosed()) {
      const shotAt = this.lastShot.get(page) ?? new Map<string, number>();
      this.lastShot.set(page, shotAt);
      if (event.at - (shotAt.get(kind) ?? 0) >= SHOT_INTERVAL_MS) {
        shotAt.set(kind, event.at);
        event.shot = page.screenshot({ timeout: 3_000 }).catch(() => undefined);
        // Only the newest photographs are kept in memory.
        const shots = list.filter((e) => e.shot);
        if (shots.length >= MAX_SHOTS) delete shots[0].shot;
      }
    }

    list.push(event);
    if (list.length > MAX_EVENTS) list.splice(0, list.length - MAX_EVENTS);
  }

  /** Everything seen in this test's windows since `from` (epoch ms), oldest first. */
  static since(testInfo: TestInfo, from: number): UiEvent[] {
    return (this.watched.get(testInfo) ?? [])
      .flatMap((page) => this.events.get(page) ?? [])
      .filter((event) => event.at >= from)
      .sort((a, b) => a.at - b.at);
  }

  /** One line per event, for the step report: `+1.2s [toast] Saved`. */
  static describe(events: UiEvent[], from: number): string[] {
    return events.map((e) => `+${((e.at - from) / 1000).toFixed(1)}s [${e.kind}] ${e.text}`);
  }
}
