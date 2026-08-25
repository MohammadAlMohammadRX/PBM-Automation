/**
 * Pure ordering helpers used by the sort assertions.
 *
 * They contain no Playwright code on purpose: deciding whether a list of
 * strings is ordered is plain logic, so it is unit-testable, reusable by any
 * module's list page, and keeps the Page Object free of comparison loops.
 */

export type SortDirection = 'asc' | 'desc';

/**
 * Text comparison used for every alphabetical assertion.
 *
 * `sensitivity: 'base'` makes the comparison case- and accent-insensitive,
 * which is what the application does: sorting Payer Name descending returns
 * "UAT ..." before "the mayy222", so upper/lower case is not part of the key.
 * A locale-aware collator (rather than `<`) is also what lets the same helper
 * validate the Arabic UI, whose alphabet has its own ordering.
 */
const collator = new Intl.Collator(undefined, { sensitivity: 'base' });

/** Cell contents the list uses to mean "no value" (observed in the live app). */
export const BLANK_MARKERS = ['', '—'] as const;

export function isBlank(value: string): boolean {
  return (BLANK_MARKERS as readonly string[]).includes(value.trim());
}

export function withoutBlanks(values: string[]): string[] {
  return values.filter((value) => !isBlank(value));
}

/** True when `values` are in the requested order (equal neighbours allowed). */
export function isSorted(values: string[], direction: SortDirection): boolean {
  for (let index = 1; index < values.length; index += 1) {
    const comparison = collator.compare(values[index - 1], values[index]);
    if (direction === 'asc' ? comparison > 0 : comparison < 0) return false;
  }
  return true;
}

/**
 * True when every distinct value occupies one contiguous block.
 *
 * This is the assertion for columns the application orders by an internal code
 * rather than by the displayed label (Status): the labels may not be
 * alphabetical, but a correct sort must still keep equal values together.
 */
export function isGrouped(values: string[]): boolean {
  const started = new Set<string>();
  let previous: string | undefined;
  for (const value of values) {
    if (value === previous) continue;
    if (started.has(value)) return false;
    started.add(value);
    previous = value;
  }
  return true;
}

/**
 * True when the blank cells sit together at one end rather than being
 * interleaved with real values - the failure TC-042 looks for. A column with no
 * blanks, or nothing but blanks, is trivially grouped.
 */
export function blanksAreGrouped(values: string[]): boolean {
  const blanks = values.map(isBlank);
  const firstValue = blanks.indexOf(false);
  if (firstValue === -1) return true;                 // all blank
  const lastValue = blanks.lastIndexOf(false);
  // No blank may appear between the first and last real value, and the real
  // values must not be bracketed by blanks on both sides.
  if (blanks.slice(firstValue, lastValue + 1).includes(true)) return false;
  return firstValue === 0 || lastValue === blanks.length - 1;
}

/** Values that appear more than once - used to prove a sort duplicated no row. */
export function duplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated];
}
