import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { ListPageBase } from '../components/ListPageBase';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ExportMenu } from '../components/ExportMenu';
import { setCheckbox } from '../components/PrimeControls';
import { TerminologyFormDrawer, type SaveAnswer } from './TerminologyFormDrawer';
import { TerminologyDeactivateDrawer } from './TerminologyDeactivateDrawer';
import { TerminologyDetailPage } from './TerminologyDetailPage';
import { AppRoutes } from '../../constants/AppRoutes';
import { Timeouts } from '../../constants/Timeouts';
import {
  GLOBAL,
  NAV,
  TERMINOLOGY_CARD,
  TERMINOLOGY_COLUMN,
  TERMINOLOGY_DEACTIVATE,
  TERMINOLOGY_EXPORT,
  TERMINOLOGY_FILTER_FIELD,
  TERMINOLOGY_LIST,
  TERMINOLOGY_ROW_ACTION,
  TERMINOLOGY_SORT_FIELD,
  TOAST,
  buttonSelector,
  type TerminologyCardAction,
  type TerminologyColumn,
  type TerminologyFilterField,
  type TerminologyRowAction,
  type TerminologySortField,
} from '../../constants/ElementIds';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import { NetworkUtils } from '../../utils/NetworkUtils';
import { WaitUtils } from '../../utils/WaitUtils';
import { Logger } from '../../utils/Logger';
import { parseXlsx, type ParsedXlsx } from '../../utils/XlsxUtils';
import { parseCsv } from '../../utils/CsvUtils';
import {
  auditEntryCount,
  deleteRecord,
  deleteTerminology,
  listTerminologies,
  lookupListNames,
  mappedValues,
  requestCreate,
  offeredTerminologyNames,
  readErrorRows,
  readImportJob,
  readRecords,
  readTerminology,
  setTerminologyActive,
  setTerminologyLocked,
  updateTerminology,
  uploadImport,
  upsertRecord,
  waitForImport,
  type TerminologyAnswer,
  type TerminologyErrorRow,
  type TerminologyImportJob,
  type TerminologyListItem,
  type TerminologyRecord,
  type TerminologyRow,
} from '../../utils/TerminologyProvisioning';

/** How a control is offered: not rendered, rendered but disabled, or usable. */
export type Availability = 'absent' | 'disabled' | 'available';

/** One action control as the screen renders it. */
export interface ActionState {
  availability: Availability;
  /** Its visible label ("Inactivate", "Unlock", ...), '' when absent. */
  label: string;
  /** Its tooltip - where the screen explains a disabled control. */
  title: string;
}

/** Matches `text` as the WHOLE text of an element (whitespace aside). */
const exactText = (text: string): RegExp => new RegExp(`^\\s*${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`);

/** One list row, by column. */
export type TerminologyRowValues = Record<TerminologyColumn, string>;

/** One card of the Cards view. */
export interface TerminologyCardValues {
  title: string;
  description: string;
  fields: string;
  subscribed: string;
  locked: string;
}

/** What one list request answered. */
export interface TerminologyListAnswer {
  items: TerminologyListItem[];
  totalRows: number;
}

/** The criteria the advanced search offers; a flag left out is not touched. */
export type TerminologyCriteria = Partial<Record<TerminologyFilterField, string | boolean>>;

/**
 * The Terminology Management list (`/terminology-management`).
 *
 * The shared list component (ListPageBase): search box, Sort By, Export, Add
 * Terminology, table rows `terminology-list-table-row-{id}` and the Cards view.
 * Row actions are View / Edit / an Activate-Inactivate toggle / a Lock-Unlock
 * toggle / Delete; a withheld action is rendered DISABLED with its reason in the
 * button's title (verified 2026-10-29), so actions are read as ActionState
 * rather than as present / absent.
 */
export class TerminologyManagementPage extends ListPageBase {
  constructor(page: Page) {
    super(page, TERMINOLOGY_LIST.screen);
  }

  /** Opens the list and waits for it to render (rows or its empty state). */
  async open(): Promise<void> {
    await this.goto(AppRoutes.terminologyManagement);
    await this.ensureTableView(this.screen);
    await this.waitForRowsRendered();
  }

  async openList(): Promise<void> {
    await this.open();
  }

  /**
   * The list's empty state. It carries no id of its own: with nothing to list
   * the table is not rendered at all and the list area reads "No results
   * found." (verified 2026-10-29) - so ListPageBase's `-table-empty` id never
   * appears and every wait for rows-or-empty would time out.
   */
  protected emptyState(): Locator {
    return this.byId(this.screen).getByText(/no results found|no records|no terminologies/i).first();
  }

