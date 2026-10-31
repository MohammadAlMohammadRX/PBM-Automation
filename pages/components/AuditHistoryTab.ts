import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { AdvancedSearchDrawer } from '../payer/AdvancedSearchDrawer';
import { Timeouts } from '../../constants/Timeouts';
import { TOAST, buttonSelector, type AuditTabIds } from '../../constants/ElementIds';
import { Logger } from '../../utils/Logger';

/** One entry of the Audit History timeline, as it renders. */
export interface AuditEntry {
  /** "Create", "Update", "Status Change", ... */
  action: string;
  /** "19/10/2026 06:20 PM". */
  when: string;
  /** The actor, without the "By: " prefix. */
  by: string;
}

/** What the "Audit Entry" drawer shows for one entry. */
export interface AuditEntryDetail {
  action: string;
  entityType: string;
  entityId: string;
  /** "19/10/2026 18:20 • System" - timestamp and actor. */
  meta: string;
  changes: { field: string; before: string; after: string }[];
}

/** What the tab needs from the detail screen that hosts it. */
export interface AuditTabHost {
  openTab(tab: 'audit'): Promise<void>;
  waitForPageReady(): Promise<void>;
  reload(): Promise<void>;
  getName(): Promise<string>;
}

/** The audit tab's advanced-search criteria keys (verified 2026-10-21). */
export const AUDIT_FILTER_FIELD = {
  actionType: 'actiontype',
  actor: 'actorlabel',
  dateRange: 'daterange',
} as const;

/**
 * A detail screen's Audit History tab - shared by every module that has one.
 *
 * Moved out of the network module on 2026-10-27: the Plans detail screen renders
 * the very same component under its own id namespace (`plan-detail-audit-*`,
 * verified live), so the tab takes its ids rather than being copied per module.
 *
 * Verified 2026-10-21 (networks) and 2026-10-27 (plans): a timeline
 * (`ul > li`) of entries reading "{action} {date time} By: {actor}" with a View
 * Details button each (all sharing one id), a search box "Search by user or
 * item", an advanced-search filter, a pager, and the shared "Audit Entry" drawer
 * with a field / before / after table. A record with no history shows no entries.
 */
export class AuditHistoryTab {
  constructor(
    protected readonly page: Page,
    protected readonly detail: AuditTabHost,
    protected readonly ids: AuditTabIds,
    /** "network", "plan" - names the record in failure messages. */
    protected readonly entity: string,
  ) {}

  private searchInput(): Locator {
    return this.page.locator(`#${this.ids.searchInput}`);
  }

  private entries(): Locator {
    // Terminology entries carry their own ids (2026-10-29); the others are
    // found by the View Details button every entry shares.
    if (this.ids.entryPrefix !== undefined) return this.page.locator(`li[id^="${this.ids.entryPrefix}"]`);
    return this.page.locator('li', { has: this.page.locator(`#${this.ids.viewButton}`) });
  }

  private entryViewButton(entry: Locator): Locator {
    if (this.ids.entryPrefix !== undefined) return entry.locator(`[id$="${this.ids.viewButton}"]`).first();
    return entry.locator(buttonSelector(this.ids.viewButton)).first();
  }

  async open(): Promise<void> {
    await this.detail.openTab('audit');
    await expect(this.searchInput(), 'the Audit History tab should render').toBeVisible({ timeout: Timeouts.default });
    await this.detail.waitForPageReady();
    // The timeline renders a moment AFTER the search box. Read at once it was
    // always empty, so expectEntry reported "no entries at all" for a tab that
    // listed them (the screenshot showed the entries, 2026-10-27). Wait for the
    // first entry; a record with none simply waits this out.
    await this.entries().first().waitFor({ state: 'visible', timeout: Timeouts.short }).catch(() => undefined);
  }

  /** Every entry on the current page, newest first as the tab orders them. */
  async readEntries(): Promise<AuditEntry[]> {
    const texts = await this.entries().allInnerTexts();
    return texts.map((text) => {
      const lines = text.split('\n').map((l) => l.trim()).filter((l) => l !== '' && l !== 'View Details');
      // "By: CareConnect" on plans / networks, "By CareConnect" on terminologies.
      const byLine = lines.find((l) => /^By:?\s/i.test(l)) ?? '';
      const rest = lines.filter((l) => l !== byLine);
      return { action: rest[0] ?? '', when: rest[1] ?? '', by: byLine.replace(/^By:?\s*/i, '') };
    });
  }

