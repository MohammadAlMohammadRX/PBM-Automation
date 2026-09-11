/**
 * Test data for "Manually Reactivate Inactive Payer".
 *
 * MOST OF THIS STORY IS ALREADY AUTOMATED. The activation-guardrails story owns
 * the expiry boundaries that block reactivation, the eligibility matrix, the
 * refusal wording and the access-control case; the publish-and-revert story
 * owns the version ledger and the rejected-draft outcome. Four cases are left,
 * and they are the ones nothing else covers: the end-to-end draft, the promise
 * that reactivation touches nothing but the status, the mandatory reason, and
 * two sessions racing on the same payer.
 *
 * THE TWO SHEETS CONTRADICT EACH OTHER ON THE REASON, and it is a real gap in
 * the provided test cases rather than something to resolve by picking one:
 *
 *   Sheet 41 (Manually Inactivate Active Payer), TC-566 step 5:
 *     "Click Activate -> Status changes to Active WITHOUT requiring a reason"
 *
 *   Sheet 43 (Manually Reactivate Inactive Payer), TC-593:
 *     "the reactivation draft form opens with the reason field marked
 *      MANDATORY ... the system displays a validation error requiring the
 *      reason field and does not save the draft"
 *
 * Both are automated, each against its own sheet, and each failure message
 * points at the other. Whichever way the product decides, one of the two cases
 * is asserting the wrong rule and should be retired - that decision is the
 * product owner's, not something to bury in a test.
 *
 * REACTIVATION STAGES A DRAFT, like every other payer change: the status moves
 * when the change is approved, not when the prompt is confirmed. Cases that
 * observe "Active" carry the approval explicitly.
 */

/** The fields that must survive a reactivation untouched. */
export const PRESERVED_FIELDS = [
  'Email Address',
  'Phone Number',
  'License Number',
  'Country',
] as const;

/**
 * Why the payer's NAME is not in that list, though it is the obvious field to
 * check: the detail screen has no id-addressed field for it. The name lives in
 * the page header, which `getName()` reads - so the name is checked through
 * that instead, and 'City' is absent for the same reason.
 */
export const PRESERVED_HEADER_NAME = true;

/**
 * What the sheet says a reactivation draft must demand before it can be sent.
 *
 * Asserted as the sheet states it; see the file comment for the conflict with
 * sheet 41. If reactivation genuinely needs no reason, this case fails and its
 * message names the other sheet.
 */
export const REASON_REQUIREMENT = {
  mandatory: true,
  conflictsWith: 'sheet 41 TC-566, which expects reactivation to need no reason',
} as const;

/** What two racing sessions may legitimately produce. */
export const CONCURRENCY_OUTCOMES = {
  /**
   * The sheet allows either answer - a second draft with its own version, or a
   * refusal that a draft already exists. What it forbids is two approved
   * reactivations, or a payer left in a state neither session asked for.
   */
  allowed: ['a second draft is staged', 'the second attempt is refused'],
  forbidden: 'two approved reactivations, or a corrupted status',
} as const;
