import type { Page } from '@playwright/test';
import { AuditHistoryTab, type AuditEntry, type AuditEntryDetail } from '../components/AuditHistoryTab';
import { FormularyDetailPage } from './FormularyDetailPage';
import { FORMULARY_AUDIT } from '../../constants/ElementIds';
import { readAuditTrail, type FormularyAuditEntry } from '../../utils/FormularyProvisioning';

/** One timeline entry with what its "Audit Entry" drawer showed. */
export interface FormularyAuditEntryWithDetail extends AuditEntry {
  index: number;
  detail: AuditEntryDetail;
}

/**
 * The detail's Audit History tab - the shared component (components/AuditHistoryTab)
 * under the `formulary-detail-audit-*` namespace (search "Search by user or
 * item", Filters, the timeline with View Details per entry, the shared "Audit
 * Entry" drawer `audit-log-detail-drawer-*`).
 *
 * The trail behind it is GetFormularyAuditTrail `{ formularyId, actionType,
 * pageNumber, rowsPerPage }`; its entries carry `actionType` in capitals -
 * "UPDATE", "SUBMITTED_FOR_APPROVAL", "REJECTED", "APPROVED", ... (2026-11-02)
 * - and an `entityType` ("FormularyVersion", ...).
 */
export class FormularyAuditTab extends AuditHistoryTab {
  constructor(page: Page) {
    super(page, new FormularyDetailPage(page), FORMULARY_AUDIT, 'formulary');
  }

  /** The trail as the server holds it (first 500 entries, newest first). */
  async fetchTrail(formularyId: string, actionType: string | null = null): Promise<{ items: FormularyAuditEntry[]; totalRows: number }> {
    return readAuditTrail(this.page, formularyId, actionType);
  }

  /** Whether this session may read the formulary's audit trail at all. */
  async canReadTrail(formularyId: string): Promise<boolean> {
    return readAuditTrail(this.page, formularyId).then(() => true).catch(() => false);
  }

  // ---- Writer C additions (folder 19, 2026-11-02) -------------------------------------------

  /**
   * Opens the first `max` entries of the page on screen one by one (newest
   * first) and returns each with its drawer - for the "who / when / which
   * field, before and after" cases. Each drawer is closed again.
   */
  async readEntryDetails(max = 10): Promise<FormularyAuditEntryWithDetail[]> {
    const entries = await this.readEntries();
    const out: FormularyAuditEntryWithDetail[] = [];
    for (let index = 0; index < Math.min(max, entries.length); index += 1) {
      const detail = await this.openEntry(index);
      await this.closeEntry();
      out.push({ ...entries[index], index, detail });
    }
    return out;
  }

  /** The entries (newest first, up to `max` opened) whose drawer lists a change of a field matching `field`. */
  async findChanges(field: RegExp, max = 15): Promise<Array<{ entry: FormularyAuditEntryWithDetail; before: string; after: string }>> {
    const found: Array<{ entry: FormularyAuditEntryWithDetail; before: string; after: string }> = [];
    for (const entry of await this.readEntryDetails(max)) {
      const change = entry.detail.changes.find((c) => field.test(c.field));
      if (change) found.push({ entry, before: change.before, after: change.after });
    }
    return found;
  }
}
