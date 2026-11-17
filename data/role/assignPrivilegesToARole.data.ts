/**
 * US 21283 "Assign Privileges to a Role" (Role Management folder 04, 17 cases 22010-22027; Writer D).
 *
 * WHO. Tree cases run as careconnect (the System Administrator of the TCs) on the Add / Edit drawer of the
 * suite's OWN roles ("QA Automation Role ..."); nothing is saved on a predefined or foreign role. The access cases
 * (22015, 22021, 22022, 22023) give maalmohammad (`roleHolder`) a suite role and sign it in; the fixture restores
 * Organization Administrator at teardown.
 *
 * LEAD DEFAULTS APPLIED (reports/role/Role-Writers-Brief.md - each overridable here):
 *  - Decision 2, example values: "Regional Reviewer" / "Empty Privilege Role" / "Claims Viewer" -> stamped suite
 *    names; "Add Payer" / "View Payer" / "View Network" -> the permission KEYS Payers.CreatePayer / Payers.GetPayer /
 *    Networks.GetNetwork (TC_PICKS); "a test user" -> the role holder; Role A / Role B -> two suite roles holding the
 *    Payers / Networks VIEW rights (every Get... right of the module that is not an audit right).
 *  - Decision 3, literal texts: the TCs' permission NAMES ("Add Payer", "View Payer", "View Network") and counts
 *    ("0/24" ... "23/24", "2", "1") are asserted literally. The live tree shows technical keys (CreatePayer, GetPayer,
 *    GetNetwork) and Payers totals 25 (probe 2026-11-14) - those steps FAIL with what the tree showed (findings).
 *    The selection mechanics (partial / checked / count of the picks) are asserted FIRST, so a failure message tells
 *    a wrong total apart from a broken tick.
 *  - 22015 "module heading metadata exists": the module node itself is a permission in the catalogue (key
 *    `Networks`, the heading's own id). The role holds ONLY that heading node (+ Roles.GetRoles so the holder has a
 *    page to land on): View Role then shows Networks 0/N, and the holder must reach nothing of Networks (AC: "Selecting
 *    a module heading alone does not grant access").
 *  - 22021 "via the user form": the holder's roles are set by the roleHolder fixture (API - the only way the brief
 *    allows to reshape maalmohammad), read back, then signed in.
 *  - 22022 "Sign in as (or refresh the session for)": the holder's page is RELOADED (rights reach a signed-in holder
 *    at once - foundation notes); a fresh sign-in of a user whose only role is inactive is not attempted (the fixture
 *    would report it BLOCKED).
 *  - 22024 "every permission": careconnect's GetCurrentUserRolesAndPermissions must hold every catalogue key; "all
 *    payers visible": GetPayers answers at least as many payers as the payer selector offers (all active payers).
 *  - 22026 "no lag": each state must settle within the normal timeout; "visual glitch" is not judged.
 *  - 22027 "Add User or Invite User": both drawers are opened as careconnect and closed without saving.
 */

export const CASES = {
  multiModuleRole: { azureId: '22010' },
  noPrivilegeRefused: { azureId: '22011' },
  headingCountBoundaries: { azureId: '22012' },
  clearHeading: { azureId: '22013' },
  selectHeading: { azureId: '22014' },
  headingOnlyNoAccess: { azureId: '22015' },
  noDuplicatePermission: { azureId: '22016' },
  searchEnglish: { azureId: '22017' },
  searchArabic: { azureId: '22018' },
  searchNoMatch: { azureId: '22019' },
  expandCollapseAll: { azureId: '22020' },
  unionOfRoles: { azureId: '22021' },
  deactivatedRoleNoAccess: { azureId: '22022' },
  missingPermissionBlocked: { azureId: '22023' },
  systemAdminAllAccess: { azureId: '22024' },
  combinedTreeActions: { azureId: '22026' },
  availableAfterSave: { azureId: '22027' },
} as const;

/** Catalogue module keys the cases use (heading label = the catalogue's englishName). */
export const MODULE = {
  payers: 'Payers',
  networks: 'Networks',
  plans: 'Plans',
  roles: 'Roles',
} as const;

/** The headings the AC names as examples ("Payers, Networks, Plans, and Approval Management"). */
export const EXAMPLE_HEADINGS = ['Payers', 'Networks', 'Plans', 'Approval Management'] as const;

/** The TC's permission NAMES (asserted literally - decision 3) and the KEYS they stand for (decision 2). */
export const TC_LABEL = { addPayer: 'Add Payer', viewPayer: 'View Payer', viewNetwork: 'View Network' } as const;
export const TC_PICKS = {
  payers: ['Payers.CreatePayer', 'Payers.GetPayer'],
  networks: ['Networks.GetNetwork'],
} as const;
/** "the Payers heading updates to show 2 selected", "the Networks heading ... 1 selected". */
export const TC_PICK_COUNT = { payers: 2, networks: 1 } as const;

/** 22012: the TC's Payers total ("0/24" ... "24/24"); live 2026-11-14: 25. */
export const PAYERS_TOTAL_TC = 24;
/** 22012: the one permission selected first and cleared last. */
export const PAYERS_SINGLE_PICK = 'Payers.CreatePayer';

/** Tree search terms (TC test data). */
export const TREE_SEARCH = {
  english: 'Add Payer',
  /** 22018: the TC's Arabic term for "Add Payer" (the app's word for payer is "جهة التغطية" - a likely no-match). */
  arabic: 'إضافة دافع',
  noMatch: 'zzznotfound123',
} as const;

/** 22026: the scripted sequence (search a term, clear, collapse / expand one module, tick, search again, toggle a heading). */
export const COMBINED = {
  searchTerm: 'Export',
  module: 'Roles',
  /** A branch of the module, rendered again once the module is re-expanded. */
  branch: 'Roles.GetRoles',
  ticks: ['Roles.ExportRoles', 'Roles.CreateRole'],
  /** Searched again after ticking: the ticked leaf must still show checked. */
  searchAgain: 'ExportRoles',
  toggledHeading: 'Plans',
  toggles: 6,
} as const;

/** 22027 / 22011 / 22010: labels of the stamped suite roles the cases create through the screen. */
export const ROLE_LABEL = {
  multiModule: 'multi module',
  empty: 'empty privileges',
  boundaries: 'heading counts',
  clear: 'plans full',
  select: 'plans heading',
  duplicates: 'duplicates',
  search: 'tree search',
  expand: 'expand collapse',
  combined: 'combined',
  available: 'available',
  headingOnly: 'heading only',
  roleA: 'role A payers',
  roleB: 'role B networks',
  deactivated: 'deactivated',
  missing: 'no networks',
} as const;

/** 22027: the privilege the new role is saved with. */
export const AVAILABLE_ROLE_RIGHT = 'Roles.GetRoles';

/** 22015: the heading-only role (module node + a right elsewhere so the holder lands somewhere). */
export const HEADING_ONLY = { target: 'Networks', other: 'Roles.GetRoles' } as const;

/** 22022: the deactivation reason chosen in the drawer (no details needed). */
export const DEACTIVATION_REASON = 'No Longer Required';

/** 22024: the modules careconnect browses ("Payers, Networks, Plans, Approval Management"). */
export const SYSTEM_ADMIN_MODULES = ['payers', 'networks', 'plans'] as const;
