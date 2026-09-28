/**
 * Test data for "Clone an Existing Payer Record" (Azure US 16219).
 *
 * THE FEATURE DOES NOT EXIST YET, and that is measured rather than assumed.
 * Probed live on 2026-09-27 against the payer module: no element id anywhere on
 * the payer list or the payer detail screen matches clone, copy or duplicate;
 * the word "clone" does not appear in the detail screen's text; and the detail
 * header offers exactly two actions -
 *
 *     payer-detail-edit-button, payer-detail-delete-button
 *
 * So the story has one case that can be ASSERTED - "the Clone action is
 * offered" - and it fails, which is the finding the dev team needs. The other
 * eleven all begin "clone a record and then ...", so there is nothing to
 * observe until the first one passes; they report BLOCKED naming that, rather
 * than eleven separate failures all restating the same absence.
 *
 * WHEN CLONE IS BUILT: add its id to constants/ElementIds.ts, give
 * PayerDetailPage a `clone()` method beside `editButton()`, and the eleven
 * BLOCKED cases can be written against it. Nothing else here needs to change.
 */

/** What the probe found the payer detail screen offering, 2026-09-27. */
export const DETAIL_ACTIONS_OBSERVED = [
  'payer-detail-edit-button',
  'payer-detail-delete-button',
] as const;

/**
 * The single reason the eleven dependent cases give.
 *
 * Held here so they cannot drift into eleven differently-worded versions of one
 * fact, and so that one edit retires them all when the feature lands.
 */
export const NEEDS_CLONE_FEATURE =
  'This case needs the Clone action, and the application does not offer one. Probed live on '
  + '2026-09-27: no element id on the payer list or the payer detail screen matches clone, copy '
  + 'or duplicate, the word "clone" does not appear on the detail screen, and the detail header '
  + `offers only ${DETAIL_ACTIONS_OBSERVED.join(' and ')}. The absence itself is reported as a `
  + 'FAILURE by TC-183, which is the finding for the dev team; this case is blocked behind it '
  + 'rather than restating it. Build the Clone action, add its id to constants/ElementIds.ts, '
  + 'and this case can be written against it.';

/**
 * The fields a clone must carry over, and the two it must not.
 *
 * Kept for the case that will compare a clone against its source once the
 * feature exists. The date fields are the whole point of the story: a clone
 * that copied them would inherit a window that has already been consumed, and
 * the derived status would then be computed from the SOURCE's dates.
 */
export const CLONED_FIELDS = [
  'License Number',
  'Country',
  'Email Address',
  'Phone Number',
  'Preferred Language',
  'Preferred Contact Method',
] as const;

export const NOT_CLONED_FIELDS = ['Effective Date', 'Expiry Date'] as const;
