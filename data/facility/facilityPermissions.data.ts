import type { FacilityBlockedCase } from '../../utils/facility/writerCHelpers';

/**
 * US 15144 "Facility Permissions" (facility folder 12) - and the facility
 * rights every Writer C folder (09, 10, 11, 12) shapes on the existing
 * "Payer Admin" role through the `facilityRole` fixture
 * (utils/facility/writerCHelpers.ts, built as the Policy suite's `policyRole`).
 *
 * THE CATALOGUE (Facility-Foundation-Notes.md, "Permissions", read 2026-11-04):
 * section "Facilities" = `Facilities.AuditLogs` (label "View Audit Logs") and
 * `Facilities.GetFacilities` (the LIST right, PARENT of every other one):
 * CreateFacility, DeleteFacility, ExportFacilities, GetFacilitiesDashboard,
 * GetFacilitiesDropdown, GetFacility, GetFacilityNetworks, SetFacilityActive,
 * UpdateFacility (labels = the key without "Facilities."). The Audit History tab
 * also needs `AuditLogs.GetAuditLogs` (View Details: `AuditLogs.GetAuditLogById`)
 * - labels assumed to be the codes' last part *(not seen on the catalogue: a
 * missing label BLOCKS the case naming it)*.
 *
 * "View Audit Logs" is shared by EVERY section, so the facility one is toggled
 * inside the "Facilities" section (`section`), never by its label alone.
 *
 * The Payer Admin role holds only UpdateFacility, GetFacilityNetworks,
 * SetFacilityActive, GetFacilitiesDashboard, GetFacilitiesDropdown on
 * 2026-11-04 - NOT GetFacilities / GetFacility - so every shape GRANTS the list
 * first and then withholds (the terminology parent trap: `requireFacilityListAccess`
 * BLOCKS a case whose shaped account lost the list, and FAILS it - the
 * propagation finding - when the account was granted the list but is not told it
 * holds it). The role is restored exactly at teardown.
 *
 * Readings of folder 12's cases:
 * - "Facility Administrator" (17562, 17567, 17568) = the suite's administrator
 *   account (it holds every right); "View" is the list row's View (the detail has
 *   no View button - it IS the view).
 * - "Deactivate" is the screen's Inactivate.
 * - 17563 "View only" = GetFacilities + GetFacility; 17564 "Edit-Only" =
 *   GetFacilities + GetFacility + UpdateFacility (Edit needs GetFacility too);
 *   "Full Access" = every Facilities right.
 * - 17565 is BLOCKED: one facility right alone opens nothing (the list needs
 *   GetFacilities, the record GetFacility, Edit = UpdateFacility AND GetFacility),
 *   and Activate / Deactivate are ONE right (SetFacilityActive) - "exactly one
 *   permission -> exactly one action" cannot be built (build brief decision).
 * - 17570 "Deleted" facility = a suite facility soft-deleted through the API (it
 *   answers 404 and cannot be opened by anyone).
 * - 17571: the administrator revokes UpdateFacility while the Payer Admin is
 *   signed in; Policy (2026-11-04) saw role edits not reach the signed-in
 *   account - the case stays a finding and carries the evidence.
 * - 17573 "unrecognised role": no account with an undefined role code can be
 *   made; the nearest the environment offers is the Payer Admin role holding NO
 *   facility right (the "role not in the access matrix" for this module).
 */

/** One catalogue row: its label, the top-level section it must be found in (shared labels), its effective-permission code. */
export interface FacilityRightRow {
  label: string;
  section?: string;
  code: string;
}

export const FACILITY_RIGHT = {
  /** Parent of the section's rights except "View Audit Logs". */
  list: { label: 'GetFacilities', code: 'Facilities.GetFacilities' },
  view: { label: 'GetFacility', code: 'Facilities.GetFacility' },
  create: { label: 'CreateFacility', code: 'Facilities.CreateFacility' },
  edit: { label: 'UpdateFacility', code: 'Facilities.UpdateFacility' },
  delete: { label: 'DeleteFacility', code: 'Facilities.DeleteFacility' },
  export: { label: 'ExportFacilities', code: 'Facilities.ExportFacilities' },
  dashboard: { label: 'GetFacilitiesDashboard', code: 'Facilities.GetFacilitiesDashboard' },
  dropdown: { label: 'GetFacilitiesDropdown', code: 'Facilities.GetFacilitiesDropdown' },
  networks: { label: 'GetFacilityNetworks', code: 'Facilities.GetFacilityNetworks' },
  /** Activate AND Inactivate - one right. */
  setActive: { label: 'SetFacilityActive', code: 'Facilities.SetFacilityActive' },
  /** The facility section's own "View Audit Logs" (shared label - section-scoped). */
  audit: { label: 'View Audit Logs', section: 'Facilities', code: 'Facilities.AuditLogs' },
  /** The audit trail itself (AuditLogs section). */
  auditLogs: { label: 'GetAuditLogs', code: 'AuditLogs.GetAuditLogs' },
  /** The audit entry's View Details. */
  auditEntry: { label: 'GetAuditLogById', code: 'AuditLogs.GetAuditLogById' },
} as const satisfies Record<string, FacilityRightRow>;

