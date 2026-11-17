import type { Download, Locator, Page, Response } from '@playwright/test';
import { expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { Timeouts } from '../../constants/Timeouts';
import { NC_DIALOG, NC_LIST, NC_ROUTE, NC_TABS, NC_TRIGGER_ROW, type NcTab } from '../../constants/notification/notificationIds';
import { Logger } from '../../utils/Logger';
import { parseXlsx, type ParsedXlsx } from '../../utils/XlsxUtils';
import { chooseSelectOption, readSelectOptions } from '../components/PrimeControls';

/**
 * System Settings > Notification Center - the three tabs (foundation 2026-11-11).
 *
 *   Triggers (Email&SMS)  ?tab=triggers       GetTriggers       Add Trigger
 *   App Notification      ?tab=definitions    GetDefinitions    Create
 *   Announcements         ?tab=announcements  GetAnnouncements  Create (+ "Next job MM:SS")
 *
 * Each tab is the same list (namespace `nc-<tab>`): search (server side,
 * `searchText`, also shown as a `search` chip), filter drawer, sort menu +
 * direction, Export (menu "Selected Export" / "Export All Data" -> .xlsx),
 * the table (10 rows a page, `sortBy: "CreatedOn desc"` by default), row
 * actions, pager. Every list change waits for the tab's OWN answer, armed
 * before the action - never a fixed sleep.
 */
const LIST_API: Record<NcTab, string> = {
  triggers: '/api/TriggersConfiguration/GetTriggers',
  definitions: '/api/NotificationDefinition/GetDefinitions',
  announcements: '/api/Announcement/GetAnnouncements',
};

/** The body + answer of one list request (what the screen asked and what it got). */
export interface ListAnswer {
  request: Record<string, unknown>;
  status: number;
  totalRows: number;
  items: Record<string, unknown>[];
}

export class NotificationCenterPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  tabButton(tab: NcTab): Locator {
    return this.byId(NC_TABS.tab(tab));
  }

  /** Opens the page on `tab` and waits for that tab's first list answer. */
  async open(tab: NcTab = 'triggers'): Promise<ListAnswer | null> {
    const answer = this.listAnswer(tab);
    await this.goto(`${NC_ROUTE}?tab=${tab}`);
    await expect(this.byId(NC_LIST.tableEl(tab)), `the ${tab} list should render`).toBeVisible({ timeout: Timeouts.default });
    return answer;
  }

  /** Switches tab by clicking it (waits for its list answer). */
  async switchTo(tab: NcTab): Promise<ListAnswer | null> {
    const answer = this.listAnswer(tab);
    await this.tabButton(tab).click();
    await expect(this.byId(NC_LIST.tableEl(tab))).toBeVisible({ timeout: Timeouts.default });
    return answer;
  }

  /** Arms a wait for the tab's list answer (call BEFORE the action) and parses it. */
  listAnswer(tab: NcTab, timeout: number = Timeouts.default): Promise<ListAnswer | null> {
    return this.page
      .waitForResponse((r) => r.url().includes(LIST_API[tab]) && r.request().method() === 'POST', { timeout })
      .then(async (r: Response) => parseListAnswer(r))
      .catch(() => null);
  }
}

async function parseListAnswer(r: Response): Promise<ListAnswer> {
  let request: Record<string, unknown> = {};
  try {
    request = JSON.parse(r.request().postData() ?? '{}') as Record<string, unknown>;
  } catch {
    /* no body */
  }
  let totalRows = 0;
  let items: Record<string, unknown>[] = [];
  try {
    const p = (JSON.parse(await r.text()) as { payload?: { totalRows?: number; items?: Record<string, unknown>[] } }).payload;
    totalRows = p?.totalRows ?? 0;
    items = p?.items ?? [];
  } catch {
    /* not JSON */
  }
  return { request, status: r.status(), totalRows, items };
}

/** What an export produced. */
export interface NcExport {
  filename: string;
  bytes: Buffer;
  /** null when the file is not a workbook. */
  sheet: ParsedXlsx | null;
}

/**
 * One tab's list - shared by TriggersTab / DefinitionsTab / AnnouncementsTab.
 * Writers read rows by the record id (from the API or `rowIdByName`), never
 * by position.
 */
export class NcListTab extends BasePage {
  readonly center: NotificationCenterPage;

  constructor(page: Page, readonly tab: NcTab) {
    super(page);
    this.center = new NotificationCenterPage(page);
  }

  /** Opens the page on this tab. */
  async open(): Promise<ListAnswer | null> {
    return this.center.open(this.tab);
  }

  listAnswer(timeout?: number): Promise<ListAnswer | null> {
    return this.center.listAnswer(this.tab, timeout);
  }

  // ---- toolbar ------------------------------------------------------------------------

