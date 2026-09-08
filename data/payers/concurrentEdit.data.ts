import { RandomDataUtils } from '../../utils/RandomDataUtils';

/**
 * Test data for "Detect and Prevent Overwriting Concurrent Payer Edits".
 *
 * WHAT THE APPLICATION ACTUALLY DOES, verified by holding two edit drawers open
 * on one payer and saving them in turn:
 *
 *   - The first save succeeds (HTTP 200, "saved as a draft").
 *   - The second, made from the copy loaded BEFORE that save, is rejected with
 *     HTTP 409 and `ValidationErrors[0].Reason` = "This payer has been modified
 *     since it was loaded. Please refresh and try again."
 *   - The interface reports NOTHING. No toast, no inline message, no banner.
 *     The drawer simply stays open, exactly as if the Save click had not landed.
 *
 * So the story's two halves have opposite outcomes, and the specs are written to
 * separate them per step: the record is genuinely protected from the stale
 * write, and the user is genuinely told nothing about it. `CONFLICT_RESPONSE`
 * below is what makes the first half assertable - it is the only evidence that
 * distinguishes "the save was blocked" from "the save silently succeeded", and
 * without it a test could not tell the two apart. `CONFLICT_MESSAGE_PATTERNS` is
 * what makes the second half fail honestly, rather than being quietly skipped.
 *
 * TWO SESSIONS, ONE ACCOUNT. The environment has a single set of credentials,
 * and a second browser context built from the saved session lands on the login
 * page because the refresh token rotates. The stale-copy condition is therefore
 * reproduced with two TABS of one context, which exercises the same server-side
 * version check - the 409 is raised by comparing the submitted record's version
 * to the stored one, and it neither knows nor cares which tab sent it. The one
 * dimension this cannot cover is two DIFFERENT roles, which is why that case
 * reports BLOCKED with the account it needs named.
 */

/** The conflict the API raises, verified against a real stale save. */
export const CONFLICT_RESPONSE = {
  status: 409,
  title: 'Conflict Detected',
  /** The server's own explanation, quoted exactly. */
  reason: 'This payer has been modified since it was loaded. Please refresh and try again.',
} as const;

/**
 * What a conflict message would have to say to satisfy the story.
 *
 * Patterns rather than one exact string on purpose: the acceptance criterion is
 * that the user is TOLD the record changed and asked to refresh, not that the
 * application uses a particular sentence. Any wording carrying both ideas
 * passes; the case fails today because no message of any wording appears.
 *
 * These patterns are UNVERIFIED, and cannot be verified, because the
 * application emits no such message in either language - so unlike every other
 * expected string in this framework they are a statement of what the criterion
 * requires rather than of what was observed. The specs therefore assert in two
 * moves: first that a message appears at all, then that it says the right
 * thing. Today the first assertion is the one that fails, which keeps the
 * reported defect independent of whether these guesses at the eventual wording
 * turn out to be right.
 */
export const CONFLICT_MESSAGE_PATTERNS = {
  en: /(modified|changed|updated).*(since|refresh|reload)/i,
  /** "modified" / "changed" and "refresh" / "reload", in Arabic. */
  ar: /(تعديل|تغيير|تحديث|تم تعديله).*(تحديث|إعادة)/,
} as const;

/**
 * The fields the two sessions edit.
 *
 * Deliberately DIFFERENT fields. The story's point is that a version conflict
 * is raised even when the two edits do not overlap - a field-level merge would
 * have let both through - so a test where both sessions changed the same field
 * would prove the weaker property.
 *
 * THE EMAIL IS GENERATED, NOT FIXED, and that is not a detail. A constant
 * address here made the recovery cases fail in a way that looked exactly like a
 * concurrency defect: the first run that succeeded CLAIMED the address, and
 * every later save of it came back 409 - with
 * `"Email '...' is already taken."`. Same status as a stale-save rejection,
 * entirely different cause. Two lessons are baked in below: the address is
 * unique per call, and every conflict assertion in this story checks the
 * REASON as well as the status, so a uniqueness collision can never again be
 * mistaken for the conflict under test.
 */
export const CONCURRENT_FIELDS = {
  /** What the first session changes. */
  first: { label: 'Phone Number', value: '511111111' },
  /** What the stale session changes - a different field entirely. */
  second: {
    label: 'Email Address',
    /** Fresh per call: payer email is unique across the register. */
    value: () => `concurrent.second.${RandomDataUtils.uniqueSuffix()}@example.com`,
  },
} as const;

/**
 * Field pairs for the "every field category behaves the same" checklist.
 *
 * One pair per data shape the wizard offers - free text, an email, a phone
 * number - because the conflict check is meant to be a property of the RECORD
 * rather than of any field. The wizard step each field sits on is not listed:
 * `setFieldValue` navigates to it from the label.
 */
export interface ConcurrentFieldPair {
  label: string;
  /**
   * What the winning session writes, and what the stale one tries to.
   *
   * Functions rather than strings so the email rows generate a fresh address
   * per run - payer email is unique across the register, and a reused address
   * is rejected with the SAME 409 status as a stale save.
   */
  firstValue: () => string;
  secondValue: () => string;
  category: string;
}

export const CONCURRENT_FIELD_MATRIX: readonly ConcurrentFieldPair[] = [
  {
    label: 'Phone Number',
    firstValue: () => '511111111',
    secondValue: () => '522222222',
    category: 'a masked numeric field',
  },
  {
    label: 'Email Address',
    firstValue: () => `matrix.first.${RandomDataUtils.uniqueSuffix()}@example.com`,
    secondValue: () => `matrix.second.${RandomDataUtils.uniqueSuffix()}@example.com`,
    category: 'a validated email field',
  },
  {
    label: 'License Number',
    firstValue: () => 'LIC-CONFLICT-FIRST',
    secondValue: () => 'LIC-CONFLICT-SECOND',
    category: 'a length-limited text field',
  },
];

/** How many times the stale save is retried without refreshing. */
export const REPEATED_SAVE_ATTEMPTS = 3;

/**
 * The account the two-role case needs.
 *
 * Named rather than left as "a second user", so the BLOCKED annotation tells
 * whoever reads the report exactly what to provision to unblock it.
 */
export const SECOND_ROLE_REQUIREMENT = {
  role: 'Payer Manager',
  reason:
    'The environment exposes one set of credentials (careconnect). Proving the conflict rule '
    + 'applies across DIFFERENT roles needs a second account holding payer edit rights but a '
    + 'different role from the first.',
} as const;
