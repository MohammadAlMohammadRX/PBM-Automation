/**
 * US 14387 "View Member - Audit History" (member folder 12).
 *
 * THE SCREEN (Member-Foundation-Notes.md, "Audit History"): there is NO Audit
 * History tab on the member's view page. The member's trail lives in System
 * Settings > Audit Logs (`/system-settings/audit-logs`, "Time / Action / Entity
 * Type / Entity ID / Actor" + View Details), read through AuditLogs/GetAuditLogs
 * `{ entityType: "Member", entityId }` and GetAuditLogById (before / after JSON).
 *
 * KNOWN FINDINGS (writers brief - automated literally, they fail):
 * - every case's step "open the member record and navigate to its Audit History
 *   view" fails: the member's view page offers no audit tab. The step records
 *   the tabs shown and the case CONTINUES on the trail Audit Logs keeps, so the
 *   remaining expectations are still checked;
 * - the CREATE entry is written under ANOTHER entity id, so the member's own
 *   trail never shows its creation (19919, 19921, 19922 - the step also reports
 *   whether a CREATE mentioning the member exists elsewhere);
 * - edit, activate, deactivate and delete are all written as UPDATE (19921,
 *   19928 expect distinctly labelled entries).
 *
 * Literal readings (MEM-3001 ... MEM-1001 are the suite's own members, built per case):
 * - "Compliance Officer" / "System Administrator" accounts do not exist (writers
 *   brief): the ADMINISTRATOR is the authorised role; the "standard Member
 *   Administrator without audit rights" / "unauthorized user" is the Payer
 *   Admin role (it holds every Members.* right) WITHOUT the audit trail rights
 *   AuditLogs.GetAuditLogs / GetAuditLogById, shaped through the Facility
 *   suite's `facilityRole` (utils/facility/writerCHelpers.ts - it shapes and
 *   restores exactly those two catalogue rows; the shared memberRole helper
 *   shapes Members rights only).
 * - 19920 "Status change by user jsmith on 2026-10-20": the suite's
 *   administrator deactivates the member today; the performer expected is that
 *   signed-in account, the time is the moment of the action.
 * - 19922 "e.g. activate": a member created with Member Active Status unticked
 *   (nothing done beyond creation), then activated - "an appropriate initial
 *   state" accepts an empty trail as well as the creation entry alone.
 * - 19926 "100+ audit entries" -> the user's volume decision: about 30 edits
 *   (Occupation "QA Volume Edit n") made in the test; pages of 10.
 * - 19927 Contact Number "0501234567" -> "0509876543": the member's Mobile
 *   Number, which the form takes WITHOUT the trunk 0 after the fixed "+966" -
 *   "501234567" -> "509876543".
 * - 19925 "alternate route": PUT / DELETE on audit routes the API does not
 *   publish (constants/member/writerDIds.ts) and the read-only GetAuditLogById -
 *   the entry must read the same afterwards.
 * - 19928 "deactivated and later deleted": deactivated through SetMemberActive
 *   and deleted through DeleteMember (both through the screens' own calls) -
 *   a deleted member's view page no longer opens (404), so its trail is read in
 *   Audit Logs.
 */
export const CASES = {
  completeHistory: { azureId: '19919', occupation: 'QA Audit Complete' },
  entryDetails: { azureId: '19920' },
  everyActionType: { azureId: '19921', occupation: 'QA Audit Field Update' },
  emptyThenFirst: { azureId: '19922' },
  roleAccess: { azureId: '19923', occupation: 'QA Audit Role Gate' },
  unauthorised: { azureId: '19924', occupation: 'QA Audit Unauthorised' },
  immutable: { azureId: '19925', occupation: 'QA Audit Immutable' },
  volume: { azureId: '19926', edits: 30, rowsPerPage: 10, occupation: 'QA Volume Edit' },
  oldAndNew: { azureId: '19927', field: 'MobileNumber', before: '501234567', after: '509876543' },
  crossFeature: { azureId: '19928' },
} as const;

/** The trail rights withheld from the Payer Admin for the "no audit rights" role (facilityRole rows). */
export const AUDIT_RIGHTS = ['auditLogs', 'auditEntry'] as const;

/** The effective-permission codes of the trail rights. */
export const AUDIT_CODES = ['AuditLogs.GetAuditLogs', 'AuditLogs.GetAuditLogById'] as const;

/** The labels each action type is expected under (the case's words; the server writes UPDATE for all but CREATE). */
export const ACTION_LABEL = {
  create: /creat/i,
  update: /updat|edit|modif/i,
  activate: /^activat/i,
  deactivate: /deactivat|inactivat/i,
  delete: /delet/i,
} as const;

/** An audit row's time as Audit Logs prints it ("2026-11-05 02:07:55"). */
export const AUDIT_TIME = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?/;

/** An access-restricted message ("access denied", "not authorised", "no permission", "Access Restricted"). */
export const ACCESS_RESTRICTED = /access|denied|not authori[sz]ed|unauthori[sz]ed|permission|restricted|forbidden/i;

/** An edit / delete control on an audit entry. */
export const WRITE_CONTROL = /edit|delete|remove|update|save/i;
