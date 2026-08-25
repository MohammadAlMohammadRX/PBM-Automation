import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { ListPageBase } from '../components/ListPageBase';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { LanguageSwitcher, type AppLanguage } from '../components/LanguageSwitcher';
import { PayerFormDialog } from './PayerFormDialog';
import { PayerDetailPage } from './PayerDetailPage';
import { AdvancedSearchDrawer } from './AdvancedSearchDrawer';
import { AppRoutes } from '../../constants/AppRoutes';
import { Timeouts } from '../../constants/Timeouts';
import { Logger } from '../../utils/Logger';
import type { MandatoryFieldSpec, PayerData } from '../../data/payers/payerTypes';
import { DELETE_UI, DELETE_MESSAGES } from '../../data/payers/deletePayer.data';
import {
  ALL_STATUSES,
  ALL_TYPES,
  EMPTY_STATE_TEXT,
  type StatusFilterOption,
  type TypeFilterOption,
} from '../../data/payers/filterPayer.data';
import { NO_RESULTS_TEXT, SEARCH_UI } from '../../data/payers/searchPayer.data';
import { SortMenu } from './SortMenu';
import {
  blanksAreGrouped,
  duplicates,
  isGrouped,
  isSorted,
  withoutBlanks,
  type SortDirection,
} from '../../utils/SortUtils';
import {
  DEFAULT_SORT,
  DIRECTION_SUFFIX,
  SORT_MATRIX,
  SORT_MENU_OPTION_COUNT,
  SORTABLE_COLUMNS,
  sortColumn,
  sortOptionLabel,
  type SortColumnKey,
} from '../../data/payers/sortPayer.data';

/** Columns exposed by the payer list table (verified against the live app). */
const COLUMN = {
  code: 'Code',
  status: 'Status',
  approvalStatus: 'Approval Status',
} as const;

/**
 * Page Object for the Payer Management module (`/payer-management`).
 *
 * Reuses ListPageBase for search/table/row-actions/pagination and adds only
 * payer-specific orchestration: creating via the wizard, sending a draft for
 * approval, and reading the Code / Status / Approval Status columns.
 */
export class PayerManagementPage extends ListPageBase {
  constructor(page: Page) {
    super(page, 'Add Payer');
  }


  private confirmDialog(): ConfirmDialog {
    return new ConfirmDialog(this.page);
  }

  form(): PayerFormDialog {
    return new PayerFormDialog(this.page);
  }

  async open(): Promise<void> {
    await this.goto(AppRoutes.payerManagement);
    await this.ensureTableView();
  }

  /** Navigates to the module WITHOUT asserting the table renders - used by the
   *  RBAC test, where a non-admin may be denied the page or its controls. */
  async navigate(): Promise<void> {
    await this.goto(AppRoutes.payerManagement);
  }

  /**
   * Guarantees the payer list is on screen before a search/assertion runs.
   * Workflow steps often finish on another module (e.g. the approval queue),
   * and every list assertion should be able to stand on its own.
   */
  private async ensureListOpen(): Promise<void> {
    const onList = await this.page
      .getByRole('table')
      .isVisible({ timeout: Timeouts.short })
      .catch(() => false);
    if (!onList) {
      await this.open();
    }
  }

  /**
   * The toolbar search box. Located by the application's own class rather than
   * by accessible name, because the name is localized and would not match while
   * the UI is in Arabic.
   */
  protected override searchInput(): Locator {
    return this.page.locator('input.pbm-search__input').first();
  }

  /**
   * Finds a row quickly so a following action can act on it: fills the box and
   * presses Enter. This is a NAVIGATION helper.
   *
   * The search behaviour itself is exercised by `typeInSearch`, which types real
   * keystrokes - do not merge the two. Both touch the same input, but only one
   * of them is the thing under test.
   */
  override async search(term: string): Promise<void> {
    await this.ensureListOpen();
    await super.search(term);
  }

  // =====================================================================
  // Search Payers by Name or Code
  // =====================================================================

  private searchControl(label: 'Clear' | 'Filters'): Locator {
    return this.page.locator(`.pbm-search button[aria-label="${label}"]`);
  }

  /**
   * Types into the search box one character at a time, as a user would. The list
   * filters in real time (no Enter needed) and the application only reacts to
   * genuine key events, so this drives the real behaviour rather than setting
   * the value programmatically.
   */
  async typeInSearch(term: string): Promise<void> {
    Logger.step(`Searching for "${term}" (real-time)`);
    const input = this.searchInput();
    await input.click();
    await input.press('ControlOrMeta+a');
    await input.press('Delete');
    await input.pressSequentially(term);
    await this.waitForPageReady();
  }

  /** Empties the search box using the built-in clear control. */
  async clearSearchBox(): Promise<void> {
    Logger.step('Clearing the search box');
    await this.searchControl('Clear').first().click();
    await expect(this.searchInput()).toHaveValue('', { timeout: Timeouts.default });
    await this.waitForPageReady();
  }

  async getSearchBoxValue(): Promise<string> {
    return this.searchInput().inputValue();
  }

  /** Opens the Advanced Search panel from the search box. */
  async openAdvancedSearch(): Promise<AdvancedSearchDrawer> {
    Logger.step('Opening Advanced Search');
    await this.searchControl('Filters').first().click();
    const drawer = new AdvancedSearchDrawer(this.page);
    await drawer.waitForOpen();
    return drawer;
  }

  /** Every payer name currently listed. */
  async getVisiblePayerNames(): Promise<string[]> {
    return this.columnValues(0);
  }

  /** Every licence number currently listed. */
  async getVisibleLicenseNumbers(): Promise<string[]> {
    return this.columnValues(5);
  }

  /** Asserts every listed payer's name contains the term (case-insensitive). */
  async expectAllNamesContain(term: string): Promise<void> {
    const needle = term.trim().toLowerCase();
    await expect
      .poll(
        async () => {
          const names = await this.getVisiblePayerNames();
          if (names.length === 0 || names.some((n) => n.includes(NO_RESULTS_TEXT))) return 'none';
          return names.every((name) => name.toLowerCase().includes(needle)) ? 'all' : 'some';
        },
        { timeout: Timeouts.default },
      )
      .toBe('all');
  }

