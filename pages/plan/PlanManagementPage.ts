import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { ListPageBase } from '../components/ListPageBase';
import { PayerSelectionDropdown } from '../components/PayerSelectionDropdown';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ExportMenu } from '../components/ExportMenu';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { AdvancedSearchDrawer } from '../payer/AdvancedSearchDrawer';
import { PlanFormDialog, type PlanFieldKey, type SaveReport } from './PlanFormDialog';
import { PlanDetailPage } from './PlanDetailPage';
import { PlanInactivateDialog } from './PlanInactivateDialog';
import { AppRoutes } from '../../constants/AppRoutes';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import { Timeouts } from '../../constants/Timeouts';
import {
  CONSUMING_SCREEN,
  GLOBAL,
  PLAN_COLUMN,
  PLAN_EXPORT,
  PLAN_LIST,
  PLAN_SORT_FIELD,
  buttonSelector,
  type PlanKpiKey,
  type PlanSortColumn,
  type RowAction,
} from '../../constants/ElementIds';
import { NetworkUtils } from '../../utils/NetworkUtils';
import { Logger } from '../../utils/Logger';
import { deletePlanById, planIdByName, type PlanRecord } from '../../utils/PlanProvisioning';
import type { ParsedXlsx } from '../../utils/XlsxUtils';
import { PLAN_TYPE_LABEL_AR } from '../../data/plans/plan.data';
// plan folders 01, 09-13 (2026-10-27)
import type { ExportScope } from '../components/ExportMenu';
import { PLAN_ADVANCED_SEARCH_FIELD, TOAST, type PlanSearchField } from '../../constants/ElementIds';
import { WaitUtils } from '../../utils/WaitUtils';
import { parseCsv } from '../../utils/CsvUtils';
import { parseXlsx } from '../../utils/XlsxUtils';
import { planTypeId, readPlan, type PlanTypeCode } from '../../utils/PlanProvisioning';
// plan folders 16 / 22 / 23 (2026-10-27)
import { ApprovalManagementPage } from '../approval/ApprovalManagementPage';
// plan folders 02 / 03 / 15 / 19 (2026-10-27)
import { waitUntil } from '../../utils/FormularyProvisioning';
import { PLAN_ROW_DECISION_ACTION, type PlanRowDecisionAction } from '../../constants/ElementIds';

const LIST_URL = /\/api\/Plans\/GetPlans(\?|$)/;
const DASHBOARD_URL = /\/api\/Plans\/GetPlansDashboard/;

/** The Status quick filter's options as the Arabic interface labels them. */
const PLAN_STATUS_LABEL_AR: Record<string, string> = {
  'Not Live': 'غير منشورة',
  Pending: 'قيد الانتظار',
  Active: 'نشطة',
  Inactive: 'غير نشطة',
  Expired: 'منتهية',
};

/**
 * The Plans module (`/plans-management`).
 *
 * Grew on 2026-10-27 from a thin consumer of the shared payer dropdown into the
 * Plans list's Page Object. The screen is built on the same conventions as the
 * network list (`plan-list-*`: KPI band, Type / Status quick filters, Advanced
 * Search, filter chips, Sort By menu, Export, table / cards views), so the
 * method names follow NetworkManagementPage's and a plan case reads like its
 * network twin. Search, rows, cells, pager and status badges come from
 * ListPageBase.
 */
export class PlanManagementPage extends ListPageBase {
  constructor(page: Page) {
    super(page, CONSUMING_SCREEN.planList);
  }

  async open(): Promise<void> {
    await this.goto(AppRoutes.planManagement);
  }

  /** Opens the module and guarantees its table is on screen. */
  async openList(): Promise<void> {
    await this.open();
    await this.ensureTableView(this.screen);
    await expect(this.tableFor(this.screen)).toBeVisible({ timeout: Timeouts.default });
  }

  /** Searches from the list - re-opening it when the table is not on screen (a no-match search replaces it). */
  async search(term: string): Promise<void> {
    const onList = /\/plans-management\/?$/.test(new URL(this.page.url(), 'http://x').pathname);
    const tableShown = onList && (await this.tableFor(this.screen).isVisible().catch(() => false));
    if (!tableShown) await this.openList();
    // Only a CHANGED term is waited for: the same term again may send no
    // request at all, and search runs before every row action.
    const current = await this.searchInput().inputValue().catch(() => '');
    if (current.trim() === term.trim()) await super.search(term);
    else await this.reloadListWith(() => super.search(term));
  }

  /** The Plans list's own "filter by payer" dropdown. */
  payerFilter(): PayerSelectionDropdown {
    return new PayerSelectionDropdown(this.page, 'planListFilter');
  }

  /** The Payer field inside the Add Plan wizard. */
  payerField(): PayerSelectionDropdown {
    return new PayerSelectionDropdown(this.page, 'planForm');
  }

  /** Opens the Add Plan drawer and returns its Payer field (the cross-module payer story). */
  async openCreateFormPayerField(): Promise<PayerSelectionDropdown> {
    await this.clickAdd();
    const field = this.payerField();
    await field.expectPresent();
    return field;
  }

  dialog(): ConfirmDialog {
    return new ConfirmDialog(this.page);
  }

  languageSwitcher(): LanguageSwitcher {
    return new LanguageSwitcher(this.page);
  }

  exportMenu(): ExportMenu {
    return new ExportMenu(this.page, PLAN_EXPORT);
  }

  advancedSearch(): AdvancedSearchDrawer {
    return new AdvancedSearchDrawer(this.page, this.screen);
  }

  // ---- rows ----------------------------------------------------------------

  /**
   * Every rendered plan as (name, payer, status), read in ONE pass - the list
   * re-queries asynchronously, so separate column reads can pair a plan with
   * another row's payer (see ListPageBase.getRowPairs).
   */
  async getPlanRows(): Promise<{ name: string; payer: string; status: string }[]> {
    await this.expectRowsRendered();
    return this.rows().evaluateAll(
      (rows, keys) =>
        rows.map((row) => {
          const read = (key: string): string => {
            const cell = row.querySelector(`[id$="-cell-${key}"]`);
            return cell ? (cell as HTMLElement).innerText.trim() : '';
          };
          return { name: read(keys.name), payer: read(keys.payer), status: read(keys.status) };
        }),
      { name: PLAN_COLUMN.name, payer: PLAN_COLUMN.payer, status: PLAN_COLUMN.status },
    );
  }

  /** A plan row's cells, keyed by PLAN_COLUMN (searches first). */
  async readRow(planName: string): Promise<Record<keyof typeof PLAN_COLUMN, string>> {
    await this.search(planName);
    await this.waitForRowVisible(planName);
    const out = {} as Record<keyof typeof PLAN_COLUMN, string>;
    for (const [key, column] of Object.entries(PLAN_COLUMN) as [keyof typeof PLAN_COLUMN, string][]) {
      out[key] = (await this.getCellValue(planName, column)).replace(/\s+/g, ' ').trim();
    }
    return out;
  }

  /** The approval cell ("v1 · Approved") of a plan's row. */
  async getApprovalCell(planName: string): Promise<string> {
    return (await this.getCellValue(planName, PLAN_COLUMN.approvalStatus)).replace(/\s+/g, ' ').trim();
  }

  /** Polls (re-searching) until the approval cell matches. */
  async expectApprovalCell(planName: string, expected: RegExp): Promise<void> {
    await expect
      .poll(async () => {
        await this.search(planName);
        return this.getApprovalCell(planName).catch(() => '');
      }, { timeout: Timeouts.queuePropagation, message: `the approval cell of "${planName}" should match ${expected}` })
      .toMatch(expected);
  }

  /** The row's status badge text (searches first). */
  async readStatus(planName: string): Promise<string> {
    await this.search(planName);
    await this.waitForRowVisible(planName);
    return (await this.getStatusText(planName)).trim();
  }

  /** The plan code shown in a row (searches first). */
  async readCode(planName: string): Promise<string> {
    return (await this.readRow(planName)).code;
  }

