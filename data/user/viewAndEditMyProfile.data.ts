/**
 * US 20423 "View and Edit My Profile" (user folder 15, 18 cases).
 *
 * How My Profile works in this build (User-Foundation-Notes.md, "My Profile"):
 * `/my-profile` from the header user menu. Header (initials, gender, name,
 * document ID, Active toggle + label, Change Password), a summary strip
 * (Nationality, Document ID, Mobile Number, Age - NO ids, read from the page
 * text and layout), four sections behind ONE "Expand / collapse all" button.
 * Editable in place (pencil -> input / select + Save / Cancel icons): the six
 * names, Mobile Number, Country Dial Code, Preferred Language, Preferred Contact
 * Method. Save -> POST Manage/UpdateUserProfile.
 *
 * Literal readings / decisions:
 * - EVERY case runs in a SUITE user's own session (`suiteSession`, default suite
 *   rights Users.GetUsers / GetUser / GetUsersDashboard - so "Navigate to the
 *   User Management module" opens Users Administration). The admin's own profile
 *   is never opened for editing. The English LAST name is never edited (it marks
 *   the user as the suite's for cleanup) - name cases use the first / second name.
 * - 20745 "without any permission prompt": no dialog is raised and the page
 *   loads for a user whose role holds no profile right at all.
 * - 20746 initials: the first letters of the first and last words of the shown
 *   name ("QA Automation User..." -> "QU", as observed on 2026-11-08).
 * - 20747 "in one line": the four labels' FIRST occurrences in the page (the
 *   strip precedes the sections) share one top (within 8 px). "Attempt to click
 *   or edit": every element of the strip is clicked and double-clicked; then no
 *   input / select / Save control may be visible.
 * - 20748: the sections open expanded, so each is first collapsed by its own
 *   header; the single control is then pressed twice (expand all, collapse all).
 * - 20750 / 20751 "bilingual": the English text in the English UI, then the
 *   Arabic text after switching the UI to Arabic (header toggle, this window
 *   only) - both must show.
 * - 20753 / 20754 / 20755 assert the AC's figures (5 - 15 digits, "Enter 5 to
 *   10 digits.") under the default +966 dial code.
 * - 20756: the user is created with English Second Name "Ahmed" (the case data).
 * - 20757 "independently": each Save changes ONLY its own field on the stored
 *   user (GetUser before / after, read by the admin).
 * - 20759 BLOCKED (forced password change - foundation notes table (e)).
 * - 20760 "the backend is unavailable": the profile's own load (GET
 *   Manage/GetCurrentUser) is answered 500 by the test; the message is looked
 *   for on the page and in the toasts.
 * - 20761 asserts Created At / By, Updated At / By literally - KNOWN FINDING
 *   (My Profile shows only Email Confirmed and Deactivated On).
 * - 20762: "blocks or requires resolving the first edit" = the second field does
 *   not enter edit mode while the first is still open, or a prompt is raised.
 */
export const CASES = {
  openWithoutPermission: { azureId: '20745' },
  header: { azureId: '20746' },
  summaryStrip: { azureId: '20747' },
  expandCollapseAll: { azureId: '20748' },
  editEnglishName: { azureId: '20749', newFirstName: 'Michael' },
  englishLettersOnly: {
    azureId: '20750',
    value: 'مايكل',
    messageEn: 'English letters only.',
    messageAr: 'الأحرف الإنجليزية فقط.',
  },
  arabicLettersOnly: {
    azureId: '20751',
    value: 'Michael',
    messageEn: 'Arabic letters only.',
    messageAr: 'الأحرف العربية فقط.',
  },
  nameNotEmpty: { azureId: '20752' },
  mobileLength: {
    azureId: '20753',
    fiveDigits: '51234',
    fourDigits: '5123',
    fifteenDigits: '512345678901234',
    sixteenDigits: '5123456789012345',
  },
  mobileInvalid: {
    azureId: '20754',
    nonDigits: 'abc123',
    requiredMessage: 'This field is required.',
    formatMessage: 'Enter 5 to 10 digits.',
  },
  mobileHintMismatch: {
    azureId: '20755',
    invalid: 'abc',
    elevenDigits: '51234567890',
    formatMessage: 'Enter 5 to 10 digits.',
  },
  cancelEdit: { azureId: '20756', original: 'Ahmed', unsaved: 'Khalid' },
  dropdownFields: {
    azureId: '20757',
    dialCode: /^\+971\b/,
    language: /^(arabic|العربية|عربي)$/i,
    contactMethod: /^(sms|رسالة نصية|الرسائل النصية)$/i,
  },
  readOnlyFields: { azureId: '20758' },
  forcedChangePending: { azureId: '20759' },
  loadFailure: { azureId: '20760', message: 'Your profile could not be loaded.' },
  recordInformation: {
    azureId: '20761',
    labels: ['Created At', 'Created By', 'Updated At', 'Updated By', 'Email Confirmed', 'Deactivated On'],
  },
  oneFieldAtATime: { azureId: '20762' },
} as const;

/** The editable keys (pencil ids) My Profile may offer - anything else carrying a pencil is a read-only field made editable. */
// "age" is matched as a whole key only: as a bare substring it caught "preferredlanguageid" (langu-AGE) - full run 20758.
export const READ_ONLY_PATTERN = /email|role|status|gender|nationality|identity|document|dob|^age$|login|confirmed|deactivat/i;

/** A required-field message (the AC: "This field is required."). */
export const REQUIRED_MESSAGE = /this field is required|required/i;

/** BLOCKED reason of 20759 (foundation notes table (e)). */
export const FORCED_CHANGE_BLOCKED =
  'a session signed in WITH the system-issued temporary password (a pending forced change): the temporary password is masked '
  + '"**********" in the e-mail log, example.com mail is undeliverable, and a reset - the only way the suite can know a password - '
  + 'clears the forced change (verified 2026-11-08: first activation + reset + sign-in = dashboard, no "Set a New Password" drawer)';