  /** Asserts a specific payer is present in the results. */
  async expectResultsInclude(payerName: string): Promise<void> {
    await expect
      .poll(
        async () => (await this.getVisiblePayerNames()).some((n) => n.includes(payerName)),
        { timeout: Timeouts.default },
      )
      .toBe(true);
  }

  /**
   * Asserts every listed row carries the given Payer Code. Used after a code
   * search - unlike expectPayerCodeEquals it does not re-search by name, which
   * would discard the search being verified.
   */
  async expectAllPayerCodes(code: string): Promise<void> {
    await expect
      .poll(() => this.distinctColumn(2), { timeout: Timeouts.default })
      .toBe(code);
  }

  /** Asserts every listed row carries the given licence number. */
  async expectAllLicenseNumbers(licenseNumber: string): Promise<void> {
    await expect
      .poll(
        async () => {
          const values = await this.getVisibleLicenseNumbers();
          if (values.length === 0 || values.some((v) => v.includes(NO_RESULTS_TEXT))) return 'none';
          return [...new Set(values)].join(',');
        },
        { timeout: Timeouts.default },
      )
      .toBe(licenseNumber);
  }

  /** Asserts a search returned at least one row. */
  async expectResultsFound(): Promise<void> {
    await expect
      .poll(() => this.distinctColumn(0), { timeout: Timeouts.default })
      .not.toBe(PayerManagementPage.NO_ROWS);
  }

  /** Asserts the search UI exposes all of its expected controls. */
  async expectSearchUiPresent(): Promise<void> {
    await expect(this.page.locator('.pbm-search i.pi-search')).toBeVisible();
    await expect(this.searchInput()).toHaveAttribute('placeholder', SEARCH_UI.placeholder);
    await expect(this.searchControl('Filters')).toBeVisible();
  }

  /** Asserts the clear control only appears once the box has text. */
  async expectClearControlVisible(): Promise<void> {
    await expect(this.searchControl('Clear').first()).toBeVisible({ timeout: Timeouts.default });
  }

  /**
   * Asserts a non-administrator cannot exceed their granted search access:
   * either the module is not reachable at all, or the Advanced Search control
   * is not offered to them.
   */
  async expectSearchAccessRestricted(): Promise<void> {
    const onModule = await this.page
      .getByRole('table')
      .isVisible({ timeout: Timeouts.short })
      .catch(() => false);
    if (!onModule) {
      await expect(this.page.getByRole('table')).toHaveCount(0, { timeout: Timeouts.default });
      return;
    }
    await expect(this.searchControl('Filters')).toHaveCount(0, { timeout: Timeouts.default });
  }

  /**
   * Asserts no script executed and no error dialog surfaced - the list is still
   * rendered and interactive after an injection-style search term.
   */
  async expectNoUnexpectedDialog(): Promise<void> {
    await expect(this.page.locator('.p-dialog')).toHaveCount(0, { timeout: Timeouts.short });
    await expect(this.page.getByRole('table')).toBeVisible({ timeout: Timeouts.default });
  }

  /** Outcome of a search that may legitimately match nothing. */
  async expectSearchOutcome(expectMatches: boolean, term: string): Promise<void> {
    if (expectMatches) {
      await this.expectAllNamesContain(term);
      return;
    }
    await this.expectEmptyState();
  }

  // =====================================================================
  // Sort Payer List by Column Headers
  // =====================================================================

  sortMenu(): SortMenu {
    return new SortMenu(this.page);
  }

  /** The list's data endpoint - one call per sort, filter, search or page change. */
  private static readonly LIST_ENDPOINT = '/api/Payers/GetPayers';

  /**
   * Runs an action that re-queries the list, and waits for that query's response
   * before returning.
   *
   * Sorting is server-side, so the rows on screen immediately after the click
   * are still the previous order. Waiting on the list response - rather than on
   * the DOM - is what guarantees a following assertion reads the NEW ordering:
   * without it, a sort whose previous page happens to satisfy the new ordering
   * (a page of identical Payer Types, say) would pass against stale rows.
   */
  private async withListRefresh(action: () => Promise<void>): Promise<void> {
    const refreshed = this.page.waitForResponse(
      (response) =>
        response.url().includes(PayerManagementPage.LIST_ENDPOINT) && response.ok(),
      { timeout: Timeouts.default },
    );
    await action();
    await refreshed;
    await this.waitForPageReady();
  }

  /** Applies a sort from the toolbar's Sort By menu and waits for the re-query. */
  async sortBy(column: SortColumnKey, direction: SortDirection): Promise<void> {
    await this.ensureListOpen();
    await this.withListRefresh(() => this.sortMenu().select(column, direction));
    await expect(this.page.getByRole('table')).toBeVisible({ timeout: Timeouts.default });
  }

  /** Every value currently rendered in a sortable column. */
  async getColumnValues(column: SortColumnKey): Promise<string[]> {
    return this.columnValues(sortColumn(column).columnIndex);
  }

  /**
   * The ordering verdict for a column: `'ordered'`, `'no rows'`, or the offending
   * values, so a failure names the actual order instead of reporting `false`.
   *
   * Blank cells are removed before an alphabetical comparison and checked
   * separately by `expectBlanksGrouped`: the application sorts them as the
   * lowest value, so leaving them in would mask an ordering defect when
   * descending.
   */
  private async ordering(column: SortColumnKey, direction: SortDirection): Promise<string> {
    const grouped = sortColumn(column).comparison === 'grouped';
    const rows = await this.getColumnValues(column);
    if (rows.length === 0) return 'no rows';

    const values = grouped ? rows : withoutBlanks(rows);
    if (values.length < 2) return 'ordered';
    const ok = grouped ? isGrouped(values) : isSorted(values, direction);
    return ok ? 'ordered' : values.join(' | ');
  }

