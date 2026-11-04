import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PolicyTabTable, type TabRow } from './PolicyTabTable';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import { Timeouts } from '../../constants/Timeouts';
import {
  POLICY_VERSIONS,
  POLICY_VERSION_COLUMN,
  POLICY_VERSION_FIELD,
  POLICY_VERSION_FILTER_FIELD,
  buttonSelector,
  type PolicyVersionColumn,
  type PolicyVersionField,
  type PolicyVersionFilterKey,
} from '../../constants/ElementIds';
import { NetworkUtils } from '../../utils/NetworkUtils';
import { readPolicyVersions, revertPolicy, type PolicyVersion } from '../../utils/PolicyProvisioning';

export type PolicyVersionRow = TabRow<PolicyVersionColumn>;

/**
 * The Version History tab (verified live 2026-11-03): search ("Search by
 * version, change type, status or user"), advanced search (Approval Status,
 * Change, Requested By, Reviewed By, Requested On - a date RANGE, clicked in the
 * calendar), and the table: Version (v1 ...), Approval Status (Approved /
 * Superseded / Draft / Pending Approval / Rejected), Change (Created, Updated,
 * Activated, Deactivated, Deleted, Reverted), Networks (a count), Requested By /
 * On, Reviewed By / On, Actions (View; "Revert to this" on a published /
 * superseded row that is not current). There is NO Members column. View opens
 * "Version Details" (read-only): change tag, approval status, Status
 * (Effective), names, type, holder, plan, payer, dates, grace period and
 * "Networks in this version". Data: GetPolicyVersions/{id} (newest first).
 */
export class PolicyVersionHistoryTab extends PolicyTabTable<PolicyVersionColumn> {
  constructor(page: Page) {
    super(page, 'versions', POLICY_VERSIONS, POLICY_VERSION_COLUMN, /\/GetPolicyVersions\//);
  }

  /** The row showing `version` ("v1", "v2"). */
  rowOf(version: string): Locator {
    return this.rowWhere('version', version);
  }

  async expectVersionStatus(version: string, status: string | RegExp): Promise<void> {
    await expect(this.rowOf(version).locator(`[id$="-cell-${POLICY_VERSION_COLUMN.status}"]`), `${version} should read ${String(status)}`).toHaveText(status, { timeout: Timeouts.default });
  }

  /**
   * Searching this tab filters the loaded rows on screen (GetPolicyVersions is a
   * GET of the whole history) - so it does not wait for a request.
   */
  async search(term: string): Promise<void> {
    const input = this.byId(POLICY_VERSIONS.searchInput);
    await input.fill(term);
    await input.press('Enter');
    await this.detail.waitForPageReady();
  }

  /** Applies criteria by name; Requested On takes `DD/MM/YYYY - DD/MM/YYYY`. */
  async applyFilter(criteria: Partial<Record<PolicyVersionFilterKey, string>>): Promise<PolicyVersionRow[]> {
    const byKey: Record<string, string> = {};
    for (const [name, value] of Object.entries(criteria) as [PolicyVersionFilterKey, string][]) byKey[POLICY_VERSION_FILTER_FIELD[name]] = value;
    const drawer = await this.openAdvancedSearch();
    for (const [key, value] of Object.entries(byKey)) {
      const control = this.byId(`${POLICY_VERSIONS.advancedSearch}-field-${key}-input`);
      const tag = await control.evaluate((el) => el.tagName.toLowerCase()).catch(() => '');
      if (key === POLICY_VERSION_FILTER_FIELD.requestedOn) await this.pickDateRange(control, value);
      else if (tag === 'input') await drawer.typeText(key, value);
      else await drawer.choose(key, value);
    }
    await drawer.submit();
    await this.detail.waitForPageReady();
    return this.readRows();
  }

  // ---- Version Details drawer -------------------------------------------------------------

  async viewVersion(version: string): Promise<Record<PolicyVersionField, string>> {
    await this.rowOf(version).locator(buttonSelector(POLICY_VERSIONS.viewButton)).first().click();
    await expect(this.byId(POLICY_VERSIONS.drawer.title), 'the Version Details drawer should open').toBeVisible({ timeout: Timeouts.default });
    const out = {} as Record<PolicyVersionField, string>;
    for (const [key, suffix] of Object.entries(POLICY_VERSION_FIELD) as [PolicyVersionField, string][]) {
      out[key] = (await this.byId(`${POLICY_VERSIONS.drawer.fieldPrefix}${suffix}`).innerText({ timeout: Timeouts.short }).catch(() => '')).replace(/\s+/g, ' ').trim();
    }
    return out;
  }

  /** Whether the open drawer offers anything editable. */
  async isDrawerReadOnly(): Promise<boolean> {
    // locator-exception: the question is whether ANY editable control exists in the drawer; scoped to its id.
    const editable = await this.byId(POLICY_VERSIONS.drawer.root).locator('input:not([type="hidden"]), textarea, [role="combobox"]').count();
    return editable === 0;
  }

  async getDrawerText(): Promise<string> {
    return (await this.byId(POLICY_VERSIONS.drawer.root).first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  async closeVersion(): Promise<void> {
    await this.byId(POLICY_VERSIONS.drawer.close).click();
    await expect(this.byId(POLICY_VERSIONS.drawer.title)).toBeHidden({ timeout: Timeouts.default });
  }

  // ---- revert ------------------------------------------------------------------------------

  async getRevertAvailability(version: string): Promise<'absent' | 'disabled' | 'available'> {
    const button = this.rowOf(version).locator(buttonSelector(POLICY_VERSIONS.revertButton)).first();
    if ((await button.count()) === 0 || !(await button.isVisible())) return 'absent';
    return (await button.isEnabled()) ? 'available' : 'disabled';
  }

  /** Clicks "Revert to this" and returns the prompt, still open (null when none appeared). */
  async requestRevert(version: string): Promise<ConfirmDialog | null> {
    await this.rowOf(version).locator(buttonSelector(POLICY_VERSIONS.revertButton)).first().click();
    const dialog = new ConfirmDialog(this.page);
    return (await dialog.isVisible()) ? dialog : null;
  }

  /** Revert to this + confirm; returns RevertPolicyVersion's answer (the revert is staged as a draft). */
  async revertTo(version: string): Promise<{ status: number; text: string; messages: string[] }> {
    const answer = await NetworkUtils.captureResponse(this.page, ApiEndpoints.policyRevert, async () => {
      const dialog = await this.requestRevert(version);
      if (dialog) await dialog.confirmWithFollowUps();
    });
    return { status: answer?.status ?? -1, text: answer?.text ?? '', messages: await this.waitForMessages() };
  }

  // ---- API -----------------------------------------------------------------------------------

  async fetchVersions(policyId: string): Promise<PolicyVersion[]> {
    return readPolicyVersions(this.page, policyId);
  }

  async revertViaApi(policyId: string, targetVersion: number): Promise<{ status: number; text: string }> {
    return revertPolicy(this.page, policyId, targetVersion);
  }
}