  /** Polls until an entry with `action` appears (audit writes are not instant). */
  async expectEntry(action: string | RegExp): Promise<void> {
    try {
      await expect
        .poll(async () => {
          await this.detail.reload();
          await this.open();
          // Every page, not just the one on screen: the tab can reopen on
          // page 2, and 19101's Status Change entry sat on page 1 while the
          // check read only page 2's "Update" (2026-10-27).
          return (await this.readAllEntries()).map((e) => e.action).join(' | ');
        }, { timeout: Timeouts.queuePropagation, message: `the audit history should record "${action}"` })
        .toMatch(typeof action === 'string' ? new RegExp(action) : action);
    } catch {
      // The poll can time out mid-reload, and the failure screenshot then
      // showed a blank page. Leave the tab open and loaded so the image shows
      // the audit history that was checked, and say in the failure WHAT it
      // showed (QA lead, 2026-10-27: "more details").
      await this.open().catch(() => undefined);
      const name = await this.detail.getName().catch(() => '(name not read)');
      const found = await this.readEntries().catch(() => [] as AuditEntry[]);
      const listed = found.length === 0
        ? 'it showed no entries at all'
        : `it showed ${found.length} entr${found.length === 1 ? 'y' : 'ies'}: `
          + found.map((e) => `"${e.action}" by ${e.by || '?'} at ${e.when || '?'}`).join('; ');
      throw new Error(
        `the audit history should record "${action}" - the Audit History tab of ${this.entity} "${name}" `
        + `(${this.page.url()}) was re-read for ${Timeouts.queuePropagation / 1000} s and never listed it; ${listed}.`,
      );
    }
  }

  async search(term: string): Promise<void> {
    Logger.step(`Searching audit history for "${term}"`);
    await this.searchInput().click();
    await this.searchInput().press('ControlOrMeta+a');
    if (term === '') await this.searchInput().press('Delete');
    else await this.searchInput().pressSequentially(term);
    await this.detail.waitForPageReady();
  }

  /** The tab's advanced search (action type / date range), by its filter button. */
  async openAdvancedSearch(): Promise<AdvancedSearchDrawer> {
    await this.page.locator(buttonSelector(this.ids.advancedSearchButton)).first().click();
    const drawer = new AdvancedSearchDrawer(this.page, this.ids.searchPrefix);
    await drawer.waitForOpen();
    return drawer;
  }

  /** Opens the entry at `index` (0 = newest) and reads its drawer. */
  async openEntry(index = 0): Promise<AuditEntryDetail> {
    await this.entryViewButton(this.entries().nth(index)).click();
    const d = this.ids.drawer;
    await expect(this.page.locator(`#${d.title}`)).toBeVisible({ timeout: Timeouts.default });
    // The change rows arrive with GetAuditLogById, after the title: read at
    // once there were none, and 19104 / 19112 reported an empty diff for an
    // entry showing "StatusId Active -> Expired" (verified live 2026-10-27).
    // An entry with no field changes simply waits this out.
    await this.page.locator(`#${d.diffTable} tr[id^="${d.rowPrefix}"]`).first()
      .waitFor({ state: 'visible', timeout: Timeouts.short }).catch(() => undefined);
    const read = (id: string) =>
      this.page.locator(`#${id}`).innerText({ timeout: Timeouts.short }).then((t) => t.trim()).catch(() => '');
    const changes = await this.page
      .locator(`#${d.diffTable} tr[id^="${d.rowPrefix}"]`)
      .evaluateAll((trs) =>
        trs.map((tr) => {
          const cells = Array.from(tr.querySelectorAll('td')).map((td) => (td as HTMLElement).innerText.trim());
          return { field: cells[0] ?? '', before: cells[1] ?? '', after: cells[2] ?? '' };
        }));
    return {
      action: await read(d.action),
      entityType: await read(d.entityType),
      entityId: await read(d.entityId),
      meta: await read(d.meta),
      changes,
    };
  }

  async closeEntry(): Promise<void> {
    await this.page.locator(buttonSelector(this.ids.drawer.close)).first().click();
    await expect(this.page.locator(`#${this.ids.drawer.title}`)).toBeHidden({ timeout: Timeouts.default });
  }

  /** Whether the tab offers a pager with a next page. */
  async hasNextPage(): Promise<boolean> {
    const next = this.page.locator(`#${this.ids.pager}-next`);
    return (await next.count()) > 0 && (await next.isEnabled());
  }

  /** What identifies the page on screen: the entries' own ids where they have them, else their text. */
  private async pageSnapshot(): Promise<string> {
    if (this.ids.entryPrefix !== undefined) return (await this.entries().evaluateAll((els) => els.map((e) => e.id))).join('|');
    return (await this.entries().allInnerTexts()).join('|');
  }

  /**
   * Turns one page and waits for the entries to be replaced. waitForPageReady
   * returned before the new page rendered, so the next "has a next page?" read
   * the old pager and clicked a Next that was about to be disabled (20244,
   * 2026-10-30: 300 lock entries, the click waited out on a disabled button).
   */
  private async turnPage(direction: 'next' | 'prev'): Promise<void> {
    const before = await this.pageSnapshot();
    await this.page.locator(`#${this.ids.pager}-${direction}`).click();
    await this.detail.waitForPageReady();
    await expect.poll(() => this.pageSnapshot(), { timeout: Timeouts.default, message: `the audit history should show the ${direction} page` }).not.toBe(before);
  }