  /** Every row action offered for a plan (absent ones left out). */
  async getOfferedRowActions(planName: string): Promise<RowAction[]> {
    await this.search(planName);
    await this.waitForRowVisible(planName);
    const all: RowAction[] = ['view', 'edit', 'clone', 'delete', 'submit-for-approval', 'inactivate', 'activate'];
    const offered: RowAction[] = [];
    for (const action of all) {
      if ((await this.getRowActionAvailability(planName, action)) !== 'absent') offered.push(action);
    }
    return offered;
  }

  /** Whether the list shows a row for the plan, after searching for it. */
  async isListed(planName: string): Promise<boolean> {
    await this.search(planName);
    return this.isRowVisible(planName);
  }

  /** The list section's text - the empty state ("No plans found") when nothing matches. */
  async getTableBodyText(): Promise<string> {
    return (await this.page.locator(`#${this.screen}`).innerText()).trim();
  }

  /** The column headers, in order. */
  async getHeaderTexts(): Promise<string[]> {
    return (await this.page.locator(`[id^="${this.screen}-table-th-"]`).allInnerTexts()).map((t) => t.trim());
  }

  // ---- KPI band --------------------------------------------------------------

  async getKpiValue(kpi: PlanKpiKey): Promise<number> {
    const value = this.page.locator(`#${PLAN_LIST.kpi[kpi]}-value`);
    await expect(value, `the ${kpi} KPI tile should render`).toBeVisible({ timeout: Timeouts.default });
    return Number((await value.innerText()).replace(/[^\d]/g, ''));
  }

  /**
   * A KPI once the tiles have stopped changing - two equal reads 1.5 s apart.
   * Right after a scope change the tiles still show the previous scope's
   * counts for a moment: 19014 read 33 against an expected 38 while the scope
   * selector was still spinning (2026-10-27).
   */
  async getSettledKpiValue(kpi: PlanKpiKey): Promise<number> {
    let last = Number.NaN;
    await expect
      .poll(async () => {
        const value = await this.getKpiValue(kpi);
        const steady = value === last;
        last = value;
        return steady;
      }, { timeout: Timeouts.default, intervals: [1_500] })
      .toBe(true)
      .catch(() => undefined);
    return last;
  }

  async readKpis(): Promise<Record<PlanKpiKey, number>> {
    // Once the Total tile has settled the band reflects the current scope.
    await this.getSettledKpiValue('total');
    const out = {} as Record<PlanKpiKey, number>;
    for (const kpi of Object.keys(PLAN_LIST.kpi) as PlanKpiKey[]) out[kpi] = await this.getKpiValue(kpi);
    return out;
  }

  async getKpiLabels(): Promise<string[]> {
    const labels: string[] = [];
    for (const kpi of Object.keys(PLAN_LIST.kpi) as PlanKpiKey[]) {
      labels.push((await this.page.locator(`#${PLAN_LIST.kpi[kpi]}-label`).innerText()).trim());
    }
    return labels;
  }

  async isKpiBandVisible(): Promise<boolean> {
    return this.page.locator(`#${PLAN_LIST.kpiBand}`).waitFor({ state: 'visible', timeout: Timeouts.short }).then(() => true).catch(() => false);
  }

  /** The dashboard counts the list fetched while opening. */
  async captureDashboardTotals(): Promise<Record<PlanKpiKey, number>> {
    const body = await NetworkUtils.captureJsonResponseMatching<{ payload: Record<PlanKpiKey, number> }>(this.page, DASHBOARD_URL, () => this.openList());
    expect(body, 'the list should have fetched GetPlansDashboard').not.toBeNull();
    return body!.payload;
  }

  // ---- list requests ---------------------------------------------------------

  /** The `totalRows` the list request fired by `action` answered. */
  async captureListTotal(action: () => Promise<void>): Promise<number> {
    const body = await NetworkUtils.captureJsonResponseMatching<{ payload?: { plans?: { totalRows?: number } } }>(this.page, LIST_URL, action);
    expect(body, 'the list should have fetched GetPlans').not.toBeNull();
    return Number(body?.payload?.plans?.totalRows ?? -1);
  }

  /** The items the list request fired by `action` answered. */
  async captureListItems(action: () => Promise<void>): Promise<Record<string, unknown>[]> {
    const body = await NetworkUtils.captureJsonResponseMatching<{ payload?: { plans?: { items?: Record<string, unknown>[] } } }>(this.page, LIST_URL, action);
    return body?.payload?.plans?.items ?? [];
  }

  /**
   * Runs an action that reloads the list, then waits until the TABLE shows what
   * the server answered - its first row carries the first plan code returned.
   * Waiting for the request alone was not enough: the full run of 2026-10-27
   * read the previous rows after every sort, page change and search (19113-19118
   * saw the old order, 19056 saw page 1 on page 2, 19126 counted the unsearched
   * list). Never fatal: an empty answer, or a view without codes, just settles.
   */
  async reloadListWith(action: () => Promise<void>): Promise<Record<string, unknown>[]> {
    const items = await this.captureListItems(action);
    const first = String(items[0]?.planCode ?? '');
    if (first) {
      await expect
        .poll(async () => (await this.readCodesOnPage().catch(() => [] as string[]))[0] ?? '', { timeout: Timeouts.default })
        .toBe(first)
        .catch(() => undefined);
    }
    await this.waitForPageReady();
    return items;
  }

