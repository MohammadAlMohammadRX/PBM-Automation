/**
 * US 20411 "Create User" (user folder 05) - 32 cases: 31 automated, 1 BLOCKED (20548).
 *
 * The Add User drawer (`user-form-drawer`, User-Foundation-Notes.md "Add / Edit
 * / Assign drawer"): step 1 User Information, step 2 Contact Information, step
 * 3 Roles and Privileges; Save -> POST CreateUser -> toast "User created / The
 * new user has been created and an activation email has been sent.". Every user
 * the drawer saves is a suite user ("QA Automation User<stamp>",
 * qa.automation.*@example.com) registered with `discardUserEmail` BEFORE Save;
 * every role chosen is a suite role ("QA Automation Role <stamp>", fixture
 * `suiteRole`); the suite never saves a shared role onto anyone but its own users.
 *
 * Literal readings and TC-vs-AC notes:
 * - 20520 / 20521 Document IDs "1234567890" / "1023456789": typed as given when
 *   no user holds them; when one does, a free National ID of the same shape
 *   is used (the "already registered" message would otherwise answer a
 *   different question).
 * - 20522 Nationality "Egypt": the Nationality list has no Egypt (14 options,
 *   GCC + Levant + Iraq / Yemen + a stray "Test"). Step 3 asserts Egypt is
 *   offered (fails = finding) and goes on with Emirati, the case's "non-Saudi".
 * - 20524 / 20525 / 20527 "non-Saudi country": Emirati (it offers Iqama, Passport, GCC ID).
 * - 20525 Boarder / Visitor / Pilgrim / Company Number: Identity Type offers
 *   only National ID, Iqama, Passport, GCC ID (AC lists the four as values) -
 *   each step asserts its type is offered (fails = finding) before the prefixes.
 * - 20526 / 20530 the duplicate "1023456789" / "john.doe@example.com": the
 *   document ID / e-mail of a SUITE user built for the case (`userIn`) - the
 *   suite never leans on another account's data. "Attempt to proceed/save":
 *   Next; when Next lets it through, the rest is completed and Save is tried -
 *   a refusal at either point is the block.
 * - 20529 the 6-character e-mail "a@b.co", the 5-character "a@b.c"; the 100 /
 *   101-character ones are valid shapes built by `emailOfLength`.
 * - 20531 ages 14 / 15 / 120 / 121: born exactly that many years ago today (Riyadh).
 * - 20532 the "manually altered" Hijri date: the auto-filled one moved one day;
 *   either an error or the Gregorian date following it passes.
 * - 20536 Gender "only Male and Female" - the live list is Other / Male /
 *   Female (AC: Male / Female): asserted literally (expected to fail).
 * - 20537 precondition "the Roles and Privileges step where Account
 *   Deactivation Date is captured": the field is on step 1 (User Information);
 *   the case is run there.
 * - 20539 "Select a non-Saudi dial code (+20)": the drawer has no dial-code
 *   control (the "+966" prefix is fixed text) and the lookup has no +20. The AC
 *   says the Nationality "sets the country code": Emirati is chosen on step 1
 *   and step 3 asserts the prefix is no longer +966 (fails = finding).
 * - 20546 "on the designated start date": the user has no start date; the
 *   activation is confirmed today. "Sign-in details are sent" = the First
 *   Activation e-mail in the Notification Center e-mail log (the password itself
 *   is masked there and never read).
 * - 20548 BLOCKED: the user-deactivation job (foundation notes table e).
 * - 20549 exploratory: the listed actions scripted; the field changed is the
 *   English Second Name.
 */
export const CASES = {
  threeSteps: { azureId: '20519' },
  saudiNationalId: { azureId: '20520', documentId: '1234567890' },
  nationalIdValid: { azureId: '20521', documentId: '1023456789' },
  nonSaudiNationalId: { azureId: '20522', nationality: 'Egypt' },
  nationalIdFormat: { azureId: '20523', documentId: '2023456789', error: /10 digits starting with 1/i },
  gccLength: { azureId: '20524', error: /8 to 15 digits/i },
  specialPrefixes: {
    azureId: '20525',
    types: [
      { name: 'Boarder Number', match: /boarder|border/i, valid: ['3000000000', '4000000000'], invalid: '2000000000' },
      { name: 'Visitor Number', match: /visitor/i, valid: ['5000000000'], invalid: '6000000000' },
      { name: 'Pilgrim Number', match: /pilgrim/i, valid: ['6000000000'], invalid: '5000000000' },
      { name: 'Company Number', match: /company/i, valid: ['7000000000'], invalid: '8000000000' },
    ],
  },
  duplicateDocumentId: { azureId: '20526', message: 'This document ID is already registered to another user.' },
  documentIdLength: { azureId: '20527', limit: 50 },
  invalidEmail: { azureId: '20528', email: 'invalid-email', error: /valid email/i },
  emailLength: { azureId: '20529', tooShort: 'a@b.c', shortest: 'a@b.co', longest: 100, tooLong: 101 },
  duplicateEmail: { azureId: '20530', message: (email: string) => `Email '${email}' is already used.` },
  ageRange: { azureId: '20531', ages: { under: 14, min: 15, max: 120, over: 121 } },
  hijriMatchesGregorian: { azureId: '20532', gregorian: '1995-05-10' },
  englishOnly: { azureId: '20533', value: 'أحمد', error: /English letters only/i },
  arabicOnly: { azureId: '20534', value: 'Ahmed', error: /Arabic letters only/i },
  lastNameLength: { azureId: '20535', limit: 50 },
  dropdownValues: { azureId: '20536', gender: ['Male', 'Female'], contact: ['Email', 'SMS', 'Both'], language: ['Arabic', 'English'] },
  deactivationFuture: { azureId: '20537' },
  saudiMobile: { azureId: '20538', valid: '512345678', wrongStart: '612345678', tooShort: '51234567', error: /9 digits starting with 5/i },
  nonSaudiMobile: { azureId: '20539', lengths: { under: 4, min: 5, max: 10, over: 11 } },
  noRolesPrompt: { azureId: '20540', text: 'No roles assigned yet. Use "Add New User Roles" to assign one.' },
  removeRoleCard: { azureId: '20541' },
  payerRoleWithoutPayer: { azureId: '20542', message: 'Select at least one payer for this role.' },
  unsavedOnAdd: { azureId: '20543', message: 'You have unsaved changes. If you leave now, your edits will be lost.' },
  createInactive: { azureId: '20544' },
  createActive: { azureId: '20545' },
  activateOnStartDate: { azureId: '20546' },
  noRoleAdded: { azureId: '20547', message: 'Add at least one role.' },
  deactivationJob: { azureId: '20548' },
  backAndForth: { azureId: '20549', secondName: 'Revised' },
  secondNameOptional: { azureId: '20550', invalid: 'Ahmad2', error: /English letters only/i },
} as const;

/** BLOCKED reasons (one place, so they can be switched to a real run later). */
export const BLOCKED = {
  deactivationJob:
    'the user-deactivation job (it deactivates a user on its Account Deactivation Date) is not among System Settings > Scheduled Jobs (no Jobs.* setting for it), '
    + 'so the administrator cannot move it to run inside the test - foundation notes table (e), 20548',
} as const;

/** The create toast ("User created / The new user has been created and an activation email has been sent."). */
export const CREATED = /user created/i;

/** The activation-e-mail sentence of the create toast. */
export const ACTIVATION_EMAIL = /activation email/i;

/** The e-mail log's action code of the first-activation e-mail (sign-in details). */
export const FIRST_ACTIVATION = 'firstActivation';
