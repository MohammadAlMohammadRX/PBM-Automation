import { toDisplayDate, type NetworkBlockedCase } from './network.data';

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
  dateBoundaries: '17985',
  filterMatrix: '17986',
  lifecycleSequence: '17987',
  complianceReview: '17989',
  invalidRange: '17988',
  pdplChecklist: '17991',
  facilityEvents: '17993',
  actionTypeOnly: '17995',
  newNetwork: '17992',
  statusChange: '17994',
} as const;

/** The action types the sheet names, as the tab labels them. */
export const ACTION = {
  create: 'Create',
  update: 'Update',
  statusChange: 'Status Change',
  delete: 'Delete',
  facilityAssigned: 'Facility Assigned',
  facilityUnassigned: 'Facility Unassigned',
} as const;

export const ALL_ACTIONS: readonly string[] = Object.values(ACTION);

/** An entry's timestamp as the timeline prints it. */
export const ENTRY_TIME_PATTERN = /^\d{2}\/\d{2}\/\d{4} \d{1,2}:\d{2}\s?(AM|PM)$/i;

/** DD/MM/YYYY for today plus `days`. */
export const auditDay = (days = 0): string => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return toDisplayDate(date);
};

/** The day part of an entry's timestamp. */
export const entryDay = (when: string): string => when.slice(0, 10);

/** What an inverted date range should be told (17985 / 17988). */
export const INVALID_RANGE_MESSAGE = /invalid|before|after|earlier|later|range/i;

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
