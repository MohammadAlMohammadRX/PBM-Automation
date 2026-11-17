/**
 * Writer D (Role Management folders 04 / 07 / 17) - the ids of OTHER modules' screens a role holder is sent
 * to ("holder sees module X", "the Audit History tab is / is not there"). Everything here was read off the
 * earlier modules' constants and probes (constants/ElementIds.ts, constants/facility, constants/member,
 * constants/user, reports/<module>/probe); the ones marked CONVENTION were not probed and follow the app's
 * own naming rule, so a wrong guess fails as "not found" with the id in the message.
 *
 *  - Side menu links: `app-nav-<route with "/" as "-">-link` (verified: `app-nav-payer-management-link`,
 *    `app-nav-system-settings-lookup-management-link`, `app-nav-financial-benefits-reset-history-link`,
 *    `app-nav-engine-portal-link`). A group's links render only while the group (`app-nav-<group>-toggle`,
 *    class `is-open`) is expanded.
 *  - List screens: `<screen>` root, `<screen>-table-el`, `<screen>-add-button` (p-button host),
 *    `<screen>-export-trigger` (ListPageBase convention).
 *  - Detail screens: tabs `<detail>-tab-<key>`; the Audit History tab is `<detail>-tab-audit`
 *    (verified for payer / network / plan / policy / formulary / facility / terminology). The member view has
 *    NO audit tab (member foundation 2026-11-05) and the user profile showed none either (user foundation
 *    2026-11-08): their `-tab-audit` ids are CONVENTION so a later build that adds the tab is found.
 */

/** The record-type modules the holder cases visit. */
export type HolderModule =
  | 'users'
  | 'invitations'
  | 'payers'
  | 'networks'
  | 'plans'
  | 'policies'
  | 'formularies'
  | 'facilities'
  | 'members';

export interface ModuleScreen {
  /** Name the TCs use. */
  label: string;
  route: string;
  /** Side menu link id. */
  nav: string;
  /** The menu group toggle the link sits in ('' = top level). */
  navGroup: string;
  /** The list screen's id namespace (root id). */
  screen: string;
  /** `<screen>-add-button`. */
  add: string;
  /** `<screen>-export-trigger`. */
  export: string;
  /** Detail route of a record: `<detailRoute>/<id>` ('' = no detail page). */
  detailRoute: string;
  /** Prefix every detail-screen tab id starts with (the detail rendered when one is shown). */
  detailReady: string;
  /** The Audit History tab of the detail screen. */
  auditTab: string;
}

