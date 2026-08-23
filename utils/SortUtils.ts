/**
 * Pure ordering helpers used by the sort assertions.
 *
 * They contain no Playwright code on purpose: deciding whether a list of
 * strings is ordered is plain logic, so it is unit-testable, reusable by any
 * module's list page, and keeps the Page Object free of comparison loops.
 */

export type SortDirection = 'asc' | 'desc';

/** Where blank values sit inside a sorted column. */
export type BlankPlacement = 'none' | 'first' | 'last' | 'scattered';

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

/** Cell contents the list uses to mean "no value". */
export const BLANK_MARKERS = ['', '-', '—', '–', 'N/A'] as const;

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
 * Where the blank cells ended up. A correct sort puts them all at one end;
 * "scattered" means they were interleaved with real values, which is the
 * failure TC-042 looks for.
 */
export function blankPlacement(values: string[]): BlankPlacement {
  const blanks = values.map(isBlank);
  if (!blanks.includes(true)) return 'none';
  if (!blanks.includes(false)) return 'first';

  const firstValue = blanks.indexOf(false);
  const lastValue = blanks.lastIndexOf(false);
  if (blanks.slice(firstValue, lastValue + 1).includes(true)) return 'scattered';

  const hasLeading = firstValue > 0;
  const hasTrailing = lastValue < blanks.length - 1;
  if (hasLeading && hasTrailing) return 'scattered';
  return hasLeading ? 'first' : 'last';
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
