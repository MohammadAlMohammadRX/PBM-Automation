import type { SortDirection } from '../../utils/SortUtils';

export type { SortDirection };

/**
 * Test data for the user story: Sort Payer List by Column Headers.
 *
 * Verified against the live application:
 *   - Sorting is driven by a single "Sort By" menu in the list toolbar
 *     (`div.pbm-sort`). The table's column headers are plain text - they carry
 *     no `aria-sort` and are not clickable - so the menu IS the sort control and
 *     its checked item IS the sort indicator.
 *   - The menu lists exactly 7 columns x 2 directions = 14 radio items, in the
 *     fixed order below, each labelled with a direction suffix.
 *   - Selecting an item re-queries the list server-side and marks that item
 *     `aria-checked="true"`; the trigger keeps reading "Sort By".
 */

export type SortColumnKey =
  | 'payerName'
  | 'payerType'
  | 'code'
  | 'licenseNumber'
  | 'email'
  | 'phone'
  | 'status';

/**
 * How a column's order is verified.
 *   `alphabetical` - the displayed text must be in collation order.
 *   `grouped`      - the application orders by an internal value rather than by
 *                    the displayed label, so the requirement ("ascending
 *                    (defined) order") is checked as: equal labels stay in one
 *                    contiguous block and the two directions disagree.
 */
export type SortComparison = 'alphabetical' | 'grouped';

export interface SortColumnSpec {
  key: SortColumnKey;
  /** Position of this column's asc/desc pair in the Sort By menu (0-based). */
  menuOrder: number;
  /** Zero-based `td` index of the column in the list table. */
  columnIndex: number;
  /** English table header, for readable assertion messages. */
  header: string;
  /** Menu label WITHOUT the direction suffix, per UI language. */
  label: { en: string; ar: string };
  comparison: SortComparison;
}

/** The direction suffix the menu appends to every column label. */
export const DIRECTION_SUFFIX: Record<SortDirection, { en: string; ar: string }> = {
  asc: { en: '(A-Z)', ar: '(أ - ي)' },
  desc: { en: '(Z-A)', ar: '(ي - أ)' },
};

export const SORT_DIRECTIONS: readonly SortDirection[] = ['asc', 'desc'];

/**
 * The seven sortable columns, in the exact order the Sort By menu lists them.
 * `menuOrder` is what the Page Object clicks by, so selecting an option is
 * language-independent - which is what lets the Arabic run reuse these tests.
 */
export const SORTABLE_COLUMNS: readonly SortColumnSpec[] = [
  {
    key: 'payerName',
    menuOrder: 0,
    columnIndex: 0,
    header: 'Payer Name',
    label: { en: 'Payer Name', ar: 'اسم جهة التغطية (Payer Name)' },
    comparison: 'alphabetical',
  },
  {
    key: 'payerType',
    menuOrder: 1,
    columnIndex: 1,
    header: 'Payer Type',
    label: { en: 'Payer Type', ar: 'نوع جهة التغطية' },
    comparison: 'alphabetical',
  },
  {
    key: 'code',
    menuOrder: 2,
    columnIndex: 2,
    header: 'Code',
    label: { en: 'Code', ar: 'الرمز' },
    comparison: 'alphabetical',
  },
  {
    key: 'licenseNumber',
    menuOrder: 3,
    columnIndex: 5,
    header: 'License Number',
    label: { en: 'License Number', ar: 'رقم الترخيص' },
    comparison: 'alphabetical',
  },
  {
    key: 'email',
    menuOrder: 4,
    columnIndex: 6,
    header: 'Email Address',
    label: { en: 'Email Address', ar: 'البريد الإلكتروني' },
    comparison: 'alphabetical',
  },
  {
    key: 'phone',
    menuOrder: 5,
    columnIndex: 7,
    header: 'Phone Number',
    label: { en: 'Phone Number', ar: 'رقم الهاتف' },
    comparison: 'alphabetical',
  },
  {
    key: 'status',
    menuOrder: 6,
    columnIndex: 8,
    header: 'Status',
    // The Status column is ordered by the underlying lifecycle code, not by the
    // rendered label, so it is asserted as grouped rather than alphabetical.
    label: { en: 'Status', ar: 'الحالة' },
    comparison: 'grouped',
  },
];

export function sortColumn(key: SortColumnKey): SortColumnSpec {
  const column = SORTABLE_COLUMNS.find((candidate) => candidate.key === key);
  if (!column) throw new Error(`[sortPayer.data] Unknown sortable column "${key}"`);
  return column;
}

/** The localized Sort By menu label for a column/direction pair. */
export function sortOptionLabel(
  key: SortColumnKey,
  direction: SortDirection,
  language: 'en' | 'ar' = 'en',
): string {
  return `${sortColumn(key).label[language]} ${DIRECTION_SUFFIX[direction][language]}`;
}

/** Label of the menu trigger and of its group heading, per UI language. */
export const SORT_TRIGGER_LABEL = { en: 'Sort By', ar: 'ترتيب حسب' } as const;

/** 7 columns x 2 directions - the menu must offer exactly this many options. */
export const SORT_MENU_OPTION_COUNT = SORTABLE_COLUMNS.length * SORT_DIRECTIONS.length;

export interface SortSelection {
  column: SortColumnKey;
  direction: SortDirection;
}

/** The sort the list applies on load, with no selection made in the session. */
export const DEFAULT_SORT: SortSelection = { column: 'payerName', direction: 'asc' };

/** TC-038: every column/direction combination, in menu order. */
export const SORT_MATRIX: readonly SortSelection[] = SORTABLE_COLUMNS.flatMap((column) =>
  SORT_DIRECTIONS.map((direction) => ({ column: column.key, direction })),
);

/** TC-039: the state-transition sequence, ending back at the default. */
export const SORT_TRANSITIONS: readonly (SortSelection & { step: string })[] = [
  { step: 'default state', column: 'payerName', direction: 'asc' },
  { step: 'transition 1', column: 'payerType', direction: 'asc' },
  { step: 'transition 2', column: 'code', direction: 'desc' },
  { step: 'back to default', column: 'payerName', direction: 'asc' },
];

/** TC-040: the sorts applied to a single-record result set. */
export const SINGLE_RECORD_SORTS: readonly SortSelection[] = [
  { column: 'payerName', direction: 'desc' },
  { column: 'status', direction: 'asc' },
  { column: 'licenseNumber', direction: 'desc' },
];

/**
 * TC-042: columns checked for blank/null handling. Email and Phone are the
 * columns the test case names; Code is included because it is the column that
 * actually carries blank values in this data set (a Payer Code is only issued
 * once a payer is published), so the blank-placement rule is really exercised.
 */
export const BLANK_VALUE_COLUMNS: readonly SortColumnKey[] = ['email', 'phone', 'code'];

/** TC-043: the filter + search + sort combination applied together. */
export const COMBINED_CONTEXT = {
  type: 'Private',
  status: 'Active',
  sort: { column: 'code', direction: 'desc' } as SortSelection,
} as const;
