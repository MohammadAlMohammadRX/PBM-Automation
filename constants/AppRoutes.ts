/**
 * Centralized application routes (relative to BASE_URL).
 * Keeping these in one place means a URL change only needs one edit, and new
 * modules can be added here without touching existing Page Objects.
 */
export const AppRoutes = {
  login: '/login',
  dashboard: '/dashboard',
  usersAdministration: '/users-management/users-administration',
  invitations: '/users-management/invitations',
  facilityManagement: '/facility-management',
  terminologyManagement: '/terminology-management',
  payerManagement: '/payer-management',
  networkManagement: '/network-management',
  plansManagement: '/plans-management',
  policyManagement: '/policy-management',
  formularyPricing: '/formulary-pricing',
  memberManagement: '/member-management',
  approvalManagement: '/approval-management',
} as const;

export type AppRouteKey = keyof typeof AppRoutes;
