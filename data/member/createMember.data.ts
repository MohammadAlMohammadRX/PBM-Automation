/**
 * US 14380 "Create Member" (member folder 05) - 40 cases, all automated.
 *
 * The Create flow is the Add New Member wizard (`member-form-drawer`,
 * Member-Foundation-Notes.md "Create"): 1 Member Information, 2 Non-National
 * Registry, 3 Address, 4 Emergency Contacts; Next validates the step on
 * screen, Save (step 4) sends CreateMember -> "Member created / The member has
 * been created." No approval. The ADMINISTRATOR is the "Member Administrator"
 * (no such account exists - Member-Writers-Brief.md).
 *
 * Literal readings and TC-vs-AC notes:
 * - "Create Member" / "Submit" / "click confirm": the list's Add New Member
 *   button / the wizard's Save; a step that does not validate stops the wizard
 *   there (utils/member/writerBHelpers.submitWizard).
 * - Literal document IDs ("1234567890", "2123456789", the GCC / border / visitor
 *   ... values) are used when no member holds them, else one of the same
 *   length and first character (literalOrFreeDocumentId) - the wizard refuses a
 *   taken ID on blur. 19816's "member@example.com" is made unique per run (the
 *   wizard refuses an e-mail another member uses).
 * - Mobile numbers: the wizard shows "+966" as fixed text before the box, so the
 *   case's "+966512345678" is typed as "512345678" (the national part).
 * - "Click Next" on a step-1 case: every other mandatory step-1 field is filled
 *   with valid values (the case's "Step 1 passes validation" needs them).
 * - 19819 / 19826 "locked": the Identity Type select read-only / disabled. On
 *   2026-11-05 a Saudi gets National ID preset and as the ONLY option, the select
 *   stays enabled (foundation) - step 3 fails on "read-only" (finding); step 4
 *   asserts the value cannot be changed to another type. 19826: the form has no
 *   "document type" field - read as the Identity Type showing Iqama / Resident
 *   and locked (Passport / GCC ID stay offered - finding).
 * - 19827-19830: the identity type lookup holds ONLY National ID / Iqama /
 *   Passport / GCC ID (foundation) - the case asserts its type is offered and
 *   fails there (finding: no Border / Visitor / Pilgrim / Company Number).
 * - 19835 precondition "a member with Document ID 1234567890 already exists":
 *   a suite member is built and ITS document ID is the duplicate.
 * - 19836 "2027-01-01": used while it is still in the future, else tomorrow.
 *   The picker's max date (today) may refuse the typed date at entry - that is
 *   recorded as the refusal itself.
 * - 19838 Hijri "25-10-1415" typed in the field's format YYYY/MM/DD (1415/10/25).
 * - 19839 TC vs AC: the AC says typing a Hijri date FILLS the Date of Birth, so
 *   the two cannot stay mismatched on screen (the app re-syncs them); the TC
 *   expects both fields to hold mismatched values and Next to refuse - asserted
 *   literally (expected to fail: the decision item).
 * - 19840-19843 the AC rule "starts with 5, 9 digits only": the wizard has NO
 *   format / length check (foundation) - 19841-19843 fail (finding).
 * - 19849 "Click Edit on the added contact": a contact block is edited in place
 *   (no separate Edit button) - the step asserts the block takes the new value.
 * - 19853 "click confirm": contacts are not confirmed one by one; Save checks
 *   every block - the Save is the confirm.
 * - 19854 "a user without Member Administrator role": the Payer Admin shaped
 *   WITHOUT CreateMember (utils/member/memberRole.ts); the admin's Add New
 *   Member is the baseline; a direct CreateMember as that account must be refused.
 * - 19855 the specification is the story's AC: Hijri Date of Birth is read as
 *   MANDATORY ("Dual-calendar Date of birth and Hijri Date of Birth (Mandatory)")
 *   and the contact Phone Number as OPTIONAL (the AC marks only Name and
 *   Relationship required) - literal readings.
 * - 19852 exploratory -> a fixed script: back / next with data retained,
 *   rapid Nationality switching (Identity Type follows the rule every time),
 *   a browser refresh mid-wizard (the wizard is cleanly discarded: closed, no
 *   member created, a reopened wizard is empty), no page error at any point.
 * - 20342 "Patient Management / Add Patient" = Member Mgmt / Add New Member; its
 *   first two steps have no expected result (actions). There is NO Country Dial
 *   Code control (foundation) - steps 3-5 fail (finding).
 */
