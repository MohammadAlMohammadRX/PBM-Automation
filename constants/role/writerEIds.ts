/**
 * Writer E (Role Management folders 05 Restrict Who Can Assign Each Role, 06 Prevent Self-Approval of Change
 * Requests) - the few ids the shared role / user / approval page objects do not already name.
 *
 * The left-hand menu follows `app-nav-{route}-link` / `app-nav-{group}-toggle` (foundation FND-005 used
 * `app-nav-users-management-toggle` and `app-nav-plans-management-link`). The Users Mgmt group's children
 * (Users Administration, Invitations) are only rendered while the group is open, so "the menus are hidden" is
 * read as: NO element whose id starts with the group prefix exists.
 */
export const WRITER_E_NAV = {
  /** Always rendered for a signed-in session - proves the menu itself has rendered before an absence is read. */
  dashboardLink: 'app-nav-dashboard-link',
  /** Every left-menu entry id starts with this. A Payer Officer may lack the Dashboard entry (smoke 2026-11-14),
   *  so "the menu rendered" is read as: at least one menu link / group toggle is visible. */
  navPrefix: 'app-nav-',
  /** The Users Mgmt group toggle (Users Administration + Invitations live under it). */
  usersGroupToggle: 'app-nav-users-management-toggle',
  /** Every id of the Users Mgmt group (toggle, children links) starts with this. */
  usersGroupPrefix: 'app-nav-users-management',
} as const;
