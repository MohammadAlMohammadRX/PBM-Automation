import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { ListPageBase } from '../components/ListPageBase';
import { chooseSelectOption, readSelectOptions } from '../components/PrimeControls';
import { GLOBAL } from '../../constants/ElementIds';
import { Timeouts } from '../../constants/Timeouts';
import { NetworkUtils } from '../../utils/NetworkUtils';
import { Logger } from '../../utils/Logger';
import { captureExport, clickDialogAction, hostButton, readDialog, toastMessages, type UserExportResult } from './userCommon';

/** What one list request answered. */
export interface IdentityListAnswer<T> {
  items: T[];
  totalRows: number;
}

/** How a row / card action is offered. */
export interface IdentityActionState {
  availability: 'absent' | 'disabled' | 'available';
  label: string;
}

/** The ids one identity list (Users Administration / Invitations) is built from. */
export interface IdentityListConfig {
  /** `user-list` / `invitation-list`. */
  screen: string;
  route: string;
  /** The list endpoint's last segment, e.g. `GetUsers`. */
  listCall: string;
  /** The payload key holding `{ items, totalRows }` (`users` / `invitations`). */
  payloadKey: string;
  exportCall: string;
  /** The advanced search field ids by key, and which of them are selects. */
  advancedField: Record<string, string>;
  advancedSelects: readonly string[];
  /** The card id prefix (`user-card-`). */
  cardPrefix: string;
  /**
   * The CSS class of the id-less empty-state block shown INSTEAD of the table when the list
   * has no rows (`user-list__placeholder` "No users found.", `inv-list__placeholder` "No
   * invitations found." - probe 2026-11-08). Default `{screen}__placeholder`.
   */
  placeholderClass?: string;
}

/**
 * The shared behaviour of the two User Management lists (verified 2026-11-08):
 * a debounced keyword search (`searchText`, awaited by ITS OWN request), the
 * Advance Search drawer (`{screen}-advanced-search`, Search / Display Settings
 * tabs, Cancel / Search, chips `{screen}-filter-chips`), Sort By (menu
 * `{screen}-sort-option-{key}`, a direction button that reverses it), Export
 * (menu Selected Export / Export All Data -> `#pbm-dialog` CSV / Excel ->
 * `format` 1 / 2), Table / Cards (`app-breadcrumb-view-toggle-*`, Load More),
 * 10 rows a page with a pager.
 */
export abstract class IdentityListPage<T> extends ListPageBase {
  protected constructor(page: Page, protected readonly cfg: IdentityListConfig) {
    super(page, cfg.screen);
  }

  /** The list's id-less empty-state block (see IdentityListConfig.placeholderClass). */
  protected placeholder(): Locator {
    // locator-exception: the empty state ("No users found." / "No invitations found.") is a <div> with no id.
    return this.page.locator(`.${this.cfg.placeholderClass ?? `${this.screen}__placeholder`}`).first();
  }

  /** The empty state waitForRowsRendered accepts: the `-table-empty` row (id) or the placeholder block. */
  protected emptyState(): Locator {
    return this.byId(`${this.screen}-table-empty`).or(this.placeholder());
  }

  protected listMatcher(): RegExp {
    return new RegExp(`/${this.cfg.listCall}$`);
  }

  async open(): Promise<void> {
    await this.goto(this.cfg.route);
  }

  /** Opens the list in Table view and waits for its first answer and rows. */
  async openTable(): Promise<void> {
    const answered = this.page.waitForResponse((r) => this.listMatcher().test(r.url()), { timeout: Timeouts.default }).catch(() => null);
    await this.open();
    const response = await answered;
    // An EMPTY list renders its placeholder INSTEAD of any table (a payer-scoped account with no
    // invitations - full run 20651 "the table did not appear"): there is no Table view to switch to.
    const body = response ? ((await response.json().catch(() => null)) as { payload?: Record<string, { totalRows?: number }> } | null) : null;
    if (body?.payload?.[this.cfg.payloadKey]?.totalRows === 0
      && (await this.placeholder().waitFor({ state: 'visible', timeout: Timeouts.short }).then(() => true).catch(() => false))) return;
    await this.ensureTableView(this.screen);
    await this.waitForRowsRendered();
  }

