import type { StatusFilterOption } from './filterPayer.data';

/**
 * Test data for the user story: View Paginated Payer List with Metrics.
 *
 * Verified against the live application:
 *   - The list table renders ELEVEN columns, not the six the acceptance
 *     criteria enumerate: the six required ones plus Networks, Members,
 *     Approval Status and an Actions column. The required six are therefore
 *     asserted as a SUBSET - demanding an exact set would fail on columns the
 *     application legitimately adds.
 *   - The five counters are `payer-list-kpi-{metric}-value`, and Total does not
 *     equal the sum of the four status counts (see PayerMetricsPanel for why).
 *   - The pager offers Previous / page numbers / Next only. There is NO page
 *     size selector and NO "go to page" input anywhere in the table footer -
 *     see PAGE_SIZE_CONTROL_EXPECTED below.
 */

/** The five dashboard counters, as read from the UI. */
export interface PayerMetrics {
  total: number;
  active: number;
  pending: number;
  inactive: number;
  expired: number;
}

export type PayerMetricKey = keyof PayerMetrics;

/**
 * Counter captions per UI language, so the bilingual checklist case can assert
 * each counter is LABELLED rather than merely present.
 */
export const METRIC_LABELS: Record<'en' | 'ar', Record<PayerMetricKey, string>> = {
  en: {
    total: 'Total Payers',
    active: 'Active Payers',
    pending: 'Pending Payers',
    inactive: 'Inactive Payers',
    expired: 'Expired Payers',
  },
  ar: {
    total: 'إجمالي جهات التغطية',
    active: 'جهات التغطية النشطة',
    pending: 'الجهات قيد الانتظار',
    inactive: 'الجهات غير النشطة',
    expired: 'الجهات منتهية الصلاحية',
  },
};

/**
 * The columns the acceptance criteria require, as the model-property keys the
 * table's header ids are built from. Asserted as a subset of what the table
 * renders - see the file header.
 */
export const REQUIRED_COLUMN_KEYS = [
  'payernameen',
  'payercode',
  'type',
  'email',
  'phonenumber',
  'status',
] as const;

/** Human names for the required columns, for readable failure messages. */
export const REQUIRED_COLUMN_NAMES: Record<string, string> = {
  payernameen: 'PayerName',
  payercode: 'PayerCode',
  type: 'PayerType',
  email: 'Email',
  phonenumber: 'Phone',
  status: 'Status',
};

/** Row actions the list must offer on a row, whatever the record's state. */
export const REQUIRED_ROW_ACTIONS = ['view', 'edit'] as const;

// ---- Data formats ----------------------------------------------------------

/**
 * Format each column's values must conform to.
 *
 * Every pattern tolerates the list's blank marker ("—"), because a column
 * being legitimately empty for a record is not a formatting defect: a Payer
 * Code is only issued at publication, and Networks/Members are counts that
 * read as blank at zero.
 */
export const BLANK_CELL = '—';

/** A syntactically valid email address, as the list renders it. */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The phone format the list renders: a dial code, a space, then the subscriber
 * digits (e.g. "+966 565656565"). The mask is applied on display, so a value
 * that arrives as bare digits would fail this - which is the point.
 */
export const PHONE_PATTERN = /^\+\d{1,4}\s?\d{6,15}$/;

/** Payer Code: the issued, unique alphanumeric key (e.g. "PAY-001315"). */
export const PAYER_CODE_PATTERN = /^[A-Z]+-\d+$/;

// ---- Status colour coding --------------------------------------------------

/**
 * Which colour band each status must map to, expressed as the `data-tone`
 * attribute the application itself puts on every status badge.
 *
 * The acceptance criteria name colours ("green", "amber", "grey", "red"); the
 * application declares the band instead, which is the stable, themeable and
 * language-independent form of the same statement. Asserting the tone checks
 * the MAPPING is distinct and correct without pinning a hex value that any
 * re-theme would break.
 *
 * THE LIST HAS TWO STATUS COLUMNS, AND THE FOUR CRITERIA SPAN BOTH.
 *
 *   Status           the lifecycle of the currently PUBLISHED version:
 *                    Active / Inactive / Expired, or "Not Live" when nothing
 *                    has been published yet.
 *   Approval Status  the state of the LATEST version: "v1 · Published"
 *                    (active), "v0 · Pending Approval" (pending), "v1 · Draft"
 *                    (on-hold).
 *
 * PENDING lives on the APPROVAL column. A payer awaiting approval reads "Not
 * Live" in Status and "Pending Approval" in Approval Status, and the amber band
 * the criteria describe is on the latter. An earlier version of this table
 * looked for "Pending" in the lifecycle column, found nothing, and reported a
 * missing colour mapping that is not missing at all - the reading was wrong,
 * not the application. `column` below is what stops that recurring.
 */
export type StatusColumn = 'lifecycle' | 'approval';

