import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { AdvancedSearchDrawer } from '../payer/AdvancedSearchDrawer';
import { ExportMenu } from '../components/ExportMenu';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PolicyDetailPage } from './PolicyDetailPage';
import { Timeouts } from '../../constants/Timeouts';
import { TOAST, buttonSelector, type PolicyDetailTab } from '../../constants/ElementIds';
import { WaitUtils } from '../../utils/WaitUtils';
import { Logger } from '../../utils/Logger';
import { parseCsv } from '../../utils/CsvUtils';
import { parseXlsx, type ParsedXlsx } from '../../utils/XlsxUtils';

/** A tab's Export menu: Export Template / Export as CSV / Export as Excel. */
export interface TabExportIds {
  root: string;
  trigger: string;
  menu: string;
  template: string;
  csv: string;
  excel: string;
}

/** The ids a detail tab's table is built from. */
export interface PolicyTabTableIds {
  searchInput: string;
  searchFilterButton: string;
  /** `{screen}-advanced-search` - the AdvancedSearchDrawer namespace is this minus `-advanced-search`. */
  advancedSearch: string;
  table: string;
  rowPrefix: string;
  pager: string;
  export?: TabExportIds;
}

/** One row by column key, plus the row's own id suffix (`rowId`). */
export type TabRow<K extends string> = Record<K, string> & { rowId: string };

/**
 * The shared shape of the policy detail's table tabs (Members, Network
 * Assignment, Version History): a search box answered by the tab's own list
 * call, a Filters button opening `{tab}-advanced-search`, the shared table
 * (`{table}-row-{id}`, cells `-cell-{key}`) and its pager. Each tab subclasses
 * this with its ids, columns and list endpoint.
 */
export class PolicyTabTable<K extends string> {
  protected readonly detail: PolicyDetailPage;

  constructor(
    protected readonly page: Page,
    protected readonly tab: PolicyDetailTab,
    protected readonly ids: PolicyTabTableIds,
    protected readonly columns: Record<K, string>,
    /** The list call the tab's search / filters answer on (e.g. /GetPolicyMembers$/). */
    protected readonly listEndpoint: RegExp,
  ) {
    this.detail = new PolicyDetailPage(page);
  }

  protected byId(id: string): Locator {
    return this.page.locator(`#${id}`);
  }

  protected rows(): Locator {
    return this.page.locator(`tr[id^="${this.ids.rowPrefix}"]`);
  }

  /** A row by its record id (`{rowPrefix}{id}`). */
  rowById(recordId: string): Locator {
    return this.page.locator(`#${this.ids.rowPrefix}${recordId}`);
  }

  /** The first row whose `column` cell reads `text` exactly. */
  rowWhere(column: K, text: string): Locator {
    const exact = new RegExp(`^\\s*${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`);
    return this.rows().filter({ has: this.page.locator(`[id$="-cell-${this.columns[column]}"]`, { hasText: exact }) }).first();
  }

  /** Opens the tab and waits for its search box. */
  async open(): Promise<void> {
    await this.detail.openTab(this.tab);
    await expect(this.byId(this.ids.searchInput), `the ${this.tab} tab should render`).toBeVisible({ timeout: Timeouts.default });
    await this.rows().first().waitFor({ state: 'visible', timeout: Timeouts.short }).catch(() => undefined);
  }

  /** Every row on the current page, by column (one pass). */
  async readRows(): Promise<TabRow<K>[]> {
    await this.detail.waitForPageReady();
    const prefix = this.ids.rowPrefix;
    return this.rows().evaluateAll((trs, args) => trs.map((tr) => {
      const out: Record<string, string> = { rowId: tr.id.slice(args.prefix.length) };
      for (const [key, column] of Object.entries(args.columns)) {
        const cell = tr.querySelector(`[id$="-cell-${column}"]`);
        out[key] = cell ? (cell as HTMLElement).innerText.replace(/\s+/g, ' ').trim() : '';
      }
      return out;
    }), { columns: this.columns as Record<string, string>, prefix }) as Promise<TabRow<K>[]>;
  }

  async countRows(): Promise<number> {
    await this.detail.waitForPageReady();
    return this.rows().count();
  }

