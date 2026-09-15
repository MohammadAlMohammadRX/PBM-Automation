/**
 * Test data for "Show Approval Status Across List, Cards and Payer Details".
 *
 * Most of this story is already automated: the paginated-list story asserts the
 * Approval Status column and its colour tones, and the Arabic-labels story
 * covers every status word in both languages. What is left, and what this folder
 * covers, is the behaviour the other two do not touch:
 *
 *   - Draft payers lead the default list order.
 *   - A payer awaiting its FIRST approval shows the status word alone, with no
 *     version number - the "v0" boundary the version model turns on.
 *   - A version number appears only once the payer has a version context.
 *   - An unrecognised status renders a safe fallback rather than crashing.
 *   - Every record carries a populated status across list, card and detail.
 *
 * The card view is checked through its status TONE (an existing reader) rather
 * than its label text: the tone is the language-independent signal that the chip
 * rendered at all, which is what "populated in the card view" needs.
 */

/** The status a first-time submission shows. */
export const FIRST_APPROVAL_STATUS = 'Pending Approval';

/** The lifecycle-badge status a draft shows in the list's Status column. */
export const DRAFT_STATUS = 'Draft';

/** A version prefix looks like "v3 · " - this is how its presence is detected. */
export const VERSION_PREFIX = /^v\d+\s*[·|.-]/i;

/** A status value outside the five defined ones, injected for the fallback case. */
export const UNRECOGNISED_STATUS = 'ZZ_NOT_A_STATUS';

/** What the list must never do when it meets an unrecognised status. */
export const FALLBACK_EXPECTATION = {
  forbidden: 'a crash or an empty, unrendered list',
} as const;

/** The field an edit moves to give a published payer a second version to review. */
export const VERSION_EDIT = {
  label: 'License Number',
  value: 'LIC-APPROVAL-VIEW',
  kind: 'text' as const,
};

/** How many rows the "every record populated" case samples. */
export const POPULATED_SAMPLE = 12;
