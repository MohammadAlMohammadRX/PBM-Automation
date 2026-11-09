/**
 * US 20421 "Sign In to the Platform" (user folder 14) - 21 cases.
 *
 * How it works in this build (User-Foundation-Notes.md, "Sign-in / reset ..."):
 * `/login` - "* Email Address" (`login-email`, placeholder "e.g. mail@mail.com",
 * NO maxlength, takes an e-mail OR a document ID), "* Password" (`login-password`,
 * masked, maxlength null in the smoke), "Forget Password?" -> /reset-password,
 * Login, the language toggle ("عربي"). Refusals are HTTP 500 shown in the
 * `login-alert` banner ("Important" + text): unknown user "Invalid login
 * attempt."; wrong password "Sign-in failed"; deactivated AND never activated
 * "Your account is inactive. Please contact your administrator.". NO lockout
 * (10 wrong passwords, then the right one signs in), no sign-in audit entry seen.
 *
 * SAFETY: every account a case signs in with, or types a WRONG password for, is
 * a suite user (`userWithPassword` / `userIn`) in a `signedOut()` window - never
 * the admin or the Payer Admin. Passwords are SuiteSecrets (never logged or
 * asserted on). Throwaway box text of the field-level cases belongs to no account.
 *
 * Literal readings / decisions:
 * - "Navigate to the User Management module => the sign-in page loads": the
 *   signed-out window opens Users Administration and lands on the sign-in page.
 * - 20697 "home page or the originally requested page": /dashboard or the
 *   Users Administration route the window asked for.
 * - 20700 "a valid username": the e-mail of an active suite user.
 * - 20703 (TC vs AC): the TC caps the PASSWORD at 50 characters (test data 50 /
 *   51); the AC says "max 50 characters, typing stops at the policy's maximum
 *   length" (16 today). The TC is asserted (50 accepted, the 51st refused).
 * - 20707 "never-activated account ... valid username and password": a suite
 *   user created inactive has NO password at all, so a generated one is typed.
 * - 20709 / 20717 deactivated: an active suite user with a known password,
 *   deactivated by the admin through the API (ToggleUserActivation).
 * - 20712 "account remains usable" after attempts 1-4: no lock reported
 *   (`lockoutUntil` null) - a correct sign-in would reset the counter.
 * - 20715 "Review the audit log": GetAuditLogs (System Settings > Audit Logs'
 *   own call) read by the admin for entries about the suite user since the case
 *   started; a sign-in entry and a FAILED sign-in entry are expected.
 * - 20716 "special characters / SQL-like syntax / script tags": both boxes get
 *   each input; nothing may execute (no dialog, no injected flag), no system
 *   error (no "An error occurred ..." / stack trace) and the standard
 *   invalid-login message is shown.
 * - Findings asserted literally (they fail today): the AC's messages ("Invalid
 *   login attempt. Invalid Username or Password", "...still not activated...",
 *   "...deactivated...", locked), no maxlength on either box, no lockout, no
 *   sign-in audit entry.
 */
export const CASES = {
  signInWithEmail: { azureId: '20697' },
  signInWithDocumentId: { azureId: '20698' },
  usernameRequired: { azureId: '20699' },
  passwordRequired: { azureId: '20700' },
  requiredInArabic: { azureId: '20701' },
  showHidePassword: { azureId: '20702' },
  passwordMaxLength: { azureId: '20703' },
  usernameMaxLength: { azureId: '20704' },
  forgotPasswordLink: { azureId: '20705' },
  unknownUsername: { azureId: '20706' },
  neverActivated: { azureId: '20707' },
  deactivated: { azureId: '20709' },
  wrongPassword: { azureId: '20711' },
  lockout: { azureId: '20712' },
  auditTrail: { azureId: '20715' },
  specialCharacters: { azureId: '20716' },
  deactivatedBeforePassword: { azureId: '20717' },
} as const;

/** The cases the environment cannot set up (foundation notes, table (e)). */
export const BLOCKED_CASES = [
  {
    azureId: '20708',
    title: 'should tell a user whose account was rejected to contact their administrator',
    reason: 'Needs an account whose registration was REJECTED in Approval Management. Registration happens only through an invitation link '
      + '(story 20422 "Register via Invitation Link", MANUAL - not automated by decision of 2026-11-08), so no rejected account can be produced.',
  },
  {
    azureId: '20710',
    title: 'should tell a user with an unconfirmed email to confirm it before signing in',
    reason: 'Needs an ACTIVE account whose e-mail is unconfirmed. Users created active are confirmed at once; users created inactive are '
      + 'unconfirmed but report "inactive" first, and activating them confirms the e-mail (verified 2026-11-08) - no such account can be produced.',
  },
  {
    azureId: '20713',
    title: 'should restrict a user with a forced password change to changing the password after signing in',
    reason: 'Needs a session signed in WITH the system-issued temporary password: it is masked in the e-mail log ("**********"), mail to the '
      + 'suite\'s example.com addresses is undeliverable (RFC 2606), and a reset - the only way the suite can know a password - clears the forced '
      + 'change (verified 2026-11-08: first activation + reset + sign-in = dashboard, no "Set a New Password" drawer).',
  },
  {
    azureId: '20714',
    title: 'should take the user through two-factor verification after a correct password when it applies',
    reason: 'Two-factor verification is OFF platform-wide (System Settings > Two-Factor Authentication: Authenticate by None, 2026-11-08); '
      + 'turning it on would put every team\'s sign-in behind an OTP, and the OTP goes to a mailbox / phone the suite cannot read.',
  },
] as const;

/** Expected texts (the story's acceptance criteria / the cases). */
export const REQUIRED_EN = 'This field is required.';
export const REQUIRED_AR = 'هذا الحقل مطلوب.';
export const INVALID_LOGIN = 'Invalid login attempt. Invalid Username or Password';
export const NOT_ACTIVATED = 'Your account is still not activated. Please contact your administrator.';
export const DEACTIVATED = 'Your account is deactivated. Please contact your administrator.';
export const LOCKED = 'Your account is locked, please try correcting entries later.';

/** 20703 / 20704 - the maximum the cases state for each box. */
export const PASSWORD_MAX = 50;
export const USERNAME_MAX = 50;

/** 20712 - the default threshold (5 failed attempts). */
export const LOCKOUT_THRESHOLD = 5;

/** 20716 - hostile inputs. The script ones set a page flag if they ever run. */
export const HOSTILE_INPUTS = [
  "' OR '1'='1",
  "admin'--",
  '<script>window.__pbmInjected=1</script>',
  '"><img src=x onerror="window.__pbmInjected=1">',
] as const;

/** A server answer that is a system error rather than a refusal. */
export const SYSTEM_ERROR = /An error occurred while processing|Exception|StackTrace|at [A-Z]\w+\.[A-Z]\w+\(/;

/** Audit entry kinds (20715). */
export const SIGN_IN_EVENT = /log\s*-?\s*in|sign\s*-?\s*in|authenticat/i;
export const FAILED_EVENT = /fail|invalid|denied|refused|unsuccessful/i;
