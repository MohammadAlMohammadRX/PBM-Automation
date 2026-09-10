import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { ListPageBase } from '../components/ListPageBase';
import { AppRoutes } from '../../constants/AppRoutes';
import { Timeouts } from '../../constants/Timeouts';
import { CONSUMING_SCREEN, POLICY_COLUMN } from '../../constants/ElementIds';

/**
 * The Policies module (`/policy-management`).
 *
 * Exists for one question the cascade story has to answer: when a payer is
 * inactivated, do ITS policies follow? That cannot be read anywhere inside the
 * payer module - the payer detail's Linked Policies tab offers a search box and
 * no rows for the payers this suite can reach - so the policy list is where the
 * answer lives.
 *
 * Thin on purpose. Everything about searching, tables, rows and pagination it
 * inherits from ListPageBase, which builds from the screen's id namespace; all
 * that is added here is "which policies belong to this payer, and what status
 * does each show".
 */
export class PolicyManagementPage extends ListPageBase {
  constructor(page: Page) {
    super(page, CONSUMING_SCREEN.policyList);
  }

  async open(): Promise<void> {
    await this.goto(AppRoutes.policyManagement);
  }

  /** Opens the module and guarantees its table is on screen. */
  async openList(): Promise<void> {
    await this.open();
    await this.ensureTableView(this.screen);
    await expect(this.tableFor(this.screen)).toBeVisible({ timeout: Timeouts.default });
  }

  /**
   * Every rendered policy as (name, payer, status), read in ONE pass.
   *
   * One pass for the reason ListPageBase.getRowPairs gives: the list re-queries
   * asynchronously, so reading the columns separately can pair a policy's name
   * with another row's payer - and this story turns entirely on which payer a
   * record belongs to.
   */
  async getPolicyRows(): Promise<{ name: string; payer: string; status: string }[]> {
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
      { name: POLICY_COLUMN.name, payer: POLICY_COLUMN.payer, status: POLICY_COLUMN.status },
    );
  }

  /** The policies belonging to one payer, with the status each displays. */
  async getPoliciesOfPayer(payerName: string): Promise<{ name: string; status: string }[]> {
    await this.openList();
    const rows = await this.getPolicyRows();
    return rows
      .filter((row) => row.payer === payerName)
      .map((row) => ({ name: row.name, status: row.status }));
  }
}
