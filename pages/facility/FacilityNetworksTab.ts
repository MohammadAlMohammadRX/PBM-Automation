import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { FacilityDetailPage } from './FacilityDetailPage';
import { Timeouts } from '../../constants/Timeouts';
import { FACILITY_DETAIL, FACILITY_NETWORKS, type FacilityNetworkColumn } from '../../constants/facility/facilityIds';
import { Logger } from '../../utils/Logger';
import { readFacilityNetworks, type FacilityNetworkItem } from '../../utils/FacilityProvisioning';

/** One Network Assignment row as shown. */
export interface FacilityNetworkRow {
  /** The network id (the row id's suffix). */
  id: string;
  code: string;
  name: string;
  status: string;
  /** DD/MM/YYYY. */
  assignedOn: string;
}

/**
 * The detail's Network Assignment tab (verified live 2026-11-04): a READ-ONLY
 * table - Code, Network Name (a link to the network), Status, Assigned On -
 * fed by GetFacilityNetworks `{ facilityId, pageNumber, rowsPerPage: 10 }`.
 * Only APPROVED assignments are listed (a facility in a draft or pending
 * network shows none). There is NO network-type column (story 15136 asks for
 * one) and no add / edit / remove control. Empty: "This facility is not
 * assigned to any network.". Needs Facilities.GetFacilityNetworks (the tab is
 * hidden without it).
 */
export class FacilityNetworksTab {
  private readonly detail: FacilityDetailPage;

  constructor(private readonly page: Page) {
    this.detail = new FacilityDetailPage(page);
  }

  private rows(): Locator {
    return this.page.locator(`tr[id^="${FACILITY_NETWORKS.screen}-row-"]`);
  }

  /** Opens the tab and waits for ITS GetFacilityNetworks answer (the tab loads on first open). */
  async open(): Promise<void> {
    const answered = this.page.waitForResponse((r) => /\/GetFacilityNetworks$/.test(r.url()), { timeout: Timeouts.default }).catch(() => null);
    await this.detail.openTab('networks');
    await answered;
    await expect(this.page.locator(`#${FACILITY_NETWORKS.table}`), 'the Network Assignment table should render').toBeVisible({ timeout: Timeouts.default });
  }

  async isOffered(): Promise<boolean> {
    return this.detail.hasTab('networks');
  }

  async getHeaders(): Promise<string[]> {
    return (await this.page.locator(`th[id^="${FACILITY_NETWORKS.screen}-th-"]`).allInnerTexts()).map((t) => t.trim()).filter((t) => t !== '');
  }

  /** Every row on the tab's current page. */
  async readRows(): Promise<FacilityNetworkRow[]> {
    await this.rows().first().waitFor({ state: 'visible', timeout: Timeouts.short }).catch(() => undefined);
    return this.rows().evaluateAll((trs, ids) => trs.map((tr) => {
      const read = (key: string): string => ((tr.querySelector(`[id$="-cell-${key}"]`) as HTMLElement | null)?.innerText ?? '').replace(/\s+/g, ' ').trim();
      return {
        id: tr.id.replace(`${ids.screen}-row-`, ''),
        code: read(ids.column.code),
        name: read(ids.column.name),
        status: read(ids.column.status),
        assignedOn: read(ids.column.assignedOn),
      };
    }), FACILITY_NETWORKS);
  }

  async countRows(): Promise<number> {
    return (await this.readRows()).length;
  }

  /** The row of a network by its code (NET-nnnnnn), or null. */
  async rowOf(networkCode: string): Promise<FacilityNetworkRow | null> {
    return (await this.readRows()).find((r) => r.code === networkCode) ?? null;
  }

  async readCell(networkCode: string, column: FacilityNetworkColumn): Promise<string> {
    const row = await this.rowOf(networkCode);
    if (!row) throw new Error(`network ${networkCode} is not on the facility's Network Assignment tab`);
    return { code: row.code, name: row.name, status: row.status, assignedOn: row.assignedOn }[column];
  }

  /** The empty-state text ("This facility is not assigned to any network."), '' when rows are shown. */
  async getEmptyText(): Promise<string> {
    return (await this.page.locator(`#${FACILITY_NETWORKS.empty}`).innerText({ timeout: Timeouts.short }).catch(() => '')).trim();
  }

  /**
   * The buttons the tab panel offers besides the network-name links and the
   * pager - empty when the tab is read-only (no add / edit / remove).
   */
  async readEditControls(): Promise<string[]> {
    const panel = this.page.locator(`#${FACILITY_DETAIL.root}`);
    return panel.locator('button').evaluateAll((buttons, ids) => buttons
      .filter((b) => {
        const id = b.id || b.closest('[id]')?.id || '';
        if (id.startsWith(ids.tabPrefix) || id === ids.viewNetwork || id.startsWith(ids.pager)) return false;
        return (b as HTMLElement).offsetParent !== null && !!b.closest(`#${ids.table}, #${ids.screen}`);
      })
      .map((b) => (b as HTMLElement).innerText.trim() || b.id), { tabPrefix: 'facility-detail-tab', viewNetwork: FACILITY_NETWORKS.viewNetwork, pager: FACILITY_NETWORKS.pager, table: FACILITY_NETWORKS.table, screen: FACILITY_NETWORKS.screen });
  }

  /** Clicks a network's name link and waits for the network detail to open. */
  async openNetwork(networkCode: string): Promise<void> {
    Logger.step(`Opening network ${networkCode} from the facility's Network Assignment tab`);
    const row = this.rows().filter({ has: this.page.locator(`[id$="-cell-${FACILITY_NETWORKS.column.code}"]`, { hasText: networkCode }) }).first();
    await row.locator(`#${FACILITY_NETWORKS.viewNetwork}`).click();
    await this.page.waitForURL(/\/network-management\//, { timeout: Timeouts.default });
  }

  async fetchNetworks(facilityId: string): Promise<{ items: FacilityNetworkItem[]; totalRows: number }> {
    return readFacilityNetworks(this.page, facilityId);
  }
}
