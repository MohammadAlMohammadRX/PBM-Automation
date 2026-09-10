import { RandomDataUtils } from '../../utils/RandomDataUtils';
import { DATE_MESSAGES } from './expiryDateRules.data';
import { NAME_MESSAGES } from './payerNameFields.data';
import { VALIDATION_MESSAGES } from './payer.data';

/**
 * Test data for "Validate Payer Creation Input Fields".
 *
 * DELIBERATELY THIN. This story restates rules that three other stories already
 * cover in depth, so it REUSES their constants rather than re-declaring them:
 *
 *   name character sets   -> payerNameFields.data.ts   (NAME_MESSAGES)
 *   email format          -> payer.data.ts             (VALIDATION_MESSAGES)
 *   email uniqueness      -> payerEmailUniqueness.data.ts
 *   date rules            -> expiryDateRules.data.ts   (DATE_MESSAGES)
 *
 * What is genuinely new here, and all verified against the live wizard, is the
 * PHONE field and the COUNTRY/CITY pair. Both diverge from the sheet.
 *
 * THE PHONE FIELD IS MASKED, not validated. It accepts at most ten digits and
 * silently ignores anything else:
 *
 *   "5123456789"   (10 digits)  -> held in full
 *   "51234567890"  (11 digits)  -> the eleventh never arrives; the box holds 10
 *   "51A23-456"    (letters)    -> the non-digits never register at all
 *
 * So the sheet's "a validation error is shown indicating at most 10 digits" and
 * "…must be digits only" describe messages that cannot appear: there is nothing
 * invalid left in the field to complain about. The constraint holds - more
 * firmly than a message would - but the two cases assert the CAP instead.
 *
 * COUNTRY AND DIAL CODE BOTH CARRY DEFAULTS. The sheet expects each to show a
 * blank placeholder until chosen; the wizard pre-selects `Saudi Arabia` and
 * `+966`. That is a real divergence and the case says so.
 *
 * THE CITY LIST IS PROPERLY SCOPED, and this half the sheet gets right: picking
 * Saudi Arabia then Jeddah, then switching to the United Arab Emirates, resets
 * City to its placeholder and re-lists Abu Dhabi / Dubai / Sharjah. Note the
 * sheet names Egypt, which this environment does not offer - it holds exactly
 * three countries.
 */

/** Messages this story reuses from the stories that own them. */
export const CREATION_MESSAGES = {
  englishNameOnly: NAME_MESSAGES.englishOnly,
  arabicNameOnly: NAME_MESSAGES.arabicOnly,
  required: NAME_MESSAGES.required,
  invalidEmail: VALIDATION_MESSAGES.invalidEmail,
  expiryNotAfterEffective: DATE_MESSAGES.expiryNotAfterEffective,
  expiryBeforeToday: DATE_MESSAGES.expiryBeforeToday,
  effectiveBeforeToday: DATE_MESSAGES.effectiveBeforeToday,
} as const;

/** The verified maximum number of subscriber digits the phone field holds. */
export const PHONE_MAX_DIGITS = 10;

/**
 * Phone inputs and what the FIELD does with each.
 *
 * `expectedHeld` is what remains in the box afterwards - the whole point of
 * these cases, since the mask leaves nothing invalid to validate.
 */
export interface PhoneCase {
  caseId: string;
  label: string;
  typed: string;
  expectedHeld: string;
  /** True where the sheet expects a validation message that cannot appear. */
  sheetExpectsMessage: boolean;
}

export const PHONE_CASES: readonly PhoneCase[] = [
  {
    caseId: 'TC-008',
    label: 'exactly ten digits',
    typed: '5123456789',
    expectedHeld: '5123456789',
    sheetExpectsMessage: false,
  },
  {
    caseId: 'TC-009',
    label: 'eleven digits',
    typed: '51234567890',
    expectedHeld: '5123456789',
    sheetExpectsMessage: true,
  },
  {
    caseId: 'TC-010',
    label: 'letters and punctuation mixed with digits',
    typed: '51A23-456',
    expectedHeld: '5123456',
    sheetExpectsMessage: true,
  },
];

/** The values the wizard pre-selects, contrary to the sheet's expectation. */
export const FIELD_DEFAULTS = {
  country: 'Saudi Arabia',
  dialCode: '+966',
} as const;

/**
 * The country/city pairs the cascade case walks.
 *
 * Two of the three countries this environment offers. The sheet names Egypt,
 * which does not exist here - so the case uses a country that does, and the
 * substitution is recorded rather than silently made.
 */
export const COUNTRY_CITY_CASCADE = {
  first: { country: 'Saudi Arabia', city: 'Jeddah' },
  second: { country: 'United Arab Emirates', expectedCities: ['Abu Dhabi', 'Dubai', 'Sharjah'] },
  /** What the City control reads once its country changes. */
  clearedPlaceholder: 'Select',
} as const;

/**
 * Hostile input for the exploratory case.
 *
 * The invariant asserted is not "these are rejected" - the sheet allows either
 * rejection or safe sanitisation - but that nothing is ever executed or
 * silently mangled: whatever the application keeps round-trips unchanged, and
 * no script tag reaches the rendered list as markup.
 */
export const HOSTILE_INPUTS = [
  { label: 'a script tag', value: '<script>alert(1)</script>' },
  { label: 'an SQL-like string', value: "Robert'); DROP TABLE payers;--" },
  { label: 'surrounding whitespace', value: '   Padded Name   ' },
] as const;

/** A malformed address, taken from the sheet. */
export const MALFORMED_EMAIL = 'admin.alnoor@@example';

/** Builds a unique English name carrying a hostile fragment. */
export function hostileName(fragment: string): string {
  return `${fragment} ${RandomDataUtils.uniqueSuffix()}`;
}