  searchInput(): Locator {
    return this.byId(NC_LIST.searchInput(this.tab));
  }

  addButton(): Locator {
    return this.btn(NC_LIST.addButton(this.tab));
  }

  /** Types the term, presses Enter and waits for the list's answer (the request carries `searchText`). */
  async search(term: string): Promise<ListAnswer | null> {
    Logger.step(`[${this.tab}] searching "${term}"`);
    const answer = this.listAnswer();
    await this.searchInput().fill(term);
    await this.searchInput().press('Enter');
    const a = await answer;
    await this.waitForRowsToSettle();
    return a;
  }

  /** Opens the sort menu and returns the option ids it offers (suffix after `-sort-option-`). */
  async sortOptions(): Promise<string[]> {
    await this.byId(NC_LIST.sortTrigger(this.tab)).click();
    await expect(this.byId(NC_LIST.sortMenu(this.tab))).toBeVisible({ timeout: Timeouts.default });
    const prefix = `nc-${this.tab}-sort-option-`;
    return this.page.locator(`[id^="${prefix}"]`).evaluateAll((els, p) => els.map((e) => e.id.slice(p.length)), prefix);
  }

  /** The sort option labels as shown (menu opened and closed again). */
  async sortOptionLabels(): Promise<string[]> {
    const ids = await this.sortOptions();
    const labels: string[] = [];
    for (const id of ids) labels.push((await this.byId(NC_LIST.sortOption(this.tab, id)).innerText()).trim());
    await this.byId(NC_LIST.sortTrigger(this.tab)).click();
    return labels;
  }

