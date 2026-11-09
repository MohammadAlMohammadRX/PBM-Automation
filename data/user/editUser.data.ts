/**
 * US 20415 "Edit User" (user folder 09) - 25 cases: 24 automated, 1 BLOCKED (20606).
 *
 * Row Edit opens the Add User drawer as "Edit User" (`user-form-drawer`),
 * loaded through GetUser, on User Information; Save (step 3) sends PUT
 * UpdateUser -> toast "User updated / Your changes to this user have been saved
 * successfully.". Closing a dirty drawer raises "Unsaved Changes" (Keep Editing /
 * Discard Changes). Every user edited is a suite user from `userIn`
 * ("QA Automation User<stamp>", deleted at teardown); every role on it a suite
 * role. Nothing is saved onto any other account.
 *
 * Literal readings and TC-vs-AC notes:
 * - Job Title (20587, 20602, 20604, 20605) - lead decision 2026-11-08: the user
 *   has no Job Title field. A step asserts the Job Title field is offered
 *   (fails = finding), then the case is carried out on another editable field:
 *   the Mobile Number (20587, 20602, 20605) or the English Second Name (20604,
 *   so Discard is also proven on step 1's Cancel).
 * - 20587 "Sara Ahmed" and every other named user / role / payer ("Claims
 *   Processor", "Reviewer", "Payer Administrator", "Payer A / B"): a suite user
 *   with suite roles; the payers are the existing "Al sharq" (one payer) and
 *   "Al Dawaa" (the one added) - assigning a payer to a suite user changes
 *   nothing on the payer.
 * - 20588 "Viewer" without the Edit User permission: a suite account holding
 *   Users.GetUsers + Users.GetUser only (utils/user/userRole); baseline first:
 *   the administrator is offered Edit on the same row.
 * - 20592 / 20593 "existing.user@domain.com" / "DOC20001": the e-mail / document
 *   ID of a second suite user. "Click Next" - the step must not advance.
 * - 20594 the corrected e-mail: a fresh suite address (never saved).
 * - 20595 / 20596 minimum / maximum age 15 / 120 (story 20411): one day under
 *   = born 15 years ago tomorrow; at the minimum = born 15 years ago today; at
 *   the maximum = EXACTLY 120 years old (born 120 years ago today); one day over
 *   = born 120 years ago yesterday (Riyadh). (Changed 2026-11-08: the full run
 *   typed 121 years ago tomorrow as "exactly the maximum" - 120 years 364 days.)
 * - 20597 "John123!" then "John" in the English First Name (never saved).
 * - 20600 / 20601 "blocks the removal or warns": after Delete Role (20600) the
 *   card is still there or a warning about one role remaining shows; after
 *   moving the only payer back (20601) the payer is still selected, the
 *   picker's Save is refused / disabled, or a warning about one payer shows.
 *   The drawer is never saved in either case.
 * - 20606 BLOCKED: no built-in (static) account is listed in Users
 *   Administration (`isStatic` false for every user; the super admin is not in
 *   the list) - and the suite never edits an account it did not create.
 * - 20608 (lead decision: assert the TC literally): the TC records which of
 *   its three behaviours the Document ID shows (editable / read-only / editable
 *   with a confirmation) and, when editable, that the change is accepted,
 *   rejected or confirmed - and, since the Document ID "also serves as the user
 *   name", an accepted change must move the user name with it. The behaviour
 *   seen is annotated (`document-id-edit`) for the clarification the AC asks.
 * - 20609 contact number "+966500000000": "500000000" after the fixed +966.
 * - 20610 "backend unavailable": UpdateUser answered 500 by the test (route
 *   fulfilment), restored right after.
 * - 20611 the Add User drawer is read in the same test (same steps, a role
 *   card with the same payer-scoped suite role) and compared control by
 *   control, required marks and maxlength; Record Information (Edit only) is
 *   left out of the comparison.
 */
export const CASES = {
  editDetails: { azureId: '20587' },
  editDenied: { azureId: '20588', rights: ['Users.GetUsers', 'Users.GetUser'] },
  opensOnFirstStep: { azureId: '20589', steps: ['User Information', 'Contact Information', 'Roles and Privileges'] },
  mandatoryBlocksNext: { azureId: '20590' },
  backFreely: { azureId: '20591' },
  duplicateEmail: { azureId: '20592' },
  duplicateDocumentId: { azureId: '20593', error: /already registered/i },
  emailFormat: { azureId: '20594', invalid: 'invalid-email', error: /valid email/i },
  belowMinimumAge: { azureId: '20595', minAge: 15 },
  aboveMaximumAge: { azureId: '20596', maxAge: 120 },
  nameCharacters: { azureId: '20597', invalid: 'John123!', valid: 'John', error: /English letters only/i },
  addRole: { azureId: '20598' },
  removeOneOfTwoRoles: { azureId: '20599' },
  lastRole: { azureId: '20600', warning: /at least one role/i },
  lastPayer: { azureId: '20601', warning: /at least one payer/i },
  unsavedWarning: { azureId: '20602', message: 'You have unsaved changes. If you leave now, your edits will be lost.' },
  addPayer: { azureId: '20603' },
  discardChanges: { azureId: '20604', secondName: 'Lead' },
  keepEditing: { azureId: '20605' },
  builtInAccount: { azureId: '20606' },
  cleanClose: { azureId: '20607' },
  documentIdRule: { azureId: '20608' },
  profileReflects: { azureId: '20609', mobile: '500000000' },
  saveFails: { azureId: '20610' },
  sameAsAdd: { azureId: '20611' },
} as const;

/** The one payer a payer-scoped suite user starts with, and the one 20603 adds (existing payers, read only). */
export const PAYER = { first: 'Al sharq', added: 'Al Dawaa' } as const;

/** BLOCKED reasons (one place, so they can be switched to a real run later). */
export const BLOCKED = {
  builtInAccount:
    'a built-in platform account in Users Administration - none is listed (isStatic is false for every user, the super admin is not in the list; '
    + 'foundation notes table (e), 20606), and the suite never edits an account it did not create',
} as const;

/** The Job Title field the cases name (it does not exist - decision 1). */
export const JOB_TITLE = /job title/i;

/** The update toast ("User updated / Your changes to this user have been saved successfully."). */
export const UPDATED = /user updated|saved successfully/i;

/** A required-field message. */
export const REQUIRED = /required/i;