  /** The tab panel's whole text - the empty-state message when there are no entries. */
  async getPanelText(): Promise<string> {
    return (await this.searchInput().locator('xpath=ancestor::*[.//*[contains(@id,"audit-pager")] or .//ul][1]').innerText().catch(() => '')).trim();
  }

  /** The action types the advanced search offers, without choosing one. */
  async getActionTypeOptions(): Promise<string[]> {
    const drawer = await this.openAdvancedSearch();
    const options = await drawer.getOptions(AUDIT_FILTER_FIELD.actionType);
    await drawer.cancel();
    return options;
  }

  /**
   * Applies the advanced search - an action type and/or a date range
   * (`DD/MM/YYYY`). Returns whether the drawer CLOSED (the filter applied) or
   * stayed open (refused), with any messages it showed, so the invalid-range
   * cases can assert on the refusal.
   */
  async applyFilter(criteria: { actionType?: string; from?: string; to?: string }): Promise<{ applied: boolean; messages: string[] }> {
    Logger.step(`Filtering audit history: ${JSON.stringify(criteria)}`);
    const drawer = await this.openAdvancedSearch();
    if (criteria.actionType !== undefined) await drawer.choose(AUDIT_FILTER_FIELD.actionType, criteria.actionType);
    if (criteria.from !== undefined) {
      await drawer.typeDate(AUDIT_FILTER_FIELD.dateRange, `${criteria.from} - ${criteria.to ?? criteria.from}`);
    }
    // Wait for the trail to reload, not just for the drawer to close: 19100
    // read the unfiltered entries straight after applying (2026-10-27). Every
    // module's trail endpoint has "Audit" in its path (GetPlanAuditTrail, ...).
    const reloaded = this.page
      .waitForResponse((response) => /audit/i.test(new URL(response.url()).pathname) && response.request().method() === 'POST', { timeout: Timeouts.default })
      .catch(() => null);
    await this.page.locator(buttonSelector(`${this.ids.advancedSearch}-search-button`)).first().click();
    // Closing = applied; a drawer still open after the default wait refused it.
    const applied = await drawer.waitForClosed().then(() => true).catch(() => false);
    if (applied) {
      await reloaded;
      await this.entries().first().waitFor({ state: 'visible', timeout: Timeouts.short }).catch(() => undefined);
    }
    const messages = applied ? [] : await drawer.getMessages();
    const toasts = await this.page.locator(`#${TOAST.summary}, #${TOAST.detail}`).allInnerTexts().catch(() => [] as string[]);
    if (!applied) await drawer.cancel().catch(() => undefined);
    await this.detail.waitForPageReady();
    return { applied, messages: [...messages, ...toasts.map((t) => t.trim()).filter((t) => t !== '')] };
  }

  /** Clears every filter: the chips' clear-all when offered, a fresh tab otherwise. */
  async clearFilters(): Promise<void> {
    const clearAll = this.page.locator(`#${this.ids.chips} [id$="clear-all"]`).first();
    const cleared = await clearAll.click({ timeout: Timeouts.short }).then(() => true).catch(() => false);
    if (!cleared) {
      await this.detail.reload();
      await this.open();
    }
    await this.detail.waitForPageReady();
  }

  /** Every entry on every page (walks the pager), newest first. */
  async readAllEntries(maxPages = 50): Promise<AuditEntry[]> {
    // Start from page 1: the tab remembers its page across a reload, and
    // reopened on page 2 - so 19104 read only page 2's single "Update" entry
    // and missed every entry on page 1 (seen in its screenshot, 2026-10-28).
    const first = this.page.locator(`#${this.ids.pager}-prev`);
    for (let step = 0; step < maxPages && (await first.count()) > 0 && (await first.isEnabled()); step += 1) {
      await this.turnPage('prev');
    }
    const all: AuditEntry[] = [...(await this.readEntries())];
    let moved = 0;
    for (let page = 1; page < maxPages && (await this.hasNextPage()); page += 1) {
      await this.turnPage('next');
      all.push(...(await this.readEntries()));
      moved += 1;
    }
    // Back to the first page, so a following readEntries / openEntry(index)
    // addresses the newest entries (2026-10-27: 19271 clicked an index of
    // page 1 while page 2 was on screen and timed out).
    const prev = this.page.locator(`#${this.ids.pager}-prev`);
    for (let step = 0; step < moved && (await prev.count()) > 0 && (await prev.isEnabled()); step += 1) {
      await this.turnPage('prev');
    }
    return all;
  }
}
