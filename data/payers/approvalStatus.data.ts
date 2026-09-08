import { APPROVAL_STATUS, type ApprovalStatusKey } from '../../constants/ElementIds';

/**
 * Test data for "Provide Arabic Labels for All Approval Status Values,
 * Including Withdrawn".
 *
 * WHERE THE STATUSES LIVE, verified across the live list and a payer's Version
 * History. This is the single most important fact for these cases, and reading
 * the sheet alone gets it wrong:
 *
 *   Pending Approval, Published, Draft  -> the payer LIST's Approval Status cell
 *   Superseded, Rejected                -> a payer's VERSION HISTORY tab only
 *
 * Superseded can never appear on the list, because the list shows a payer's
 * CURRENT version and a current version is by definition not superseded. A test
 * that looked for "a payer record with status Superseded" in the list would
 * report the environment as lacking data it actually holds in quantity.
 *
 * THE ARABIC LABELS ALREADY MATCH THE SHEET, for four of the five: بانتظار
 * الموافقة, منشور, مُستبدَل and مرفوض are exactly what the application renders.
 * So most of this story passes.
 *
 * WITHDRAWN DOES NOT EXIST. Verified three ways - the status never appears in
 * the list or in any version history; no Withdraw action exists on a list row,
 * a version row, or in the approvals hub; and the only status filter offered is
 * the LIFECYCLE one (Active / Inactive / Expired / Pending), not an approval one.
 * `EXPECTED_VOCABULARY` below therefore includes `withdrawn` deliberately, so
 * the cases that check the vocabulary FAIL and name the gap, rather than being
 * written around it.
 */

/** Where a given approval status can be observed. */
export type StatusSurface = 'list' | 'versionHistory';

export interface ExpectedApprovalStatus {
  /** Key into APPROVAL_STATUS, or a value the application does not emit. */
  key: string;
  /**
   * The case in this story that covers this status.
   *
   * Kept with the data rather than derived in the spec: the mapping from status
   * to case number is a fact about the sheet, and deriving it meant a chain of
   * conditionals in the test file.
   */
  caseId: string;
  en: string;
  ar: string;
  /** Where the label is read from. */
  surface: StatusSurface;
  /**
   * False when the application does not implement this status at all. The case
   * still runs and still asserts - it is expected to fail, and that failure is
   * the story's finding.
   */
  implemented: boolean;
}

/**
 * The five statuses the story requires, with the Arabic label each must show.
 *
 * Ordered as the sheet lists them so the traceability matrix lines up
 * case-for-case.
 */
export const EXPECTED_APPROVAL_STATUSES: readonly ExpectedApprovalStatus[] = [
  {
    key: 'pendingApproval',
    caseId: 'TC-001',
    en: APPROVAL_STATUS.pendingApproval.en,
    ar: APPROVAL_STATUS.pendingApproval.ar,
    surface: 'list',
    implemented: true,
  },
  {
    key: 'published',
    caseId: 'TC-002',
    en: APPROVAL_STATUS.published.en,
    ar: APPROVAL_STATUS.published.ar,
    surface: 'list',
    implemented: true,
  },
  {
    key: 'superseded',
    caseId: 'TC-003',
    en: APPROVAL_STATUS.superseded.en,
    ar: APPROVAL_STATUS.superseded.ar,
    surface: 'versionHistory',
    implemented: true,
  },
  {
    key: 'rejected',
    caseId: 'TC-004',
    en: APPROVAL_STATUS.rejected.en,
    ar: APPROVAL_STATUS.rejected.ar,
    surface: 'versionHistory',
    implemented: true,
  },
  {
    // Required by the story; emitted by nothing in the application.
    key: 'withdrawn',
    caseId: 'TC-005',
    en: 'Withdrawn',
    ar: 'مسحوب',
    surface: 'versionHistory',
    implemented: false,
  },
];

/** The status keys the story says the vocabulary must contain. */
export const EXPECTED_VOCABULARY = EXPECTED_APPROVAL_STATUSES.map((status) => status.en);

/** The keys the application actually implements, from the verified id map. */
export const IMPLEMENTED_VOCABULARY = Object.keys(APPROVAL_STATUS) as ApprovalStatusKey[];

/** The statuses that can be observed today - the ones with data behind them. */
export const OBSERVABLE_APPROVAL_STATUSES = EXPECTED_APPROVAL_STATUSES.filter(
  (status) => status.implemented,
);

/**
 * The lone unimplemented status, named so a spec can reference it without
 * re-deriving the filter and without hard-coding "Withdrawn" in a test body.
 */
export const WITHDRAWN_STATUS = EXPECTED_APPROVAL_STATUSES.find(
  (status) => status.key === 'withdrawn',
)!;

/**
 * Text that betrays a broken translation rather than a missing one.
 *
 * A raw key (`status.withdrawn`), a blank cell and the literal "undefined" are
 * three different bugs with the same visible symptom, and the story asks about
 * all of them by name.
 */
export const BROKEN_LABEL_PATTERNS = [
  { label: 'a raw translation key', pattern: /^[a-z][a-zA-Z]*(\.[a-zA-Z]+)+$/ },
  { label: 'the literal string "undefined"', pattern: /^undefined$/i },
  { label: 'the literal string "null"', pattern: /^null$/i },
] as const;

/**
 * How many times the audit-history case toggles the language.
 *
 * More than one round trip on purpose: a label that is translated on first
 * render but not re-translated on a switch back is a real failure mode, and a
 * single toggle cannot see it.
 */
export const LANGUAGE_TOGGLE_ROUNDS = 3;