  /** The main area's text - for denied / empty states. */
  async getPageText(): Promise<string> {
    return (await this.page.locator('main').first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim(); // locator-exception: the denied / empty states carry no id; the app's single <main> is read whole.
  }

  /** A row by the exact text of its first (name / e-mail) cell, double spaces collapsed. */
  protected rowByText(text: string): Locator {
    const flat = text.replace(/\s+/g, ' ').trim();
    const exact = new RegExp(`^\\s*${flat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+')}\\s*$`);
    return this.rows().filter({ has: this.page.locator(`[id$="-cell-${this.firstColumn()}"]`, { hasText: exact }) }).first();
  }

  /** The column the rows are named by (`name` / `email`). */
  protected abstract firstColumn(): string;

  /** Runs `action` and returns what the list request it triggered answered. */
  async captureList(action: () => Promise<void>): Promise<IdentityListAnswer<T>> {
    const body = await NetworkUtils.captureJsonResponseMatching<{ payload: Record<string, IdentityListAnswer<T>> }>(this.page, this.listMatcher(), action);
    await this.waitForRowsRendered().catch(() => undefined);
    return body?.payload?.[this.cfg.payloadKey] ?? { items: [], totalRows: -1 };
  }

  /** Runs `action` and returns the BODY of the list request it sent. */
  async captureListRequest(action: () => Promise<void>): Promise<Record<string, unknown>> {
    const waiting = this.page.waitForRequest((r) => this.listMatcher().test(r.url()), { timeout: Timeouts.default }).catch(() => null);
    await action();
    const request = await waiting;
    await this.waitForRowsRendered().catch(() => undefined);
    return (request?.postDataJSON() as Record<string, unknown> | null) ?? {};
  }

  /** Types a keyword and returns the answer to THIS term (its `searchText`). An unchanged value is cleared first. */
  async searchFor(term: string): Promise<IdentityListAnswer<T>> {
    Logger.step(`Searching ${this.screen} for "${term}"`);
    if (!(await this.searchInput().isVisible())) await this.openTable();
    const input = this.searchInput();
    if ((await input.inputValue()) === term && term !== '') {
      const cleared = this.page.waitForResponse((r) => this.listMatcher().test(r.url()), { timeout: Timeouts.short }).catch(() => null);
      await input.fill('');
      await cleared;
    }
    const answered = this.page
      .waitForResponse((r) => this.listMatcher().test(r.url())
        && (term.trim() === '' ? !(r.request().postData() ?? '').includes('"searchText"') : (r.request().postData() ?? '').includes(`"searchText":${JSON.stringify(term.trim())}`)), { timeout: Timeouts.default })
      .catch(() => null);
    await input.fill(term);
    const response = await answered;
    await this.waitForRowsRendered().catch(() => undefined);
    const body = response ? ((await response.json().catch(() => null)) as { payload?: Record<string, IdentityListAnswer<T>> } | null) : null;
    return body?.payload?.[this.cfg.payloadKey] ?? { items: [], totalRows: -1 };
  }

  async search(term: string): Promise<void> {
    await this.searchFor(term);
  }

  /** The search box's maxlength (null = none). */
  async getSearchMaxLength(): Promise<number | null> {
    const raw = await this.searchInput().getAttribute('maxlength');
    return raw === null ? null : Number(raw);
  }

  async readSearchValue(): Promise<string> {
    return this.searchInput().inputValue();
  }

  /** Every row on screen, by column key (`-cell-{key}`), in one pass. */
  async readRowsOnScreen(columns: Record<string, string>): Promise<Record<string, string>[]> {
    await this.waitForRowsRendered();
    return this.rows().evaluateAll((trs, cols) => trs.map((tr) => {
      const out: Record<string, string> = { id: tr.id.replace(/^.*-table-row-/, '') };
      for (const [key, column] of Object.entries(cols)) {
        const cell = tr.querySelector(`[id$="-cell-${column}"]`);
        out[key] = cell ? (cell as HTMLElement).innerText.replace(/\s+/g, ' ').trim() : '';
      }
      return out;
    }), columns);
  }

  /** The column headers as shown. */
  async getHeaderTexts(): Promise<string[]> {
    return (await this.page.locator(`th[id^="${this.screen}-table-th-"]`).allInnerTexts()).map((t) => t.trim()).filter((t) => t !== '');
  }

  async countRows(): Promise<number> {
    await this.waitForRowsRendered();
    return this.rows().count();
  }

  async getEmptyStateText(): Promise<string> {
    const byId = (await this.byId(`${this.screen}-table-empty`).innerText({ timeout: 2_000 }).catch(() => '')).trim();
    if (byId) return byId;
    // the id-less placeholder block ("No users found." 20488 / "No invitations found." 20631, 20664)
    return (await this.placeholder().innerText({ timeout: Timeouts.default }).catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  /** The record ids of the rows on screen, in order. */
  async rowIdsOnScreen(): Promise<string[]> {
    await this.waitForRowsRendered();
    return (await this.rows().evaluateAll((trs) => trs.map((tr) => tr.id))).map((id) => id.replace(`${this.screen}-table-row-`, ''));
  }

  async isRowShownById(id: string): Promise<boolean> {
    return this.byId(`${this.screen}-table-row-${id}`).isVisible().catch(() => false);
  }

  // ---- row actions (by record id) ------------------------------------------------------

  protected rowAction(id: string, suffix: string): Locator {
    return this.byId(`${this.screen}-table-row-${id}-${suffix}`);
  }

  /** Whether a row action is absent / disabled / available, and its label. */
  async getRowActionState(id: string, suffix: string): Promise<IdentityActionState> {
    const button = this.rowAction(id, suffix);
    if ((await button.count()) === 0 || !(await button.isVisible().catch(() => false))) return { availability: 'absent', label: '' };
    const label = (await button.innerText().catch(() => '')).trim();
    return { availability: (await button.isDisabled().catch(() => false)) ? 'disabled' : 'available', label };
  }

  /** The labels of the actions a row offers (enabled or not). */
  async readRowActions(id: string): Promise<string[]> {
    return (await this.byId(`${this.screen}-table-row-${id}-actions`).locator('button').allInnerTexts().catch(() => [] as string[])).map((t) => t.trim()).filter(Boolean);
  }

  async clickIdentityRowAction(id: string, suffix: string): Promise<void> {
    await this.rowAction(id, suffix).click({ timeout: Timeouts.default });
  }

  // ---- Advance Search ------------------------------------------------------------------

  /** Opens the Advance Search drawer; returns whether it opened. */
  async openAdvancedSearch(): Promise<boolean> {
    await this.byId(`${this.screen}-search-filter-button`).click();
    return this.byId(`${this.screen}-advanced-search-title`).waitFor({ state: 'visible', timeout: Timeouts.default }).then(() => true).catch(() => false);
  }

  /** The drawer's field labels (what it offers). */
  async readAdvancedFieldLabels(): Promise<string[]> {
    // The label is the block's FIRST line - a filled select adds its value under it ("Status\nPending": full run 20668).
    return (await this.page.locator(`[id^="${this.screen}-advanced-search-field-"]:not([id$="-input"])`).allInnerTexts())
      .map((t) => (t.trim().split('\n')[0] ?? '').replace(/\s*Select\s*$/, '').trim()).filter(Boolean);
  }

  /** A select field's options. */
  async getAdvancedOptions(field: string): Promise<string[]> {
    return readSelectOptions(this.page, this.byId(this.cfg.advancedField[field]));
  }

  /** Fills the drawer's fields (text typed, selects chosen by label). The drawer must be open. */
  async fillAdvanced(values: Record<string, string>): Promise<void> {
    for (const [field, value] of Object.entries(values)) {
      const id = this.cfg.advancedField[field];
      if (!id) throw new Error(`no advanced-search field "${field}" on ${this.screen}`);
      if (this.cfg.advancedSelects.includes(field)) await chooseSelectOption(this.page, this.byId(id), value);
      else await this.byId(id).fill(value);
    }
  }

  /** Search in the drawer -> the list's answer and the request body it sent. */
  async applyAdvanced(): Promise<{ request: Record<string, unknown>; answer: IdentityListAnswer<T> }> {
    let request: Record<string, unknown> = {};
    const answer = await this.captureList(async () => {
      request = await this.captureListRequest(() => hostButton(this.page, `${this.screen}-advanced-search-search-button`).click());
    });
    return { request, answer };
  }

  /** Opens the drawer, fills, searches. */
  async advancedSearch(values: Record<string, string>): Promise<{ request: Record<string, unknown>; answer: IdentityListAnswer<T> }> {
    if (!(await this.openAdvancedSearch())) throw new Error(`the ${this.screen} Advance Search drawer did not open`);
    await this.fillAdvanced(values);
    return this.applyAdvanced();
  }

  async cancelAdvanced(): Promise<void> {
    await hostButton(this.page, `${this.screen}-advanced-search-cancel-button`).click();
  }

  /** The applied-filter chips' texts. */
  async getChips(): Promise<string[]> {
    return (await this.page.locator(`[id^="${this.screen}-filter-chips-chip-"]:not([id$="-remove"])`).allInnerTexts().catch(() => [] as string[])).map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean);
  }

  /** Removes one chip (`{screen}-filter-chips-chip-{key}-remove`) and returns the list it re-fetched. */
  async removeChip(key: string): Promise<IdentityListAnswer<T>> {
    return this.captureList(() => this.byId(`${this.screen}-filter-chips-chip-${key}-remove`).click());
  }

  // ---- Sort ---------------------------------------------------------------------------

  async readSortLabel(): Promise<string> {
    return (await this.byId(`${this.screen}-sort-trigger`).innerText()).trim();
  }

  async readSortDirectionLabel(): Promise<string> {
    return (await this.byId(`${this.screen}-sort-direction`).getAttribute('aria-label')) ?? '';
  }

  /** The Sort By menu's option labels. */
  async getSortOptions(): Promise<string[]> {
    await this.byId(`${this.screen}-sort-trigger`).click();
    const menu = this.byId(`${this.screen}-sort-menu`);
    await menu.waitFor({ state: 'visible', timeout: Timeouts.default });
    const labels = (await menu.locator('button').allInnerTexts()).map((t) => t.trim()).filter(Boolean);
    await this.byId(`${this.screen}-sort-trigger`).click();
    return labels;
  }

  /** Picks a Sort By option (`{screen}-sort-option-{key}`) -> the request body (its `sortBy`) and the answer. */
  async sortBy(optionKey: string): Promise<{ request: Record<string, unknown>; answer: IdentityListAnswer<T> }> {
    Logger.step(`Sorting ${this.screen} by ${optionKey}`);
    let request: Record<string, unknown> = {};
    const answer = await this.captureList(async () => {
      request = await this.captureListRequest(async () => {
        await this.byId(`${this.screen}-sort-trigger`).click();
        await this.byId(`${this.screen}-sort-option-${optionKey}`).click();
      });
    });
    return { request, answer };
  }

  /** The direction button (reverses the current field) -> request + answer. */
  async reverseSort(): Promise<{ request: Record<string, unknown>; answer: IdentityListAnswer<T> }> {
    let request: Record<string, unknown> = {};
    const answer = await this.captureList(async () => {
      request = await this.captureListRequest(() => this.byId(`${this.screen}-sort-direction`).click());
    });
    return { request, answer };
  }

  // ---- Export --------------------------------------------------------------------------

  /** The Export menu's options ("Selected Export", "Export All Data"). */
  async getExportOptions(): Promise<string[]> {
    await this.byId(`${this.screen}-export-trigger`).click();
    const menu = this.byId(`${this.screen}-export-menu`);
    const shown = await menu.waitFor({ state: 'visible', timeout: Timeouts.default }).then(() => true).catch(() => false);
    const labels = shown ? (await menu.locator('button').allInnerTexts()).map((t) => t.trim()).filter(Boolean) : [];
    await this.page.keyboard.press('Escape');
    return labels;
  }

  async isExportOffered(): Promise<boolean> {
    return this.byId(`${this.screen}-export-trigger`).isVisible().catch(() => false);
  }

  /** Export -> Selected Export / Export All Data -> the format dialog (returned open; read it with readDialog). */
  async chooseExport(scope: 'selected' | 'all'): Promise<{ title: string; message: string; actions: string[] }> {
    await this.byId(`${this.screen}-export-trigger`).click();
    await this.byId(`${this.screen}-export-${scope}`).click();
    await this.page.locator('#pbm-dialog').waitFor({ state: 'visible', timeout: Timeouts.default });
    const d = await readDialog(this.page);
    return { title: d.title, message: d.message, actions: d.actions };
  }

  /** Export -> scope -> CSV / Excel: the request body (`format` 1 CSV / 2 Excel), the file and its rows. */
  async exportAndParse(scope: 'selected' | 'all', format: 'csv' | 'excel'): Promise<UserExportResult> {
    return captureExport(this.page, this.cfg.exportCall, async () => {
      await this.chooseExport(scope);
      // A scope question ("All users" / "Filtered results") is answered when the app asks it (bundle; not seen live).
      const d = await readDialog(this.page);
      if (d.actions.some((a) => /Filtered results|All users/i.test(a))) await clickDialogAction(this.page, scope === 'all' ? 'all' : 'filtered');
      await clickDialogAction(this.page, format);
    });
  }

  async readToasts(): Promise<string[]> {
    return toastMessages(this.page);
  }

  // ---- Cards ---------------------------------------------------------------------------

  async switchToCards(): Promise<void> {
    // Switching view RE-FETCHES the list (probe 2026-11-08): cards read before
    // that answer renders come back empty, so wait for the list's own answer.
    const answered = this.page.waitForResponse((r) => this.listMatcher().test(r.url()), { timeout: Timeouts.default }).catch(() => null);
    await this.btn(GLOBAL.viewToggleCards).click();
    const response = await answered;
    const body = (await response?.json().catch(() => null)) as { payload?: Record<string, { items?: unknown[] }> } | null;
    const expected = body?.payload?.[this.cfg.payloadKey]?.items?.length ?? 0;
    if (expected > 0) {
      await expect.poll(() => this.page.locator(`article[id^="${this.cfg.cardPrefix}"]`).count(), { timeout: Timeouts.default }).toBeGreaterThan(0);
    }
    // The card view has no container id (no `${screen}-cards`, full run 20562,
    // 2026-11-08): it is ready when the toggle reports it selected and either a
    // card (`{cardPrefix}{id}`) or the empty placeholder has rendered.
    await expect(this.btn(GLOBAL.viewToggleCards)).toHaveAttribute('aria-selected', 'true', { timeout: Timeouts.default });
    // locator-exception: cards are matched by their id prefix; the empty state is the placeholder class (no id).
    await this.page
      .locator(`article[id^="${this.cfg.cardPrefix}"]`)
      .first()
      .or(this.placeholder())
      .first()
      .waitFor({ state: 'visible', timeout: Timeouts.default });
  }

  async switchToTable(): Promise<void> {
    await this.ensureTableView(this.screen);
  }

  /** 'table' | 'cards' - which view the toggle reports active. */
  async readView(): Promise<'table' | 'cards'> {
    return (await this.btn(GLOBAL.viewToggleCards).getAttribute('aria-selected')) === 'true' ? 'cards' : 'table';
  }

  /** The record ids of the cards shown. */
  async cardIdsOnScreen(): Promise<string[]> {
    return (await this.page.locator(`article[id^="${this.cfg.cardPrefix}"]`).evaluateAll((els) => els.map((e) => e.id))).map((id) => id.replace(this.cfg.cardPrefix, ''));
  }

  /** One card's value (`{cardPrefix}{id}-{field}`). */
  async readCardField(id: string, field: string): Promise<string> {
    return (await this.byId(`${this.cfg.cardPrefix}${id}-${field}`).innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  /** The labels of a card's footer buttons. */
  async readCardActions(id: string): Promise<string[]> {
    return (await this.byId(`${this.cfg.cardPrefix}${id}-footer`).locator('button').allInnerTexts().catch(() => [] as string[])).map((t) => t.trim()).filter(Boolean);
  }

  async clickCardAction(id: string, action: string): Promise<void> {
    await hostButton(this.page, `${this.cfg.cardPrefix}${id}-${action}`).click();
  }

  /** "Load More" under the cards -> the list request it sent. */
  async loadMoreCards(): Promise<Record<string, unknown>> {
    return this.captureListRequest(() => this.byId(`${this.screen}-load-more-button`).click());
  }

  // ---- Pager ---------------------------------------------------------------------------

  /** Pager next / prev / page-N -> the list request it sent (its `pageNumber`). */
  async goToPage(target: 'next' | 'prev' | number): Promise<Record<string, unknown>> {
    const id = typeof target === 'number' ? `${this.screen}-table-pager-page-${target}` : `${this.screen}-table-pager-${target}`;
    return this.captureListRequest(() => this.byId(id).click());
  }

  async isPagerButtonEnabled(target: 'next' | 'prev'): Promise<boolean> {
    return this.byId(`${this.screen}-table-pager-${target}`).isEnabled().catch(() => false);
  }

  /** Asserts the toolbar rendered (list access). */
  async expectToolbar(): Promise<void> {
    await expect(this.searchInput(), `the ${this.screen} search box should render`).toBeVisible({ timeout: Timeouts.default });
  }
}
