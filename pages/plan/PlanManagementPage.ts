import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { ListPageBase } from '../components/ListPageBase';
import { PayerSelectionDropdown } from '../components/PayerSelectionDropdown';
import { AppRoutes } from '../../constants/AppRoutes';
import { Timeouts } from '../../constants/Timeouts';
import { CONSUMING_SCREEN, PLAN_COLUMN } from '../../constants/ElementIds';

/**
 * The Plans module (`/plans-management`) - a CONSUMER of the shared payer
 * selection interface, and the only reason this Page Object exists.
 *
 * Deliberately thin. The cross-module story is about what the payer dropdown
 * returns, not about plans, so this class adds nothing beyond reaching the two
 * surfaces that expose the dropdown; everything else it needs
 * (search/table/rows/pagination) it inherits from ListPageBase, which is
 * already built from the screen's id namespace.
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

  /** The Plans list's own "filter by payer" dropdown. */
  payerFilter(): PayerSelectionDropdown {
    return new PayerSelectionDropdown(this.page, 'planListFilter');
  }

  /** The Payer field inside the Add Plan wizard. */
  payerField(): PayerSelectionDropdown {
    return new PayerSelectionDropdown(this.page, 'planForm');
  }

  /**
   * Opens the Add Plan drawer, which is where a plan's Payer is chosen.
   *
   * Returns the dropdown rather than a drawer Page Object: the wizard itself is
   * out of scope for this story, and modelling it would mean building a plan
   * form nobody asserts on.
   */
  async openCreateFormPayerField(): Promise<PayerSelectionDropdown> {
    await this.clickAdd();
    const field = this.payerField();
    await field.expectPresent();
    return field;
  }
  /**
   * Every rendered plan as (name, payer, status), read in ONE pass.
   *
   * One pass for the reason ListPageBase.getRowPairs gives: the list re-queries
   * asynchronously, so reading the columns separately can pair a plan's name
   * with another row's payer - and the cascade story turns entirely on which
   * payer a record belongs to.
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
    await this.waitForPageReady();
    // The scope change refetches the table, and the previous payer's rows stay
    // on screen until it lands - wait until every row names the scoped payer
    // (or the table empties) before reading.
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

  /** The plans belonging to one payer, with the status each displays. */
  async getPlansOfPayer(payerName: string): Promise<{ name: string; status: string }[]> {
    await this.openList();
    const rows = await this.getPlanRows();
    return rows
      .filter((row) => row.payer === payerName)
      .map((row) => ({ name: row.name, status: row.status }));
  }
}
