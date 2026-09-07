import { RandomDataUtils } from '../../utils/RandomDataUtils';
import { DateUtils } from '../../utils/DateUtils';
import { toArabicToken } from './payer.data';
import type { PayerData } from './payerTypes';

/**
 * Test data for the user story: Display Payer Names in the Interface Language.
 *
 * Verified against the live application, and the finding that shapes this whole
 * story: the payer name cell keeps the SAME element id in both languages
 * (`...-cell-payernameen`) while its CONTENT switches - the English run shows
 * "AAA", the Arabic run shows "سسس" in the very same cell. So one locator
 * serves both languages and the assertion is purely about content.
 *
 * Verified likewise:
 *   - `<html lang>` flips en/ar and `dir` flips ltr/rtl.
 *   - The detail screen exposes BOTH names: `payer-detail-name` (the localized
 *     display name) and `payer-detail-overview-payer-name-ar` (the Arabic name
 *     as stored), which is what lets a fallback be told apart from a
 *     translation.
 *
 * WHAT CANNOT BE PROVISIONED. The fallback cases need a payer with one name
 * blank, and the "both blank" and "mixed-language" cases need worse. The create
 * wizard makes both name fields mandatory AND restricts the Arabic field to
 * Arabic letters, so none of those records can be created through the
 * application. Those cases are reported BLOCKED with that as the reason rather
 * than being faked with a record that does not represent the scenario.
 */

/** A payer whose two names are unmistakably different, per language. */
export interface BilingualPayer extends PayerData {
  /** The name that must show while the UI is English. */
  expectedEnglishDisplay: string;
  /** The name that must show while the UI is Arabic. */
  expectedArabicDisplay: string;
}

/**
 * Builds a payer whose English and Arabic names cannot be confused for one
 * another, so "the right name is showing" is a real assertion rather than a
 * coincidence of similar strings.
 */
export function buildBilingualPayer(): BilingualPayer {
  const suffix = RandomDataUtils.uniqueSuffix();
  const nameEn = `Localized Payer ${suffix}`;
  const nameAr = `جهة ${toArabicToken(suffix)}`;
  return {
    nameEn,
    nameAr,
    type: 'Private',
    email: `localized.payer.${suffix}@example.com`,
    phone: '512345678',
    licenseNumber: `LIC-LOC-${suffix}`,
    city: 'Riyadh',
    language: 'English',
    contactMethod: 'Email',
    effectiveDate: DateUtils.todayFormatted(),
    expiryDate: DateUtils.futureDate(365),
    expectedEnglishDisplay: nameEn,
    expectedArabicDisplay: nameAr,
  };
}

/**
 * The language/name-availability decision table the criteria enumerate.
 *
 * Only the two rows where BOTH names are present are executable - see the file
 * header. The blank-name rows are carried here anyway, each with the reason it
 * cannot be provisioned, so the table stays a complete statement of the rule
 * and the report says which rows were exercised.
 */
export interface NameResolutionCase {
  id: string;
  language: 'en' | 'ar';
  arabicNamePresent: boolean;
  englishNamePresent: boolean;
  /** Which stored name the UI must display. */
  expects: 'english' | 'arabic' | 'placeholder';
  /** Why the row cannot be set up, when it cannot. */
  blockedBecause?: string;
}

export const NAME_RESOLUTION_CASES: readonly NameResolutionCase[] = [
  {
    id: 'ar-ui-both-present',
    language: 'ar',
    arabicNamePresent: true,
    englishNamePresent: true,
    expects: 'arabic',
  },
  {
    id: 'en-ui-both-present',
    language: 'en',
    arabicNamePresent: true,
    englishNamePresent: true,
    expects: 'english',
  },
  {
    id: 'ar-ui-arabic-blank',
    language: 'ar',
    arabicNamePresent: false,
    englishNamePresent: true,
    expects: 'english',
    blockedBecause:
      'the Add Payer wizard makes the Arabic name mandatory, so a payer with a blank '
      + 'Arabic name cannot be created through the application',
  },
  {
    id: 'en-ui-english-blank',
    language: 'en',
    arabicNamePresent: true,
    englishNamePresent: false,
    expects: 'arabic',
    blockedBecause:
      'the Add Payer wizard makes the English name mandatory, so a payer with a blank '
      + 'English name cannot be created through the application',
  },
] as const;

/** The rows of the table that can actually be run. */
export const EXECUTABLE_NAME_CASES = NAME_RESOLUTION_CASES.filter(
  (row) => row.blockedBecause === undefined,
);

/** The language sequence the repeated-toggle case walks. */
export const LANGUAGE_TOGGLE_SEQUENCE = ['en', 'ar', 'en', 'ar'] as const;

/**
 * Arabic text carrying the diacritics and joined forms the rendering case is
 * about. Used as an assertion subject, never written into a field - the name
 * fields reject anything but plain Arabic letters.
 */
export const ARABIC_RENDERING_SAMPLE = 'مؤسسة الرعاية الصحية المتخصصة';

/**
 * Placeholder the criteria expect when a payer has no usable name in either
 * language. Kept as a set because the application may reasonably fall back to
 * the Payer Code instead of a literal "N/A".
 */
export const NAME_PLACEHOLDERS = ['N/A', '—', '-'] as const;

/** The maximum name length the boundary case probes. */
export const MAX_NAME_LENGTH = 255;

/** Builds a maximum-length English name for the layout boundary case. */
export function maxLengthEnglishName(): string {
  const suffix = RandomDataUtils.uniqueSuffix();
  const stem = `Max Length Payer ${suffix} `;
  return stem.repeat(Math.ceil(MAX_NAME_LENGTH / stem.length)).slice(0, MAX_NAME_LENGTH);
}
