/**
 * US 20409 "Search and Filter Users" (user folder 03), 15 cases.
 *
 * How the cases map onto the live list (2026-11-08, User-Foundation-Notes.md):
 *  - Quick Search = the list's search box (`searchText`, debounced; each search
 *    awaits ITS OWN answer). Advance Search = the Filters drawer "Advance Search
 *    for Users": Name, Document ID, Nationality, Identity Type, Mobile Number,
 *    Status, Gender -> request `name`, `documentId`, `nationalityId`,
 *    `identityTypeId`, `mobileNumber`, `isActive`, `genderId`; applied filters
 *    show as chips (`user-list-filter-chips-chip-{key}` with a remove button).
 *  - The cases' sample people ("John Smith", "أحمد علي", Document ID
 *    1234567890, john.smith@example.com, 9988776655 / 0501234567) are replaced by
 *    a SUITE user built per case with the same kind of value (its full English
 *    name, its full Arabic name, its document ID, its e-mail, its document ID +
 *    mobile number) - the shared register is never changed. A unique stamp
 *    makes each search hit exactly that user.
 *  - 20501's mobile number "0501234567" (10 digits, leading 0): the app stores
 *    the 9 digits after "+966" (5XXXXXXXX); the suite user's own number is used.
 *  - "only the matching users": every row of the answer matches the criterion
 *    (Quick Search: the term is in a name part, the document ID or the e-mail;
 *    Advance Search: the field's id / flag), and the suite user is among them.
 *  - 20504: "unusual / malicious input" is the case's own string; "no
 *    unauthorized records" = every row returned legitimately contains the term
 *    (none, normally) and no error is shown.
 *  - 20507 (exploratory) is a scripted sequence of the listed actions: partial
 *    English name, Arabic name, a dropdown filter on and off, a rapid clear and
 *    re-apply - after each, the screen's answer equals GetUsers for the same
 *    criteria (no stale data, no mismatched counts).
 */
export const CASES = {
  englishName: { azureId: '20492' },
  arabicName: { azureId: '20493' },
  documentId: { azureId: '20494' },
  email: { azureId: '20495' },
  noMatch: { azureId: '20496', term: 'zzznotreal' },
  combined: { azureId: '20497' },
  gender: { azureId: '20498' },
  nationality: { azureId: '20499' },
  identityType: { azureId: '20500' },
  documentAndMobile: { azureId: '20501' },
  allFields: { azureId: '20502' },
  status: { azureId: '20503' },
  unusualInput: { azureId: '20504', term: "' OR 1=1 --" },
  transitions: { azureId: '20505' },
  exploratory: { azureId: '20507' },
} as const;

/** The seven Advance Search fields (AC) and their control kind. */
export const ADVANCED_FIELDS = {
  name: { label: 'Name', kind: 'text' },
  gender: { label: 'Gender', kind: 'dropdown' },
  nationality: { label: 'Nationality', kind: 'dropdown' },
  identityType: { label: 'Identity Type', kind: 'dropdown' },
  documentId: { label: 'Document ID', kind: 'text' },
  mobileNumber: { label: 'Mobile Number', kind: 'text' },
  status: { label: 'Status', kind: 'dropdown' },
} as const;

/** Dropdown option labels, matched loosely (the list shows "Saudi (SAU)", "Iqama (Residence Permit)"). */
export const OPTION = {
  male: /^Male$/i,
  female: /^Female$/i,
  saudi: /^Saudi/i,
  iqama: /Iqama/i,
  active: /^Active$/i,
  inactive: /^Inactive$/i,
} as const;

/** The list's empty state ("No users found."). */
export const NO_RESULTS = /no (users|results|records)( were)? found/i;

/** A toast that would report an application error. */
export const ERROR_TOAST = /error|exception|went wrong|failed/i;

/** Page text that would reveal an application error (narrow: user names may hold any word). */
export const ERROR_ON_PAGE = /exception|went wrong|stack trace|internal server error/i;
