import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { ListPageBase } from '../components/ListPageBase';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { chooseSelectOption, readSelectOptions } from '../components/PrimeControls';
import { MemberFormDrawer } from './MemberFormDrawer';
import { MemberDetailPage } from './MemberDetailPage';
import { MemberDeactivateDrawer } from './MemberDeactivateDrawer';
import { MemberImportDrawer } from './MemberImportDrawer';
import { AppRoutes } from '../../constants/AppRoutes';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import { Timeouts } from '../../constants/Timeouts';
import { GLOBAL, TOAST, buttonSelector } from '../../constants/ElementIds';
import {
  MEMBER_CARD,
  MEMBER_COLUMN,
  MEMBER_EXPORT,
  MEMBER_LIST,
  MEMBER_ROW_ACTION,
  MEMBER_SORT_FIELD,
  type MemberCardAction,
  type MemberCardField,
  type MemberColumnKey,
  type MemberKpiKey,
  type MemberQuickFilter,
  type MemberRowAction,
  type MemberSortField,
} from '../../constants/member/memberIds';
import { NetworkUtils } from '../../utils/NetworkUtils';
import { WaitUtils } from '../../utils/WaitUtils';
import { Logger } from '../../utils/Logger';
import { parseCsv } from '../../utils/CsvUtils';
import { parseXlsx, type ParsedXlsx } from '../../utils/XlsxUtils';
import { listMemberRegister, memberSearchKey, readMemberDashboard, type MemberDashboard, type MemberListItem } from '../../utils/MemberProvisioning';

/** One list row, by column. */
export type MemberRowValues = Record<MemberColumnKey, string>;

/** What one GetMembers request answered. */
export interface MemberListAnswer {
  items: MemberListItem[];
  totalRows: number;
}

/** How a row / card action is offered: availability, label and tooltip. */
export interface MemberActionState {
  availability: 'absent' | 'disabled' | 'available';
  label: string;
  title: string;
}

/** What a write from the list answered (status -1 when nothing was sent) and the messages shown. */
export interface MemberWriteAnswer {
  status: number;
  text: string;
  messages: string[];
}

/** What an export produced: the request body sent, the file and its parsed rows. */
export interface MemberExportResult {
  request: Record<string, unknown>;
  filename: string;
  bytes: Buffer;
  parsed: ParsedXlsx;
}

/**
 * The Member list (`/member-management`, Feature 14375), verified live
 * 2026-11-05 (reports/member/Member-Foundation-Notes.md).
 *
 * Four KPI tiles (Total, Active, Inactive Members, Special Needs - they count
 * up from 0 and follow the breadcrumb payer select), a keyword search
 * (debounced 300 ms, `searchText`; matches first / last name, member code,
 * document ID, mobile - NOT the full name, second name, nationality, status or
 * e-mail, so rows are revealed by LAST name), a Filters button that OPENS NOTHING (no
 * advanced search on 2026-11-05), quick filters All Statuses (`isActive`) / All
 * Nationalities (`nationalityId`), Sort By (name, member ID, document ID,
 * nationality, mobile, status, created, modified), Export (Export Template,
 * Selected Export, Export All Data -> the bulk format dialog CSV / Excel),
 * Import (the shared bulk import drawer), Add New Member, the table
 * (`member-list-table-row-{id}`, 10 rows a page, pager) and a Cards view
 * ("Load More Members"). Every list read waits for ITS OWN GetMembers answer.
 */
export class MemberManagementPage extends ListPageBase {
  constructor(page: Page) {
    super(page, MEMBER_LIST.screen);
  }

  async open(): Promise<void> {
    await this.goto(AppRoutes.memberManagement);
  }

  /** Opens the list in Table view and waits for its rows AND the KPI answer (the tiles read 0 until GetMembersDashboard answers). */
  async openTable(): Promise<void> {
    const dashboard = this.page.waitForResponse((r) => /\/GetMembersDashboard$/.test(r.url()), { timeout: Timeouts.default }).catch(() => null);
    await this.open();
    await dashboard;
    await this.ensureTableView(this.screen);
    await this.waitForRowsRendered();
  }

