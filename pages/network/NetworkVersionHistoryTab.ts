import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import type { NetworkDetailPage } from './NetworkDetailPage';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import { Timeouts } from '../../constants/Timeouts';
import {
  NETWORK_VERSIONS,
  NETWORK_VERSION_FIELD,
  buttonSelector,
  type NetworkVersionField,
} from '../../constants/ElementIds';
import { NetworkUtils } from '../../utils/NetworkUtils';
import { readNetworkVersions, requestNetworkRevert, type NetworkVersionRecord } from '../../utils/NetworkHistory';
import { Logger } from '../../utils/Logger';

/** One Version History row. */
export interface VersionRow {
  id: string;
  version: string;
  change: string;
  status: string;
  requestedBy: string;
  requestedOn: string;
  reviewedBy: string;
  reviewedOn: string;
  /** The row's action labels, e.g. ["View"] or ["View", "Revert"]. */
  actions: string[];
}

/**
 * The network detail screen's Version History tab.
 *
 * Verified 2026-10-21: columns Version / Change / Status / Requested By /
 * Requested On / Reviewed By / Reviewed On / Actions, rows
 * `network-detail-versions-table-row-{versionId}`, and a View action opening
 * "Version Details" (`network-detail-drawer-1-*`) with the version's full
 * snapshot. A Revert action was NOT seen on the networks probed - it is looked
 * for by label, so a case reports its absence rather than a missing locator.
 */
export class NetworkVersionHistoryTab {
  constructor(
    private readonly page: Page,
    private readonly detail: NetworkDetailPage,
  ) {}

  private rows(): Locator {
    return this.page.locator(`tr[id^="${NETWORK_VERSIONS.rowPrefix}"]`);
  }

  private row(version: string): Locator {
    return this.rows().filter({ has: this.page.locator('td', { hasText: new RegExp(`^\\s*${version}\\s*$`) }) }).first();
  }

  async open(): Promise<void> {
    await this.detail.openTab('versions');
    await expect(this.page.locator(`#${NETWORK_VERSIONS.table}`), 'the Version History table should render').toBeVisible({
      timeout: Timeouts.default,
    });
    await this.detail.waitForPageReady();
  }

  async getHeaders(): Promise<string[]> {
    return (await this.page.locator(`[id^="${NETWORK_VERSIONS.headerPrefix}"]`).allInnerTexts()).map((t) => t.trim());
  }

  async readRows(): Promise<VersionRow[]> {
    const prefix = NETWORK_VERSIONS.rowPrefix;
    // The table renders before GetNetworkVersions answers; wait for a row (or
    // carry on - a network can have none).
    await this.rows().first().waitFor({ state: 'visible', timeout: Timeouts.default }).catch(() => undefined);
    return this.rows().evaluateAll((trs, head) =>
      trs.map((tr) => {
        const cells = Array.from(tr.querySelectorAll('td')).map((td) => (td as HTMLElement).innerText.trim());
        return {
          id: tr.id.slice(head.length),
          version: cells[0] ?? '',
          change: cells[1] ?? '',
          status: cells[2] ?? '',
          requestedBy: cells[3] ?? '',
          requestedOn: cells[4] ?? '',
          reviewedBy: cells[5] ?? '',
          reviewedOn: cells[6] ?? '',
          actions: Array.from(tr.querySelectorAll('button'))
            .map((b) => (b as HTMLElement).innerText.trim())
            .filter((t) => t !== ''),
        };
      }), prefix);
  }

  /** Polls until a version row reads `status` (e.g. Published, Superseded). */
  async expectVersionStatus(version: string, status: string | RegExp): Promise<void> {
    await expect
      .poll(async () => (await this.readRows()).find((r) => r.version === version)?.status ?? '(row absent)', {
        timeout: Timeouts.default,
        message: `version ${version} should read "${status}"`,
      })
      .toMatch(typeof status === 'string' ? new RegExp(`^${status}$`) : status);
  }

