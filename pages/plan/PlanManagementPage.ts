import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { ListPageBase } from '../components/ListPageBase';
import { PayerSelectionDropdown } from '../components/PayerSelectionDropdown';
import { AppRoutes } from '../../constants/AppRoutes';
import { Timeouts } from '../../constants/Timeouts';
import { CONSUMING_SCREEN } from '../../constants/ElementIds';

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
}
