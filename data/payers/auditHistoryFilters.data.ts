import { nonAdminBlockReason } from '../accounts/nonAdminAccount.data';
import type { BlockedCase } from './payerTypes';

/**
 * Test data for "Display Payer Audit History with Filters".
 *
 * VERIFIED live, and it corrects an assumption two other stories carried: the
 * payer's Audit History tab DOES record approved status transitions, as
 * "Status Change" entries, and offers an Action Type filter and a date-range
 * picker that both re-query the server. Each entry is one line - action,
 * timestamp, "By: user" - and a View Details drawer holds the field / before /
 * after diff the sheet asks for.
 *
 * TWO EXPECTATIONS ARE ASSERTED AS WRITTEN AND EXPECTED TO REPORT: a filter
 * that matches nothing renders "No audit history yet." - the same wording as a
 * payer with no history at all, which the sheet asks to be distinguishable;
 * and the date input accepts typed text without applying it, so an invalid
 * typed range produces no validation message (and, correctly, no query).
 */

/** The Action Type filter's options, as labelled. */
export const ACTION = {
  all: 'All Actions',
  create: 'Create',
  update: 'Update',
  statusChange: 'Status Change',
  networkAssigned: 'Network Assigned',
  networkUnassigned: 'Network Unassigned',
} as const;

export const ACTION_OPTIONS = Object.values(ACTION);

/** The empty state the tab renders when nothing is listed. */
export const EMPTY_HISTORY_TEXT = /no audit history yet/i;

/** What an empty FILTER result should say instead - that nothing matched. */
export const NO_MATCH_MESSAGE = /no (matching|audit entries|entries|results)/i;

/** An entry's timestamp as rendered. */
export const TIMESTAMP_PATTERN = /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2} (AM|PM)$/;

/** Parses "12/09/2026 03:45 PM" into a Date. */
export const parseEntryTimestamp = (text: string): Date => {
  const match = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}) (AM|PM)$/.exec(text.trim());
  if (!match) return new Date(NaN);
  const [, d, mo, y, hh, mi, ampm] = match;
  let hours = Number(hh) % 12;
  if (ampm === 'PM') hours += 12;
  return new Date(Number(y), Number(mo) - 1, Number(d), hours, Number(mi));
};

/** The diff a status transition must show. */
export const STATUS_TRANSITION_DIFF = {
  field: /status/i,
  before: 'Active',
  after: 'Inactive',
} as const;

/** The field edited to give the trail an Update entry. */
export const AUDIT_EDIT = {
  label: 'License Number',
  value: 'LIC-AUDIT-UPD',
} as const;

/** The only action an immutable entry may offer. */
export const ENTRY_ONLY_ACTION = 'view-details';

/** Control ids an immutable entry drawer must not carry. */
export const MUTATING_CONTROL = /edit|delete|remove|save/i;

/** The account the access-control case needs. */
export const AUDIT_ROLE_REQUIREMENT = {
  role: 'a role without View Payer Audit History',
  reason: 'The case proves the tab is withheld from a role without the permission; the shared administrator cannot show the refusal.',
} as const;

/** The sheet's cases this environment cannot exercise, in renumbered order. */
export const BLOCKED_CASES: readonly BlockedCase[] = [
  {
    id: '013',
    title: 'should deny the Payer Audit History to a user without audit-view permission',
    reason: `${nonAdminBlockReason({ lacking: ['viewAuditHistory'] })} ${AUDIT_ROLE_REQUIREMENT.reason}`,
  },
  {
    id: '015',
    title: 'should behave consistently across filters, sorting and display in an exploratory session',
    reason: 'An exploratory session over a payer with a rich change history is a manual activity; the deterministic filter, order and drawer checks are the cases here.',
  },
];
