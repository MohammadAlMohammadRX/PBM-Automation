import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import { Timeouts } from '../../constants/Timeouts';
import { PLAN_VERSIONS, buttonSelector } from '../../constants/ElementIds';
import { NetworkUtils } from '../../utils/NetworkUtils';
import { Logger } from '../../utils/Logger';

/** One row of the plan's Version History table, as it renders. */
export interface PlanVersionRow {
  id: string;
  version: string;
  status: string;
  change: string;
  reason: string;
  requestedBy: string;
  requestedOn: string;
  reviewedBy: string;
  reviewedOn: string;
  actions: string[];
}

/** One version as GetPlanVersions answers it. */
export interface PlanVersionRecord {
  id: string;
  planId: string;
  version: number;
  versionStatusCode: string;
  versionStatusEn: string;
  changeType: string;
  planNameEn: string;
  effectiveDate?: string;
  expiryDate?: string;
  formularyId?: string | null;
  [key: string]: unknown;
}

/** What the tab needs from the plan detail screen. */
export interface PlanVersionsHost {
  openTab(tab: 'versions'): Promise<void>;
  waitForPageReady(): Promise<void>;
}

/**
 * The plan detail's Version History tab (`plan-detail-versions-table`), verified
 * 2026-10-27: columns Version, Status, Change, Reason, Requested By / On,
 * Reviewed By / On, Actions (View; Revert on a version that can be restored),
 * newest version first, with a search box ("version, change type, status or user").
 */
export class PlanVersionHistoryTab {
  constructor(
    private readonly page: Page,
    private readonly detail: PlanVersionsHost,
  ) {}

  private rows(): Locator {
    return this.page.locator(`tr[id^="${PLAN_VERSIONS.rowPrefix}"]`);
  }

  private row(version: string): Locator {
    const label = version.startsWith('v') ? version : `v${version}`;
    return this.rows().filter({ has: this.page.locator('td', { hasText: new RegExp(`^\\s*${label}\\s*$`) }) }).first();
  }

  async open(): Promise<void> {
    await this.detail.openTab('versions');
    await expect(this.page.locator(`#${PLAN_VERSIONS.table}`), 'the Version History table should render').toBeVisible({ timeout: Timeouts.default });
    await this.rows().first().waitFor({ state: 'visible', timeout: Timeouts.default }).catch(() => undefined);
  }

  /** Every row on the current page, newest first as the tab orders them. */
  async readRows(): Promise<PlanVersionRow[]> {
    await this.rows().first().waitFor({ state: 'visible', timeout: Timeouts.default }).catch(() => undefined);
    return this.rows().evaluateAll((trs, head) =>
      trs.map((tr) => {
        const cell = (key: string) => ((tr.querySelector(`[id$="-cell-${key}"]`) as HTMLElement | null)?.innerText ?? '').trim();
        return {
          id: tr.id.slice(head.length),
          version: cell('version'),
          status: cell('status'),
          change: cell('changetype'),
          reason: cell('reason'),
          requestedBy: cell('requestedby'),
          requestedOn: cell('requestedon'),
          reviewedBy: cell('reviewedby'),
          reviewedOn: cell('reviewedon'),
          actions: Array.from(tr.querySelectorAll('button')).map((b) => (b as HTMLElement).innerText.trim()).filter((t) => t !== ''),
        };
      }), PLAN_VERSIONS.rowPrefix);
  }

  /** The header labels, in order. */
  async getHeaders(): Promise<string[]> {
    return (await this.page.locator(`[id^="${PLAN_VERSIONS.table}-th-"]`).allInnerTexts()).map((t) => t.trim());
  }

  async expectVersionStatus(version: string, status: string | RegExp): Promise<void> {
    await expect(this.row(version).locator('[id$="-cell-status"]')).toHaveText(status, { timeout: Timeouts.default });
  }

  async search(term: string): Promise<void> {
    Logger.step(`Searching version history for "${term}"`);
    const input = this.page.locator(`#${PLAN_VERSIONS.searchInput}`);
    await input.click();
    await input.press('ControlOrMeta+a');
    await input.press('Delete');
    if (term !== '') await input.pressSequentially(term);
    await this.detail.waitForPageReady();
  }

  /** Opens a version's View drawer and returns its whole text, closing it again. */
  async viewVersionText(version: string): Promise<string> {
    await this.row(version).locator(buttonSelector(PLAN_VERSIONS.viewButton)).first().click();
    // VERIFIED 2026-10-27: View opens `p-drawer#plan-detail-drawer-N` titled
    // "Version Details", which carries no dialog role - the role lookup never
    // found it (19292, 19298). The N is an instance number, so match the prefix.
    // The host element itself never reads as visible (display: inline, no box);
    // its inner `.p-drawer` panel does (19363, verified live).
    const drawer = this.page.locator('p-drawer[id^="plan-detail-drawer-"] .p-drawer').filter({ hasText: /Version Detail/i }).last();
    await expect(drawer, 'the version details should open').toBeVisible({ timeout: Timeouts.default });
    const text = (await drawer.innerText()).trim();
    await this.page.keyboard.press('Escape');
    await expect(drawer).toBeHidden({ timeout: Timeouts.default }).catch(() => undefined);
    return text;
  }

