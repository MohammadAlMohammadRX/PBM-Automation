import type { NetworkBlockedCase } from './network.data';

/**
 * Test data for US 14139 "View network audit history".
 *
 * Verified on the live tab (2026-10-21): a timeline of entries reading
 * "{action} {DD/MM/YYYY hh:mm AM|PM} By: {actor}", a View Details drawer with
 * Field / Before / After rows, a search box "Search by user or item", and an
 * advanced search with criteria actiontype, actorlabel and daterange. A
 * never-submitted draft showed NO entries at all.
 *
 * Every network is the case's own; its history is built through the API
 * (fixtures `publishEdit`, `publishFacilityChange`) or driven on screen when
 * the action itself is the case's subject.
 */

export const CASE = {
  eventList: '17983',
  noPermission: '17984',
  lifecycleSequence: '17987',
  actionTypeOnly: '17995',
  statusChange: '17994',
} as const;

/** The action types the sheet names, as the tab labels them. */
export const ACTION = {
  create: 'Create',
  update: 'Update',
  statusChange: 'Status Change',
  delete: 'Delete',
} as const;

/** The status change 17994 makes, as the drawer's before/after should read. */
export const STATUS_CHANGE = { field: /status/i, before: 'Active', after: 'Inactive' } as const;

/**
 * Whether `expected` (oldest first) occurs in that order within the timeline's
 * actions (newest first, as the tab lists them).
 */
export const appearsInOrder = (newestFirst: readonly string[], expected: readonly string[]): boolean => {
  const oldestFirst = [...newestFirst].reverse();
  let from = 0;
  for (const action of expected) {
    const at = oldestFirst.indexOf(action, from);
    if (at < 0) return false;
    from = at + 1;
  }
  return true;
};

export const BLOCKED_CASES: NetworkBlockedCase[] = [
  {
    azureId: '17990',
    title: 'should keep the whole history reachable and the tab stable when a network has hundreds of audit events',
    reason:
      'Needs a network with several hundred recorded audit events accumulated over time. No network in this environment has '
      + 'more than a handful, and building hundreds through the approval workflow (each event is an edit plus a checker '
      + 'approval) would take hours of a shared environment. Unblocked by a seeded high-volume network.',
  },
];
