/**
 * US 20414 "Delete User" (user folder 08).
 *
 * How deletion works in this build (User-Foundation-Notes.md, "Profile,
 * Deactivate / Activate, Delete"): row Delete (`-delete`, gated by
 * Users.DeleteUser; the card footer has one too) -> `#pbm-dialog` "Delete User /
 * Do you want to delete {name}?" No (`cancel`) / Yes (`confirm`) -> DELETE
 * `DeleteUser?id=` -> toast "User deleted / The user has been removed and is no
 * longer available."; GetUser then 404 "Unable to load user.", the list and the
 * tiles drop it, its document ID is free again; a second delete -> 404.
 *
 * Literal readings / decisions:
 * - "System Administrator" = the suite admin; "Old Account" / "Keep Me" /
 *   "User A/B" / "Rapid Click Test" = the case's own suite users (DOC55555 etc.
 *   = the suite user's own document ID). Only suite users are ever deleted.
 * - 20577 "an inactive user exists that should be removed": a suite user
 *   created active, then deactivated. "the user row is highlighted": the row is
 *   shown (the list has no row selection).
 * - 20578 "Support Agent" (no Delete permission): a suite account holding every
 *   user right except Users.DeleteUser (decision 7), after the admin baseline.
 * - 20579 "clearly states the action is irreversible": the dialog's message
 *   must say so (/cannot be undone|irreversible|permanent/) - the live text is
 *   "Do you want to delete {name}?" (expected to FAIL - finding).
 * - 20582 "Locked" user: BLOCKED for that part - the platform never locks an
 *   account (foundation notes (d) / (e)); the Active and Inactive parts run.
 * - 20583 "only one other user account exists besides the administrator":
 *   BLOCKED - Users Administration holds other teams' accounts, which the
 *   suite must never delete (the check is data-driven: it runs if only one
 *   non-administrator account is ever listed).
 * - 20584 (decision 4): NEVER the admin. A suite account holding
 *   Users.GetUsers / GetUser / DeleteUser tries to delete ITSELF. Passes when
 *   the Delete is withheld / disabled on its own row, or the confirmation warns
 *   that it is the signed-in account; when it is confirmed anyway, the outcome
 *   must be safe: refused with a message, or the session ended cleanly (login /
 *   Session Expired). Its user is discarded by the fixture whatever happens.
 * - 20585 "rapidly confirm multiple times": Yes clicked three times in one
 *   synchronous burst; exactly ONE DeleteUser request may be sent.
 * - 20586 "backend temporarily unavailable": DeleteUser aborted in the browser
 *   (connection refused) - nothing reaches the server; an error message must be
 *   shown and the user stays.
 */
export const CASES = {
  deleteInactive: { azureId: '20577' },
  noDeletePermission: { azureId: '20578', shape: { full: true, without: ['Users.DeleteUser'] } },
  confirmationWording: { azureId: '20579' },
  cancelKeepsUser: { azureId: '20580' },
  deletedNotFound: { azureId: '20581' },
  anyStatus: { azureId: '20582' },
  lastRemainingUser: { azureId: '20583' },
  ownAccount: { azureId: '20584', shape: { with: ['Users.GetUsers', 'Users.GetUser', 'Users.DeleteUser'] } },
  rapidConfirm: { azureId: '20585', clicks: 3 },
  backendFailure: { azureId: '20586' },
} as const;

/** The confirmation ("Delete User" / "Do you want to delete {name}?"). */
export const DELETE_PROMPT = { title: /delete/i, message: /delete/i };

/** The irreversibility the confirmation must state (20579). */
export const IRREVERSIBLE = /cannot be undone|irreversible|permanent|can ?not be (restored|recovered)/i;

/** A warning that the account to delete is the signed-in one (20584). */
export const OWN_ACCOUNT_WARNING = /your own account|yourself|currently (signed|logged) in|own account/i;

/** The success toast ("User deleted / The user has been removed and is no longer available."). */
export const DELETED = /User deleted|has been removed/i;

/** An error shown to the administrator (20586). */
export const DELETE_ERROR = /error|fail|could not|couldn.t|unable|not available|try again/i;

/** The "Locked" part of 20582. */
export const LOCKED_BLOCK = 'a Locked user account - the platform never locks an account (10 wrong passwords still sign in; no lockout setting exists), so the "Delete a Locked user" step cannot be exercised';

/** 20583's precondition. */
export const LAST_USER_BLOCK = 'an environment where only one non-administrator account remains - Users Administration lists other teams\' accounts, which the suite must never delete';
