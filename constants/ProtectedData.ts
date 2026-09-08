/**
 * Records that no test may delete, inactivate, or otherwise disturb.
 *
 * WHY THIS EXISTS. The auto-discard story depends on payers that must SURVIVE
 * for days while their effective windows lapse of their own accord - see
 * data/payers/discardSeed.data.ts. They are the one kind of data in this suite
 * that is deliberately not cleaned up, which makes them uniquely fragile: any
 * story whose teardown deletes by a loose name match, or whose sampling picks a
 * payer and then acts on it, can destroy days of waiting in a second. And the
 * damage is silent - the discard cases would simply report BLOCKED again, with
 * nothing to say a record had been removed rather than never created.
 *
 * So protection is enforced in code rather than left as a convention: the
 * helpers below are called from the shared teardown and sampling paths, and a
 * protected record is refused rather than politely skipped.
 */

/**
 * Name prefixes that mark a record as protected.
 *
 * TWO seed sets are protected now, and they are deliberately separate prefixes
 * rather than one shared one. DISCARD-SEED waits for an approval window to
 * lapse; STATUS-SEED waits for an EXPIRY date to lapse and is inactivated
 * first. Their expected end states are different, so a checker that could not
 * tell them apart would report the wrong outcome for half the rows - and a
 * single prefix would let story 09's seeder adopt story 06's records.
 *
 * Prefix matching rather than an id list on purpose: the seeder creates records
 * across several runs with generated suffixes, and a list would need updating
 * every time. The prefix is stamped into every seeded name.
 */
export const PROTECTED_NAME_PREFIXES = ['DISCARD-SEED', 'STATUS-SEED'] as const;

/** Whether a record is protected from deletion and mutation. */
export function isProtectedRecord(name: string): boolean {
  const trimmed = (name ?? '').trim();
  return PROTECTED_NAME_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
}

/**
 * Suspends the guard while a SEEDER sets its own records up.
 *
 * WHY THIS IS NEEDED, and why it is this narrow. The expiry-precedence seed has
 * to inactivate the payers it just created - that is the state its cases are
 * waiting on - but those payers are protected the moment they are named, so the
 * guard refuses the seeder's own setup. The guard is meant to stop OTHER tests
 * from disturbing seeded data, not to stop the seeder from creating it.
 *
 * Deliberately NOT a parameter on `deleteRow`/`inactivateRow`. An optional
 * "allowProtected" argument on those is one autocomplete away from being passed
 * by a test that just wants its teardown to stop complaining, which is exactly
 * the accident the guard exists to prevent. A process-wide switch that only the
 * two seed specs touch is harder to reach for by mistake and obvious in review.
 *
 * Always pair it with `resumeProtection()` - `withProtectionSuspended` does
 * that for you, including when the body throws.
 */
let protectionSuspended = false;

export function suspendProtectionForSeeding(): void {
  protectionSuspended = true;
}

export function resumeProtection(): void {
  protectionSuspended = false;
}

/** Runs `body` with the guard suspended, restoring it even on failure. */
export async function withProtectionSuspended<T>(body: () => Promise<T>): Promise<T> {
  suspendProtectionForSeeding();
  try {
    return await body();
  } finally {
    resumeProtection();
  }
}

/**
 * Throws if `name` is protected.
 *
 * Deliberately LOUD rather than a silent skip. A test that tries to delete
 * seeded data has a bug - most likely a too-broad search or a shared fixture
 * used where a dedicated record was needed - and a silent skip would leave that
 * bug in place to be rediscovered later. The message names the caller so it is
 * obvious which test to fix.
 */
export function assertNotProtected(name: string, operation: string): void {
  if (protectionSuspended) return;
  if (!isProtectedRecord(name)) return;
  throw new Error(
    `[ProtectedData] Refusing to ${operation} "${name}". Records prefixed `
      + `${PROTECTED_NAME_PREFIXES.join(' / ')} are seeded for the auto-discard story and `
      + 'must survive for days while their effective windows lapse - see '
      + 'data/payers/discardSeed.data.ts. If a test needs a payer of its own, provision one '
      + 'through the draftPayer / publishedPayer / uniquePayer fixtures instead of acting on '
      + 'a record it found.',
  );
}

/** Removes protected records from a sampled list, so no test picks one up. */
export function withoutProtected(names: string[]): string[] {
  return names.filter((name) => !isProtectedRecord(name));
}
