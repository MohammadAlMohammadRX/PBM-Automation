import type { NetworkBlockedCase } from './network.data';
import { ALL_FACILITY_CODES, FACILITY } from './facilities.data';

/**
 * Test data for US 14133 "View assigned facilities for a network".
 *
 * The Facility Assignment tab (verified 2026-10-21) shows Facility Name, Code,
 * Status (the facility's own), Assigned On, Assignment (the change state) and
 * Actions (Remove), and its tab label carries the count: "Facility Assignment
 * (2)". The "Facility Directory count" the sheet compares against is the
 * network list's Facilities column, which reports the PUBLISHED version - so
 * the count cases run on approved networks.
 *
 * "Many" facilities is the environment's maximum, three: it offers no more.
 */
export const CASE = {
  displaysRow: '17933',
  countClasses: '17934',
  pendingToActive: '17937',
  removeUpdatesCount: '17938',
  exploreSortFilter: '17939',
  checklist: '17941',
  integrity: '17940',
  removeBlocked: '17942',
  coordinatorRemoves: '17943',
  emptyState: '17944',
} as const;

/** The facility a single-facility network holds (the sheet's "Riverside Pharmacy"). */
export const SHOWN = FACILITY.pharmacyC;

/** A second facility, for the two-facility networks. */
export const SECOND = FACILITY.pharmacyB;

/** The "many" class: every facility the environment has. */
export const MANY = ALL_FACILITY_CODES;

/** Required columns, matched by meaning (the sheet says "Facility Code", the table "Code"). */
export const REQUIRED_COLUMNS = [/facility name/i, /code/i, /status|assignment/i] as const;

/** Columns the exploratory case sorts by. */
export const SORTABLE_HEADERS = ['Facility Name', 'Code', 'Status'] as const;

export const BLOCKED_CASES: NetworkBlockedCase[] = [
  {
    azureId: '17935',
    title: 'should render every row and count correctly when a network holds 0, 1 and the system maximum of facilities',
    reason:
      'The maximum-count boundary (the sheet gives 500) needs that many facilities; the environment offers three '
      + '(FCL-000009 and FCL-000025/26/27 on 2026-10-24). The 0 and 1 boundaries run in 17934 and 17944. Seed facilities up to the '
      + 'configured maximum to unblock.',
  },
  {
    azureId: '17936',
    title: 'should show each facility status as Active, Inactive or Pending with its indicator when a network holds facilities in all three',
    reason:
      'Needs a network whose members include an Inactive facility and a Pending facility (facility statuses). The three '
      + 'shared facilities cannot be deactivated or set Pending without breaking every other network and payer suite. '
      + 'Provide disposable facilities in the Inactive and Pending statuses, assigned to a network, to unblock.',
  },
];
