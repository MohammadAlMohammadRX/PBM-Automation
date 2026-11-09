/**
 * Writer E (User Management folders 14, 16, 19) - the few ids the foundation's
 * `userIds.ts` does not carry. Verified in the foundation's id dumps of
 * 2026-11-08 (`reports/user/probe/foundation-2026-11-08/p6-user-menu.ids.txt`).
 */
export const WRITER_E = {
  /** The authenticated header (absent on the sign-in / reset screens). */
  appHeader: 'app-header',
  /** Side menu "Dashboard" link - an in-app action that calls the API (the "next user action" of the session cases). */
  navDashboardLink: 'app-nav-dashboard-link',
  /** Each line of the reset screen's live checklist is `reset-password-requirements-rule-{rule}` (class `is-met` when met). */
  resetRulePrefix: 'reset-password-requirements-rule-',
} as const;
