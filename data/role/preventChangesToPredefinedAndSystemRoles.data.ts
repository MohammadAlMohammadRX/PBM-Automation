/**
 * US 21291 "Prevent Changes to Predefined and System Roles" (role folder 12, 18 cases 22114-22131).
 *
 * SAFETY: the predefined roles (Organization Administrator, Payer Administrator, Payer Officer) and the
 * System Administrator role ("Admin", careconnect's) are only READ or opened and closed (Edit / View opened,
 * never saved). Clicks on their disabled controls are REAL mouse clicks (force) - a dispatched DOM event reaches
 * the handler even of a disabled control (probe 2026-11-15), which no user can do; nothing is ever confirmed.
 * Every API WRITE attempt on them (22128 rename of the Admin role, 22130 UpdateRole on Payer Officer) is
 * gated by API_WRITE_GATE (BLOCKED while false); if the user switches it on and the server ACCEPTS a
 * write, the captured original is put back at once and the step fails with the answer.
 *
 * Lead defaults applied here (the test case wins over the AC):
 * - The System Administrator role = careconnect's "Admin" (brief "Accounts"); "never listed" counts any listed
 *   role matching /^System Administrat/i (lead decision 5 - the env lists "System Administration": 22114 FAILS).
 * - 22115 "disabled or not offered" -> table toggle disabled or absent, cards have none. 22116 "no Delete action
 *   is present" -> asserted ABSENT (lead decision 4; the table renders it DISABLED - FAILS today, cards pass).
 * - 22117 opens Edit on Payer Officer, reaches Privileges, gives a real click to one ticked and one unticked
 *   privilege (read from Payer Officer's own selection), asserts nothing changed, closes without saving.
 * - 22118-22121 assignment happens in Users Administration > Assign Roles & Payers on a SUITE user. Payer Officer
 *   is payer-scoped, so a suite payer is assigned with it. "Accepted and saved" = UpdateUser 2xx and the role on
 *   the record, OR (when the change goes to approval because the predefined assigner may not approve its own
 *   requests) a Pending request for the user - the run reports which; a pending request is rejected at teardown.
 *   The System Administrator = careconnect; Organization / Payer Administrator = the role holder shaped so.
 * - 22121 the holder holds ONLY Payer Officer + a suite payer: Users Administration is not offered (baseline:
 *   careconnect sees it) and an API UpdateUser giving a suite user Payer Officer is refused.
 * - 22122 the predefined-role holder = the role holder as Organization Administrator (its home role, one holder
 *   at a time); the request = a new suite network ("Automation Network ...") on a suite payer, submitted for
 *   approval; careconnect approves it in step 4; the network is deleted at teardown.
 * - 22123-22125 payer scope is proven on the payers the session is offered (GetPayersDropdown) and the payer list
 *   search (GetPayers). Assigned payer: offered AND not hidden by the list (a REFUSED list is tolerated - Payer
 *   Officer holds no payer-list right). Unassigned payer: not offered AND not found by the list. Organization
 *   Administrator: offered every payer careconnect is offered, and three suite payers each offered and found.
 * - 22126 modules with an Audit History tab = constants/role/writerCIds.ts WRITER_C_AUDIT_MODULES; for each, a
 *   record the Payer Officer session lists is opened by careconnect (baseline: the tab IS there) and by the
 *   holder (tab absent). Plus: Payer Officer's permissions hold no "*.AuditLogs" / "*AuditTrail" key. A module
 *   with no record visible to Payer Officer is skipped; if NONE has one the UI half is BLOCKED.
 * - 22127 the home page "welcome card only": `#dashboard-welcome` shown and no other id inside the routed outlet,
 *   no Dashboard API answered 2xx (baseline: careconnect gets widgets).
 * - 22129 "Attempt to edit a predefined role": Edit on Organization Administrator opens locked (every field
 *   disabled + the predefined note) and is closed unsaved; the new role is made through Add Role with
 *   CUSTOM_RIGHTS and read back.
 * - 22131 "fresh platform" cannot be produced; exactly three listed roles are isPredefined (the three names,
 *   with the badge) and the fourth (careconnect's "Admin") exists but is not listed and is not predefined.
 */

