import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { openSelect, readSelectOptions } from '../components/PrimeControls';
import { PolicyTabTable } from './PolicyTabTable';
import { PolicyImportDialog } from './PolicyImportDialog';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import { Timeouts } from '../../constants/Timeouts';
import { POLICY_IMPORT, POLICY_NETWORKS, POLICY_NETWORK_COLUMN, buttonSelector, type PolicyNetworkColumn } from '../../constants/ElementIds';
import { NetworkUtils } from '../../utils/NetworkUtils';
import { Logger } from '../../utils/Logger';
import { readPolicyNetworks, type PolicyNetwork } from '../../utils/PolicyProvisioning';

/**
 * The Network Assignment tab (verified live 2026-11-03): Export, Import, a
 * select "Select a network to assign" (the payer's ACTIVE networks only,
 * GetNetworksDropdown `?payerId`) + Assign - no drawer - the search box ("Search
 * by network code or name") with its advanced search (Network Code, Network,
 * Status: Future/Active/Inactive/Expired, Assignment: Assigned / Draft
 * Assignment / Pending Assignment / Draft Removal / Pending Removal), and the
 * table: Network Code, Network, Status, Assignment, Assigned On ("—" until
 * approved), Actions (Remove -> "Delete Network" prompt). Rows are
 * `policy-detail-networks-table-row-{networkId}`.
 *
 * No assignable network: "No assignable networks belong to <payer>. ..." (bundle).
 */
export class PolicyNetworksTab extends PolicyTabTable<PolicyNetworkColumn> {
  constructor(page: Page) {
    super(page, 'networks', POLICY_NETWORKS, POLICY_NETWORK_COLUMN, /\/GetPolicyNetworks$/);
  }

  rowOf(networkCode: string): Locator {
    return this.rowWhere('code', networkCode);
  }

  /** Whether the assign select + button render (absent on an expired / terminated policy). */
  async isAssignOffered(): Promise<boolean> {
    return this.byId(POLICY_NETWORKS.select).isVisible().catch(() => false);
  }

  async getAssignAvailability(): Promise<'absent' | 'disabled' | 'available'> {
    const button = this.page.locator(buttonSelector(POLICY_NETWORKS.assign)).first();
    if ((await button.count()) === 0 || !(await button.isVisible())) return 'absent';
    return (await button.isEnabled()) ? 'available' : 'disabled';
  }

  /** The networks the select offers. */
  async getAssignableOptions(): Promise<string[]> {
    return readSelectOptions(this.page, this.byId(POLICY_NETWORKS.select));
  }

  /** The tab panel's text (the "No assignable networks belong to ..." notice, read-only notice). */
  async getPanelHeaderText(): Promise<string> {
    // locator-exception: the notices carry no id; read from the tab panel that holds the assign select.
    const panel = this.page.locator('.policy-detail__panel').filter({ has: this.page.locator(`#${POLICY_NETWORKS.searchInput}`) }).first();
    return (await panel.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  /**
   * Chooses a network (by part of its name, or the first offered) and clicks
   * Assign; returns AssignPolicyNetwork's answer (a "Return to draft?" prompt is
   * confirmed).
   */
  async assign(networkName?: string): Promise<{ status: number; text: string; body: Record<string, unknown> | null; messages: string[] }> {
    Logger.step(`Assigning network ${networkName ?? '(first offered)'}`);
    const options = await openSelect(this.page, this.byId(POLICY_NETWORKS.select));
    await (networkName ? options.filter({ hasText: networkName }) : options).first().click();
    const answered = this.page.waitForResponse((r) => /\/AssignPolicyNetwork$/.test(new URL(r.url()).pathname), { timeout: Timeouts.default }).catch(() => null);
    await this.page.locator(buttonSelector(POLICY_NETWORKS.assign)).first().click();
    const dialog = new ConfirmDialog(this.page);
    if (await dialog.isVisible()) await dialog.confirmWithFollowUps().catch(() => undefined);
    const response = await answered;
    let body: Record<string, unknown> | null = null;
    try { body = response ? (response.request().postDataJSON() as Record<string, unknown>) : null; } catch { body = null; }
    return { status: response?.status() ?? -1, text: response ? await response.text().catch(() => '') : '', body, messages: await this.waitForMessages() };
  }

  async getRemoveAvailability(networkCode: string): Promise<'absent' | 'disabled' | 'available'> {
    const button = this.rowOf(networkCode).locator(buttonSelector(POLICY_NETWORKS.remove)).first();
    if ((await button.count()) === 0 || !(await button.isVisible())) return 'absent';
    return (await button.isEnabled()) ? 'available' : 'disabled';
  }

  async requestRemove(networkCode: string): Promise<ConfirmDialog> {
    await this.rowOf(networkCode).locator(buttonSelector(POLICY_NETWORKS.remove)).first().click();
    const dialog = new ConfirmDialog(this.page);
    await dialog.waitForVisible();
    return dialog;
  }

  /** Remove + confirm; returns UnassignPolicyNetwork's answer (staged on a published policy). */
  async removeNetwork(networkCode: string): Promise<{ status: number; text: string; messages: string[] }> {
    const dialog = await this.requestRemove(networkCode);
    const answer = await NetworkUtils.captureResponse(this.page, ApiEndpoints.policyUnassignNetwork, async () => { await dialog.confirmWithFollowUps(); });
    return { status: answer?.status ?? -1, text: answer?.text ?? '', messages: await this.waitForMessages() };
  }

  async readAssignment(networkCode: string): Promise<string> {
    return (await this.rowOf(networkCode).locator(`[id$="-cell-${POLICY_NETWORK_COLUMN.assignment}"]`).innerText().catch(() => '')).trim();
  }

  async expectAssignment(networkCode: string, state: string | RegExp): Promise<void> {
    await expect(this.rowOf(networkCode).locator(`[id$="-cell-${POLICY_NETWORK_COLUMN.assignment}"]`), `${networkCode} should read ${String(state)}`).toHaveText(state, { timeout: Timeouts.default });
  }

  async openImport(): Promise<PolicyImportDialog> {
    const dialog = new PolicyImportDialog(this.page, POLICY_IMPORT.detail);
    await dialog.closeIfOpen();
    await this.page.locator(buttonSelector(POLICY_NETWORKS.importTrigger)).first().click();
    await dialog.waitForOpen();
    return dialog;
  }

  async fetchNetworks(policyId: string): Promise<PolicyNetwork[]> {
    return readPolicyNetworks(this.page, policyId);
  }
}