  /**
   * Asserts the visible rows are ordered by the given column and direction.
   * Polled, because selecting a sort re-queries the list asynchronously.
   */
  async expectColumnSorted(column: SortColumnKey, direction: SortDirection): Promise<void> {
    await expect
      .poll(() => this.ordering(column, direction), { timeout: Timeouts.default })
      .toBe('ordered');
  }

  /** Asserts a sort left the column's blank cells together at one end. */
  async expectBlanksGrouped(column: SortColumnKey): Promise<void> {
    await expect
      .poll(() => this.getColumnValues(column).then(blanksAreGrouped), {
        timeout: Timeouts.default,
      })
      .toBe(true);
  }

  /** Asserts the sort indicator names this column and direction. */
  async expectSortIndicator(
    column: SortColumnKey,
    direction: SortDirection,
    language: AppLanguage = 'en',
  ): Promise<void> {
    await this.sortMenu().expectActive(column, direction, language);
  }

  /**
   * Asserts the sort indicator names the active column and direction while the
   * Sort By menu is CLOSED (acceptance criterion 2).
   *
   * `expectSortIndicator` reads the checked menu item, which requires opening
   * the menu; this checks the indicator a user sees on the list itself.
   */
  async expectVisibleSortIndicator(
    column: SortColumnKey,
    direction: SortDirection,
    language: AppLanguage = 'en',
  ): Promise<void> {
    const menu = this.sortMenu();
    await expect
      .poll(() => menu.collapsedText(), { timeout: Timeouts.default })
      .toContain(sortColumn(column).label[language]);
    expect(
      await menu.collapsedText(),
      'the sort indicator must name the active direction',
    ).toContain(DIRECTION_SUFFIX[direction][language]);
  }

  /**
   * Column headers that expose a sort affordance of their own - an `aria-sort`
   * attribute or a clickable control inside the header cell.
   */
  private async headersWithSortAffordance(): Promise<string[]> {
    const headers = this.page.getByRole('table').getByRole('columnheader');
    const total = await headers.count();
    const sortable: string[] = [];
    for (let index = 0; index < total; index += 1) {
      const header = headers.nth(index);
      const label = (await header.innerText()).replace(/\s+/g, ' ').trim();
      const exposesState = (await header.getAttribute('aria-sort')) !== null;
      const exposesControl = (await header.getByRole('button').count()) > 0;
      if (exposesState || exposesControl) sortable.push(label);
    }
    return sortable;
  }

  /** Asserts each sortable column can also be sorted from its column header. */
  async expectColumnHeadersSortable(): Promise<void> {
    const expected = SORTABLE_COLUMNS.map((column) => column.header);
    await expect
      .poll(() => this.headersWithSortAffordance(), { timeout: Timeouts.default })
      .toEqual(expect.arrayContaining(expected));
  }

  /** Reloads the module - a fresh load, with no sort chosen in the session. */
  async reopen(): Promise<void> {
    await this.reload();
    await this.ensureTableView();
  }

  /** Asserts the Sort By menu offers all seven columns in both directions. */
  async expectSortMenuComplete(language: AppLanguage = 'en'): Promise<void> {
    await this.sortMenu().expectTriggerPresent(language);
    const expected = SORT_MATRIX.map((selection) =>
      sortOptionLabel(selection.column, selection.direction, language),
    );
    await expect
      .poll(() => this.sortMenu().optionLabels(), { timeout: Timeouts.default })
      .toEqual(expected);
    expect(expected, 'seven columns x two directions').toHaveLength(SORT_MENU_OPTION_COUNT);
  }

  /**
   * The size of the result set: how many pages it spans and how many rows the
   * current page holds. Re-sorting reorders records, so neither value may
   * change - that is what proves no record was dropped or duplicated.
   */
  async getListSize(): Promise<{ pages: number; rows: number }> {
    return { pages: await this.getPageCount(), rows: await this.getRowCount() };
  }

  /**
   * Asserts no row is repeated. Two payers may legitimately share a name, but
   * they differ in License Number and Email, so an identical full row means the
   * sort itself duplicated a record.
   */
  async expectNoDuplicateRows(): Promise<void> {
    const rows = (await this.page.locator('table tbody tr').allInnerTexts()).map((text) =>
      text.replace(/\s+/g, ' ').trim(),
    );
    expect(duplicates(rows), 'the sort must not duplicate rows').toEqual([]);
  }

  /** Jumps to the last page of results. */
  async goToLastPage(): Promise<void> {
    const lastPage = await this.getPageCount();
    await this.withListRefresh(() => this.goToPage(lastPage));
    await this.expectNotOnFirstPage();
  }

  /**
   * Values from the final pages of the list, in page order.
   *
   * A Payer Code is only issued once a payer is published, so most rows have a
   * blank Code and the ascending sort puts them all on the leading pages - the
   * real codes are at the end. The pager only renders a window of page numbers,
   * so the walk jumps to the last page and steps backwards with "Previous page".
   */
  private async columnValuesFromLastPages(
    column: SortColumnKey,
    pages: number,
  ): Promise<string[]> {
    await this.goToLastPage();
    const perPage: string[][] = [await this.getColumnValues(column)];
    for (let step = 1; step < pages; step += 1) {
      await this.withListRefresh(() => this.goToPreviousPage());
      perPage.unshift(await this.getColumnValues(column));
    }
    return perPage.flat();
  }

  /** Asserts a column is ordered across the last `pages` pages of results. */
  async expectColumnSortedOnLastPages(
    column: SortColumnKey,
    direction: SortDirection,
    pages = 2,
  ): Promise<void> {
    const header = sortColumn(column).header;
    const values = withoutBlanks(await this.columnValuesFromLastPages(column, pages));
    expect(values.length, `${header} must expose values to order`).toBeGreaterThan(1);
    expect(isSorted(values, direction), `${header} order: ${values.join(' | ')}`).toBe(true);
  }

