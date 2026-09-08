/**
 * Test data for "Validate Payer Licence Number Length and Required Entry".
 *
 * THE FIELD'S REAL CONSTRAINT, verified on the live wizard rather than taken
 * from the sheet: `payer-form-drawer-license-number-input` carries
 * `maxlength="100"`, which the BROWSER enforces. Typing 101 characters leaves
 * 100 in the field.
 *
 * That matters for how the boundary cases are written. The sheet expects a
 * 101-character value to be entered, rejected on save, and answered with a
 * "maximum length exceeded" message. None of that is observable, because the
 * value can never be entered in the first place - the application prevents
 * oversize input instead of validating it afterwards. The acceptance criterion
 * ("a licence number longer than 100 characters is not accepted") still holds,
 * and more strongly, so the boundary cases assert the CAP and the absence of any
 * oversized record. The divergence is recorded in the traceability matrix.
 *
 * The sheet also says the validation messages are bilingual "English/French".
 * The application is English/Arabic throughout; French appears nowhere in it.
 * Treated as a copy/paste slip in the sheet and asserted as English/Arabic.
 */

/** The application's enforced maximum, read off the input's own attribute. */
export const LICENCE_MAX_LENGTH = 100;

/**
 * Lengths the field must accept, each tied to the case that covers it.
 *
 * The case id lives in the data rather than being derived in the spec: deriving
 * it from the length meant a chain of conditionals in the test file, and the
 * mapping from boundary to case is a fact about the sheet, not a computation.
 */
export const ACCEPTED_LICENCE_LENGTHS = [
  { caseId: 'TC-001', length: 50, label: 'a mid-range entry' },
  { caseId: 'TC-003', length: LICENCE_MAX_LENGTH, label: 'exactly the maximum' },
  { caseId: 'TC-005', length: 1, label: 'the shortest possible entry' },
] as const;

/**
 * Builds a licence number of an exact length.
 *
 * Prefixed with `LIC` and padded with digits rather than being a run of one
 * letter, so a value that turns up in a failure message or an export is
 * recognisably test data and not a corrupted field.
 *
 * DETERMINISTIC, which is what the boundary cases need: they assert the exact
 * value they entered. Do NOT use it for anything that then SEARCHES by licence -
 * see `uniqueLicenceOfLength` for why.
 */
export function licenceOfLength(length: number): string {
  const prefix = 'LIC';
  if (length <= prefix.length) return prefix.slice(0, length);
  return prefix + '0'.repeat(length - prefix.length);
}

/**
 * Builds a licence number of an exact length that is unique per call.
 *
 * WHY BOTH EXIST. The list's keyword search matches on a SUBSTRING, and
 * `licenceOfLength` differs between lengths only in how many zeros it appends -
 * so `licenceOfLength(16)` is a prefix of `licenceOfLength(18)`, and searching
 * for the first returns the second as well. Three of the visibility cases
 * failed exactly that way: each had created its own payer correctly, then found
 * its sibling cases' records alongside it and reported the search as broken.
 *
 * The unique token is placed straight after the prefix rather than at the end,
 * so no generated value can ever be a prefix of another however the lengths
 * line up. Falls back to the deterministic form when the requested length is
 * too short to carry a token.
 */
export function uniqueLicenceOfLength(length: number, token: string): string {
  const prefix = `LIC${token}`;
  if (length <= prefix.length) return licenceOfLength(length);
  return prefix + '0'.repeat(length - prefix.length);
}

/** One character beyond the limit - what the field must refuse to hold. */
export const OVERSIZED_LICENCE = licenceOfLength(LICENCE_MAX_LENGTH + 1);

/**
 * Whitespace-only input.
 *
 * Five spaces rather than one: the sheet asks for it, and a single space is
 * easy to trim accidentally at the keystroke level while a run survives long
 * enough to reach the save.
 */
export const WHITESPACE_ONLY_LICENCE = '     ';

/**
 * A value wrapped in significant whitespace, to check it is trimmed on save.
 *
 * The inner value is what must be stored and displayed; the assertion compares
 * against `TRIMMED_LICENCE`, so a system that stored the padding would fail on
 * the exact character count rather than on a fuzzy contains-match.
 */
export const PADDED_LICENCE = '  LIC12345  ';
export const TRIMMED_LICENCE = 'LIC12345';

/**
 * Character sets the exploratory case pushes through the field.
 *
 * Deliberately labelled as an EXPLORATION, not an expectation: the sheet asks
 * to "observe whether the system accepts, sanitizes, or rejects" these, and
 * there is no stated correct answer. The test records what happened and asserts
 * only the invariant that must hold either way - whatever is stored round-trips
 * unchanged, and the record is never left in a half-saved state.
 */
export const SPECIAL_CHARACTER_LICENCES = [
  { label: 'punctuation and mixed scripts', value: 'LIC-2024/Omega-Nihongo-c' },
  { label: 'accented Latin letters', value: 'LIC-Aeiou-Cafe-Resume' },
  { label: 'an emoji', value: 'LIC-2024-rocket' },
] as const;

/**
 * The four rules the checklist case walks in one pass.
 *
 * `expectsSave` says whether the wizard should complete; `expectedError` is the
 * inline message under the field when it should not. Rule 3's expectation is
 * the CAP rather than a message, for the reason in the file comment - it is
 * flagged so the spec asserts the right thing rather than looking for a message
 * the application never shows.
 */
export interface LicenceRule {
  rule: number;
  label: string;
  value: string;
  expectsSave: boolean;
  /** Set when an inline validation message is expected. */
  expectedError?: string;
  /** Set when the constraint is enforced by capping input, not by a message. */
  expectsCapAt?: number;
}

export const LICENCE_RULES: readonly LicenceRule[] = [
  {
    rule: 1,
    label: 'blank licence number is rejected as required',
    value: '',
    expectsSave: false,
    expectedError: 'This field is required.',
  },
  {
    rule: 2,
    label: 'exactly 100 characters is accepted',
    value: licenceOfLength(LICENCE_MAX_LENGTH),
    expectsSave: true,
  },
  {
    rule: 3,
    label: '101 characters cannot be entered at all',
    value: OVERSIZED_LICENCE,
    expectsSave: true,
    expectsCapAt: LICENCE_MAX_LENGTH,
  },
  {
    rule: 4,
    label: 'a valid 10-character licence number is accepted',
    value: licenceOfLength(10),
    expectsSave: true,
  },
];

/** The inline messages the field produces, verified on the live wizard. */
export const LICENCE_MESSAGES = {
  required: 'This field is required.',
} as const;

/**
 * The Arabic interface's equivalent of the required message.
 *
 * Read off the live Arabic wizard. Held here rather than inline so the
 * bilingual assertion names one source of truth, and so a translation change is
 * a single edit.
 */
export const LICENCE_MESSAGES_AR = {
  required: 'هذا الحقل مطلوب.',
} as const;
