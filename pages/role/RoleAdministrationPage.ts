import type { Download, Locator, Page, Response } from '@playwright/test';
import { expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import {
  ROLE_CARD,
  ROLE_DIALOG,
  ROLE_FILTER,
  ROLE_LIST_IDS,
  ROLE_PAGER,
  ROLE_ROUTE,
  ROLE_ROW,
  ROLE_TOAST,
  ROLE_VIEW_TOGGLE,
  type RoleCardAction,
  type RoleColumn,
  type RoleRowAction,
  type RoleSortKey,
} from '../../constants/role/roleIds';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import { Timeouts } from '../../constants/Timeouts';
import { Logger } from '../../utils/Logger';
import { parseXlsx, type ParsedXlsx } from '../../utils/XlsxUtils';
import { parseCsv } from '../../utils/CsvUtils';
import { chooseSelectOption } from '../components/PrimeControls';
import { ROLE_TOGGLE_LABEL } from '../../data/role/common.data';
import type { PermissionCatalogue, RoleListItem } from '../../utils/role/roleApi';
import { RoleFormDrawer } from './RoleFormDrawer';
import { RoleViewDrawer } from './RoleViewDrawer';
import { RoleConfirmDialog, RoleDeactivateDrawer, toastAfter } from './RoleDeactivateDrawer';

/** One GetRoles answer the screen waited for: what it asked and what came back. */
export interface RoleListResult {
  request: Record<string, unknown>;
  status: number;
  items: RoleListItem[];
  totalRows: number;
  totalPages: number;
}

/** A table row as rendered. */
export interface RoleRowView {
  id: string;
  name: string;
  description: string;
  status: string;
  predefined: boolean;
}

/** A row action's presence / label / enabled state. */
export interface RowActionView {
  action: RoleRowAction;
  label: string;
  enabled: boolean;
}

const norm = (s: string): string => s.replace(/\s+/g, ' ').trim();
const GUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

/**
 * System Settings > Role Administration (`/system-settings/role-administration`) - the list (table + cards),
 * its toolbar and the doors into the drawers. Every list-changing action (search, sort, direction, filter,
 * page) AWAITS ITS OWN GetRoles answer and returns it (RoleListResult) - compare the screen with `items`.
 *
 * Live behaviour (2026-11-14):
 *  - Search is server side and DEBOUNCED (no Enter needed): body `searchText`; a chip `role-list-filter-chips-chip-search`
 *    and a "Clear" button appear. Empty result: "No roles found." (`.role-list__placeholder`, no id).
 *  - Sort menu: Newest (default, "CreatedOn desc"), Oldest, Role Name ("RoleNameEn desc" on first pick!), Description,
 *    Status, Modified On (trigger then reads "Last Modified"); the direction button flips asc/desc and keeps the field.
 *  - 10 rows a page; table columns Role Name / Description / Status / Actions (no Role ID column).
 *  - Predefined rows: badge "Predefined role" in the name cell; toggle-active + delete are DISABLED; View + Edit enabled.
 *    Cards: no status, no toggle; predefined cards have Edit + View and NO Delete.
 */
export class RoleAdministrationPage extends BasePage {
  readonly form: RoleFormDrawer;
  readonly view: RoleViewDrawer;
  readonly deactivate: RoleDeactivateDrawer;
  readonly dialog: RoleConfirmDialog;

  constructor(page: Page, catalogue?: PermissionCatalogue) {
    super(page);
    this.form = new RoleFormDrawer(page, catalogue);
    this.view = new RoleViewDrawer(page, catalogue);
    this.deactivate = new RoleDeactivateDrawer(page);
    this.dialog = new RoleConfirmDialog(page);
  }

  el(id: string): Locator {
    return this.byId(id);
  }

  button(id: string): Locator {
    return this.btn(id);
  }

  // ---- open ---------------------------------------------------------------------------------

  /** Waits for the next GetRoles answer while `action` runs (optionally one whose request matches). */
  async listAnswerDuring(action: () => Promise<void>, match?: (body: Record<string, unknown>) => boolean): Promise<RoleListResult> {
    const waiting = this.page.waitForResponse((r) => {
      if (!r.url().includes(ApiEndpoints.roleList) || r.request().method() !== 'POST') return false;
      if (!match) return true;
      try {
        return match(JSON.parse(r.request().postData() ?? '{}') as Record<string, unknown>);
      } catch {
        return false;
      }
    }, { timeout: Timeouts.navigation });
    await action();
    const res = await waiting;
    return this.parseList(res);
  }

  private async parseList(res: Response): Promise<RoleListResult> {
    const request = JSON.parse(res.request().postData() ?? '{}') as Record<string, unknown>;
    const body = (await res.json().catch(() => ({}))) as { payload?: { roles?: { items?: RoleListItem[]; totalRows?: number; totalPages?: number } } };
    const roles = body.payload?.roles;
    return { request, status: res.status(), items: roles?.items ?? [], totalRows: roles?.totalRows ?? 0, totalPages: roles?.totalPages ?? 0 };
  }

  /** Opens the screen in TABLE view and returns the GetRoles answer it rendered. */
  async open(): Promise<RoleListResult> {
    Logger.step('Opening Role Administration');
    const answer = await this.listAnswerDuring(() => this.goto(ROLE_ROUTE));
    await this.ensureTableView(ROLE_LIST_IDS.root);
    await this.waitForRows();
    return answer;
  }

  /** Navigates WITHOUT asserting the list (refusal cases). */
  async navigate(): Promise<void> {
    await this.goto(ROLE_ROUTE);
  }

  /** Whether the list rendered for this session (false = refused / redirected). */
  async isListShown(timeout = Timeouts.default): Promise<boolean> {
    return this.el(ROLE_LIST_IDS.root).waitFor({ state: 'visible', timeout }).then(() => true, () => false);
  }

  /** Waits until rows or the empty text are rendered. */
  async waitForRows(): Promise<void> {
    await expect
      .poll(async () => (await this.rowLocators().count()) > 0 || (await this.emptyText().isVisible().catch(() => false)) || (await this.cardLocators().count()) > 0, {
        timeout: Timeouts.default,
        message: 'the role list should render rows or "No roles found."',
      })
      .toBe(true);
  }

  // ---- toolbar ------------------------------------------------------------------------------

  /** Types into the search box (debounced, server side) and returns the answer for exactly this text. */
  async search(text: string): Promise<RoleListResult> {
    Logger.step(`[roles] Search "${text}"`);
    const want = text.trim();
    const box = this.el(ROLE_LIST_IDS.searchInput);
    if ((await box.inputValue()) === text) {
      // The same text again sends nothing - reload the list (the search box starts empty after a reload).
      if (!want) return this.listAnswerDuring(() => this.reload());
      await this.listAnswerDuring(() => box.fill(''), (b) => !b.searchText);
    }
    const answer = await this.listAnswerDuring(
      () => this.el(ROLE_LIST_IDS.searchInput).fill(text),
      (b) => (want ? b.searchText === want || b.searchText === text : !b.searchText),
    );
    await this.waitForRows();
    return answer;
  }

  /** "Clear" next to the box. */
  async clearSearch(): Promise<RoleListResult> {
    const answer = await this.listAnswerDuring(() => this.button(ROLE_LIST_IDS.searchClearButton).click(), (b) => !b.searchText);
    await this.waitForRows();
    return answer;
  }

  emptyText(): Locator {
    return this.el(ROLE_LIST_IDS.root).locator('.role-list__placeholder'); // locator-exception: the empty-list text carries no id; scoped to role-list
  }

  /** Chip of the applied search / filter (`search`, `name`, `description`, `status`...). */
  chip(field: string): Locator {
    return this.el(`${ROLE_LIST_IDS.chips}-chip-${field}`);
  }

  async sortLabel(): Promise<string> {
    return norm(await this.button(ROLE_LIST_IDS.sortTrigger).innerText());
  }

  /** Opens the sort menu and returns its option labels (closes it again). */
  async sortOptions(): Promise<string[]> {
    await this.button(ROLE_LIST_IDS.sortTrigger).click();
    const menu = this.el(ROLE_LIST_IDS.sortMenu);
    await expect(menu).toBeVisible({ timeout: Timeouts.default });
    const labels = (await menu.locator('button[id^="role-list-sort-option-"]').allInnerTexts()).map(norm);
    await this.page.keyboard.press('Escape');
    await expect(menu).toBeHidden({ timeout: Timeouts.default }).catch(() => undefined);
    return labels;
  }

  /** Picks a sort option and returns the GetRoles answer it triggered (request.sortBy = "<Field> asc|desc"). */
  async sortBy(key: RoleSortKey): Promise<RoleListResult> {
    Logger.step(`[roles] Sort by ${key}`);
    await this.button(ROLE_LIST_IDS.sortTrigger).click();
    return this.listAnswerDuring(() => this.button(`role-list-sort-option-${key}`).click());
  }

  async toggleSortDirection(): Promise<RoleListResult> {
    return this.listAnswerDuring(() => this.button(ROLE_LIST_IDS.sortDirection).click());
  }

  /** "Advance Search for Roles": fills the given fields, presses Search, returns the answer. */
  async filter(criteria: { name?: string; description?: string; status?: 'Active' | 'Inactive' }): Promise<RoleListResult> {
    await this.openFilter();
    if (criteria.name !== undefined) await this.el(ROLE_FILTER.nameInput).fill(criteria.name);
    if (criteria.description !== undefined) await this.el(ROLE_FILTER.descriptionInput).fill(criteria.description);
    if (criteria.status !== undefined) await chooseSelectOption(this.page, this.el(ROLE_FILTER.statusSelect), criteria.status);
    const answer = await this.listAnswerDuring(() => this.button(ROLE_FILTER.searchButton).click());
    await expect(this.el(ROLE_FILTER.title)).toBeHidden({ timeout: Timeouts.default });
    await this.waitForRows();
    return answer;
  }

  async openFilter(): Promise<void> {
    await this.button(ROLE_LIST_IDS.filterButton).click();
    await expect(this.el(ROLE_FILTER.title), 'Advance Search for Roles should open').toBeVisible({ timeout: Timeouts.default });
  }

  async closeFilter(): Promise<void> {
    await this.el(ROLE_FILTER.close).click();
    await expect(this.el(ROLE_FILTER.title)).toBeHidden({ timeout: Timeouts.default });
  }

  // ---- rows ---------------------------------------------------------------------------------

  /** Every rendered <tr> row (the id is exactly `role-list-table-row-<guid>`). */
  private rowLocators(): Locator {
    return this.el(ROLE_LIST_IDS.tableBody).locator(`tr[id^="${ROLE_LIST_IDS.rowPrefix}"]`);
  }

  /** Role ids of the rows on screen, top to bottom. */
  async rowIds(): Promise<string[]> {
    const ids = await this.rowLocators().evaluateAll((els) => els.map((e) => e.id));
    const re = new RegExp(`^${ROLE_LIST_IDS.rowPrefix}(${GUID})$`);
    return ids.map((id) => id.match(re)?.[1] ?? '').filter(Boolean);
  }

  row(id: string): Locator {
    return this.el(ROLE_ROW.row(id));
  }

  cell(id: string, column: RoleColumn): Locator {
    return this.el(ROLE_ROW.cell(id, column));
  }

  statusBadge(id: string): Locator {
    return this.el(ROLE_ROW.statusBadge(id));
  }

  action(id: string, action: RoleRowAction): Locator {
    return this.el(ROLE_ROW.action(id, action));
  }

  /** The "Predefined role" badge inside the name cell. locator-exception: the badge has no id; scoped to the cell. */
  predefinedBadge(id: string): Locator {
    return this.cell(id, 'name').locator('.role-list__lock'); // locator-exception: the badge (span.role-list__lock, title "Predefined roles are provided out of the box and cannot be changed.") has no id; scoped to the row's name cell
  }

  /** The English name as shown (the badge text removed). */
  async rowName(id: string): Promise<string> {
    const cell = this.cell(id, 'name');
    return norm(await cell.evaluate((td) => {
      const clone = td.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('.role-list__lock').forEach((b) => b.remove());
      return clone.innerText || clone.textContent || '';
    }));
  }

  async readRow(id: string): Promise<RoleRowView> {
    return {
      id,
      name: await this.rowName(id),
      description: norm(await this.cell(id, 'description').innerText()),
      status: norm(await this.statusBadge(id).innerText()),
      predefined: (await this.predefinedBadge(id).count()) > 0,
    };
  }

  /** Every row on the current page. */
  async readRows(): Promise<RoleRowView[]> {
    const out: RoleRowView[] = [];
    for (const id of await this.rowIds()) out.push(await this.readRow(id));
    return out;
  }

  /** The row id whose name equals `name` on the CURRENT page ('' when not shown). */
  async rowIdByName(name: string): Promise<string> {
    for (const id of await this.rowIds()) if ((await this.rowName(id)) === name) return id;
    return '';
  }

  /** Present actions of a row with label + enabled. */
  async rowActions(id: string): Promise<RowActionView[]> {
    const out: RowActionView[] = [];
    for (const action of ['view', 'edit', 'toggle-active', 'delete'] as RoleRowAction[]) {
      const loc = this.action(id, action);
      if ((await loc.count()) === 0) continue;
      out.push({ action, label: norm(await loc.innerText()), enabled: await loc.isEnabled() });
    }
    return out;
  }

  // ---- cards / view toggle ------------------------------------------------------------------

  private cardLocators(): Locator {
    return this.el(ROLE_LIST_IDS.cards).locator(`article[id^="${ROLE_LIST_IDS.cardPrefix}"]`);
  }

  async cardIds(): Promise<string[]> {
    const ids = await this.cardLocators().evaluateAll((els) => els.map((e) => e.id));
    const re = new RegExp(`^${ROLE_LIST_IDS.cardPrefix}(${GUID})$`);
    return ids.map((id) => id.match(re)?.[1] ?? '').filter(Boolean);
  }

  card(id: string): Locator {
    return this.el(ROLE_CARD.card(id));
  }

  cardAction(id: string, action: RoleCardAction): Locator {
    return this.button(ROLE_CARD.action(id, action));
  }

  /** Card actions present (by id) with enabled state. */
  async cardActions(id: string): Promise<{ action: RoleCardAction; enabled: boolean }[]> {
    const out: { action: RoleCardAction; enabled: boolean }[] = [];
    for (const action of ['edit', 'view', 'delete'] as RoleCardAction[]) {
      const host = this.el(ROLE_CARD.action(id, action));
      if ((await host.count()) === 0) continue;
      out.push({ action, enabled: await this.cardAction(id, action).isEnabled() });
    }
    return out;
  }

  async switchToCards(): Promise<void> {
    await this.button(ROLE_VIEW_TOGGLE.cards).click();
    await expect(this.el(ROLE_LIST_IDS.cards), 'the cards view should render').toBeVisible({ timeout: Timeouts.default });
  }

  async switchToTable(): Promise<void> {
    await this.button(ROLE_VIEW_TOGGLE.table).click();
    await expect(this.el(ROLE_LIST_IDS.tableEl), 'the table view should render').toBeVisible({ timeout: Timeouts.default });
  }

  async isTableShown(): Promise<boolean> {
    return this.el(ROLE_LIST_IDS.tableEl).isVisible().catch(() => false);
  }

  // ---- pager --------------------------------------------------------------------------------

  async goToPage(n: number): Promise<RoleListResult> {
    return this.listAnswerDuring(() => this.button(ROLE_PAGER.page(n)).click(), (b) => b.pageNumber === n);
  }

  async nextPage(): Promise<RoleListResult> {
    return this.listAnswerDuring(() => this.button(ROLE_LIST_IDS.pagerNext).click());
  }

  async pagerState(): Promise<{ prevEnabled: boolean; nextEnabled: boolean; pages: number[] }> {
    const pages = await this.el(ROLE_LIST_IDS.pager).locator('button[id^="role-list-table-pager-page-"]').evaluateAll((els) =>
      els.map((e) => Number(e.id.replace('role-list-table-pager-page-', ''))).filter((n) => !Number.isNaN(n)));
    return { prevEnabled: await this.button(ROLE_LIST_IDS.pagerPrev).isEnabled(), nextEnabled: await this.button(ROLE_LIST_IDS.pagerNext).isEnabled(), pages };
  }

  // ---- drawers ------------------------------------------------------------------------------

  async openAdd(): Promise<RoleFormDrawer> {
    Logger.step('[roles] Add Role');
    await this.button(ROLE_LIST_IDS.addButton).click();
    await this.form.waitOpen();
    return this.form;
  }

  /** Edit from the row (table) - waits for the drawer (GetRole) to fill. */
  async openEdit(id: string): Promise<RoleFormDrawer> {
    Logger.step(`[roles] Edit ${id}`);
    const loaded = this.page.waitForResponse((r) => r.url().includes(ApiEndpoints.roleGet) && !r.url().includes('GetRoles'), { timeout: Timeouts.default }).catch(() => null);
    await this.action(id, 'edit').click();
    await this.form.waitOpen();
    await loaded;
    await expect(this.form.field('englishName')).not.toHaveValue('', { timeout: Timeouts.default });
    return this.form;
  }

  async openView(id: string): Promise<RoleViewDrawer> {
    Logger.step(`[roles] View ${id}`);
    await this.action(id, 'view').click();
    await this.view.waitOpen();
    return this.view;
  }

  /** Deactivate on an ACTIVE row -> the deactivate drawer. */
  async openDeactivate(id: string): Promise<RoleDeactivateDrawer> {
    await expect(this.action(id, 'toggle-active')).toHaveText(ROLE_TOGGLE_LABEL.inactivate, { timeout: Timeouts.default });
    await this.action(id, 'toggle-active').click();
    await this.deactivate.waitOpen();
    return this.deactivate;
  }

  /** Activate on an INACTIVE row -> the confirm dialog. */
  async openActivate(id: string): Promise<RoleConfirmDialog> {
    await this.action(id, 'toggle-active').click();
    await this.dialog.waitOpen();
    return this.dialog;
  }

  async openDelete(id: string): Promise<RoleConfirmDialog> {
    await this.action(id, 'delete').click();
    await this.dialog.waitOpen();
    return this.dialog;
  }

  /** Whether any dialog / drawer opened within `ms` after a click (for "a disabled control opens nothing"). */
  async somethingOpened(ms = Timeouts.short): Promise<boolean> {
    const any = [this.el(ROLE_DIALOG.root), this.el('role-deactivate-drawer-title'), this.el('role-form-drawer-title')];
    const results = await Promise.all(any.map((l) => l.waitFor({ state: 'visible', timeout: ms }).then(() => true, () => false)));
    return results.some(Boolean);
  }

  // ---- toasts -------------------------------------------------------------------------------

  /** The first NEW toast ("summary detail") after `action`. */
  async toastAfter(action: () => Promise<void>): Promise<string> {
    return toastAfter(this.page, action);
  }

  /** The visible toast whose text contains `summary` (summary + detail). */
  async toastWith(summary: string | RegExp): Promise<{ summary: string; detail: string }> {
    const toast = this.el(ROLE_TOAST.root).filter({ hasText: summary }).first();
    await expect(toast).toBeVisible({ timeout: Timeouts.toast });
    return {
      summary: norm(await toast.locator(`#${ROLE_TOAST.summary}`).innerText().catch(() => '')),
      detail: norm(await toast.locator(`#${ROLE_TOAST.detail}`).innerText().catch(() => '')),
    };
  }

  // ---- export -------------------------------------------------------------------------------

  /** Opens Export and returns the two scope labels. */
  async exportScopes(): Promise<string[]> {
    await this.button(ROLE_LIST_IDS.exportTrigger).click();
    const menu = this.el(ROLE_LIST_IDS.exportMenu);
    await expect(menu).toBeVisible({ timeout: Timeouts.default });
    const labels = [norm(await this.el(ROLE_LIST_IDS.exportSelected).innerText()), norm(await this.el(ROLE_LIST_IDS.exportAll).innerText())];
    await this.page.keyboard.press('Escape');
    return labels;
  }

  /**
   * Runs an export (Selected Export / Export All Data). If a format dialog appears the given format is chosen.
   * Returns the file name, the parsed sheet, the toast after it and whether a format dialog was offered.
   */
  async exportFile(scope: 'selected' | 'all', format: 'excel' | 'csv' = 'excel'): Promise<{ filename: string; parsed: ParsedXlsx; toast: string; formatDialog: boolean }> {
    await this.button(ROLE_LIST_IDS.exportTrigger).click();
    await expect(this.el(ROLE_LIST_IDS.exportMenu)).toBeVisible({ timeout: Timeouts.default });
    const downloadP = this.page.waitForEvent('download', { timeout: Timeouts.queuePropagation });
    let formatDialog = false;
    let download: Download | null = null;
    const toast = await toastAfter(this.page, async () => {
      await this.el(scope === 'all' ? ROLE_LIST_IDS.exportAll : ROLE_LIST_IDS.exportSelected).click();
      const formatButton = this.page.locator(`button#pbm-dialog-action-${format}, #pbm-dialog-action-${format} > button`).first();
      formatDialog = await formatButton.waitFor({ state: 'visible', timeout: Timeouts.short }).then(() => true, () => false);
      if (formatDialog) await formatButton.click();
      download = await downloadP;
    });
    const d = download as unknown as Download;
    const stream = await d.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const bytes = Buffer.concat(chunks);
    const filename = d.suggestedFilename();
    const parsed: ParsedXlsx = /\.csv$/i.test(filename) ? { ...parseCsv(bytes.toString('utf8')), rightToLeft: false } : parseXlsx(bytes);
    Logger.step(`[roles] Export ${scope} -> ${filename}`);
    return { filename, parsed, toast, formatDialog };
  }
}
