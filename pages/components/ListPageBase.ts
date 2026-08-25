import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { Timeouts } from '../../constants/Timeouts';
import { Logger } from '../../utils/Logger';

/**
 * Shared behaviour for every "management" list page in PBM (Payer, Network,
 * Users Administration, Plans, Policy, ...). All of these screens follow the
 * same verified layout:
 *   - a "Search" textbox
 *   - an "Add <Entity>" button
 *   - a data table with an "Actions" column containing row-scoped buttons
 *     (View / Edit / Delete / Send for Approval / Inactivate, depending on
 *     the row's status)
 *   - Previous page / Next page pagination buttons
 *
 * Concrete pages (PayerManagementPage, NetworkManagementPage, ...) extend
 * this class and only add module-specific methods (e.g. multi-step create
 * wizards), instead of re-implementing search/table/pagination each time.
 */
export abstract class ListPageBase extends BasePage {
  protected constructor(page: Page, private readonly addButtonLabel: string) {
    super(page);
  }

  protected searchInput(): Locator {
    return this.page.getByRole('textbox', { name: 'Search' });
  }

  async search(term: string): Promise<void> {
    Logger.step(`Searching for "${term}"`);
    const input = this.searchInput();
    await input.fill(term);
    await input.press('Enter');
    await this.waitForPageReady();
  }

  protected addButton(): Locator {
    return this.page.getByRole('button', { name: this.addButtonLabel, exact: true });
  }

  async clickAdd(): Promise<void> {
    Logger.step(`Clicking "${this.addButtonLabel}"`);
    await this.addButton().click();
  }

  /** Locates a table row by the text it contains, e.g. an entity name. Rows are
   *  read after searching, and some names legitimately repeat (a live record plus
   *  a pending version), so the first match is the row under test. */
  protected rowByText(text: string): Locator {
    return this.page.getByRole('row', { name: new RegExp(this.escapeRegExp(text)) }).first();
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Whether a row for `entityName` is on screen, WAITING for it to appear.
   *
   * `locator.isVisible()` is deliberately not used here: it reports the current
   * state and ignores its timeout, so a check made right after a search runs
   * before the table has re-rendered and answers "no". That race is what made
   * fixture cleanup skip records silently and leak them into the environment.
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

  private rowAction(entityName: string, actionLabel: string): Locator {
    return this.rowByText(entityName).getByRole('button', { name: new RegExp(actionLabel), exact: false });
  }

  async viewRow(entityName: string): Promise<void> {
    Logger.step(`Clicking "View" for "${entityName}"`);
    await this.rowAction(entityName, 'View').click();
  }

  async editRow(entityName: string): Promise<void> {
    Logger.step(`Clicking "Edit" for "${entityName}"`);
    await this.rowAction(entityName, 'Edit').click();
  }

  async deleteRow(entityName: string): Promise<void> {
    Logger.step(`Clicking "Delete" for "${entityName}"`);
    await this.rowAction(entityName, 'Delete').click();
  }

  async sendRowForApproval(entityName: string): Promise<void> {
    Logger.step(`Clicking "Send for Approval" for "${entityName}"`);
    await this.rowAction(entityName, 'Send for Approval').click();
  }

  /** Reads a specific column's value for a given row, by column header text. */
  async getRowCellValue(entityName: string, columnHeader: string): Promise<string> {
    const table = this.page.getByRole('table');
    const headers = await table.getByRole('columnheader').allTextContents();
    const columnIndex = headers.findIndex((header) => header.trim() === columnHeader);
    if (columnIndex === -1) {
      throw new Error(`[ListPageBase] Column "${columnHeader}" not found. Available columns: ${headers.join(', ')}`);
    }
    const cells = this.rowByText(entityName).getByRole('cell');
    return (await cells.nth(columnIndex).innerText()).trim();
  }

  async goToNextPage(): Promise<void> {
    await this.page.getByRole('button', { name: 'Next page' }).click();
    await this.waitForPageReady();
  }

  async goToPreviousPage(): Promise<void> {
    await this.page.getByRole('button', { name: 'Previous page' }).click();
    await this.waitForPageReady();
  }

  /** Asserts the results table contains the given text somewhere (any row/column). */
  async verifyTableContainsText(text: string): Promise<void> {
    await expect(this.page.getByRole('table')).toContainText(text, { timeout: Timeouts.default });
  }

  async getVisibleRowCount(): Promise<number> {
    return this.page.getByRole('table').getByRole('row').count();
  }

  /** Number of data rows currently rendered (header row excluded). */
  async getRowCount(): Promise<number> {
    return this.page.locator('table tbody tr').count();
  }

  /**
   * Every value currently shown in a given zero-based column of the visible rows.
   * Generic to any list module, so it lives here rather than being re-implemented
   * per page.
   */
  protected async columnValues(columnIndex: number): Promise<string[]> {
    const cells = this.page.locator('table tbody tr').locator(`td:nth-child(${columnIndex + 1})`);
    return (await cells.allInnerTexts()).map((text) => text.trim());
  }
}