export const MODULE_SCREEN: Record<HolderModule, ModuleScreen> = {
  users: {
    label: 'Users Administration',
    route: '/users-management/users-administration',
    nav: 'app-nav-users-management-users-administration-link', // CONVENTION
    navGroup: 'app-nav-users-management-toggle',
    screen: 'user-list-kpi-total', // no #user-list root exists (smoke 2026-11-14); the Total Users tile always renders
    add: 'user-list-add-button',
    export: 'user-list-export-trigger',
    detailRoute: '/users-management/users-administration/profile',
    detailReady: 'user-profile-section-',
    // CONVENTION - not seen on 2026-11-08; re-probed 2026-11-15 as careconnect (all rights): the profile has NO tabs at
    // all - sections user-profile-section-personal / -contact / -rolesstatus / -record - and no audit / history control.
    auditTab: 'user-profile-tab-audit',
  },
  invitations: {
    label: 'Invitations',
    route: '/users-management/invitations',
    nav: 'app-nav-users-management-invitations-link', // CONVENTION
    navGroup: 'app-nav-users-management-toggle',
    screen: 'invitation-list',
    add: 'invitation-list-add-button',
    export: 'invitation-list-export-trigger',
    detailRoute: '',
    detailReady: '',
    auditTab: '',
  },
  payers: {
    label: 'Payer Administration',
    route: '/payer-management',
    nav: 'app-nav-payer-management-link',
    navGroup: '',
    screen: 'payer-list',
    add: 'payer-list-add-button',
    export: 'payer-list-export-trigger',
    detailRoute: '/payer-management',
    detailReady: 'payer-detail-tab-',
    auditTab: 'payer-detail-tab-audit',
  },
  networks: {
    label: 'Network Management',
    route: '/network-management',
    nav: 'app-nav-network-management-link',
    navGroup: '',
    screen: 'network-list',
    add: 'network-list-add-button',
    export: 'network-list-export-trigger',
    detailRoute: '/network-management',
    detailReady: 'network-detail-tab-',
    auditTab: 'network-detail-tab-audit',
  },
  plans: {
    label: 'Plans Management',
    route: '/plans-management',
    nav: 'app-nav-plans-management-link',
    navGroup: '',
    screen: 'plan-list',
    add: 'plan-list-add-button',
    export: 'plan-list-export-trigger',
    detailRoute: '/plans-management',
    detailReady: 'plan-detail-tab-',
    auditTab: 'plan-detail-tab-audit',
  },
  policies: {
    label: 'Policy Management',
    route: '/policy-management',
    nav: 'app-nav-policy-management-link',
    navGroup: '',
    screen: 'policy-list',
    add: 'policy-list-add-button',
    export: 'policy-list-export-trigger',
    detailRoute: '/policy-management',
    detailReady: 'policy-detail-tab-',
    auditTab: 'policy-detail-tab-audit',
  },
  formularies: {
    label: 'Formulary Management',
    route: '/formulary-pricing',
    nav: 'app-nav-formulary-pricing-link',
    navGroup: '',
    screen: 'formulary-list',
    add: 'formulary-list-add-button',
    export: 'formulary-list-export-trigger',
    detailRoute: '/formulary-pricing',
    detailReady: 'formulary-detail-tab-',
    auditTab: 'formulary-detail-tab-audit',
  },
  facilities: {
    label: 'Facility Management',
    route: '/facility-management',
    nav: 'app-nav-facility-management-link',
    navGroup: '',
    screen: 'facility-list',
    add: 'facility-list-add-button',
    export: 'facility-list-export-trigger',
    detailRoute: '/facility-management',
    detailReady: 'facility-detail-tab-',
    auditTab: 'facility-detail-tab-audit',
  },
  members: {
    label: 'Member Management',
    route: '/member-management',
    nav: 'app-nav-member-management-link',
    navGroup: '',
    screen: 'member-list',
    add: 'member-list-add-button',
    export: 'member-list-export-trigger',
    detailRoute: '/member-management',
    detailReady: 'member-detail-tab-',
    auditTab: 'member-detail-tab-audit', // CONVENTION - the member view has no audit tab (2026-11-05)
  },
};

/** Other screens and chrome the cases read. */
export const WRITER_D_SCREEN = {
  /** Every side menu entry id starts with this; group toggles end with `-toggle` and carry `is-open` when expanded. */
  navPrefix: 'app-nav-',
  navToggleSuffix: '-toggle',
  navOpenClass: 'is-open',
  /** The authenticated header title (rendered on every signed-in screen). */
  headerTitle: 'app-header-title',
  /** The routed page outlet (the home page's welcome card carries no id - read from here). */
  outlet: 'app-layout-outlet',
  /** Integration Portal (API Clients / PBM Engine) - System Administrator only. */
  enginePortal: { route: '/engine-portal', nav: 'app-nav-engine-portal-link', root: 'engine-portal' },
  /** System Settings > Policy Benefit Resets. */
  benefitResets: { route: '/financial-benefits/reset-history', nav: 'app-nav-financial-benefits-reset-history-link', root: 'reset-job-history' },
  /** Approval Management hub. */
  approvals: { route: '/approval-management', nav: 'app-nav-approval-management-link', tabs: 'approvals-hub-tabs' },
  /** System Settings > Audit Logs (the system log; rows `audit-log-list-table-row-<id>`, cells `-cell-entitytype`). */
  auditLogs: { route: '/system-settings/audit-logs', nav: 'app-nav-system-settings-audit-logs-link', screen: 'audit-log-list', rowPrefix: 'audit-log-list-table-row-', entityTypeCellSuffix: '-cell-entitytype' },
  /** Home page. */
  dashboard: { route: '/dashboard', nav: 'app-nav-dashboard-link' },
  /** Member view: the Coverage Ordering (COB) tab and the PBM Accumulator Dashboard tab + its "View full accumulator" button. */
  member: { cobTab: 'member-detail-tab-cob', dashboardTab: 'member-detail-tab-dashboard', viewAccumulator: 'member-detail-dashboard-view-accumulator-button' },
  /** Payer view: the header Edit action (CONVENTION `<detail>-edit-button`). */
  payerEdit: 'payer-detail-edit-button',
} as const;
