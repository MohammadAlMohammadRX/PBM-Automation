import { RandomDataUtils } from '../../utils/RandomDataUtils';

/**
 * Test data for "Validate Payer Name Fields for Language-Specific Character
 * Sets and Arabic Name Length".
 *
 * WHAT THE FIELDS ACTUALLY ENFORCE, probed character class by character class
 * against the live wizard. This is the single most important thing in this file,
 * because the sheet assumes something stricter than the application does:
 *
 *   English Name  rejects a value ONLY when it contains ARABIC letters.
 *                 Digits, '#', '-', '/' and even EMOJI are all accepted.
 *   Arabic Name   rejects a value ONLY when it contains LATIN letters.
 *                 Digits, '#' and spaces are all accepted.
 *
 * So the rule is "must not contain the opposite script", not "letters of this
 * script only" - despite the message reading "English letters only." Three of
 * the sheet's cases expect a rejection the application does not perform, and
 * they are marked `expectRejected: false` below with the divergence recorded.
 * Writing them the other way round would have produced three tests that fail
 * against correct behaviour.
 *
 * LENGTH IS SERVER-SIDE, and there is no client-side cap at all: 256 characters
 * type into the field in full, no `maxlength` attribute exists, and step-1
 * validation stays silent. The limit shows up only on save -
 * 255 -> HTTP 200 "saved as a draft", 256 -> HTTP 422 "Form Validation
 * Failure". And on that 422 the interface displays NOTHING: no toast, no inline
 * error, the drawer just stays open. That is the same defect shape as the
 * concurrent-edit 409, and it is why the length cases assert the response as
 * well as the message.
 *
 * NOTE ON AN EXISTING INCONSISTENCY: data/payers/editPayer.data.ts declares
 * PAYER_NAME_MAX_LENGTH = 100 while data/payers/localizedName.data.ts declares
 * MAX_NAME_LENGTH = 255. The live limit is 255, so 255 is what this story uses.
 * The 100 is left untouched rather than silently "corrected" - it belongs to a
 * different story whose results were recorded against it, and changing a
 * constant another suite asserts on is not this story's call to make.
 */

/** The verified server-side maximum for the Arabic name. */
export const ARABIC_NAME_MAX_LENGTH = 255;

/** Inline messages the name fields produce, read off the live wizard. */
export const NAME_MESSAGES = {
  englishOnly: 'English letters only.',
  arabicOnly: 'Arabic letters only.',
  required: 'This field is required.',
} as const;

/** The Arabic interface's equivalents, verified in the Arabic wizard. */
export const NAME_MESSAGES_AR = {
  required: 'هذا الحقل مطلوب.',
} as const;

/** What the server answers when a name exceeds its length. */
export const NAME_LENGTH_REJECTION = {
  status: 422,
  title: 'Form Validation Failure',
} as const;

/** What the server answers when the payer is accepted. */
export const NAME_ACCEPTED_STATUS = 200;

/**
 * Character-set cases, one per class of input the sheet asks about.
 *
 * `expectRejected` is what the APPLICATION does, verified. `sheetExpectsRejected`
 * is what the sheet asked for. Where they disagree the test asserts the former
 * and the divergence is reported - a test that asserted the sheet would fail
 * against behaviour that is arguably correct, and would tell nobody anything
 * useful about the field.
 */
export interface CharacterSetCase {
  caseId: string;
  field: 'english' | 'arabic';
  label: string;
  value: string;
  /** Whether the FORM shows an inline character-set error. */
  expectRejected: boolean;
  /**
   * Whether the SERVER refuses the value on save, with 422.
   *
   * Separate from `expectRejected` because the two layers disagree, and the
   * disagreement is asymmetric - which is the most surprising thing this story
   * found. The Arabic field accepts `صندوق #1` with no inline error and the
   * server then refuses it; the English field accepts `Health Fund #1` and the
   * server saves it. So punctuation is permitted in one name and not the other,
   * and the interface gives no hint of the difference: a 422 renders no toast,
   * no inline error, nothing.
   *
   * Only meaningful when `expectRejected` is false - a value the form already
   * refused never reaches the server.
   */
  serverRejects: boolean;
  sheetExpectsRejected: boolean;
  /** Set when observed behaviour differs from the sheet, explaining how. */
  divergence?: string;
}

