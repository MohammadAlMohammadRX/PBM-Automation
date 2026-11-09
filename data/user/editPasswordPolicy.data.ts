/**
 * US 20426 "Edit Password Policy" (user folder 18, 21 cases).
 *
 * How it works in this build (User-Foundation-Notes.md (c), PasswordPolicyTab):
 * System Settings > Settings > Password Policy - a read view (Minimum length 8,
 * Maximum length 16, Minimum distinct characters 7, the four Require ... Yes,
 * Force a change on system-issued passwords Yes, Passwords remembered 5,
 * Password expires after (days) 90, When it applies) and Edit -> the drawer
 * "Edit Password Policy". Save -> PUT SystemSettings/UpdatePasswordPolicy.
 *
 * SAFETY - the policy is GLOBAL (other teams sign in to this environment):
 * - every test that may Save calls `settingsRestore.snapshotPolicy()` BEFORE the
 *   first Save; the fixture restores the snapshot at teardown, READS IT BACK,
 *   and fails loudly when the restore does not hold. Each test also restores
 *   explicitly at its end (`restorePolicyNow`) so a changed policy lives for
 *   seconds, not for the teardown queue.
 * - the drawer's number boxes CLAMP an out-of-range value to the nearest bound
 *   and Save PERSISTS it without an error (incident 2026-11-08) - the range
 *   cases assert the AC's message and "Save does nothing" literally (they FAIL:
 *   KNOWN FINDING) and the snapshot is what puts the policy back.
 * - "Save does nothing" = no UpdatePasswordPolicy request, the drawer stays
 *   open and the stored policy still equals the snapshot.
 *
 * Literal readings / decisions:
 * - The authorised role ("permission to change settings") is the admin; 20800's
 *   restricted user is a SUITE user whose suite role holds
 *   SystemSettings.GetSystemSettings (view) but NOT UpdatePasswordPolicy -
 *   baseline first: the admin is offered Edit.
 * - 20799 test data: Minimum length 10, Passwords remembered 5, Expiry 90.
 * - 20806 precondition "Minimum length is set to 16": typed in the drawer with
 *   the first Save.
 * - 20807 precondition "Minimum length is set to 8": typed in the drawer first.
 * - 20808: the drawer's boxes show no Yes / No text - "reflects Yes / No" is the
 *   tick state; the saved view shows Yes / No. The final state LOOSENS only
 *   (uppercase and digit off, lowercase and symbol on).
 * - 20809: the toggle Save (on, then off) is real; its EFFECT steps (a
 *   system-issued password forcing / not forcing "Set a New Password") are
 *   BLOCKED - a session signed in with a system-issued password cannot be
 *   produced (foundation notes table (e)). The two Saves run first, then the
 *   test is declared BLOCKED for steps 3 and 5.
 * - 20812 precondition "Passwords remembered = 0": set through
 *   `settingsRestore.changePolicy` (API) before the suite user signs in.
 *   KNOWN FINDING: the server answers the reuse message, not "must be different".
 * - 20816 "new character requirements": symbol and digit OFF, distinct
 *   characters 5 (looser only) - set before the suite user signs in.
 * - 20817: the suite user's password is set with 8 characters, THEN the minimum
 *   is raised to 10 (temporarily - restored at the end); the user signs in with
 *   the 8-character password.
 * - 20818: the "When it applies" text must say the policy applies immediately to
 *   every new password and existing passwords are not revalidated.
 * - 20819 (exploratory) scripted: rapid checkbox toggling, a pasted non-numeric
 *   value, switching fields and re-opening without saving (no stale values),
 *   Minimum = Maximum length, every requirement on at the lowest minimum.
 */
export const CASES = {
  updatePolicy: { azureId: '20799', changes: { requiredLength: '10', passwordHistoryCount: '5', expiryDays: '90' } },
  noSettingsPermission: { azureId: '20800', rights: ['SystemSettings.GetSystemSettings'] },
  prefilled: { azureId: '20801' },
  minLengthBounds: { azureId: '20802', low: '8', high: '16' },
  minLengthOutOfRange: { azureId: '20803', low: '7', high: '17', message: 'Minimum length must be between 8 and 16.' },
  maxBelowMin: { azureId: '20804', min: '12', max: '10', message: 'Maximum length cannot be less than the minimum length.' },
  maxLengthOutOfRange: { azureId: '20805', low: '7', high: '17', message: 'Maximum length must be between 8 and 16.' },
  distinctBounds: { azureId: '20806', minLength: '16', low: '1', high: '16' },
  distinctInvalid: {
    azureId: '20807',
    minLength: '8',
    zero: '0',
    aboveMin: '10',
    rangeMessage: 'Minimum distinct characters must be between 1 and 16.',
    exceedMessage: 'Minimum distinct characters cannot exceed the minimum length.',
  },
  characterFlags: {
    azureId: '20808',
    final: { requireUppercase: false, requireLowercase: true, requireDigit: false, requireNonAlphanumeric: true },
  },
  forceChange: { azureId: '20809' },
  rememberedBounds: { azureId: '20810', low: '0', high: '24', lowShown: 'Reuse allowed' },
  rememberedOutOfRange: { azureId: '20811', value: '25', message: 'Passwords remembered must be between 0 and 24.' },
  currentNeverReused: { azureId: '20812', message: 'The new password must be different from your current password.' },
  expiryBounds: { azureId: '20813', low: '0', high: '365', lowShown: 'Never expires' },
  expiryOutOfRange: { azureId: '20814', value: '366', message: 'Password expiry must be between 0 and 365 days.' },
  anyFieldInvalid: { azureId: '20815', minLength: '10', distinct: '20', message: 'Minimum distinct characters must be between 1 and 16.' },
  appliesToNextChange: { azureId: '20816', policy: { requireNonAlphanumeric: false, requireDigit: false, requiredUniqueChars: 5 }, typed: 'a' },
  shorterPasswordStillWorks: { azureId: '20817', passwordLength: 8, newMinimum: 10 },
  whenItApplies: { azureId: '20818', immediately: /applies immediately to every new password/i, notRevalidated: /existing passwords are not revalidated/i },
  exploratory: { azureId: '20819', pasted: 'abc', toggles: 5, sameLength: '12', lowestMinimum: '8' },
} as const;

/** The view's labels of the four character requirements, by drawer flag. */
export const FLAG_LABEL = {
  requireUppercase: 'Require an uppercase letter',
  requireLowercase: 'Require a lowercase letter',
  requireDigit: 'Require a digit',
  requireNonAlphanumeric: 'Require a symbol',
} as const;

/** BLOCKED reason of 20809's effect steps (foundation notes table (e)). */
export const FORCE_EFFECT_BLOCKED =
  'steps 3 and 5 (sign in with a system-issued password and see / not see "Set a New Password") need a session signed in WITH the '
  + 'system-issued temporary password: it is masked "**********" in the e-mail log, example.com mail is undeliverable, and a reset '
  + 'clears the forced change. Steps 2 and 4 (the toggle saved on and off) ran above.';
