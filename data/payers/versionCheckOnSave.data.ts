/**
 * Test data for "Check the Record Version at Save Time".
 *
 * THE SAME MECHANISM AS THE CONCURRENT-EDIT STORY, ASKED FROM THE OTHER END.
 * That story asks whether a stale save is prevented; this one asks whether the
 * version is CHECKED at save time - whether the save carries the version it
 * loaded, whether a matching version is accepted, and what the user is told
 * when it does not match.
 *
 * So `CONFLICT_RESPONSE` and `CONFLICT_MESSAGE_PATTERNS` are re-exported from
 * `concurrentEdit.data.ts` rather than restated: one 409, one reason string,
 * one place to change them.
 *
 * WHAT WAS ALREADY VERIFIED THERE, and is relied on here:
 *
 *   A save made from a copy loaded before someone else's save is rejected with
 *   HTTP 409 and "This payer has been modified since it was loaded. Please
 *   refresh and try again."
 *
 *   The interface reports NOTHING on that 409 - no toast, no inline error, no
 *   banner. The drawer stays open as if Save had not been pressed.
 *
 * THE VERSION IS VISIBLE IN THE LIST. Each payer's approval cell reads
 * "v<N> · <status>", so a case can assert that a successful save increments the
 * version and a rejected one does not - which is how the sheet's "the record
 * remains at v2" checks are made without reading the API.
 */

export {
  CONFLICT_RESPONSE,
  CONFLICT_MESSAGE_PATTERNS,
} from './concurrentEdit.data';

/** The fields the two sessions edit - deliberately different ones. */
export const VERSION_CHECK_FIELDS = {
  first: { label: 'License Number', value: 'LIC-VERSION-A' },
  // National format, no country prefix. The box strips "+" and caps at ten
  // digits - see payerCreationFields.data - so "+966512340001" was held as
  // something else entirely and the read-back assertion that guards this
  // precondition failed before the version check was ever exercised.
  second: { label: 'Phone Number', value: '512340001' },
  /** A third value, for the case that retries after refreshing. */
  retry: { label: 'License Number', value: 'LIC-VERSION-B' },
} as const;

/** How many blocked attempts the repeat case makes before checking the record. */
export const REPEATED_BLOCKED_SAVES = 3;

/** How many times the double-click case presses Save. */
export const RAPID_SAVE_CLICKS = 3;

/**
 * How many versions a single accepted save should add.
 *
 * One. The sheet's "saves once to v2, with no duplicate save" is a statement
 * about this number, and it is what a missing click guard would break.
 */
export const EXPECTED_VERSION_INCREMENT = 1;

/** The account the read-only case needs. */
export const RESTRICTED_ROLE_REQUIREMENT = {
  role: 'a payer role with read-only access',
  reason:
    'The case exists to prove a save is refused for a user who may view a payer but not change '
    + 'it. The shared administrator session holds every permission, so running it as the '
    + 'administrator would assert nothing.',
} as const;