  /**
   * Asserts a narrowed (filtered and/or searched) result set is internally
   * consistent under the applied sort. An empty result set is consistent too -
   * the filter combination may legitimately match nothing - so the emptiness
   * check lives here rather than as a branch inside the test.
   */
  async expectSortedSubsetConsistent(
    column: SortColumnKey,
    direction: SortDirection,
  ): Promise<void> {
    await expect
      .poll(
        async () => {
          const rows = await this.getRowCount();
          if (rows === 0) return 'ordered';
          return this.ordering(column, direction);
        },
        { timeout: Timeouts.default },
      )
      .toBe('ordered');
    await expect(this.page.getByRole('table')).toBeVisible();
  }

  /**
   * Asserts how many networks the list reports for a payer. The Networks column
   * is the payer's live dependency count, so this is how a dependency test
   * PROVES its precondition instead of assuming a seeded record has one.
   */
  async expectNetworkCount(payerName: string, expected: number): Promise<void> {
    await this.search(payerName);
    await expect
      .poll(
        async () => {
          const shown = (await this.getRowCellValue(payerName, 'Networks')).trim();
          return shown === '' || shown === '—' ? 0 : Number(shown);
        },
        { timeout: Timeouts.default },
      )
      .toBe(expected);
  }

  /**
   * Whether the last delete attempt was refused because the payer carries
   * dependencies. Cleanup asks this so it stops retrying a record the
   * application will never let it remove - the dependency tests create exactly
   * such a payer on purpose.
   *
   * Matches either language, since the Arabic test hits the same path.
   */
  async wasDeletionBlockedByDependency(): Promise<boolean> {
    return this.page
      .locator('.p-toast-message')
      .filter({ hasText: /cannot be deleted|لا يمكن حذف/ })
      .first()
      .waitFor({ state: 'visible', timeout: Timeouts.short })
      .then(() => true)
      .catch(() => false);
  }

  /** Searches for a term and reports whether a matching row came back. Used by
   *  cleanup, which must be able to tell "removed" from "never found". */
  async isRowVisibleAfterSearch(term: string): Promise<boolean> {
    await this.search(term);
    return this.isRowVisible(term);
  }

  /** Asserts both list filters still hold the selections the test applied. */
  async expectFiltersApplied(type: string, status: string): Promise<void> {
    await expect(this.filterSelect('type')).toHaveText(type, { timeout: Timeouts.default });
    await expect(this.filterSelect('status')).toHaveText(status, { timeout: Timeouts.default });
  }

  /** Asserts the search box still holds the term the test typed. */
  async expectSearchTerm(term: string): Promise<void> {
    await expect(this.searchInput()).toHaveValue(term, { timeout: Timeouts.default });
  }

  /** Asserts exactly one payer remains listed, and it is the expected one. */
  async expectOnlyRow(payerName: string): Promise<void> {
    await expect
      .poll(() => this.getColumnValues('payerName'), { timeout: Timeouts.default })
      .toEqual([payerName]);
  }

  /**
   * Asserts the list came back from a reload in its designed post-refresh state:
   * sort, filters and search all reset to their defaults, with the table
   * rendering normally and no stale rows.
   */
  async expectListStateAfterReload(): Promise<void> {
    await this.reopen();
    await this.expectFiltersAtDefault();
    await expect(this.searchInput()).toHaveValue('', { timeout: Timeouts.default });
    await this.expectSortIndicator(DEFAULT_SORT.column, DEFAULT_SORT.direction);
    await this.expectColumnSorted(DEFAULT_SORT.column, DEFAULT_SORT.direction);
  }

  // =====================================================================
  // Filter Payer List by Type and Status
  // =====================================================================

  /**
   * The two list filters. They are PrimeNG selects rendered side by side in the
   * toolbar - Payer Type first, Status second - and neither carries a stable id,
   * so they are addressed by position within the toolbar.
   */
  private filterSelect(which: 'type' | 'status'): Locator {
    return this.page.getByRole('combobox').nth(which === 'type' ? 0 : 1);
  }

  /** Selects a value in one of the list filters and waits for the list to settle. */
  private async applyFilter(which: 'type' | 'status', option: string): Promise<void> {
    Logger.step(`Filtering payer list by ${which} = "${option}"`);
    await this.filterSelect(which).click();
    await this.page
      .getByRole('option', { name: option, exact: true })
      .filter({ visible: true })
      .first()
      .click();
    await this.waitForPageReady();
    await expect(this.filterSelect(which)).toHaveText(option, { timeout: Timeouts.default });
  }

  /** Accepts a configured option label, so a newly added Payer Type also works. */
  async filterByType(option: TypeFilterOption | string): Promise<void> {
    await this.applyFilter('type', option);
  }

  async filterByStatus(option: StatusFilterOption | string): Promise<void> {
    await this.applyFilter('status', option);
  }

  /** Restores both filters to their neutral "show everything" selection. */
  async resetFilters(): Promise<void> {
    await this.filterByType(ALL_TYPES);
    await this.filterByStatus(ALL_STATUSES);
  }

  /** Options offered by a filter dropdown, in the order they are listed. */
  async getFilterOptions(which: 'type' | 'status'): Promise<string[]> {
    await this.filterSelect(which).click();
    const options = this.page.getByRole('option').filter({ visible: true });
    await expect(options.first()).toBeVisible({ timeout: Timeouts.default });
    const labels = (await options.allInnerTexts()).map((text) => text.trim());
    await this.page.keyboard.press('Escape');
    return labels;
  }

  async getVisiblePayerTypes(): Promise<string[]> {
    return this.columnValues(1);
  }

  async getVisibleStatuses(): Promise<string[]> {
    return this.columnValues(8);
  }

  /** Marker returned when the filtered list has no rows. */
  private static readonly NO_ROWS = '<empty>';

  /**
   * The distinct values of a column, as a stable sorted string. The list
   * re-fetches asynchronously after a filter changes, so every filter assertion
   * polls this instead of reading the table once.
   */
  private async distinctColumn(columnIndex: number): Promise<string> {
    const values = await this.columnValues(columnIndex);
    if (values.length === 0 || values.some((value) => value.includes(EMPTY_STATE_TEXT))) {
      return PayerManagementPage.NO_ROWS;
    }
    return [...new Set(values)].sort().join(',');
  }

