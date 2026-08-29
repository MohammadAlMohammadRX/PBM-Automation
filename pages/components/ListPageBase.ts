import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { Timeouts } from '../../constants/Timeouts';
import { buttonSelector, type RowAction } from '../../constants/ElementIds';
import { Logger } from '../../utils/Logger';

/**
 * Shared behaviour for every "management" list page in PBM (Payer, Network,
 * Users Administration, Plans, Policy, ...). All of these screens are rendered
 * from the same shared table component, so they share one id shape - which is
 * what lets this base class do the work rather than each page re-implementing
 * search/table/pagination.
 *
 * Every id here is derived from the concrete page's `screen` namespace:
 *
 *   {screen}-search-input                       the toolbar search box
 *   {screen}-add-button                         the Add <Entity> action
 *   {screen}-table-el                           the table itself
 *   {screen}-table-body / -empty / -footer
 *   {screen}-table-th-{columnKey}               a column header
 *   {screen}-table-row-{recordId}               a data row
 *   {screen}-table-row-{recordId}-cell-{key}    a cell, by model property
 *   {screen}-table-row-{recordId}-{action}      a row action
 *   {screen}-table-pager-prev / -next / -page-N
 *
 * Rows are keyed on the record's own id, so reading a cell no longer depends on
 * its position in the table: the previous implementation addressed cells by
 * `td:nth-child(n)` and header text, which silently pointed an assertion at the
 * wrong data whenever a column moved or a new one appeared.
 */
export abstract class ListPageBase extends BasePage {
  protected constructor(
    page: Page,
    /** The screen's id namespace, e.g. `payer-list`. */
    protected readonly screen: string,
  ) {
    super(page);
  }

  // ---- Toolbar --------------------------------------------------------------

  protected searchInput(): Locator {
    return this.byId(`${this.screen}-search-input`);
  }

  async search(term: string): Promise<void> {
    Logger.step(`Searching for "${term}"`);
    // Guarantee Table view FIRST. The view preference is module-wide and
    // remembered, so the list can come back as cards at any point - returning
    // from another screen does it every time. Cards are a different namespace
    // (`payer-card-{id}`, actions suffixed `-button`) and, decisively, cards
    // view ignores the search: 225 cards render with a name in the search box.
    // Every row-scoped method searches before touching a row, so enforcing the
    // view here covers all of them.
    await this.ensureTableView(this.screen);

    const input = this.searchInput();
    await input.fill(term);
    await input.press('Enter');
    await this.waitForPageReady();
  }

  protected addButton(): Locator {
    return this.btn(`${this.screen}-add-button`);
  }

  async clickAdd(): Promise<void> {
    Logger.step('Clicking the Add action');
    await this.addButton().click();
  }

  // ---- Table and rows -------------------------------------------------------

  protected table(): Locator {
    return this.tableFor(this.screen);
  }

  protected tableBody(): Locator {
    return this.byId(`${this.screen}-table-body`);
  }

  /** All data rows currently rendered, matched by their id prefix. */
  protected rows(): Locator {
    return this.page.locator(`tr[id^="${this.screen}-table-row-"]`);
  }

  /**
   * Locates a row by the text it contains, e.g. an entity name.
   *
   * Content is still how a row is FOUND - a test only knows the name it
   * generated, while the id is the server's record key. Once found, the id is
   * read off the row and every subsequent action is built from it, so nothing
   * downstream depends on text or position.
   *
   * Rows are read after searching and some names legitimately repeat (a live
   * record plus a pending version), so the first match is the row under test.
   */
  protected rowByText(text: string): Locator {
    return this.rows().filter({ hasText: text }).first();
  }

  /** The record id behind a row, i.e. the namespace its actions hang off. */
  protected async rowId(entityName: string): Promise<string> {
    const row = this.rowByText(entityName);
    await expect(row).toBeVisible({ timeout: Timeouts.default });
    const id = await row.getAttribute('id');
    if (!id) {
      throw new Error(`[ListPageBase] Row for "${entityName}" carries no id attribute.`);
    }
    return id;
  }

  /**
   * Whether a row for `entityName` is on screen, WAITING for it to appear.
   *
   * `locator.isVisible()` is deliberately not used: it reports the current state
   * and ignores its timeout, so a check made right after a search runs before
   * the table has re-rendered and answers "no". That race is what made fixture
   * cleanup skip records silently and leak them into the environment.
   */
  async isRowVisible(entityName: string): Promise<boolean> {
    return this.rowByText(entityName)
      .waitFor({ state: 'visible', timeout: Timeouts.short })
      .then(() => true)
      .catch(() => false);
  }

  async waitForRowVisible(entityName: string): Promise<void> {
    await expect(this.rowByText(entityName)).toBeVisible({ timeout: Timeouts.default });
  }

