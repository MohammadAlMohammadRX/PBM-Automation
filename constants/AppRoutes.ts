/**
 * Centralized application routes (relative to BASE_URL).
 * Keeping these in one place means a URL change only needs one edit, and new
 * modules can be added here without touching any Page Object.
 *
 * Only universal routes are pre-populated. Add one entry per new module as
 * its Page Object is built (e.g. `payerManagement: '/payer-management'`) -
 * never hardcode a path string inside a Page Object or test.
 */
export const AppRoutes = {
  login: '/login',
  dashboard: '/dashboard',
} as const;

export type AppRouteKey = keyof typeof AppRoutes;