export const CASES = {
  createAllSteps: { azureId: '19816', documentId: '1234567890', eHealthId: 'EH-QA-19816', mobile: '+966512345678', email: 'member@example.com', contactMethod: 'Email', language: 'English', country: 'Saudi Arabia' },
  englishFirstBlank: { azureId: '19818' },
  saudiIdentityLocked: { azureId: '19819' },
  thirdNamesBlank: { azureId: '19820' },
  saudiIdValid: { azureId: '19821', documentId: '1234567890' },
  arabicFirstBlank: { azureId: '19822' },
  saudiIdShort: { azureId: '19823', documentId: '123456789' },
  saudiIdLong: { azureId: '19824', documentId: '12345678901' },
  saudiIdWrongStart: { azureId: '19825', documentId: '2234567890' },
  iqamaLocked: { azureId: '19826', documentId: '2123456789' },
  borderNumber: { azureId: '19827', typeName: 'Border Number', type: /border/i, documentIds: ['3123456789', '4123456789'] },
  visitorNumber: { azureId: '19828', typeName: 'Visitor Number', type: /visitor/i, documentId: '5123456789' },
  pilgrimNumber: { azureId: '19829', typeName: 'Pilgrim Number', type: /pilgrim/i, documentId: '6123456789' },
  companyNumber: { azureId: '19830', typeName: 'Company Number', type: /company/i, documentId: '7123456789' },
  passportSpecial: { azureId: '19831', documentId: 'AB-12345!' },
  gccInRange: { azureId: '19832', documentIds: ['12345678', '123456789012345'] },
  gccShort: { azureId: '19833', documentId: '1234567' },
  gccLong: { azureId: '19834', documentId: '1234567890123456' },
  duplicateDocument: { azureId: '19835' },
  futureDob: { azureId: '19836', dateOfBirth: '2027-01-01' },
  gregorianFillsHijri: { azureId: '19837', dateOfBirth: '1995-05-15' },
  hijriFillsGregorian: { azureId: '19838', hijri: '1415/10/25' },
  datesMismatch: { azureId: '19839', dateOfBirth: '2000-01-01', hijri: '1430/01/01' },
  mobileValid: { azureId: '19840', mobile: '+966512345678' },
  mobileNotFive: { azureId: '19841', mobile: '+966612345678' },
  mobileShort: { azureId: '19842', mobile: '+96651234567' },
  mobileLong: { azureId: '19843', mobile: '+9665123456789' },
  emailInvalid: { azureId: '19844', email: 'member@@invalid' },
  addressCountryOnly: { azureId: '19845', country: 'Saudi Arabia' },
  contactMethodBlank: { azureId: '19846' },
  oneContact: { azureId: '19847', contact: { name: 'Fatima Al-Saleh', relationship: 'Spouse', phoneNumber: '+966523456789' } },
  twoContacts: {
    azureId: '19848',
    contacts: [
      { name: 'QA Spouse Contact', relationship: 'Spouse', phoneNumber: '512345601' },
      { name: 'QA Parent Contact', relationship: 'Parent', phoneNumber: '512345602' },
    ],
  },
  editContact: { azureId: '19849', contact: { name: 'QA Parent Contact', relationship: 'Parent', phoneNumber: '512345603' }, newRelationship: 'Other' },
  removeContact: { azureId: '19850', contact: { name: 'QA Removed Contact', relationship: 'Spouse', phoneNumber: '512345604' } },
  stepGate: { azureId: '19851' },
  exploratory: { azureId: '19852' },
  contactNoName: { azureId: '19853', relationship: 'Child', phoneNumber: '512345605' },
  createDenied: { azureId: '19854', shape: { without: ['create'] } },
  fieldChecklist: { azureId: '19855' },
  countryDialCode: { azureId: '20342', defaultCode: '+966' },
} as const;

/** Messages the wizard shows (Member-Foundation-Notes.md "Create"). */
export const MESSAGE = {
  required: /required/i,
  saudiId: /10 digits starting with 1/i,
  gccId: /8 to 15 digits/i,
  passport: /letters and numbers only/i,
  duplicate: /already registered|already.*(used|exists)/i,
  email: /valid email/i,
  /** The create toast "Member created / The member has been created.". */
  created: /created/i,
} as const;

/**
 * 19855: the fields the AC lists per step, as the wizard labels them, and the
 * ones the AC makes mandatory (literal: Hijri Date of Birth mandatory, the
 * contact Phone Number optional).
 */
export const SPEC_FIELDS = {
  1: {
    labels: ['First Name', 'Second Name', 'Third Name', 'Last Name', 'الاسم الأول', 'الاسم الثاني', 'الاسم الثالث', 'اسم العائلة', 'E-Health ID', 'Nationality', 'Identity Type', 'Document ID', 'Date of Birth', 'Hijri Date of Birth', 'Gender', 'Place of Birth', 'Occupation', 'Marital Status', 'Member Status', 'Member Active Status', 'Special Needs'],
    required: ['First Name', 'Second Name', 'Last Name', 'الاسم الأول', 'الاسم الثاني', 'اسم العائلة', 'Nationality', 'Identity Type', 'Document ID', 'Date of Birth', 'Hijri Date of Birth', 'Gender', 'Member Status'],
  },
  2: {
    labels: ['Insurance Number', 'Mobile Number', 'Email', 'Preferred Contact Method', 'Preferred Language', 'Blood Group', 'VIP'],
    required: ['Mobile Number', 'Email', 'Preferred Contact Method', 'Preferred Language'],
  },
  3: {
    labels: ['Country', 'City', 'District', 'Street', 'Building Number', 'Postal Code', 'Additional Number'],
    required: ['Country'],
  },
  4: {
    labels: ['Name', 'Relationship', 'Phone Number'],
    required: ['Name', 'Relationship'],
  },
} as const;