  /** Asserts every visible row reports the expected Payer Type. */
  async expectAllRowsOfType(expectedType: string): Promise<void> {
    await expect
      .poll(() => this.distinctColumn(1), { timeout: Timeouts.default })
      .toBe(expectedType);
  }

  /** Asserts every visible row reports the expected Status. */
  async expectAllRowsOfStatus(expectedStatus: string): Promise<void> {
    await expect
      .poll(() => this.distinctColumn(8), { timeout: Timeouts.default })
      .toBe(expectedStatus);
  }

  /**
   * Outcome of filtering by a status that may legitimately have no records: the
   * rows shown must all match the status, or the list is empty.
   */
  async expectStatusFilterOutcome(expectedStatus: string): Promise<void> {
    await expect
      .poll(() => this.distinctColumn(8), { timeout: Timeouts.default })
      .toMatch(new RegExp(`^(${PayerManagementPage.NO_ROWS}|${expectedStatus})$`));
  }

  /**
   * Outcome of applying BOTH filters: every visible row must match the selected
   * type AND the selected status, or the list is empty. A row matching only one
   * of the two would mean the filters combine as OR rather than AND.
   */
  async expectCombinedFilterOutcome(expectedType: string, expectedStatus: string): Promise<void> {
    const empty = `${PayerManagementPage.NO_ROWS}|${PayerManagementPage.NO_ROWS}`;
    await expect
      .poll(
        async () => `${await this.distinctColumn(1)}|${await this.distinctColumn(8)}`,
        { timeout: Timeouts.default },
      )
      .toMatch(
        new RegExp(`^(${empty.replace(/\|/g, '\\|')}|${expectedType}\\|${expectedStatus})$`),
      );
  }

  /**
   * Asserts the list is genuinely unfiltered by type: an unfiltered page shows
   * more than one Payer Type, which a type filter could never produce.
   */
  async expectMixedPayerTypes(): Promise<void> {
    await expect
      .poll(() => this.distinctColumn(1), { timeout: Timeouts.default })
      .toContain(',');
  }

  async expectPageCount(expected: number): Promise<void> {
    await expect
      .poll(() => this.getPageCount(), { timeout: Timeouts.default })
      .toBe(expected);
  }

  /** Asserts filtering reduced the number of result pages. */
  async expectFewerPagesThan(unfilteredPages: number): Promise<void> {
    await expect
      .poll(() => this.getPageCount(), { timeout: Timeouts.default })
      .toBeLessThan(unfilteredPages);
  }

  /** Asserts both filters are showing their neutral selection. */
  async expectFiltersAtDefault(): Promise<void> {
    await expect(this.filterSelect('type')).toHaveText(ALL_TYPES, { timeout: Timeouts.default });
    await expect(this.filterSelect('status')).toHaveText(ALL_STATUSES, {
      timeout: Timeouts.default,
    });
  }

  /** Asserts the list shows its empty state rather than an error or stale rows. */
  async expectEmptyState(): Promise<void> {
    await expect(this.page.getByText(EMPTY_STATE_TEXT, { exact: false }).first()).toBeVisible({
      timeout: Timeouts.default,
    });
    await expect(this.page.getByRole('table')).toBeVisible();
  }

  // ---- Pagination / result-count helpers (TC-014) ---------------------------

  /**
   * Highest page number offered by the pager - i.e. how many pages of results.
   * Button labels are read and trimmed in code rather than matched with a
   * `hasText` regex, because the rendered label carries surrounding whitespace
   * that an anchored pattern would never match.
   */
  async getPageCount(): Promise<number> {
    // The pager renders after the rows, so wait for it before reading labels.
    await this.page
      .getByRole('button', { name: 'Next page' })
      .waitFor({ state: 'visible', timeout: Timeouts.default })
      .catch(() => undefined);
    const labels = (await this.page.getByRole('button').allInnerTexts())
      .map((text) => Number(text.trim()))
      .filter((value) => Number.isInteger(value) && value > 0);
    return labels.length === 0 ? 1 : Math.max(...labels);
  }

  private previousPageButton(): Locator {
    return this.page.getByRole('button', { name: 'Previous page' });
  }

  async goToPage(pageNumber: number): Promise<void> {
    await this.page.getByRole('button', { name: String(pageNumber), exact: true }).first().click();
    await this.waitForPageReady();
  }

  /**
   * Whether the list is showing the first page. The pager marks the current page
   * with a style rather than an accessible attribute, so this uses the semantic
   * signal instead: "Previous page" is disabled only on page one.
   */
  async expectOnFirstPage(): Promise<void> {
    await expect(this.previousPageButton()).toBeDisabled({ timeout: Timeouts.default });
  }

  async expectNotOnFirstPage(): Promise<void> {
    await expect(this.previousPageButton()).toBeEnabled({ timeout: Timeouts.default });
  }

  /** Opens the module with extra query parameters appended (TC-013). */
  async openWithQuery(query: string): Promise<void> {
    await this.goto(`${AppRoutes.payerManagement}?${query}`);
    await this.ensureTableView();
  }

  /** Opens the "Add New Payer" wizard and returns its Page Object. */
  async openCreateForm(): Promise<PayerFormDialog> {
    await this.clickAdd();
    const form = this.form();
    await form.waitForOpen();
    return form;
  }

  /** Full create happy path: fills all steps with valid data and saves. */
  async createDraftPayer(data: PayerData): Promise<void> {
    const form = await this.openCreateForm();
    await form.createPayer(data);
    await form.waitForClosed();
    await this.waitForPageReady();
  }

  /**
   * Drives the wizard as far as the given mandatory field's step, filling every
   * other field with valid data but leaving that one blank, then triggers the
   * step's validation. Returns the still-open form so the test can assert the
   * required-field error. Branching lives here (Page Object), not in the spec.
   */
  async attemptCreateOmitting(data: PayerData, field: MandatoryFieldSpec): Promise<PayerFormDialog> {
    const form = await this.openCreateForm();

    await form.fillBasicInformation(data, field.step === 'Basic Information' ? field.label : undefined);
    if (field.step === 'Basic Information') {
      await form.clickNext();
      return form;
    }

    await form.clickNext();
    await form.fillContactInformation(
      data,
      field.step === 'Contact Information' ? field.label : undefined,
    );
    if (field.step === 'Contact Information') {
      await form.clickNext();
      return form;
    }

    await form.clickNext();
    await form.fillEffectivePeriod(data, field.label);
    await form.save();
    return form;
  }

