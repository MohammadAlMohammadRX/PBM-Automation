import { RandomDataUtils } from '../../utils/RandomDataUtils';

/**
 * Test data for the user story: Filter Payer List by Type and Status.
 *
 * Option labels are exactly what the live filter dropdowns offer, so the tests
 * never guess a value that does not exist.
 */

/** Payer Type filter options, in the order the dropdown lists them. */
export const TYPE_FILTER_OPTIONS = ['All Types', 'Government', 'Private'] as const;
export type TypeFilterOption = (typeof TYPE_FILTER_OPTIONS)[number];

/** Status filter options, in the order the dropdown lists them. */
export const STATUS_FILTER_OPTIONS = [
  'All Statuses',
  'Pending',
  'Active',
  'Inactive',
  'Expired',
] as const;
export type StatusFilterOption = (typeof STATUS_FILTER_OPTIONS)[number];

/** The neutral ("show everything") selection for each filter. */
export const ALL_TYPES: TypeFilterOption = 'All Types';
export const ALL_STATUSES: StatusFilterOption = 'All Statuses';

/**
 * Boundary values for TC-006: the first and the last selectable status,
 * excluding the neutral "All Statuses" entry.
 */
export const FIRST_STATUS_OPTION: StatusFilterOption = 'Pending';
export const LAST_STATUS_OPTION: StatusFilterOption = 'Expired';

export interface StatusBoundaryCase {
  id: string;
  position: string;
  status: StatusFilterOption;
}

export const STATUS_BOUNDARY_CASES: readonly StatusBoundaryCase[] = [
  { id: 'first-option', position: 'first', status: FIRST_STATUS_OPTION },
  { id: 'last-option', position: 'last', status: LAST_STATUS_OPTION },
] as const;

/** Decision-table combinations for TC-004 (filters must apply as AND, not OR). */
export interface FilterCombination {
  id: string;
  type: TypeFilterOption;
  status: StatusFilterOption;
}

export const FILTER_COMBINATIONS: readonly FilterCombination[] = [
  { id: 'private-active', type: 'Private', status: 'Active' },
  { id: 'government-pending', type: 'Government', status: 'Pending' },
  { id: 'private-expired', type: 'Private', status: 'Expired' },
  { id: 'government-inactive', type: 'Government', status: 'Inactive' },
] as const;

/**
 * A combination with no matching records (TC-009). The payer list reports zero
 * Expired payers, so pairing Expired with either type yields an empty result.
 */
export const EMPTY_RESULT_COMBINATION: FilterCombination = {
  id: 'government-expired',
  type: 'Government',
  status: 'Expired',
};

/** Text the list shows when a filter matches nothing. */
export const EMPTY_STATE_TEXT = 'No results found.';

/** Filter sequence exercised by the state-transition test (TC-007). */
export const TYPE_TRANSITION_SEQUENCE: readonly TypeFilterOption[] = [
  'Private',
  'Government',
  'All Types',
] as const;

/**
 * Unsupported filter values pushed in through the URL (TC-013). The application
 * does not put filters in the query string, so these are simply invalid
 * parameters that must not break the page or leak unfiltered data.
 */
export const INVALID_URL_FILTERS = 'payerType=NonProfit&status=Unknown';

// ---- Configurable Payer Type (TC-010) --------------------------------------

/** The lookup category that backs the Payer Type filter. */
export const PAYER_TYPE_LOOKUP = 'payerType';

/** A new, uniquely named Payer Type added through lookup administration. */
export interface LookupItemData {
  code: string;
  nameEn: string;
  nameAr: string;
  displayOrder: string;
}

export function buildPayerTypeLookupItem(): LookupItemData {
  const suffix = RandomDataUtils.uniqueSuffix();
  return {
    code: `semiGov${suffix}`,
    nameEn: `Semi-Government ${suffix}`,
    nameAr: 'شبه حكومي',
    displayOrder: '3',
  };
}
