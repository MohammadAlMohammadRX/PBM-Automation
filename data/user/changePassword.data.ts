/**
 * US 20425 "Change Password" (user folder 17, 20 cases).
 *
 * How it works in this build (User-Foundation-Notes.md, "Change password"):
 * header user menu > Change Password, or My Profile > Change Password, opens
 * the drawer `change-password-drawer` (Current / New / Confirm, masked; the live
 * "Password requirements" checklist; the strength meter; Cancel / Change
 * Password). Submit -> POST Manage/ChangePassword. Two-factor is OFF.
 *
 * Literal readings / decisions:
 * - EVERY case runs in a SUITE user's own session (`suiteSession`, a password the
 *   suite set through the reset flow - a SuiteSecret, never logged or asserted).
 *   The admin's password is never typed or changed. New passwords are generated
 *   at runtime (`generatePassword`, the live policy).
 * - "the password is unchanged" is proven by signing in (API, no browser) with
 *   the suite user's known password afterwards.
 * - The case data's literal passwords (Passw0rd!2024 ...) are NOT used: the
 *   suite's own generated passwords take their place (same roles: current,
 *   new, a previous one). Throwaway strings that are never accepted as a
 *   password stay literal: "abc" (20790), "newpassword1" (20796), the strength
 *   meter's guidance input (20793).
 * - 20785 precondition "a pending forced change, the issued password unknown":
 *   a suite user created ACTIVE (`userIn('Active')`) - the system issued its
 *   password (masked in the e-mail log, unknown to the suite) and the policy
 *   forces a change of system-issued passwords. "Open the emailed reset link":
 *   the reset code is taken from the "Forget Password" e-mail in the Notification
 *   Center audit (the link's own host is wrong - known finding - so the reset
 *   page is opened on the application's host with the link's code).
 * - 20787 "a previously used password": the suite user first changes its
 *   password through the drawer (P0 -> P1), then tries P0 again. KNOWN FINDING:
 *   the previous password was ACCEPTED on 2026-11-08 (history not enforced).
 * - 20788 / 20812: AC "The new password must be different from your current
 *   password." - KNOWN FINDING: the server answers the reuse message instead.
 * - 20791 "policy maximum length is 16": the live maximum is read (16 on
 *   2026-11-08) - the case types that many characters, then one more. KNOWN
 *   FINDING: the drawer boxes have NO maxlength.
 * - 20792 precondition "the policy requires only some rules": the policy is
 *   loosened through `settingsRestore` (lowercase / digit / symbol off, distinct
 *   characters 1) BEFORE the suite user signs in, and restored (read back) at
 *   teardown. "Distinct characters" counts as imposed only above 1.
 * - 20793: the meter must pass Weak -> Fair -> Good -> Strong in that order as
 *   the guidance string is typed one character at a time.
 * - 20796: AC message "Password does not meet the password policy." - KNOWN
 *   FINDING: the server answered "Password cannot contain 'password'." for
 *   "newpassword1".
 * - 20798 "a user holding an administrative role": a second suite user whose
 *   suite role holds EVERY Users / Invitations / System Settings right (the
 *   admin's own drawer is never used); "a standard role": the default suite role.
 * - BLOCKED (foundation notes table (e)): 20781, 20782, 20783, 20797 (forced
 *   change - a session signed in with the system-issued password cannot be
 *   produced), 20784 (password expiry - needs a password older than the expiry
 *   age and the expiry job).
 */
export const CASES = {
  changeOwnPassword: { azureId: '20779' },
  openFromProfile: { azureId: '20780' },
  lostIssuedPassword: { azureId: '20785', resetSent: /reset link was sent/i },
  wrongCurrent: { azureId: '20786', message: 'Incorrect password.' },
  rememberedPassword: { azureId: '20787', message: /^You cannot reuse any of your last \d+ passwords\. Please choose a different one\.$/ },
  sameAsCurrent: { azureId: '20788', message: 'The new password must be different from your current password.' },
  confirmMismatch: { azureId: '20789', message: 'Passwords do not match.' },
  invalidFields: { azureId: '20790', newPassword: 'abc', message: 'Please fix the highlighted fields before changing your password.' },
  maxLength: { azureId: '20791' },
  checklistFollowsPolicy: {
    azureId: '20792',
    policy: { requireLowercase: false, requireDigit: false, requireNonAlphanumeric: false, requiredUniqueChars: 1 },
    typed: 'a',
  },
  strengthMeter: { azureId: '20793', weak: 'abc', extension: 'DE12!@Xy9#', run: ['Weak', 'Fair', 'Good', 'Strong'] },
  cancel: { azureId: '20794' },
  currentRequired: { azureId: '20795', typed: 'abc' },
  policyViolation: { azureId: '20796', newPassword: 'newpassword1', message: 'Password does not meet the password policy.' },
  anyRole: { azureId: '20798' },
} as const;

/** Forced-change resource (foundation notes table (e)). */
const FORCED =
  'a session signed in WITH the system-issued temporary password (the forced "Set a New Password" state): the temporary password '
  + 'is masked "**********" in the e-mail log, example.com mail is undeliverable, and a reset - the only way the suite can know a '
  + 'password - clears the forced change (verified 2026-11-08: first activation + reset + sign-in = dashboard, no forced drawer)';

/** The cases that cannot be exercised in this environment - data-driven BLOCKED tests. */
export const BLOCKED_CASES = [
  { azureId: '20781', title: 'should open "Set a New Password" with no way out when a user signs in with a system-issued password', reason: FORCED },
  { azureId: '20782', title: 'should explain why the password must be changed when the forced "Set a New Password" drawer opens', reason: FORCED },
  { azureId: '20783', title: 'should allow only changing the password, signing out or resetting it when a forced change is pending', reason: FORCED },
  {
    azureId: '20784',
    title: 'should block a signed-in user with the forced drawer when the daily job marks the password expired',
    reason: 'a password older than the expiry age (minimum 1 day) and the daily password-expiry job: no Jobs.* setting exists for it in '
      + 'System Settings > Scheduled Jobs, so it cannot be moved, and a suite password is always minutes old',
  },
  { azureId: '20797', title: 'should lift the block and restore full access when the forced password change is completed', reason: FORCED },
] as const;
