import type { Page } from '@playwright/test';
import type { NetworkDetailPage } from './NetworkDetailPage';
import { AuditHistoryTab } from '../components/AuditHistoryTab';
import { NETWORK_AUDIT } from '../../constants/ElementIds';

export { AUDIT_FILTER_FIELD, type AuditEntry, type AuditEntryDetail } from '../components/AuditHistoryTab';

/**
 * The network detail screen's Audit History tab.
 *
 * The behaviour lives in components/AuditHistoryTab (shared with the Plans
 * detail screen since 2026-10-27); this class only binds it to the network ids.
 */
export class NetworkAuditHistoryTab extends AuditHistoryTab {
  constructor(page: Page, detail: NetworkDetailPage) {
    super(page, detail, NETWORK_AUDIT, 'network');
  }
}
