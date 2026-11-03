import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { AdvancedSearchDrawer } from '../payer/AdvancedSearchDrawer';
import { chooseSelectOption, readSelectOptions } from '../components/PrimeControls';
import { FormularyAddTradeDrawer } from './FormularyAddTradeDrawer';
import { FormularyPriceHistoryDrawer } from './FormularyPriceHistoryDrawer';
import { BenefitConfigDrawer } from './BenefitConfigDrawer';
import { FormularyImportDialog } from './FormularyImportDialog';
import { FormularyDetailPage } from './FormularyDetailPage';
import { Timeouts } from '../../constants/Timeouts';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import {
  FORMULARY_IMPORT,
  FORMULARY_TRADES,
  FORMULARY_TRADE_FILTER_FIELD,
  TOAST,
  buttonSelector,
} from '../../constants/ElementIds';
import { NetworkUtils } from '../../utils/NetworkUtils';
import { WaitUtils } from '../../utils/WaitUtils';
import { Logger } from '../../utils/Logger';
import { parseCsv } from '../../utils/CsvUtils';
import { parseXlsx, type ParsedXlsx } from '../../utils/XlsxUtils';
import { readTrades, type FormularyTrade } from '../../utils/FormularyProvisioning';

/** One trade card as it renders. */
export interface TradeCard {
  id: string;
  title: string;
  tradeCode: string;
  tier: string;
  coverage: string;
  netPrice: string;
  rebate: string;
  status: string;
  /** The status toggle's label: "Suspend" (Active trade) or "Activate"/"Reactivate" (Suspended). */
  toggleLabel: string;
}

export type TradeCardAction = 'toggleStatus' | 'priceHistory' | 'benefitConfig' | 'remove';

/**
 * The detail's Trades & Pricing tab (verified live 2026-11-02): search with
 * Filters (advanced search: Trade, Tier, Status), quick Tier / Status filters,
 * Export (Template / Excel), Import (.xlsx only), Add Trade, and one card per
 * trade (`formulary-trades-card-{id}`: Trade Code, Tier, Coverage %, Net price
 * (SAR), Rebate, Status, a Suspend / Reactivate toggle, Price History, Benefit
 * Configuration, Remove).
 *
 * Suspend asks "Suspend trade - Suspend <name>? It will stop adjudicating new
 * claims until reactivated." (Cancel / Suspend) and sends SetFormularyTradeStatus
 * `{ id, suspend: true }` - toast "Trade suspended."; Reactivate likewise
 * ("Trade reactivated."). Remove asks "Delete Trade - Do you want to delete
 * <name>?" (No / Yes).
 */
export class FormularyTradesTab {
  private readonly detail: FormularyDetailPage;

  constructor(private readonly page: Page) {
    this.detail = new FormularyDetailPage(page);
  }

  private byId(id: string): Locator {
    return this.page.locator(`#${id}`);
  }

  private cards(): Locator {
    return this.page.locator(`article[id^="${FORMULARY_TRADES.cardPrefix}"]`);
  }

  private cardButton(formularyTradeId: string, action: TradeCardAction): Locator {
    return this.page.locator(buttonSelector(`${FORMULARY_TRADES.cardPrefix}${formularyTradeId}-${FORMULARY_TRADES.card[action]}`)).first();
  }

  async open(): Promise<void> {
    await this.detail.openTab('trades');
    await expect(this.byId(FORMULARY_TRADES.searchInput), 'the Trades & Pricing tab should render').toBeVisible({ timeout: Timeouts.default });
    await this.cards().first().waitFor({ state: 'visible', timeout: Timeouts.short }).catch(() => undefined);
  }

  card(formularyTradeId: string): Locator {
    return this.byId(`${FORMULARY_TRADES.cardPrefix}${formularyTradeId}`);
  }

