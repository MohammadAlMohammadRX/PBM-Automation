import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import type { NetworkDetailPage } from './NetworkDetailPage';
import { AdvancedSearchDrawer } from '../payer/AdvancedSearchDrawer';
import { Timeouts } from '../../constants/Timeouts';
import { NETWORK_AUDIT, TOAST, buttonSelector } from '../../constants/ElementIds';
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

/**
 * The network detail screen's Audit History tab.
 *
 * Verified 2026-10-21: a timeline (`ul > li`) of entries reading
 * "{action} {date time} By: {actor}" with a View Details button each (all
 * sharing one id - see NETWORK_AUDIT), a search box "Search by user or item",
 * an advanced-search filter, a pager, and the shared "Audit Entry" drawer with
 * a field / before / after table. A network with no history shows no entries.
 */
export class NetworkAuditHistoryTab {
  constructor(
    private readonly page: Page,
    private readonly detail: NetworkDetailPage,
  ) {}

  private searchInput(): Locator {
    return this.page.locator(`#${NETWORK_AUDIT.searchInput}`);
  }

  private entries(): Locator {
    return this.page.locator('li', { has: this.page.locator(`#${NETWORK_AUDIT.viewButton}`) });
  }

  async open(): Promise<void> {
    await this.detail.openTab('audit');
    await expect(this.searchInput(), 'the Audit History tab should render').toBeVisible({ timeout: Timeouts.default });
    await this.detail.waitForPageReady();
  }

  /** Every entry on the current page, newest first as the tab orders them. */
  async readEntries(): Promise<AuditEntry[]> {
    const texts = await this.entries().allInnerTexts();
    return texts.map((text) => {
      const lines = text.split('\n').map((l) => l.trim()).filter((l) => l !== '' && l !== 'View Details');
      const byLine = lines.find((l) => /^By:/i.test(l)) ?? '';
      const rest = lines.filter((l) => l !== byLine);
      return { action: rest[0] ?? '', when: rest[1] ?? '', by: byLine.replace(/^By:\s*/i, '') };
    });
  }

  /** Polls until an entry with `action` appears (audit writes are not instant). */
  async expectEntry(action: string | RegExp): Promise<void> {
    await expect
      .poll(async () => {
        await this.detail.reload();
        await this.open();
        return (await this.readEntries()).map((e) => e.action).join(' | ');
      }, { timeout: Timeouts.queuePropagation, message: `the audit history should record "${action}"` })
      .toMatch(typeof action === 'string' ? new RegExp(action) : action);
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
    await this.page.locator(buttonSelector(NETWORK_AUDIT.advancedSearchButton)).first().click();
    const drawer = new AdvancedSearchDrawer(this.page, 'network-detail-audit');
    await drawer.waitForOpen();
    return drawer;
  }

  /** Opens the entry at `index` (0 = newest) and reads its drawer. */
  async openEntry(index = 0): Promise<AuditEntryDetail> {
    await this.entries().nth(index).locator(buttonSelector(NETWORK_AUDIT.viewButton)).first().click();
    const d = NETWORK_AUDIT.drawer;
    await expect(this.page.locator(`#${d.title}`)).toBeVisible({ timeout: Timeouts.default });
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
    await this.page.locator(buttonSelector(NETWORK_AUDIT.drawer.close)).first().click();
    await expect(this.page.locator(`#${NETWORK_AUDIT.drawer.title}`)).toBeHidden({ timeout: Timeouts.default });
  }

  /** Whether the tab offers a pager with a next page. */
  async hasNextPage(): Promise<boolean> {
    const next = this.page.locator(`#${NETWORK_AUDIT.pager}-next`);
    return (await next.count()) > 0 && (await next.isEnabled());
  }

  // ---- story 20 / 12 additions ----------------------------------------------

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
    await this.page.locator(buttonSelector(`${NETWORK_AUDIT.advancedSearch}-search-button`)).first().click();
    // Closing = applied; a drawer still open after the default wait refused it.
    const applied = await drawer.waitForClosed().then(() => true).catch(() => false);
    const messages = applied ? [] : await drawer.getMessages();
    const toasts = await this.page.locator(`#${TOAST.summary}, #${TOAST.detail}`).allInnerTexts().catch(() => [] as string[]);
    if (!applied) await drawer.cancel().catch(() => undefined);
    await this.detail.waitForPageReady();
    return { applied, messages: [...messages, ...toasts.map((t) => t.trim()).filter((t) => t !== '')] };
  }

  /** Clears every filter: the chips' clear-all when offered, a fresh tab otherwise. */
  async clearFilters(): Promise<void> {
    const clearAll = this.page.locator(`#${NETWORK_AUDIT.chips} [id$="clear-all"]`).first();
    const cleared = await clearAll.click({ timeout: Timeouts.short }).then(() => true).catch(() => false);
    if (!cleared) {
      await this.detail.reload();
      await this.open();
    }
    await this.detail.waitForPageReady();
  }

  /** Every entry on every page (walks the pager), newest first. */
  async readAllEntries(maxPages = 50): Promise<AuditEntry[]> {
    const all: AuditEntry[] = [...(await this.readEntries())];
    for (let page = 1; page < maxPages && (await this.hasNextPage()); page += 1) {
      await this.page.locator(`#${NETWORK_AUDIT.pager}-next`).click();
      await this.detail.waitForPageReady();
      all.push(...(await this.readEntries()));
    }
    return all;
  }
}

/** The audit tab's advanced-search criteria keys (verified 2026-10-21). */
export const AUDIT_FILTER_FIELD = {
  actionType: 'actiontype',
  actor: 'actorlabel',
  dateRange: 'daterange',
} as const;