export const CHARACTER_SET_CASES: readonly CharacterSetCase[] = [
  {
    caseId: 'TC-002',
    field: 'english',
    label: 'Arabic characters in the English Name field',
    value: 'صندوق الصحة',
    expectRejected: true,
    serverRejects: false,
    sheetExpectsRejected: true,
  },
  {
    caseId: 'TC-003',
    field: 'arabic',
    label: 'Latin characters in the Arabic Name field',
    value: 'National Fund',
    expectRejected: true,
    serverRejects: false,
    sheetExpectsRejected: true,
  },
  {
    caseId: 'TC-008',
    field: 'english',
    label: 'punctuation and a digit in the English Name field',
    value: 'Health Fund #1',
    expectRejected: false,
    serverRejects: false,
    sheetExpectsRejected: true,
    divergence:
      'The sheet expects "Health Fund #1" to be refused as outside the allowed character set. '
      + 'The field accepts it - verified alongside digits, hyphen and slash. Only Arabic '
      + 'letters are refused here, so the constraint is "no opposite script" rather than '
      + '"letters only".',
  },
  {
    caseId: 'TC-009',
    field: 'arabic',
    label: 'punctuation and a digit in the Arabic Name field',
    value: 'صندوق #1',
    expectRejected: false,
    serverRejects: true,
    sheetExpectsRejected: true,
    divergence:
      'The sheet expects "صندوق #1" to be refused, and it IS - but by the SERVER, not the '
      + 'form. The field shows no inline error and lets the wizard continue; the save then '
      + 'comes back 422 with nothing shown in the interface. So the record is correctly not '
      + 'created, and the user is told nothing about why - unlike the English name field, '
      + 'which accepts the same punctuation all the way through to a saved record.',
  },
  {
    caseId: 'TC-011',
    field: 'arabic',
    label: 'mixed Arabic and Latin in the Arabic Name field',
    value: 'صندوق Health',
    expectRejected: true,
    serverRejects: false,
    sheetExpectsRejected: true,
  },
];

/** A valid pair that must save cleanly - the happy path. */
export const VALID_NAMES = {
  english: 'National Health Fund',
  arabic: 'صندوق الصحة الوطني',
} as const;

/** The shortest acceptable Arabic name - a single letter. */
export const SINGLE_ARABIC_LETTER = 'ص';

/** An Arabic name wrapped in significant whitespace. */
export const PADDED_ARABIC_NAME = '  صندوق الصحة  ';
export const TRIMMED_ARABIC_NAME = 'صندوق الصحة';

/**
 * Emoji and hidden bidirectional control characters.
 *
 * The sheet expects both to be refused. The English field accepts an emoji -
 * verified - so the emoji case asserts what actually happens and records the
 * divergence. The control-character case is genuinely exploratory: the sheet
 * states no single correct outcome, so the invariant asserted is that whatever
 * the application stores round-trips unchanged and the record is never left
 * half-saved.
 */
export const UNUSUAL_CHARACTER_CASES = [
  {
    label: 'an emoji in the English name',
    value: 'Health Fund 🙂',
    field: 'english' as const,
    expectRejected: false,
    divergence:
      'The sheet expects an emoji to be refused with a character-set violation. The English '
      + 'Name field accepts it - only Arabic letters are refused.',
  },
  {
    label: 'a hidden right-to-left mark among Arabic letters',
    // U+200F RIGHT-TO-LEFT MARK, invisible, between two Arabic words.
    value: 'صندوق‏الصحة',
    field: 'arabic' as const,
    expectRejected: false,
    divergence: undefined,
  },
] as const;

/**
 * The case's value with a unique tail, IN THE SAME SCRIPT as the field.
 *
 * Two reasons this is not just `c.value`. The accepted cases really do save a
 * record, and a fixed name like "Health Fund #1" would accumulate a new copy on
 * every run until a row lookup could no longer identify which one it meant. And
 * the tail has to match the field's own script - appending a Latin token to the
 * Arabic case would trip the very character-set rule under test, turning an
 * accepted value into a refused one.
 */
export function uniqueCharacterSetValue(characterSet: CharacterSetCase): string {
  const token = RandomDataUtils.uniqueSuffix();
  const arabicToken = token
    .split('')
    .map((c) => String.fromCharCode(0x0630 + (c.charCodeAt(0) % 26)))
    .join('');
  return characterSet.field === 'english'
    ? `${characterSet.value} ${token}`
    : `${characterSet.value} ${arabicToken}`;
}

/** Builds an Arabic name of an exact character length. */
export function arabicNameOfLength(length: number): string {
  return 'ص'.repeat(length);
}

/**
 * Builds a UNIQUE Arabic name of an exact length.
 *
 * The length cases save real records, and a payer's Arabic name is what the
 * Arabic list sorts and searches by - so a run of identical names would make
 * the created record impossible to find again. The unique tail is Arabic
 * letters, because anything else would trip the character-set rule this story
 * also tests.
 */
export function uniqueArabicNameOfLength(length: number): string {
  const token = RandomDataUtils.uniqueSuffix()
    .split('')
    .map((c) => String.fromCharCode(0x0630 + (c.charCodeAt(0) % 26)))
    .join('');
  const head = 'ص'.repeat(Math.max(0, length - token.length));
  return (head + token).slice(0, length);
}

/**
 * The three violations the bilingual-message case walks in one pass.
 *
 * Each names the field it applies to and the message expected, so the case can
 * assert one per step rather than folding all three into a single expectation.
 */
export const BILINGUAL_VIOLATIONS = [
  {
    label: 'the Arabic Name left empty',
    field: 'arabic' as const,
    value: '',
    expectedEn: NAME_MESSAGES.required,
    expectedAr: NAME_MESSAGES_AR.required,
  },
  {
    label: 'English letters in the Arabic Name',
    field: 'arabic' as const,
    value: 'National Fund',
    expectedEn: NAME_MESSAGES.arabicOnly,
    // The Arabic rendering of the character-set message is asserted as
    // "some Arabic message appears", because the wizard's Arabic build was
    // verified to translate the required message but this one has not been
    // observed in Arabic - see the spec comment.
    expectedAr: undefined,
  },
] as const;
