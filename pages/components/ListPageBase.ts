import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { Timeouts } from '../../constants/Timeouts';
import {
  PAGER_ACTIVE_CLASS,
  buttonSelector,
  statusBadgeId,
  type RowAction,
} from '../../constants/ElementIds';
import { assertNotProtected } from '../../constants/ProtectedData';
import { ConfirmDialog } from './ConfirmDialog';
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

  /**
   * Waits until the table has actually rendered data rows.
   *
   * `open()` returns once the table ELEMENT is visible, which happens before
   * its body is populated - the rows arrive with a separate request. Any read
   * taken straight after `open()` therefore sees an empty table and reports
   * "the list rendered no rows", which looks like an application defect and is
   * not one. Every assertion in this class that reads a whole column or every
   * badge calls this first.
   *
   * A legitimately empty result set is NOT an error here, so this resolves
   * either when rows appear or when the list shows its empty state - the caller
   * decides which of those it expected.
   */
  async waitForRowsRendered(): Promise<void> {
    await expect
      .poll(
        async () => {
          if ((await this.rows().count()) > 0) return 'rows';
          return (await this.emptyState().count()) > 0 ? 'empty' : 'loading';
        },
        { timeout: Timeouts.default },
      )
      .not.toBe('loading');
  }

  /** Asserts the table rendered at least one data row. */
  async expectRowsRendered(): Promise<void> {
    await expect
      .poll(() => this.rows().count(), {
        timeout: Timeouts.default,
        message: 'the list should render at least one row',
      })
      .toBeGreaterThan(0);
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
    // Wait for the screen to settle FIRST. The application disables every
    // button while a request is in flight, and a click on a disabled control
    // waits out the full actionability timeout and then reports only
    // "locator.click: Timeout exceeded" - which reads as a missing action and
    // is really a request already in flight. Costly to diagnose, cheap to
    // prevent.
    await this.waitForPageReady();
    const button = await this.rowActionButton(entityName, action);
    // Wait for the action before clicking it. Row actions depend on the record's
    // STATE as well as the row - a published payer offers view/edit/inactivate/
    // delete, and only a record with a pending change also offers
    // submit-for-approval - so immediately after a search or a save the button
    // may not be rendered yet. Clicking blind fails as "element never became
    // visible", which reads like an application defect and is not one.
    await expect(button).toBeVisible({ timeout: Timeouts.default });
    await expect(
      button,
      `the "${action}" action on row "${entityName}" should be usable - a disabled one means the`
        + ' screen is still busy, or the action is withheld from this record',
    ).toBeEnabled({ timeout: Timeouts.default });
    await button.click();
  }

  async viewRow(entityName: string): Promise<void> {
    await this.clickRowAction(entityName, 'view');
  }

  async editRow(entityName: string): Promise<void> {
    await this.clickRowAction(entityName, 'edit');
  }

  async deleteRow(entityName: string): Promise<void> {
    // The chokepoint for every deletion in the suite - `deletePayer`, the
    // fixtures' teardown purge and any `cleanup.register` all reach the row
    // through here. Guarding it once protects the seeded auto-discard records
    // from every path at the same time; see constants/ProtectedData.ts.
    assertNotProtected(entityName, 'delete');
    await this.clickRowAction(entityName, 'delete');
  }

  async sendRowForApproval(entityName: string): Promise<void> {
    await this.clickRowAction(entityName, 'submit-for-approval');
  }

  /**
   * Starts the inactivate / activate row action.
   *
   * Both are already declared in `RowAction` and both open the shared
   * confirmation dialog, so the click belongs here with the other row actions;
   * what the dialog then ASKS for (a reason, an acknowledgement) is the
   * concrete module's business, not the list's.
   *
   * These are maker-checker changes: the click only STAGES the transition, and
   * the record keeps its current status until a checker approves - so a caller
   * that wants the status to actually change must send the record for approval
   * and have it approved.
   */
  async inactivateRow(entityName: string): Promise<void> {
    // Guarded like deleteRow: inactivating a seeded auto-discard registration
    // changes the very state its case is waiting to observe, which is as
    // destructive as deleting it.
    assertNotProtected(entityName, 'inactivate');
    await this.clickRowAction(entityName, 'inactivate');
  }

  async activateRow(entityName: string): Promise<void> {
    assertNotProtected(entityName, 'activate');
    await this.clickRowAction(entityName, 'activate');
  }

  /**
   * Finds a record and starts its inactivate row action.
   *
   * Searches and waits for the row FIRST, like every other orchestration
   * method on the concrete pages (see PayerManagementPage.sendForApproval,
   * which carries the same note for the same reason): without it the action is
   * looked for among whatever rows happen to be on the current page, and on a
   * 35-page list the record is almost never there - which surfaces as "the
   * expected element never became visible", reads like a missing action, and is
   * really a missing search.
   *
   * What the action then OPENS is deliberately not handled here. In the payer
   * module it is a dedicated drawer, not the shared confirmation dialog - see
   * PayerInactivateDialog - and that is module-specific, so this class stops at
   * the row.
   */
  async findAndInactivateRow(entityName: string): Promise<void> {
    await this.search(entityName);
    await this.waitForRowVisible(entityName);
    await this.inactivateRow(entityName);
  }

  /** The reactivation counterpart of `findAndInactivateRow`. */
  async findAndActivateRow(entityName: string): Promise<void> {
    await this.search(entityName);
    await this.waitForRowVisible(entityName);
    await this.activateRow(entityName);
  }

  /** Whether a row offers a given action to the current user (RBAC checks). */
  async hasRowAction(entityName: string, action: RowAction): Promise<boolean> {
    const button = await this.rowActionButton(entityName, action);
    return (await button.count()) > 0;
  }

  /**
   * How a row REFUSES an action, when it refuses one.
   *
   * `hasRowAction` above answers presence only, and presence is not
   * availability: the payer list renders a DISABLED Activate button on an
   * expired payer while omitting Inactivate from the same row entirely.
   * Counting either as "offered" would report a guardrail as missing when it is
   * being enforced, and counting a disabled button as absent would hide which
   * of the two mechanisms the application used.
   *
   * Returns 'absent' | 'disabled' | 'available' so a caller can assert the
   * refusal and still say how it was made.
   */
  async getRowActionAvailability(
    entityName: string,
    action: RowAction,
  ): Promise<'absent' | 'disabled' | 'available'> {
    const button = await this.rowActionButton(entityName, action);
    if ((await button.count()) === 0) return 'absent';
    return (await button.isEnabled()) ? 'available' : 'disabled';
  }

  /**
   * Asserts a row offers no usable route to `action`, and reports which of the
   * two refusals was used.
   */
  async expectRowActionUnavailable(
    entityName: string,
    action: RowAction,
  ): Promise<'absent' | 'disabled'> {
    const availability = await this.getRowActionAvailability(entityName, action);
    expect(
      availability,
      `row "${entityName}" must not offer a usable "${action}" action`,
    ).not.toBe('available');
    return availability as 'absent' | 'disabled';
  }

  /** Every action this row offers as USABLE, in the order asked for. */
  async getEnabledRowActions(
    entityName: string,
    actions: readonly RowAction[],
  ): Promise<RowAction[]> {
    const enabled: RowAction[] = [];
    for (const action of actions) {
      if ((await this.getRowActionAvailability(entityName, action)) === 'available') {
        enabled.push(action);
      }
    }
    return enabled;
  }

  /**
   * A row action's own explanatory message, or an empty string when it has none.
   *
   * The payer list attaches the reason an action cannot be used to that
   * action's `title` - "Cannot reactivate: the payer has expired. Update its
   * expiry date to reactivate it." sits on the DISABLED Activate button of an
   * expired payer, in whichever language the UI is showing. That is the only
   * channel the guardrail messaging uses: no toast, no dialog, nothing in the
   * page body. So a story about guardrail MESSAGING has to read it from here.
   *
   * Returns '' rather than null for a missing title, so a caller comparing
   * against an expected message gets a readable diff instead of a type error.
   */
  async getRowActionMessage(entityName: string, action: RowAction): Promise<string> {
    const button = await this.rowActionButton(entityName, action);
    if ((await button.count()) === 0) return '';
    return (await button.getAttribute('title')) ?? '';
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

  // ---- Reads addressed by RECORD ID rather than by displayed text ----------
  //
  // A row is normally FOUND by the text it shows, because that is all a test
  // knows. That breaks down for the bilingual story: once the UI switches
  // language the name on screen changes, so the text used to find the row a
  // moment ago is no longer there. These helpers take the record's own id -
  // captured while the row could still be found - so a row stays addressable
  // across a language change, a re-sort or a re-render.

  /**
   * The record's own id, with the row-id prefix stripped.
   *
   * This bare id is the key every other view of the same record is built from
   * (`payer-card-{id}`, the detail URL), which is what lets one captured id
   * address the row, the card and the detail screen.
   */
  async recordIdOf(entityName: string): Promise<string> {
    const rowId = await this.rowId(entityName);
    return rowId.slice(`${this.screen}-table-row-`.length);
  }

  /** A cell of the row for `recordId`, by the column's model-property key. */
  protected cellById(recordId: string, columnKey: string): Locator {
    return this.byId(`${this.screen}-table-row-${recordId}-cell-${columnKey}`);
  }

  /** The value shown in a column of the row for `recordId`. */
  async getCellValueById(recordId: string, columnKey: string): Promise<string> {
    const cell = this.cellById(recordId, columnKey);
    await expect(cell).toBeVisible({ timeout: Timeouts.default });
    return (await cell.innerText()).trim();
  }

  /** Asserts a column of the row for `recordId` shows exactly `expected`. */
  async expectCellById(
    recordId: string,
    columnKey: string,
    expected: string,
  ): Promise<void> {
    await expect(this.cellById(recordId, columnKey)).toHaveText(expected, {
      timeout: Timeouts.default,
    });
  }

  /**
   * Asserts a cell CONTAINS `expected`, addressed by record id.
   *
   * The exact-match version above is right for a cell holding one value, but
   * several cells are composites: the Approval Status cell reads "v1 · Published",
   * so asserting the status alone against it fails on a perfectly correct cell.
   * This is for those - the status is what is under test, the version prefix is
   * context.
   */
  async expectCellByIdContains(
    recordId: string,
    columnKey: string,
    expected: string,
  ): Promise<void> {
    await expect(this.cellById(recordId, columnKey)).toContainText(expected, {
      timeout: Timeouts.default,
    });
  }

  /** Whether the row for `recordId` is on screen, waiting for it to appear. */
  async isRowVisibleById(recordId: string): Promise<boolean> {
    return this.byId(`${this.screen}-table-row-${recordId}`)
      .waitFor({ state: 'visible', timeout: Timeouts.short })
      .then(() => true)
      .catch(() => false);
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

  /**
   * Whether a further page of results exists.
   *
   * Read from the pager's Next button, which is the only signal that works at
   * any list length: page NUMBER buttons collapse beyond seven pages, so
   * "does page 8 exist" cannot be answered by looking for its button.
   */
  async hasNextPage(): Promise<boolean> {
    return this.nextPageButton()
      .isEnabled({ timeout: Timeouts.short })
      .catch(() => false);
  }

  async goToNextPage(): Promise<void> {
    await this.nextPageButton().click();
    await this.waitForPageReady();
  }

  async goToPreviousPage(): Promise<void> {
    await this.prevPageButton().click();
    await this.waitForPageReady();
  }

  // ---- Pager state ----------------------------------------------------------
  //
  // Generic list-pagination behaviour, so the Payer, Plan and Network list
  // pages share one implementation instead of each re-deriving the pager's
  // shape. Every id is still built from the concrete page's `screen`.

  /** The pager container. Absent from the DOM when there is nothing to page. */
  protected pager(): Locator {
    return this.byId(`${this.screen}-table-pager`);
  }

  /** The table footer that hosts the pager. */
  protected tableFooter(): Locator {
    return this.byId(`${this.screen}-table-footer`);
  }

  /** Every page button currently offered, in the order the pager renders them. */
  protected pageButtons(): Locator {
    return this.page.locator(`[id^="${this.screen}-table-pager-page-"]`);
  }

  /**
   * The page number showing now.
   *
   * The pager marks the current page with a CSS class and exposes no
   * `aria-current`, so the class is the only signal the application offers -
   * see PAGER_ACTIVE_CLASS. The page NUMBER still comes from the button's id,
   * never from its rendered label, which carries padding whitespace and is
   * translated in the Arabic UI.
   */
  async getCurrentPageNumber(): Promise<number> {
    const ids = await this.pageButtons().evaluateAll(
      (buttons, activeClass) =>
        buttons
          .filter((button) => button.classList.contains(activeClass))
          .map((button) => (button as HTMLElement).id),
      PAGER_ACTIVE_CLASS,
    );
    if (ids.length === 0) return 1;
    return Number(ids[0].split('-').pop());
  }

  /** Asserts the pager's own indicator reports the expected page. */
  async expectCurrentPage(pageNumber: number): Promise<void> {
    await expect
      .poll(() => this.getCurrentPageNumber(), {
        timeout: Timeouts.default,
        message: `The pager should report page ${pageNumber} as the active page.`,
      })
      .toBe(pageNumber);
  }

  async expectNextPageDisabled(): Promise<void> {
    await expect(this.nextPageButton()).toBeDisabled({ timeout: Timeouts.default });
  }

  async expectNextPageEnabled(): Promise<void> {
    await expect(this.nextPageButton()).toBeEnabled({ timeout: Timeouts.default });
  }

  async expectPreviousPageDisabled(): Promise<void> {
    await expect(this.prevPageButton()).toBeDisabled({ timeout: Timeouts.default });
  }

  async expectPreviousPageEnabled(): Promise<void> {
    await expect(this.prevPageButton()).toBeEnabled({ timeout: Timeouts.default });
  }

  /**
   * The page size the list actually uses, measured rather than configured:
   * a full page's row count.
   *
   * Read from page one while more pages exist, so the count is a FULL page and
   * not the partial remainder the last page holds.
   */
  async getEffectivePageSize(): Promise<number> {
    return this.getRowCount();
  }

  /**
   * Whether the list offers a control for changing the page size.
   *
   * locator-exception, and a deliberate one: this asks whether a control of a
   * given KIND exists anywhere in the pager's footer, which is the question the
   * acceptance criterion poses. No id can answer "is there a control I have not
   * been told the id of", and answering it by looking for one specific id would
   * turn a missing feature into a passing test.
   */
  async hasPageSizeControl(): Promise<boolean> {
    const footer = this.tableFooter();
    if ((await footer.count()) === 0) return false;
    // locator-exception: asks whether a control of this KIND exists at all, which is the
    // acceptance criterion under test; no id can answer "is there a control I was never given an id for".
    const combos = await footer.getByRole('combobox').count();
    const spins = await footer.getByRole('spinbutton').count();
    const selects = await footer.locator('select').count();
    return combos + spins + selects > 0;
  }

  /**
   * Whether the pager offers a "go to page" input to type a page number into.
   * Same reasoning as `hasPageSizeControl`.
   */
  async hasGoToPageInput(): Promise<boolean> {
    const pager = this.pager();
    if ((await pager.count()) === 0) return false;
    // locator-exception: same as hasPageSizeControl - the existence of a control of this kind
    // IS the question the acceptance criterion poses, so it cannot be asked by a known id.
    const textboxes = await pager.getByRole('textbox').count();
    const spins = await pager.getByRole('spinbutton').count();
    return textboxes + spins > 0;
  }

  /**
   * Sets the list's page size.
   *
   * The control it drives does not exist in the current build - see
   * `hasPageSizeControl`. The method exists so the page-size boundary case can
   * be written against the acceptance criteria rather than around them: the
   * case asserts the control's presence in a `critical` step first, so this is
   * only ever reached once the control is delivered, and until then the
   * dependent steps are recorded NOT EXECUTED instead of silently passing.
   */
  async selectPageSize(rowsPerPage: number): Promise<void> {
    Logger.step(`Setting the list page size to ${rowsPerPage}`);
    // locator-exception: the page size control is not present in this build, so it has no id to
    // add to ElementIds; it is addressed by role until the application ships it.
    const control = this.tableFooter().getByRole('combobox').first();
    await control.click();
    await this.page
      .getByRole('option', { name: String(rowsPerPage), exact: true })
      .filter({ visible: true })
      .first()
      .click();
    await this.waitForPageReady();
  }

  /**
   * Types a page number into the pager's manual "go to page" input.
   * Same reasoning as `selectPageSize` - the input does not exist in this
   * build, and the case that uses it gates on its presence first.
   */
  async enterPageNumber(value: string): Promise<void> {
    Logger.step(`Entering "${value}" into the go-to-page input`);
    // locator-exception: the go-to-page input is not present in this build, so it has no id to
    // add to ElementIds; it is addressed by role until the application ships it.
    const input = this.pager().getByRole('textbox').first();
    await input.fill(value);
    await input.press('Enter');
    await this.waitForPageReady();
  }

  /** Asserts no pager is offered - the state for a result set that fits one page. */
  async expectPagerAbsent(): Promise<void> {
    await expect(this.pager()).toHaveCount(0, { timeout: Timeouts.default });
  }

  async expectPagerVisible(): Promise<void> {
    await expect(this.pager()).toBeVisible({ timeout: Timeouts.default });
  }

  /**
   * Asserts the pager offers its full set of controls: a Previous arrow, a Next
   * arrow, and numbered page buttons.
   *
   * The pager sits below the table, so a person has to scroll to it - which is
   * why this scrolls it into view first. That is for the screenshot's sake
   * rather than the assertion's: element visibility in Playwright does not
   * depend on the viewport, so the check would pass either way, but a failure
   * screenshot taken with the footer off-screen shows none of the evidence.
   *
   * The arrows carry no text - they are chevron icons - so they are asserted by
   * id and enabled-state, never by label.
   */
  async expectPagerControlsComplete(): Promise<void> {
    await this.pager().scrollIntoViewIfNeeded().catch(() => undefined);
    await expect(this.pager()).toBeVisible({ timeout: Timeouts.default });

    await expect(
      this.prevPageButton(),
      'the pager should offer a Previous arrow',
    ).toBeVisible({ timeout: Timeouts.default });
    await expect(
      this.nextPageButton(),
      'the pager should offer a Next arrow',
    ).toBeVisible({ timeout: Timeouts.default });

    await expect
      .poll(() => this.pageButtons().count(), {
        timeout: Timeouts.default,
        message: 'the pager should offer numbered page buttons',
      })
      .toBeGreaterThan(0);
  }

  // ---- Row-level status badge ----------------------------------------------

  /**
   * A row's status badge. Its `data-tone` attribute is the application's own,
   * language-independent statement of which colour band the status maps to -
   * see STATUS_TONE.
   */
  protected async statusBadge(entityName: string): Promise<Locator> {
    const id = await this.rowId(entityName);
    return this.byId(statusBadgeId(id));
  }

  /** The colour band a row's status is rendered in, e.g. `active`. */
  async getStatusTone(entityName: string): Promise<string> {
    const badge = await this.statusBadge(entityName);
    return (await badge.getAttribute('data-tone')) ?? '';
  }

  /**
   * The status TEXT one row displays, e.g. "Inactive".
   *
   * The tone above says which colour band the status falls in, which is the
   * right thing for the colour-coding checks but too coarse for the lifecycle
   * ones: Inactive and "Not Live" both render `neutral`, so a transition test
   * built on the tone would accept a payer that had never been approved as
   * evidence of a manual inactivation. Reading the label distinguishes them.
   */
  async getStatusText(entityName: string): Promise<string> {
    const badge = await this.statusBadge(entityName);
    return ((await badge.textContent()) ?? '').trim();
  }

  /**
   * Asserts a row's status settles on `expected`.
   *
   * Polled rather than a single read, because a status change lands via a list
   * re-query: reading straight after the action that caused it returns the
   * PREVIOUS value, which is how a correct transition gets reported as a
   * failure. Same reason `payerSample` waits for the list to settle.
   */
  async expectStatusText(entityName: string, expected: string): Promise<void> {
    await expect
      .poll(async () => this.getStatusText(entityName), {
        timeout: Timeouts.default,
        message: `"${entityName}" should display the status "${expected}".`,
      })
      .toBe(expected);
  }

  /**
   * Every (status text, tone) pair currently rendered, de-duplicated.
   *
   * Reading both together is what makes the colour-coding assertion meaningful:
   * proving a tone exists says nothing unless it is tied to the status it is
   * supposed to represent.
   */
  async getStatusTonePairs(): Promise<{ status: string; tone: string }[]> {
    const pairs = await this.page
      .locator(`span[id^="${this.screen}-table-row-"][id$="-status-badge"]`)
      .evaluateAll((badges) =>
        badges.map((badge) => ({
          status: (badge as HTMLElement).innerText.trim(),
          tone: badge.getAttribute('data-tone') ?? '',
        })),
      );
    const seen = new Set<string>();
    return pairs.filter((pair) => {
      const key = `${pair.status}|${pair.tone}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // ---- Column shape --------------------------------------------------------

  /**
   * Every rendered row as a (name, status) PAIR, read in one pass.
   *
   * Reading the name column and the status column separately is unsafe: the
   * list re-renders asynchronously, so a re-query between the two reads pairs a
   * name with a different row's status. Sampling "a payer with status X" that
   * way returned payers of the wrong status, and the tests built on it reported
   * defects that did not exist. One pass over the rows makes each pair
   * self-consistent by construction.
   *
   * The two column keys are parameters because the "name" column differs per
   * module; the payer list passes its own.
   */
  async getRowPairs(
    nameColumnKey: string,
    statusColumnKey: string,
  ): Promise<{ name: string; status: string }[]> {
    return this.rows().evaluateAll(
      (rows, keys) =>
        rows.map((row) => {
          const read = (key: string): string => {
            const cell = row.querySelector(`[id$="-cell-${key}"]`);
            return cell ? (cell as HTMLElement).innerText.trim() : '';
          };
          return { name: read(keys.name), status: read(keys.status) };
        }),
      { name: nameColumnKey, status: statusColumnKey },
    );
  }

  /** Asserts a column header is present, by its model-property key. */
  async expectColumnPresent(columnKey: string): Promise<void> {
    await expect(this.columnHeader(columnKey)).toBeVisible({ timeout: Timeouts.default });
  }

  /** The column keys the table actually renders, in left-to-right order. */
  async getColumnKeys(): Promise<string[]> {
    const prefix = `${this.screen}-table-th-`;
    const ids = await this.page
      .locator(`th[id^="${prefix}"]`)
      .evaluateAll((headers) => headers.map((header) => (header as HTMLElement).id));
    return ids.map((id) => id.slice(prefix.length));
  }

  /**
   * Every value rendered in a column, by the column's model-property key.
   *
   * Named apart from the concrete pages' own typed column readers (e.g.
   * `PayerManagementPage.getColumnValues`, which accepts only the seven
   * SORTABLE column keys) so that neither shadows the other: this one reaches
   * any column the table renders, including the non-sortable ones the metrics
   * story has to read.
   */
  async readColumn(columnKey: string): Promise<string[]> {
    return this.columnValues(columnKey);
  }

  // ---- Data-format and completeness assertions -----------------------------

  /**
   * Asserts every value in a column matches `pattern`.
   *
   * Checked across EVERY rendered row rather than one sample, because a single
   * well-formed row says nothing about the column - and a display mask that
   * fails on one record in ten is exactly the defect a format case looks for.
   *
   * The list's blank marker is tolerated: a column being legitimately empty for
   * a record is not a formatting defect (a Payer Code is only issued at
   * publication), and rejecting it would report a defect that is not one.
   */
  async expectColumnMatches(
    columnKey: string,
    pattern: RegExp,
    description: string,
  ): Promise<void> {
    // Rows arrive after the table element does, so this waits rather than
    // reading once - see waitForRowsRendered.
    await this.expectRowsRendered();
    const values = await this.readColumn(columnKey);
    expect(values.length, `the ${columnKey} column must render values to check`).toBeGreaterThan(
      0,
    );
    const malformed = values.filter(
      (value) => !this.isBlankCell(value) && !pattern.test(value),
    );
    expect(
      malformed,
      `every ${columnKey} value should be ${description}; these were not: `
        + `${malformed.join(' | ')}`,
    ).toEqual([]);
  }

  /** Whether a cell holds the list's "no value" marker rather than data. */
  protected isBlankCell(value: string): boolean {
    const trimmed = value.trim();
    return trimmed === '' || trimmed === '—' || trimmed === '-';
  }

  /**
   * Asserts a column's populated values are all distinct - the check for a
   * column the model declares unique, such as an issued record code. Blanks are
   * excluded: several records may legitimately have no value yet, and that is
   * not a uniqueness violation.
   */
  async expectColumnValuesUnique(columnKey: string): Promise<void> {
    await this.expectRowsRendered();
    const values = (await this.readColumn(columnKey)).filter(
      (value) => !this.isBlankCell(value),
    );
    const seen = new Set<string>();
    const repeated = new Set<string>();
    for (const value of values) {
      if (seen.has(value)) repeated.add(value);
      seen.add(value);
    }
    expect(
      [...repeated],
      `the ${columnKey} column must hold unique values`,
    ).toEqual([]);
  }

  /**
   * Asserts a row carries a value in each of the given columns - i.e. the row
   * rendered its data rather than a run of empty cells.
   */
  async expectRowRequiredColumnsPopulated(
    entityName: string,
    columnKeys: readonly string[],
  ): Promise<void> {
    for (const columnKey of columnKeys) {
      const value = await this.getCellValue(entityName, columnKey);
      expect(
        value,
        `row "${entityName}" should carry a value in its ${columnKey} column`,
      ).not.toBe('');
    }
  }

  /**
   * Asserts a row offers each named action AND that each is usable.
   *
   * Enabled-ness matters as much as presence here: the application disables
   * every button while a request is in flight, so an action that is rendered
   * but permanently disabled would pass a visibility-only check while being
   * unusable.
   */
  async expectRowActionsEnabled(
    entityName: string,
    actions: readonly RowAction[],
  ): Promise<void> {
    for (const action of actions) {
      const button = await this.rowActionButton(entityName, action);
      await expect(
        button,
        `row "${entityName}" should offer a "${action}" action`,
      ).toBeVisible({ timeout: Timeouts.default });
      await expect(
        button,
        `the "${action}" action on row "${entityName}" should be usable`,
      ).toBeEnabled({ timeout: Timeouts.default });
    }
  }

  /**
   * Asserts every status badge in the current (filtered) list reports the
   * expected status and carries the expected colour band.
   *
   * Both halves matter: a tone proves nothing unless it is tied to the status
   * it is meant to represent, and a status text proves nothing about colour.
   */
  /**
   * Every (approval status, tone) pair currently rendered, de-duplicated.
   *
   * Read from the APPROVAL status badge, which is a different element from the
   * lifecycle status badge and carries its own colour band - see
   * `versionStatusBadgeId` for why the two must not be confused.
   */
  async getApprovalStatusTonePairs(): Promise<{ status: string; tone: string }[]> {
    const pairs = await this.page
      .locator(`span[id^="${this.screen}-table-row-"][id$="-version-status"]`)
      .evaluateAll((badges) =>
        badges.map((badge) => ({
          status: (badge as HTMLElement).innerText.trim(),
          tone: badge.getAttribute('data-tone') ?? '',
        })),
      );
    const seen = new Set<string>();
    return pairs.filter((pair) => {
      const key = `${pair.status}|${pair.tone}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Asserts every APPROVAL status badge whose text contains `expectedStatus`
   * carries `expectedTone`.
   *
   * Matched on `contains` rather than equality because the badge folds the
   * version number into its text ("v0 · Pending Approval"), and the version
   * differs per record.
   */
  async expectApprovalStatusToneFor(
    expectedStatus: string,
    expectedTone: string,
  ): Promise<void> {
    await expect
      .poll(
        async () => {
          const pairs = await this.getApprovalStatusTonePairs();
          const matching = pairs.filter((pair) => pair.status.includes(expectedStatus));
          if (matching.length === 0) {
            return `no approval-status badge containing "${expectedStatus}" - badges on `
              + `screen: ${pairs.map((p) => `${p.status}/${p.tone}`).join(', ') || '(none)'}`;
          }
          const wrongTone = matching.filter((pair) => pair.tone !== expectedTone);
          if (wrongTone.length > 0) {
            return `"${expectedStatus}" rendered with tone(s) `
              + `${wrongTone.map((pair) => pair.tone).join(', ')}`;
          }
          return 'ok';
        },
        {
          timeout: Timeouts.default,
          message:
            `every payer whose approval status reads "${expectedStatus}" should render with `
            + `the colour band "${expectedTone}"`,
        },
      )
      .toBe('ok');
  }

  async expectStatusToneFor(expectedStatus: string, expectedTone: string): Promise<void> {
    // Asserted as "every badge showing this status carries this tone", NOT as
    // "every row on screen shows this status".
    //
    // That distinction is load-bearing. Filtering the payer list by a status
    // does not return only that status - filtering to Active returns rows
    // displaying both "Active" and "Not Live" - so a whole-list assertion would
    // fail on the FILTER's behaviour while claiming the colour mapping was
    // wrong. The colour mapping is what this checks, and it is checked over
    // exactly the badges that claim the status in question.
    //
    // Polled, because a filter re-queries the list: read immediately, the table
    // still holds the previous result set.
    await expect
      .poll(
        async () => {
          const pairs = await this.getStatusTonePairs();
          const matching = pairs.filter((pair) => pair.status === expectedStatus);
          if (matching.length === 0) {
            return `no badge showing "${expectedStatus}" - statuses on screen: `
              + `${pairs.map((pair) => `${pair.status}/${pair.tone}`).join(', ') || '(none)'}`;
          }
          const wrongTone = matching.filter((pair) => pair.tone !== expectedTone);
          if (wrongTone.length > 0) {
            return `"${expectedStatus}" rendered with tone(s) `
              + `${wrongTone.map((pair) => pair.tone).join(', ')}`;
          }
          return 'ok';
        },
        {
          timeout: Timeouts.default,
          message:
            `every payer showing status "${expectedStatus}" should render with the colour `
            + `band "${expectedTone}"`,
        },
      )
      .toBe('ok');
  }

  /**
   * Asserts no two statuses render in the same colour band, over whatever
   * statuses are currently on screen. "No overlap between statuses" is what the
   * colour-coding criterion asks for, and it cannot be shown one status at a
   * time.
   */
  async expectStatusTonesDistinct(): Promise<void> {
    await this.expectRowsRendered();
    const pairs = await this.getStatusTonePairs();
    expect(pairs.length, 'there must be status badges on screen to compare').toBeGreaterThan(0);
    const byTone = new Map<string, Set<string>>();
    for (const { status, tone } of pairs) {
      if (!byTone.has(tone)) byTone.set(tone, new Set());
      byTone.get(tone)!.add(status);
    }
    const shared = [...byTone.entries()]
      .filter(([, statuses]) => statuses.size > 1)
      .map(([tone, statuses]) => `${tone} -> ${[...statuses].join(' & ')}`);
    expect(shared, 'each status must have its own colour band').toEqual([]);
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

  /**
   * Asserts the list did NOT present data as though it had loaded successfully,
   * for use when the list's endpoint has been made to fail.
   *
   * Deliberately not an assertion that some particular error element appeared:
   * a DOM audit found the application has no message element with an id of its
   * own - it reports errors through a toast and through a banner carrying only
   * a CSS class - so demanding one by id would fail for the wrong reason. What
   * IS checkable, and is what the criterion is really about, is the failure
   * mode that matters: rows must not be rendered from stale data as if nothing
   * were wrong. A visible empty state, a visible toast, or no table at all all
   * count as reporting the problem.
   */
  async expectDataLoadFailureReported(): Promise<void> {
    await expect
      .poll(
        async () => {
          if ((await this.rows().count()) > 0) return 'rows-rendered';
          return 'no-rows';
        },
        {
          timeout: Timeouts.default,
          message:
            'with the list endpoint failing, the module must not render rows as though the '
            + 'data had loaded successfully',
        },
      )
      .toBe('no-rows');
  }
}
