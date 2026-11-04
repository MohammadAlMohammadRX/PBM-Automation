import { BENEFIT_RESETS, POLICY_MEMBERS, POLICY_NETWORKS } from '../ElementIds';

/**
 * Ids Writer C's policy folders (10, 11, 15, 18, 19, 20, 22) need beyond
 * constants/ElementIds.ts. Kept apart so the three writers never edit the same
 * file (reports/policy/Policy-Writers-Brief.md).
 */

/**
 * The Reset history tab of Policy Benefit Resets (`reset-job-history-history`,
 * SCREEN-MAP "Policy Benefit Resets - Reset history"): its search box, and the
 * rows `reset-job-history-table-row-{id}` with the `-kind-badge` (Manual /
 * Anniversary ...) and `-status-badge` (Success / Failed) seen live.
 * The empty state ("No resets have been recorded yet.") carries no id; it is
 * read from the tab's container.
 *
 * 2026-11-04: `reset-job-history-history` is NOT the tab's container - it is the
 * search component's idPrefix (bundle chunk-WD3AXKPK: `idPrefix:
 * "reset-job-history-history"`), a wrapper around the search box whose text is
 * empty, which read "" in the 2026-11-03 run (19681). The table and its empty
 * state carry only classes, so the tab is read from the screen's root section.
 */
export const RESET_HISTORY = {
  container: BENEFIT_RESETS.root,
  search: `${BENEFIT_RESETS.historyPrefix}-input`,
  rowPrefix: 'reset-job-history-table-row-',
  kindBadge: 'kind-badge',
  statusBadge: 'status-badge',
} as const;

/**
 * The System Settings menu entry of Policy Benefit Resets. Its id was not
 * probed; the menu links follow `app-nav-{route}-link` (constants NAV), so the
 * entry is found by an `app-nav-` id that mentions the route's last segment.
 */
export const RESETS_NAV = {
  idPrefix: 'app-nav-',
  idFragment: 'reset-history',
  route: '/financial-benefits/reset-history',
  /**
   * The menu GROUP toggles (`app-nav-{group}-toggle`, e.g. System Settings) -
   * a group's links are rendered only while it is expanded (bundle main
   * `isExpanded(e) ? sublist : nothing`; 2026-11-04), so the entry is looked
   * for after expanding the collapsed groups. The open one has class `is-open`.
   */
  toggleSuffix: '-toggle',
  openClass: 'is-open',
} as const;

/** The Policies in force empty state ("No policy is in force.") - bundle chunk-WD3AXKPK, 2026-11-04. */
export const IN_FORCE_EMPTY = `${BENEFIT_RESETS.root}-policies-empty`;

/**
 * Row "Edit" actions the stories ask for (15177 "Add/Edit/Delete Network
 * Assignment", 15189 "Add/Edit/Delete" for members, networks and documentation)
 * that the screens did NOT render on 2026-11-03 - the ids follow the tabs' own
 * `policy-detail-{verb}-{thing}-button` convention, so a later build that adds
 * them is found without a code change. Their absence is what the permission
 * cases' "edit" steps read.
 */
export const ROW_EDIT = {
  member: 'policy-detail-edit-member-button',
  network: 'policy-detail-edit-network-button',
  document: 'policy-detail-edit-endorsement-button',
} as const;

/** The detail tabs' applied-filter chips (`{screen}-filter-chips-chip-{key}` with a `-remove` button) and the search clear button. */
export const TAB_FILTER = {
  members: { chips: POLICY_MEMBERS.chips, clear: 'policy-detail-members-search-clear-button' },
  networks: { chips: POLICY_NETWORKS.chips, clear: 'policy-detail-networks-search-clear-button' },
} as const;

/**
 * A "Reload" control after a concurrent-edit conflict (US 15186 "Prompt the
 * user to reload the policy"). Live 2026-11-03 the second window showed only
 * the toast "The policy was not saved" - no prompt, no button (SCREEN-MAP
 * "Concurrent edit - second window after the 409"). A control whose id
 * mentions "reload" is what the cases look for.
 */
export const CONFLICT_RELOAD = {
  idFragment: 'reload',
} as const;
