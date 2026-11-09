/**
 * US 20427 "Logout and Session Expiry" (user folder 19) - 19 cases.
 *
 * How it works in this build (User-Foundation-Notes.md, "Sign-in / reset ..."
 * and (c)): the header user menu (`app-header-user-menu-*`: My Profile, Change
 * Password, Logout). Logout -> POST Account/Logout -> /login; a deep link
 * afterwards lands on `/login?returnUrl=<path>` and the next sign-in goes to the
 * returnUrl. There is NO session-expiry / idle-timeout setting in System
 * Settings and NO idle timer or pre-expiry warning in the bundle: the session is
 * the access token (`exp` ~60 minutes after sign-in) plus a refresh token.
 * Session Expired = the shared `#pbm-dialog` the HTTP interceptor raises on a
 * 401: "Session Expired" / "Your session has expired. Please sign in again to
 * continue." / "Go to Login Page" -> /login. No sign-out audit entry was seen.
 *
 * SAFETY: every Logout / expiry is done in a SUITE user's window (`suiteSession`)
 * - never the administrator's (its Logout would end the shared admin session the
 * rest of the run signs in with). The administrator's window only reads its
 * menu (20820, 20836) and the audit log. Windows that have logged out are driven
 * with raw navigation only: the page objects' `open()` signs the ADMIN in when
 * it lands on /login.
 *
 * Literal readings / decisions:
 * - 20820 "at least three different screens": Dashboard, Users Administration,
 *   Invitations and My Profile in the administrator's window (menu read only).
 * - 20822 "backend unreachable": every /api/ call of the suite window is
 *   aborted (route) before Logout.
 * - 20828 / 20829 (Session Expired SCREEN): `expireSessionNow()` (token voided,
 *   refresh token removed), then the next user action (the side menu's
 *   Dashboard link) - per decision 5.
 * - 20830 / 20832 "the session has expired": the token's `exp` is moved into the
 *   past and the refresh token removed (`expireTokenClock`) - what an hour of
 *   idling leaves in the browser; 20830 then closes the tab and reopens the
 *   platform in the same browser; 20832 deep-links to the suite user's own
 *   profile page (`/users-management/users-administration/profile/{id}`).
 * - 20831 / 20833 audit: GetAuditLogs read by the admin for entries about the
 *   suite user since the case started; a sign-out (20831) / timeout (20833)
 *   entry is expected.
 * - 20834 "Device A / Device B": two separate browser windows signed in as the
 *   same suite user.
 * - 20837 step 5 (activity during the pre-expiry warning) is a waiting part
 *   (decision 5).
 * - 20838: the case needs a session-expiry setting; there is none - the first
 *   step asserts one is offered (fails = finding) and the rest depend on it.
 * - 20835 is BLOCKED (forced change - foundation notes table (e)).
 * - Findings asserted literally (they fail today): no pre-expiry warning, no
 *   session setting, no sign-out / timeout audit entry.
 */
export const CASES = {
  logoutOnEveryScreen: { azureId: '20820' },
  logoutEndsSession: { azureId: '20821' },
  logoutOffline: { azureId: '20822' },
  sessionEndsByItself: { azureId: '20823' },
  silentRenewal: { azureId: '20824' },
  warningTwoMinutes: { azureId: '20825' },
  idleEndsAfterWarning: { azureId: '20826' },
  warningAsConfigured: { azureId: '20827' },
  expiredScreen: { azureId: '20828' },
  goToLoginPage: { azureId: '20829' },
  reopenAfterExpiry: { azureId: '20830' },
  signOutAudited: { azureId: '20831' },
  returnToRequestedPage: { azureId: '20832' },
  timeoutAudited: { azureId: '20833' },
  noSignOutEverywhere: { azureId: '20834' },
  sameForEveryRole: { azureId: '20836' },
  unusualActions: { azureId: '20837' },
  configurablePeriod: { azureId: '20838' },
} as const;

/**
 * Decision 5 (lead, 2026-11-08): the session lives ~60 minutes (the access
 * token) and no setting shortens it; a 60+ minute wait per case is pending the
 * user's decision. While this is a string, the idle-warning / renewal / waiting
 * parts of 20823, 20824, 20825, 20826, 20827, 20833, 20836 and 20837 are
 * BLOCKED with it; set it to null to run the real waits.
 */
export const SESSION_WAIT_BLOCKED: string | null = 'Needs a session that ends while the case watches: the session lives ~60 minutes (the access token) and no setting '
  + 'shortens it (System Settings has no session / idle key), so a 60+ minute wait per case is pending the user\'s decision (decision 5, 2026-11-08).';

/** The cases the environment cannot set up (foundation notes, table (e)). */
export const BLOCKED_CASES = [
  {
    azureId: '20835',
    title: 'should let a user undergoing a forced password change sign out although the drawer shows no Sign Out button',
    reason: 'Needs a session signed in WITH the system-issued temporary password (the "Set a New Password" drawer): it is masked in the e-mail '
      + 'log ("**********"), mail to the suite\'s example.com addresses is undeliverable (RFC 2606), and a reset - the only way the suite can know '
      + 'a password - clears the forced change (verified 2026-11-08: first activation + reset + sign-in = dashboard, no drawer).',
  },
] as const;

/**
 * 20838 steps 2-5: changing a session-expiry setting is a GLOBAL change that
 * must be restored and read back; no such setting exists today, so there is no
 * key, range or restore to automate. Reached only if step 1 ever finds one.
 */
export const SESSION_SETTING_NOT_AUTOMATED = 'A session-expiry setting now exists in System Settings, but changing it (minimum / maximum, then restore '
  + 'and read back) is not automated yet - update 20838 with the key, its range and a settingsRestore-style restore before running it.';

/** Expected texts. */
export const EXPIRED_TITLE = 'Session Expired';
export const EXPIRED_MESSAGE = 'Your session has expired. Please sign in again to continue.';
export const EXPIRED_ACTION = 'Go to Login Page';
export const LOGOUT_LABEL = /^log\s*-?\s*out$/i;

/** 20834 - an "everywhere" sign-out option (out of scope - must not exist). */
export const SIGN_OUT_EVERYWHERE = /all devices|every device|everywhere|all sessions|other sessions/i;

/** 20825 - the warning comes this many seconds before the end. */
export const WARNING_LEAD_SECONDS = 120;

/** 20837 step 4 - Logout clicks in quick succession. */
export const RAPID_CLICKS = 3;

/** Audit entry kinds (20831 / 20833). */
export const SIGN_OUT_EVENT = /log\s*-?\s*out|sign\s*-?\s*out/i;
export const TIMEOUT_EVENT = /time\s*-?\s*out|expir/i;

/** An error a stable logout must not show. */
export const ERROR_TEXT = /error|failed|exception|went wrong/i;
