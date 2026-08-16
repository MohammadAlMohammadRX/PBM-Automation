/**
 * Centralized application routes (relative to BASE_URL).
 * Keeping these in one place means a URL change only needs one edit, and new
 * modules can be added here without touching any Page Object.
 *
 * Add one entry per new module as its Page Object is built - never hardcode a
 * path string inside a Page Object or test.
 */
export const AppRoutes = {
  login: '/login',
  dashboard: '/dashboard',
  payerManagement: '/payer-management',
  approvalManagement: '/approval-management',
} as const;

export type AppRouteKey = keyof typeof AppRoutes;
