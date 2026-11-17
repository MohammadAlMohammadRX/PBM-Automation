import type { HolderModule } from '../../constants/role/writerDIds';

/**
 * US 21302 "Viewing Audit History Permissions" (Role Management folder 17, 9 cases 22189-22197; Writer D).
 *
 * WHO. 22191 / 22197 read the permission tree as careconnect (Add Role > Privileges, nothing saved). The other seven
 * give maalmohammad (`roleHolder`) a suite role WITH or WITHOUT a module's "View Audit Logs" and open a record of that
 * module; the fixture restores Organization Administrator at teardown.
 *
 * THE HOLDER'S ROLE (assessment risk: "a missing tab must not be a side effect"): every holder role carries the
 * module's VIEW rights (every Get... right below the module that is not an audit right - `viewRightsOf`) plus the
 * system log rights GLOBAL_AUDIT_RIGHTS the shared audit component calls (facility foundation: the tab needs
 * AuditLogs.GetAuditLogs + <Module>.AuditLogs). "With View Audit Logs" adds every audit right below the module
 * (`auditRightsOf`: <Module>.AuditLogs, Get<X>AuditTrail, sub-entity audit logs); "without" leaves all of them out.
 *
 * LEAD DEFAULTS APPLIED:
 *  - Decision 2: the TC's record types map to the catalogue modules in AUDIT_RECORD_TYPES. "Authorization reversals
 *    (PBM Engine)" = the PBM Engine heading (`Engine`, no heading of its own); "API Clients" = `IntegrationClients`.
 *    The AC lists Plans twice; the TCs' sixteen types are used.
 *  - Decision 3: the entry must read exactly VIEW_AUDIT_LOGS and sit DIRECTLY under its heading (depth 1). Probe
 *    2026-11-14: Members has NO such entry (22191 / 22197 / 22194 fail on it - findings) and Policies shows a second
 *    "View Audit Logs" (PolicyMembers.AuditLogs) - 22197 fails on it. Re-probed 2026-11-15 after the redeploy: Members
 *    still has none (only Policies > PolicyMembers.AuditLogs "View member audit logs" and MemberAccumulators.AuditLogs),
 *    the others read "View audit logs" (lower-case a / l).
 *  - 22193 / 22194 "a confirmation message confirms the role was updated": no text quoted - a toast must appear after
 *    the UpdateRole 2xx; its text goes into the report.
 *  - 22194 Members: the precondition cannot be built (no Members audit entry) - the steps run and FAIL on it, the
 *    revoke step fails with "nothing to clear" (assessment: "fails at setup as a finding").
 *  - 22195 Authorization reversals: a REVERSED authorization must exist (GetAuthorizations held 0 rows on 2026-11-05;
 *    the suite cannot post one - it needs the partner API) - decided at run time, BLOCKED when absent. Other audit
 *    rights enabled = OTHER_AUDIT_MODULES. The reversal's detail screen was never probed: its audit request
 *    (ENGINE_AUDIT_ENTITY) is checked through the API and the portal page is checked for any `-tab-audit` id.
 *  - 22196 "SystemSettings audit history": the app has no audit tab on Settings; its history is System Settings >
 *    Audit Logs, entity type SYSTEM_SETTING_ENTITY (user foundation). The holder role keeps the system log rights, so
 *    a refusal / absence of SystemSetting entries is due to SystemSettings > View Audit Logs only.
 */

export const CASES = {
  withPermissionViews: { azureId: '22189' },
  withoutPermissionHidden: { azureId: '22190' },
  ownPermissionPerType: { azureId: '22191' },
  mixedPermissions: { azureId: '22192' },
  grantThenView: { azureId: '22193' },
  revokeHides: { azureId: '22194' },
  reversalOwnPermission: { azureId: '22195' },
  noDirectBypass: { azureId: '22196' },
  labelledAndGrouped: { azureId: '22197' },
} as const;

/**
 * The TC's literal entry label (lead decision 3). Since the 2026-11-14 build the tree reads "View audit logs": 22191 /
 * 22194 FIND the entry ignoring case (their point is that it exists), 22197 asserts the exact text (its point is the
 * label) and fails on the capitalisation - a finding, the case quotes "View Audit Logs".
 */
export const VIEW_AUDIT_LOGS = 'View Audit Logs';

/** The system log rights every holder role carries (not a module's own audit permission). */
export const GLOBAL_AUDIT_RIGHTS = ['AuditLogs.GetAuditLogs', 'AuditLogs.GetAuditLogById'] as const;

