import type { Download, Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { ListPageBase } from '../components/ListPageBase';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ExportMenu } from '../components/ExportMenu';
import { chooseSelectOption, readSelectOptions } from '../components/PrimeControls';
import { FormularyFormDrawer } from './FormularyFormDrawer';
import { FormularyDetailPage } from './FormularyDetailPage';
import { FormularyCloneDrawer } from './FormularyCloneDrawer';
import { FormularyImportDialog } from './FormularyImportDialog';
import { FormularyDeactivateDrawer } from './FormularyDeactivateDrawer';
import { AppRoutes } from '../../constants/AppRoutes';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import { Timeouts } from '../../constants/Timeouts';
import {
  FORMULARY_CARD,
  FORMULARY_COLUMN,
  FORMULARY_DEACTIVATE,
  FORMULARY_EXPORT,
  FORMULARY_FILTER_FIELD,
  FORMULARY_IMPORT,
  FORMULARY_LIST,
  FORMULARY_ROW_ACTION,
  FORMULARY_SORT_FIELD,
  GLOBAL,
  TOAST,
  buttonSelector,
  type FormularyCardAction,
  type FormularyColumn,
  type FormularyFilterField,
  type FormularyKpiKey,
  type FormularyRowAction,
  type FormularySortField,
} from '../../constants/ElementIds';
import { NetworkUtils } from '../../utils/NetworkUtils';
import { WaitUtils } from '../../utils/WaitUtils';
import { Logger } from '../../utils/Logger';
import { parseCsv } from '../../utils/CsvUtils';
import { parseXlsx, type ParsedXlsx } from '../../utils/XlsxUtils';
import {
  listFormularyRegister,
  readFormularyDashboard,
  type FormularyDashboard,
  type FormularyListItem,
} from '../../utils/FormularyProvisioning';

/** How a control is offered: not rendered, rendered but disabled, or usable. */
export type Availability = 'absent' | 'disabled' | 'available';

/** One action control as the screen renders it. */
export interface ActionState {
  availability: Availability;
  /** Its visible label, '' when absent. */
  label: string;
  /** Its tooltip - where the screen explains a disabled control. */
  title: string;
}

/** One list row, by column. */
export type FormularyRowValues = Record<FormularyColumn, string>;

/** One card of the Cards view. */
export interface FormularyCardValues {
  title: string;
  versionStatus: string;
  code: string;
  tiers: string;
  trades: string;
  effectiveDate: string;
  expiryDate: string;
  status: string;
}

/** What one list request answered. */
export interface FormularyListAnswer {
  items: FormularyListItem[];
  totalRows: number;
}

/** The advanced-search criteria; the selects take the option label ("Active", "Pending Approval"). */
export type FormularyCriteria = Partial<Record<FormularyFilterField, string>>;

const exactText = (text: string): RegExp => new RegExp(`^\\s*${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`);

/**
 * The Formulary Management list (`/formulary-pricing`), verified live 2026-11-02.
 *
 * The shared list component (ListPageBase): KPI tiles, search box, quick status
 * filter, Sort By, Export (template / selected / all), Import, Add Formulary,
 * the advanced-search drawer, the table (`formulary-list-table-row-{id}`) and
 * the Cards view ("Load More Formularies"). The administrator meets no payer
 * gate here ("All Payers" in the top bar). Row actions are offered by state:
 * a v0 draft shows View / Clone / Send for Approval / Deactivate / Delete.
 *
 * Every list read waits for ITS OWN GetFormularies answer (the search text or
 * sort in the request body): rows on screen from the previous query count as
 * "rendered" and were read by mistake in the terminology suite.
 */
export class FormularyManagementPage extends ListPageBase {
  constructor(page: Page) {
    super(page, FORMULARY_LIST.screen);
  }

  /** Opens the list in Table view and waits for its rows. */
  async open(): Promise<void> {
    await this.goto(AppRoutes.formularyManagement);
    await this.ensureTableView(this.screen);
    await this.waitForRowsRendered();
  }

