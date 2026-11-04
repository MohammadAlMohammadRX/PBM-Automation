import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { ListPageBase } from '../components/ListPageBase';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ExportMenu } from '../components/ExportMenu';
import { AdvancedSearchDrawer } from '../payer/AdvancedSearchDrawer';
import { chooseSelectOption, readSelectOptions } from '../components/PrimeControls';
import { FacilityFormDrawer } from './FacilityFormDrawer';
import { FacilityDetailPage } from './FacilityDetailPage';
import { FacilityInactivateDrawer } from './FacilityInactivateDrawer';
import { AppRoutes } from '../../constants/AppRoutes';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import { Timeouts } from '../../constants/Timeouts';
import { GLOBAL, TOAST, buttonSelector } from '../../constants/ElementIds';
import {
  FACILITY_ADVANCED_SEARCH,
  FACILITY_CARD,
  FACILITY_COLUMN,
  FACILITY_EXPORT,
  FACILITY_LIST,
  FACILITY_ROW_ACTION,
  FACILITY_SORT_FIELD,
  type FacilityAdvancedField,
  type FacilityCardAction,
  type FacilityColumnKey,
  type FacilityKpiKey,
  type FacilityQuickFilter,
  type FacilityRowAction,
  type FacilitySortField,
} from '../../constants/facility/facilityIds';
import { NetworkUtils } from '../../utils/NetworkUtils';
import { WaitUtils } from '../../utils/WaitUtils';
import { Logger } from '../../utils/Logger';
import type { ParsedXlsx } from '../../utils/XlsxUtils';
import { listFacilityRegister, readFacilityDashboard, type FacilityDashboard, type FacilityListItem } from '../../utils/FacilityProvisioning';

/** One list row, by column. */
export type FacilityRowValues = Record<FacilityColumnKey, string>;

/** What one GetFacilities request answered. */
export interface FacilityListAnswer {
  items: FacilityListItem[];
  totalRows: number;
}

/** How a row / card action is offered: availability, label and tooltip ("Cannot activate: the facility licence has expired. ..."). */
export interface FacilityActionState {
  availability: 'absent' | 'disabled' | 'available';
  label: string;
  title: string;
}

/** What a write from the list answered (status -1 when nothing was sent) and the messages shown. */
export interface FacilityWriteAnswer {
  status: number;
  text: string;
  messages: string[];
}

/**
 * The Facility list (`/facility-management`, Feature 15130), verified live
 * 2026-11-04 (reports/facility/Facility-Foundation-Notes.md).
 *
 * Five KPI tiles (Total, Active, Future, Inactive, Expired Licences - they
 * count up from 0), a keyword search (English / Arabic name, code, e-mail -
 * NOT the licence number; debounced, it fires on typing), the Filters button
 * -> "Advance Search for Facilities" (Name / Code, Type, Status, Provider
 * Type), quick filters All Types / All Statuses, Sort By (name, code, licence
 * expiry, status, created, modified - no type), Export (Selected Export = the
 * current filters, Export All Data = none; then CSV / Excel), Add Facility,
 * the table (`facility-list-table-row-{id}`, 10 rows a page, pager) and a
 * Cards view ("Load More Facilities"). Every list read waits for ITS OWN
 * GetFacilities answer.
 */
export class FacilityManagementPage extends ListPageBase {
  constructor(page: Page) {
    super(page, FACILITY_LIST.screen);
  }

  async open(): Promise<void> {
    await this.goto(AppRoutes.facilityManagement);
  }

  /** Opens the list in Table view and waits for its rows AND the KPI answer (the tiles read 0 until GetFacilitiesDashboard answers). */
  async openTable(): Promise<void> {
    const dashboard = this.page.waitForResponse((r) => /\/GetFacilitiesDashboard$/.test(r.url()), { timeout: Timeouts.default }).catch(() => null);
    await this.open();
    await dashboard;
    await this.ensureTableView(this.screen);
    await this.waitForRowsRendered();
  }

