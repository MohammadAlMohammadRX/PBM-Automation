/**
 * Test data for "Validate PayerCode Uniqueness on Approval".
 *
 * WHAT IS ALREADY COVERED, and so not repeated here: the
 * create-new-payer story proves a PayerCode is generated only once a reviewer
 * approves (TC-004) and is not consumed when the request is rejected (TC-005);
 * the publish-and-revert story owns approval eligibility and the
 * unauthorised-approver case; and the edit story already proves the PayerCode
 * field is absent from the form, so no user can type one.
 *
 * THE COLLISION CANNOT BE INJECTED. The sheet's TC-625 mocks the generation
 * service into returning a code that already exists, then watches for a silent
 * retry. Generation happens inside the approval call on the server - it is not
 * a request this framework can intercept or a value the client supplies - so
 * there is no seam to mock from here.
 *
 * What IS observable is the invariant the retry logic exists to protect, and
 * TC-002 asserts it: no two payers in the register share a code, and a payer
 * approved now receives one that nothing else holds. A build whose retry was
 * broken would show a duplicate, which is exactly what that case looks for.
 *
 * NO FORMAT IS DEFINED IN THE SHEET. TC-626 asks whether the code "conforms to
 * the defined format/length boundary" without saying what that boundary is, and
 * no specification accompanied the story. So the case derives the shape from the
 * codes the register already holds and asserts the new one is consistent with
 * them - which catches a truncation or an overflow, the failures the sheet
 * names, without inventing a rule. The missing specification is reported as a
 * gap rather than guessed at.
 */

/**
 * The shape every PayerCode observed in this environment takes.
 *
 * Derived from the register rather than specified: codes read like `PAY-001820`
 * - a prefix, a hyphen, then a zero-padded number. Used as a consistency check,
 * not as an authority; TC-003 compares a new code against the codes that exist
 * and reports the pattern it inferred when they disagree.
 */
export const OBSERVED_CODE_PATTERN = /^[A-Z]{2,6}-\d{4,10}$/;

/** A code no generator would produce, for the manual-override attempt. */
export const MANUAL_CODE = 'MANUAL-999';

/** How many payers to read when checking register-wide uniqueness. */
export const UNIQUENESS_SAMPLE = 25;

/** What a failed generation must NOT leave behind. */
export const GENERATION_FAILURE = {
  /**
   * The dangerous outcome: a payer that reads as approved while holding no
   * code, or holding a blank one. Either way a downstream system asking for its
   * code gets nothing, and the payer looks live.
   */
  forbidden: 'an approved payer with no PayerCode',
} as const;

/** Values that mean "no code" when read from a cell. */
export const EMPTY_CODE_MARKERS = ['', '-', '—', '–', 'N/A'] as const;

/**
 * The edit that gives the second payer something to approve.
 *
 * The concurrency case needs two payers in the queue at once; one is a fresh
 * draft, the other an existing published payer that has to be changed before it
 * can be submitted at all.
 */
export const CODE_RACE_EDIT = {
  label: 'License Number',
  value: 'LIC-CODE-RACE',
} as const;