  /** Navigates WITHOUT expecting the list - for the denied-access cases. */
  async openExpectingDenial(): Promise<void> {
    await this.goto(AppRoutes.formularyManagement);
  }

  /** Whether the list table rendered for this session. */
  async isListRendered(): Promise<boolean> {
    return this.table().waitFor({ state: 'visible', timeout: Timeouts.default }).then(() => true).catch(() => false);
  }

  /** The empty state: the shared table's `-table-empty` cell ("No results found." / "No formularies ..."). */
  protected emptyState(): Locator {
    return this.byId(`${this.screen}-table-empty`);
  }

  async getEmptyStateText(): Promise<string> {
    return (await this.emptyState().innerText({ timeout: Timeouts.short }).catch(() => '')).trim();
  }

  /** The main area's text - for denied / empty states. */
  async getPageText(): Promise<string> {
    return (await this.page.locator('main').first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  /** A row by the formulary's NAME, matched exactly in its name cell. */
  protected rowByText(text: string): Locator {
    return this.rows().filter({
      has: this.page.locator(`[id$="-cell-${FORMULARY_COLUMN.name}"]`, { hasText: exactText(text) }),
    }).first();
  }

  // ---- list requests -------------------------------------------------------------

  /** Runs `action` and returns what the GetFormularies request it triggered answered. */
  async captureList(action: () => Promise<void>): Promise<FormularyListAnswer> {
    const body = await NetworkUtils.captureJsonResponseMatching<{ payload: { formularies: FormularyListAnswer } }>(
      this.page,
      /\/GetFormularies$/,
      action,
    );
    await this.waitForRowsRendered();
    return body?.payload.formularies ?? { items: [], totalRows: -1 };
  }

  /** Runs `action` and returns the BODY of the GetFormularies request it sent. */
  async captureListRequest(action: () => Promise<void>): Promise<Record<string, unknown>> {
    const waiting = this.page.waitForRequest((r) => /\/GetFormularies$/.test(r.url()), { timeout: Timeouts.default }).catch(() => null);
    await action();
    const request = await waiting;
    await this.waitForRowsRendered();
    return (request?.postDataJSON() as Record<string, unknown> | null) ?? {};
  }

  /**
   * Types a search and presses Enter, waiting for the answer to THIS search
   * (its `searchText` in the request body). The same term twice sends nothing,
   * so the box is cleared first when it already holds it.
   */
  async search(term: string): Promise<void> {
    Logger.step(`Searching formularies for "${term}"`);
    if (!(await this.searchInput().isVisible())) await this.open();
    const tableToggle = this.btn(GLOBAL.viewToggleTable);
    if ((await tableToggle.getAttribute('aria-selected').catch(() => 'true')) !== 'true') await this.ensureTableView(this.screen);
    const input = this.searchInput();
    // The same term again sends no request: clear it WITH Enter first, so the
    // search below is answered afresh (a bare clear left the wait below to time out).
    if ((await input.inputValue()) === term && term !== '') {
      const cleared = this.page.waitForResponse((r) => /\/GetFormularies$/.test(r.url()), { timeout: Timeouts.short }).catch(() => null);
      await input.fill('');
      await input.press('Enter');
      await cleared;
    }
    const answered = this.page
      .waitForResponse((r) => /\/GetFormularies$/.test(r.url())
        && (term === '' || (r.request().postData() ?? '').includes(`"searchText":${JSON.stringify(term)}`)), { timeout: Timeouts.default })
      .catch(() => null);
    await input.fill(term);
    await input.press('Enter');
    await answered;
    await this.waitForPageReady();
    await this.waitForRowsRendered();
  }

  /** Searches and returns what the list answered. */
  async searchFor(term: string): Promise<FormularyListAnswer> {
    return this.captureList(() => this.search(term));
  }

  /** Searches for a formulary by its name and waits for its row - no search when the row is already on screen (call `search` for fresh data). */
  async revealRow(name: string): Promise<void> {
    if (await this.rowByText(name).isVisible().catch(() => false)) return;
    await this.search(name);
    await this.waitForRowVisible(name);
  }

  /** Whether a formulary is listed after searching for its name. */
  async isListed(name: string): Promise<boolean> {
    const searched = await this.search(name).then(() => true).catch(() => false);
    return searched && this.isRowVisible(name);
  }

  /** The names of the rows on screen. */
  async readNames(): Promise<string[]> {
    await this.waitForRowsRendered();
    return this.readColumn(FORMULARY_COLUMN.name);
  }

  /** The values of one column on screen, by key. */
  async readColumnValues(column: FormularyColumn): Promise<string[]> {
    await this.waitForRowsRendered();
    return this.readColumn(FORMULARY_COLUMN[column]);
  }

  /** One row's values by column (searches for it first). */
  async readRow(name: string): Promise<FormularyRowValues> {
    await this.revealRow(name);
    const out = {} as FormularyRowValues;
    for (const [key, column] of Object.entries(FORMULARY_COLUMN) as [FormularyColumn, string][]) {
      out[key] = await this.getCellValue(name, column);
    }
    return out;
  }

  /** The column headers, as labelled. */
  async getHeaderTexts(): Promise<string[]> {
    return (await this.page.locator(`th[id^="${this.screen}-table-th-"]`).allInnerTexts()).map((t) => t.trim()).filter((t) => t !== '');
  }

  /** Every row on screen, by column (writer A, folders 01 / 18) - read column by column, so no search is sent. */
  async readRowsOnScreen(): Promise<FormularyRowValues[]> {
    await this.waitForRowsRendered();
    const columns = {} as Record<FormularyColumn, string[]>;
    for (const [key, column] of Object.entries(FORMULARY_COLUMN) as [FormularyColumn, string][]) columns[key] = await this.readColumn(column);
    return columns.name.map((_, i) => {
      const row = {} as FormularyRowValues;
      for (const key of Object.keys(FORMULARY_COLUMN) as FormularyColumn[]) row[key] = (columns[key][i] ?? '').trim();
      return row;
    });
  }

  /** Every action of every row on screen, by formulary name (writer A, folder 01). */
  async readActionStatesOnScreen(): Promise<Record<string, Record<FormularyRowAction, ActionState>>> {
    const out: Record<string, Record<FormularyRowAction, ActionState>> = {};
    for (const name of await this.readNames()) {
      const states = {} as Record<FormularyRowAction, ActionState>;
      for (const action of Object.keys(FORMULARY_ROW_ACTION) as FormularyRowAction[]) states[action] = await this.getActionState(name, action);
      out[name] = states;
    }
    return out;
  }

  /** The whole text of one row. */
  async getRowText(name: string): Promise<string> {
    await this.revealRow(name);
    return (await this.rowByText(name).innerText()).replace(/\s+/g, ' ').trim();
  }

  /** The number of rows the current page renders. */
  async countRows(): Promise<number> {
    await this.waitForRowsRendered();
    return this.getRowCount();
  }

  // ---- KPI tiles --------------------------------------------------------------------

  /** One KPI tile's number (NaN when it does not read as a number). */
  async readKpi(kpi: FormularyKpiKey): Promise<number> {
    const text = await this.byId(`${FORMULARY_LIST.kpi[kpi]}-value`).innerText({ timeout: Timeouts.default });
    return Number(text.replace(/[^\d-]/g, '') || NaN);
  }

  /** Every KPI tile: label and value as shown. */
  async readKpis(): Promise<Record<FormularyKpiKey, { label: string; value: string }>> {
    await expect(this.byId(FORMULARY_LIST.kpiBand), 'the KPI tiles should render').toBeVisible({ timeout: Timeouts.default });
    const out = {} as Record<FormularyKpiKey, { label: string; value: string }>;
    for (const [key, id] of Object.entries(FORMULARY_LIST.kpi) as [FormularyKpiKey, string][]) {
      out[key] = {
        label: (await this.byId(`${id}-label`).innerText().catch(() => '')).trim(),
        value: (await this.byId(`${id}-value`).innerText().catch(() => '')).trim(),
      };
    }
    return out;
  }

  /** Whether the KPI band rendered for this session (writer A, folder 04). */
  async isKpiBandVisible(): Promise<boolean> {
    return this.byId(FORMULARY_LIST.kpiBand).waitFor({ state: 'visible', timeout: Timeouts.default }).then(() => true).catch(() => false);
  }

  /** Every KPI tile's number (NaN where a tile does not read as a number). */
  async readKpiNumbers(): Promise<Record<FormularyKpiKey, number>> {
    const tiles = await this.readKpis();
    const out = {} as Record<FormularyKpiKey, number>;
    for (const [key, tile] of Object.entries(tiles) as [FormularyKpiKey, { value: string }][]) {
      out[key] = Number(tile.value.replace(/[^\d-]/g, '') || NaN);
    }
    return out;
  }

  /** What GetFormulariesDashboard answers now (the tiles' source). */
  async fetchDashboard(): Promise<FormularyDashboard> {
    return readFormularyDashboard(this.page);
  }

  /** Reloads the list and returns the dashboard answer the reload fetched. */
  async reloadCapturingDashboard(): Promise<FormularyDashboard | null> {
    const body = await NetworkUtils.captureJsonResponseMatching<{ payload: FormularyDashboard }>(this.page, /\/GetFormulariesDashboard$/, () => this.reload());
    await this.waitForRowsRendered();
    return body?.payload ?? null;
  }

  // ---- quick status filter, sort, advanced search -----------------------------------

  /** The quick status filter's options ("All Statuses", "Not Live", "Pending", "Active", "Inactive", "Expired"). */
  async getStatusFilterOptions(): Promise<string[]> {
    return readSelectOptions(this.page, this.byId(FORMULARY_LIST.statusFilter));
  }

  /** Picks a status in the quick filter and returns the list it answered. */
  async filterByStatus(label: string): Promise<FormularyListAnswer> {
    Logger.step(`Filtering formularies by status "${label}"`);
    await this.ensureTableView(this.screen);
    return this.captureList(() => chooseSelectOption(this.page, this.byId(FORMULARY_LIST.statusFilter), label));
  }

  async getSortOptions(): Promise<string[]> {
    await this.btn(FORMULARY_LIST.sortTrigger).click();
    const options = (await this.page.locator(`[id^="${FORMULARY_LIST.sortOptionPrefix}"]`).allInnerTexts()).map((t) => t.trim());
    await this.page.keyboard.press('Escape');
    return options;
  }

  /** Sorts by a field and returns the list it answered. */
  async sortBy(field: FormularySortField, direction: 'asc' | 'desc'): Promise<FormularyListAnswer> {
    Logger.step(`Sorting formularies by ${field} ${direction}`);
    await this.ensureTableView(this.screen);
    await this.btn(FORMULARY_LIST.sortTrigger).click();
    return this.captureList(() =>
      this.page.locator(`#${FORMULARY_LIST.sortOptionPrefix}${FORMULARY_SORT_FIELD[field]}-${direction}`).click());
  }

  private advancedField(field: FormularyFilterField): Locator {
    return this.byId(`${FORMULARY_LIST.advancedSearch}-field-${FORMULARY_FILTER_FIELD[field]}-input`);
  }

  async openAdvancedSearch(): Promise<void> {
    await this.ensureTableView(this.screen);
    await this.btn(FORMULARY_LIST.searchFilterButton).click();
    await expect(this.byId(`${FORMULARY_LIST.advancedSearch}-title`), 'the Advanced Search drawer should open').toBeVisible({ timeout: Timeouts.default });
  }

  /** The advanced-search drawer's field labels. */
  async getAdvancedSearchLabels(): Promise<string[]> {
    await this.openAdvancedSearch();
    const labels = (await this.byId(`${FORMULARY_LIST.advancedSearch}-body`).innerText()).split('\n').map((t) => t.trim()).filter((t) => t !== '' && t !== 'Search');
    await this.btn(`${FORMULARY_LIST.advancedSearch}-cancel-button`).click();
    return labels;
  }

  /** The options of one advanced-search select (status: Not Live..Expired; approval: Draft..Approved). */
  async getAdvancedSearchOptions(field: Exclude<FormularyFilterField, 'text'>): Promise<string[]> {
    await this.openAdvancedSearch();
    const options = await readSelectOptions(this.page, this.advancedField(field));
    await this.btn(`${FORMULARY_LIST.advancedSearch}-cancel-button`).click();
    return options;
  }

  /** Applies advanced-search criteria and returns the list it answered. */
  async applyCriteria(criteria: FormularyCriteria): Promise<FormularyListAnswer> {
    Logger.step(`Formulary advanced search: ${JSON.stringify(criteria)}`);
    await this.openAdvancedSearch();
    for (const [field, value] of Object.entries(criteria) as [FormularyFilterField, string][]) {
      if (field === 'text') await this.advancedField(field).fill(value);
      else await chooseSelectOption(this.page, this.advancedField(field), value);
    }
    return this.captureList(() => this.btn(`${FORMULARY_LIST.advancedSearch}-search-button`).click());
  }

  /** The applied-filter chips. */
  async getChips(): Promise<string[]> {
    const chips = await this.byId(FORMULARY_LIST.chips).locator('[id*="-chip-"]').allInnerTexts().catch(() => [] as string[]);
    return chips.map((t) => t.trim()).filter((t) => t !== '');
  }

  // ---- row actions ---------------------------------------------------------------------

  private async actionButton(name: string, action: FormularyRowAction): Promise<Locator> {
    const id = await this.rowId(name);
    return this.page.locator(`#${id}-${FORMULARY_ROW_ACTION[action]}`).first();
  }

  /** How a row offers one action (searches for the row when it is not on screen). */
  async getActionState(name: string, action: FormularyRowAction): Promise<ActionState> {
    if (!(await this.rowByText(name).isVisible())) await this.revealRow(name);
    await this.waitForRowVisible(name);
    const [state] = await (await this.actionButton(name, action)).evaluateAll((buttons) =>
      buttons.map((b) => ({ disabled: (b as HTMLButtonElement).disabled, label: (b as HTMLElement).innerText.trim(), title: b.getAttribute('title') ?? '' })));
    if (state === undefined) return { availability: 'absent', label: '', title: '' };
    return { availability: state.disabled ? 'disabled' : 'available', label: state.label, title: state.title };
  }

  /** Every action of a row. */
  async readActionStates(name: string): Promise<Record<FormularyRowAction, ActionState>> {
    await this.revealRow(name);
    const out = {} as Record<FormularyRowAction, ActionState>;
    for (const action of Object.keys(FORMULARY_ROW_ACTION) as FormularyRowAction[]) out[action] = await this.getActionState(name, action);
    return out;
  }

  /** Clicks a row action (searching for the row first), after asserting it is usable. */
  async clickAction(name: string, action: FormularyRowAction): Promise<void> {
    Logger.step(`Clicking "${action}" for formulary "${name}"`);
    if (!(await this.rowByText(name).isVisible())) await this.revealRow(name);
    await this.waitForPageReady();
    const button = await this.actionButton(name, action);
    await expect(button, `"${name}" should offer a usable ${action} action`).toBeEnabled({ timeout: Timeouts.default });
    await button.click();
  }

  /** Opens a formulary's detail screen from its row (View). */
  async openDetails(name: string): Promise<FormularyDetailPage> {
    await this.clickAction(name, 'view');
    const detail = new FormularyDetailPage(this.page);
    await detail.waitForLoaded();
    return detail;
  }

  /** Opens the Add Formulary drawer. */
  async openAddForm(): Promise<FormularyFormDrawer> {
    await this.waitForPageReady();
    await this.clickAdd();
    const drawer = new FormularyFormDrawer(this.page);
    // A click landing while a scope change reloads the list is lost: click once more.
    const opened = await expect.poll(() => drawer.isOpen(), { timeout: Timeouts.short }).toBe(true).then(() => true).catch(() => false);
    if (!opened) await this.clickAdd();
    await drawer.waitForOpen();
    return drawer;
  }

  async isAddOffered(): Promise<boolean> {
    return this.addButton().waitFor({ state: 'visible', timeout: Timeouts.short }).then(() => true).catch(() => false);
  }

  /** Clicks Clone on a row and returns the clone drawer (the list's namespace). */
  async openCloneDrawer(name: string): Promise<FormularyCloneDrawer> {
    await this.clickAction(name, 'clone');
    const drawer = new FormularyCloneDrawer(this.page, FORMULARY_LIST.cloneDrawer);
    await drawer.waitForOpen();
    return drawer;
  }

  /** Clicks Deactivate on a row and returns the deactivation drawer (the list's namespace). */
  async openDeactivateDrawer(name: string): Promise<FormularyDeactivateDrawer> {
    await this.clickAction(name, 'deactivate');
    const drawer = new FormularyDeactivateDrawer(this.page, FORMULARY_DEACTIVATE.list);
    await drawer.waitForOpen();
    return drawer;
  }

  /** Clicks a confirmation-raising row action (Send for Approval, Activate, Delete) and returns the dialog, still open. */
  async requestAction(name: string, action: 'submit' | 'activate' | 'delete'): Promise<ConfirmDialog> {
    await this.clickAction(name, action);
    const dialog = new ConfirmDialog(this.page);
    await dialog.waitForVisible();
    return dialog;
  }

  /** Sends a row for approval through its prompt; returns the server's answer and the messages shown. */
  async sendForApproval(name: string): Promise<{ status: number; messages: string[] }> {
    const dialog = await this.requestAction(name, 'submit');
    const answer = await NetworkUtils.captureResponse(this.page, ApiEndpoints.formularySubmit, () => dialog.confirm());
    return { status: answer?.status ?? -1, messages: await this.waitForVisibleMessages() };
  }

  /** Deletes a row through its prompt(s); returns the server's answer and the messages shown. */
  async deleteFormulary(name: string): Promise<{ status: number; text: string; messages: string[] }> {
    const dialog = await this.requestAction(name, 'delete');
    const answer = await NetworkUtils.captureResponse(this.page, ApiEndpoints.formularyDelete, async () => { await dialog.confirmWithFollowUps(); });
    return { status: answer?.status ?? -1, text: answer?.text ?? '', messages: await this.waitForVisibleMessages() };
  }

  /** Toasts and inline errors on screen now (settled). */
  async waitForVisibleMessages(timeout: number = Timeouts.short): Promise<string[]> {
    return WaitUtils.settleMessages(async () => {
      const toast = await this.page.locator(`#${TOAST.summary}, #${TOAST.detail}`).allInnerTexts().catch(() => [] as string[]);
      return toast.map((t) => t.trim()).filter((t) => t !== '');
    }, timeout);
  }

  // ---- cards ---------------------------------------------------------------------------

  async switchToCards(): Promise<void> {
    await this.btn(GLOBAL.viewToggleCards).click();
    await expect(this.byId(FORMULARY_LIST.cards), 'the Cards view should render').toBeVisible({ timeout: Timeouts.default });
  }

  async switchToTable(): Promise<void> {
    await this.ensureTableView(this.screen);
  }

  private card(name: string): Locator {
    return this.page.locator(`article[id^="${FORMULARY_CARD.prefix}"]`, {
      has: this.page.locator(`[id$="-${FORMULARY_CARD.title}"]`, { hasText: exactText(name) }),
    }).first();
  }

  async getCardTitles(): Promise<string[]> {
    return (await this.page.locator(`[id^="${FORMULARY_CARD.prefix}"][id$="-${FORMULARY_CARD.title}"]`).allInnerTexts()).map((t) => t.trim());
  }

  async isCardShown(name: string): Promise<boolean> {
    return this.card(name).waitFor({ state: 'visible', timeout: Timeouts.default }).then(() => true).catch(() => false);
  }

  /** Clicks "Load More Formularies" until the card shows or there is no more to load. */
  async loadCardsUntilShown(name: string, maxLoads = 20): Promise<boolean> {
    for (let i = 0; i < maxLoads; i += 1) {
      if (await this.card(name).isVisible()) return true;
      const more = this.page.locator(`#${FORMULARY_LIST.loadMore}`);
      if (!(await more.isVisible().catch(() => false))) break;
      await more.click();
      await this.waitForPageReady();
    }
    return this.isCardShown(name);
  }

  async readCard(name: string): Promise<FormularyCardValues> {
    const card = this.card(name);
    await expect(card, `a card for "${name}"`).toBeVisible({ timeout: Timeouts.default });
    const id = (await card.getAttribute('id')) ?? '';
    const read = (suffix: string) => this.byId(`${id}-${suffix}`).innerText({ timeout: Timeouts.short }).then((t) => t.trim()).catch(() => '');
    return {
      title: await read(FORMULARY_CARD.title),
      versionStatus: await read(FORMULARY_CARD.versionStatus),
      code: await read(FORMULARY_CARD.code),
      tiers: await read(FORMULARY_CARD.tiers),
      trades: await read(FORMULARY_CARD.trades),
      effectiveDate: await read(FORMULARY_CARD.effectiveDate),
      expiryDate: await read(FORMULARY_CARD.expiryDate),
      status: await read(FORMULARY_CARD.statusBadge),
    };
  }

  async getCardActionState(name: string, action: FormularyCardAction): Promise<ActionState> {
    const card = this.card(name);
    await expect(card, `a card for "${name}"`).toBeVisible({ timeout: Timeouts.default });
    const id = (await card.getAttribute('id')) ?? '';
    const button = this.page.locator(buttonSelector(`${id}-${FORMULARY_CARD.action[action]}`)).first();
    if ((await button.count()) === 0) return { availability: 'absent', label: '', title: '' };
    return {
      availability: (await button.isEnabled()) ? 'available' : 'disabled',
      label: (await button.innerText()).trim(),
      title: (await button.getAttribute('title')) ?? '',
    };
  }

  // ---- export / import -----------------------------------------------------------------

  exportMenu(): ExportMenu {
    return new ExportMenu(this.page, FORMULARY_EXPORT);
  }

  /** The export menu's entries, by id suffix (`template`, `selected`, `all`). */
  async getExportOptions(): Promise<string[]> {
    await this.waitForPageReady();
    await this.exportMenu().open();
    const offered = await this.exportMenu().getOfferedScopes();
    await this.exportMenu().cancelMenu().catch(() => undefined);
    return offered;
  }

  /** Exports the list (all / selected) in a format and returns the file parsed, with its name. */
  async exportAndParse(scope: 'all' | 'selected', format: 'csv' | 'excel'): Promise<{ filename: string; bytes: Buffer; parsed: ParsedXlsx }> {
    await this.waitForPageReady();
    return this.exportMenu().exportAndParse(scope, format);
  }

  /**
   * Exports and reports either outcome: the file (parsed) or the messages shown
   * instead of one - for the "no records match" case, where no file and a clear
   * message is the expected answer.
   */
  async exportOrMessages(format: 'csv' | 'excel', scope: 'all' | 'selected' = 'all'): Promise<{ parsed: ParsedXlsx | null; filename: string; messages: string[] }> {
    const menu = this.exportMenu();
    await this.waitForPageReady();
    await menu.open();
    const download = this.page.waitForEvent('download', { timeout: Timeouts.default }).catch(() => null);
    await this.page.locator(`#${scope === 'all' ? FORMULARY_EXPORT.all : FORMULARY_EXPORT.selected}`).click();
    if (await new ConfirmDialog(this.page).isVisible()) await menu.clickFormat(format).catch(() => undefined);
    const file = await download;
    const messages = await this.waitForVisibleMessages();
    if (file === null) return { parsed: null, filename: '', messages };
    const bytes = await this.readDownload(file);
    const parsed = format === 'csv' ? { ...parseCsv(bytes.toString('utf8')), rightToLeft: false } : parseXlsx(bytes);
    return { parsed, filename: file.suggestedFilename(), messages };
  }

  /** Downloads the import template (Export > Export Template) and returns it parsed. */
  async exportTemplate(format: 'csv' | 'excel' = 'csv'): Promise<{ filename: string; bytes: Buffer; parsed: ParsedXlsx }> {
    const menu = this.exportMenu();
    await menu.open();
    const downloaded = this.page.waitForEvent('download', { timeout: Timeouts.queuePropagation });
    downloaded.catch(() => undefined);
    await this.page.locator(`#${FORMULARY_EXPORT.template}`).click();
    // Since 2026-11-02 the template asks for its format first ("Download
    // template: CSV (.csv) / Excel (.xlsx)"); waiting on the download alone
    // timed out behind that dialog (18631).
    if (await new ConfirmDialog(this.page).isVisible()) await menu.clickFormat(format);
    const download = await downloaded;
    const bytes = await this.readDownload(download);
    const name = download.suggestedFilename();
    const parsed = /\.csv$/i.test(name) ? { ...parseCsv(bytes.toString('utf8')), rightToLeft: false } : parseXlsx(bytes);
    return { filename: name, bytes, parsed };
  }

  private async readDownload(download: Download): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of await download.createReadStream()) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
  }

