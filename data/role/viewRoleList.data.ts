/**
 * US 21282 "View Role List" (role folder 03, 14 cases, 21996-22009).
 *
 * Live screen (reports/role/Role-Foundation-Notes.md): Table view by default (careconnect's SERVER-SIDE
 * preference - every case that switches to Cards switches back, and an afterEach puts the table back if a
 * step failed half-way); columns Role Name / Description / Status / Actions (no Role ID); the predefined
 * badge "Predefined role"; predefined rows: Toggle + Delete rendered DISABLED, View + Edit enabled; cards: no
 * status, no toggle, predefined cards Edit + View only.
 *
 * Decisions (Role-Writers-Brief.md lead decisions):
 *  - Role ID (21999, 22005, 22006, 22007) is asserted literally (decision 6): the role's id (the GUID GetRoles /
 *    CreateRole answer) must appear in the row / card / View Role. None shows it today - a FINDING.
 *  - "Clinician" / "Custom Billing Role" (22000, 22002, 22009) are replaced by Payer Officer (predefined) and
 *    suite roles (decision 2).
 *  - 22001: User A = careconnect (every Roles right); User B = the role holder (maalmohammad) holding ONLY a
 *    suite role with the view rights VIEW_ONLY_RIGHTS (open question: "View" = list + read one role, so the
 *    View action can open; Edit = Roles.UpdateRole, Activate/Inactivate = Roles.SetActive, Delete =
 *    Roles.DeleteRole are NOT held). "not displayed" = the control is absent (count 0).
 *  - 22002 (decision 4): "only the View action" + "disabled and hidden, not merely greyed out" are asserted per
 *    the case's own words: on each predefined row AND card only View is present; Edit, Activate/Inactivate and
 *    Delete are absent (not merely disabled). Fails today (Edit enabled, toggle + Delete disabled on rows).
 *  - 22003: "View Roles permission only" = Roles.GetRoles alone (VIEW_ROLES_RIGHTS). If the lead reads the screen
 *    as needing Roles.GetRole too, add it there.
 *  - 22004: the user without the right = the holder with ONLY a suite role holding NO_ROLES_RIGHTS (no Roles.*
 *    right; one Users right so the session has something). Baseline first: careconnect reaches the screen from
 *    the menu. "access is denied or the menu option is not shown" + "cannot reach the screen" is asserted as:
 *    menu entry absent AND the route shows no role list AND GetRoles is refused (>= 400) for that session.
 *  - 21996: the AC's Arabic labels "إعدادات النظام" / "إدارة الأدوار" are read in the Arabic UI (decision 10,
 *    switched back to English).
 *  - 21997: "has not previously changed the display mode" = careconnect's stored preference (Table); the screen
 *    is visited WITHOUT forcing the table (navigate, not open()).
 *  - 22006 (decision 6 + the TC): View Role must show the role's ID, name, description, status and permissions,
 *    and nothing editable (the tree search box is not an edit). The probe saw no ID, description or status.
 *  - 22007: "several roles in quick succession" = VOLLEY_SIZE suite roles created through the API at once
 *    (parallel CreateRole calls - the hardest case for ID generation), then listed through the screen.
 *  - 22008: the search "Payer Officer" lists the predefined Payer Officer AND a suite role named
 *    "... Payer Officer"; for each, the table row and the card must agree on badge, name, description, status
 *    and the ENABLED actions. Today the cards show no status and no Activate/Inactivate - a FINDING.
 *  - 22009: Inactivate opens the Deactivate drawer (reason + details, not in the TC): DEACTIVATION picks
 *    the first reason and a fixed text; Activate asks a confirmation (shared dialog) - confirmed.
 */
import { PREDEFINED_ROLES, ROLE_DEACTIVATION_REASON } from './common.data';

export const CASES = {
  menuNavigation: { azureId: '21996' },
  listViewDefault: { azureId: '21997' },
  switchViews: { azureId: '21998' },
  entryFields: { azureId: '21999' },
  predefinedBadge: { azureId: '22000' },
  actionsByPermission: { azureId: '22001' },
  predefinedViewOnly: { azureId: '22002' },
  viewRightOpensScreen: { azureId: '22003' },
  noViewRightNoScreen: { azureId: '22004' },
  roleIdGenerated: { azureId: '22005' },
  viewDetails: { azureId: '22006' },
  roleIdUnderVolley: { azureId: '22007' },
  consistencyAcrossViews: { azureId: '22008' },
  reactivateInactive: { azureId: '22009' },
} as const;

/** Side menu labels: English (screen) and Arabic (AC). */
export const MENU_LABELS = {
  en: { group: 'System Settings', link: 'Role Administration' },
  ar: { group: 'إعدادات النظام', link: 'إدارة الأدوار' },
} as const;

/** The badge word the TC quotes. */
export const PREDEFINED_WORD = 'Predefined';
/** The predefined role standing in for "Clinician". */
export const PREDEFINED_EXAMPLE = PREDEFINED_ROLES.payerOfficer;
export const PREDEFINED_ALL = [PREDEFINED_ROLES.organizationAdministrator, PREDEFINED_ROLES.payerAdministrator, PREDEFINED_ROLES.payerOfficer] as const;

/** Row actions (ids) a full-rights user sees on a suite row, and what a view-only user may see. */
export const ALL_ROW_ACTIONS = ['view', 'edit', 'toggle-active', 'delete'] as const;
export const VIEW_ONLY_ACTIONS = ['view'] as const;

/** 22001 User B rights; 22003 view-roles right; 22004 a session without any Roles right. */
export const VIEW_ONLY_RIGHTS = ['Roles.GetRoles', 'Roles.GetRole'] as const;
export const VIEW_ROLES_RIGHTS = ['Roles.GetRoles'] as const;
export const NO_ROLES_RIGHTS = ['Users.GetUsers'] as const;

/** 21999 / 22006 / 22008 suite role descriptions. */
export const ENTRY_DESCRIPTION = 'Entry check role for the list';
export const VIEW_DESCRIPTION = { en: 'View check role description', ar: 'وصف دور للعرض' } as const;
/** 22006: the one right the viewed role holds (a LEAF, so the tree shows it ticked). */
export const VIEW_RIGHT_LEAF = 'Roles.ExportRoles';
/** 22006: what a status row may read in View Role. */
export const VIEW_STATUS_LABEL = /status|is active/i;
export const VIEW_STATUS_VALUES = ['Active', 'Yes'] as const;

/** 22005: the right ticked when creating through the screen. */
export const UI_CREATE_RIGHT = 'Roles.ExportRoles';
/** Role ids are GUIDs (CreateRole / GetRoles). */
export const ROLE_ID_FORMAT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 22007: roles created at once. */
export const VOLLEY_SIZE = 5;
export const VOLLEY_LABELS = ['Volley One', 'Volley Two', 'Volley Three', 'Volley Four', 'Volley Five'] as const;

/** 22008: the search that lists a predefined and a suite role together. */
export const CONSISTENCY_SEARCH = 'Payer Officer';
export const CONSISTENCY_DESCRIPTION = 'Consistency check role';

/** 22009: the Deactivate drawer answers (not in the TC). */
export const DEACTIVATION = { reason: ROLE_DEACTIVATION_REASON.reorganisation.en, details: 'Deactivated by the automation suite (22009).' } as const;
