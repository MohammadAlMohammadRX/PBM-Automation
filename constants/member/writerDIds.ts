/**
 * Writer D's ids and endpoints for the member folders 12 (audit history), 13
 * (permissions), 14 (PBM Accumulator Dashboard tab) and 15 (Member Benefit
 * Accumulator / year-start reset) - what constants/member/memberIds.ts and
 * constants/ApiEndpoints.ts do not carry (reports/member/Member-Writers-Brief.md:
 * the foundation is not edited, what it lacks lives here).
 */

/**
 * System Settings > Audit Logs rows (verified in the foundation probe
 * `audit-logs-page.ids.txt`, 2026-11-05): `audit-log-list-table-row-{auditId}`,
 * its cells `-cell-{occurredatutc|actiontype|entitytype|entityid|actor}` and its
 * actions `-actions` (only "View Details", `-view`).
 */
export const AUDIT_LOG_ROW = {
  prefix: 'audit-log-list-table-row-',
  actions: 'actions',
  view: 'view',
} as const;

/** The member's view page: every PBM Accumulator Dashboard element carries this id prefix (memberIds MEMBER_DASHBOARD). */
export const DASHBOARD_ID_PREFIX = 'member-detail-dashboard';

/**
 * Endpoints the member screens never called while the foundation watched them.
 * UNVERIFIED paths - a case that uses one baselines it as the administrator
 * first and leaves the function out (with a note) when the administrator's own
 * call does not reach it either.
 */
export const WRITER_D_ENDPOINT = {
  /** Members.GetBenefitByPatientId ("Look up benefit policy by member ID") - no member screen calls it; path from the right's name. */
  benefitLookup: '/api/Members/GetBenefitByPatientId',
  /** Guessed write routes on an audit entry (19925 "alternate route"): the audit API exposes reads only (GetAuditLogs, GetAuditLogById). */
  auditUpdate: '/api/AuditLogs/UpdateAuditLog',
  auditDelete: '/api/AuditLogs/DeleteAuditLog',
} as const;