export interface StatusToneCase {
  /** Status text as the English UI renders it. */
  status: string;
  /** Status text as the Arabic UI renders it. */
  statusAr: string;
  /** The `data-tone` value the badge must carry. */
  tone: string;
  /** Colour the acceptance criteria describe, for the failure message. */
  describedAs: string;
  /** The list filter that guarantees a row of this status is on screen. */
  filter: StatusFilterOption;
  /** WHICH badge carries this status's colour band. */
  column: StatusColumn;
}

export const STATUS_TONE_CASES: readonly StatusToneCase[] = [
  {
    status: 'Active',
    statusAr: 'نشطة',
    tone: 'active',
    describedAs: 'green',
    filter: 'Active',
    column: 'lifecycle',
  },
  {
    // The criteria's "Pending". The application words it "Pending Approval"
    // and puts it in the Approval Status column; matched on `contains` because
    // the badge folds the version number in ("v0 · Pending Approval").
    status: 'Pending Approval',
    statusAr: 'قيد الموافقة',
    tone: 'pending',
    describedAs: 'yellow/amber',
    filter: 'Pending',
    column: 'approval',
  },
  {
    status: 'Inactive',
    statusAr: 'غير نشط',
    tone: 'inactive',
    describedAs: 'grey',
    filter: 'Inactive',
    column: 'lifecycle',
  },
  {
    status: 'Expired',
    statusAr: 'منتهية',
    tone: 'expired',
    describedAs: 'red',
    filter: 'Expired',
    column: 'lifecycle',
  },
] as const;

/**
 * The other bands the application uses, beyond the four the criteria name.
 * Recorded so the "no two statuses share a colour" check has the full picture
 * rather than treating an unlisted value as a surprise.
 */
export const ADDITIONAL_TONES = {
  /** No version published yet - lifecycle column. */
  notLive: { status: 'Not Live', tone: 'neutral' },
  /** A saved but unsubmitted version - approval column. */
  draft: { status: 'Draft', tone: 'on-hold' },
} as const;

// ---- Pagination ------------------------------------------------------------

/**
 * The page size the list uses. Measured, not assumed: 350 payers span exactly
 * 35 pages in the live application.
 */
export const OBSERVED_PAGE_SIZE = 10;

/**
 * Whether the acceptance criteria's configurable page-size control exists.
 *
 * FALSE, verified against the live build: the table footer contains the pager
 * and nothing else - no rows-per-page selector, no "go to page" input. The two
 * cases that exercise those controls therefore assert their PRESENCE and fail
 * with that as the stated reason, rather than being quietly dropped or being
 * re-pointed at some other control so they pass. The flag is kept here so that
 * when the control is delivered, one edit re-enables the real boundary checks.
 */
export const PAGE_SIZE_CONTROL_EXPECTED = true;
export const GO_TO_PAGE_INPUT_EXPECTED = true;

/** Page-size boundary values the criteria call for, once a control exists. */
export const PAGE_SIZE_BOUNDARIES = {
  minimum: 10,
  maximum: 100,
  belowMinimum: 5,
} as const;

/** Invalid "go to page" inputs the criteria require to be rejected. */
export const INVALID_PAGE_INPUTS = ['999', '-1', '0', 'abc'] as const;

/**
 * The page sequence the state-transition case walks, and the pager control it
 * uses for each hop. Kept as data so the test reads as a state machine rather
 * than a run of clicks.
 */
export interface PageTransition {
  action: 'next' | 'previous' | 'first' | 'last';
  expectedPage: number | 'last';
  note: string;
}

export const PAGE_TRANSITIONS: readonly PageTransition[] = [
  { action: 'next', expectedPage: 2, note: 'Next moves forward one page' },
  { action: 'next', expectedPage: 3, note: 'Next again moves to page 3' },
  { action: 'previous', expectedPage: 2, note: 'Previous moves back one page' },
  { action: 'first', expectedPage: 1, note: 'First returns to page one' },
  { action: 'last', expectedPage: 'last', note: 'Last jumps to the final page' },
] as const;

/**
 * The hops the exploratory case fires in quick succession.
 *
 * Expressed as pager ACTIONS rather than page numbers, because the pager
 * collapses beyond seven pages: from page one it offers `1 2 … 35`, so a
 * button for page 5 does not exist and clicking one would time out. Next and
 * Previous are always present, which makes them the only controls a rapid
 * sequence can rely on.
 */
export const RAPID_PAGE_SEQUENCE = [
  'next',
  'next',
  'previous',
  'next',
] as const satisfies readonly ('next' | 'previous')[];

/** The page the rapid sequence above must end on, starting from page one. */
export const RAPID_SEQUENCE_FINAL_PAGE = 3;

/** A search term guaranteed to match no payer, used to force the empty state. */
export const NO_MATCH_SEARCH_TERM = 'zzzz-no-such-payer-zzzz';