  // ---- Row actions ----------------------------------------------------------

  /**
   * A row action button.
   *
   * Actions are addressed by their logical key, so this works unchanged in
   * Arabic. The previous implementation matched the button's accessible name (or
   * its localized `title` attribute), which is exactly the fragility the ids
   * remove - a row action's id never changes with the UI language.
   *
   * Row actions carry no `-button` suffix; that belongs to the card view.
   */
  protected async rowActionButton(entityName: string, action: RowAction): Promise<Locator> {
    const id = await this.rowId(entityName);
    return this.page.locator(buttonSelector(`${id}-${action}`)).first();
  }

  private async clickRowAction(entityName: string, action: RowAction): Promise<void> {
    Logger.step(`Clicking "${action}" for "${entityName}"`);
    const button = await this.rowActionButton(entityName, action);
    // Wait for the action before clicking it. Row actions depend on the record's
    // STATE as well as the row - a published payer offers view/edit/inactivate/
    // delete, and only a record with a pending change also offers
    // submit-for-approval - so immediately after a search or a save the button
    // may not be rendered yet. Clicking blind fails as "element never became
    // visible", which reads like an application defect and is not one.
    await expect(button).toBeVisible({ timeout: Timeouts.default });
    await button.click();
  }

  async viewRow(entityName: string): Promise<void> {
    await this.clickRowAction(entityName, 'view');
  }

  async editRow(entityName: string): Promise<void> {
    await this.clickRowAction(entityName, 'edit');
  }

  async deleteRow(entityName: string): Promise<void> {
    await this.clickRowAction(entityName, 'delete');
  }

  async sendRowForApproval(entityName: string): Promise<void> {
    await this.clickRowAction(entityName, 'submit-for-approval');
  }

  /** Whether a row offers a given action to the current user (RBAC checks). */
  async hasRowAction(entityName: string, action: RowAction): Promise<boolean> {
    const button = await this.rowActionButton(entityName, action);
    return (await button.count()) > 0;
  }

  // ---- Cell reads -----------------------------------------------------------

  /**
   * A single cell of a row, by the column's model-property key. Language
   * independent, and immune to column reordering.
   */
  protected async cell(entityName: string, columnKey: string): Promise<Locator> {
    const id = await this.rowId(entityName);
    return this.byId(`${id}-cell-${columnKey}`);
  }

  /** The value shown in one of a row's columns. */
  async getCellValue(entityName: string, columnKey: string): Promise<string> {
    return (await (await this.cell(entityName, columnKey)).innerText()).trim();
  }

  /**
   * Every value currently rendered in a column, in row order.
   *
   * Replaces the old `columnValues(index)`: the cells are selected by their
   * column key, so the caller no longer has to know that License Number happens
   * to be the sixth `td`.
   */
  protected async columnValues(columnKey: string): Promise<string[]> {
    const cells = this.page.locator(`td[id^="${this.screen}-table-row-"][id$="-cell-${columnKey}"]`);
    return (await cells.allInnerTexts()).map((text) => text.trim());
  }

  /** A column header, for asserting the table's shape. */
  protected columnHeader(columnKey: string): Locator {
    return this.byId(`${this.screen}-table-th-${columnKey}`);
  }

  // ---- Pagination -----------------------------------------------------------

  protected nextPageButton(): Locator {
    return this.btn(`${this.screen}-table-pager-next`);
  }

  protected prevPageButton(): Locator {
    return this.btn(`${this.screen}-table-pager-prev`);
  }

  /**
   * A pager button by 1-based page number. The pager collapses beyond 7 pages
   * (`1 … 4 5 [6] 7 8 … 20`), so a given page button only exists while that
   * number is inside the visible window.
   */
  protected pageButton(pageNumber: number): Locator {
    return this.btn(`${this.screen}-table-pager-page-${pageNumber}`);
  }

  async goToNextPage(): Promise<void> {
    await this.nextPageButton().click();
    await this.waitForPageReady();
  }

  async goToPreviousPage(): Promise<void> {
    await this.prevPageButton().click();
    await this.waitForPageReady();
  }

  // ---- Result-set reads -----------------------------------------------------

  /** Asserts the results table contains the given text somewhere. */
  async verifyTableContainsText(text: string): Promise<void> {
    await expect(this.table()).toContainText(text, { timeout: Timeouts.default });
  }

  async getVisibleRowCount(): Promise<number> {
    return this.rows().count();
  }

  /** Number of data rows currently rendered (header row excluded by the id). */
  async getRowCount(): Promise<number> {
    return this.rows().count();
  }

  /** The list's empty state - a distinct element, not a row of placeholder text. */
  protected emptyState(): Locator {
    return this.byId(`${this.screen}-table-empty`);
  }
}
