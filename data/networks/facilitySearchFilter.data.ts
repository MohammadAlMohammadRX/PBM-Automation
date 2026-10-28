import { ALL_FACILITY_CODES, FACILITY, dayFromToday, today } from './facilities.data';

/**
 * Test data for US 14306 "Search and filter the assigned facilities list".
 *
 * The tab's keyword box ("Search facilities") and its advanced search
 * (verified 2026-10-21: criteria `searchtext`, `facilitystatusid`, and ONE
 * date-range criterion `assignedon`; Cancel and Search buttons). The sheet's
 * "Sunrise Pharmacy" is played by the environment's facilities, and its fixed
 * dates (2026-09-15 ...) by TODAY: a case's own network is approved today, so
 * today is its facilities' Assigned On date.
 */
export const CASE = {
  keyword: '18085',
  keywordClasses: '18086',
  dateBoundaries: '18087',
  statusDateTable: '18088',
  transitions: '18089',
  injection: '18090',
  exploreCombined: '18091',
  checklist: '18093',
  invalidRange: '18092',
  emptyKeyword: '18094',
  statusValues: '18095',
  roleAccess: '18096',
  reflectsCurrent: '18097',
  scopedToNetwork: '18098',
} as const;

export const ALL = ALL_FACILITY_CODES;

/** Keyword classes over the three facilities' names. */
export const KEYWORD = {
  /** "Sunrise" -> "Sunrise Pharmacy": a word of one facility's name. */
  single: { term: 'Nathe', expected: [FACILITY.pharmacyC.code] },
  exact: { term: FACILITY.pharmacyA.name, expected: [FACILITY.pharmacyA.code] },
  /** A substring several names contain: the two "QA Automation Pharmac-y" records, not "Nathealth". */
  partial: { term: 'y', expected: [FACILITY.pharmacyB.code, FACILITY.pharmacyA.code] },
  none: { term: 'Xyzzy123', expected: [] as string[] },
} as const;

/** Assigned-on ranges around today (DD/MM/YYYY). */
export const RANGE = {
  exactDay: { from: today(), to: today() },
  startsAfter: { from: dayFromToday(1), to: dayFromToday(15) },
  endsBefore: { from: dayFromToday(-14), to: dayFromToday(-1) },
  lastMonth: { from: dayFromToday(-40), to: dayFromToday(-30) },
  /** From after To (18092): ten days ahead -> today. */
  reversed: { from: dayFromToday(9), to: today() },
} as const;

export const FACILITY_STATUS = { active: 'Active', inactive: 'Inactive', pending: 'Pending' } as const;

/** The predefined status values the filter must offer (and nothing else). */
export const STATUS_VALUES = [FACILITY_STATUS.active, FACILITY_STATUS.inactive, FACILITY_STATUS.pending] as const;

/** Hostile keyword inputs (18090). */
export const HOSTILE_KEYWORDS = ["' OR '1'='1", '<script>alert(1)</script>', '%%%'] as const;

/** The advanced-search criteria the checklist requires, by field key. */
export const CHECKLIST_KEYS = ['facilitystatusid', 'assignedon'] as const;

/** The two networks of the scoping case and the facility only B holds. */
export const SCOPING = {
  networkA: [FACILITY.pharmacyC.code],
  networkB: [FACILITY.pharmacyA.code],
  term: FACILITY.pharmacyA.name,
} as const;

/** A validation message for a reversed range. */
export const INVALID_RANGE = /from|before|after|range|invalid/i;