  async search(term: string): Promise<void> {
    Logger.step(`Searching version history for "${term}"`);
    const input = this.page.locator(`#${NETWORK_VERSIONS.searchInput}`);
    await input.click();
    await input.press('ControlOrMeta+a');
    if (term === '') await input.press('Delete');
    else await input.pressSequentially(term);
    await this.detail.waitForPageReady();
  }

  /** Opens a version's Version Details drawer and reads every field. */
  async viewVersion(version: string): Promise<Record<NetworkVersionField, string>> {
    await this.row(version).locator(buttonSelector(NETWORK_VERSIONS.viewButton)).first().click();
    await expect(this.page.locator(`#${NETWORK_VERSIONS.drawer.title}`)).toBeVisible({ timeout: Timeouts.default });
    const out = {} as Record<NetworkVersionField, string>;
    for (const [key, suffix] of Object.entries(NETWORK_VERSION_FIELD) as [NetworkVersionField, string][]) {
      out[key] = await this.page
        .locator(`#${NETWORK_VERSIONS.drawer.fieldPrefix}${suffix}`)
        .innerText({ timeout: Timeouts.short })
        .then((t) => t.trim())
        .catch(() => '');
    }
    return out;
  }

  async closeVersion(): Promise<void> {
    await this.page.locator(buttonSelector(NETWORK_VERSIONS.drawer.close)).first().click();
    await expect(this.page.locator(`#${NETWORK_VERSIONS.drawer.title}`)).toBeHidden({ timeout: Timeouts.default });
  }

  /** Whether a version's row offers Revert. */
  async offersRevert(version: string): Promise<boolean> {
    return (await this.row(version).getByRole('button', { name: /revert/i }).count()) > 0; // locator-exception: no Revert control was seen on any probed network, so no id is known; matched by label
  }

  /**
   * Reverts to a version: clicks the row's Revert, confirms, and returns what
   * RevertNetworkVersion answered (null when no request was sent).
   */
  async revertTo(version: string): Promise<{ status: number; body: unknown; text: string } | null> {
    Logger.step(`Reverting to version ${version}`);
    return NetworkUtils.captureResponse(this.page, ApiEndpoints.networkRevert, async () => {
      await this.row(version).getByRole('button', { name: /revert/i }).first().click(); // locator-exception: no Revert control was seen on any probed network, so no id is known; matched by label
      await new ConfirmDialog(this.page).confirm();
    });
  }

  // ---- story 42 additions ---------------------------------------------------

  /** Opens a version's Version Details drawer and returns its whole text. */
  async viewVersionText(version: string): Promise<string> {
    await this.row(version).locator(buttonSelector(NETWORK_VERSIONS.viewButton)).first().click();
    const title = this.page.locator(`#${NETWORK_VERSIONS.drawer.title}`);
    await expect(title).toBeVisible({ timeout: Timeouts.default });
    const text = await title.locator('xpath=ancestor::*[contains(@class,"drawer")][1]').innerText().catch(() => '');
    await this.closeVersion();
    return text.trim();
  }

  /** Every version as GetNetworkVersions answers it - ids included. */
  async readVersionsViaApi(networkId: string): Promise<NetworkVersionRecord[]> {
    return readNetworkVersions(this.page, networkId);
  }

  /**
   * Requests a revert directly, by version id - for the "stale link" and
   * "nonexistent version" cases the screen cannot express.
   */
  async revertViaApi(networkId: string, versionId: string): Promise<{ status: number; text: string }> {
    return requestNetworkRevert(this.page, networkId, versionId);
  }

  /** Fires two reverts at once (different versions) and returns both answers. */
  async revertTwiceAtOnce(networkId: string, first: string, second: string): Promise<{ status: number; text: string }[]> {
    return Promise.all([requestNetworkRevert(this.page, networkId, first), requestNetworkRevert(this.page, networkId, second)]);
  }
}