  /** The formulary-trade id of the card showing `codeOrName` (trade code or title). */
  async tradeIdOf(codeOrName: string): Promise<string> {
    const card = this.cards().filter({ hasText: codeOrName }).first();
    await expect(card, `a trade card for "${codeOrName}"`).toBeVisible({ timeout: Timeouts.default });
    return ((await card.getAttribute('id')) ?? '').slice(FORMULARY_TRADES.cardPrefix.length);
  }

  async readCard(formularyTradeId: string): Promise<TradeCard> {
    const prefix = `${FORMULARY_TRADES.cardPrefix}${formularyTradeId}-`;
    const read = (suffix: string) => this.byId(`${prefix}${suffix}`).innerText({ timeout: Timeouts.short }).then((t) => t.trim()).catch(() => '');
    const c = FORMULARY_TRADES.card;
    return {
      id: formularyTradeId,
      title: await read(c.title),
      tradeCode: await read(c.tradeCode),
      tier: await read(c.tierBadge),
      coverage: await read(c.coverage),
      netPrice: await read(c.netPrice),
      rebate: await read(c.rebate),
      status: await read(c.statusBadge),
      toggleLabel: await read(c.toggleStatus),
    };
  }

  /** Every card on screen, in order. */
  async readCards(): Promise<TradeCard[]> {
    await this.detail.waitForPageReady();
    const ids = await this.cards().evaluateAll((els) => els.map((e) => e.id));
    const out: TradeCard[] = [];
    for (const id of ids) out.push(await this.readCard(id.slice(FORMULARY_TRADES.cardPrefix.length)));
    return out;
  }

  async countCards(): Promise<number> {
    return this.cards().count();
  }

