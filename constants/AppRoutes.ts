/**
 * Relative application routes.
 *
 * Every navigation goes through a key here rather than a literal path string,
 * so a route change is one edit. Paths are relative - BasePage.goto() resolves
 * them against BASE_URL from .env.
 */
export const AppRoutes = {
  login: '/login',
  dashboard: '/dashboard',
  payerManagement: '/payer-management',
  approvalManagement: '/approval-management',
  lookupManagement: '/system-settings/lookup-management',

  /**
   * The permission catalogue lives here, not under the payer module: payer
   * permissions are defined on a ROLE, so the bilingual-permission-names story
   * reads them from Role Administration.
   */
  roleAdministration: '/system-settings/role-administration',

  /**
   * Consuming modules of the shared payer selection interface. They are
   * navigated to only to open THEIR payer dropdown - the cross-module story is
   * about what that dropdown returns, not about plans or networks.
   */
  planManagement: '/plans-management',
  networkManagement: '/network-management',

  /**
   * The Policies module. Reached by the cascade story, which has to see whether
   * a payer's inactivation carried its policies with it.
   */
  policyManagement: '/policy-management',

  /**
   * System Settings > Settings. Owns the three lifecycle job schedules (network,
   * payer, policy) as CRON expressions in UTC, edited through one drawer -
   * which is where the payer lifecycle-schedule story lives.
   */
  systemSettings: '/system-settings/settings',

  /**
   * System Settings > Audit Logs - the system-wide log (time, action, entity
   * type, entity id, actor). Read by the stories that ask whether an action
   * left an audit record outside the payer's own Audit History tab.
   */
  auditLogs: '/system-settings/audit-logs',

  // ---- plan folder 27 additions (2026-10-27) ----
  /** Formulary Mgmt - the list; a formulary's detail is `/formulary-pricing/{id}`. */
  formularyManagement: '/formulary-pricing',

  // ---- Policy module additions (2026-11-03) ----

  /** System Settings > Policy Benefit Resets: Policies in force / Reset history (fin.resetJob). */
  policyBenefitResets: '/financial-benefits/reset-history',
  /** A policy member's Member Benefit Accumulator: `/financial-benefits/accumulator/{policyMemberId}`. */
  memberAccumulator: '/financial-benefits/accumulator',

  // ---- Facility module (Feature 15130, 2026-11-04) ----
  /** Facility Mgmt - the list; a facility's detail is `/facility-management/{id}`. */
  facilityManagement: '/facility-management',

  // ---- Member module (Feature 14375, 2026-11-05) ----
  /** Member Mgmt - the list; a member's view page is `/member-management/{id}` (tabs, no route per tab). */
  memberManagement: '/member-management',
  /** The Integration Portal (nav `app-nav-engine-portal-link`): its Simulator is READ-ONLY (nothing is posted). */
  enginePortal: '/engine-portal',

  // ---- User Management module (Feature 12972, 2026-11-08) ----
  /** Users Mgmt > Users Administration - the list; a user's profile is `/users-management/users-administration/profile/{id}`. */
  usersAdministration: '/users-management/users-administration',
  /** Users Mgmt > Invitations. */
  invitations: '/users-management/invitations',
  /** The signed-in user's own profile (header user menu > My Profile). */
  myProfile: '/my-profile',
  /** Unauthenticated: step 1 (e-mail), or step 2 with `?email=&code=` from the reset link. */
  resetPassword: '/reset-password',
  /** Unauthenticated: the invitation registration page (`?token=`) - story 20422 is MANUAL, never automated. */
  acceptInvitation: '/accept-invitation',
  /** Approval Management on its Registrations tab (the invitations list's "Approvals List (N)"). */
  invitationApprovals: '/approval-management?tab=invitation',

  // ---- Terminology module (2026-10-29) ----
  /** Terminology Mgmt - the list; a terminology's detail is `/terminology-management/{id}`. */
  terminologyManagement: '/terminology-management',
} as const;

export type AppRouteKey = keyof typeof AppRoutes;