  /**
   * A row by the terminology's NAME, matched exactly in its name cell.
   * ListPageBase matches any text in the row, and the predefined names are
   * common words: "City" found the District row, whose description reads
   * "Each district is linked to a city" (seen 2026-10-30).
   */
  protected rowByText(text: string): Locator {
    return this.rows().filter({
      has: this.page.locator(`[id$="-cell-${TERMINOLOGY_COLUMN.name}"]`, { hasText: exactText(text) }),
    }).first();
  }

  /**
   * Searches without demanding the table: a search that matches nothing
   * renders no table (see `emptyState`), so ListPageBase's ensureTableView
   * would wait out its budget on a correct answer. Table view is chosen only
   * when the Cards view is the active one.
   */
  async search(term: string): Promise<void> {
    Logger.step(`Searching for "${term}"`);
    // A case may still be on a detail screen; a list read always starts from the list.
    if (!(await this.searchInput().isVisible())) await this.open();
    const tableToggle = this.btn(GLOBAL.viewToggleTable);
    if ((await tableToggle.getAttribute('aria-selected').catch(() => 'true')) !== 'true') await this.ensureTableView(this.screen);
    const input = this.searchInput();
    // The same term again sends no request; clear it so the search below is answered afresh.
    if ((await input.inputValue()) === term) await input.fill('');
    // Wait for THIS search's answer: the rows on screen before it count as "rendered", and a
    // lookup that read them paged the unfiltered list, then landed on page 2 of a one-row
    // result - "No results found" for Street (20282, 2026-10-30).
    const answered = this.page
      .waitForResponse((r) => r.url().includes(ApiEndpoints.terminologyList) && (r.request().postData() ?? '').includes(`"searchText":${JSON.stringify(term)}`), { timeout: Timeouts.default })
      .catch(() => null);
    await input.fill(term);
    await input.press('Enter');
    await answered;
    await this.waitForPageReady();
    await this.waitForRowsRendered();
  }

  /**
   * Searches for a terminology by name and pages on until its row shows. A
   * search is a contains-match on name and description and pages at ten rows:
   * "Country" also matched City and the suite's own "Country <stamp>" rows, and
   * the predefined Country landed on page 2 (20282, 2026-10-30).
   */
  async revealRow(name: string): Promise<void> {
    await this.search(name);
    await this.pageUntilShown(name);
  }

  /**
   * Pages on until the row shows. Each turn waits for the rows to be replaced:
   * read straight after the click, the old page still showed and the next
   * check clicked a Next that page 2 had just disabled (20233, 2026-10-30).
   */
  private async pageUntilShown(name: string): Promise<void> {
    const firstRowId = (): Promise<string | null> => this.rows().first().getAttribute('id').catch(() => null);
    for (let page = 1; page < 10 && !(await this.rowByText(name).isVisible()) && (await this.nextPageButton().isEnabled().catch(() => false)); page += 1) {
      const before = await firstRowId();
      await this.nextPageButton().click();
      await expect.poll(firstRowId, { timeout: Timeouts.default, message: 'the list should show its next page' }).not.toBe(before);
    }
  }

  /** Navigates to the module WITHOUT expecting it to load - for the denied-access cases. */
  async openExpectingDenial(): Promise<void> {
    await this.goto(AppRoutes.terminologyManagement);
  }

  /** Whether the list table rendered for this session within the default wait. */
  async isListRendered(): Promise<boolean> {
    return this.table().waitFor({ state: 'visible', timeout: Timeouts.default }).then(() => true).catch(() => false);
  }

  /** Whether the navigation menu offers Terminology Mgmt to this session. */
  async isModuleOffered(): Promise<boolean> {
    return this.byId(NAV.terminologyManagement).waitFor({ state: 'visible', timeout: Timeouts.short }).then(() => true).catch(() => false);
  }

