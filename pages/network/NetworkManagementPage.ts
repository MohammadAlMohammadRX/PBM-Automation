import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { ListPageBase } from '../components/ListPageBase';
import { PayerSelectionDropdown } from '../components/PayerSelectionDropdown';
import { AppRoutes } from '../../constants/AppRoutes';
import { Timeouts } from '../../constants/Timeouts';
import { CONSUMING_SCREEN } from '../../constants/ElementIds';

/**
 * The Networks module (`/network-management`) - the SECOND consumer of the
 * shared payer selection interface.
 *
 * Its only role in this suite is to prove the Active-only rule is enforced by
 * the shared interface rather than re-implemented per module: if two
 * independent consumers return the same set, the filter lives in the interface.
 * Kept as thin as PlanManagementPage for the same reason.
 */
export class NetworkManagementPage extends ListPageBase {
  constructor(page: Page) {
    super(page, CONSUMING_SCREEN.networkList);
  }

  async open(): Promise<void> {
    await this.goto(AppRoutes.networkManagement);
  }

  /** Opens the module and guarantees its table is on screen. */
  async openList(): Promise<void> {
    await this.open();
    await this.ensureTableView(this.screen);
    await expect(this.tableFor(this.screen)).toBeVisible({ timeout: Timeouts.default });
  }

  /** The Networks list's own "filter by payer" dropdown. */
  payerFilter(): PayerSelectionDropdown {
    return new PayerSelectionDropdown(this.page, 'networkListFilter');
  }
}
