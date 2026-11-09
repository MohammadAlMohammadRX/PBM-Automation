/**
 * US 20424 "Reset Forgotten Password" (user folder 16) - 16 cases.
 *
 * How it works in this build (User-Foundation-Notes.md, "Sign-in / reset ..."):
 * Step 1 "Sending an Email" (`reset-email`, NO maxlength): "Enter a valid email
 * address." for "user@@example"; Continue -> POST ForgotPassword -> toast
 * "Password reset link was sent. Please check your email." -> /login - the same
 * text for an unknown address, BUT the answer differs (`code` null and
 * `displayConfirmPasswordLink` false for an unknown address; the REAL reset code
 * for a known one). Step 2 "Reset your Password" opens from the e-mailed link
 * `?email=&code=` (`ResetPasswordPage.openWithCode` with the code from
 * ForgotPassword's own answer = the code the link carries): password +
 * confirm, live checklist (`reset-password-requirements-rule-*`, class
 * `is-met`), Save Password -> "Your password has been reset" -> /login. A used
 * code -> "Invalid token."; a remembered password -> "You cannot reuse any of
 * your last 5 passwords..."; "abc" -> 422 "Password must be at least 6
 * characters."; a MISMATCHED confirm is ACCEPTED by the server (screen check only).
 *
 * SAFETY: every address a reset is requested for is a suite address
 * (`qa.automation.*@example.com`); every reset is of a suite user. Passwords are
 * generated SuiteSecrets - never logged, never asserted on. "Not saved" is
 * proven by the PREVIOUS password still signing in (API, the case's own window).
 *
 * Literal readings / decisions:
 * - "Navigate to the User Management module => the module is accessible": a
 *   window without a session opens Users Administration and lands on the
 *   sign-in page, whose Forget Password? link opens step 1.
 * - "Open the reset link": step 2 opened with the suite user's own reset code
 *   (the e-mailed link's host is http://127.0.0.1:56291 - a finding of the
 *   foundation, not of these cases).
 * - 20766 "preventing account enumeration": besides the identical message, the
 *   two ForgotPassword answers must not tell the addresses apart (asserted -
 *   they do today: finding).
 * - 20767 "an actual reset email is delivered": the platform's e-mail log
 *   (Notification Center TriggersAudit) holds a "Forget Password" e-mail to the
 *   address; example.com mail is refused by the relay (RFC 2606), so the logged
 *   e-mail - not the inbox - is the evidence. "Unconfirmed e-mail" and "no
 *   password set": the environment can produce only ONE such account - a suite
 *   user created inactive is BOTH unconfirmed and passwordless (an active user
 *   is confirmed at once and always has a system-issued password) - one is used
 *   for each step.
 * - 20768 (decision 5): the link lives one hour and no setting shortens it ->
 *   RESET_LINK_WAIT_BLOCKED (null = run the real 61-minute wait).
 * - 20774 "pending forced password change": a suite user created ACTIVE (its
 *   system-issued password carries the forced change); "flag cleared" = signing
 *   in with the new password reaches the dashboard with no "Set a New
 *   Password" drawer.
 * - 20776 "submitted 3 times rapidly": a double-click on Continue, then a third
 *   submission straight after.
 * - 20777 is one Azure step checked as three (mandatory, 50 characters, format).
 * - Findings asserted literally (they fail today): no maxlength on the e-mail
 *   box, the answers differ for unknown addresses, a mismatched confirm saves.
 */
export const CASES = {
  requestLink: { azureId: '20763' },
  invalidEmailFormat: { azureId: '20764' },
  emailMaxLength: { azureId: '20765' },
  sameMessage: { azureId: '20766' },
  linkOnlyWhenEligible: { azureId: '20767' },
  linkExpiresAfterHour: { azureId: '20768' },
  linkSingleUse: { azureId: '20769' },
  liveChecklist: { azureId: '20770' },
  policyRejected: { azureId: '20771' },
  historyRejected: { azureId: '20772' },
  mismatchBlocked: { azureId: '20773' },
  resetSucceeds: { azureId: '20774' },
  logInLink: { azureId: '20775' },
  rapidRequests: { azureId: '20776' },
  emailConstraints: { azureId: '20777' },
  confirmRequired: { azureId: '20778' },
} as const;

/**
 * Decision 5 (lead, 2026-11-08): a reset link lives ~60 minutes and no setting
 * shortens it; a 60+ minute wait per case is pending the user's decision. While
 * this is a string, 20768 is BLOCKED with it; set it to null to run the real
 * wait (61 minutes).
 */
export const RESET_LINK_WAIT_BLOCKED: string | null = 'Needs a reset link older than one hour: the link lives ~60 minutes and no setting shortens it, '
  + 'so the case needs a 61-minute wait - a 60+ minute wait per case is pending the user\'s decision (decision 5, 2026-11-08).';

/** How long the case waits for the link to expire when RESET_LINK_WAIT_BLOCKED is null. */
export const RESET_LINK_WAIT_MINUTES = 61;

/** Expected texts (the story's acceptance criteria / the cases). */
export const LINK_SENT = 'Password reset link was sent. Please check your email.';
export const INVALID_EMAIL = 'Enter a valid email address.';
export const REQUIRED = 'This field is required.';
export const INVALID_TOKEN = 'Invalid token.';
export const PASSWORD_REUSED = /You cannot reuse any of your last \d+ passwords\. Please choose a different one\./;
export const PASSWORDS_DIFFER = 'Passwords do not match.';
export const PASSWORD_RESET = 'Your password has been reset';

/** 20765 / 20777 - the e-mail box maximum. */
export const EMAIL_MAX = 50;

/** 20764 / 20777 - an invalid format (the case's own example). */
export const MALFORMED_EMAIL = 'user@@example';

/** 20771 - the case's weak password (not a credential of anyone). */
export const WEAK_PASSWORD = 'abc';

/** 20770 - the case's partial input, and what it meets once typed. */
export const PARTIAL_INPUT = 'Pass1';
export const PARTIAL_MEETS = ['uppercase', 'lowercase', 'digit'] as const;
export const PARTIAL_MISSES = ['lengthrange', 'symbol'] as const;

/** 20767 - how long to watch the e-mail log for a reset e-mail that must NOT come. */
export const NO_EMAIL_WATCH_MS = 20_000;
