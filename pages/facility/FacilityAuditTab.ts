import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { AuditHistoryTab, AUDIT_FILTER_FIELD, type AuditEntry, type AuditEntryDetail } from '../components/AuditHistoryTab';
import { AdvancedSearchDrawer } from '../payer/AdvancedSearchDrawer';
import { FacilityDetailPage } from './FacilityDetailPage';
import { Timeouts } from '../../constants/Timeouts';
import { TOAST, buttonSelector } from '../../constants/ElementIds';
import { FACILITY_AUDIT } from '../../constants/facility/facilityIds';
import { Logger } from '../../utils/Logger';
import { readFacilityAuditTrail, type FacilityAuditEntry } from '../../utils/FacilityProvisioning';

/** One timeline entry with what its "Audit Entry" drawer showed. */
export interface FacilityAuditEntryWithDetail extends AuditEntry {
  index: number;
  detail: AuditEntryDetail;
}

/**
 * The detail's Audit History tab - the shared component (components/AuditHistoryTab)
 * under `facility-detail-audit-*` (verified live 2026-11-04): search box (the
 * request's `searchText`), Filters -> "Advance Search for Audit History"
 * (Action Type: All actions, Create, Update, Status Change, Delete; Performed
 * By; Date Range), a timeline "Update 04/11/2026 03:27 PM By: CareConnect"
 * with View Details per entry, a pager, and the shared "Audit Entry" drawer
 * (action chip "Updated", entity "Facility", "FCL-000064 - <name>", meta
 * "04/11/2026 15:27 • CareConnect", Field / Before / After rows - raw field
 * names such as InactivationReasonId with GUID values).
 *
 * The trail: AuditLogs/GetAuditLogs `{ entityType: "Facility", entityId,
 * actionType (null | "UPDATE" ...), fromUtc, toUtc (the Riyadh day as UTC:
 * "2026-11-03T21:00:00.000Z" .. "2026-11-04T20:59:59.999Z"), searchText?,
 * pageNumber, rowsPerPage: 10 }`. LIVE FACTS (2026-11-04): an edit, an
 * activation, an inactivation and a DELETE are all written as UPDATE (the
 * delete sets IsDeleted); the CREATE entry is written under another entity id
 * and never appears on the tab; the job's changes are STATUS_CHANGE by
 * "System". Needs AuditLogs.GetAuditLogs + Facilities.AuditLogs (the tab is
 * hidden without them); View Details needs AuditLogs.GetAuditLogById.
 */
export class FacilityAuditTab extends AuditHistoryTab {
  constructor(page: Page) {
    super(page, new FacilityDetailPage(page), FACILITY_AUDIT, 'facility');
  }

  async fetchTrail(facilityId: string, filter: { actionType?: string | null; fromUtc?: string; toUtc?: string; searchText?: string } = {}): Promise<{ items: FacilityAuditEntry[]; totalRows: number }> {
    return readFacilityAuditTrail(this.page, facilityId, filter);
  }

  async canReadTrail(facilityId: string): Promise<boolean> {
    return readFacilityAuditTrail(this.page, facilityId).then(() => true).catch(() => false);
  }

  /** Opens the first `max` entries one by one and returns each with its drawer. */
  async readEntryDetails(max = 10): Promise<FacilityAuditEntryWithDetail[]> {
    const entries = await this.readEntries();
    const out: FacilityAuditEntryWithDetail[] = [];
    for (let index = 0; index < Math.min(max, entries.length); index += 1) {
      const detail = await this.openEntry(index);
      await this.closeEntry();
      out.push({ ...entries[index], index, detail });
    }
    return out;
  }

