/**
 * Test data for the user story: Search Payers by Name or Code.
 *
 * Verified against the live application: the toolbar search box filters in real
 * time (no Enter required) and matches the English name, the Arabic name, the
 * Payer Code and the Licence Number. The Advanced Search drawer adds explicit
 * Name/Code, Payer Type, Status and Licence Number criteria.
 */

/** Search box presentation, checked by the UI checklist test. */
export const SEARCH_UI = {
  placeholder: 'Search',
  clearLabel: 'Clear',
  advancedLabel: 'Filters',
} as const;

/** Labels of the Advanced Search fields, as rendered by the application. */
export const ADVANCED_SEARCH_FIELDS = {
  nameOrCode: 'Payer Name / Code',
  payerType: 'Payer Type',
  status: 'Status',
  licenseNumber: 'License Number',
} as const;

/** Text the list shows when a search matches nothing. */
export const NO_RESULTS_TEXT = 'No results found.';

/**
 * A payer that is expected to exist in the QA data set, used by the tests that
 * must search for something real. Override through .env when the data changes,
 * so no spec hardcodes environment data.
 */
export const KNOWN_PAYER = {
  /** Full English name. */
  name: process.env.SEARCH_PAYER_NAME ?? 'Al Dawaa',
  /** A leading substring of that name - drives the partial-match tests. */
  namePartial: process.env.SEARCH_PAYER_NAME_PARTIAL ?? 'Al Daw',
  /** Arabic name substring. */
  nameArabic: process.env.SEARCH_PAYER_NAME_AR ?? 'الدواء',
  /** Full Payer Code. */
  code: process.env.SEARCH_PAYER_CODE ?? 'PAY-000017',
  /** A substring of the Payer Code. */
  codePartial: process.env.SEARCH_PAYER_CODE_PARTIAL ?? '000017',
  /** Licence Number. */
  licenseNumber: process.env.SEARCH_PAYER_LICENSE ?? '686846',
} as const;

/** A single character that matches at least one payer (minimum boundary). */
export const SINGLE_CHARACTER_TERM = 'a';

/** A term guaranteed not to match any payer. */
export const NO_MATCH_TERM = 'zzzznotexist';

/** Builds an over-long search term for the maximum-length boundary test. */
export function longSearchTerm(length = 500): string {
  return 'a'.repeat(length);
}

/**
 * Special and injection-style inputs. Each must be treated as literal text -
 * no script execution, no server error, and no unfiltered data leak.
 */
export interface UnsafeSearchCase {
  id: string;
  label: string;
  term: string;
}

export const UNSAFE_SEARCH_CASES: readonly UnsafeSearchCase[] = [
  { id: 'sql-injection', label: 'a SQL-style statement', term: "'; DROP TABLE--" },
  { id: 'script-injection', label: 'a script tag', term: '<script>alert(1)</script>' },
  { id: 'whitespace-only', label: 'whitespace only', term: '   ' },
] as const;

/** Mixed-language and untrimmed terms (TC-026). */
export interface LooseSearchCase {
  id: string;
  label: string;
  term: string;
  /** True when the term should still find the known payer after trimming. */
  expectsMatch: boolean;
}

export const LOOSE_SEARCH_CASES: readonly LooseSearchCase[] = [
  {
    id: 'mixed-languages',
    label: 'mixed Arabic and English text',
    term: 'Nat شركة',
    expectsMatch: false,
  },
  {
    id: 'surrounding-spaces',
    label: 'leading and trailing spaces',
    term: `  ${KNOWN_PAYER.namePartial}  `,
    expectsMatch: true,
  },
] as const;

/**
 * Advanced-search field combinations for the decision-table test (TC-019).
 * `expectResults` records whether the combination should return rows at all.
 */
export interface AdvancedSearchCase {
  id: string;
  label: string;
  nameOrCode?: string;
  licenseNumber?: string;
  expectResults: boolean;
}

export const ADVANCED_SEARCH_COMBINATIONS: readonly AdvancedSearchCase[] = [
  {
    id: 'both-fields',
    label: 'both Name/Code and Licence Number are filled',
    nameOrCode: KNOWN_PAYER.namePartial,
    licenseNumber: KNOWN_PAYER.licenseNumber,
    expectResults: true,
  },
  {
    id: 'name-only',
    label: 'only Name/Code is filled',
    nameOrCode: KNOWN_PAYER.namePartial,
    expectResults: true,
  },
  {
    id: 'licence-only',
    label: 'only Licence Number is filled',
    licenseNumber: KNOWN_PAYER.licenseNumber,
    expectResults: true,
  },
  {
    id: 'both-empty',
    label: 'both fields are left empty',
    expectResults: true,
  },
] as const;

/** Contradictory pair used to prove the advanced fields combine as AND. */
export const CONTRADICTORY_ADVANCED_SEARCH = {
  nameOrCode: KNOWN_PAYER.namePartial,
  licenseNumber: 'LIC-DOES-NOT-EXIST-0000',
} as const;