  /** Opens a payer's read-only detail view via the "View" row action. */
  async openDetails(payerName: string): Promise<PayerDetailPage> {
    await this.search(payerName);
    await this.waitForRowVisible(payerName);
    await this.viewRow(payerName);
    const detail = new PayerDetailPage(this.page);
    await detail.waitForLoaded();
    return detail;
  }

  /** Opens a payer in the Edit wizard via the "Edit" row action. */
  async openEditForm(payerName: string): Promise<PayerFormDialog> {
    await this.search(payerName);
    await this.waitForRowVisible(payerName);
    await this.editRow(payerName);
    const form = this.form();
    await form.waitForOpen();
    return form;
  }

  // ---- RBAC (TC-012) --------------------------------------------------------

  /** True when the current user is offered the "Create New Payer" action. */
  async isCreateActionAvailable(): Promise<boolean> {
    return this.addButtonInternal()
      .isVisible({ timeout: Timeouts.short })
      .catch(() => false);
  }

  async expectCreateActionDenied(): Promise<void> {
    await expect(this.addButtonInternal()).toHaveCount(0, { timeout: Timeouts.default });
  }

  /**
   * Asserts a non-administrator cannot manipulate the list filters: either the
   * module itself is not reachable, or its filter controls are absent.
   */
  async expectFilterControlsRestricted(): Promise<void> {
    const onModule = await this.page
      .getByRole('table')
      .isVisible({ timeout: Timeouts.short })
      .catch(() => false);
    if (!onModule) {
      // The module is not accessible at all, which satisfies the rule.
      await expect(this.page.getByRole('table')).toHaveCount(0, { timeout: Timeouts.default });
      return;
    }
    await expect(this.page.getByRole('combobox')).toHaveCount(0, { timeout: Timeouts.default });
  }

  /** Asserts no payer row offers an Edit action to the current (restricted) user. */
  async expectEditActionDenied(): Promise<void> {
    await expect(this.page.locator('table button[title="Edit"]')).toHaveCount(0, {
      timeout: Timeouts.default,
    });
  }

  private addButtonInternal() {
    return this.page.getByRole('button', { name: 'Add Payer', exact: true });
  }

  // ---- Duplicate detection (TC-015) ----------------------------------------

  /**
   * Asserts the app surfaces a potential-duplicate warning (a toast, dialog, or
   * inline flag mentioning "duplicate"). Per the user story, a duplicate must
   * not be accepted silently. If the app shows nothing, this fails - which is
   * the intended signal that duplicate detection is missing (file a defect).
   */
  async expectDuplicateWarning(): Promise<void> {
    await expect(this.page.getByText(/duplicate/i).first()).toBeVisible({
      timeout: Timeouts.default,
    });
  }

  /** Sends a draft row for approval and confirms the modal. */
  async sendForApproval(payerName: string): Promise<void> {
    Logger.step(`Sending "${payerName}" for approval`);
    await this.search(payerName);
    await this.sendRowForApproval(payerName);
    await this.confirmDialog().confirm('Send for Approval');
    await this.waitForPageReady();
  }

  // ---- Column reads (each searches first so the row is unambiguous) ---------

  async getApprovalStatus(payerName: string): Promise<string> {
    await this.search(payerName);
    await this.waitForRowVisible(payerName);
    return this.getRowCellValue(payerName, COLUMN.approvalStatus);
  }

  async getPayerCode(payerName: string): Promise<string> {
    await this.search(payerName);
    await this.waitForRowVisible(payerName);
    return this.getRowCellValue(payerName, COLUMN.code);
  }

  async getLifecycleStatus(payerName: string): Promise<string> {
    await this.search(payerName);
    await this.waitForRowVisible(payerName);
    return this.getRowCellValue(payerName, COLUMN.status);
  }

  private codeCell(payerName: string): Locator {
    return this.rowByText(payerName).getByRole('cell').nth(2);
  }

  private lifecycleStatusCell(payerName: string): Locator {
    // Column order: Name,Type,Code,Networks,Members,License,Email,Phone,Status,...
    return this.rowByText(payerName).getByRole('cell').nth(8);
  }

  async expectLifecycleStatus(payerName: string, status: string): Promise<void> {
    await this.search(payerName);
    await this.waitForRowVisible(payerName);
    await expect(this.lifecycleStatusCell(payerName)).toHaveText(status, { timeout: Timeouts.default });
  }

  async expectApprovalStatusContains(payerName: string, expected: string): Promise<void> {
    await this.search(payerName);
    await expect(this.rowByText(payerName)).toContainText(expected, { timeout: Timeouts.default });
  }

  async expectNoPayerCode(payerName: string): Promise<void> {
    await this.search(payerName);
    await this.waitForRowVisible(payerName);
    await expect(this.codeCell(payerName)).toHaveText(/^(—|-|\s*)$/, { timeout: Timeouts.default });
  }

  async expectPayerCodeAssigned(payerName: string): Promise<void> {
    await this.search(payerName);
    await this.waitForRowVisible(payerName);
    await expect(this.codeCell(payerName)).toHaveText(/PAY-\d+/, { timeout: Timeouts.default });
  }

  /**
   * Combined post-decision assertion using a SINGLE search, then asserting the
   * approval status and PayerCode presence against that one filtered row. This
   * avoids the race of two back-to-back searches re-filtering the same table.
   */
  async expectApprovalOutcome(
    payerName: string,
    approvalStatus: string,
    expectPayerCode: boolean,
  ): Promise<void> {
    await this.search(payerName);
    const row = this.rowByText(payerName);
    await expect(row).toContainText(approvalStatus, { timeout: Timeouts.default });
    if (expectPayerCode) {
      await expect(this.codeCell(payerName)).toHaveText(/PAY-\d+/, { timeout: Timeouts.default });
    } else {
      await expect(this.codeCell(payerName)).toHaveText(/^(—|-|\s*)$/, { timeout: Timeouts.default });
    }
  }

