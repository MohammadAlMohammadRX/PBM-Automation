import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import type { NetworkDetailPage } from './NetworkDetailPage';
import { Timeouts } from '../../constants/Timeouts';
import { DETAIL_TAB_SEARCH, NETWORK_POLICIES, buttonSelector } from '../../constants/ElementIds';
import { AdvancedSearchDrawer } from '../payer/AdvancedSearchDrawer';
import { Logger } from '../../utils/Logger';

/** One Linked Policies row, keyed by the table's own header text. */
export type PolicyRow = Record<string, string> & { actions: string };

/**
 * The network detail screen's Linked Policies tab - read-only.
 *
 * Verified 2026-10-21: columns Policy Number, Name, Plan Name, Policy Holder,
 * Status, Effective Date, Expiry Date, Ass(igned ...) and a search box "Search
 * by policy, plan, holder, or number"; a network with none shows "No policies
 * linked to this network yet." Rows are read by header text rather than by
 * position, because the stories name columns the table may not carry.
 */
export class NetworkPoliciesTab {
  constructor(
    private readonly page: Page,
    private readonly detail: NetworkDetailPage,
  ) {}

  private table(): Locator {
    return this.page.locator(`#${NETWORK_POLICIES.table}`);
  }

  async open(): Promise<void> {
    await this.detail.openTab('policies');
    await expect(this.table(), 'the Linked Policies tab should render its table').toBeVisible({
      timeout: Timeouts.default,
    });
    await this.detail.waitForPageReady();
  }

  async getHeaders(): Promise<string[]> {
    return (await this.table().locator('thead th').allInnerTexts()).map((t) => t.trim());
  }

  /** Every row on screen; the empty-state row is not a row. */
  async readRows(): Promise<PolicyRow[]> {
    const headers = await this.getHeaders();
    const raw = await this.page
      .locator(`#${NETWORK_POLICIES.tableBody} tr`)
      .evaluateAll((trs, emptyId) =>
        trs
          .filter((tr) => tr.querySelector(`#${emptyId}`) === null)
          .map((tr) => ({
            cells: Array.from(tr.querySelectorAll('td')).map((td) => (td as HTMLElement).innerText.trim()),
            actions: Array.from(tr.querySelectorAll('button')).map((b) => (b as HTMLElement).innerText.trim()).join(','),
          })), NETWORK_POLICIES.empty);
    return raw.map((r) => {
      const row: Record<string, string> = {};
      headers.forEach((header, index) => {
        row[header] = r.cells[index] ?? '';
      });
      return { ...row, actions: r.actions } as PolicyRow;
    });
  }

  /** The empty-state text, '' when rows are shown. */
  async getEmptyText(): Promise<string> {
    return this.page
      .locator(`#${NETWORK_POLICIES.empty}`)
      .innerText({ timeout: Timeouts.short })
      .then((t) => t.trim())
      .catch(() => '');
  }

  async search(term: string): Promise<void> {
    Logger.step(`Searching linked policies for "${term}"`);
    const input = this.page.locator(DETAIL_TAB_SEARCH.inputSelector).filter({ visible: true }).first();
    await input.click();
    await input.press('ControlOrMeta+a');
    if (term === '') await input.press('Delete');
    else await input.pressSequentially(term);
    await this.detail.waitForPageReady();
  }

  /** Whether any row offers a Detach (or any other) action. */
  async offersRowActions(): Promise<boolean> {
    return (await this.readRows()).some((row) => row.actions !== '');
  }

  // ---- story 17 additions ---------------------------------------------------

  /** One column's values on screen, by header text. */
  async readColumn(header: string): Promise<string[]> {
    return (await this.readRows()).map((row) => row[header] ?? '');
  }

  /**
   * Clicks a column header (the table's sort affordance, if it has one) and
   * returns that column's values afterwards.
   */
  async clickHeader(header: string): Promise<string[]> {
    Logger.step(`Clicking the "${header}" column header`);
    await this.table().locator('thead th').filter({ hasText: header }).first().click();
    await this.detail.waitForPageReady();
    return this.readColumn(header);
  }

  /**
   * Filters by status through the tab's advanced search. The status
   * criterion's key is read from the drawer (any key containing "status").
   */
  async filterByStatus(status: string): Promise<void> {
    Logger.step(`Filtering linked policies by status "${status}"`);
    await this.page.locator(DETAIL_TAB_SEARCH.filterButtonSelector).filter({ visible: true }).first().click();
    const drawer = new AdvancedSearchDrawer(this.page, 'network-detail-policies');
    await drawer.waitForOpen();
    const key = (await drawer.getFieldKeys()).find((k) => k.includes('status'));
    expect(key, 'the policies advanced search should offer a status criterion').toBeDefined();
    await drawer.choose(key!, status);
    await drawer.submit();
    await this.detail.waitForPageReady();
  }

  /** The tab's count indicator - the number in its tab label. */
  async getCountIndicator(): Promise<number | null> {
    return this.detail.getTabCount('policies');
  }
}