/** Azure ids. */
export const CASES = {
  listShowsPredefinedNotSystem: { azureId: '22114' },
  deactivationNotAvailable: { azureId: '22115' },
  deleteNotOffered: { azureId: '22116' },
  privilegesFixed: { azureId: '22117' },
  poAssignedBySystemAdmin: { azureId: '22118' },
  poAssignedByOrgAdmin: { azureId: '22119' },
  poAssignedByPayerAdmin: { azureId: '22120' },
  poNotAssignedByOthers: { azureId: '22121' },
  requestNeedsAnotherApprover: { azureId: '22122' },
  orgAdminEveryPayer: { azureId: '22123' },
  payerAdminScoped: { azureId: '22124' },
  payerOfficerScoped: { azureId: '22125' },
  payerOfficerNoAuditTab: { azureId: '22126' },
  payerOfficerWelcomeOnly: { azureId: '22127' },
  systemRoleLocked: { azureId: '22128' },
  newRoleInsteadOfEdit: { azureId: '22129' },
  apiManipulationRefused: { azureId: '22130' },
  fourDefaultRoles: { azureId: '22131' },
} as const;

/** The System Administrator role (careconnect's) and the "never listed" pattern (lead decision 5). */
export const SYSTEM_ROLE = { name: 'Admin', literalName: 'System Administrator' } as const;
export const SYSTEM_ADMIN_ROLE_PATTERN = /^System Administrat/i;

/**
 * ONE gate for the API write attempts of this folder: 22128 (one UpdateRole renaming the Admin role) and
 * 22130 (one UpdateRole on Payer Officer: changed name + one extra privilege). Both capture the original first
 * and put it back at once if the server accepts. While false both steps are BLOCKED.
 */
export const API_WRITE_GATE = {
  allowed: false,
  reason: 'API write attempts against predefined / system roles are switched off (data/role/preventChangesToPredefinedAndSystemRoles.data.ts API_WRITE_GATE) - a missing server guard would change a product role',
} as const;

/** 22130: the privilege the attempt adds to Payer Officer (Payer Officer holds no Roles right). */
export const EXTRA_PRIVILEGE_FOR_ATTEMPT = 'Roles.GetRoles';

/** 22117: a privilege Payer Officer does NOT hold (Roles 0/9). */
export const UNHELD_PRIVILEGE = 'Roles.CreateRole';

/**
 * 22120: Allowed To Assign By of the suite role the target user ALREADY holds. Assign Roles & Payers re-sends
 * every role of the user, and the full run (2026-11-14) answered 403 "You are not allowed to assign one or more
 * of the selected roles." when the target's existing role was assignable by Organization Administrator only - a
 * refusal of OUR precondition, not of Payer Officer. With the Payer Administrator allowed to assign the existing
 * role too, a refusal can only be about Payer Officer (whose Allowed To Assign By is [OA, PA]).
 */
export const PA_TARGET_ASSIGNABLE_BY = ['Organization Administrator', 'Payer Administrator'] as const;

/** 22129: the custom permission combination of the new role (no predefined role holds exactly these). */
export const CUSTOM_RIGHTS = ['Roles.ExportRoles', 'Roles.AuditLogs'] as const;

/** 22126: permission keys that open an Audit History tab / audit log. */
export const AUDIT_PERMISSION_PATTERN = /(\.AuditLogs$|AuditTrail$|^AuditLogs(\.|$))/;

/** 22126: the UI half needs at least one record Payer Officer can open. */
export const NO_AUDIT_RECORD_BLOCK = 'no module with an Audit History tab lists a record for the Payer Officer session (its suite payer owns no network / plan / policy / formulary it can open)';

/** 22127: Payer Officer holds no Dashboard permission (Role-Foundation-Notes: Dashboard 0/11). */
export const DASHBOARD_MODULE = 'Dashboard';

/** 22123: how many suite payers are sampled as "several different payers". */
export const SAMPLED_PAYERS = 3;

/** 22122: the approval queue tab of the suite network request. */
export const NETWORK_APPROVAL_TAB = 'network' as const;