  /**
   * Applies the advanced search with the date range CLICKED in the calendar (a
   * typed range is ignored): `from` / `to` as `DD/MM/YYYY`, either may be left
   * out (`to` defaults to `from`). Returns whether the drawer closed (applied),
   * the GetAuditLogs body it sent, and any messages.
   *
   * locator-exception: PrimeNG day cells carry no ids; they are read inside the
   * open datepicker panel reached from the field.
   */
  async applyFilterByCalendar(criteria: { actionType?: string; from?: string; to?: string; performedBy?: string }): Promise<{ applied: boolean; request: Record<string, unknown> | null; messages: string[] }> {
    Logger.step(`Filtering facility audit history: ${JSON.stringify(criteria)}`);
    await this.page.locator(buttonSelector(FACILITY_AUDIT.advancedSearchButton)).first().click();
    const drawer = new AdvancedSearchDrawer(this.page, FACILITY_AUDIT.searchPrefix);
    await drawer.waitForOpen();
    if (criteria.actionType !== undefined) await drawer.choose(AUDIT_FILTER_FIELD.actionType, criteria.actionType);
    if (criteria.performedBy !== undefined) await drawer.typeText(AUDIT_FILTER_FIELD.actor, criteria.performedBy);
    if (criteria.from !== undefined) {
      const input = this.page.locator(`#${FACILITY_AUDIT.advancedSearch}-field-${AUDIT_FILTER_FIELD.dateRange}-input`);
      const days = [criteria.from, criteria.to ?? criteria.from].map((text) => {
        const [d, m, y] = text.split('/').map(Number);
        return new Date(y, m - 1, d);
      });
      await input.click();
      const panel = this.page.locator('.p-datepicker-panel, .p-datepicker').filter({ visible: true }).first(); // locator-exception: the PrimeNG date-picker overlay is portalled with no id
      await expect(panel, 'the date picker should open').toBeVisible({ timeout: Timeouts.default });
      let shown = new Date();
      for (const day of days) {
        const months = (day.getFullYear() - shown.getFullYear()) * 12 + day.getMonth() - shown.getMonth();
        for (let i = 0; i < Math.abs(months); i += 1) {
          await panel.locator(months > 0 ? '.p-datepicker-next, .p-datepicker-next-button' : '.p-datepicker-prev, .p-datepicker-prev-button').first().click(); // locator-exception: the calendar's month arrows carry no id
        }
        shown = day;
        await panel.locator('td:not(.p-datepicker-other-month) span').filter({ hasText: new RegExp(`^\\s*${day.getDate()}\\s*$`) }).first().click(); // locator-exception: day cells carry no id
      }
    }
    const sent = this.page.waitForRequest((r) => /\/GetAuditLogs$/.test(r.url()), { timeout: Timeouts.default }).catch(() => null);
    await this.page.locator(buttonSelector(`${FACILITY_AUDIT.advancedSearch}-search-button`)).first().click();
    const applied = await drawer.waitForClosed().then(() => true).catch(() => false);
    const request = applied ? await sent : null;
    if (request) await request.response().catch(() => null);
    const messages = applied ? [] : await drawer.getMessages();
    const toasts = await this.page.locator(`#${TOAST.summary}, #${TOAST.detail}`).allInnerTexts().catch(() => [] as string[]);
    if (!applied) await drawer.cancel().catch(() => undefined);
    return { applied, request: (request?.postDataJSON() as Record<string, unknown> | null) ?? null, messages: [...messages, ...toasts.map((t) => t.trim()).filter((t) => t !== '')] };
  }

  /** The applied-filter chips ("Update", "04/11/2026"). */
  async getChips(): Promise<string[]> {
    const chips = await this.page.locator(`[id^="${FACILITY_AUDIT.chips}-chip-"]:not([id$="-remove"])`).allInnerTexts().catch(() => [] as string[]);
    return chips.map((t) => t.trim()).filter((t) => t !== '');
  }

  /** The tab's text (timeline, "No results found." / "No audit history yet."). */
  async getEmptyText(): Promise<string> {
    return (await this.getPanelText()).replace(/\s+/g, ' ').trim();
  }
}