  /** Whether the version's row offers Revert. */
  async offersRevert(version: string): Promise<boolean> {
    return (await this.row(version).getByRole('button', { name: /revert/i }).count()) > 0; // locator-exception: the Revert control's id is not known yet; matched by label within the version's row
  }

  /** Reverts to a version through the screen; returns what RevertPlanVersion answered (null when nothing was sent). */
  async revertTo(version: string): Promise<{ status: number; body: unknown; text: string } | null> {
    Logger.step(`Reverting the plan to version ${version}`);
    // The screen follows the revert with its own Send for Approval ("Submitted
    // for approval" toast). Returning on the revert's answer let the caller
    // navigate away and cancel that second call: 19362 / 19364 / 19366 / 19370
    // saw the plan left as "Draft" and nothing queued (2026-10-27). Wait for it
    // too when it comes; a revert the screen does not submit just waits it out.
    const submitted = this.page
      .waitForResponse((response) => response.url().includes(ApiEndpoints.planSubmit), { timeout: Timeouts.short * 2 })
      .catch(() => null);
    const outcome = await NetworkUtils.captureResponse(this.page, ApiEndpoints.planRevert, async () => {
      await this.row(version).getByRole('button', { name: /revert/i }).first().click(); // locator-exception: see offersRevert
      await new ConfirmDialog(this.page).confirm();
    });
    await submitted;
    await this.detail.waitForPageReady();
    return outcome;
  }

  /** Every version as GetPlanVersions answers it - ids included. */
  async readVersionsViaApi(planId: string): Promise<PlanVersionRecord[]> {
    const res = await NetworkUtils.postAsSession(this.page, ApiEndpoints.planVersions, { planId });
    return res.status < 300 ? ((JSON.parse(res.text) as { payload: PlanVersionRecord[] }).payload ?? []) : [];
  }

  /** Asks the server to revert directly - for the permission and never-published cases. */
  async revertViaApi(planId: string, versionId: string): Promise<{ status: number; text: string }> {
    return NetworkUtils.postAsSession(this.page, ApiEndpoints.planRevert, { planId, versionId });
  }

  // ---- plan folder 29 additions (2026-10-27) ----

  /** Clicks a version's Revert and returns the confirmation it raises (asserted visible), unconfirmed. */
  async openRevertPrompt(version: string): Promise<ConfirmDialog> {
    Logger.step(`Choosing Revert on version ${version}`);
    await this.row(version).getByRole('button', { name: /revert/i }).first().click(); // locator-exception: see offersRevert
    const dialog = new ConfirmDialog(this.page);
    await dialog.waitForVisible();
    return dialog;
  }

  /** Confirms an open Revert prompt; returns what RevertPlanVersion answered (null when nothing was sent). */
  async confirmRevertPrompt(): Promise<{ status: number; body: unknown; text: string } | null> {
    return NetworkUtils.captureResponse(this.page, ApiEndpoints.planRevert, () => new ConfirmDialog(this.page).confirm());
  }

  /**
   * Opens a version's Revert prompt and clicks its confirm `times` times
   * without waiting in between - the rapid / repeated submission case. Returns
   * how many RevertPlanVersion requests the screen fired.
   */
  async revertRepeatedly(version: string, times: number): Promise<number> {
    const dialog = await this.openRevertPrompt(version);
    Logger.step(`Confirming the revert ${times} times in rapid succession`);
    return NetworkUtils.countRequestsDuring(this.page, ApiEndpoints.planRevert, () => dialog.confirmRepeatedly(times), 3_000);
  }

  // ---- plan folder 06 additions (2026-10-27) ----

  /**
   * The versions whose row is marked out as the latest - `aria-current`,
   * `aria-selected="true"`, a `data-latest` / `data-current` flag, or a
   * latest / current / highlight class on the row. INFERRED 2026-10-27: the
   * bundle shows no such marker yet, so this reads [] until the app adds one.
   */
  async readHighlightedVersions(): Promise<string[]> {
    await this.rows().first().waitFor({ state: 'visible', timeout: Timeouts.default }).catch(() => undefined);
    return this.rows().evaluateAll((trs) =>
      trs
        .filter((tr) => {
          const current = tr.getAttribute('aria-current');
          return (current !== null && current !== 'false')
            || tr.getAttribute('aria-selected') === 'true'
            || tr.hasAttribute('data-latest')
            || tr.hasAttribute('data-current')
            || /latest|current|highlight/i.test(tr.className);
        })
        .map((tr) => ((tr.querySelector('[id$="-cell-version"]') as HTMLElement | null)?.innerText ?? '').trim()));
  }
}
