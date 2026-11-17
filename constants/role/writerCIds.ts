import { AppRoutes } from '../AppRoutes';
import { ApiEndpoints } from '../ApiEndpoints';

/**
 * Writer C ids - Role Management folders 02 (System Administrator Role, US 21281), 12 (Prevent Changes to
 * Predefined and System Roles, US 21291), 13 (Activate and Deactivate Role, US 21293), 14 (Delete Role, US 21294).
 * The role screen's own ids are the lead's (constants/role/roleIds.ts); these are the OTHER screens the cases
 * visit. Verified sources are named per id; anything inferred says so.
 */

/** The side menu (verified in tests/role/00-foundation FND-005 and the earlier modules). */
export const WRITER_C_NAV = {
  usersManagementToggle: 'app-nav-users-management-toggle',
  systemSettingsToggle: 'app-nav-system-settings-toggle',
} as const;

/**
 * The home page (`/dashboard`) - verified in the member / facility probes (2026-11-05): the welcome card is
 * `section#dashboard-welcome` (+ `-title`, `-lead`, `-body`) inside the routed outlet `main#app-layout-outlet`.
 * Every OTHER id rendered inside the outlet counts as a dashboard widget.
 */
export const WRITER_C_HOME = {
  route: AppRoutes.dashboard,
  outlet: 'app-layout-outlet',
  welcomeCard: 'dashboard-welcome',
  /** Ids starting with this belong to the welcome card. */
  welcomePrefix: 'dashboard-welcome',
  /** Dashboard API calls (Dashboard.* permissions) - `/api/Dashboard/<Get...>`. */
  dashboardApi: '/api/Dashboard/',
} as const;

/**
 * Users Administration has NO bulk action (User foundation 2026-11-08: only Selected Export). A bulk
 * inactivate / delete control, if one is ever added, is expected to carry "bulk" in its id - INFERRED.
 */
export const WRITER_C_USERS = {
  root: 'user-list',
  bulkIdFragment: 'bulk',
} as const;

/**
 * Detail screens that carry an "Audit History" tab (ids from constants/ElementIds.ts / facility ids, verified by
 * those modules): the module's list call (to find a record the session can see), the detail route prefix, the
 * tab-strip id prefix (proves the detail rendered) and the Audit History tab id.
 */
export interface AuditTabModule {
  module: string;
  listCall: string;
  detailRoute: string;
  tabPrefix: string;
  auditTab: string;
}

export const WRITER_C_AUDIT_MODULES: readonly AuditTabModule[] = [
  { module: 'Networks', listCall: ApiEndpoints.networkList, detailRoute: AppRoutes.networkManagement, tabPrefix: 'network-detail-tab-', auditTab: 'network-detail-tab-audit' },
  { module: 'Plans', listCall: ApiEndpoints.planList, detailRoute: AppRoutes.planManagement, tabPrefix: 'plan-detail-tab-', auditTab: 'plan-detail-tab-audit' },
  { module: 'Policies', listCall: ApiEndpoints.policyList, detailRoute: AppRoutes.policyManagement, tabPrefix: 'policy-detail-tab-', auditTab: 'policy-detail-tab-audit' },
  { module: 'Formularies', listCall: ApiEndpoints.formularyList, detailRoute: AppRoutes.formularyManagement, tabPrefix: 'formulary-detail-tab-', auditTab: 'formulary-detail-tab-audit' },
  { module: 'Payers', listCall: ApiEndpoints.payerList, detailRoute: AppRoutes.payerManagement, tabPrefix: 'payer-detail-tab-', auditTab: 'payer-detail-tab-audit' },
] as const;