  async isExportOffered(): Promise<boolean> {
    return this.exportMenu().isAvailable();
  }

  async isImportOffered(): Promise<boolean> {
    return this.btn(FORMULARY_LIST.importTrigger).waitFor({ state: 'visible', timeout: Timeouts.short }).then(() => true).catch(() => false);
  }

  /** Opens the list's Import drawer. */
  async openImport(): Promise<FormularyImportDialog> {
    const dialog = new FormularyImportDialog(this.page, FORMULARY_IMPORT.list);
    // Left open by an earlier step (its trigger sits behind it), or closing as that
    // import completes (18676, 2026-11-03): closed first, then opened afresh.
    await dialog.closeIfOpen();
    await this.btn(FORMULARY_LIST.importTrigger).click();
    await dialog.waitForOpen();
    return dialog;
  }

  // ---- API (the same calls the screen makes) ---------------------------------------------

  /** The register as GetFormularies answers it, with any criteria. */
  async fetchRegister(criteria: Record<string, unknown> = {}, rows = 100): Promise<FormularyListAnswer> {
    return listFormularyRegister(this.page, criteria, rows);
  }

  /** Whether this session may read the formulary list at all. */
  async canListFormularies(): Promise<boolean> {
    return listFormularyRegister(this.page, {}, 1).then(() => true).catch(() => false);
  }

  /** Answers GetFormularies with an empty register until `restoreEndpoints` - the empty-state cases. */
  async simulateEmptyRegister(): Promise<void> {
    await NetworkUtils.emptyListEndpoint(this.page, ApiEndpoints.formularyList);
  }

  /** Fails one endpoint with HTTP 500 until `restoreEndpoints`. */
  async simulateFailure(endpoint: string): Promise<void> {
    await NetworkUtils.failEndpoint(this.page, endpoint);
  }

  async restoreEndpoints(): Promise<void> {
    await NetworkUtils.restore(this.page);
  }
}