  /** Single-search assertion that an approved payer has a PayerCode and the
   *  expected lifecycle status (Active/Pending) derived from its Effective Date. */
  async expectPublishedWithStatus(payerName: string, lifecycleStatus: string): Promise<void> {
    await this.search(payerName);
    await expect(this.rowByText(payerName)).toBeVisible({ timeout: Timeouts.default });
    await expect(this.codeCell(payerName)).toHaveText(/PAY-\d+/, { timeout: Timeouts.default });
    await expect(this.lifecycleStatusCell(payerName)).toHaveText(lifecycleStatus, {
      timeout: Timeouts.default,
    });
  }

  async expectRowNotVisible(payerName: string): Promise<void> {
    await this.search(payerName);
    await expect(this.rowByText(payerName)).toHaveCount(0, { timeout: Timeouts.default });
  }

  /** Asserts the payer's row displays each of the given values (data persistence). */
  async expectRowShowsDetails(payerName: string, values: string[]): Promise<void> {
    await this.search(payerName);
    const row = this.rowByText(payerName);
    for (const value of values) {
      await expect(row).toContainText(value, { timeout: Timeouts.default });
    }
  }

  /** Leaves the module for the dashboard, then returns to Payer Management. */
  async navigateAwayAndReturn(): Promise<void> {
    await this.goto(AppRoutes.dashboard);
    await this.open();
  }

  /** Best-effort teardown used by the cleanup fixture. */
  async deletePayer(payerName: string): Promise<void> {
    Logger.cleanup(`Deleting payer "${payerName}"`);
    await this.search(payerName);
    // Nothing to clean up if the record was never created (e.g. a failed-save test).
    if (!(await this.isRowVisible(payerName))) {
      return;
    }
    await this.deleteRow(payerName);
    // The "Delete Payer" dialog confirms with Yes / No.
    await this.confirmDialog().confirm('Yes');
    await this.waitForPageReady();
  }

  // =====================================================================
  // Delete Payer with/without Dependency Validation
  // =====================================================================

  /** The bilingual language toggle (shared header control). */
  language(): LanguageSwitcher {
    return new LanguageSwitcher(this.page);
  }

  /**
   * Row action located by its `title` attribute, which is what the application
   * localizes (the accessible name changes with the UI language). Keeping this
   * here means the delete/discard flows work in English and Arabic alike.
   */
  private localizedRowAction(payerName: string, title: string): Locator {
    return this.rowByText(payerName).locator(`button[title="${title}"]`);
  }

  /** Opens the delete confirmation prompt for a payer, in the given language. */
  async clickDelete(payerName: string, language: AppLanguage = 'en'): Promise<ConfirmDialog> {
    Logger.step(`Clicking "Delete" for "${payerName}"`);
    await this.search(payerName);
    await this.waitForRowVisible(payerName);
    await this.localizedRowAction(payerName, DELETE_UI[language].deleteAction).click();
    const dialog = this.confirmDialog();
    await dialog.waitForVisible();
    return dialog;
  }

  /** Asserts the confirmation prompt names the payer being deleted (TC-005). */
  async expectDeleteConfirmationPrompt(payerName: string, language: AppLanguage = 'en'): Promise<void> {
    const dialog = await this.clickDelete(payerName, language);
    await expect(this.page.locator('.p-dialog')).toContainText(DELETE_UI[language].dialogTitle, {
      timeout: Timeouts.default,
    });
    await expect(this.page.locator('.p-dialog')).toContainText(payerName, {
      timeout: Timeouts.default,
    });
    // Cancel leaves the payer untouched.
    await dialog.cancel(DELETE_UI[language].cancel);
  }

  /** Deletes a payer and confirms the prompt (does not assert the outcome). */
  async deleteAndConfirm(payerName: string, language: AppLanguage = 'en'): Promise<void> {
    const dialog = await this.clickDelete(payerName, language);
    await dialog.confirm(DELETE_UI[language].confirm);
    await this.waitForPageReady();
  }

  /**
   * Reads the toast raised by the last action. Toasts auto-dismiss, so this is
   * captured immediately after the triggering click.
   */
  async expectToastContains(expected: string): Promise<void> {
    await expect(this.toastLocator()).toContainText(expected, { timeout: Timeouts.toast });
  }

  /** Asserts the toast text matches a pattern - used for localized messages. */
  async expectLocalizedToast(pattern: RegExp): Promise<void> {
    await expect(this.toastLocator()).toHaveText(pattern, { timeout: Timeouts.toast });
  }

  /** Deletes a never-approved draft, which the app discards outright. */
  async discardDraft(payerName: string, language: AppLanguage = 'en'): Promise<void> {
    const dialog = await this.clickDelete(payerName, language);
    await dialog.confirm(DELETE_UI[language].confirm);
  }

  /** Navigates directly to a payer detail URL - used for the stale-record test. */
  async openPayerById(payerId: string): Promise<void> {
    await this.goto(`${AppRoutes.payerManagement}/${payerId}`);
  }

  /**
   * Boundary assertion for the zero-versus-one dependency case: a blocked
   * deletion raises the dependency error and leaves the record in place, while
   * an allowed deletion is accepted without any dependency error. The branch
   * lives here so the spec stays declarative.
   */
  async expectDeletionBoundaryOutcome(payerName: string, expectBlocked: boolean): Promise<void> {
    if (expectBlocked) {
      await this.expectToastContains(DELETE_MESSAGES.dependencyBlockedEn);
      await this.search(payerName);
      await expect(this.rowByText(payerName)).toBeVisible({ timeout: Timeouts.default });
      return;
    }
    await expect(this.toastLocator()).not.toContainText(/cannot be deleted/i, {
      timeout: Timeouts.toast,
    });
    await this.expectApprovalStatusContains(payerName, 'Draft');
  }