  /** The text the page shows - for the denied / empty states. */
  async getPageText(): Promise<string> {
    return (await this.page.locator('main').first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  /**
   * Opens the list when it is expected to hold NO rows. With nothing to list
   * the screen may render its empty state instead of the table, so this waits
   * for the request and the page to settle rather than for the table.
   */
  async openExpectingEmpty(): Promise<void> {
    await this.captureList(() => this.goto(AppRoutes.terminologyManagement)).catch(() => undefined);
    await this.waitForPageReady();
  }

  /** The empty-state text of the list area, '' when rows are listed. */
  async getEmptyStateText(): Promise<string> {
    const own = (await this.emptyState().innerText({ timeout: Timeouts.short }).catch(() => '')).trim();
    if (own !== '') return own;
    return (await this.byId(this.screen).innerText({ timeout: Timeouts.short }).catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  // ---- reading the list ----------------------------------------------------

  /** Runs `action` and returns what the list request it triggered answered. */
  async captureList(action: () => Promise<void>): Promise<TerminologyListAnswer> {
    const body = await NetworkUtils.captureJsonResponseMatching<{ payload: { terminologies: TerminologyListAnswer } }>(
      this.page,
      /\/GetTerminologies$/,
      action,
    );
    await this.waitForRowsRendered();
    return body?.payload.terminologies ?? { items: [], totalRows: -1 };
  }

  /** Runs `action` and returns the BODY of the list request it sent. */
  async captureListRequest(action: () => Promise<void>): Promise<Record<string, unknown>> {
    const waiting = this.page.waitForRequest((request) => /\/GetTerminologies$/.test(request.url()), { timeout: Timeouts.default }).catch(() => null);
    await action();
    const request = await waiting;
    await this.waitForRowsRendered();
    return (request?.postDataJSON() as Record<string, unknown> | null) ?? {};
  }

  /** Searches and waits for the list to answer; returns what it answered. */
  async searchFor(term: string): Promise<TerminologyListAnswer> {
    return this.captureList(() => this.search(term));
  }

  /** Whether a terminology is listed after searching its name. */
  async isListed(name: string): Promise<boolean> {
    // A session refused the module has no list to search - that is "not listed", not an error.
    const searched = await this.revealRow(name).then(() => true).catch(() => false);
    return searched && this.isRowVisible(name);
  }

  /** The names of the rows on screen. */
  async readNames(): Promise<string[]> {
    await this.waitForRowsRendered();
    return this.readColumn(TERMINOLOGY_COLUMN.name);
  }

  /** One row's values by column (searches for it first). */
  async readRow(name: string): Promise<TerminologyRowValues> {
    await this.revealRow(name);
    await this.waitForRowVisible(name);
    const out = {} as TerminologyRowValues;
    for (const [key, column] of Object.entries(TERMINOLOGY_COLUMN) as [TerminologyColumn, string][]) {
      if (key === 'actions') continue;
      out[key] = await this.getCellValue(name, column);
    }
    // The actions sit in `{rowId}-actions`, not in a `-cell-actions` cell (verified 2026-10-29).
    out.actions = (await this.byId(`${await this.rowId(name)}-${TERMINOLOGY_COLUMN.actions}`).innerText()).replace(/\s+/g, ' ').trim();
    return out;
  }

  /** The column headers, as labelled. */
  async getHeaderTexts(): Promise<string[]> {
    const headers = await this.page.locator(`th[id^="${this.screen}-table-th-"]`).allInnerTexts();
    return headers.map((text) => text.trim()).filter((text) => text !== '');
  }

  /** The whole text of one row - for markers the columns do not carry. */
  async getRowText(name: string): Promise<string> {
    await this.revealRow(name);
    await this.waitForRowVisible(name);
    return (await this.rowByText(name).innerText()).replace(/\s+/g, ' ').trim();
  }

  // ---- row actions -----------------------------------------------------------

  private async actionButton(name: string, action: TerminologyRowAction): Promise<Locator> {
    const id = await this.rowId(name);
    return this.page.locator(`#${id}-${TERMINOLOGY_ROW_ACTION[action]}`).first();
  }

  /**
   * How a row offers one action. A row not on screen is searched for first:
   * the suite's own terminologies push the predefined ones off page one
   * ("Policy Holder" and "Country" were not found in the 2026-10-30 run).
   */
  async getActionState(name: string, action: TerminologyRowAction): Promise<ActionState> {
    if (!(await this.rowByText(name).isVisible())) await this.revealRow(name);
    await this.waitForRowVisible(name);
    // Read in one pass: the list can re-render under a search, and a button found by count()
    // then detached left isEnabled() waiting its whole budget (20282 on Street, 2026-10-30).
    const [state] = await (await this.actionButton(name, action)).evaluateAll((buttons) =>
      buttons.map((b) => ({ disabled: (b as HTMLButtonElement).disabled, label: (b as HTMLElement).innerText.trim(), title: b.getAttribute('title') ?? '' })));
    if (state === undefined) return { availability: 'absent', label: '', title: '' };
    return { availability: state.disabled ? 'disabled' : 'available', label: state.label, title: state.title };
  }

  /** Every action of a row, after searching for it. */
  async readActionStates(name: string): Promise<Record<TerminologyRowAction, ActionState>> {
    await this.revealRow(name);
    const out = {} as Record<TerminologyRowAction, ActionState>;
    for (const action of Object.keys(TERMINOLOGY_ROW_ACTION) as TerminologyRowAction[]) out[action] = await this.getActionState(name, action);
    return out;
  }

  private async clickAction(name: string, action: TerminologyRowAction): Promise<void> {
    Logger.step(`Clicking "${action}" for terminology "${name}"`);
    await this.waitForPageReady();
    const button = await this.actionButton(name, action);
    await expect(button, `"${name}" should offer a usable ${action} action`).toBeEnabled({ timeout: Timeouts.default });
    await button.click();
  }

  /** Opens a terminology's detail screen from its row. */
  async openDetails(name: string): Promise<TerminologyDetailPage> {
    await this.revealRow(name);
    await this.clickAction(name, 'view');
    const detail = new TerminologyDetailPage(this.page);
    await detail.waitForLoaded();
    return detail;
  }

  async openAddForm(): Promise<TerminologyFormDrawer> {
    await this.waitForPageReady();
    await this.clickAdd();
    const drawer = new TerminologyFormDrawer(this.page);
    await drawer.waitForOpen();
    return drawer;
  }

  /**
   * The terminologies another screen may use, as the Mapping Identifier
   * picker of the field builder offers them - the consuming screen in reach
   * (it is fed by GetTerminologiesDropdown, the list other modules use). Opens
   * the Add drawer with throw-away details, reads the picker, and closes the
   * drawer without saving.
   */
  async readTerminologiesOfferedElsewhere(mappingTypeLabel: string): Promise<string[]> {
    const drawer = await this.openAddForm();
    await drawer.fillDetails({ name: 'Consumer probe (not saved)', description: 'Reading the terminology picker.' });
    await drawer.next();
    const index = await drawer.addField();
    await drawer.choose(index, 'type', mappingTypeLabel);
    const offered = await drawer.getOptions(index, 'mappingTerminology');
    await drawer.close();
    return offered;
  }

  /** Whether this session is offered Add Terminology. */
  async isAddOffered(): Promise<boolean> {
    return this.addButton().waitFor({ state: 'visible', timeout: Timeouts.short }).then(() => true).catch(() => false);
  }

  async openEditForm(name: string): Promise<TerminologyFormDrawer> {
    await this.revealRow(name);
    await this.clickAction(name, 'edit');
    const drawer = new TerminologyFormDrawer(this.page);
    await drawer.waitForOpen();
    await drawer.waitForLoadedValues();
    return drawer;
  }

  /** Clicks Inactivate on an Active row and returns the deactivation drawer it opens. */
  async openDeactivateDrawer(name: string): Promise<TerminologyDeactivateDrawer> {
    await this.revealRow(name);
    await this.clickAction(name, 'toggleActive');
    const drawer = new TerminologyDeactivateDrawer(this.page, TERMINOLOGY_DEACTIVATE.list);
    await drawer.waitForOpen();
    return drawer;
  }

  /**
   * Sets a terminology's subscription through its Edit drawer - the Subscribed
   * checkbox and, when given, the Subscription Reference - and saves. Returns
   * the save answer plus the reference's own validation message; a Details
   * step that refuses Next answers status -1.
   */
  async saveSubscription(name: string, subscribed: boolean, reference?: string): Promise<SaveAnswer & { referenceError: string }> {
    const drawer = await this.openEditForm(name);
    await drawer.setSubscribed(subscribed);
    if (reference !== undefined && (await drawer.isSubscriptionReferenceEditable())) await drawer.typeSubscriptionReference(reference);
    const answer = await drawer.attemptSave();
    const referenceError = await drawer.getSubscriptionReferenceError();
    if (await drawer.isOpen()) await drawer.close();
    return { ...answer, referenceError };
  }

  /** Deactivates with the first reason offered; returns the toast / messages shown. */
  async deactivate(name: string): Promise<string[]> {
    const drawer = await this.openDeactivateDrawer(name);
    await drawer.chooseFirstReason();
    await drawer.confirm();
    return this.waitForVisibleMessages();
  }

  /** An action's state when the row is listed for this session - 'absent' when the row is not (no access). */
  async getActionStateIfListed(name: string, action: TerminologyRowAction): Promise<ActionState> {
    if (!(await this.isListed(name))) return { availability: 'absent', label: '', title: '' };
    return this.getActionState(name, action);
  }

  /**
   * Deactivates without assuming it can succeed - the stale-row case, where the
   * drawer may open and the save be refused. Returns whatever the screen said.
   */
  async attemptDeactivate(name: string): Promise<string[]> {
    const opened = await this.openDeactivateDrawer(name).then(() => true).catch(() => false);
    if (opened) {
      const drawer = new TerminologyDeactivateDrawer(this.page, TERMINOLOGY_DEACTIVATE.list);
      await drawer.chooseFirstReason().catch(() => undefined);
      await drawer.confirmExpectingRefusal();
    }
    return this.waitForVisibleMessages();
  }

  /** Flips a row's status whichever it is now (Inactivate drawer or Activate prompt); returns the messages shown. */
  async toggleStatus(name: string): Promise<string[]> {
    const state = (await this.readActionStates(name)).toggleActive;
    return /inactivate|deactivate/i.test(state.label) ? this.deactivate(name) : this.activate(name);
  }

  /** Clicks a confirmation-raising row action and returns the dialog, still open. */
  async requestAction(name: string, action: 'toggleActive' | 'toggleLocked' | 'delete'): Promise<ConfirmDialog> {
    await this.revealRow(name);
    await this.clickAction(name, action);
    const dialog = new ConfirmDialog(this.page);
    await dialog.waitForVisible();
    return dialog;
  }

  /** Activates an Inactive row (confirming the prompt); returns the messages shown. */
  async activate(name: string): Promise<string[]> {
    const dialog = await this.requestAction(name, 'toggleActive');
    await dialog.confirm();
    return this.waitForVisibleMessages();
  }

  /**
   * Locks or unlocks a row (confirming the prompt); returns the messages shown.
   * Waits for SetTerminologyLocked's answer: a row read straight after the
   * confirm still showed "—" while the toast said "Terminology locked." (20194, 2026-10-30).
   */
  async toggleLock(name: string): Promise<string[]> {
    const dialog = await this.requestAction(name, 'toggleLocked');
    await NetworkUtils.captureResponse(this.page, ApiEndpoints.terminologySetLocked, () => dialog.confirm());
    return this.waitForVisibleMessages();
  }

  /**
   * Deletes a row through its prompt and returns what the server answered and
   * what the screen said - a refusal is an answer here, not an error.
   */
  async deleteTerminology(name: string): Promise<{ status: number; messages: string[] }> {
    const dialog = await this.requestAction(name, 'delete');
    const answer = await NetworkUtils.captureResponse(this.page, ApiEndpoints.terminologyDelete, () => dialog.confirm());
    return { status: answer?.status ?? -1, messages: await this.waitForVisibleMessages() };
  }

  /**
   * Tries to delete a row through the screen. When Delete is not usable the
   * attempt stops there and reports how it was offered and why (its tooltip);
   * otherwise the prompt is confirmed and the server's answer returned. A
   * deletion-blocker case accepts either refusal and checks the server apart.
   */
  async attemptDelete(name: string): Promise<{ offered: Availability; title: string; dialogText: string; status: number; messages: string[] }> {
    const state = await this.readActionStates(name).then((s) => s.delete);
    if (state.availability !== 'available') return { offered: state.availability, title: state.title, dialogText: '', status: -1, messages: [] };
    const dialog = await this.requestAction(name, 'delete');
    const dialogText = `${await dialog.getTitle()} ${await dialog.getMessage()}`;
    const answer = await NetworkUtils.captureResponse(this.page, ApiEndpoints.terminologyDelete, () => dialog.confirm().catch(() => undefined));
    return { offered: 'available', title: state.title, dialogText, status: answer?.status ?? -1, messages: await this.waitForVisibleMessages() };
  }

  /** Toasts and inline errors on screen now (settled). */
  async waitForVisibleMessages(timeout: number = Timeouts.short): Promise<string[]> {
    return WaitUtils.settleMessages(async () => {
      const inline = await this.page.locator(`[id^="${this.screen}"][id$="-error"], [id^="${this.screen}"][role="alert"]`).allInnerTexts().catch(() => [] as string[]);
      const toast = await this.page.locator(`#${TOAST.summary}, #${TOAST.detail}`).allInnerTexts().catch(() => [] as string[]);
      return [...inline, ...toast].map((text) => text.trim()).filter((text) => text !== '');
    }, timeout);
  }

  // ---- sort, advanced search, chips --------------------------------------------

  async getSortOptions(): Promise<string[]> {
    await this.btn(TERMINOLOGY_LIST.sortTrigger).click();
    const options = (await this.page.locator(`[id^="${TERMINOLOGY_LIST.sortOptionPrefix}"]`).allInnerTexts()).map((t) => t.trim());
    await this.page.keyboard.press('Escape');
    return options;
  }

  /** Sorts by a field and returns the list it answered. */
  async sortBy(field: TerminologySortField, direction: 'asc' | 'desc'): Promise<TerminologyListAnswer> {
    Logger.step(`Sorting terminologies by ${field} ${direction}`);
    await this.ensureTableView(this.screen);
    await this.btn(TERMINOLOGY_LIST.sortTrigger).click();
    return this.captureList(() =>
      this.page.locator(`#${TERMINOLOGY_LIST.sortOptionPrefix}${TERMINOLOGY_SORT_FIELD[field]}-${direction}`).click());
  }

  private advancedField(field: TerminologyFilterField): Locator {
    return this.byId(`${TERMINOLOGY_LIST.advancedSearch}-field-${TERMINOLOGY_FILTER_FIELD[field]}-input`);
  }

  async openAdvancedSearch(): Promise<void> {
    await this.ensureTableView(this.screen);
    await this.btn(TERMINOLOGY_LIST.searchFilterButton).click();
    await expect(this.byId(`${TERMINOLOGY_LIST.advancedSearch}-title`), 'the Advanced Search drawer should open').toBeVisible({ timeout: Timeouts.default });
  }

  /** The labels of the advanced-search criteria. */
  async getAdvancedSearchLabels(): Promise<string[]> {
    await this.openAdvancedSearch();
    const labels = (await this.byId(`${TERMINOLOGY_LIST.advancedSearch}-body`).innerText()).split('\n').map((t) => t.trim()).filter((t) => t !== '');
    await this.btn(`${TERMINOLOGY_LIST.advancedSearch}-cancel-button`).click();
    return labels;
  }

  /**
   * Applies advanced-search criteria and returns the list it answered. A flag
   * criterion sets its checkbox to the value given; the Name criterion types.
   */
  async applyCriteria(criteria: TerminologyCriteria): Promise<TerminologyListAnswer> {
    Logger.step(`Advanced search: ${JSON.stringify(criteria)}`);
    await this.openAdvancedSearch();
    for (const [field, value] of Object.entries(criteria) as [TerminologyFilterField, string | boolean][]) {
      if (typeof value === 'string') await this.advancedField(field).fill(value);
      else await setCheckbox(this.advancedField(field), value);
    }
    return this.captureList(() => this.btn(`${TERMINOLOGY_LIST.advancedSearch}-search-button`).click());
  }

  /** The filter chips on screen. */
  async getChips(): Promise<string[]> {
    const chips = await this.byId(TERMINOLOGY_LIST.chips).locator('[id*="-chip"]').allInnerTexts().catch(() => [] as string[]);
    return chips.map((text) => text.trim()).filter((text) => text !== '');
  }

  /**
   * Whether the toolbar's Clear control is offered. It is the "Clear" button
   * beside the search box, not a chip-level Clear All: 20059 / 20121 looked for
   * the plan module's chip control and reported a missing control (2026-10-30).
   */
  async isClearAllOffered(): Promise<boolean> {
    return this.btn(TERMINOLOGY_LIST.clearAll)
      .waitFor({ state: 'visible', timeout: Timeouts.short }).then(() => true).catch(() => false);
  }

  /** Clears the keyword and every applied criterion through the toolbar's Clear; returns what the list answered. */
  async clearAllFilters(): Promise<TerminologyListAnswer> {
    return this.captureList(() => this.btn(TERMINOLOGY_LIST.clearAll).click());
  }

  /** The search box's placeholder and accessible name, and whether it takes focus. */
  async describeSearchControls(): Promise<{ placeholder: string; filterButtonName: string; focusable: boolean }> {
    const input = this.searchInput();
    await input.focus();
    const focused = await input.evaluate((element) => element === document.activeElement);
    const filter = this.btn(TERMINOLOGY_LIST.searchFilterButton);
    const filterButtonName = (await filter.getAttribute('aria-label')) ?? (await filter.getAttribute('title')) ?? (await filter.innerText()).trim();
    return { placeholder: (await input.getAttribute('placeholder')) ?? '', filterButtonName, focusable: focused };
  }

  /** Types into the search box without pressing Enter - the rapid partial-typing case. */
  async typeIntoSearch(text: string): Promise<void> {
    await this.ensureTableView(this.screen);
    await this.searchInput().fill(text);
  }

  // ---- cards -------------------------------------------------------------------

  async switchToCards(): Promise<void> {
    await this.btn(GLOBAL.viewToggleCards).click();
    await expect(this.byId(TERMINOLOGY_LIST.cards), 'the Cards view should render').toBeVisible({ timeout: Timeouts.default });
  }

  async switchToTable(): Promise<void> {
    await this.ensureTableView(this.screen);
  }

  private card(name: string): Locator {
    return this.page.locator(`article[id^="${TERMINOLOGY_CARD.prefix}"]`, {
      has: this.page.locator(`[id$="-${TERMINOLOGY_CARD.title}"]`, { hasText: exactText(name) }),
    }).first();
  }

  async getCardTitles(): Promise<string[]> {
    return (await this.page.locator(`[id^="${TERMINOLOGY_CARD.prefix}"][id$="-${TERMINOLOGY_CARD.title}"]`).allInnerTexts()).map((t) => t.trim());
  }

  /** Whether a card for `name` is on screen (waits for it). */
  async isCardShown(name: string): Promise<boolean> {
    return this.card(name).waitFor({ state: 'visible', timeout: Timeouts.default }).then(() => true).catch(() => false);
  }

  async readCard(name: string): Promise<TerminologyCardValues> {
    const card = this.card(name);
    await expect(card, `a card for "${name}"`).toBeVisible({ timeout: Timeouts.default });
    const id = (await card.getAttribute('id')) ?? '';
    const read = (suffix: string) => this.byId(`${id}-${suffix}`).innerText({ timeout: Timeouts.short }).then((t) => t.trim()).catch(() => '');
    return {
      title: await read(TERMINOLOGY_CARD.title),
      description: await read(TERMINOLOGY_CARD.description),
      fields: await read(TERMINOLOGY_CARD.fields),
      subscribed: await read(TERMINOLOGY_CARD.subscribed),
      locked: await read(TERMINOLOGY_CARD.locked),
    };
  }

  /** The whole text of a card - for markers it carries outside its labelled fields. */
  async getCardText(name: string): Promise<string> {
    return (await this.card(name).innerText()).replace(/\s+/g, ' ').trim();
  }

  async getCardActionState(name: string, action: TerminologyCardAction): Promise<ActionState> {
    const card = this.card(name);
    await expect(card, `a card for "${name}"`).toBeVisible({ timeout: Timeouts.default });
    const id = (await card.getAttribute('id')) ?? '';
    const button = this.page.locator(buttonSelector(`${id}-${TERMINOLOGY_CARD.action[action]}`)).first();
    if ((await button.count()) === 0) return { availability: 'absent', label: '', title: '' };
    return {
      availability: (await button.isEnabled()) ? 'available' : 'disabled',
      label: (await button.innerText()).trim(),
      title: (await button.getAttribute('title')) ?? '',
    };
  }

  // ---- export --------------------------------------------------------------------

  exportMenu(): ExportMenu {
    return new ExportMenu(this.page, TERMINOLOGY_EXPORT);
  }

  /** Exports and returns the file parsed (headers + rows), with its name. */
  async exportAndParse(scope: 'all' | 'selected', format: 'csv' | 'excel'): Promise<{ filename: string; bytes: Buffer; parsed: ParsedXlsx }> {
    await this.waitForPageReady();
    return this.exportMenu().exportAndParse(scope, format);
  }

  /**
   * Exports and reports BOTH outcomes an export may legitimately have: a file
   * (parsed) or a message instead of one. For the empty-result and failure
   * cases, where "no file, but a clear message" is an acceptable answer.
   */
  async exportOrMessages(format: 'csv' | 'excel'): Promise<{ parsed: ParsedXlsx | null; filename: string; messages: string[] }> {
    const menu = this.exportMenu();
    await this.waitForPageReady();
    await menu.open();
    await menu.chooseScope('all');
    const download = this.page.waitForEvent('download', { timeout: Timeouts.default }).catch(() => null);
    await menu.clickFormat(format);
    const file = await download;
    const messages = await this.waitForVisibleMessages();
    if (file === null) return { parsed: null, filename: '', messages };
    const chunks: Buffer[] = [];
    for await (const chunk of await file.createReadStream()) chunks.push(Buffer.from(chunk));
    const bytes = Buffer.concat(chunks);
    const parsed = format === 'csv' ? { ...parseCsv(bytes.toString('utf8')), rightToLeft: false } : parseXlsx(bytes);
    return { parsed, filename: file.suggestedFilename(), messages };
  }

  /**
   * Exports while watching the screen for a processing indicator, and reports
   * which states it showed ("In Progress", "Completed") and the file.
   */
  async exportWatchingProgress(format: 'csv' | 'excel'): Promise<{ states: string[]; filename: string }> {
    const states: string[] = [];
    const watch = async (): Promise<void> => {
      for (let i = 0; i < 20; i += 1) {
        const text = await this.page.locator('body').innerText().catch(() => '');
        const found = text.match(/in progress|exporting|processing|preparing|completed|ready/gi) ?? [];
        for (const state of found) if (!states.includes(state.toLowerCase())) states.push(state.toLowerCase());
        await this.page.waitForTimeout(250);
      }
    };
    const watching = watch();
    const { filename } = await this.exportMenu().exportAndReadBytes('all', format);
    await watching;
    return { states, filename };
  }

  /** Whether this session is offered the Export control. */
  async isExportOffered(): Promise<boolean> {
    return this.exportMenu().isAvailable();
  }

  // ---- direct requests, for the bypass cases ---------------------------------------
  //
  // Sent with THIS page's session token, so a shaped session's call carries
  // that account's rights - the "bypass the disabled control" cases ask what
  // the SERVER does when the screen is skipped.

  async sendCreate(name: string): Promise<TerminologyAnswer & { id: string | null }> {
    return requestCreate(this.page, { name });
  }

  /** The Lookup module's lists - the List field's possible sources. */
  async fetchLookupNames(): Promise<string[]> {
    return lookupListNames(this.page);
  }

  /** Sends the list export directly (`format` 1 CSV, 2 Excel). */
  async sendExport(format: 1 | 2): Promise<TerminologyAnswer> {
    return NetworkUtils.postAsSession(this.page, ApiEndpoints.terminologyExport, { pageNumber: 1, rowsPerPage: 10, sortBy: 'CreatedOn desc', format });
  }

  async sendDelete(id: string): Promise<TerminologyAnswer> {
    return deleteTerminology(this.page, id);
  }

  /**
   * Deletes a terminology behind the screen's back once the list has stopped
   * re-querying - "another session removed it". The search box re-queries a
   * moment after Enter (its debounce), and in 20098 that late query ran after
   * the delete and dropped the row before the stale row could be acted on.
   */
  async removeBehindTheList(id: string): Promise<TerminologyAnswer> {
    await this.page.waitForLoadState('networkidle', { timeout: Timeouts.short }).catch(() => undefined);
    return deleteTerminology(this.page, id);
  }

  async sendSetActive(id: string, active: boolean): Promise<TerminologyAnswer> {
    return setTerminologyActive(this.page, id, active);
  }

  async sendSetLocked(id: string, locked: boolean): Promise<TerminologyAnswer> {
    return setTerminologyLocked(this.page, id, locked);
  }

  async sendUpdate(id: string, changes: Parameters<typeof updateTerminology>[2]): Promise<TerminologyAnswer> {
    return updateTerminology(this.page, id, changes);
  }

  async sendUpsertRecord(id: string, cells: Record<string, string>, rowId: string | null = null): Promise<TerminologyAnswer & { rowId: string | null }> {
    return upsertRecord(this.page, id, cells, rowId);
  }

  async sendDeleteRecord(id: string, rowId: string): Promise<TerminologyAnswer> {
    return deleteRecord(this.page, id, rowId);
  }

  async sendUpload(id: string, headers: readonly string[], rows: ReadonlyArray<readonly string[]>): Promise<{ status: number; jobId: string | null; text: string }> {
    return uploadImport(this.page, id, headers, rows);
  }

  /** What the server holds for a terminology (as this session may read it). */
  async fetchTerminology(id: string): Promise<TerminologyRecord | null> {
    return readTerminology(this.page, id).catch(() => null);
  }

  async fetchRecords(id: string): Promise<TerminologyRow[]> {
    return readRecords(this.page, id);
  }

  async fetchErrorRows(id: string): Promise<TerminologyErrorRow[]> {
    return readErrorRows(this.page, id);
  }

  async fetchImportJob(id: string): Promise<TerminologyImportJob | null> {
    return readImportJob(this.page, id);
  }

  async waitForImportToFinish(id: string): Promise<TerminologyImportJob> {
    return waitForImport(this.page, id);
  }

  /** The terminologies other screens are offered (active only). */
  async fetchOfferedTerminologies(): Promise<string[]> {
    return offeredTerminologyNames(this.page);
  }

  /** The values a mapping field offers. */
  async fetchMappedValues(fieldId: string): Promise<string[]> {
    return mappedValues(this.page, fieldId);
  }

  /** Whether this session may read the terminology register at all. */
  async canListTerminologies(): Promise<boolean> {
    return listTerminologies(this.page).then(() => true).catch(() => false);
  }

  /** Whether this session may read a terminology's audit trail at all. */
  async canReadAuditTrail(id: string): Promise<boolean> {
    return auditEntryCount(this.page, id).then(() => true).catch(() => false);
  }

  /** How many audit entries the server holds for a terminology. */
  async fetchAuditCount(id: string): Promise<number> {
    return auditEntryCount(this.page, id);
  }

  async fetchRegister(): Promise<{ items: TerminologyListItem[]; totalRows: number }> {
    return listTerminologies(this.page);
  }

  /** Answers the list request with an empty register until `restoreEndpoints` - the empty-state case. */
  async simulateEmptyRegister(): Promise<void> {
    await NetworkUtils.emptyListEndpoint(this.page, ApiEndpoints.terminologyList);
  }

  /** Fails one endpoint with HTTP 500 until `restoreEndpoints`. */
  async simulateFailure(endpoint: string): Promise<void> {
    await NetworkUtils.failEndpoint(this.page, endpoint);
  }

  async restoreEndpoints(): Promise<void> {
    await NetworkUtils.restore(this.page);
  }

  /**
   * Counts the native dialogs (alert / confirm / prompt) the page raises while
   * `action` runs - the script-injection cases' evidence that a value was not
   * executed.
   */
  async countNativeDialogsDuring(action: () => Promise<void>): Promise<number> {
    let raised = 0;
    const listener = (): void => { raised += 1; };
    this.page.on('dialog', listener);
    await action();
    await this.waitForPageReady();
    this.page.off('dialog', listener);
    return raised;
  }

  /** Whether rows can be selected together (a row checkbox) - the precondition of any bulk action. */
  async isBulkSelectionOffered(): Promise<boolean> {
    await this.waitForRowsRendered();
    return this.rows().first().locator('input[type="checkbox"]').first()
      .waitFor({ state: 'visible', timeout: Timeouts.short }).then(() => true).catch(() => false);
  }

  /** The number of rows the current page renders. */
  async countRows(): Promise<number> {
    await this.waitForRowsRendered();
    return this.getRowCount();
  }
}