  /** The main area's text - for denied / empty states. */
  async getPageText(): Promise<string> {
    return (await this.page.locator('main').first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim(); // locator-exception: the denied / empty states carry no id; the app's single <main> is read whole.
  }

  /** A row by the facility's English NAME, matched exactly in its name cell. */
  protected rowByText(text: string): Locator {
    const exact = new RegExp(`^\\s*${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`);
    return this.rows().filter({ has: this.page.locator(`[id$="-cell-${FACILITY_COLUMN.name}"]`, { hasText: exact }) }).first();
  }

  /** Runs `action` and returns what the GetFacilities request it triggered answered. */
  async captureList(action: () => Promise<void>): Promise<FacilityListAnswer> {
    const body = await NetworkUtils.captureJsonResponseMatching<{ payload: { facilities: FacilityListAnswer } }>(this.page, /\/GetFacilities$/, action);
    await this.waitForRowsRendered().catch(() => undefined);
    return body?.payload.facilities ?? { items: [], totalRows: -1 };
  }

  /** Runs `action` and returns the BODY of the GetFacilities request it sent. */
  async captureListRequest(action: () => Promise<void>): Promise<Record<string, unknown>> {
    const waiting = this.page.waitForRequest((r) => /\/GetFacilities$/.test(r.url()), { timeout: Timeouts.default }).catch(() => null);
    await action();
    const request = await waiting;
    return (request?.postDataJSON() as Record<string, unknown> | null) ?? {};
  }

  /**
   * Types a keyword and waits for the answer to THIS search (its
   * `searchText`). The box is debounced (300 ms) and ignores an unchanged
   * value, so the same term twice is cleared first.
   */
  async search(term: string): Promise<void> {
    Logger.step(`Searching facilities for "${term}"`);
    if (!(await this.searchInput().isVisible())) await this.openTable();
    const input = this.searchInput();
    if ((await input.inputValue()) === term && term !== '') {
      const cleared = this.page.waitForResponse((r) => /\/GetFacilities$/.test(r.url()), { timeout: Timeouts.short }).catch(() => null);
      await input.fill('');
      await cleared;
    }
    const answered = this.page
      .waitForResponse((r) => /\/GetFacilities$/.test(r.url())
        && (term.trim() === '' ? !(r.request().postData() ?? '').includes('"searchText"') : (r.request().postData() ?? '').includes(`"searchText":${JSON.stringify(term.trim())}`)), { timeout: Timeouts.default })
      .catch(() => null);
    await input.fill(term);
    await answered;
    await this.waitForPageReady();
  }

  async searchFor(term: string): Promise<FacilityListAnswer> {
    return this.captureList(() => this.search(term));
  }

  /** Searches for a facility by name and waits for its row (no search when it is on screen). */
  async revealRow(name: string): Promise<void> {
    if (await this.rowByText(name).isVisible().catch(() => false)) return;
    await this.search(name);
    await this.waitForRowVisible(name);
  }

  async isListed(name: string): Promise<boolean> {
    const searched = await this.search(name).then(() => true).catch(() => false);
    return searched && this.isRowVisible(name);
  }

  /** The id of a facility's row (the facility id). */
  async facilityIdOf(name: string): Promise<string> {
    await this.revealRow(name);
    return (await this.rowId(name)).replace(`${this.screen}-table-row-`, '');
  }

  async readNames(): Promise<string[]> {
    await this.waitForRowsRendered();
    return this.columnValues(FACILITY_COLUMN.name);
  }

  async readColumnValues(column: FacilityColumnKey): Promise<string[]> {
    await this.waitForRowsRendered();
    return this.columnValues(FACILITY_COLUMN[column]);
  }

  /** One row's values by column (searches for it first). */
  async readRow(name: string): Promise<FacilityRowValues> {
    await this.revealRow(name);
    const out = {} as FacilityRowValues;
    for (const [key, column] of Object.entries(FACILITY_COLUMN) as [FacilityColumnKey, string][]) out[key] = await this.getCellValue(name, column);
    return out;
  }

  /** Every row on screen, by column, in one pass. */
  async readRowsOnScreen(): Promise<FacilityRowValues[]> {
    await this.waitForRowsRendered();
    return this.rows().evaluateAll((trs, columns) => trs.map((tr) => {
      const out: Record<string, string> = {};
      for (const [key, column] of Object.entries(columns)) {
        const cell = tr.querySelector(`[id$="-cell-${column}"]`);
        out[key] = cell ? (cell as HTMLElement).innerText.replace(/\s+/g, ' ').trim() : '';
      }
      return out;
    }), FACILITY_COLUMN as Record<string, string>) as Promise<FacilityRowValues[]>;
  }

  /** The column headers as shown (Facility Name, Facility Type, Code, License Number, License Expiry Date, Status, Actions). */
  async getHeaderTexts(): Promise<string[]> {
    return (await this.page.locator(`th[id^="${this.screen}-table-th-"]`).allInnerTexts()).map((t) => t.trim()).filter((t) => t !== '');
  }

  async countRows(): Promise<number> {
    await this.waitForRowsRendered();
    return this.getRowCount();
  }

  /** The table's empty row ("No results found."). */
  async getEmptyStateText(): Promise<string> {
    return (await this.byId(FACILITY_LIST.tableEmpty).innerText({ timeout: Timeouts.default }).catch(() => '')).trim();
  }

  // ---- KPI tiles ----------------------------------------------------------------------

  async readKpi(kpi: FacilityKpiKey): Promise<number> {
    const text = await this.settledKpiValue(FACILITY_LIST.kpi[kpi]);
    return Number(text.replace(/[^\d-]/g, '') || NaN);
  }

  /** A tile's value once it stops changing (the tiles count up from 0 after the dashboard answers). */
  private async settledKpiValue(tileId: string): Promise<string> {
    const value = this.byId(`${tileId}-value`);
    await value.waitFor({ state: 'visible', timeout: Timeouts.default });
    let last = (await value.innerText()).trim();
    for (let i = 0; i < 20; i += 1) {
      await this.page.waitForTimeout(300);
      const now = (await value.innerText()).trim();
      if (now === last) return now;
      last = now;
    }
    return last;
  }

  /** Every KPI tile: label and settled value as shown. */
  async readKpis(): Promise<Record<FacilityKpiKey, { label: string; value: string }>> {
    await expect(this.byId(FACILITY_LIST.kpiBand), 'the KPI tiles should render').toBeVisible({ timeout: Timeouts.default });
    const out = {} as Record<FacilityKpiKey, { label: string; value: string }>;
    for (const [key, id] of Object.entries(FACILITY_LIST.kpi) as [FacilityKpiKey, string][]) {
      out[key] = {
        label: (await this.byId(`${id}-label`).innerText().catch(() => '')).trim(),
        value: await this.settledKpiValue(id).catch(() => ''),
      };
    }
    return out;
  }

  /** Every KPI tile label rendered, in order. */
  async readKpiLabels(): Promise<string[]> {
    return (await this.page.locator(`[id^="facility-list-kpi-"][id$="-label"]`).allInnerTexts()).map((t) => t.trim());
  }

  async isKpiBandVisible(): Promise<boolean> {
    return this.byId(FACILITY_LIST.kpiBand).waitFor({ state: 'visible', timeout: Timeouts.default }).then(() => true).catch(() => false);
  }

  async fetchDashboard(): Promise<FacilityDashboard> {
    return readFacilityDashboard(this.page);
  }

  /** Reloads and returns the dashboard answer the reload fetched. */
  async reloadCapturingDashboard(): Promise<FacilityDashboard | null> {
    const body = await NetworkUtils.captureJsonResponseMatching<{ payload: FacilityDashboard }>(this.page, /\/GetFacilitiesDashboard$/, () => this.reload());
    await this.waitForRowsRendered().catch(() => undefined);
    return body?.payload ?? null;
  }

  // ---- quick filters, advanced search, chips --------------------------------------------

  /** A quick filter's options ("All Types", "Clinic", ... / "All Statuses", "Future", "Active", "Inactive", "Expired"). */
  async getFilterOptions(filter: FacilityQuickFilter): Promise<string[]> {
    return readSelectOptions(this.page, this.byId(FACILITY_LIST.filter[filter]));
  }

  /** Picks a quick filter's option (by label) and returns the list it answered (the status filter matches the DISPLAYED status). */
  async filterBy(filter: FacilityQuickFilter, label: string): Promise<FacilityListAnswer> {
    Logger.step(`Filtering facilities: ${filter} = "${label}"`);
    await this.ensureTableView(this.screen);
    return this.captureList(() => chooseSelectOption(this.page, this.byId(FACILITY_LIST.filter[filter]), label));
  }

  async readFilter(filter: FacilityQuickFilter): Promise<string> {
    return (await this.byId(FACILITY_LIST.filter[filter]).innerText().catch(() => '')).trim();
  }

  /** Opens "Advance Search for Facilities" and returns the shared drawer (field keys: FACILITY_ADVANCED_SEARCH.field). */
  async openAdvancedSearch(): Promise<AdvancedSearchDrawer> {
    await this.btn(FACILITY_LIST.searchFilterButton).click();
    const drawer = new AdvancedSearchDrawer(this.page, FACILITY_LIST.screen);
    await drawer.waitForOpen();
    return drawer;
  }

  /**
   * Fills the advanced search (`searchText` typed, the rest chosen by label)
   * and returns the list the Search answered.
   */
  async advancedSearch(criteria: Partial<Record<FacilityAdvancedField, string>>): Promise<FacilityListAnswer> {
    Logger.step(`Advanced facility search: ${JSON.stringify(criteria)}`);
    const drawer = await this.openAdvancedSearch();
    for (const [key, value] of Object.entries(criteria) as [FacilityAdvancedField, string][]) {
      const field = FACILITY_ADVANCED_SEARCH.field[key];
      if (key === 'searchText') await drawer.typeText(field, value);
      else await drawer.choose(field, value);
    }
    return this.captureList(() => drawer.submit());
  }

  /** The labels of the advanced-search fields offered. */
  async getAdvancedSearchLabels(): Promise<string[]> {
    const drawer = await this.openAdvancedSearch();
    const labels = await drawer.getFieldLabels();
    await drawer.cancel();
    return labels;
  }

  /** The applied-filter chips ("QA Automation Facility", "Pharmacy", "Inactive"). */
  async getChips(): Promise<string[]> {
    const chips = await this.page.locator(`[id^="${FACILITY_LIST.chips}-chip-"]:not([id$="-remove"])`).allInnerTexts().catch(() => [] as string[]);
    return chips.map((t) => t.trim()).filter((t) => t !== '');
  }

  /** Removes one chip (`search`, `type`, `status`, `providerType`) and returns the list it answered. */
  async removeChip(chip: 'search' | 'type' | 'status' | 'providerType'): Promise<FacilityListAnswer> {
    return this.captureList(() => this.page.locator(`#${FACILITY_LIST.chips}-chip-${chip}-remove`).click());
  }

  /** "Clear" beside the search box: clears the search and every filter; returns the list it answered. */
  async clearAllFilters(): Promise<FacilityListAnswer> {
    return this.captureList(() => this.btn(FACILITY_LIST.searchClearAll).click());
  }

  // ---- sort ---------------------------------------------------------------------------

  async getSortOptions(): Promise<string[]> {
    await this.btn(FACILITY_LIST.sortTrigger).click();
    await this.page.locator(`[id^="${FACILITY_LIST.sortOptionPrefix}"]`).first().waitFor({ state: 'visible', timeout: Timeouts.short }).catch(() => undefined);
    const options = (await this.page.locator(`[id^="${FACILITY_LIST.sortOptionPrefix}"]`).allInnerTexts()).map((t) => t.trim());
    await this.page.keyboard.press('Escape');
    return options;
  }

  /** Sorts by a field and returns the list it answered (request `sortBy` "FacilityCode asc", ...). */
  async sortBy(field: FacilitySortField, direction: 'asc' | 'desc'): Promise<FacilityListAnswer> {
    Logger.step(`Sorting facilities by ${field} ${direction}`);
    await this.ensureTableView(this.screen);
    await this.btn(FACILITY_LIST.sortTrigger).click();
    return this.captureList(() => this.page.locator(`#${FACILITY_LIST.sortOptionPrefix}${FACILITY_SORT_FIELD[field]}-${direction}`).click());
  }

  /** The sort option the menu marks active (aria-checked), e.g. "Code (A-Z)". */
  async readSortLabel(): Promise<string> {
    await this.btn(FACILITY_LIST.sortTrigger).click();
    await this.page.locator(`[id^="${FACILITY_LIST.sortOptionPrefix}"]`).first().waitFor({ state: 'visible', timeout: Timeouts.short }).catch(() => undefined);
    const active = this.page.locator(`[id^="${FACILITY_LIST.sortOptionPrefix}"][aria-checked="true"]`);
    const label = (await active.count()) > 0 ? (await active.first().innerText()).replace(/\s+/g, ' ').trim() : '';
    await this.page.keyboard.press('Escape');
    return label;
  }

  // ---- pagination ------------------------------------------------------------------------

  /** Clicks a pager page and returns the list it answered. */
  async goToPage(pageNumber: number): Promise<FacilityListAnswer> {
    return this.captureList(() => this.page.locator(`#${FACILITY_LIST.pager}-page-${pageNumber}`).click());
  }

  // ---- row actions --------------------------------------------------------------------

  private async facilityAction(name: string, action: FacilityRowAction): Promise<Locator> {
    const id = await this.rowId(name);
    return this.page.locator(`#${id}-${FACILITY_ROW_ACTION[action]}`).first();
  }

  /** How a row offers one action ('absent' | 'disabled' | 'available', label, tooltip). */
  async getActionState(name: string, action: FacilityRowAction): Promise<FacilityActionState> {
    if (!(await this.rowByText(name).isVisible())) await this.revealRow(name);
    await this.waitForRowVisible(name);
    const [state] = await (await this.facilityAction(name, action)).evaluateAll((buttons) =>
      buttons.map((b) => ({ disabled: (b as HTMLButtonElement).disabled, label: (b as HTMLElement).innerText.trim(), title: b.getAttribute('title') ?? '' })));
    if (state === undefined) return { availability: 'absent', label: '', title: '' };
    return { availability: state.disabled ? 'disabled' : 'available', label: state.label, title: state.title };
  }

  async readActionStates(name: string): Promise<Record<FacilityRowAction, FacilityActionState>> {
    await this.revealRow(name);
    const out = {} as Record<FacilityRowAction, FacilityActionState>;
    for (const action of Object.keys(FACILITY_ROW_ACTION) as FacilityRowAction[]) out[action] = await this.getActionState(name, action);
    return out;
  }

  /** The labels of the actions a row offers, enabled or not ("View", "Edit", "Inactivate", "Delete"). */
  async readOfferedActions(name: string): Promise<string[]> {
    const states = await this.readActionStates(name);
    return Object.values(states).filter((s) => s.availability !== 'absent').map((s) => s.label);
  }

  async clickAction(name: string, action: FacilityRowAction): Promise<void> {
    Logger.step(`Clicking "${action}" for facility "${name}"`);
    if (!(await this.rowByText(name).isVisible())) await this.revealRow(name);
    await this.waitForPageReady();
    const button = await this.facilityAction(name, action);
    await expect(button, `"${name}" should offer a usable ${action} action`).toBeEnabled({ timeout: Timeouts.default });
    await button.click();
  }

  /** View on a row -> the detail screen, loaded. */
  async openDetails(name: string): Promise<FacilityDetailPage> {
    await this.clickAction(name, 'view');
    const detail = new FacilityDetailPage(this.page);
    await detail.waitForLoaded();
    return detail;
  }

  async isAddOffered(): Promise<boolean> {
    return this.addButton().waitFor({ state: 'visible', timeout: Timeouts.short }).then(() => true).catch(() => false);
  }

  /** Opens the Add Facility drawer ("Add New Facility", step 1). */
  async openAddForm(): Promise<FacilityFormDrawer> {
    await this.waitForPageReady();
    await this.clickAdd();
    const drawer = new FacilityFormDrawer(this.page);
    const opened = await drawer.isOpen();
    if (!opened) await this.clickAdd();
    await drawer.waitForOpen();
    return drawer;
  }

  /** Edit on a row -> the same drawer in edit mode ("Edit Facility"), values loaded. */
  async openEditForm(name: string): Promise<FacilityFormDrawer> {
    await this.clickAction(name, 'edit');
    const drawer = new FacilityFormDrawer(this.page);
    await drawer.waitForOpen();
    await drawer.waitForLoadedValues();
    return drawer;
  }

  /** Inactivate on a row -> the list's Inactivate drawer (`facility-deactivate-drawer`). */
  async openInactivateDrawer(name: string): Promise<FacilityInactivateDrawer> {
    await this.clickAction(name, 'inactivate');
    const drawer = new FacilityInactivateDrawer(this.page, 'list');
    await drawer.waitForOpen();
    return drawer;
  }

  /** Clicks Activate or Delete on a row and returns the shared confirmation, open ("Activate facility" / "Delete Facility"). */
  async requestAction(name: string, action: 'activate' | 'delete'): Promise<ConfirmDialog> {
    await this.clickAction(name, action);
    const dialog = new ConfirmDialog(this.page);
    await dialog.waitForVisible();
    return dialog;
  }

  /** Activate + confirm; returns SetFacilityActive's answer and the toasts. */
  async activateFacility(name: string): Promise<FacilityWriteAnswer> {
    const dialog = await this.requestAction(name, 'activate');
    const answer = await NetworkUtils.captureResponse(this.page, ApiEndpoints.facilitySetActive, () => dialog.confirm());
    return { status: answer?.status ?? -1, text: answer?.text ?? '', messages: await this.waitForVisibleMessages() };
  }

  /** Delete + Yes; returns DeleteFacility's answer and the toasts (409 + "This facility cannot be deleted because ..." when blocked). */
  async deleteFacility(name: string): Promise<FacilityWriteAnswer> {
    const dialog = await this.requestAction(name, 'delete');
    const answer = await NetworkUtils.captureResponse(this.page, ApiEndpoints.facilityDelete, () => dialog.confirm());
    return { status: answer?.status ?? -1, text: answer?.text ?? '', messages: await this.waitForVisibleMessages() };
  }

  async waitForVisibleMessages(timeout: number = Timeouts.short): Promise<string[]> {
    return WaitUtils.settleMessages(async () => (await this.page.locator(`#${TOAST.summary}, #${TOAST.detail}`).allInnerTexts().catch(() => [] as string[]))
      .map((t) => t.trim()).filter((t) => t !== ''), timeout);
  }

  // ---- cards --------------------------------------------------------------------------

  async switchToCards(): Promise<void> {
    const cards = this.byId(FACILITY_LIST.cards);
    await this.btn(GLOBAL.viewToggleCards).click();
    if (!(await cards.waitFor({ state: 'visible', timeout: Timeouts.short }).then(() => true).catch(() => false))) {
      await this.btn(GLOBAL.viewToggleCards).click();
    }
    await expect(cards, 'the Cards view should render').toBeVisible({ timeout: Timeouts.default });
  }

  async switchToTable(): Promise<void> {
    await this.ensureTableView(this.screen);
  }

  /** Which view the module shows now ('table' | 'cards'), read off the global toggle. */
  async readView(): Promise<'table' | 'cards'> {
    return (await this.btn(GLOBAL.viewToggleCards).getAttribute('aria-selected')) === 'true' ? 'cards' : 'table';
  }

  private card(name: string): Locator {
    const exact = new RegExp(`^\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`);
    return this.page.locator(`article[id^="${FACILITY_CARD.prefix}"]`, { has: this.page.locator(`[id$="-${FACILITY_CARD.title}"]`, { hasText: exact }) }).first();
  }

  async isCardShown(name: string): Promise<boolean> {
    return this.card(name).waitFor({ state: 'visible', timeout: Timeouts.default }).then(() => true).catch(() => false);
  }

  /** Clicks "Load More Facilities" until the card shows or nothing more loads. */
  async loadCardsUntilShown(name: string, maxLoads = 20): Promise<boolean> {
    for (let i = 0; i < maxLoads; i += 1) {
      if (await this.card(name).isVisible()) return true;
      const more = this.btn(FACILITY_LIST.loadMore);
      if (!(await more.isVisible().catch(() => false))) break;
      await more.click();
      await this.waitForPageReady();
    }
    return this.isCardShown(name);
  }

  /** A card's values by field (title, typeTag, code, licenseNo, licenseExpiry, status, statusBadge) plus its header text. */
  async readCard(name: string): Promise<Record<string, string>> {
    const card = this.card(name);
    await expect(card, `a card for "${name}"`).toBeVisible({ timeout: Timeouts.default });
    const id = (await card.getAttribute('id')) ?? '';
    const out: Record<string, string> = {};
    for (const key of ['title', 'typeTag', 'code', 'licenseNo', 'licenseExpiry', 'status', 'statusBadge'] as const) {
      out[key] = (await this.byId(`${id}-${FACILITY_CARD[key]}`).innerText({ timeout: Timeouts.short }).catch(() => '')).trim();
    }
    out.header = (await this.byId(`${id}-${FACILITY_CARD.header}`).innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
    return out;
  }

  async getCardActionState(name: string, action: FacilityCardAction): Promise<FacilityActionState> {
    const card = this.card(name);
    await expect(card, `a card for "${name}"`).toBeVisible({ timeout: Timeouts.default });
    const id = (await card.getAttribute('id')) ?? '';
    const button = this.page.locator(buttonSelector(`${id}-${FACILITY_CARD.action[action]}`)).first();
    if ((await button.count()) === 0) return { availability: 'absent', label: '', title: '' };
    return { availability: (await button.isEnabled()) ? 'available' : 'disabled', label: (await button.innerText()).trim(), title: (await button.getAttribute('title')) ?? '' };
  }

  /** The card's Active switch: whether it is rendered, on and enabled (disabled for an expired licence). */
  async readCardSwitch(name: string): Promise<{ present: boolean; on: boolean; enabled: boolean }> {
    const card = this.card(name);
    await expect(card, `a card for "${name}"`).toBeVisible({ timeout: Timeouts.default });
    const id = (await card.getAttribute('id')) ?? '';
    const input = this.byId(`${id}-${FACILITY_CARD.activeSwitch}`);
    if ((await input.count()) === 0) return { present: false, on: false, enabled: false };
    return { present: true, on: await input.isChecked(), enabled: await input.isEnabled() };
  }

  // ---- export -------------------------------------------------------------------------

  exportMenu(): ExportMenu {
    return new ExportMenu(this.page, FACILITY_EXPORT);
  }

  /** The Export menu's entries as offered ("Selected Export", "Export All Data"). */
  async getExportOptions(): Promise<string[]> {
    await this.waitForPageReady();
    await this.page.locator(buttonSelector(FACILITY_EXPORT.trigger)).first().click();
    await this.byId(FACILITY_EXPORT.menu).waitFor({ state: 'visible', timeout: Timeouts.default }).catch(() => undefined);
    const offered = await this.exportMenu().getOfferedScopes();
    await this.exportMenu().cancelMenu().catch(() => undefined);
    return offered;
  }

  async isExportOffered(): Promise<boolean> {
    return this.page.locator(buttonSelector(FACILITY_EXPORT.trigger)).first().waitFor({ state: 'visible', timeout: Timeouts.short }).then(() => true).catch(() => false);
  }

  /** Exports (Selected = the current filters / All = none) as CSV or Excel and returns the file parsed. */
  async exportAndParse(scope: 'all' | 'selected', format: 'csv' | 'excel'): Promise<{ filename: string; bytes: Buffer; parsed: ParsedXlsx }> {
    await this.waitForPageReady();
    return this.exportMenu().exportAndParse(scope, format);
  }

  /** Runs an export and returns the ExportFacilities request body it sent (`format` 1 CSV / 2 Excel). */
  async captureExportRequest(scope: 'all' | 'selected', format: 'csv' | 'excel'): Promise<Record<string, unknown>> {
    const waiting = this.page.waitForRequest((r) => r.url().includes(ApiEndpoints.facilityExport), { timeout: Timeouts.default }).catch(() => null);
    await this.exportAndParse(scope, format).catch(() => undefined);
    const request = await waiting;
    return (request?.postDataJSON() as Record<string, unknown> | null) ?? {};
  }

  // ---- API ----------------------------------------------------------------------------

  async fetchRegister(criteria: Record<string, unknown> = {}, rows = 100): Promise<FacilityListAnswer> {
    return listFacilityRegister(this.page, criteria, rows);
  }

  async canListFacilities(): Promise<boolean> {
    return listFacilityRegister(this.page, {}, 1).then(() => true).catch(() => false);
  }

  /** Answers GetFacilities AND the dashboard with an empty register (the zero-count cases). */
  async simulateEmptyRegister(): Promise<void> {
    await NetworkUtils.emptyListEndpoint(this.page, ApiEndpoints.facilityList);
    await NetworkUtils.rewriteJsonResponse(this.page, ApiEndpoints.facilityDashboard, (body) => ({ ...(body as Record<string, unknown>), payload: { total: 0, active: 0, pending: 0, inactive: 0, expired: 0 } }));
  }

  async simulateFailure(endpoint: string): Promise<void> {
    await NetworkUtils.failEndpoint(this.page, endpoint);
  }

  async restoreEndpoints(): Promise<void> {
    await NetworkUtils.restore(this.page);
  }
}
