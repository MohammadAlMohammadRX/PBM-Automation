import type { Page } from '@playwright/test';
import { AuditHistoryTab, type AuditEntry, type AuditEntryDetail } from '../components/AuditHistoryTab';
import { PolicyDetailPage } from './PolicyDetailPage';
import { POLICY_AUDIT } from '../../constants/ElementIds';
import { readPolicyAuditTrail, type PolicyAuditEntry } from '../../utils/PolicyProvisioning';

/** One timeline entry with what its "Audit Entry" drawer showed. */
export interface PolicyAuditEntryWithDetail extends AuditEntry {
  index: number;
  detail: AuditEntryDetail;
}

/**
 * The detail's Audit History tab - the shared component (components/AuditHistoryTab)
 * under `policy-detail-audit-*` (verified live 2026-11-03): search ("Search by
 * user or item"), Filters (Advance Search for Audit History: Action Type - "All
 * actions", Policy created, Policy cloned, Policy updated, Policy deleted,
 * Status changed, Member enrolled, Member removed, Network assigned, Network
 * unassigned, Documentation added, Documentation removed, Coverage ordering
 * changed; Performed By; Date Range), the timeline with View Details per entry
 * and the shared "Audit Entry" drawer (`audit-log-detail-drawer-*`: action chip
 * "Created", entity type "Policy", entity id, meta "dd/mm/yyyy hh:mm • user",
 * Field / Value rows).
 *
 * The trail: GetPolicyAuditTrail `{ policyId, actionType, pageNumber,
 * rowsPerPage }`; `actionType` CREATE, MEMBER_ADDED, NETWORK_ASSIGNED,
 * ENDORSEMENT_CREATED ... with `entityType` Policy / PolicyMember /
 * PolicyNetwork / PolicyEndorsement. Draft changes are audited at approval.
 */
export class PolicyAuditTab extends AuditHistoryTab {
  constructor(page: Page) {
    super(page, new PolicyDetailPage(page), POLICY_AUDIT, 'policy');
  }

  async fetchTrail(policyId: string, actionType: string | null = null): Promise<{ items: PolicyAuditEntry[]; totalRows: number }> {
    return readPolicyAuditTrail(this.page, policyId, actionType);
  }

  async canReadTrail(policyId: string): Promise<boolean> {
    return readPolicyAuditTrail(this.page, policyId).then(() => true).catch(() => false);
  }

  /** Opens the first `max` entries one by one and returns each with its drawer. */
  async readEntryDetails(max = 10): Promise<PolicyAuditEntryWithDetail[]> {
    const entries = await this.readEntries();
    const out: PolicyAuditEntryWithDetail[] = [];
    for (let index = 0; index < Math.min(max, entries.length); index += 1) {
      const detail = await this.openEntry(index);
      await this.closeEntry();
      out.push({ ...entries[index], index, detail });
    }
    return out;
  }
}
