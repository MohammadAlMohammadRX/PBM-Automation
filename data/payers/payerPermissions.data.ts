/**
 * Test data for "Define Bilingual Names for All Payer Module Permissions".
 *
 * WHAT THE CATALOGUE SHOWS TODAY, read off the live Privileges step in both
 * languages. This story is largely not implemented, and the data records that
 * precisely rather than glossing it:
 *
 *   - The `Payers` group holds 21 permissions. Exactly ONE has a friendly
 *     bilingual name: "View Audit Logs" / "عرض سجلات التدقيق".
 *   - The other 19, nested under `GetPayers (19/19)`, display their raw code
 *     names - `GetPayer`, `GetPayersDashboard`, `ExportPayers`,
 *     `InactivatePayer`, `GetPayerNetworks`, `GetAssignableNetworks`,
 *     `GetPayerLinkedPolicies` - and they are IDENTICAL in Arabic. Switching the
 *     interface to Arabic changes the surrounding chrome and leaves every one of
 *     these labels in English.
 *   - The `Payers` group heading is itself untranslated, where the neighbouring
 *     `Plans` heading correctly reads `الخطط`. So the gap is specific to this
 *     module, not a missing Arabic bundle.
 *   - Approve/reject is not in the `Payers` group at all: it lives under
 *     `Approval Management` as `Payer Approvals`, offering `Approve/Reject` and
 *     `Approve/Reject all`. A case counting nine permissions in one group would
 *     find eight.
 *
 * `expectedEn` is what the story asks each permission to be CALLED;
 * `currentCode` is what the application displays instead. Holding both lets a
 * failure say "GetPayersDashboard is displayed where 'View Payer Dashboard' was
 * expected", which is an actionable defect, instead of "label not found".
 */

export interface PayerPermission {
  /**
   * The case in this story that covers this permission.
   *
   * Kept with the data rather than derived in the spec: the mapping from
   * permission to case number is a fact about the sheet, not a computation.
   */
  caseId: string;
  /** The friendly English name the story requires. */
  expectedEn: string;
  /** The Arabic name the story requires, where the sheet states one. */
  expectedAr?: string;
  /** The raw code name the catalogue displays today, verified live. */
  currentCode: string;
  /** Which group heading the permission sits under. */
  group: 'Payers' | 'Payer Approvals';
  /** True when the application already shows a friendly bilingual name. */
  alreadyNamed: boolean;
}

/**
 * The nine payer permissions the story enumerates, in sheet order.
 *
 * The Arabic names are only given where the sheet states one outright. For the
 * rest the sheet asks for "a correct, non-empty Arabic label", so the assertion
 * is that the label differs from the English one and is not a raw code - which
 * is what can actually be judged without inventing a translation.
 */
export const PAYER_PERMISSIONS: readonly PayerPermission[] = [
  {
    caseId: 'TC-001',
    expectedEn: 'View Payer Details',
    expectedAr: 'عرض تفاصيل جهة التغطية',
    currentCode: 'GetPayer',
    group: 'Payers',
    alreadyNamed: false,
  },
  {
    caseId: 'TC-002',
    expectedEn: 'View Payer Dashboard',
    expectedAr: 'عرض لوحة جهات التغطية',
    currentCode: 'GetPayersDashboard',
    group: 'Payers',
    alreadyNamed: false,
  },
  {
    caseId: 'TC-003',
    expectedEn: 'Export Payers',
    currentCode: 'ExportPayers',
    group: 'Payers',
    alreadyNamed: false,
  },
  {
    caseId: 'TC-004',
    expectedEn: 'Inactivate Payer',
    currentCode: 'InactivatePayer',
    group: 'Payers',
    alreadyNamed: false,
  },
  {
    // The one payer permission that IS already named bilingually.
    caseId: 'TC-005',
    expectedEn: 'View Payer Audit Logs',
    currentCode: 'View Audit Logs',
    group: 'Payers',
    alreadyNamed: true,
  },
  {
    caseId: 'TC-006',
    expectedEn: "View Payer's Linked Networks",
    currentCode: 'GetPayerNetworks',
    group: 'Payers',
    alreadyNamed: false,
  },
  {
    caseId: 'TC-007',
    expectedEn: 'View Networks Available for Assignment',
    currentCode: 'GetAssignableNetworks',
    group: 'Payers',
    alreadyNamed: false,
  },
  {
    caseId: 'TC-008',
    expectedEn: "View Payer's Linked Policies",
    currentCode: 'GetPayerLinkedPolicies',
    group: 'Payers',
    alreadyNamed: false,
  },
  {
    caseId: 'TC-009',
    expectedEn: 'Approve/Reject Payer Changes',
    currentCode: 'Approve/Reject',
    group: 'Payer Approvals',
    alreadyNamed: true,
  },
];

/** The story's stated count, asserted rather than derived from the array. */
export const EXPECTED_PAYER_PERMISSION_COUNT = 9;

/**
 * The Arabic label of the one already-translated payer permission.
 *
 * Verified live. Held separately because it is the single positive control in
 * this story: it proves the Arabic bundle and the language switch both work, so
 * a failure on any other permission is about that permission's missing name and
 * not about the mechanism.
 */
export const TRANSLATED_CONTROL = {
  en: 'View Audit Logs',
  ar: 'عرض سجلات التدقيق',
} as const;

/**
 * The search term that brings the payer permissions on screen.
 *
 * The catalogue is ~330 rows across every module, and filtering first is what
 * makes an exact label match trustworthy - several payer permission codes are
 * prefixes of others (`GetPayer` of `GetPayerNetworks`).
 */
export const PERMISSION_SEARCH_TERM = 'Payer';

/**
 * The role-based cases' requirements.
 *
 * Every one of these needs an account that does not exist in this environment,
 * which has a single set of credentials belonging to a full administrator. They
 * are listed so each BLOCKED annotation can name exactly what to provision,
 * rather than reporting a vague "insufficient permissions".
 */
export const ROLE_REQUIREMENTS = {
  partial: {
    label: 'Role A',
    reason:
      'Needs an account holding View Payer Details but NOT export, inactivate, dashboard, '
      + 'audit-log or approve/reject, to prove each permission is independently enforced.',
  },
  exporter: {
    label: 'Role B',
    reason: 'Needs an account holding View Payer Details and Export Payers, but not inactivate '
      + 'or approve/reject.',
  },
  full: {
    label: 'Role C',
    reason: 'Needs an account holding all nine payer permissions.',
  },
  none: {
    label: 'Role Zero',
    reason: 'Needs an account holding none of the payer permissions, to prove every payer screen '
      + 'and action is denied.',
  },
  reviewerWithoutApproval: {
    label: 'Reviewer without approve/reject',
    reason:
      'Needs an account that can open a pending payer request but does not hold '
      + 'Approve/Reject Payer Changes.',
  },
  secondReviewer: {
    label: 'Second reviewer',
    reason:
      'Needs a reviewer account distinct from the submitter, so an approval can be carried out '
      + 'by someone other than the person who requested it.',
  },
} as const;
