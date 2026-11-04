/**
 * Ids, endpoints and names the Policy folders 01 / 02 / 09 / 14 / 16 / 17 / 21
 * need beyond constants/ElementIds.ts and constants/ApiEndpoints.ts (writer A,
 * 2026-11-03). Read off reports/policy/probe/SCREEN-MAP.md and the probe's API
 * captures (api-calls-p*.txt, bundle chunk-UTW3TAR4 - the shared bulk import
 * configuration of the Policy module).
 */

/** A case written as a data-driven BLOCKED test: its id, the test title and why. */
export interface PolicyBlockedCase {
  azureId: string;
  title: string;
  reason: string;
}

/**
 * Ids the shared list conventions would give a control the story asks for but
 * that the live list does NOT render (2026-11-03). Used only to ask whether the
 * control exists, so the case reports its absence instead of guessing.
 */
export const POLICY_LIST_EXPECTED = {
  /** A quick filter for the payer (`policy-list-filter-{key}-select`): the toolbar offers status, type, plan and approval only. */
  payerFilter: 'policy-list-filter-payer-select',
} as const;

/** The Upload history drawer's parts (`{list|detail}-bulk-history-...`), read off E2-import-history.ids.txt. */
export const POLICY_HISTORY_PART = {
  /** Rows `{history}-table-row-{operationId}`, cells `-cell-{filename|entity|ownerreference|uploadedby|uploadedon|totalrows|succeededrows|failedrows|status}`. */
  rowPrefix: 'table-row-',
  /** `{history}-result-csv-{operationId}` / `-result-excel-{operationId}`: "Download the failed rows as CSV / Excel". */
  resultCsv: 'result-csv-',
  resultExcel: 'result-excel-',
} as const;

/** The bulk import's record types (GetPolicyImportHistory `entity`). */
export const POLICY_IMPORT_ENTITY = {
  policy: 'Policy',
  member: 'PolicyMember',
  network: 'PolicyNetwork',
} as const;

/** The shared bulk-operation statuses the policy history answers (2026-11-03: "CompletedWithErrors", "Failed"). */
export const POLICY_BULK_STATUS = {
  completed: 'Completed',
  completedWithErrors: 'CompletedWithErrors',
  failed: 'Failed',
} as const;

/** The policy's audit trail in the system-wide Audit Logs (GetAuditLogs `entityType`). */
export const POLICY_AUDIT_ENTITY = 'Policy';