/**
 * The TCs' sixteen record types -> catalogue module key -> how its heading may read. The heading is FOUND by the
 * module's chevron id (`role-form-drawer-permission-toggle-<key>`), not by its text: the build deployed mid-run on
 * 2026-11-14 (~21:30 UTC) renamed the tree to friendly names ("Benefit configurations", "Member accumulators",
 * "System settings", entries "View audit logs"). `heading` accepts the TC's name and the friendly one - "correctly
 * named" (22197) = recognisably that record type; the TC names types, not literal headings (lead decision 2).
 */
export const AUDIT_RECORD_TYPES = [
  { type: 'Users', moduleKey: 'Users', heading: /^Users$/i },
  { type: 'Roles', moduleKey: 'Roles', heading: /^Roles$/i },
  { type: 'Lookups', moduleKey: 'Lookups', heading: /^Lookups$/i },
  { type: 'Payers', moduleKey: 'Payers', heading: /^Payers$/i },
  { type: 'Plans', moduleKey: 'Plans', heading: /^Plans$/i },
  { type: 'Networks', moduleKey: 'Networks', heading: /^Networks$/i },
  { type: 'Facilities', moduleKey: 'Facilities', heading: /^Facilities$/i },
  { type: 'Policies', moduleKey: 'Policies', heading: /^Policies$/i },
  { type: 'Members', moduleKey: 'Members', heading: /^Members$/i },
  { type: 'Terminologies', moduleKey: 'Terminologies', heading: /^Terminologies$/i },
  { type: 'Authorization reversals (PBM Engine)', moduleKey: 'Engine', heading: /PBM Engine|Authori[sz]ation/i },
  { type: 'API Clients', moduleKey: 'IntegrationClients', heading: /^API Clients$|^Integration ?Clients$/i },
  { type: 'Formularies', moduleKey: 'Formularies', heading: /^Formularies$/i },
  { type: 'BenefitConfigs', moduleKey: 'BenefitConfigs', heading: /^Benefit ?config(uration)?s$/i },
  { type: 'MemberAccumulators', moduleKey: 'MemberAccumulators', heading: /^Member ?accumulators$/i },
  { type: 'SystemSettings', moduleKey: 'SystemSettings', heading: /^System ?settings$/i },
] as const;

/** Catalogue module key of each holder module the cases open. */
export const MODULE_KEY: Record<HolderModule, string> = {
  users: 'Users',
  invitations: 'Invitations',
  payers: 'Payers',
  networks: 'Networks',
  plans: 'Plans',
  policies: 'Policies',
  formularies: 'Formularies',
  facilities: 'Facilities',
  members: 'Members',
};

/** 22192: View Audit Logs on Plans and Networks, not on Facilities and Policies (TC order). */
export const MIXED = [
  { module: 'plans', audit: true },
  { module: 'networks', audit: true },
  { module: 'facilities', audit: false },
  { module: 'policies', audit: false },
] as const satisfies readonly { module: HolderModule; audit: boolean }[];

/** 22195: the record type under test and the "other" modules whose audit rights stay enabled. */
export const ENGINE_MODULE = 'Engine';
export const OTHER_AUDIT_MODULES = ['Plans', 'Networks'] as const;
/** CONVENTION (not probed): GetAuthorization and the audit entity type of an authorization. */
export const ENGINE_GET_AUTHORIZATION = '/api/Engine/GetAuthorization';
export const ENGINE_AUDIT_ENTITY = 'Authorization';

/** 22196: the system log's entity type of the settings records. */
export const SYSTEM_SETTINGS_MODULE = 'SystemSettings';
export const SYSTEM_SETTING_ENTITY = 'SystemSetting';
/** How the Audit Logs list prints that entity type ("SystemSetting" / "System Setting"). */
export const SYSTEM_SETTING_ROW = /System ?Setting/i;

/** Labels of the suite roles the cases make. */
export const ROLE_LABEL = {
  users: 'users audit',
  payers: 'payers no audit',
  mixed: 'mixed audit',
  formularies: 'formularies grant',
  members: 'members revoke',
  engine: 'engine no audit',
  settings: 'settings no audit',
  tree: 'audit tree',
} as const;

/** 22189: the change made on the suite user so its history holds an entry. */
export const EDITED_SECOND_NAME = 'Audited';