  /** The tab's panel text - for the empty state. */
  async getPanelText(): Promise<string> {
    return (await this.byId('formulary-detail').innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  async getCardActionAvailability(formularyTradeId: string, action: TradeCardAction): Promise<'absent' | 'disabled' | 'available'> {
    const button = this.cardButton(formularyTradeId, action);
    if ((await button.count()) === 0 || !(await button.isVisible())) return 'absent';
    return (await button.isEnabled()) ? 'available' : 'disabled';
  }

  async isAddOffered(): Promise<'absent' | 'disabled' | 'available'> {
    const button = this.page.locator(buttonSelector(FORMULARY_TRADES.addButton)).first();
    if ((await button.count()) === 0 || !(await button.isVisible())) return 'absent';
    return (await button.isEnabled()) ? 'available' : 'disabled';
  }

  // ---- actions ------------------------------------------------------------------------------

  async openAdd(): Promise<FormularyAddTradeDrawer> {
    await this.page.locator(buttonSelector(FORMULARY_TRADES.addButton)).first().click();
    const drawer = new FormularyAddTradeDrawer(this.page);
    await drawer.waitForOpen();
    return drawer;
  }

  /** Clicks the Suspend / Reactivate toggle and returns the prompt, still open. */
  async requestToggleStatus(formularyTradeId: string): Promise<ConfirmDialog> {
    await this.cardButton(formularyTradeId, 'toggleStatus').click();
    const dialog = new ConfirmDialog(this.page);
    await dialog.waitForVisible();
    return dialog;
  }

  /** Suspends or reactivates (whichever the toggle offers) and returns SetFormularyTradeStatus's answer and the messages. */
  async toggleStatus(formularyTradeId: string): Promise<{ status: number; text: string; body: Record<string, unknown> | null; messages: string[] }> {
    const dialog = await this.requestToggleStatus(formularyTradeId);
    let body: Record<string, unknown> | null = null;
    const answer = await NetworkUtils.captureResponse(this.page, ApiEndpoints.formularySetTradeStatus, async () => {
      const sent = await NetworkUtils.captureRequestBody(this.page, ApiEndpoints.formularySetTradeStatus, () => dialog.confirm());
      body = sent ? (JSON.parse(sent) as Record<string, unknown>) : null;
    });
    return { status: answer?.status ?? -1, text: answer?.text ?? '', body, messages: await this.waitForMessages() };
  }

  async openPriceHistory(formularyTradeId: string): Promise<FormularyPriceHistoryDrawer> {
    await this.cardButton(formularyTradeId, 'priceHistory').click();
    const drawer = new FormularyPriceHistoryDrawer(this.page);
    await drawer.waitForOpen();
    return drawer;
  }

  async openBenefitConfigs(formularyTradeId: string): Promise<BenefitConfigDrawer> {
    await this.cardButton(formularyTradeId, 'benefitConfig').click();
    const drawer = new BenefitConfigDrawer(this.page);
    await drawer.waitForOpen();
    return drawer;
  }

  /** Clicks Remove and returns the prompt, still open. */
  async requestRemove(formularyTradeId: string): Promise<ConfirmDialog> {
    await this.cardButton(formularyTradeId, 'remove').click();
    const dialog = new ConfirmDialog(this.page);
    await dialog.waitForVisible();
    return dialog;
  }

  /** Removes a trade through its prompt; returns DeleteFormularyTrade's answer and the messages (a refusal is an answer). */
  async removeTrade(formularyTradeId: string): Promise<{ status: number; text: string; messages: string[] }> {
    const dialog = await this.requestRemove(formularyTradeId);
    const answer = await NetworkUtils.captureResponse(this.page, ApiEndpoints.formularyDeleteTrade, () => dialog.confirm().catch(() => undefined));
    return { status: answer?.status ?? -1, text: answer?.text ?? '', messages: await this.waitForMessages() };
  }

  async waitForMessages(): Promise<string[]> {
    return WaitUtils.settleMessages(async () => (await this.page.locator(`#${TOAST.summary}, #${TOAST.detail}`).allInnerTexts().catch(() => [] as string[]))
      .map((t) => t.trim()).filter((t) => t !== ''));
  }

  // ---- search and filters -------------------------------------------------------------------

  /** Runs `action` and waits for the GetFormularyTrades answer it triggers; returns the items. */
  private async captureTrades(action: () => Promise<void>): Promise<FormularyTrade[]> {
    const body = await NetworkUtils.captureJsonResponseMatching<{ payload: { trades: { items: FormularyTrade[] } } }>(this.page, /\/GetFormularyTrades$/, action);
    await this.detail.waitForPageReady();
    return body?.payload.trades.items ?? [];
  }

  /** Searches trades by name / code and returns the list the search answered. */
  async search(term: string): Promise<FormularyTrade[]> {
    Logger.step(`Searching trades for "${term}"`);
    const input = this.byId(FORMULARY_TRADES.searchInput);
    if ((await input.inputValue()) === term) await input.fill('');
    return this.captureTrades(async () => {
      await input.fill(term);
      await input.press('Enter');
    });
  }

  async getTierFilterOptions(): Promise<string[]> {
    return readSelectOptions(this.page, this.byId(FORMULARY_TRADES.tierFilter));
  }

  async getStatusFilterOptions(): Promise<string[]> {
    return readSelectOptions(this.page, this.byId(FORMULARY_TRADES.statusFilter));
  }

  async filterByTier(label: string): Promise<FormularyTrade[]> {
    return this.captureTrades(() => chooseSelectOption(this.page, this.byId(FORMULARY_TRADES.tierFilter), label));
  }

  async filterByStatus(label: string): Promise<FormularyTrade[]> {
    return this.captureTrades(() => chooseSelectOption(this.page, this.byId(FORMULARY_TRADES.statusFilter), label));
  }

  /** Opens the advanced search panel (Trade, Tier, Status) and returns it, open (Writer B, 2026-11-02). */
  async openAdvancedSearch(): Promise<AdvancedSearchDrawer> {
    await this.page.locator(buttonSelector(FORMULARY_TRADES.searchFilterButton)).first().click();
    const drawer = new AdvancedSearchDrawer(this.page, FORMULARY_TRADES.advancedSearch.replace(/-advanced-search$/, ''));
    await drawer.waitForOpen();
    return drawer;
  }

  /** Applies the advanced search (Trade text, Tier, Status) and returns the list it answered. */
  async applyCriteria(criteria: Partial<Record<keyof typeof FORMULARY_TRADE_FILTER_FIELD, string>>): Promise<FormularyTrade[]> {
    Logger.step(`Trade advanced search: ${JSON.stringify(criteria)}`);
    await this.page.locator(buttonSelector(FORMULARY_TRADES.searchFilterButton)).first().click();
    await expect(this.byId(`${FORMULARY_TRADES.advancedSearch}-title`)).toBeVisible({ timeout: Timeouts.default });
    const field = (key: keyof typeof FORMULARY_TRADE_FILTER_FIELD) => this.byId(`${FORMULARY_TRADES.advancedSearch}-field-${FORMULARY_TRADE_FILTER_FIELD[key]}-input`);
    if (criteria.name !== undefined) await field('name').fill(criteria.name);
    if (criteria.tier !== undefined) await chooseSelectOption(this.page, field('tier'), criteria.tier);
    if (criteria.status !== undefined) await chooseSelectOption(this.page, field('status'), criteria.status);
    return this.captureTrades(() => this.page.locator(buttonSelector(`${FORMULARY_TRADES.advancedSearch}-search-button`)).first().click());
  }

  // ---- export / import ------------------------------------------------------------------------

  async getExportOptions(): Promise<string[]> {
    await this.page.locator(buttonSelector(FORMULARY_TRADES.export.trigger)).first().click();
    const prefix = `${FORMULARY_TRADES.export.root}-`;
    const ids = await this.page.locator(`#${FORMULARY_TRADES.export.menu} [id^="${prefix}"]`).evaluateAll((els) => els.map((e) => e.id));
    await this.page.keyboard.press('Escape');
    return ids.map((id) => id.slice(prefix.length));
  }

  /** Exports the trades (Excel) or the template and returns the file parsed. */
  async export(kind: 'template' | 'excel'): Promise<{ filename: string; bytes: Buffer; parsed: ParsedXlsx }> {
    await this.page.locator(buttonSelector(FORMULARY_TRADES.export.trigger)).first().click();
    const waiting = this.page.waitForEvent('download', { timeout: Timeouts.queuePropagation });
    await this.byId(FORMULARY_TRADES.export[kind]).click();
    const dialog = new ConfirmDialog(this.page);
    if (await dialog.isVisible()) await dialog.clickAction('excel').catch(() => undefined);
    const download = await waiting;
    const chunks: Buffer[] = [];
    for await (const chunk of await download.createReadStream()) chunks.push(Buffer.from(chunk));
    const bytes = Buffer.concat(chunks);
    const filename = download.suggestedFilename();
    const parsed = /\.csv$/i.test(filename) ? { ...parseCsv(bytes.toString('utf8')), rightToLeft: false } : parseXlsx(bytes);
    return { filename, bytes, parsed };
  }

  async openImport(): Promise<FormularyImportDialog> {
    const dialog = new FormularyImportDialog(this.page, FORMULARY_IMPORT.detail);
    // Left open by an earlier step (its trigger sits behind it), or closing as that
    // import completes (18676, 2026-11-03): closed first, then opened afresh.
    await dialog.closeIfOpen();
    await this.page.locator(buttonSelector(FORMULARY_TRADES.importTrigger)).first().click();
    await dialog.waitForOpen();
    return dialog;
  }

  // ---- API ---------------------------------------------------------------------------------------

  async fetchTrades(formularyId: string, criteria: Record<string, unknown> = {}): Promise<FormularyTrade[]> {
    return readTrades(this.page, formularyId, criteria);
  }
}
