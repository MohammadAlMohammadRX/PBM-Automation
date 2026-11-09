/**
 * US 14382 "Edit Member" (member folder 07) - 12 cases, all automated.
 *
 * The edit form is the Add wizard in edit mode (Member-Foundation-Notes.md
 * "Edit"): row Edit (or the view's Edit) opens "Edit Member"
 * (`member-form-drawer`) loaded through GetMemberForEdit, the same four steps
 * and fields, every field editable; Save (step 4) sends PUT UpdateMember ->
 * "Member updated / The member has been updated." No approval. Closing a dirty
 * drawer raises "Unsaved Changes" (Keep Editing / Discard Changes). Every member
 * edited is the suite's own (fixture `memberIn`), deleted at teardown.
 *
 * Literal readings and TC-vs-AC notes:
 * - "redirected to the edit form" (AC 1, 19864): the Edit Member drawer opening
 *   over the list, loaded with the record.
 * - "Submit": the wizard's Save; a step that does not validate stops the
 *   wizard there - that is the refusal on screen (writerBHelpers.submitWizard).
 * - "Display Name" (19868, 19869, 19870, 19874): the form has no Display Name
 *   field - it is composed of the names; the mandatory component edited is the
 *   ENGLISH LAST NAME (the first / second names "QA Automation" stay, so the
 *   member remains a recognisable suite member whatever the application does).
 * - 19865 Mobile "0501234567": typed as given (the TC calls it valid; the AC's
 *   "starts with 5, 9 digits" rule would refuse it - the TC is asserted).
 * - 19866 / 19867 / 19869 "invalid": letters in the mobile (19866); an invalid
 *   e-mail "member@@invalid" for the mandatory field (19867); for 19869 step 5
 *   the valid mandatory change is a new e-mail and the invalid OPTIONAL format a
 *   Hijri Date of Birth "abc" ("Enter a valid Hijri date in the format YYYY/MM/DD.").
 * - 19867 step 3 "the error message disappears": read as the transient
 *   message (toast); the inline field message belongs to the field until it is
 *   corrected. "leave the form" = the drawer's X + Discard Changes.
 * - 19870 the limit "e.g. 255": 256 Latin letters in the English last name;
 *   when the box itself stops input at the limit (step 3's first branch), step 4
 *   asserts the over-limit value was not stored.
 * - 19871 the registration field list is read off the Add New Member wizard
 *   (all four steps, one contact block added) in the same run.
 * - 19872 "a user without the Member Administrator role": the Payer Admin
 *   shaped WITHOUT UpdateMember and GetMemberForEdit (utils/member/memberRole.ts);
 *   "direct navigation": the edit form has no route of its own (a drawer), so
 *   the direct attempt is GetMemberForEdit + UpdateMember as that account
 *   (an authorization error = 401 / 403).
 * - 19874 the Display Name value in the Azure export is empty (the export
 *   stripped the markup): a script tag is used.
 * - 19875 step 2 expects the form to display the Age: the edit form has no Age
 *   field (the view shows it) - asserted literally (expected to fail).
 */
export const CASES = {
  opensEditForm: { azureId: '19864' },
  validChanges: { azureId: '19865', mobile: '0501234567', occupation: 'Engineer' },
  invalidRejected: { azureId: '19866', mobile: 'ABCDEFG' },
  correctOrLeave: { azureId: '19867', invalidEmail: 'member@@invalid' },
  mandatoryBlank: { azureId: '19868' },
  combinations: { azureId: '19869', occupation: 'QA Analyst', changedOccupation: 'Changed Occupation', invalidHijri: 'abc' },
  tooLong: { azureId: '19870', limit: 255, length: 256 },
  fieldsMatchRegistration: { azureId: '19871' },
  editDenied: { azureId: '19872', shape: { without: ['edit', 'editOpen'] }, occupation: 'QA Edit Without Right' },
  noChanges: { azureId: '19873' },
  specialCharacters: { azureId: '19874', displayName: '<script>alert("member")</script>', occupation: 'O\'Brien-Smith/Co.' },
  dobConsistency: { azureId: '19875', dateOfBirth: '1990-05-10' },
} as const;

/** The update toast ("Member updated / The member has been updated."). */
export const UPDATED = /updated/i;

/** A required-field message. */
export const REQUIRED = /required/i;

/** The e-mail format message ("Enter a valid email address."). */
export const EMAIL_INVALID = /valid email/i;

/** The Hijri format message ("Enter a valid Hijri date in the format YYYY/MM/DD."). */
export const HIJRI_INVALID = /hijri|YYYY\/MM\/DD/i;