  /** The request body the list sends while `action` runs. */
  async captureListRequest(action: () => Promise<void>): Promise<Record<string, unknown>> {
    const body = await NetworkUtils.captureRequestBody(this.page, LIST_URL, action);
    try {
      return body ? (JSON.parse(body) as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }

  /** Number of GetPlans requests fired while `action` runs. */
  async countListRequests(action: () => Promise<void>, settleMs = 1_500): Promise<number> {
    return NetworkUtils.countRequestsDuring(this.page, LIST_URL, action, settleMs);
  }

  /** Sends a list request as the session, for the manipulated-request cases. */
  async sendListRequest(body: Record<string, unknown>): Promise<{ status: number; text: string }> {
    return NetworkUtils.requestAsSession(this.page, 'POST', ApiEndpoints.planList, body);
  }

  // ---- quick filters ---------------------------------------------------------

  private filterSelect(which: 'type' | 'status'): Locator {
    return this.page.locator(`#${which === 'type' ? PLAN_LIST.typeFilter : PLAN_LIST.statusFilter}`);
  }

  /** Opens a quick filter and returns ITS overlay's options (via aria-controls - see NetworkManagementPage). */
  private async openFilterOverlay(which: 'type' | 'status'): Promise<Locator> {
    const select = this.filterSelect(which);
    await select.click();
    const controls = await select.getAttribute('aria-controls');
    // locator-exception: PrimeNG overlay options carry render-order ids; read by role inside the overlay the combobox controls.
    const scoped = controls ? this.page.locator(`[id="${controls}"] [role="option"]`) : null;
    const scopedShown = scoped
      ? await scoped.first().waitFor({ state: 'visible', timeout: Timeouts.short }).then(() => true).catch(() => false)
      : false;
    const options = scopedShown ? scoped! : this.page.getByRole('option').filter({ visible: true });
    await expect(options.first()).toBeVisible({ timeout: Timeouts.default });
    return options;
  }

  private async closeFilterOverlay(which: 'type' | 'status'): Promise<void> {
    await this.page.keyboard.press('Escape');
    await expect(this.filterSelect(which)).toHaveAttribute('aria-expanded', 'false', { timeout: Timeouts.short }).catch(() => undefined);
  }

  async getFilterOptions(which: 'type' | 'status'): Promise<string[]> {
    const options = await this.openFilterOverlay(which);
    const texts = (await options.allInnerTexts()).map((t) => t.trim()).filter((t) => t !== '');
    await this.closeFilterOverlay(which);
    return texts;
  }

  /** Chooses a quick-filter option (in the interface's language) and waits for the list to settle. */
  async applyQuickFilter(which: 'type' | 'status', englishOption: string): Promise<void> {
    const rtl = await this.page.evaluate(() => document.documentElement.dir === 'rtl');
    const labels = which === 'status' ? PLAN_STATUS_LABEL_AR : PLAN_TYPE_LABEL_AR;
    const option = rtl ? (labels[englishOption] ?? englishOption) : englishOption;
    Logger.step(`Filtering plans by ${which} = "${option}"`);
    const options = await this.openFilterOverlay(which);
    const target = options.filter({ hasText: new RegExp(`^\\s*${option}\\s*$`) }).first();
    await expect(target, `the ${which} filter should offer "${option}"`).toBeVisible({ timeout: Timeouts.default });
    await NetworkUtils.captureJsonResponseMatching(this.page, LIST_URL, () =>
      target.click({ timeout: Timeouts.short }).catch(() => target.dispatchEvent('click')));
    await expect(this.filterSelect(which)).toContainText(option, { timeout: Timeouts.short });
    await this.waitForPageReady();
  }

  async getQuickFilterValue(which: 'type' | 'status'): Promise<string> {
    return (await this.filterSelect(which).innerText()).trim();
  }

  /** The list request a quick filter sends. */
  async captureQuickFilterRequest(which: 'type' | 'status', option: string): Promise<Record<string, unknown>> {
    return this.captureListRequest(() => this.applyQuickFilter(which, option));
  }

  /**
   * Filters through the interface while the list's own requests are rewritten to
   * carry `value` - the manipulated-request case as the screen sees it (the field
   * is learned by diffing an unfiltered and a filtered request). Returns the
   * status the rewritten request was answered with and the screen text read
   * while the rewrite was still in place.
   */
  async applyManipulatedQuickFilter(which: 'type' | 'status', probeOption: string, value: string): Promise<{ answered: number; screen: string }> {
    const plain = await this.captureListRequest(() => this.openList());
    const filtered = await this.captureQuickFilterRequest(which, probeOption);
    const keys = Object.keys(filtered).filter((key) => JSON.stringify(filtered[key]) !== JSON.stringify(plain[key]));
    expect(keys.length, `the ${which} filter should add a field to the list request`).toBeGreaterThan(0);
    await this.openList();
    let answered = 0;
    let screen = '';
    await this.page.route(LIST_URL, async (route) => {
      const body = JSON.parse(route.request().postData() || '{}') as Record<string, unknown>;
      const response = await route.fetch({ postData: JSON.stringify({ ...body, ...Object.fromEntries(keys.map((key) => [key, value])) }) });
      answered = response.status();
      await route.fulfill({ response });
    });
    try {
      await this.applyQuickFilter(which, probeOption);
      await this.page.waitForLoadState('networkidle', { timeout: Timeouts.default }).catch(() => undefined);
      screen = await this.getTableBodyText();
    } finally {
      await this.page.unroute(LIST_URL);
    }
    Logger.info(`The manipulated plan list request was answered with ${answered}`);
    return { answered, screen };
  }

  // ---- advanced search and chips ---------------------------------------------

  async openAdvancedSearch(): Promise<AdvancedSearchDrawer> {
    await this.page.locator(buttonSelector(PLAN_LIST.advancedSearchButton)).first().click();
    const drawer = this.advancedSearch();
    await drawer.waitForOpen();
    return drawer;
  }

  /** Leaf filter chips only - the chip container's own id also contains "chip". */
  private leafChips(): Locator {
    return this.page
      .locator(`#${this.screen} [id*="chip"]:not([id$="remove"]):not([id*="clear"])`)
      .filter({ hasNot: this.page.locator('[id*="chip"]:not([id$="remove"]):not([id*="clear"])') });
  }

  async getChips(): Promise<string[]> {
    return this.leafChips().evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLElement).innerText.replace(/\s+/g, ' ').trim()).filter((text) => text !== '' && text.length < 80))
      .catch(() => [] as string[]);
  }

  async removeChip(label: string): Promise<void> {
    Logger.step(`Removing the "${label}" filter chip`);
    const chip = this.leafChips().filter({ hasText: label }).first();
    await expect(chip, `a "${label}" chip should be on screen to remove`).toBeVisible({ timeout: Timeouts.default });
    await NetworkUtils.captureJsonResponseMatching(this.page, LIST_URL, () =>
      chip.locator('button, [id$="remove"], .p-chip-remove-icon').first().click()); // locator-exception: the chip's remove icon has no id of its own
    await this.waitForPageReady();
  }

  async clearAllChips(): Promise<void> {
    const control = this.page
      .locator(`#${this.screen} [id*="chip"][id*="clear"], #${this.screen} [id$="clear-all"]`)
      .or(this.page.locator(`#${this.screen}`).getByRole('button', { name: /clear/i })) // locator-exception: the chips' clear-all control id is not confirmed; scoped to the list's id
      .first();
    await expect(control, 'the chips should offer a Clear All control').toBeVisible({ timeout: Timeouts.default });
    await NetworkUtils.captureJsonResponseMatching(this.page, LIST_URL, () => control.click());
    await this.waitForPageReady();
  }

  // ---- sort ------------------------------------------------------------------

  private async sortField(column: PlanSortColumn): Promise<string> {
    const rtl = await this.page.evaluate(() => document.documentElement.dir === 'rtl');
    return column === 'name' && rtl ? 'plannamear' : PLAN_SORT_FIELD[column];
  }

  async getSortOptions(): Promise<string[]> {
    await this.page.locator(buttonSelector(PLAN_LIST.sortTrigger)).first().click();
    const items = this.page.locator(`[id^="${PLAN_LIST.sortOptionPrefix}"]`);
    await expect(items.first()).toBeVisible({ timeout: Timeouts.default });
    const labels = (await items.allInnerTexts()).map((t) => t.trim());
    await this.page.keyboard.press('Escape');
    return labels;
  }

  async isSortMenuOpen(): Promise<boolean> {
    return this.page.locator(`#${PLAN_LIST.sortMenu}`).isVisible();
  }

  /** Sorts by a column; returns the `sortBy` the list then requested. */
  async sortBy(column: PlanSortColumn, direction: 'asc' | 'desc'): Promise<string> {
    Logger.step(`Sorting plans by ${column} ${direction}`);
    let request: Record<string, unknown> = {};
    await this.reloadListWith(async () => {
      request = await this.captureListRequest(async () => {
        await this.page.locator(buttonSelector(PLAN_LIST.sortTrigger)).first().click();
        await this.page.locator(buttonSelector(`${PLAN_LIST.sortOptionPrefix}${await this.sortField(column)}-${direction}`)).first().click();
      });
    });
    return String(request.sortBy ?? '');
  }

  /** Sorts and returns both the `sortBy` requested and the rows the server answered. */
  async sortByAndCaptureItems(column: PlanSortColumn, direction: 'asc' | 'desc'): Promise<{ sortBy: string; items: Record<string, unknown>[] }> {
    let sortBy = '';
    const items = await this.captureListItems(async () => { sortBy = await this.sortBy(column, direction); });
    return { sortBy, items };
  }

  /** The `sortBy` the list requests on a fresh load - its default order. */
  async captureDefaultSort(): Promise<string> {
    const request = await this.captureListRequest(() => this.open());
    await this.ensureTableView(this.screen);
    return String(request.sortBy ?? '');
  }

  // ---- cards view --------------------------------------------------------------

  async switchToCardsView(): Promise<void> {
    Logger.step('Switching the plan list to Cards view');
    await this.btn(GLOBAL.viewToggleCards).click();
    await expect(this.page.locator(`#${PLAN_LIST.cards}`), 'the cards view should render').toBeVisible({ timeout: Timeouts.default });
  }

  async switchToTableView(): Promise<void> {
    await this.ensureTableView(this.screen);
  }

  private cardTitles(): Locator {
    return this.page.locator(`[id^="${PLAN_LIST.cardPrefix}"][id$="-title"]`);
  }

  async getCardTitles(): Promise<string[]> {
    return (await this.cardTitles().allInnerTexts()).map((t) => t.trim());
  }

  /** The cards view's Load More control (its id is not confirmed - matched within the cards container, or by label). */
  private loadMoreButton(): Locator {
    return this.page
      .locator(`#${PLAN_LIST.cards} [id$="load-more"], [id="${PLAN_LIST.cards}-load-more"]`)
      .or(this.page.getByRole('button', { name: /load more/i })) // locator-exception: the Load More control was not seen with an id
      .first();
  }

  async isLoadMoreOffered(): Promise<boolean> {
    return this.loadMoreButton().waitFor({ state: 'visible', timeout: Timeouts.short }).then(() => true).catch(() => false);
  }

  async loadMoreCards(): Promise<void> {
    await this.captureListItems(() => this.loadMoreButton().click());
    await this.waitForPageReady();
  }

  async loadMoreRapidly(times: number): Promise<number> {
    Logger.step(`Clicking Load More ${times} times in rapid succession`);
    const button = this.loadMoreButton();
    await expect(button, 'the cards view should offer Load More').toBeVisible({ timeout: Timeouts.default });
    const fired = await this.countListRequests(async () => {
      await Promise.all(Array.from({ length: times }, () => button.click({ noWaitAfter: true }).catch(() => undefined)));
    }, 3_000);
    await this.waitForPageReady();
    return fired;
  }

  // ---- export ----------------------------------------------------------------

  async exportAndParse(scope: 'all' | 'selected', format: 'csv' | 'excel'): Promise<{ filename: string; bytes: Buffer; parsed: ParsedXlsx }> {
    return this.exportMenu().exportAndParse(scope, format);
  }

  /** Every Plan Code on the current page. */
  async readCodesOnPage(): Promise<string[]> {
    return this.readColumn(PLAN_COLUMN.code);
  }

  // ---- forms and actions -------------------------------------------------------

  async isAddOffered(): Promise<boolean> {
    return this.page.locator(buttonSelector(PLAN_LIST.addButton)).first()
      .waitFor({ state: 'visible', timeout: Timeouts.short }).then(() => true).catch(() => false);
  }

  /** Opens the Add New Plan wizard. */
  async openAddForm(): Promise<PlanFormDialog> {
    Logger.step('Opening the Add New Plan wizard');
    await this.page.locator(buttonSelector(PLAN_LIST.addButton)).first().click();
    const form = new PlanFormDialog(this.page);
    await form.waitForOpen();
    return form;
  }

  /** Searches for a plan and opens its edit drawer, populated. */
  async openEditForm(planName: string): Promise<PlanFormDialog> {
    await this.search(planName);
    await this.waitForRowVisible(planName);
    await this.editRow(planName);
    const form = new PlanFormDialog(this.page);
    await form.waitForOpen();
    await form.waitForPopulated();
    return form;
  }

  /** Searches for a plan and opens its clone drawer. */
  async openCloneForm(planName: string): Promise<PlanFormDialog> {
    await this.search(planName);
    await this.waitForRowVisible(planName);
    await (await this.rowActionButton(planName, 'clone')).click();
    const form = new PlanFormDialog(this.page);
    await form.waitForOpen();
    return form;
  }

  /** Searches for a plan and opens its detail screen. */
  async openDetails(planName: string): Promise<PlanDetailPage> {
    await this.search(planName);
    await this.waitForRowVisible(planName);
    await this.viewRow(planName);
    const detail = new PlanDetailPage(this.page);
    await detail.waitForLoaded();
    return detail;
  }

  /**
   * Sends a plan's staged change for approval from its row (confirming the
   * dialog), then waits for the approval cell to move on - read at once it still
   * showed the old value (the network lesson of 17778). Not fatal: a refused
   * submission leaves it unchanged, and the case asserts the outcome itself.
   */
  async submitForApproval(planName: string): Promise<void> {
    Logger.step(`Sending "${planName}" for approval`);
    await this.search(planName);
    await this.waitForRowVisible(planName);
    const before = await this.getApprovalCell(planName);
    await this.sendRowForApproval(planName);
    await this.dialog().confirm('Send for Approval');
    await this.waitForPageReady();
    await expect
      .poll(async () => {
        await this.search(planName);
        return this.getApprovalCell(planName).catch(() => before);
      }, { timeout: Timeouts.default })
      .not.toBe(before)
      .catch(() => Logger.warn(`The approval cell of "${planName}" still reads "${before}" after sending`));
  }

  /** Opens the Inactivate drawer from a plan's row. */
  async openDeactivationDrawer(planName: string): Promise<PlanInactivateDialog> {
    await this.search(planName);
    await this.waitForRowVisible(planName);
    await this.inactivateRow(planName);
    const drawer = new PlanInactivateDialog(this.page);
    await drawer.waitForOpen();
    return drawer;
  }

  /** Opens the activation confirmation from a plan's row. */
  async openActivationPrompt(planName: string): Promise<ConfirmDialog> {
    await this.search(planName);
    await this.waitForRowVisible(planName);
    await this.activateRow(planName);
    const prompt = this.dialog();
    await prompt.waitForVisible();
    return prompt;
  }

  /**
   * Stages an activation or inactivation from the row (an inactivation with the
   * first reason offered) and reports the prompt's wording.
   */
  async stageStatusChange(planName: string, direction: 'activate' | 'inactivate', details = 'Changed by an automated plan case.'): Promise<{ title: string; explanation: string }> {
    if (direction === 'activate') {
      const prompt = await this.openActivationPrompt(planName);
      const wording = { title: await prompt.getTitle(), explanation: await prompt.getMessage() };
      await prompt.confirm('activate');
      return wording;
    }
    const drawer = await this.openDeactivationDrawer(planName);
    const wording = { title: await drawer.getTitleText(), explanation: await drawer.getExplanation() };
    await drawer.inactivateWithFirstReason(details);
    return wording;
  }

  /** Stages a status change and sends it for approval. */
  async stageAndSubmit(planName: string, direction: 'activate' | 'inactivate'): Promise<void> {
    await this.stageStatusChange(planName, direction);
    await this.openList();
    await this.submitForApproval(planName);
  }

  /** Searches for a plan and starts its deletion, returning the prompt. */
  async openDeletePrompt(planName: string): Promise<ConfirmDialog> {
    await this.search(planName);
    await this.waitForRowVisible(planName);
    await this.deleteRow(planName);
    const dialog = this.dialog();
    await dialog.waitForVisible();
    return dialog;
  }

  /** Deletes a plan through the row action, returning DeletePlan's answer. */
  async deletePlan(planName: string): Promise<{ status: number; body: unknown; text: string } | null> {
    const dialog = await this.openDeletePrompt(planName);
    const outcome = await NetworkUtils.captureResponse(this.page, ApiEndpoints.planDelete, () => dialog.confirm());
    await this.waitForPageReady();
    return outcome;
  }

  /** Discards a never-approved draft by its name (teardown). */
  async discardDraftPlan(planName: string): Promise<void> {
    const id = await planIdByName(this.page, planName).catch(() => null);
    if (id === null) return;
    Logger.step(`Discarding draft plan "${planName}"`);
    await deletePlanById(this.page, id).catch(() => undefined);
  }

  /** Whether this session reaches the list at all: the table, the KPI band, and where the browser ended up. */
  async readListAccess(): Promise<{ table: boolean; kpis: boolean; url: string }> {
    await this.goto(AppRoutes.planManagement);
    const table = await this.tableFor(this.screen).waitFor({ state: 'visible', timeout: Timeouts.default }).then(() => true).catch(() => false);
    return { table, kpis: await this.isKpiBandVisible(), url: this.page.url() };
  }

  // ---- payer scope (the payer-module stories) ----------------------------------

  /**
   * One payer's plans read with that payer IN THE TOP-BAR SCOPE (2026-10-18).
   *
   * The Plans list shows one payer at a time, and a payer with no plans renders
   * no table - so the scope is set before anything is waited for. Returns []
   * when the selector does not offer the payer or it holds no plans. For the
   * cases that need a payer with an ACTIVE, PUBLISHED plan (15616).
   */
  async plansInScopeOf(payerName: string): Promise<{ name: string; code: string; approval: string; status: string }[]> {
    await this.open();
    if (!(await this.scopeTo(payerName).catch(() => false))) return [];
    await this.waitForScopedRows(payerName);
    if ((await this.rows().count()) === 0) return [];
    return this.rows().evaluateAll(
      (rows, keys) =>
        rows.map((row) => {
          const read = (key: string): string => {
            const cell = row.querySelector(`[id$="-cell-${key}"]`);
            return cell ? (cell as HTMLElement).innerText.replace(/\s+/g, ' ').trim() : '';
          };
          return { name: read(keys.name), code: read(keys.code), approval: read(keys.approval), status: read(keys.status) };
        }),
      { name: PLAN_COLUMN.name, code: PLAN_COLUMN.code, approval: PLAN_COLUMN.approvalStatus, status: PLAN_COLUMN.status },
    );
  }

  /**
   * After a top-bar scope change: the table refetches, and the previous payer's
   * rows stay on screen until it lands - wait (bounded, never failing) until
   * every row names the scoped payer or the table empties. A list that keeps
   * other payers' rows is then read as it is, so the case reports it.
   */
  private async waitForScopedRows(payerName: string): Promise<void> {
    await this.waitForPageReady();
    const payerCells = this.rows().locator(`[id$="-cell-${PLAN_COLUMN.payer}"]`);
    await expect
      .poll(
        async () => {
          const payers = await payerCells.allInnerTexts();
          return payers.every((p) => p.replace(/\s+/g, ' ').trim() === payerName);
        },
        { timeout: Timeouts.loadingIndicator, message: `the plan list never showed only "${payerName}"'s plans` },
      )
      .toBe(true)
      .catch(() => undefined);
  }

  /** The plans belonging to one payer, with the status each displays. */
  async getPlansOfPayer(payerName: string): Promise<{ name: string; status: string }[]> {
    await this.openList();
    const rows = await this.getPlanRows();
    return rows.filter((row) => row.payer === payerName).map((row) => ({ name: row.name, status: row.status }));
  }

  // ---- plan folders 01, 09, 10, 11, 12, 13 additions (2026-10-27) ----

  /**
   * Every message the list screen shows (toasts, list-scoped errors / alerts),
   * waited for - a case asserting "the user was told" must give the screen
   * time to speak (WaitUtils.settleMessages). Mirrors PayerManagementPage's.
   */
  async waitForVisibleMessages(timeout: number = Timeouts.short): Promise<string[]> {
    return WaitUtils.settleMessages(async () => {
      const inList = await this.page
        .locator(`[id^="${this.screen}"][id$="-error"], [id^="${this.screen}"][id$="-alert"]`)
        .allInnerTexts()
        .catch(() => [] as string[]);
      const toast = await this.page.locator(`#${TOAST.summary}, #${TOAST.detail}`).allInnerTexts().catch(() => [] as string[]);
      return [...inList, ...toast].map((text) => text.trim()).filter((text) => text !== '');
    }, timeout);
  }

  /**
   * Narrows the list to one payer: with the list's own payer filter when it
   * renders, otherwise with the top-bar payer selector (the mapping folder 24
   * makes). Waits for the list to settle.
   */
  async filterByPayer(payerName: string): Promise<void> {
    Logger.step(`Filtering plans by payer "${payerName}"`);
    const own = this.payerFilter();
    const hasOwn = await own.trigger().waitFor({ state: 'visible', timeout: Timeouts.short }).then(() => true).catch(() => false);
    if (!hasOwn) {
      expect(await this.scopeTo(payerName), `the payer selector should offer "${payerName}"`).toBe(true);
      await this.ensureTableView(this.screen);
      await this.waitForScopedRows(payerName);
      return;
    }
    await own.filterBy(payerName);
    await NetworkUtils.captureJsonResponseMatching(this.page, LIST_URL, () => own.select(payerName));
    await this.waitForPageReady();
  }

  /**
   * Fills and submits the Advanced Search with the given criteria (by
   * PLAN_ADVANCED_SEARCH_FIELD key; the text criterion is typed, the others
   * chosen) and waits for the list to settle - NetworkManagementPage's twin.
   */
  async advancedSearchFor(criteria: Partial<Record<PlanSearchField, string>>): Promise<void> {
    const drawer = await this.openAdvancedSearch();
    for (const [key, value] of Object.entries(criteria) as [PlanSearchField, string][]) {
      const fieldKey = PLAN_ADVANCED_SEARCH_FIELD[key];
      if (key === 'nameOrCode') await drawer.typeText(fieldKey, value);
      else await drawer.choose(fieldKey, value);
    }
    await drawer.submit();
    await this.waitForPageReady();
  }

  /** Whether the Advanced Search entry point is offered (visible). */
  async isAdvancedSearchOffered(): Promise<boolean> {
    return this.page.locator(buttonSelector(PLAN_LIST.advancedSearchButton)).first()
      .waitFor({ state: 'visible', timeout: Timeouts.short }).then(() => true).catch(() => false);
  }

  /** Whether the Sort By trigger is offered (visible). */
  async isSortOffered(): Promise<boolean> {
    return this.page.locator(buttonSelector(PLAN_LIST.sortTrigger)).first()
      .waitFor({ state: 'visible', timeout: Timeouts.short }).then(() => true).catch(() => false);
  }

  /** The option the Sort By menu marks active (`aria-checked="true"`), '' when none is marked. */
  async getActiveSortOption(): Promise<string> {
    await this.page.locator(buttonSelector(PLAN_LIST.sortTrigger)).first().click();
    await expect(this.page.locator(`[id^="${PLAN_LIST.sortOptionPrefix}"]`).first(), 'the Sort By menu should open').toBeVisible({ timeout: Timeouts.default });
    const active = this.page.locator(`[id^="${PLAN_LIST.sortOptionPrefix}"][aria-checked="true"]`);
    const label = (await active.count()) > 0 ? (await active.first().innerText()).trim() : '';
    await this.page.keyboard.press('Escape');
    return label;
  }

  /** The plan-type lookup id of a type label ("Individual" / "Family" / "Group"). */
  async planTypeIdFor(type: string): Promise<string> {
    return planTypeId(this.page, type.toLowerCase() as PlanTypeCode);
  }

  /** The plan-type lookup as id -> English label, for reading list items' `planTypeId`. */
  async planTypeLabelsById(): Promise<Record<string, string>> {
    const res = await NetworkUtils.requestAsSession(this.page, 'GET', ApiEndpoints.planTypeLookup);
    const items = res.status < 300 ? (JSON.parse(res.text) as { payload: { id: string; englishName: string }[] }).payload : [];
    return Object.fromEntries(items.map((item) => [item.id, item.englishName]));
  }

  /** The key of every KPI tile the band renders (`plan-list-kpi-{key}-value`), in order - including any not in PLAN_LIST.kpi. */
  async getKpiTileKeys(): Promise<string[]> {
    await expect(this.page.locator(`#${PLAN_LIST.kpiBand}`), 'the KPI band should render').toBeVisible({ timeout: Timeouts.default });
    const head = 'plan-list-kpi-';
    const ids = await this.page.locator(`[id^="${head}"][id$="-value"]`)
      .evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).id));
    return ids.map((id) => id.slice(head.length, -'-value'.length));
  }

  /** The KPI band's own caption - its aria-label, title or `-title` element; '' when it carries none. */
  async getKpiBandLabel(): Promise<string> {
    const band = this.page.locator(`#${PLAN_LIST.kpiBand}`);
    await expect(band, 'the KPI band should render').toBeVisible({ timeout: Timeouts.default });
    const attribute = ((await band.getAttribute('aria-label')) ?? (await band.getAttribute('title')) ?? '').trim();
    const heading = await this.page.locator(`#${PLAN_LIST.kpiBand}-title`).innerText({ timeout: Timeouts.short }).then((t) => t.trim()).catch(() => '');
    return attribute || heading;
  }

  /** The Export trigger's label - its text, else its aria-label or title. */
  async getExportTriggerLabel(): Promise<string> {
    const trigger = this.page.locator(buttonSelector(PLAN_EXPORT.trigger)).first();
    await expect(trigger, 'the Export control should render').toBeVisible({ timeout: Timeouts.default });
    const text = (await trigger.innerText()).replace(/\s+/g, ' ').trim();
    return text || ((await trigger.getAttribute('aria-label')) ?? (await trigger.getAttribute('title')) ?? '').trim();
  }

  /**
   * A row action's label (searching first): its text, else aria-label, else
   * title, else the tooltip it raises on hover - icon-only actions carry their
   * label in one of those.
   */
  async getRowActionLabel(planName: string, action: RowAction): Promise<string> {
    await this.search(planName);
    await this.waitForRowVisible(planName);
    const button = await this.rowActionButton(planName, action);
    await expect(button, `the "${action}" action should render on "${planName}"`).toBeVisible({ timeout: Timeouts.default });
    const text = (await button.innerText()).replace(/\s+/g, ' ').trim();
    const attribute = ((await button.getAttribute('aria-label')) ?? (await button.getAttribute('title')) ?? '').trim();
    if (text || attribute) return text || attribute;
    await button.hover();
    // locator-exception: the PrimeNG tooltip is portalled to <body> with no app id; read by role while hovered.
    return this.page.getByRole('tooltip').first().innerText({ timeout: Timeouts.short }).then((t) => t.trim()).catch(() => '');
  }

  /** Whether the Table view toggle is the active view right now (its aria-selected). */
  async isTableViewActive(): Promise<boolean> {
    const toggle = this.btn(GLOBAL.viewToggleTable);
    await expect(toggle, 'the view toggle should render').toBeVisible({ timeout: Timeouts.default });
    return (await toggle.getAttribute('aria-selected')) === 'true';
  }

  /** The record ids of the rendered cards (`plan-card-{id}`), in order. */
  async getCardIds(): Promise<string[]> {
    const ids = await this.page.locator(`[id^="${PLAN_LIST.cardPrefix}"][id$="-title"]`)
      .evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).id));
    return ids.map((id) => id.slice(PLAN_LIST.cardPrefix.length, -'-title'.length));
  }

  /** The status each rendered card shows, in order. */
  async getCardStatuses(): Promise<string[]> {
    // Not "-version-status" ("v1 · Draft"), which also ends in "-status" and
    // made every filtered card look out of the filter (19059, 19062, 2026-10-28).
    return (await this.page.locator(`[id^="${PLAN_LIST.cardPrefix}"][id$="-status"]:not([id$="-version-status"])`).allInnerTexts()).map((t) => t.trim());
  }

  /** Whether Load More is on screen AND enabled. */
  async isLoadMoreEnabled(): Promise<boolean> {
    return (await this.isLoadMoreOffered()) && (await this.loadMoreButton().isEnabled());
  }

  /** Goes to a numbered page of the table pager. */
  async goToPage(pageNumber: number): Promise<void> {
    await this.reloadListWith(() => this.pageButton(pageNumber).click());
  }

  // Next / Previous wait for the new rows too: the re-run of 2026-10-28 read
  // page 1's rows on page 2 (19056, 19059, 19065) because only goToPage did.
  async goToNextPage(): Promise<void> {
    await this.reloadListWith(() => super.goToNextPage());
  }

  async goToPreviousPage(): Promise<void> {
    await this.reloadListWith(() => super.goToPreviousPage());
  }

  /**
   * Runs `action` with the list's responses held back for `holdMs`, and
   * answers whether a loading indicator (a progressbar, or a `plan-list*-loading`
   * element) showed meanwhile - the "spinner during load" criterion.
   */
  async observeLoadingDuring(action: () => Promise<void>, holdMs = 1_500): Promise<boolean> {
    await this.page.route(LIST_URL, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, holdMs));
      await route.continue().catch(() => undefined);
    });
    const indicator = this.page.getByRole('progressbar')
      .or(this.page.locator(`[id^="${this.screen}"][id$="-loading"]`))
      .filter({ visible: true })
      .first();
    const seen = indicator.waitFor({ state: 'visible', timeout: holdMs + Timeouts.short }).then(() => true).catch(() => false);
    try {
      await action();
    } finally {
      await this.page.unroute(LIST_URL);
    }
    return seen;
  }

  /** The name a plan's row DISPLAYS, found by its plan code (so a blank or fallback name can be read). */
  async readDisplayedName(planId: string): Promise<string> {
    const record = await readPlan(this.page, planId);
    await this.search(String(record.planCode ?? record.planNameEn));
    return (await this.getCellValueById(planId, PLAN_COLUMN.name)).replace(/\s+/g, ' ').trim();
  }

  /**
   * Tries one export and reports what came of it: the parsed file when one
   * downloaded within the window (null otherwise) and the messages shown -
   * for the cases where a refusal or a no-data message is an acceptable answer.
   */
  async attemptExport(scope: ExportScope, format: 'csv' | 'excel'): Promise<{ filename: string; parsed: ParsedXlsx | null; messages: string[] }> {
    const menu = this.exportMenu();
    await menu.open();
    await menu.chooseScope(scope);
    const waiting = this.page.waitForEvent('download', { timeout: Timeouts.default }).catch(() => null);
    await menu.clickFormat(format);
    const download = await waiting;
    const messages = await this.waitForVisibleMessages();
    if (!download) return { filename: '', parsed: null, messages };
    const chunks: Buffer[] = [];
    for await (const chunk of await download.createReadStream()) chunks.push(Buffer.from(chunk));
    const bytes = Buffer.concat(chunks);
    const parsed: ParsedXlsx = format === 'csv' ? { ...parseCsv(bytes.toString('utf8')), rightToLeft: false } : parseXlsx(bytes);
    return { filename: download.suggestedFilename(), parsed, messages };
  }

  /** Whether a script set `window[name]` - the script-injection probe of the search cases. */
  async hasWindowFlag(name: string): Promise<boolean> {
    return this.page.evaluate((flag) => Boolean((window as unknown as Record<string, unknown>)[flag]), name);
  }

  // ---- plan folder 24 additions (2026-10-27) ----

  /**
   * The top-bar payer scope selector, read as a dropdown. For a payer-scoped
   * user it is the module's "Payer filter" (US 14335) - the same mapping the
   * network directory's owning-payer story makes (US 14302). Its "All Payers"
   * entry, when offered, is dropped by PayerSelectionDropdown.getPayerOptions.
   */
  scopeSelector(): PayerSelectionDropdown {
    return new PayerSelectionDropdown(this.page, 'topBarScope');
  }

  /** Whether the top-bar payer selector (the Payer filter) is on screen. */
  async isPayerScopeSelectorShown(): Promise<boolean> {
    return this.scopeSelector().trigger()
      .waitFor({ state: 'visible', timeout: Timeouts.short })
      .then(() => true)
      .catch(() => false);
  }

  /** The payer the top-bar selector currently shows. */
  async getScopedPayer(): Promise<string> {
    return (await this.scopeSelector().trigger().innerText()).replace(/\s+/g, ' ').trim();
  }

  /** The payers the top-bar selector offers (opened and closed again), "All Payers" left out. */
  async getScopeOptions(): Promise<string[]> {
    const selector = this.scopeSelector();
    await selector.open();
    const options = await selector.getPayerOptions();
    await selector.close();
    return options;
  }

  /**
   * Opens the list with `payerName` in the top-bar scope (when the selector
   * offers it) and guarantees the table is on screen. Answers whether the scope
   * was switched - false when the selector does not offer the payer.
   */
  async openListFor(payerName: string): Promise<boolean> {
    await this.open();
    const scoped = await this.scopeTo(payerName).catch(() => false);
    await this.ensureTableView(this.screen);
    await expect(this.tableFor(this.screen), `the plan list should render with "${payerName}" in scope`).toBeVisible({ timeout: Timeouts.default });
    return scoped;
  }

  // ---- plan folder 16 / 22 / 23 additions (2026-10-27) ----

  /**
   * 'absent' | 'disabled' | 'available' for one of the approval-decision row
   * actions US 14168 asks for (Approve / Reject / Recall) - not RowActions, so
   * read by the `{rowId}-{action}` convention (ids inferred, see
   * PLAN_ROW_DECISION_ACTION). Searches first.
   */
  async getDecisionActionAvailability(planName: string, action: PlanRowDecisionAction): Promise<'absent' | 'disabled' | 'available'> {
    await this.search(planName);
    await this.waitForRowVisible(planName);
    const id = await this.getRowId(planName);
    const button = this.page.locator(buttonSelector(`${id}-${PLAN_ROW_DECISION_ACTION[action]}`)).first();
    if ((await button.count()) === 0) return 'absent';
    return (await button.isEnabled()) ? 'available' : 'disabled';
  }

  /**
   * Activates from the row (confirmation prompt) and reports what SetPlanActive
   * answered and the toast shown - for the eligibility cases, whose subject is
   * the refusal. Leaves no prompt open.
   */
  async attemptRowActivation(planName: string): Promise<{ status: number; text: string; toast: string }> {
    return this.confirmActivationAndCapture(await this.openActivationPrompt(planName));
  }

  /** Confirms an open activation prompt (from openActivationPrompt) and reports SetPlanActive's answer and the toast. */
  async confirmActivationAndCapture(prompt: ConfirmDialog): Promise<{ status: number; text: string; toast: string }> {
    const outcome = await NetworkUtils.captureResponse(this.page, ApiEndpoints.planSetActive, () => prompt.confirm('activate'));
    const toast = await this.page.locator(`#${TOAST.summary}, #${TOAST.detail}`).allInnerTexts()
      .then((t) => t.map((x) => x.trim()).filter((x) => x !== '').join(' '))
      .catch(() => '');
    await prompt.cancel().catch(() => undefined);
    await this.waitForPageReady();
    return { status: outcome?.status ?? 0, text: outcome?.text ?? '', toast };
  }

  /**
   * Takes a plan's staged change live: sends it for approval when the row still
   * offers Send for Approval (a staged draft), then approves it on the Plan tab
   * of the approvals hub and re-opens the list in the plan's payer scope.
   */
  async publishStagedChange(planName: string, payerName?: string): Promise<void> {
    await this.sendStagedChangeIfDraft(planName, payerName);
    const approvals = new ApprovalManagementPage(this.page, 'plan');
    await approvals.open();
    await approvals.approve(planName);
    await this.reopenFor(payerName);
  }

  /** The rejecting counterpart of publishStagedChange. */
  async rejectStagedChange(planName: string, payerName?: string): Promise<void> {
    await this.sendStagedChangeIfDraft(planName, payerName);
    const approvals = new ApprovalManagementPage(this.page, 'plan');
    await approvals.open();
    await approvals.reject(planName);
    await this.reopenFor(payerName);
  }

  /** Sends a staged draft for approval - a no-op when it is already pending. */
  async sendStagedChangeIfDraft(planName: string, payerName?: string): Promise<void> {
    await this.reopenFor(payerName);
    await this.search(planName);
    await this.waitForRowVisible(planName);
    if ((await this.getRowActionAvailability(planName, 'submit-for-approval')) === 'available') {
      await this.submitForApproval(planName);
    }
  }

  private async reopenFor(payerName?: string): Promise<void> {
    if (payerName) await this.openListFor(payerName);
    else await this.openList();
  }

  // ---- plan folder 17 / 18 / 25 / 26 / 28 additions (2026-10-27) ----

  /** A plan as GetPlan answers it (code, formulary, statuses, pending flags) - the network list's readNetworkRecord. */
  async readPlanRecord(planId: string): Promise<PlanRecord> {
    return readPlan(this.page, planId);
  }

  /**
   * Opens a plan's Edit drawer from its row, changes one field and saves,
   * reporting what UpdatePlan answered and every message shown. A live plan's
   * "revert to draft" confirmation is answered (PlanFormDialog.saveEditAndReport).
   * Never asserts the save went through - the withdraw-on-edit cases assert the
   * outcome themselves. The network list's stageEdit, for plans.
   */
  async stageEdit(planName: string, field: PlanFieldKey, value: string): Promise<SaveReport> {
    Logger.step(`Editing "${planName}": ${field} -> "${value.slice(0, 40)}"`);
    const form = await this.openEditForm(planName);
    await form.editField(field, value);
    return form.saveEditAndReport();
  }

  /** Sends a plan for approval DIRECTLY (SubmitPlanForApproval as this session) - the "second submission" probes. */
  async submitViaApi(planId: string): Promise<{ status: number; text: string }> {
    return NetworkUtils.postAsSession(this.page, ApiEndpoints.planSubmit, { planId });
  }

  /**
   * Tries to START A NEW CHANGE on a published plan from its row and reports
   * the outcome instead of insisting it worked.
   *
   * A published plan offers no Edit (live fact, 2026-10-27), so the one change
   * the screens let a user begin on it is a staged inactivation: the drawer is
   * opened, the first reason chosen, details typed and confirmed, and
   * InactivatePlan's answer captured. `offered` says whether the row offered
   * the action at all - 'absent' / 'disabled' is itself a way of blocking the
   * change, and is reported (with no request sent) rather than thrown. Every
   * message shown is returned, so a case can look for "a change is already
   * awaiting approval" (MSG-PLN-040). A drawer left open by a refusal is closed.
   */
  async attemptNewChange(
    planName: string,
    details = 'A further change started by an automated plan case.',
  ): Promise<{ offered: 'absent' | 'disabled' | 'available'; status: number; text: string; messages: string[] }> {
    Logger.step(`Trying to start a new change on "${planName}"`);
    await this.search(planName);
    await this.waitForRowVisible(planName);
    const offered = await this.getRowActionAvailability(planName, 'inactivate');
    if (offered !== 'available') return { offered, status: 0, text: '', messages: [] };
    const drawer = await this.openDeactivationDrawer(planName);
    await drawer.selectFirstReason();
    await drawer.fillDetails(details);
    let toast = '';
    const outcome = await NetworkUtils.captureResponse(this.page, ApiEndpoints.planInactivate, async () => {
      toast = (await drawer.attemptConfirm()).toast;
    });
    const messages = [toast, ...(await new PlanDetailPage(this.page).readMessages())].map((m) => m.trim()).filter((m) => m !== '');
    if (await drawer.isOpen()) await drawer.cancel().catch(() => undefined);
    // On a Pending plan the drawer can stay open with no Cancel to click; it then
    // covered the next row's buttons (19350, both re-runs of 2026-10-28).
    if (await drawer.isOpen()) await this.page.keyboard.press('Escape');
    if (await drawer.isOpen()) {
      await this.page.reload();
      await this.waitForPageReady();
    }
    // A refused change can leave its own prompt ("Return this plan to draft?")
    // over the list; its mask then swallowed the next row click (19350, 2026-10-28).
    const prompt = this.dialog();
    if (await prompt.isVisible().catch(() => false)) {
      messages.push(`${await prompt.getTitle().catch(() => '')} ${await prompt.getMessage().catch(() => '')}`.trim());
      await prompt.cancel().catch(() => undefined);
    }
    await this.waitForPageReady();
    return { offered, status: outcome?.status ?? 0, text: outcome?.text ?? '', messages };
  }

  // ---- plan folder 02 / 03 / 15 / 19 additions (2026-10-27) ----

  /** The Add / Edit drawer as it stands on this page, without opening anything. */
  editForm(): PlanFormDialog {
    return new PlanFormDialog(this.page);
  }

  /**
   * Closes any open drawer (discarding) and opens the plan's edit drawer afresh
   * - a user's "reload" after a conflict. Re-opens the list in `payerName`'s
   * scope when given. The network list's reopenEditForm, for plans.
   */
  async reopenEditForm(planName: string, payerName?: string): Promise<PlanFormDialog> {
    const open = this.editForm();
    if (await open.isOpen()) await open.closeAndDiscard();
    await this.reopenFor(payerName);
    return this.openEditForm(planName);
  }

  /**
   * The UpdatePlan body as the edit drawer sends it - INFERRED 2026-10-27 from
   * GetPlan's field names and the network drawer's own PUT (the same
   * `concurrencyStamp` / `confirmRevertToDraft` pair), not yet captured live.
   * `stamp` undefined = the field is OMITTED, null / '' = sent empty.
   */
  private planUpdateBody(record: PlanRecord, patch: Partial<PlanRecord>, stamp: string | null | undefined): Record<string, unknown> {
    const merged = { ...record, ...patch };
    return {
      id: record.id,
      planNameEn: merged.planNameEn,
      planNameAr: merged.planNameAr,
      payerId: merged.payerId,
      planTypeId: merged.planTypeId,
      descriptionEn: merged.descriptionEn,
      descriptionAr: merged.descriptionAr,
      effectiveDate: merged.effectiveDate,
      expiryDate: merged.expiryDate,
      ...(stamp === undefined ? {} : { concurrencyStamp: stamp }),
      confirmRevertToDraft: false,
    };
  }

  /**
   * Sends UpdatePlan DIRECTLY with a stamp of the caller's choosing - "another
   * user already saved" preconditions and the missing / tampered stamp cases.
   * `record` is the plan as it was read, `patch` the fields to change.
   */
  async updateWithStamp(
    record: PlanRecord,
    patch: Partial<PlanRecord>,
    stamp: string | null | undefined,
  ): Promise<{ status: number; text: string; validationErrors: string[] }> {
    Logger.step(`PUT UpdatePlan for "${record.planNameEn}" with stamp ${stamp === undefined ? '(omitted)' : `"${stamp}"`}`);
    return NetworkUtils.requestAsSession(this.page, 'PUT', ApiEndpoints.planUpdate, this.planUpdateBody(record, patch, stamp));
  }

  /**
   * Tries Send for Approval from a plan's row and reports the outcome instead
   * of insisting it worked: whether the row offered the action at all
   * ('absent' / 'disabled' is itself a refusal, reported with no request
   * sent), what SubmitPlanForApproval answered and every message shown
   * (toasts, list errors, the dialog's own text). Leaves no dialog open.
   */
  async attemptSubmit(planName: string): Promise<{ offered: 'absent' | 'disabled' | 'available'; status: number; text: string; messages: string[] }> {
    Logger.step(`Trying to send "${planName}" for approval`);
    await this.search(planName);
    await this.waitForRowVisible(planName);
    const offered = await this.getRowActionAvailability(planName, 'submit-for-approval');
    if (offered !== 'available') return { offered, status: 0, text: '', messages: [] };
    await this.sendRowForApproval(planName);
    const dialog = this.dialog();
    const outcome = await NetworkUtils.captureResponse(this.page, ApiEndpoints.planSubmit, () =>
      dialog.confirm('Send for Approval').catch(() => undefined));
    const messages = await this.waitForVisibleMessages();
    const stillOpen = await dialog.isVisible();
    const dialogText = stillOpen ? await dialog.getMessage().catch(() => '') : '';
    if (stillOpen) await dialog.cancel().catch(() => undefined);
    await this.waitForPageReady();
    return { offered, status: outcome?.status ?? 0, text: outcome?.text ?? '', messages: [...messages, dialogText].filter((m) => m !== '') };
  }

  /**
   * Assigns a formulary on the plan's detail screen (Formulary Assignment tab),
   * returning what AssignFormularyToPlan answered - the step a plan created
   * through the form needs before it can be approved (409 otherwise).
   */
  async assignFormularyThroughDetail(planName: string, codeOrName: string): Promise<{ status: number; body: unknown; text: string } | null> {
    const detail = await this.openDetails(planName);
    const tab = detail.formulary();
    await tab.open();
    return tab.assign(codeOrName);
  }

  /**
   * Approves the pending request of ONE plan by request id, through the API -
   * for the cases where two plans pending approval share a name, so the
   * name-addressed queue row (ApprovalManagementPage.approve) is ambiguous.
   * The request is told apart by carrying the plan's id, code or a version id
   * GetPlan reports; with a single pending request under the name, that one is
   * taken. Returns what ApproveRequest answered (never asserted - a refusal at
   * approval is a subject of the uniqueness cases).
   */
  async approveRequestOfPlan(planId: string, planName: string): Promise<{ status: number; text: string }> {
    const record = await readPlan(this.page, planId);
    const markers = [
      planId,
      String(record.planCode ?? ''),
      ...Object.entries(record).filter(([key, value]) => /versionid$/i.test(key) && typeof value === 'string').map(([, value]) => String(value)),
    ].filter((marker) => marker !== '');
    const candidates: Record<string, unknown>[] = [];
    for (let pageNumber = 1; pageNumber <= 10; pageNumber += 1) {
      const res = await NetworkUtils.postAsSession(this.page, ApiEndpoints.approvalList, { pageNumber, rowsPerPage: 200 });
      const body = JSON.parse(res.text) as { payload?: Record<string, { items?: Record<string, unknown>[] }> };
      const rows = Object.values(body.payload ?? {}).find((value) => Array.isArray(value?.items))?.items ?? [];
      candidates.push(...rows.filter((row) => String(row.entityNameEn ?? '') === planName && String(row.status) === 'Pending'));
      if (rows.length < 200) break;
    }
    const matching = candidates.filter((row) => markers.some((marker) => JSON.stringify(row).includes(marker)));
    const chosen = matching.length === 1 ? matching[0] : candidates.length === 1 ? candidates[0] : undefined;
    expect(
      chosen,
      `exactly one pending request should be told apart as plan ${planId}'s: ${candidates.length} pending under "${planName}", `
        + `${matching.length} carrying its id / code / version id`,
    ).toBeDefined();
    Logger.step(`Approving the request of plan ${planId} ("${planName}") through the API`);
    return NetworkUtils.postAsSession(this.page, ApiEndpoints.approvalApprove, { id: String(chosen!.id) });
  }

  /** Waits until the plan's stored effective date-time has passed - a draft whose untouched effective date is now in the past. */
  async waitForEffectiveToPass(planId: string): Promise<void> {
    const record = await readPlan(this.page, planId);
    await waitUntil(this.page, String(record.effectiveDate));
  }

  /**
   * 'absent' | 'disabled' | 'available' for a row action, searching first -
   * 'absent' too when this session's list does not show the plan at all, the
   * "access is denied" half of the permission cases (a role may not see
   * another user's draft).
   */
  async getActionAvailabilityIfListed(planName: string, action: RowAction): Promise<'absent' | 'disabled' | 'available'> {
    if (!(await this.isListed(planName))) return 'absent';
    return this.getRowActionAvailability(planName, action);
  }

  /** Opens the Add drawer ('create') or the plan's Edit drawer ('edit') - the guard's form-mode table. */
  async openPlanForm(mode: 'create' | 'edit', planName: string): Promise<PlanFormDialog> {
    return mode === 'create' ? this.openAddForm() : this.openEditForm(planName);
  }

  /**
   * Pushes a filled Add Plan form through every stage until one refuses it:
   * save the draft -> assign `formularyCode` and Send for Approval (from the
   * detail screen, by id) -> approve its request (by id, once its effective
   * time has passed). Reports the FIRST stage that refused ('draft' / 'submit' /
   * 'approval', null when none did) with that stage's answer and messages -
   * for "blocked at the earliest validation stage" (US 14325). Never asserts;
   * `outcome` is the create answer, for cleanup.
   */
  async attemptAllStages(
    form: PlanFormDialog,
    planName: string,
    formularyCode: string,
  ): Promise<{ refusedAt: 'draft' | 'submit' | 'approval' | null; text: string; planId: string; outcome: SaveReport['outcome'] }> {
    const saved = await form.saveNewAndReport();
    const planId = form.createdId(saved.outcome);
    if (saved.refused) return { refusedAt: 'draft', text: saved.text, planId, outcome: saved.outcome };
    const detail = new PlanDetailPage(this.page);
    await detail.open(planId);
    const tab = detail.formulary();
    await tab.open();
    await tab.assign(formularyCode);
    await detail.open(planId);
    const sent = await detail.attemptSubmit();
    if (sent.offered !== 'available' || sent.status >= 300) {
      return { refusedAt: 'submit', text: `${sent.offered} ${sent.status} ${sent.text.slice(0, 300)} | ${sent.messages.join(' | ')}`, planId, outcome: saved.outcome };
    }
    await this.waitForEffectiveToPass(planId);
    const decision = await this.approveRequestOfPlan(planId, planName);
    if (decision.status >= 300) return { refusedAt: 'approval', text: `${decision.status} ${decision.text.slice(0, 300)}`, planId, outcome: saved.outcome };
    return { refusedAt: null, text: '', planId, outcome: saved.outcome };
  }
}