  /**
   * Asserts the current user is not offered the discard/delete action for a
   * payer they do not own - either the row is invisible to them, or the action
   * is absent from it.
   */
  async expectDiscardActionDenied(payerName: string): Promise<void> {
    await this.search(payerName);
    if ((await this.rowByText(payerName).count()) === 0) {
      return; // The draft is not visible at all, which satisfies the rule.
    }
    await expect(this.localizedRowAction(payerName, DELETE_UI.en.deleteAction)).toHaveCount(0, {
      timeout: Timeouts.default,
    });
  }

  /** Asserts the page surfaced a "not found" style error rather than crashing. */
  async expectRecordNotFound(): Promise<void> {
    await expect(
      this.page.getByText(/not found|does not exist|already deleted|no longer/i).first(),
    ).toBeVisible({ timeout: Timeouts.default });
  }

  // =====================================================================
  // Versioning (shared by Edit + Delete stories)
  // =====================================================================

  /**
   * The Approval Status cell renders as "v<N> · <Status>" (e.g. "v1 · Published"),
   * where N is the version of the LIVE record and Status describes any pending
   * change on top of it.
   */
  private approvalStatusCell(payerName: string): Locator {
    return this.rowByText(payerName).getByRole('cell').nth(9);
  }

  /** The approval state text only (e.g. "Published"), without the version part. */
  async getApprovalState(payerName: string): Promise<string> {
    const label = await this.getVersionLabel(payerName);
    const parts = label.split('·');
    return (parts[1] ?? label).trim();
  }

  async getVersionLabel(payerName: string): Promise<string> {
    await this.search(payerName);
    await this.waitForRowVisible(payerName);
    return (await this.approvalStatusCell(payerName).innerText()).trim();
  }

  /** Parses the numeric version out of the "v<N> · <Status>" label. */
  async getVersionNumber(payerName: string): Promise<number> {
    const label = await this.getVersionLabel(payerName);
    const match = label.match(/v(\d+)/);
    if (!match) {
      throw new Error(`[PayerManagementPage] No version found in "${label}" for "${payerName}".`);
    }
    return Number(match[1]);
  }

  /** Asserts the row shows exactly the given version and approval status. */
  async expectVersionAndStatus(payerName: string, version: number, status: string): Promise<void> {
    await this.search(payerName);
    await this.waitForRowVisible(payerName);
    await expect(this.approvalStatusCell(payerName)).toContainText(`v${version}`, {
      timeout: Timeouts.default,
    });
    await expect(this.approvalStatusCell(payerName)).toContainText(status, {
      timeout: Timeouts.default,
    });
  }

  // =====================================================================
  // Edit Existing Payer Configuration Details
  // =====================================================================

  /** Edits a single text field on the open payer and saves. */
  async editTextFieldAndSave(payerName: string, label: string, value: string): Promise<void> {
    await this.editSingleFieldAndSave(payerName, label, value, 'text');
  }

  /** Edits a single dropdown field on the open payer and saves. */
  async editDropdownFieldAndSave(payerName: string, label: string, value: string): Promise<void> {
    await this.editSingleFieldAndSave(payerName, label, value, 'dropdown');
  }

  /** Renames a payer through the edit wizard (the story's canonical edit). */
  async renamePayer(payerName: string, newName: string): Promise<void> {
    await this.editTextFieldAndSave(payerName, 'Payer Name', newName);
  }

  /** Edits exactly one field (text or dropdown) and saves - drives the checklist. */
  async editSingleFieldAndSave(
    payerName: string,
    label: string,
    value: string,
    kind: 'text' | 'dropdown',
  ): Promise<void> {
    const form = await this.openEditForm(payerName);
    await form.setFieldValue(label, value, kind);
    await form.saveFromAnyStep();
    // Confirm the app actually persisted the edit before moving on; without this
    // a silently-rejected save would surface later as a confusing status
    // mismatch instead of a clear "the edit did not save" failure.
    await this.expectToastContains(DELETE_MESSAGES.stagedAsDraft);
    await form.waitForClosed();
    // The list is not re-fetched when the drawer closes, so reload it to make
    // the saved draft visible to any assertion that follows.
    await this.open();
  }

  /**
   * The payer's immutable identifier, taken from its detail URL
   * (`/payer-management/{payerId}`) since the id is not rendered as a field.
   */
  async getPayerIdFromDetailUrl(payerName: string): Promise<string> {
    await this.openDetails(payerName);
    const url = this.page.url();
    const id = url.split('/').pop() ?? '';
    await this.open();
    return id;
  }

  async expectPayerIdUnchanged(before: string, after: string): Promise<void> {
    expect(after, 'PayerID must never change as a result of an edit').toBe(before);
  }

  async expectPayerCodeEquals(payerName: string, expectedCode: string): Promise<void> {
    await this.search(payerName);
    await this.waitForRowVisible(payerName);
    await expect(this.codeCell(payerName)).toHaveText(expectedCode, { timeout: Timeouts.default });
  }

  /**
   * Max-length boundary outcome: an accepted value closes the wizard and the
   * renamed payer appears in the list; a rejected value keeps the wizard open
   * with a validation error and never persists. Branch kept out of the spec.
   */
  async expectNameLengthBoundaryOutcome(
    form: PayerFormDialog,
    livePayerName: string,
    candidateName: string,
    expectAccepted: boolean,
  ): Promise<void> {
    if (expectAccepted) {
      // Accepted: the wizard closes and the change is held as a private draft
      // (the list still shows the live name until the edit is approved).
      await form.waitForClosed();
      await this.expectApprovalStatusContains(livePayerName, 'Draft');
      return;
    }
    await form.waitForOpen();
    await expect(form.fieldError('Payer Name')).toBeVisible({ timeout: Timeouts.default });
    await form.closeAndDiscard();
    await this.expectRowNotVisible(candidateName);
  }

  /** Reads a value shown on the payer's row, by column header. */
  async expectRowCellEquals(payerName: string, columnHeader: string, expected: string): Promise<void> {
    await this.search(payerName);
    await this.waitForRowVisible(payerName);
    const actual = await this.getRowCellValue(payerName, columnHeader);
    expect(actual).toBe(expected);
  }
}
