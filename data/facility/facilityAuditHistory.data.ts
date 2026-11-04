import { SECTION_RIGHTS, type FacilityShape } from './facilityPermissions.data';

/**
 * US 15142 "View Facility - Audit History" (facility folder 10).
 *
 * The tab (Facility-Foundation-Notes.md, "Audit History"): search box,
 * Filters -> "Advance Search for Audit History" (Action Type: All actions,
 * Create, Update, Status Change, Delete; Performed By; Date Range - clicked in
 * the calendar, a typed range is ignored), a timeline "Update / 04/11/2026
 * 03:27 PM / By: CareConnect" with View Details -> "Audit Entry" drawer (Field /
 * Before / After, raw field names). The trail: AuditLogs/GetAuditLogs
 * `{ entityType: "Facility", entityId, actionType, fromUtc, toUtc }`.
 *
 * KNOWN FINDINGS (writers brief - automated literally, they fail): the CREATE
 * entry is written under another entity id and never shows on the facility's
 * tab (17524); Activate / Inactivate / Delete are all written as "Update" (17525,
 * 17526); refused operations leave NO entry (17524 failed delete, 17525 failed
 * activate / deactivate, 17534).
 *
 * Literal readings (FAC-2xx are the suite's own facilities, built per case):
 * - "Edit" is the screen's "Update" (the action-type filter offers All actions,
 *   Create, Update, Status Change, Delete - no "Edit"); an entry labelled
 *   Update or Edit counts as the edit entry. 17526 filters "Update" and checks
 *   every listed entry IS an edit of the facility's data (not an activation /
 *   inactivation logged as Update) - read through GetAuditLogById.
 * - 17524 / 17534 "failed Delete": a delete refused because the facility is in
 *   a network - the suite's long-lived anchor (Writer B's `anchorOrBlocked`),
 *   its building name edited and put straight back for the Edit entry (the
 *   anchor is Writer B's fully populated Overview facility).
 * - 17525 "failed Activate": activating an EXPIRED facility (409 "Cannot
 *   reactivate an expired facility."); "failed Deactivate": inactivating without
 *   a reason (422 "Invalid inactivation reason.") - both sent the way the screen
 *   would (SetFacilityActive) since the screen offers neither.
 * - 17526 "Delete entries": a facility that is still openable cannot carry a
 *   successful delete; its mix is an edit plus an inactivation and an activation
 *   (all logged as Update) - the case's point is that the Edit filter returns
 *   edits only.
 * - 17528 / 17530 dates (2026-10-01 .. 2026-10-15, September 2026): entries can
 *   only be made TODAY, so the boundaries are today: a range STARTING today and
 *   a range ENDING today must both include today's entries (17528); Update +
 *   today must list only today's Update entries and Update + the previous month
 *   none (17530).
 * - 17527 "a date that has no log": 20 days ago (before the facility existed).
 * - 17532: the facility is created "QA Automation Facility Al Noor Clinic <stamp>"
 *   and renamed "... Al Noor Medical Center <stamp>" (suite prefix kept) by the
 *   suite's administrator - the acting user expected is that account, not
 *   'ashehadeh@neorx.co'.
 * - 17535: the literal dates (start 15/10/2026, end 01/10/2026), clicked in
 *   that order in the calendar.
 * - 17538 "Compliance Officer" = the Payer Admin role granted every facility
 *   right and the audit rights; "a user without audit-viewing permission" = the
 *   same role without Facilities "View Audit Logs", GetAuditLogs and
 *   GetAuditLogById.
 */
export const CASES = {
  everyAction: { azureId: '17524', buildingName: 'QA Audit Edit Building' },
  activateDeactivate: { azureId: '17525' },
  filterByType: { azureId: '17526', filter: 'Update', buildingName: 'QA Audit Filter Building' },
  noMatch: { azureId: '17527', daysAgo: -20 },
  boundaries: { azureId: '17528', span: 7 },
  combined: { azureId: '17530', filter: 'Update' },
  clearFilters: { azureId: '17531', filter: 'Update', buildingName: 'QA Audit Clear Building' },
  whoWhenWhat: { azureId: '17532', oldLabel: 'Al Noor Clinic', newLabel: 'Al Noor Medical Center' },
  rapidFilters: { azureId: '17533', settleOn: 'Update', sequence: ['Update', 'Status Change', 'Create', 'Delete', 'Update'] },
  failedDeleteLogged: { azureId: '17534' },
  invalidRange: { azureId: '17535', from: '15/10/2026', to: '01/10/2026' },
  roleGate: {
    azureId: '17538',
    without: { with: SECTION_RIGHTS.filter((r) => r !== 'audit'), without: ['audit', 'auditLogs', 'auditEntry'] } satisfies FacilityShape,
    withAudit: { with: [...SECTION_RIGHTS, 'auditLogs', 'auditEntry'] } satisfies FacilityShape,
  },
} as const;

/** The entry labels the cases look for. */
export const LABEL = {
  create: /^create/i,
  edit: /^(edit|update)/i,
  deleteFailed: /delete.*fail|fail.*delete/i,
  delete: /delete/i,
  /** The labels exactly as step 4 of 17524 names them. */
  exactCreate: /^create$/i,
  exactEdit: /^edit$/i,
  exactDeleteFailed: /^delete \(failed\)$/i,
  activate: /^activat/i,
  deactivate: /^(deactivat|inactivat)/i,
  failed: /fail/i,
};

/** What a failed entry is expected to say about its context. */
export const FAILURE_CONTEXT = /fail|block|refus|network|cannot/i;

/** The empty-results text ("No results found."). */
export const NO_RESULTS = /no results|no audit|no records|nothing/i;

/** A validation message for a reversed date range. */
export const RANGE_INVALID = /date|range|before|after|invalid|earlier|later/i;
