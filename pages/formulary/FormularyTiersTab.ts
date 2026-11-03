import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { AdvancedSearchDrawer } from '../payer/AdvancedSearchDrawer';
import { FormularyTierDrawer } from './FormularyTierDrawer';
import { FormularyImportDialog } from './FormularyImportDialog';
import { FormularyDetailPage } from './FormularyDetailPage';
import { Timeouts } from '../../constants/Timeouts';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import {
  FORMULARY_IMPORT,
  FORMULARY_TIERS,
  FORMULARY_TIER_FILTER_FIELD,
  TOAST,
  buttonSelector,
} from '../../constants/ElementIds';
import { NetworkUtils } from '../../utils/NetworkUtils';
import { WaitUtils } from '../../utils/WaitUtils';
import { Logger } from '../../utils/Logger';
import { parseCsv } from '../../utils/CsvUtils';
import { parseXlsx, type ParsedXlsx } from '../../utils/XlsxUtils';
import { readTiers, type FormularyTier } from '../../utils/FormularyProvisioning';

/** One tier card as it renders. */
export interface TierCard {
  id: string;
  title: string;
  order: string;
  coverage: string;
  nameEn: string;
  nameAr: string;
  description: string;
}

/**
 * The detail's Tiers tab (verified live 2026-11-02): an "Important: Tiers
 * define cost-sharing groups. Every trade must be assigned to a tier." notice,
 * a search box with Filters (advanced search: Tier Name, Description), Export
 * (Template / CSV / Excel), Import, Add Tier, and one card per tier
 * (`tier-card-{id}`: Tier Order, Default Coverage %, Tier Name EN / AR,
 * Description, Edit / Delete). Delete asks "Delete Tier - Do you want to
 * delete <name>?" (No / Yes); a tier with trades is refused by the server
 * (409 "A tier cannot be deleted while trades are assigned to it.", shown as a toast).
 */
export class FormularyTiersTab {
  private readonly detail: FormularyDetailPage;

  constructor(private readonly page: Page) {
    this.detail = new FormularyDetailPage(page);
  }

  private byId(id: string): Locator {
    return this.page.locator(`#${id}`);
  }

  private cards(): Locator {
    return this.page.locator(`article[id^="${FORMULARY_TIERS.cardPrefix}"]`);
  }

  /** Opens the tab (on a detail screen already open) and waits for its toolbar. */
  async open(): Promise<void> {
    await this.detail.openTab('tiers');
    await expect(this.page.locator(buttonSelector(FORMULARY_TIERS.addButton)).first().or(this.byId(FORMULARY_TIERS.searchInput)).first(),
      'the Tiers tab should render').toBeVisible({ timeout: Timeouts.default });
    await this.cards().first().waitFor({ state: 'visible', timeout: Timeouts.short }).catch(() => undefined);
  }

  /** The card of a tier by its id. */
  card(tierId: string): Locator {
    return this.byId(`${FORMULARY_TIERS.cardPrefix}${tierId}`);
  }

  /** The id of the card whose title is `name`. */
  async tierIdByName(name: string): Promise<string> {
    const card = this.cards().filter({ has: this.page.locator(`[id$="-${FORMULARY_TIERS.card.title}"]`, { hasText: name }) }).first();
    await expect(card, `a tier card titled "${name}"`).toBeVisible({ timeout: Timeouts.default });
    return ((await card.getAttribute('id')) ?? '').slice(FORMULARY_TIERS.cardPrefix.length);
  }

  /** Every card on screen, in order. */
  async readCards(): Promise<TierCard[]> {
    await this.detail.waitForPageReady();
    const ids = await this.cards().evaluateAll((els) => els.map((e) => e.id));
    const out: TierCard[] = [];
    for (const cardId of ids) out.push(await this.readCard(cardId.slice(FORMULARY_TIERS.cardPrefix.length)));
    return out;
  }

  async readCard(tierId: string): Promise<TierCard> {
    const prefix = `${FORMULARY_TIERS.cardPrefix}${tierId}-`;
    const read = (suffix: string) => this.byId(`${prefix}${suffix}`).innerText({ timeout: Timeouts.short }).then((t) => t.trim()).catch(() => '');
    const c = FORMULARY_TIERS.card;
    return {
      id: tierId,
      title: await read(c.title),
      order: await read(c.order),
      coverage: await read(c.coverage),
      nameEn: await read(c.nameEn),
      nameAr: await read(c.nameAr),
      description: await read(c.description),
    };
  }

  async countCards(): Promise<number> {
    return this.cards().count();
  }

