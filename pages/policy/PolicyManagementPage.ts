import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { ListPageBase } from '../components/ListPageBase';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ExportMenu } from '../components/ExportMenu';
import { chooseSelectOption, readSelectOptions } from '../components/PrimeControls';
import { PolicyFormDrawer } from './PolicyFormDrawer';
import { PolicyCloneDrawer } from './PolicyCloneDrawer';
import { PolicyDetailPage } from './PolicyDetailPage';
import { PolicyInactivateDrawer } from './PolicyInactivateDrawer';
import { PolicyImportDialog } from './PolicyImportDialog';
import { AppRoutes } from '../../constants/AppRoutes';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import { Timeouts } from '../../constants/Timeouts';
import {
  CONSUMING_SCREEN,
  GLOBAL,
  POLICY_CARD,
  POLICY_COLUMN,
  POLICY_EXPORT,
  POLICY_FORM,
  POLICY_IMPORT,
  POLICY_LIST,
  POLICY_ROW_ACTION,
  POLICY_SORT_FIELD,
  TOAST,
  buttonSelector,
  type PolicyCardAction,
  type PolicyKpiKey,
  type PolicyQuickFilter,
  type PolicyRowAction,
  type PolicySortField,
} from '../../constants/ElementIds';
import { NetworkUtils } from '../../utils/NetworkUtils';
import { WaitUtils } from '../../utils/WaitUtils';
import { Logger } from '../../utils/Logger';
import { parseCsv } from '../../utils/CsvUtils';
import { parseXlsx, type ParsedXlsx } from '../../utils/XlsxUtils';
import { listPolicyRegister, readPolicyDashboard, type PolicyDashboard, type PolicyListItem } from '../../utils/PolicyProvisioning';

export type PolicyColumnKey = keyof typeof POLICY_COLUMN;

/** One list row, by column. */
export type PolicyRowValues = Record<PolicyColumnKey, string>;

/** What one GetPolicies request answered. */
export interface PolicyListAnswer {
  items: PolicyListItem[];
  totalRows: number;
}

/** How a row / card action is offered: its availability, label and tooltip ("Not available until this policy is approved."). */
export interface PolicyRowActionState {
  availability: 'absent' | 'disabled' | 'available';
  label: string;
  title: string;
}

/**
 * The Policies module (`/policy-management`).
 *
 * Exists for one question the cascade story has to answer: when a payer is
 * inactivated, do ITS policies follow? That cannot be read anywhere inside the
 * payer module - the payer detail's Linked Policies tab offers a search box and
 * no rows for the payers this suite can reach - so the policy list is where the
 * answer lives.
 *
 * Thin on purpose. Everything about searching, tables, rows and pagination it
 * inherits from ListPageBase, which builds from the screen's id namespace; all
 * that is added here is "which policies belong to this payer, and what status
 * does each show".
 *
 * Since 2026-11-03 it is also the Policy MODULE's list page (Feature 15164):
 * the methods below the "Policy module additions" marker drive the KPI tiles,
 * quick filters, sort, row actions, cards, export and import. The payer / plan
 * callers above are unchanged; `search` now waits for its own GetPolicies answer.
 */
export class PolicyManagementPage extends ListPageBase {
  constructor(page: Page) {
    super(page, CONSUMING_SCREEN.policyList);
  }

  async open(): Promise<void> {
    await this.goto(AppRoutes.policyManagement);
  }

  /**
   * Opens the module - with `payerName` in scope when one is given - and
   * guarantees its table is on screen.
   *
   * SCOPE BEFORE THE TABLE (2026-10-11). The gate takes the first payer
   * offered ("23", a draft with no policies), and a payer with no policies
   * renders "No policies found." and NO table - so waiting for the table
   * before switching scope failed before the payer under test was ever shown.
   */
  async openList(payerName?: string): Promise<void> {
    await this.open();
    if (payerName !== undefined) await this.scopeTo(payerName).catch(() => false);
    await this.ensureTableView(this.screen);
    await expect(this.tableFor(this.screen)).toBeVisible({ timeout: Timeouts.default });
  }

