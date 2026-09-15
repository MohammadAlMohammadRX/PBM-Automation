/**
 * Test data for "Capture and Display Payer Licence Number".
 *
 * Almost all of this story is already automated by the licence-number-length
 * story: the field's presence, its 100-character cap, its required-entry rule,
 * whitespace trimming, special characters, the list column, keyword search and
 * the export column. Two cases are left that it did not cover, and they are the
 * ones here: duplicate handling across payers, and persistence through a status
 * transition.
 *
 * NO DUPLICATE RULE IS SPECIFIED. The sheet expects a duplicate licence to be
 * refused with a "duplicate Licence Number" error but does not cite the rule,
 * and none accompanied the story. So the case asserts the sheet's expectation
 * and reports what the app actually does: if it allows two payers to share a
 * licence, that surfaces as the finding, and the missing rule is recorded as a
 * gap rather than guessed.
 */

/** A fixed licence two payers will both attempt to use. */
export const SHARED_LICENCE = 'LIC-DUP-300789';

/** The kind of error the sheet expects on a duplicate licence. */
export const DUPLICATE_HINT = /duplicate|already|unique|in use|exists/i;