  /** The main area's text - for denied / empty states. */
  async getPageText(): Promise<string> {
    return (await this.page.locator('main').first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim(); // locator-exception: the denied / empty states carry no id; the app's single <main> is read whole.
  }

  /** A row by the member's English display NAME, matched exactly (double spaces collapsed) in its name cell. */
  protected rowByText(text: string): Locator {
    const flat = text.replace(/\s+/g, ' ').trim();
    const exact = new RegExp(`^\\s*${flat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+')}\\s*$`);
    return this.rows().filter({ has: this.page.locator(`[id$="-cell-${MEMBER_COLUMN.name}"]`, { hasText: exact }) }).first();
  }

  /** Runs `action` and returns what the GetMembers request it triggered answered. */
  async captureList(action: () => Promise<void>): Promise<MemberListAnswer> {
    const body = await NetworkUtils.captureJsonResponseMatching<{ payload: { members: MemberListAnswer } }>(this.page, /\/GetMembers$/, action);
    await this.waitForRowsRendered().catch(() => undefined);
    return body?.payload.members ?? { items: [], totalRows: -1 };
  }

  /** Runs `action` and returns the BODY of the GetMembers request it sent. */
  async captureListRequest(action: () => Promise<void>): Promise<Record<string, unknown>> {
    const waiting = this.page.waitForRequest((r) => /\/GetMembers$/.test(r.url()), { timeout: Timeouts.default }).catch(() => null);
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
    await this.searchAnswered(term);
  }

  /**
   * The search itself; returns the GetMembers answer to THIS term (its
   * `searchText`) - never the answer to the clearing that may precede it.
   */
  private async searchAnswered(term: string): Promise<MemberListAnswer> {
    Logger.step(`Searching members for "${term}"`);
    if (!(await this.searchInput().isVisible())) await this.openTable();
    const input = this.searchInput();
    if ((await input.inputValue()) === term && term !== '') {
      const cleared = this.page.waitForResponse((r) => /\/GetMembers$/.test(r.url()), { timeout: Timeouts.short }).catch(() => null);
      await input.fill('');
      await cleared;
    }
    const answered = this.page
      .waitForResponse((r) => /\/GetMembers$/.test(r.url())
        && (term.trim() === '' ? !(r.request().postData() ?? '').includes('"searchText"') : (r.request().postData() ?? '').includes(`"searchText":${JSON.stringify(term.trim())}`)), { timeout: Timeouts.default })
      .catch(() => null);
    await input.fill(term);
    const response = await answered;
    await this.waitForPageReady();
    await this.waitForRowsRendered().catch(() => undefined);
    const body = response ? ((await response.json().catch(() => null)) as { payload?: { members?: MemberListAnswer } } | null) : null;
    return body?.payload?.members ?? { items: [], totalRows: -1 };
  }

  /** Searches and returns the list's answer to THIS term (2026-11-05: captureList kept the clearing's unfiltered answer). */
  async searchFor(term: string): Promise<MemberListAnswer> {
    return this.searchAnswered(term);
  }

  /** Searches for a member by name (its LAST name - the search does not match a full name) and waits for its row (no search when it is on screen). */
  async revealRow(name: string): Promise<void> {
    if (await this.rowByText(name).isVisible().catch(() => false)) return;
    await this.search(memberSearchKey(name));
    await this.waitForRowVisible(name);
  }

  /** Whether a search on the member's last name lists its row. */
  async isListed(name: string): Promise<boolean> {
    const searched = await this.search(memberSearchKey(name)).then(() => true).catch(() => false);
    return searched && this.isRowVisible(name);
  }

  /** The id of a member's row (the member id). */
  async memberIdOf(name: string): Promise<string> {
    await this.revealRow(name);
    return (await this.rowId(name)).replace(`${this.screen}-table-row-`, '');
  }

  async readNames(): Promise<string[]> {
    await this.waitForRowsRendered();
    return (await this.columnValues(MEMBER_COLUMN.name)).map((n) => n.replace(/\s+/g, ' ').trim());
  }

  async readColumnValues(column: MemberColumnKey): Promise<string[]> {
    await this.waitForRowsRendered();
    return this.columnValues(MEMBER_COLUMN[column]);
  }

  /** One row's values by column (searches for it first). */
  async readRow(name: string): Promise<MemberRowValues> {
    await this.revealRow(name);
    const out = {} as MemberRowValues;
    for (const [key, column] of Object.entries(MEMBER_COLUMN) as [MemberColumnKey, string][]) out[key] = (await this.getCellValue(name, column)).replace(/\s+/g, ' ').trim();
    return out;
  }

  /** Every row on screen, by column, in one pass. */
  async readRowsOnScreen(): Promise<MemberRowValues[]> {
    await this.waitForRowsRendered();
    return this.rows().evaluateAll((trs, columns) => trs.map((tr) => {
      const out: Record<string, string> = {};
      for (const [key, column] of Object.entries(columns)) {
        const cell = tr.querySelector(`[id$="-cell-${column}"]`);
        out[key] = cell ? (cell as HTMLElement).innerText.replace(/\s+/g, ' ').trim() : '';
      }
      return out;
    }), MEMBER_COLUMN as Record<string, string>) as Promise<MemberRowValues[]>;
  }

  /** The column headers as shown (Name, Member ID, Document ID, Nationality, Mobile Number, Status, Actions). */
  async getHeaderTexts(): Promise<string[]> {
    return (await this.page.locator(`th[id^="${this.screen}-table-th-"]`).allInnerTexts()).map((t) => t.trim()).filter((t) => t !== '');
  }

  async countRows(): Promise<number> {
    await this.waitForRowsRendered();
    return this.getRowCount();
  }

  /** The table's empty row ("No results found."). */
  async getEmptyStateText(): Promise<string> {
    return (await this.byId(MEMBER_LIST.tableEmpty).innerText({ timeout: Timeouts.default }).catch(() => '')).trim();
  }

  // ---- KPI tiles ----------------------------------------------------------------------

  async readKpi(kpi: MemberKpiKey): Promise<number> {
    const text = await this.settledKpiValue(MEMBER_LIST.kpi[kpi]);
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
  async readKpis(): Promise<Record<MemberKpiKey, { label: string; value: string }>> {
    await expect(this.byId(MEMBER_LIST.kpiBand), 'the KPI tiles should render').toBeVisible({ timeout: Timeouts.default });
    const out = {} as Record<MemberKpiKey, { label: string; value: string }>;
    for (const [key, id] of Object.entries(MEMBER_LIST.kpi) as [MemberKpiKey, string][]) {
      out[key] = {
        label: (await this.byId(`${id}-label`).innerText().catch(() => '')).trim(),
        value: await this.settledKpiValue(id).catch(() => ''),
      };
    }
    return out;
  }

  /** Every KPI tile label rendered, in order. */
  async readKpiLabels(): Promise<string[]> {
    return (await this.page.locator(`[id^="member-list-kpi-"][id$="-label"]`).allInnerTexts()).map((t) => t.trim());
  }

  async isKpiBandVisible(): Promise<boolean> {
    return this.byId(MEMBER_LIST.kpiBand).waitFor({ state: 'visible', timeout: Timeouts.default }).then(() => true).catch(() => false);
  }

  /** The tiles' answer through the API (`payerId` = one payer's scope; omitted = All Payers). */
  async fetchDashboard(payerId?: string): Promise<MemberDashboard> {
    return readMemberDashboard(this.page, payerId);
  }

  /** Reloads and returns the dashboard answer the reload fetched. */
  async reloadCapturingDashboard(): Promise<MemberDashboard | null> {
    const body = await NetworkUtils.captureJsonResponseMatching<{ payload: MemberDashboard }>(this.page, /\/GetMembersDashboard$/, () => this.reload());
    await this.waitForRowsRendered().catch(() => undefined);
    return body?.payload ?? null;
  }

  // ---- payer scope (breadcrumb select) ----------------------------------------------------

  /** What the breadcrumb payer select shows ("All Payers" for the administrator). */
  async readPayerScope(): Promise<string> {
    return (await this.byId(MEMBER_LIST.payerSelect).innerText().catch(() => '')).trim();
  }

  /** The payer select's options (first page; the admin sees "All Payers" + every payer). */
  async getPayerScopeOptions(): Promise<string[]> {
    return readSelectOptions(this.page, this.byId(MEMBER_LIST.payerSelect));
  }

  /**
   * Picks a payer in the breadcrumb select (by English name; "All Payers" for
   * none) and returns the list AND the tiles it re-fetched. The choice is sent
   * as the `X-Selected-Payer-Id` header on /api/Members/* calls and kept in
   * sessionStorage (`pbm.selected_payer`) - reset it to All Payers afterwards.
   */
  async selectPayerScope(payerName: string): Promise<{ list: MemberListAnswer; dashboard: MemberDashboard | null; header: string | null }> {
    Logger.step(`Member list payer scope: "${payerName}"`);
    const dashboard = NetworkUtils.captureJsonResponseMatching<{ payload: MemberDashboard }>(this.page, /\/GetMembersDashboard$/, async () => undefined).catch(() => null);
    const request = this.page.waitForRequest((r) => /\/GetMembers$/.test(r.url()), { timeout: Timeouts.default }).catch(() => null);
    const list = await this.captureList(() => chooseSelectOption(this.page, this.byId(MEMBER_LIST.payerSelect), payerName));
    const sent = await request;
    return { list, dashboard: (await dashboard)?.payload ?? null, header: sent ? (await sent.allHeaders())['x-selected-payer-id'] ?? null : null };
  }

  // ---- quick filters, chips ----------------------------------------------------------------

  /** A quick filter's options ("All Statuses", "Active", "Inactive" / "All Nationalities", "Saudi (SAU)", ...). */
  async getFilterOptions(filter: MemberQuickFilter): Promise<string[]> {
    return readSelectOptions(this.page, this.byId(MEMBER_LIST.filter[filter]));
  }

  /** Picks a quick filter's option (by label) and returns the list it answered (`isActive` / `nationalityId`). */
  async filterBy(filter: MemberQuickFilter, label: string): Promise<MemberListAnswer> {
    Logger.step(`Filtering members: ${filter} = "${label}"`);
    await this.ensureTableView(this.screen);
    return this.captureList(() => chooseSelectOption(this.page, this.byId(MEMBER_LIST.filter[filter]), label));
  }

  async readFilter(filter: MemberQuickFilter): Promise<string> {
    return (await this.byId(MEMBER_LIST.filter[filter]).innerText().catch(() => '')).trim();
  }

  /**
   * Clicks the Filters button beside the search box and reports whether an
   * advanced-search drawer opened. On 2026-11-05 it opens NOTHING (no
   * `member-list-advanced-search`): the AC's advanced search (nationality,
   * gender, status, special-needs flag) does not exist.
   */
  async openAdvancedSearch(): Promise<boolean> {
    await this.btn(MEMBER_LIST.searchFilterButton).click();
    return this.byId(MEMBER_LIST.advancedSearch).waitFor({ state: 'visible', timeout: Timeouts.short }).then(() => true).catch(() => false);
  }

  /** The applied-filter chips (search term, "Active", "Saudi (SAU)"). */
  async getChips(): Promise<string[]> {
    const chips = await this.page.locator(`[id^="${MEMBER_LIST.chips}-chip-"]:not([id$="-remove"])`).allInnerTexts().catch(() => [] as string[]);
    return chips.map((t) => t.trim()).filter((t) => t !== '');
  }

  /** Removes one chip (`search`, `status`, `nationality`) and returns the list it answered. */
  async removeChip(chip: 'search' | 'status' | 'nationality'): Promise<MemberListAnswer> {
    return this.captureList(() => this.page.locator(`#${MEMBER_LIST.chips}-chip-${chip}-remove`).click());
  }

  /** "Clear" beside the search box: clears the search and every filter; returns the list it answered. */
  async clearAllFilters(): Promise<MemberListAnswer> {
    return this.captureList(() => this.btn(MEMBER_LIST.searchClearAll).click());
  }

  // ---- sort ---------------------------------------------------------------------------

  /** The sort options as offered ("Name (A-Z)", "Name (Z-A)", "Member ID (A-Z)", ... "Last Modified (Oldest to Newest)"). */
  async getSortOptions(): Promise<string[]> {
    await this.btn(MEMBER_LIST.sortTrigger).click();
    await this.page.locator(`[id^="${MEMBER_LIST.sortOptionPrefix}"]`).first().waitFor({ state: 'visible', timeout: Timeouts.short }).catch(() => undefined);
    const options = (await this.page.locator(`[id^="${MEMBER_LIST.sortOptionPrefix}"]`).allInnerTexts()).map((t) => t.trim());
    await this.page.keyboard.press('Escape');
    return options;
  }

  /** Sorts by a field and returns the list it answered (request `sortBy` "MemberCode asc", ...). */
  async sortBy(field: MemberSortField, direction: 'asc' | 'desc'): Promise<MemberListAnswer> {
    Logger.step(`Sorting members by ${field} ${direction}`);
    await this.btn(MEMBER_LIST.sortTrigger).click();
    return this.captureList(() => this.page.locator(`#${MEMBER_LIST.sortOptionPrefix}${MEMBER_SORT_FIELD[field]}-${direction}`).click());
  }

  /** The sort option the menu marks active (aria-checked), e.g. "Created On (Newest to Oldest)". */
  async readSortLabel(): Promise<string> {
    await this.btn(MEMBER_LIST.sortTrigger).click();
    await this.page.locator(`[id^="${MEMBER_LIST.sortOptionPrefix}"]`).first().waitFor({ state: 'visible', timeout: Timeouts.short }).catch(() => undefined);
    const active = this.page.locator(`[id^="${MEMBER_LIST.sortOptionPrefix}"][aria-checked="true"]`);
    const label = (await active.count()) > 0 ? (await active.first().innerText()).replace(/\s+/g, ' ').trim() : '';
    await this.page.keyboard.press('Escape');
    return label;
  }

  // ---- pagination ------------------------------------------------------------------------

  /** Clicks a pager page and returns the list it answered. */
  async goToPage(pageNumber: number): Promise<MemberListAnswer> {
    return this.captureList(() => this.page.locator(`#${MEMBER_LIST.pager}-page-${pageNumber}`).click());
  }

  // ---- row actions --------------------------------------------------------------------

  private async memberAction(name: string, action: MemberRowAction): Promise<Locator> {
    const id = await this.rowId(name);
    return this.page.locator(`#${id}-${MEMBER_ROW_ACTION[action]}`).first();
  }

  /** How a row offers one action ('absent' | 'disabled' | 'available', label, tooltip). `toggleActive` reads "Inactivate" or "Activate". */
  async getActionState(name: string, action: MemberRowAction): Promise<MemberActionState> {
    if (!(await this.rowByText(name).isVisible())) await this.revealRow(name);
    await this.waitForRowVisible(name);
    const [state] = await (await this.memberAction(name, action)).evaluateAll((buttons) =>
      buttons.map((b) => ({ disabled: (b as HTMLButtonElement).disabled, label: (b as HTMLElement).innerText.trim(), title: b.getAttribute('title') ?? '' })));
    if (state === undefined) return { availability: 'absent', label: '', title: '' };
    return { availability: state.disabled ? 'disabled' : 'available', label: state.label, title: state.title };
  }

  async readActionStates(name: string): Promise<Record<MemberRowAction, MemberActionState>> {
    await this.revealRow(name);
    const out = {} as Record<MemberRowAction, MemberActionState>;
    for (const action of Object.keys(MEMBER_ROW_ACTION) as MemberRowAction[]) out[action] = await this.getActionState(name, action);
    return out;
  }

  /** The labels of the actions a row offers, enabled or not ("View", "Edit", "Inactivate", "Delete"). */
  async readOfferedActions(name: string): Promise<string[]> {
    const states = await this.readActionStates(name);
    return Object.values(states).filter((s) => s.availability !== 'absent').map((s) => s.label);
  }

  async clickAction(name: string, action: MemberRowAction): Promise<void> {
    Logger.step(`Clicking "${action}" for member "${name}"`);
    if (!(await this.rowByText(name).isVisible())) await this.revealRow(name);
    await this.waitForPageReady();
    const button = await this.memberAction(name, action);
    await expect(button, `"${name}" should offer a usable ${action} action`).toBeEnabled({ timeout: Timeouts.default });
    await button.click();
  }

  /** View on a row -> the view page, loaded. */
  async openDetails(name: string): Promise<MemberDetailPage> {
    await this.clickAction(name, 'view');
    const detail = new MemberDetailPage(this.page);
    await detail.waitForLoaded();
    return detail;
  }

  async isAddOffered(): Promise<boolean> {
    return this.page.locator(buttonSelector(MEMBER_LIST.addButton)).first().waitFor({ state: 'visible', timeout: Timeouts.short }).then(() => true).catch(() => false);
  }

  /** Opens the Add New Member wizard (step 1 Member Information). The add button is a p-button: the INNER button is clicked. */
  async openAddForm(): Promise<MemberFormDrawer> {
    await this.waitForPageReady();
    const add = this.page.locator(buttonSelector(MEMBER_LIST.addButton)).first();
    await add.click();
    const drawer = new MemberFormDrawer(this.page);
    if (!(await drawer.isOpen())) await add.click();
    await drawer.waitForOpen();
    return drawer;
  }

  /** Edit on a row -> the same wizard in edit mode ("Edit Member"), values loaded. */
  async openEditForm(name: string): Promise<MemberFormDrawer> {
    await this.clickAction(name, 'edit');
    const drawer = new MemberFormDrawer(this.page);
    await drawer.waitForOpen();
    await drawer.waitForLoadedValues();
    return drawer;
  }

  /** Inactivate on a row (an ACTIVE member) -> the list's Deactivate drawer (`member-deactivate-drawer`). */
  async openDeactivateDrawer(name: string): Promise<MemberDeactivateDrawer> {
    await this.clickAction(name, 'toggleActive');
    const drawer = new MemberDeactivateDrawer(this.page, 'list');
    await drawer.waitForOpen();
    return drawer;
  }

  /** Activate (an INACTIVE member's toggle) or Delete on a row -> the shared confirmation, open ("Activate Member" / the delete confirm). */
  async requestAction(name: string, action: 'toggleActive' | 'delete'): Promise<ConfirmDialog> {
    await this.clickAction(name, action);
    const dialog = new ConfirmDialog(this.page);
    await dialog.waitForVisible();
    return dialog;
  }

  /** Activate + confirm on an inactive member's row; returns SetMemberActive's answer and the toasts. */
  async activateMember(name: string): Promise<MemberWriteAnswer> {
    const dialog = await this.requestAction(name, 'toggleActive');
    const answer = await NetworkUtils.captureResponse(this.page, ApiEndpoints.memberSetActive, () => dialog.confirm());
    return { status: answer?.status ?? -1, text: answer?.text ?? '', messages: await this.waitForVisibleMessages() };
  }

  /** Delete + confirm; returns DeleteMember's answer and the toasts (refused while the member is enrolled). */
  async deleteMember(name: string): Promise<MemberWriteAnswer> {
    const dialog = await this.requestAction(name, 'delete');
    const answer = await NetworkUtils.captureResponse(this.page, ApiEndpoints.memberDelete, () => dialog.confirm());
    return { status: answer?.status ?? -1, text: answer?.text ?? '', messages: await this.waitForVisibleMessages() };
  }

  async waitForVisibleMessages(timeout: number = Timeouts.short): Promise<string[]> {
    return WaitUtils.settleMessages(async () => (await this.page.locator(`#${TOAST.summary}, #${TOAST.detail}`).allInnerTexts().catch(() => [] as string[]))
      .map((t) => t.trim()).filter((t) => t !== ''), timeout);
  }

  // ---- cards --------------------------------------------------------------------------

  async switchToCards(): Promise<void> {
    const cards = this.byId(MEMBER_LIST.cards);
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
    const flat = name.replace(/\s+/g, ' ').trim();
    const exact = new RegExp(`^\\s*${flat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+')}\\s*$`);
    return this.page.locator(`[id^="${MEMBER_CARD.prefix}"]`, { has: this.page.locator(`[id$="-${MEMBER_CARD.title}"]`, { hasText: exact }) }).first();
  }

  async isCardShown(name: string): Promise<boolean> {
    return this.card(name).waitFor({ state: 'visible', timeout: Timeouts.default }).then(() => true).catch(() => false);
  }

  /** Clicks "Load More Members" until the card shows or nothing more loads. */
  async loadCardsUntilShown(name: string, maxLoads = 20): Promise<boolean> {
    for (let i = 0; i < maxLoads; i += 1) {
      if (await this.card(name).isVisible()) return true;
      const more = this.btn(MEMBER_LIST.loadMore);
      if (!(await more.isVisible().catch(() => false))) break;
      await more.click();
      await this.waitForPageReady();
    }
    return this.isCardShown(name);
  }

  /** A card's values by field (title, documentId, dateOfBirth, identityType, nationality, email, mobile) plus its header text (code, gender, status tags). */
  async readCard(name: string): Promise<Record<MemberCardField | 'header' | 'id', string>> {
    const card = this.card(name);
    await expect(card, `a card for "${name}"`).toBeVisible({ timeout: Timeouts.default });
    const id = (await card.getAttribute('id')) ?? '';
    const out = { id: id.replace(MEMBER_CARD.prefix, '') } as Record<MemberCardField | 'header' | 'id', string>;
    for (const [key, suffix] of Object.entries(MEMBER_CARD.field) as [MemberCardField, string][]) {
      out[key] = (await this.byId(`${id}-${suffix}`).innerText({ timeout: Timeouts.short }).catch(() => '')).replace(/\s+/g, ' ').trim();
    }
    out.header = (await this.byId(`${id}-${MEMBER_CARD.header}`).innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
    return out;
  }

  /** A card's field labels as shown ("Document ID", "Date of Birth", ...). */
  async readCardLabels(name: string): Promise<string[]> {
    const card = this.card(name);
    await expect(card, `a card for "${name}"`).toBeVisible({ timeout: Timeouts.default });
    return (await card.locator('[id$="-label"]').allInnerTexts()).map((t) => t.trim());
  }

  async getCardActionState(name: string, action: MemberCardAction): Promise<MemberActionState> {
    const card = this.card(name);
    await expect(card, `a card for "${name}"`).toBeVisible({ timeout: Timeouts.default });
    const id = (await card.getAttribute('id')) ?? '';
    const button = this.page.locator(buttonSelector(`${id}-${MEMBER_CARD.action[action]}`)).first();
    if ((await button.count()) === 0) return { availability: 'absent', label: '', title: '' };
    return { availability: (await button.isEnabled()) ? 'available' : 'disabled', label: (await button.innerText()).trim(), title: (await button.getAttribute('title')) ?? '' };
  }

  async clickCardAction(name: string, action: MemberCardAction): Promise<void> {
    const card = this.card(name);
    await expect(card, `a card for "${name}"`).toBeVisible({ timeout: Timeouts.default });
    const id = (await card.getAttribute('id')) ?? '';
    await this.page.locator(buttonSelector(`${id}-${MEMBER_CARD.action[action]}`)).first().click();
  }

  /** The card's Active switch (activates directly / opens the Deactivate drawer): rendered, on, enabled. */
  async readCardSwitch(name: string): Promise<{ present: boolean; on: boolean; enabled: boolean }> {
    const card = this.card(name);
    await expect(card, `a card for "${name}"`).toBeVisible({ timeout: Timeouts.default });
    const id = (await card.getAttribute('id')) ?? '';
    const input = this.byId(`${id}-${MEMBER_CARD.activeSwitch}`);
    if ((await input.count()) === 0) return { present: false, on: false, enabled: false };
    return { present: true, on: await input.isChecked(), enabled: await input.isEnabled() };
  }

  async clickCardSwitch(name: string): Promise<void> {
    const card = this.card(name);
    const id = (await card.getAttribute('id')) ?? '';
    await this.byId(`${id}-${MEMBER_CARD.activeSwitch}`).click();
  }

  // ---- export -------------------------------------------------------------------------

  /** The Export menu's entries as offered ("Export Template", "Selected Export", "Export All Data"). */
  async getExportOptions(): Promise<string[]> {
    await this.waitForPageReady();
    await this.page.locator(buttonSelector(MEMBER_EXPORT.trigger)).first().click();
    await this.byId(MEMBER_EXPORT.menu).waitFor({ state: 'visible', timeout: Timeouts.default }).catch(() => undefined);
    const offered = (await this.page.locator(`#${MEMBER_EXPORT.menu} button[id^="${MEMBER_EXPORT.root}-"]`).allInnerTexts()).map((t) => t.trim()).filter((t) => t !== '');
    await this.page.keyboard.press('Escape');
    return offered;
  }

  async isExportOffered(): Promise<boolean> {
    return this.page.locator(buttonSelector(MEMBER_EXPORT.trigger)).first().waitFor({ state: 'visible', timeout: Timeouts.short }).then(() => true).catch(() => false);
  }

  /** Opens the menu and picks an entry, leaving the format dialog ("Export Members") open. */
  async chooseExport(entry: 'all' | 'selected' | 'template'): Promise<ConfirmDialog> {
    await this.waitForPageReady();
    await this.page.locator(buttonSelector(MEMBER_EXPORT.trigger)).first().click();
    await this.page.locator(buttonSelector(MEMBER_EXPORT[entry])).first().click();
    const dialog = new ConfirmDialog(this.page);
    await dialog.waitForVisible();
    return dialog;
  }

  /** The format dialog's choices as shown (CSV / Excel), read off its action ids. */
  async readExportFormats(): Promise<string[]> {
    return (await this.page.locator('[id^="pbm-dialog-action-"]').allInnerTexts()).map((t) => t.trim()).filter((t) => t !== '');
  }

  /**
   * Exports (All = no filters, Selected = the current search / filters; the
   * request `scope` is All / Filtered / CurrentPage) as CSV or Excel; returns
   * the ExportMembers body sent and the file, parsed.
   */
  async exportAndParse(scope: 'all' | 'selected', format: 'csv' | 'excel'): Promise<MemberExportResult> {
    const dialog = await this.chooseExport(scope);
    const request = this.page.waitForRequest((r) => r.url().includes(ApiEndpoints.memberExport), { timeout: Timeouts.default }).catch(() => null);
    const download = this.page.waitForEvent('download', { timeout: Timeouts.default });
    await dialog.clickAction(format === 'csv' ? 'csv' : 'excel');
    const file = await download;
    const sent = await request;
    const path = await file.path();
    const bytes = path ? (await import('fs')).readFileSync(path) : Buffer.alloc(0);
    const parsed: ParsedXlsx = format === 'csv' ? { ...parseCsv(bytes.toString('utf8')), rightToLeft: false } : parseXlsx(bytes);
    return { request: (sent?.postDataJSON() as Record<string, unknown> | null) ?? {}, filename: file.suggestedFilename(), bytes, parsed };
  }

  /** Export Template -> format -> the template file (Members_Template.xlsx / .csv). */
  async downloadTemplate(format: 'csv' | 'excel' = 'excel'): Promise<{ filename: string; bytes: Buffer }> {
    const dialog = await this.chooseExport('template');
    const download = this.page.waitForEvent('download', { timeout: Timeouts.default });
    await dialog.clickAction(format === 'csv' ? 'csv' : 'excel');
    const file = await download;
    const path = await file.path();
    return { filename: file.suggestedFilename(), bytes: path ? (await import('fs')).readFileSync(path) : Buffer.alloc(0) };
  }

  // ---- import -------------------------------------------------------------------------

  async isImportOffered(): Promise<boolean> {
    return this.page.locator(buttonSelector(MEMBER_LIST.importTrigger)).first().waitFor({ state: 'visible', timeout: Timeouts.short }).then(() => true).catch(() => false);
  }

  /** Import -> the shared bulk import drawer (`member-list-bulk-import`). */
  async openImport(): Promise<MemberImportDrawer> {
    await this.waitForPageReady();
    await this.page.locator(buttonSelector(MEMBER_LIST.importTrigger)).first().click();
    const drawer = new MemberImportDrawer(this.page);
    await drawer.waitForOpen();
    return drawer;
  }

  // ---- API ----------------------------------------------------------------------------

  async fetchRegister(criteria: Record<string, unknown> = {}, rows = 100): Promise<MemberListAnswer> {
    return listMemberRegister(this.page, criteria, rows);
  }

  async canListMembers(): Promise<boolean> {
    return listMemberRegister(this.page, {}, 1).then(() => true).catch(() => false);
  }

  /** Answers GetMembers AND the dashboard with an empty register (the zero-count cases). */
  async simulateEmptyRegister(): Promise<void> {
    await NetworkUtils.emptyListEndpoint(this.page, ApiEndpoints.memberList);
    await NetworkUtils.rewriteJsonResponse(this.page, ApiEndpoints.memberDashboard, (body) => ({ ...(body as Record<string, unknown>), payload: { total: 0, active: 0, inactive: 0, specialNeeds: 0 } }));
  }

  async simulateFailure(endpoint: string): Promise<void> {
    await NetworkUtils.failEndpoint(this.page, endpoint);
  }

  async restoreEndpoints(): Promise<void> {
    await NetworkUtils.restore(this.page);
  }
}
