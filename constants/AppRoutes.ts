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
   * Consuming modules of the shared payer selection interface. They are
   * navigated to only to open THEIR payer dropdown - the cross-module story is
   * about what that dropdown returns, not about plans or networks.
   */
  planManagement: '/plans-management',
  networkManagement: '/network-management',
} as const;

export type AppRouteKey = keyof typeof AppRoutes;