  /**
   * Every rendered policy as (name, payer, status), read in ONE pass.
   *
   * One pass for the reason ListPageBase.getRowPairs gives: the list re-queries
   * asynchronously, so reading the columns separately can pair a policy's name
   * with another row's payer - and this story turns entirely on which payer a
   * record belongs to.
   */
  async getPolicyRows(): Promise<{ name: string; payer: string; status: string }[]> {
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
      { name: POLICY_COLUMN.name, payer: POLICY_COLUMN.payer, status: POLICY_COLUMN.status },
    );
  }

  /** The policies belonging to one payer, with the status each displays. */
  /**
   * The member count of each policy belonging to a payer.
   *
   * Feeds the de-duplication invariant in the linked-members story: a distinct
   * total can never exceed the sum of these, nor fall below the largest of
   * them. A policy whose member cell holds no number is SKIPPED rather than
   * counted as zero - an unreadable count is not the same as none, and treating
   * it as none would loosen the ceiling the invariant depends on.
   */
  async getPolicyMemberCounts(payerName: string): Promise<number[]> {
    // THE PAYER IN SCOPE FIRST (2026-10-11). The Policies module shows one
    // payer at a time and its gate takes the first payer offered, so 14799 read
    // another payer's policies while asking about payer number 2's. openList
    // puts the payer being measured in scope before it waits for the table.
    await this.openList(payerName);
    const rows = await this.rows().evaluateAll(
      (nodes, keys) =>
        nodes.map((node) => ({
          payer:
            (node.querySelector(`[id$="-cell-${keys.payer}"]`) as HTMLElement | null)
              ?.innerText.trim() ?? '',
          members:
            (node.querySelector(`[id$="-cell-${keys.members}"]`) as HTMLElement | null)
              ?.innerText.trim() ?? '',
        })),
      { payer: POLICY_COLUMN.payer, members: POLICY_COLUMN.members },
    );
    return rows
      .filter((row) => row.payer.includes(payerName))
      .map((row) => row.members.replace(/[^0-9]/g, ''))
      .filter((digits) => digits !== '')
      .map((digits) => Number(digits));
  }

  async getPoliciesOfPayer(payerName: string): Promise<{ name: string; status: string }[]> {
    await this.openList(payerName);
    const rows = await this.getPolicyRows();
    return rows
      .filter((row) => row.payer === payerName)
      .map((row) => ({ name: row.name, status: row.status }));
  }

  // ---- plan folder 30 additions (2026-10-27) ----

  /**
   * The policies linked to one plan, with the status each displays - read on
   * the Policies module with the plan's payer in scope and the plan's name
   * searched, filtered on the Plan column. Answers [] when the payer has no
   * policies at all (the module then renders "No policies found." and no
   * table), which is a legitimate answer for a plan with none linked.
   */
  async getPoliciesOfPlan(payerName: string, planName: string): Promise<{ name: string; plan: string; status: string }[]> {
    await this.open();
    await this.scopeTo(payerName).catch(() => false);
    await this.waitForPageReady();
    const shown = await this.tableFor(this.screen)
      .waitFor({ state: 'visible', timeout: Timeouts.default })
      .then(() => true)
      .catch(() => false);
    if (!shown) return [];
    await this.search(planName);
    const rows = await this.rows().evaluateAll(
      (nodes, keys) =>
        nodes.map((node) => {
          const read = (key: string): string =>
            ((node.querySelector(`[id$="-cell-${key}"]`) as HTMLElement | null)?.innerText ?? '').trim();
          return { name: read(keys.name), plan: read(keys.plan), status: read(keys.status) };
        }),
      { name: POLICY_COLUMN.name, plan: POLICY_COLUMN.plan, status: POLICY_COLUMN.status },
    );
    return rows.filter((row) => row.plan === planName);
  }

  // ---- Policy module additions (Feature 15164, 2026-11-03) ----------------------------
  // Verified live 2026-11-03 (reports/policy/probe/SCREEN-MAP.md). The admin meets
  // no payer gate here ("All Payers" in the top bar). The list renders four KPI
  // tiles, four quick filters (status, type, plan, approval - no payer), Sort By,
  // Export, Import, Add Policy, the table (`policy-list-table-row-{id}`) and a
  // Cards view ("Load More Policies"). The Filters button beside the search box
  // opens NOTHING (no advanced search). Every list read waits for ITS OWN
  // GetPolicies answer.

  /** Opens the list in Table view and waits for its rows AND the KPI answer (the tiles read 0 until GetPoliciesDashboard answers). */
  async openTable(): Promise<void> {
    const dashboard = this.page.waitForResponse((r) => /\/GetPoliciesDashboard$/.test(r.url()), { timeout: Timeouts.default }).catch(() => null);
    await this.open();
    await dashboard;
    await this.ensureTableView(this.screen);
    await this.waitForRowsRendered();
  }

  /** The main area's text - for denied / empty states. */
  async getPageText(): Promise<string> {
    return (await this.page.locator('main').first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim(); // locator-exception: the denied / empty states carry no id; the app's single <main> is read whole.
  }

  /** A row by the policy's NAME, matched exactly in its name cell. */
  protected rowByText(text: string): Locator {
    const exact = new RegExp(`^\\s*${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`);
    return this.rows().filter({ has: this.page.locator(`[id$="-cell-${POLICY_COLUMN.name}"]`, { hasText: exact }) }).first();
  }

  /** Runs `action` and returns what the GetPolicies request it triggered answered. */
  async captureList(action: () => Promise<void>): Promise<PolicyListAnswer> {
    const body = await NetworkUtils.captureJsonResponseMatching<{ payload: { policies: PolicyListAnswer } }>(this.page, /\/GetPolicies$/, action);
    await this.waitForRowsRendered().catch(() => undefined);
    return body?.payload.policies ?? { items: [], totalRows: -1 };
  }

  /** Runs `action` and returns the BODY of the GetPolicies request it sent. */
  async captureListRequest(action: () => Promise<void>): Promise<Record<string, unknown>> {
    const waiting = this.page.waitForRequest((r) => /\/GetPolicies$/.test(r.url()), { timeout: Timeouts.default }).catch(() => null);
    await action();
    const request = await waiting;
    return (request?.postDataJSON() as Record<string, unknown> | null) ?? {};
  }

  /**
   * Types a search and presses Enter, waiting for the answer to THIS search
   * (its `searchText`). The same term twice sends nothing, so the box is
   * cleared (with Enter) first when it already holds it.
   */
  async search(term: string): Promise<void> {
    Logger.step(`Searching policies for "${term}"`);
    if (!(await this.searchInput().isVisible())) await this.openTable();
    const input = this.searchInput();
    if ((await input.inputValue()) === term && term !== '') {
      const cleared = this.page.waitForResponse((r) => /\/GetPolicies$/.test(r.url()), { timeout: Timeouts.short }).catch(() => null);
      await input.fill('');
      await input.press('Enter');
      await cleared;
    }
    const answered = this.page
      .waitForResponse((r) => /\/GetPolicies$/.test(r.url())
        && (term === '' || (r.request().postData() ?? '').includes(`"searchText":${JSON.stringify(term)}`)), { timeout: Timeouts.default })
      .catch(() => null);
    await input.fill(term);
    await input.press('Enter');
    await answered;
    await this.waitForPageReady();
  }

  async searchFor(term: string): Promise<PolicyListAnswer> {
    return this.captureList(() => this.search(term));
  }

  /** Searches for a policy by name and waits for its row (no search when it is on screen). */
  async revealRow(name: string): Promise<void> {
    if (await this.rowByText(name).isVisible().catch(() => false)) return;
    await this.search(name);
    await this.waitForRowVisible(name);
  }

  async isListed(name: string): Promise<boolean> {
    const searched = await this.search(name).then(() => true).catch(() => false);
    return searched && this.isRowVisible(name);
  }

  async readNames(): Promise<string[]> {
    await this.waitForRowsRendered();
    return this.columnValues(POLICY_COLUMN.name);
  }

  async readColumnValues(column: PolicyColumnKey): Promise<string[]> {
    await this.waitForRowsRendered();
    return this.columnValues(POLICY_COLUMN[column]);
  }

  /** One row's values by column (searches for it first). */
  async readRow(name: string): Promise<PolicyRowValues> {
    await this.revealRow(name);
    const out = {} as PolicyRowValues;
    for (const [key, column] of Object.entries(POLICY_COLUMN) as [PolicyColumnKey, string][]) out[key] = await this.getCellValue(name, column);
    return out;
  }

  /** Every row on screen, by column, in one pass. */
  async readRowsOnScreen(): Promise<PolicyRowValues[]> {
    await this.waitForRowsRendered();
    return this.rows().evaluateAll((trs, columns) => trs.map((tr) => {
      const out: Record<string, string> = {};
      for (const [key, column] of Object.entries(columns)) {
        const cell = tr.querySelector(`[id$="-cell-${column}"]`);
        out[key] = cell ? (cell as HTMLElement).innerText.replace(/\s+/g, ' ').trim() : '';
      }
      return out;
    }), POLICY_COLUMN as Record<string, string>) as Promise<PolicyRowValues[]>;
  }

  async getHeaderTexts(): Promise<string[]> {
    return (await this.page.locator(`th[id^="${this.screen}-table-th-"]`).allInnerTexts()).map((t) => t.trim()).filter((t) => t !== '');
  }

  async countRows(): Promise<number> {
    await this.waitForRowsRendered();
    return this.getRowCount();
  }

  /**
   * The list's empty-state message. 2026-11-04: with nothing to list the screen
   * renders NO table - only a "No policies found." placeholder under the toolbar
   * (`.policy-list__placeholder`, no id) - so the table's own empty row is never
   * there; the placeholder is read first.
   */
  async getEmptyStateText(): Promise<string> {
    const placeholder = this.byId(POLICY_LIST.screen).locator('.policy-list__placeholder').first(); // locator-exception: the empty-state placeholder carries no id; it is the only placeholder inside #policy-list.
    // The same placeholder reads "Loading…" while the list is fetched - wait that out.
    let text = '';
    for (let i = 0; i < 10; i += 1) {
      text = (await placeholder.innerText({ timeout: Timeouts.short }).catch(() => '')).trim();
      if (!/loading/i.test(text)) break;
      await this.page.waitForTimeout(500);
    }
    if (text !== '' && !/loading/i.test(text)) return text;
    return (await this.byId(`${this.screen}-table-empty`).innerText({ timeout: Timeouts.short }).catch(() => '')).trim();
  }

  // ---- KPI tiles ----------------------------------------------------------------------------

  async readKpi(kpi: PolicyKpiKey): Promise<number> {
    const text = await this.settledKpiValue(POLICY_LIST.kpi[kpi]);
    return Number(text.replace(/[^\d-]/g, '') || NaN);
  }

  /**
   * A tile's value once it stops changing. The tiles count up from 0 after the
   * dashboard answers (2026-11-03: read straight away, every tile read 0 while
   * the screen settled on 58 / 14 / 7 / 21).
   */
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

  /** Every KPI tile: label and value as shown. */
  async readKpis(): Promise<Record<PolicyKpiKey, { label: string; value: string }>> {
    await expect(this.byId(POLICY_LIST.kpiBand), 'the KPI tiles should render').toBeVisible({ timeout: Timeouts.default });
    const out = {} as Record<PolicyKpiKey, { label: string; value: string }>;
    for (const [key, id] of Object.entries(POLICY_LIST.kpi) as [PolicyKpiKey, string][]) {
      out[key] = {
        label: (await this.byId(`${id}-label`).innerText().catch(() => '')).trim(),
        value: await this.settledKpiValue(id).catch(() => ''),
      };
    }
    return out;
  }

  /** Every KPI tile label rendered (the "five counters" cases read how many there are). */
  async readKpiLabels(): Promise<string[]> {
    return (await this.page.locator(`[id^="${POLICY_LIST.kpiBand.replace(/s$/, '')}-"][id$="-label"]`).allInnerTexts()).map((t) => t.trim());
  }

  async isKpiBandVisible(): Promise<boolean> {
    return this.byId(POLICY_LIST.kpiBand).waitFor({ state: 'visible', timeout: Timeouts.default }).then(() => true).catch(() => false);
  }

  async fetchDashboard(): Promise<PolicyDashboard> {
    return readPolicyDashboard(this.page);
  }

  /** Reloads and returns the dashboard answer the reload fetched. */
  async reloadCapturingDashboard(): Promise<PolicyDashboard | null> {
    const body = await NetworkUtils.captureJsonResponseMatching<{ payload: PolicyDashboard }>(this.page, /\/GetPoliciesDashboard$/, () => this.reload());
    await this.waitForRowsRendered().catch(() => undefined);
    return body?.payload ?? null;
  }

  // ---- quick filters, sort, advanced search ---------------------------------------------------

  async getFilterOptions(filter: PolicyQuickFilter): Promise<string[]> {
    return readSelectOptions(this.page, this.byId(POLICY_LIST.filter[filter]));
  }

  /** Picks a quick filter's option (by label) and returns the list it answered. */
  async filterBy(filter: PolicyQuickFilter, label: string): Promise<PolicyListAnswer> {
    Logger.step(`Filtering policies: ${filter} = "${label}"`);
    await this.ensureTableView(this.screen);
    return this.captureList(() => chooseSelectOption(this.page, this.byId(POLICY_LIST.filter[filter]), label));
  }

  /** What a quick filter shows now ("All Statuses", the chosen label). */
  async readFilter(filter: PolicyQuickFilter): Promise<string> {
    return (await this.byId(POLICY_LIST.filter[filter]).innerText().catch(() => '')).trim();
  }

  async getSortOptions(): Promise<string[]> {
    await this.btn(POLICY_LIST.sortTrigger).click();
    // Read once the menu has rendered (2026-11-04: read at once it answered no options).
    await this.page.locator(`[id^="${POLICY_LIST.sortOptionPrefix}"]`).first().waitFor({ state: 'visible', timeout: Timeouts.short }).catch(() => undefined);
    const options = (await this.page.locator(`[id^="${POLICY_LIST.sortOptionPrefix}"]`).allInnerTexts()).map((t) => t.trim());
    await this.page.keyboard.press('Escape');
    return options;
  }

  async sortBy(field: PolicySortField, direction: 'asc' | 'desc'): Promise<PolicyListAnswer> {
    Logger.step(`Sorting policies by ${field} ${direction}`);
    await this.ensureTableView(this.screen);
    await this.btn(POLICY_LIST.sortTrigger).click();
    return this.captureList(() => this.page.locator(`#${POLICY_LIST.sortOptionPrefix}${POLICY_SORT_FIELD[field]}-${direction}`).click());
  }

  /**
   * The sort indicator: the option the Sort By menu marks active
   * (`aria-checked="true"`, e.g. "Created On (Newest to Oldest)"), else the
   * trigger's label. 2026-11-04: the trigger always reads "Sort By" - the shared
   * sort menu (as on the Plans / Networks lists) shows the current sort as its
   * checked option, so reading only the trigger reported "Sort By" after every sort.
   */
  async readSortLabel(): Promise<string> {
    const trigger = (await this.btn(POLICY_LIST.sortTrigger).innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
    await this.btn(POLICY_LIST.sortTrigger).click();
    await this.page.locator(`[id^="${POLICY_LIST.sortOptionPrefix}"]`).first().waitFor({ state: 'visible', timeout: Timeouts.short }).catch(() => undefined);
    const active = this.page.locator(`[id^="${POLICY_LIST.sortOptionPrefix}"][aria-checked="true"]`);
    const label = (await active.count()) > 0 ? (await active.first().innerText()).replace(/\s+/g, ' ').trim() : '';
    await this.page.keyboard.press('Escape');
    return label || trigger;
  }

  /**
   * Clicks the Filters button beside the search box and reports whether an
   * advanced-search drawer opened (`policy-list-advanced-search`). Live
   * 2026-11-03 nothing opened - the advanced-search cases assert it.
   */
  async tryOpenAdvancedSearch(): Promise<boolean> {
    await this.btn(POLICY_LIST.searchFilterButton).click();
    return this.byId('policy-list-advanced-search-title').waitFor({ state: 'visible', timeout: Timeouts.short }).then(() => true).catch(() => false);
  }

  async getChips(): Promise<string[]> {
    const chips = await this.byId(POLICY_LIST.chips).locator('[id*="-chip-"]').allInnerTexts().catch(() => [] as string[]);
    return chips.map((t) => t.trim()).filter((t) => t !== '');
  }

  // ---- row actions -------------------------------------------------------------------------

  private async policyAction(name: string, action: PolicyRowAction): Promise<Locator> {
    const id = await this.rowId(name);
    return this.page.locator(`#${id}-${POLICY_ROW_ACTION[action]}`).first();
  }

  /** How a row offers one action ('absent' | 'disabled' | 'available', label, tooltip). */
  async getActionState(name: string, action: PolicyRowAction): Promise<PolicyRowActionState> {
    if (!(await this.rowByText(name).isVisible())) await this.revealRow(name);
    await this.waitForRowVisible(name);
    const [state] = await (await this.policyAction(name, action)).evaluateAll((buttons) =>
      buttons.map((b) => ({ disabled: (b as HTMLButtonElement).disabled, label: (b as HTMLElement).innerText.trim(), title: b.getAttribute('title') ?? '' })));
    if (state === undefined) return { availability: 'absent', label: '', title: '' };
    return { availability: state.disabled ? 'disabled' : 'available', label: state.label, title: state.title };
  }

  async readActionStates(name: string): Promise<Record<PolicyRowAction, PolicyRowActionState>> {
    await this.revealRow(name);
    const out = {} as Record<PolicyRowAction, PolicyRowActionState>;
    for (const action of Object.keys(POLICY_ROW_ACTION) as PolicyRowAction[]) out[action] = await this.getActionState(name, action);
    return out;
  }

  async clickAction(name: string, action: PolicyRowAction): Promise<void> {
    Logger.step(`Clicking "${action}" for policy "${name}"`);
    if (!(await this.rowByText(name).isVisible())) await this.revealRow(name);
    await this.waitForPageReady();
    const button = await this.policyAction(name, action);
    await expect(button, `"${name}" should offer a usable ${action} action`).toBeEnabled({ timeout: Timeouts.default });
    await button.click();
  }

  async openDetails(name: string): Promise<PolicyDetailPage> {
    await this.clickAction(name, 'view');
    const detail = new PolicyDetailPage(this.page);
    await detail.waitForLoaded();
    return detail;
  }

  async isAddOffered(): Promise<boolean> {
    return this.addButton().waitFor({ state: 'visible', timeout: Timeouts.short }).then(() => true).catch(() => false);
  }

  /** Opens the Add Policy drawer. */
  async openAddForm(): Promise<PolicyFormDrawer> {
    await this.waitForPageReady();
    await this.clickAdd();
    const drawer = new PolicyFormDrawer(this.page, POLICY_FORM.add);
    const opened = await expect.poll(() => drawer.isOpen(), { timeout: Timeouts.short }).toBe(true).then(() => true).catch(() => false);
    if (!opened) await this.clickAdd();
    await drawer.waitForOpen();
    return drawer;
  }

  /** Edit on a v0 row - the list's form drawer in edit mode. */
  async openEditForm(name: string): Promise<PolicyFormDrawer> {
    await this.clickAction(name, 'edit');
    const drawer = new PolicyFormDrawer(this.page, POLICY_FORM.add);
    await drawer.waitForOpen();
    await drawer.waitForLoadedValues();
    return drawer;
  }

  /** Clone on a row - the LIST clones in its own form drawer (`policy-form-drawer`, clone mode). */
  async openCloneDrawer(name: string): Promise<PolicyCloneDrawer> {
    await this.clickAction(name, 'clone');
    const drawer = new PolicyCloneDrawer(this.page, POLICY_FORM.add);
    await drawer.waitForOpen();
    await drawer.waitForLoadedValues();
    return drawer;
  }

  /** Inactivate on a row -> the Inactivate Policy drawer. */
  async openInactivateDrawer(name: string): Promise<PolicyInactivateDrawer> {
    await this.clickAction(name, 'inactivate');
    const drawer = new PolicyInactivateDrawer(this.page);
    await drawer.waitForOpen();
    return drawer;
  }

  /** Clicks a confirmation-raising row action (Send for Approval, Activate, Delete) and returns the dialog, open. */
  async requestAction(name: string, action: 'submit' | 'activate' | 'delete'): Promise<ConfirmDialog> {
    await this.clickAction(name, action);
    const dialog = new ConfirmDialog(this.page);
    await dialog.waitForVisible();
    return dialog;
  }

  async sendForApproval(name: string): Promise<{ status: number; text: string; messages: string[] }> {
    const dialog = await this.requestAction(name, 'submit');
    const answer = await NetworkUtils.captureResponse(this.page, ApiEndpoints.policySubmit, () => dialog.confirm());
    return { status: answer?.status ?? -1, text: answer?.text ?? '', messages: await this.waitForVisibleMessages() };
  }

  async deletePolicy(name: string): Promise<{ status: number; text: string; messages: string[] }> {
    const dialog = await this.requestAction(name, 'delete');
    const answer = await NetworkUtils.captureResponse(this.page, ApiEndpoints.policyDelete, async () => { await dialog.confirmWithFollowUps(); });
    return { status: answer?.status ?? -1, text: answer?.text ?? '', messages: await this.waitForVisibleMessages() };
  }

  async waitForVisibleMessages(timeout: number = Timeouts.short): Promise<string[]> {
    return WaitUtils.settleMessages(async () => (await this.page.locator(`#${TOAST.summary}, #${TOAST.detail}`).allInnerTexts().catch(() => [] as string[]))
      .map((t) => t.trim()).filter((t) => t !== ''), timeout);
  }

  // ---- cards -------------------------------------------------------------------------------

  async switchToCards(): Promise<void> {
    const cards = this.byId(POLICY_LIST.cards);
    await this.btn(GLOBAL.viewToggleCards).click();
    // A click landing while the list is still loading is lost (2026-11-03: the
    // toggle stayed on Table and the cards never rendered); clicked once more.
    if (!(await cards.waitFor({ state: 'visible', timeout: Timeouts.short }).then(() => true).catch(() => false))) {
      await this.btn(GLOBAL.viewToggleCards).click();
    }
    await expect(cards, 'the Cards view should render').toBeVisible({ timeout: Timeouts.default });
  }

  async switchToTable(): Promise<void> {
    await this.ensureTableView(this.screen);
  }

  private card(name: string): Locator {
    const exact = new RegExp(`^\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`);
    return this.page.locator(`article[id^="${POLICY_CARD.prefix}"]`, { has: this.page.locator(`[id$="-${POLICY_CARD.title}"]`, { hasText: exact }) }).first();
  }

  async isCardShown(name: string): Promise<boolean> {
    return this.card(name).waitFor({ state: 'visible', timeout: Timeouts.default }).then(() => true).catch(() => false);
  }

  /** Clicks "Load More Policies" until the card shows or nothing more loads. */
  async loadCardsUntilShown(name: string, maxLoads = 20): Promise<boolean> {
    for (let i = 0; i < maxLoads; i += 1) {
      if (await this.card(name).isVisible()) return true;
      const more = this.page.locator(`#${POLICY_LIST.loadMore}`);
      if (!(await more.isVisible().catch(() => false))) break;
      await more.click();
      await this.waitForPageReady();
    }
    return this.isCardShown(name);
  }

  /** A card's values by field, plus the labels the card shows. */
  async readCard(name: string): Promise<Record<string, string>> {
    const card = this.card(name);
    await expect(card, `a card for "${name}"`).toBeVisible({ timeout: Timeouts.default });
    const id = (await card.getAttribute('id')) ?? '';
    const out: Record<string, string> = {};
    for (const key of ['title', 'versionStatus', 'statusBadge', 'number', 'type', 'plan', 'payer', 'members', 'effectiveDate', 'expiryDate', 'maxMembers'] as const) {
      out[key] = (await this.byId(`${id}-${POLICY_CARD[key]}`).innerText({ timeout: Timeouts.short }).catch(() => '')).trim();
    }
    out.header = (await this.byId(`${id}-header`).innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
    return out;
  }

  async getCardActionState(name: string, action: PolicyCardAction): Promise<PolicyRowActionState> {
    const card = this.card(name);
    await expect(card, `a card for "${name}"`).toBeVisible({ timeout: Timeouts.default });
    const id = (await card.getAttribute('id')) ?? '';
    const button = this.page.locator(buttonSelector(`${id}-${POLICY_CARD.action[action]}`)).first();
    if ((await button.count()) === 0) return { availability: 'absent', label: '', title: '' };
    return { availability: (await button.isEnabled()) ? 'available' : 'disabled', label: (await button.innerText()).trim(), title: (await button.getAttribute('title')) ?? '' };
  }

  // ---- export / import ----------------------------------------------------------------------

  exportMenu(): ExportMenu {
    return new ExportMenu(this.page, POLICY_EXPORT);
  }

  async getExportOptions(): Promise<string[]> {
    await this.waitForPageReady();
    // ExportMenu.open() insists on Export All Data; a shaped role may be offered
    // less, and that is the answer to read (19651, 2026-11-04), so the menu is
    // opened and read as it comes.
    await this.page.locator(buttonSelector(POLICY_EXPORT.trigger)).first().click();
    await this.byId(POLICY_EXPORT.menu).waitFor({ state: 'visible', timeout: Timeouts.default }).catch(() => undefined);
    const offered = await this.exportMenu().getOfferedScopes();
    await this.exportMenu().cancelMenu().catch(() => undefined);
    return offered;
  }

  async exportAndParse(scope: 'all' | 'selected', format: 'csv' | 'excel'): Promise<{ filename: string; bytes: Buffer; parsed: ParsedXlsx }> {
    await this.waitForPageReady();
    return this.exportMenu().exportAndParse(scope, format);
  }

  /** Export > Export Template (choosing its format when asked) - returns it parsed. */
  async exportTemplate(format: 'csv' | 'excel' = 'csv'): Promise<{ filename: string; bytes: Buffer; parsed: ParsedXlsx }> {
    const menu = this.exportMenu();
    // ExportMenu.open() insists on Export All Data, which a shaped role may not be
    // offered while it still holds the template (19660, 2026-11-04) - wait for the
    // template entry itself.
    await this.waitForPageReady();
    await this.page.locator(buttonSelector(POLICY_EXPORT.trigger)).first().click();
    await expect(this.page.locator(`#${POLICY_EXPORT.template}`), 'Export > Export Template').toBeVisible({ timeout: Timeouts.default });
    const downloaded = this.page.waitForEvent('download', { timeout: Timeouts.queuePropagation });
    downloaded.catch(() => undefined);
    await this.page.locator(`#${POLICY_EXPORT.template}`).click();
    if (await new ConfirmDialog(this.page).isVisible()) await menu.clickFormat(format);
    const download = await downloaded;
    const chunks: Buffer[] = [];
    for await (const chunk of await download.createReadStream()) chunks.push(Buffer.from(chunk));
    const bytes = Buffer.concat(chunks);
    const name = download.suggestedFilename();
    const parsed = /\.csv$/i.test(name) ? { ...parseCsv(bytes.toString('utf8')), rightToLeft: false } : parseXlsx(bytes);
    return { filename: name, bytes, parsed };
  }

  async isImportOffered(): Promise<boolean> {
    return this.btn(POLICY_LIST.importTrigger).waitFor({ state: 'visible', timeout: Timeouts.short }).then(() => true).catch(() => false);
  }

  async openImport(): Promise<PolicyImportDialog> {
    const dialog = new PolicyImportDialog(this.page, POLICY_IMPORT.list);
    await dialog.closeIfOpen();
    await this.btn(POLICY_LIST.importTrigger).click();
    await dialog.waitForOpen();
    return dialog;
  }

  // ---- API ------------------------------------------------------------------------------------

  async fetchRegister(criteria: Record<string, unknown> = {}, rows = 100): Promise<PolicyListAnswer> {
    return listPolicyRegister(this.page, criteria, rows);
  }

  async canListPolicies(): Promise<boolean> {
    return listPolicyRegister(this.page, {}, 1).then(() => true).catch(() => false);
  }

  async simulateEmptyRegister(): Promise<void> {
    await NetworkUtils.emptyListEndpoint(this.page, ApiEndpoints.policyList);
  }

  async simulateFailure(endpoint: string): Promise<void> {
    await NetworkUtils.failEndpoint(this.page, endpoint);
  }

  async restoreEndpoints(): Promise<void> {
    await NetworkUtils.restore(this.page);
  }
}