export type FacilityRight = keyof typeof FACILITY_RIGHT;

/** A shape for the `facilityRole` fixture: rights to tick (first) and to untick (after). */
export interface FacilityShape {
  with?: readonly FacilityRight[];
  without?: readonly FacilityRight[];
}

/** The "Facilities" section's rights - the parent first, so unticking it clears its children before they are visited. */
export const SECTION_RIGHTS: readonly FacilityRight[] = [
  'list', 'view', 'create', 'edit', 'delete', 'export', 'dashboard', 'dropdown', 'networks', 'setActive', 'audit',
];

/** Every right the fixture snapshots and restores (parents first). */
export const ALL_FACILITY_RIGHTS: readonly FacilityRight[] = [...SECTION_RIGHTS, 'auditLogs', 'auditEntry'];

/** The rights that change a facility or take its data away. */
export const WRITE_RIGHTS: readonly FacilityRight[] = ['create', 'edit', 'delete', 'export', 'setActive'];

/** Every section right (grants first), then `withhold` unticked. */
export const fullAccessWithout = (...withhold: FacilityRight[]): FacilityShape => ({
  with: SECTION_RIGHTS.filter((r) => !withhold.includes(r)),
  without: withhold,
});

/** Only the given section rights (every other section right withheld). */
export const only = (...keep: FacilityRight[]): FacilityShape => ({
  with: keep,
  without: SECTION_RIGHTS.filter((r) => !keep.includes(r)),
});

/** Every facility right of the section. */
export const FULL_ACCESS: FacilityShape = { with: SECTION_RIGHTS };
/** The list and the record only. */
export const VIEW_ONLY: FacilityShape = only('list', 'view');
/** The list, the record and Edit (Edit needs GetFacility). */
export const EDIT_ONLY: FacilityShape = only('list', 'view', 'edit');
/** No facility right at all. */
export const NO_ACCESS: FacilityShape = { without: ALL_FACILITY_RIGHTS };

export const CASES = {
  adminAllActions: { azureId: '17562' },
  viewOnly: { azureId: '17563', shape: VIEW_ONLY },
  roleAndStatus: { azureId: '17564', editOnly: EDIT_ONLY, fullAccess: FULL_ACCESS },
  deactivateEndToEnd: { azureId: '17567', reason: 'Contract Ended', details: 'Inactivated by the automation suite (17567).' },
  activateAfterDeactivate: { azureId: '17568', details: 'Inactivated by the automation suite (17568).' },
  exploratory: { azureId: '17570', viewer: VIEW_ONLY, editOnly: EDIT_ONLY },
  revokedMidSession: { azureId: '17571', granted: EDIT_ONLY, revoke: { without: ['edit'] } satisfies FacilityShape },
  unrecognisedRole: { azureId: '17573', shape: NO_ACCESS },
} as const;

/** An access-restricted message ("access denied", "not authorised", "no permission"). */
export const ACCESS_RESTRICTED = /access|denied|not authori[sz]ed|unauthori[sz]ed|permission|restricted|forbidden/i;

export const BLOCKED_CASES: FacilityBlockedCase[] = [
  {
    azureId: '17565',
    title: 'should show exactly the one action a single granted permission allows and no other',
    reason:
      'Needs a role holding EXACTLY ONE facility permission (Edit) that still reaches a facility. In this build no single facility '
      + 'right opens anything: the list needs Facilities.GetFacilities (the parent of every facility right), the record needs '
      + 'GetFacility, and the screen offers Edit only with UpdateFacility AND GetFacility; Activate and Deactivate are one right '
      + '(SetFacilityActive), so "Activate only" / "Deactivate only" cannot be expressed either. A single-permission role whose '
      + 'one action is visible cannot be built from this catalogue.',
  },
  {
    azureId: '17569',
    title: 'should match every role\'s facility actions to the organisation\'s approved access management standard',
    reason:
      'Needs the organisation\'s user access management standard ("Facility Access Standard v1") that maps the Administrator, '
      + 'Editor, Viewer and Auditor roles to their allowed facility actions. That document is not available to the suite and the '
      + 'environment has no Editor / Viewer / Auditor roles, so there is no checklist to verify the actions against.',
  },
  {
    azureId: '17572',
    title: 'should take facility action permissions from the central identity and access management service and fail safe during its outage',
    reason:
      'Needs a way to simulate an outage of the central Identity and Access Management service while the application keeps '
      + 'serving facility screens. The suite cannot stop or isolate the IAM service of the shared environment (and must not), so '
      + 'the fail-safe behaviour during an outage cannot be exercised.',
  },
];