  /** One cell of a row, by record id. */
  async readCell(recordId: string, column: K): Promise<string> {
    return (await this.page.locator(`#${this.ids.rowPrefix}${recordId}-cell-${this.columns[column]}`).innerText({ timeout: Timeouts.default }).catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  async getHeaders(): Promise<string[]> {
    return (await this.page.locator(`th[id^="${this.ids.table}-th-"]`).allInnerTexts()).map((t) => t.trim()).filter((t) => t !== '');
  }

  /** The panel's text (counts, hints, empty state). */
  async getPanelText(): Promise<string> {
    return (await this.byId(this.ids.table).innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  /** The table's empty-state cell (`{table}-empty`), '' when rows are shown. */
  async getEmptyStateText(): Promise<string> {
    return (await this.byId(`${this.ids.table}-empty`).innerText({ timeout: Timeouts.short }).catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  /** Types a search, presses Enter and waits for the answer to THIS search. */
  async search(term: string): Promise<void> {
    Logger.step(`Searching the ${this.tab} tab for "${term}"`);
    const input = this.byId(this.ids.searchInput);
    const answered = this.page.waitForResponse((r) => this.listEndpoint.test(new URL(r.url()).pathname)
      && (term === '' || (r.request().postData() ?? '').includes(JSON.stringify(term).slice(1, -1))), { timeout: Timeouts.default }).catch(() => null);
    await input.fill(term);
    await input.press('Enter');
    await answered;
    await this.detail.waitForPageReady();
  }

  async openAdvancedSearch(): Promise<AdvancedSearchDrawer> {
    await this.page.locator(buttonSelector(this.ids.searchFilterButton)).first().click();
    const drawer = new AdvancedSearchDrawer(this.page, this.ids.advancedSearch.replace(/-advanced-search$/, ''));
    await drawer.waitForOpen();
    return drawer;
  }

  /** The advanced search's field labels. */
  async getAdvancedSearchLabels(): Promise<string[]> {
    const drawer = await this.openAdvancedSearch();
    const labels = await drawer.getFieldLabels();
    await drawer.cancel();
    return labels;
  }

  /** A select criterion's options. */
  async getFilterOptions(fieldKey: string): Promise<string[]> {
    const drawer = await this.openAdvancedSearch();
    const options = await drawer.getOptions(fieldKey).catch(() => [] as string[]);
    await drawer.cancel();
    return options;
  }

  /**
   * Applies criteria by field key (text typed, selects chosen by label, a
   * `DD/MM/YYYY - DD/MM/YYYY` range clicked in the calendar) and returns the
   * rows after the tab's list call answered.
   */
  async applyCriteria(criteria: Record<string, string>, dateKeys: string[] = []): Promise<TabRow<K>[]> {
    Logger.step(`${this.tab} advanced search: ${JSON.stringify(criteria)}`);
    const drawer = await this.openAdvancedSearch();
    const prefix = this.ids.advancedSearch;
    for (const [key, value] of Object.entries(criteria)) {
      const control = this.byId(`${prefix}-field-${key}-input`);
      const tag = await control.evaluate((el) => el.tagName.toLowerCase()).catch(() => '');
      if (dateKeys.includes(key)) await this.pickDateRange(control, value);
      else if (tag === 'input' || tag === 'textarea') await drawer.typeText(key, value);
      else await drawer.choose(key, value);
    }
    const answered = this.page.waitForResponse((r) => this.listEndpoint.test(new URL(r.url()).pathname), { timeout: Timeouts.default }).catch(() => null);
    await drawer.submit();
    await answered;
    await this.detail.waitForPageReady();
    return this.readRows();
  }

  /** The applied-filter chips. */
  async getChips(): Promise<string[]> {
    const chips = await this.page.locator(`[id^="${this.ids.advancedSearch.replace(/-advanced-search$/, '')}-filter-chips-chip-"]`).allInnerTexts().catch(() => [] as string[]);
    return chips.map((t) => t.trim()).filter((t) => t !== '');
  }

  /**
   * Clicks a `DD/MM/YYYY - DD/MM/YYYY` range's days in the calendar: a TYPED
   * range is ignored (Formulary lesson, 2026-11-03).
   *
   * locator-exception: PrimeNG renders day cells without ids; they are read
   * inside the open datepicker panel, which is reached from the field.
   */
  protected async pickDateRange(input: Locator, range: string): Promise<void> {
    const days = range.split(/\s+-\s+/).map((text) => {
      const [d, m, y] = text.split('/').map(Number);
      return new Date(y, m - 1, d);
    });
    await input.click();
    const panel = this.page.locator('.p-datepicker-panel, .p-datepicker').filter({ visible: true }).first(); // locator-exception: the PrimeNG date-picker overlay is portalled with no id
    await expect(panel, 'the date picker should open').toBeVisible({ timeout: Timeouts.default });
    let shown = new Date();
    for (const day of days) {
      const months = (day.getFullYear() - shown.getFullYear()) * 12 + day.getMonth() - shown.getMonth();
      for (let i = 0; i < Math.abs(months); i++) {
        await panel.locator(months > 0 ? '.p-datepicker-next, .p-datepicker-next-button' : '.p-datepicker-prev, .p-datepicker-prev-button').first().click();
      }
      shown = day;
      await panel.locator('td:not(.p-datepicker-other-month) span').filter({ hasText: new RegExp(`^\\s*${day.getDate()}\\s*$`) }).first().click();
    }
    if (await panel.isVisible().catch(() => false)) await input.click();
  }

  private exportIds(): TabExportIds {
    if (!this.ids.export) throw new Error(`the ${this.tab} tab has no export`);
    return this.ids.export;
  }

  /** The tab's Export menu entries ("Export Template", "Export as CSV", "Export as Excel"). */
  async getExportOptions(): Promise<string[]> {
    const ids = this.exportIds();
    await this.page.locator(buttonSelector(ids.trigger)).first().click();
    const options = (await this.page.locator(`#${ids.menu} button`).allInnerTexts().catch(() => [] as string[])).map((t) => t.trim()).filter((t) => t !== '');
    await this.page.keyboard.press('Escape');
    return options;
  }

  async isExportOffered(): Promise<boolean> {
    return this.page.locator(buttonSelector(this.exportIds().trigger)).first().isVisible().catch(() => false);
  }

  /**
   * Exports the tab (Export as CSV / Excel, or the template) and returns the
   * file parsed with its name; `null` with the messages shown when no file came.
   * A format dialog the template raises is answered with `format`.
   */
  async exportFile(kind: 'csv' | 'excel' | 'template', format: 'csv' | 'excel' = 'csv'): Promise<{ filename: string; parsed: ParsedXlsx | null; messages: string[] }> {
    const ids = this.exportIds();
    await this.page.locator(buttonSelector(ids.trigger)).first().click();
    const downloaded = this.page.waitForEvent('download', { timeout: Timeouts.default }).catch(() => null);
    await this.page.locator(`#${ids[kind]}`).click();
    const dialog = new ConfirmDialog(this.page);
    if (await dialog.isVisible()) await new ExportMenu(this.page).clickFormat(format).catch(() => undefined);
    const download = await downloaded;
    const messages = await this.waitForMessages();
    if (!download) return { filename: '', parsed: null, messages };
    const chunks: Buffer[] = [];
    for await (const chunk of await download.createReadStream()) chunks.push(Buffer.from(chunk));
    const bytes = Buffer.concat(chunks);
    const name = download.suggestedFilename();
    const parsed = /\.csv$/i.test(name) ? { ...parseCsv(bytes.toString('utf8')), rightToLeft: false } : parseXlsx(bytes);
    return { filename: name, parsed, messages };
  }

  /** Toasts on screen, settled. */
  async waitForMessages(timeout: number = Timeouts.short): Promise<string[]> {
    return WaitUtils.settleMessages(async () => (await this.page.locator(`#${TOAST.summary}, #${TOAST.detail}`).allInnerTexts().catch(() => [] as string[]))
      .map((t) => t.replace(/\s+/g, ' ').trim()).filter((t) => t !== ''), timeout);
  }
}