  /** The tab's empty state / panel text. */
  async getPanelText(): Promise<string> {
    return (await this.byId('formulary-detail').innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  /** 'absent' | 'disabled' | 'available' for a card's Edit / Delete. */
  async getCardActionAvailability(tierId: string, action: 'edit' | 'delete'): Promise<'absent' | 'disabled' | 'available'> {
    const button = this.page.locator(buttonSelector(`${FORMULARY_TIERS.cardPrefix}${tierId}-${FORMULARY_TIERS.card[action]}`)).first();
    if ((await button.count()) === 0 || !(await button.isVisible())) return 'absent';
    return (await button.isEnabled()) ? 'available' : 'disabled';
  }

  async isAddOffered(): Promise<'absent' | 'disabled' | 'available'> {
    const button = this.page.locator(buttonSelector(FORMULARY_TIERS.addButton)).first();
    if ((await button.count()) === 0 || !(await button.isVisible())) return 'absent';
    return (await button.isEnabled()) ? 'available' : 'disabled';
  }

  // ---- add / edit / delete ----------------------------------------------------------------

  async openAdd(): Promise<FormularyTierDrawer> {
    await this.page.locator(buttonSelector(FORMULARY_TIERS.addButton)).first().click();
    const drawer = new FormularyTierDrawer(this.page);
    await drawer.waitForOpen();
    return drawer;
  }

  async openEdit(tierId: string): Promise<FormularyTierDrawer> {
    await this.page.locator(buttonSelector(`${FORMULARY_TIERS.cardPrefix}${tierId}-${FORMULARY_TIERS.card.edit}`)).first().click();
    const drawer = new FormularyTierDrawer(this.page);
    await drawer.waitForOpen();
    return drawer;
  }

  /** Clicks a card's Delete and returns the prompt, still open. */
  async requestDelete(tierId: string): Promise<ConfirmDialog> {
    await this.page.locator(buttonSelector(`${FORMULARY_TIERS.cardPrefix}${tierId}-${FORMULARY_TIERS.card.delete}`)).first().click();
    const dialog = new ConfirmDialog(this.page);
    await dialog.waitForVisible();
    return dialog;
  }

  /** Deletes a tier through its prompt; returns DeleteTier's answer and the messages shown (a refusal is an answer). */
  async deleteTier(tierId: string): Promise<{ status: number; text: string; messages: string[] }> {
    const dialog = await this.requestDelete(tierId);
    const answer = await NetworkUtils.captureResponse(this.page, ApiEndpoints.formularyDeleteTier, () => dialog.confirm().catch(() => undefined));
    return { status: answer?.status ?? -1, text: answer?.text ?? '', messages: await this.waitForMessages() };
  }

  async waitForMessages(): Promise<string[]> {
    return WaitUtils.settleMessages(async () => (await this.page.locator(`#${TOAST.summary}, #${TOAST.detail}`).allInnerTexts().catch(() => [] as string[]))
      .map((t) => t.trim()).filter((t) => t !== ''));
  }

  // ---- search / advanced search -----------------------------------------------------------

  /** Types into the tab's search box and presses Enter. */
  async search(term: string): Promise<void> {
    Logger.step(`Searching tiers for "${term}"`);
    const input = this.byId(FORMULARY_TIERS.searchInput);
    await input.fill(term);
    await input.press('Enter');
    await this.detail.waitForPageReady();
  }

  async openAdvancedSearch(): Promise<AdvancedSearchDrawer> {
    await this.page.locator(buttonSelector(FORMULARY_TIERS.searchFilterButton)).first().click();
    const drawer = new AdvancedSearchDrawer(this.page, FORMULARY_TIERS.advancedSearch.replace(/-advanced-search$/, ''));
    await drawer.waitForOpen();
    return drawer;
  }

  /** Applies the tier advanced search (Tier Name / Description) and waits for the page to settle. */
  async applyCriteria(criteria: Partial<Record<keyof typeof FORMULARY_TIER_FILTER_FIELD, string>>): Promise<void> {
    Logger.step(`Tier advanced search: ${JSON.stringify(criteria)}`);
    await this.page.locator(buttonSelector(FORMULARY_TIERS.searchFilterButton)).first().click();
    await expect(this.byId(`${FORMULARY_TIERS.advancedSearch}-title`)).toBeVisible({ timeout: Timeouts.default });
    for (const [key, value] of Object.entries(criteria) as [keyof typeof FORMULARY_TIER_FILTER_FIELD, string][]) {
      await this.byId(`${FORMULARY_TIERS.advancedSearch}-field-${FORMULARY_TIER_FILTER_FIELD[key]}-input`).fill(value);
    }
    await this.page.locator(buttonSelector(`${FORMULARY_TIERS.advancedSearch}-search-button`)).first().click();
    await this.detail.waitForPageReady();
  }

  // ---- export / import --------------------------------------------------------------------

  /** The export entries offered (`template`, `csv`, `excel`). */
  async getExportOptions(): Promise<string[]> {
    await this.page.locator(buttonSelector(FORMULARY_TIERS.export.trigger)).first().click();
    const prefix = `${FORMULARY_TIERS.export.root}-`;
    const ids = await this.page.locator(`#${FORMULARY_TIERS.export.menu} [id^="${prefix}"]`).evaluateAll((els) => els.map((e) => e.id));
    await this.page.keyboard.press('Escape');
    return ids.map((id) => id.slice(prefix.length));
  }

  /** Exports the tiers (or the template) and returns the file parsed. A format prompt, if any, is answered with the same format. */
  async export(kind: 'template' | 'csv' | 'excel'): Promise<{ filename: string; bytes: Buffer; parsed: ParsedXlsx }> {
    await this.page.locator(buttonSelector(FORMULARY_TIERS.export.trigger)).first().click();
    const waiting = this.page.waitForEvent('download', { timeout: Timeouts.queuePropagation });
    await this.byId(FORMULARY_TIERS.export[kind]).click();
    const dialog = new ConfirmDialog(this.page);
    if (await dialog.isVisible()) await dialog.clickAction(kind === 'excel' ? 'excel' : 'csv').catch(() => undefined);
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
    await this.page.locator(buttonSelector(FORMULARY_TIERS.importTrigger)).first().click();
    await dialog.waitForOpen();
    return dialog;
  }

  // ---- API ----------------------------------------------------------------------------------

  /** The tiers the server holds (GetTiers). */
  async fetchTiers(formularyId: string): Promise<FormularyTier[]> {
    return readTiers(this.page, formularyId);
  }
}