  /** Chooses a sort option by key (e.g. 'name', 'newest') and waits for the answer (its `sortBy`). */
  async sortBy(key: string): Promise<ListAnswer | null> {
    Logger.step(`[${this.tab}] sort by ${key}`);
    // A menu still animating shut reads "visible" while its options are already gone (rerun1 21549): open the
    // menu unless the wanted OPTION is usable, and let a closing menu finish closing before clicking the trigger.
    if (!(await this.byId(NC_LIST.sortOption(this.tab, key)).isVisible().catch(() => false))) {
      await this.byId(NC_LIST.sortMenu(this.tab)).waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => undefined);
      await this.byId(NC_LIST.sortTrigger(this.tab)).click();
    }
    const answer = this.listAnswer();
    await this.byId(NC_LIST.sortOption(this.tab, key)).click();
    const a = await answer;
    await this.waitForRowsToSettle();
    return a;
  }

  /** The current sort label on the trigger ("Newest", "Name", ...). */
  async sortLabel(): Promise<string> {
    return (await this.byId(NC_LIST.sortTrigger(this.tab)).innerText()).trim();
  }

  async toggleSortDirection(): Promise<ListAnswer | null> {
    const answer = this.listAnswer();
    await this.byId(NC_LIST.sortDirection(this.tab)).click();
    const a = await answer;
    await this.waitForRowsToSettle();
    return a;
  }

  // ---- filter drawer ("Advanced Search") ----------------------------------------------

  async openFilter(): Promise<void> {
    await this.byId(NC_LIST.filterButton(this.tab)).click();
    await expect(this.byId(NC_LIST.filterTitle(this.tab)), 'the filter drawer should open').toBeVisible({ timeout: Timeouts.default });
  }

  filterField(key: string): Locator {
    return this.byId(NC_LIST.filterField(this.tab, key));
  }

  private combo(l: Locator): Locator {
    return l.locator('xpath=descendant-or-self::*[@role="combobox"]').first();
  }

  async filterOptions(key: string): Promise<string[]> {
    return readSelectOptions(this.page, this.combo(this.filterField(key)));
  }

  /** Sets a select filter by its label, or types a text filter (name). */
  async setFilter(key: string, value: string): Promise<void> {
    const field = this.filterField(key);
    if ((await this.combo(field).count()) > 0) await chooseSelectOption(this.page, this.combo(field), value);
    else await field.locator('xpath=descendant-or-self::input').first().fill(value);
  }

  /** Clicks the drawer's Search and waits for the filtered answer. */
  async applyFilter(): Promise<ListAnswer | null> {
    const answer = this.listAnswer();
    await this.byId(NC_LIST.filterSearchButton(this.tab)).click();
    const a = await answer;
    await this.waitForRowsToSettle();
    return a;
  }

  /** Opens the drawer, sets every filter, applies. */
  async filter(values: Record<string, string>): Promise<ListAnswer | null> {
    await this.openFilter();
    for (const [k, v] of Object.entries(values)) await this.setFilter(k, v);
    return this.applyFilter();
  }

  /** The chips shown: `{ field: text }` (`search` = the search text). */
  async chips(): Promise<Record<string, string>> {
    const prefix = NC_LIST.chipPrefix(this.tab);
    return this.page.locator(`[id^="${prefix}"]:not([id$="-remove"])`).evaluateAll((els, p) => {
      const out: Record<string, string> = {};
      for (const e of els) out[e.id.slice(p.length)] = (e.textContent ?? '').replace(/\s+/g, ' ').trim();
      return out;
    }, prefix);
  }

  /** Removes a chip and waits for the answer. */
  async removeChip(field: string): Promise<ListAnswer | null> {
    const answer = this.listAnswer();
    await this.byId(NC_LIST.chipRemove(this.tab, field)).click();
    const a = await answer;
    await this.waitForRowsToSettle();
    return a;
  }

  // ---- table --------------------------------------------------------------------------

  rows(): Locator {
    // Data rows are keyed by the record id (`nc-<tab>-table-row-<id>`); the tr filter drops their child ids.
    return this.page.locator(`tr[id^="${NC_LIST.rowPrefix(this.tab)}"]`);
  }

  row(id: string): Locator {
    return this.byId(NC_LIST.row(this.tab, id));
  }

  cell(id: string, key: string): Locator {
    return this.byId(NC_LIST.cell(this.tab, id, key));
  }

  rowAction(id: string, action: string): Locator {
    return this.byId(NC_LIST.rowAction(this.tab, id, action));
  }

  emptyState(): Locator {
    return this.byId(NC_LIST.tableEmpty(this.tab));
  }

  /** Waits for the table's text to stop changing (renders after the answer). */
  async waitForRowsToSettle(): Promise<void> {
    let previous = '';
    for (let i = 0; i < 12; i += 1) {
      const now = await this.byId(NC_LIST.tableEl(this.tab)).innerText().catch(() => '');
      if (now === previous) return;
      previous = now;
      await this.page.waitForTimeout(250);
    }
  }

  /** Record ids of the rows on the current page, top to bottom. */
  async rowIds(): Promise<string[]> {
    const prefix = NC_LIST.rowPrefix(this.tab);
    return this.rows().evaluateAll((els, p) => els.map((e) => e.id.slice(p.length)), prefix);
  }

  /** A column's texts on the current page, top to bottom. */
  async column(key: string): Promise<string[]> {
    const out: string[] = [];
    for (const id of await this.rowIds()) out.push((await this.cell(id, key).innerText().catch(() => '')).replace(/\s+/g, ' ').trim());
    return out;
  }

  /** The visible rows as `{ id, <column>: text }`. */
  async readRows(columns: readonly string[]): Promise<Record<string, string>[]> {
    const rows: Record<string, string>[] = [];
    for (const id of await this.rowIds()) {
      const r: Record<string, string> = { id };
      for (const c of columns) r[c] = (await this.cell(id, c).innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
      rows.push(r);
    }
    return rows;
  }

  /** The id of the row whose name cell is exactly `name` (searches first). '' when not listed. */
  async rowIdByName(name: string, searchFirst = true): Promise<string> {
    if (searchFirst) await this.search(name);
    for (const id of await this.rowIds()) {
      if ((await this.cell(id, 'name').innerText().catch(() => '')).trim() === name) return id;
    }
    return '';
  }

  /** The action keys a row offers (e.g. ['edit', 'toggle-active', 'delete']). */
  async rowActions(id: string): Promise<string[]> {
    const prefix = `${NC_LIST.row(this.tab, id)}-`;
    const known = ['view', 'edit', 'toggle-active', 'delete', 'cancel', 'reschedule'];
    return this.page.locator(`[id^="${prefix}"]`).evaluateAll(
      (els, args) => els
        .filter((e) => (e as HTMLElement).offsetParent !== null)
        .map((e) => e.id.slice(args.prefix.length))
        .filter((k) => args.known.includes(k)),
      { prefix, known },
    );
  }

  /** The label of a row's toggle (Activate / Deactivate). */
  async toggleLabel(id: string): Promise<string> {
    return (await this.rowAction(id, 'toggle-active').innerText()).trim();
  }

  // ---- shared dialog (toggle confirmation, unsaved changes, preview) -------------------

  dialog(key: 'root' | 'title' | 'message' | 'close'): Locator {
    return this.byId(NC_DIALOG[key]);
  }

  dialogAction(key: Parameters<typeof NC_DIALOG.action>[0]): Locator {
    return this.btn(NC_DIALOG.action(key));
  }

  async dialogText(): Promise<{ title: string; message: string }> {
    await expect(this.dialog('title')).toBeVisible({ timeout: Timeouts.default });
    return { title: (await this.dialog('title').innerText()).trim(), message: (await this.dialog('message').innerText()).trim() };
  }

  /**
   * Clicks a row action that writes (toggle / delete / cancel), answers the
   * confirmation when one appears (`confirm` true = Yes, false = No), and
   * returns the dialog text seen and the write's answer. NOTE (probe
   * 2026-11-11): Delete Trigger sent DELETE at once with NO confirmation
   * dialog - `dialog` is then null, which is itself what such a case asserts.
   */
  async rowActionWithConfirm(
    id: string,
    action: 'toggle-active' | 'delete' | 'cancel',
    confirm: boolean,
    apiFragment: string,
  ): Promise<{ dialog: { title: string; message: string } | null; status: number | null; answer: string }> {
    const write = this.page.waitForResponse((r) => r.url().includes(apiFragment) && r.request().method() !== 'GET', { timeout: Timeouts.default }).catch(() => null);
    await this.rowAction(id, action).click();
    const shown = await this.dialog('title').waitFor({ state: 'visible', timeout: 2_500 }).then(() => true).catch(() => false);
    const dialog = shown ? await this.dialogText() : null;
    if (shown) await this.dialogAction(confirm ? 'confirm' : 'cancel').click();
    if (shown && !confirm) {
      await expect(this.dialog('title')).toBeHidden({ timeout: Timeouts.default });
      return { dialog, status: null, answer: '' };
    }
    const r = await write;
    await this.waitForRowsToSettle();
    return { dialog, status: r?.status() ?? null, answer: (await r?.text().catch(() => '')) ?? '' };
  }

  /** The toast's text right after an action ('' when none appears within `timeout`). */
  async toastText(timeout: number = Timeouts.short): Promise<string> {
    return this.isToastVisible(timeout).then(async (v) => (v ? (await this.getToastMessage()).replace(/\s+/g, ' ') : ''));
  }

  // ---- pager --------------------------------------------------------------------------

  async goToPage(n: number): Promise<ListAnswer | null> {
    const answer = this.listAnswer();
    await this.byId(NC_LIST.pagerPage(this.tab, n)).click();
    const a = await answer;
    await this.waitForRowsToSettle();
    return a;
  }

  async nextPage(): Promise<ListAnswer | null> {
    const answer = this.listAnswer();
    await this.byId(NC_LIST.pagerNext(this.tab)).click();
    const a = await answer;
    await this.waitForRowsToSettle();
    return a;
  }

  // ---- export -------------------------------------------------------------------------

  async openExportMenu(): Promise<string[]> {
    await this.byId(NC_LIST.exportTrigger(this.tab)).click();
    await expect(this.byId(NC_LIST.exportMenu(this.tab))).toBeVisible({ timeout: Timeouts.default });
    return [
      (await this.byId(NC_LIST.exportSelected(this.tab)).innerText().catch(() => '')).trim(),
      (await this.byId(NC_LIST.exportAll(this.tab)).innerText().catch(() => '')).trim(),
    ].filter(Boolean);
  }

  /**
   * Exports (`selected` = the filtered/searched rows, `all` = everything) and
   * reads the downloaded .xlsx. The download is armed BEFORE the click. A
   * format dialog, if the app shows one, is answered with Excel.
   */
  async export(scope: 'all' | 'selected'): Promise<NcExport> {
    if (!(await this.byId(NC_LIST.exportMenu(this.tab)).isVisible().catch(() => false))) await this.openExportMenu();
    Logger.step(`[${this.tab}] export ${scope}`);
    const download = this.page.waitForEvent('download', { timeout: Timeouts.queuePropagation });
    await this.byId(scope === 'all' ? NC_LIST.exportAll(this.tab) : NC_LIST.exportSelected(this.tab)).click();
    const formatDialog = await this.dialogAction('excel').waitFor({ state: 'visible', timeout: 1_500 }).then(() => true).catch(() => false);
    if (formatDialog) await this.dialogAction('excel').click();
    const d: Download = await download;
    const stream = await d.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const bytes = Buffer.concat(chunks);
    let sheet: ParsedXlsx | null = null;
    if (bytes.subarray(0, 2).toString() === 'PK') sheet = parseXlsx(bytes);
    return { filename: d.suggestedFilename(), bytes, sheet };
  }
}

/** Triggers (Email&SMS). Columns name/module/action/recipient/predefined/active; predefined rows: Edit only. */
export class TriggersTab extends NcListTab {
  constructor(page: Page) {
    super(page, 'triggers');
  }

  predefinedBadge(id: string): Locator {
    return this.byId(NC_TRIGGER_ROW.predefinedBadge(id));
  }

  predefinedNone(id: string): Locator {
    return this.byId(NC_TRIGGER_ROW.predefinedNone(id));
  }
}

/** App Notification (definitions). Columns name/module/action/active. */
export class DefinitionsTab extends NcListTab {
  constructor(page: Page) {
    super(page, 'definitions');
  }
}

/** Announcements. Columns name/status/publishat/audiences; header "Next job MM:SS". */
export class AnnouncementsTab extends NcListTab {
  constructor(page: Page) {
    super(page, 'announcements');
  }
}
