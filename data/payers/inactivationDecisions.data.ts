import { DETAILS_MAX_LENGTH, INACTIVATION_REASONS } from './lifecycleGuardrails.data';

/**
 * Test data for "Manually Inactivate Active Payer".
 *
 * ALMOST ALL OF THIS STORY IS ALREADY AUTOMATED, and only three cases are here.
 * The activation-guardrails story owns the reason requirement, the 500-character
 * details boundary, the row-action matrix that withholds Inactivate from a payer
 * that is not Active, the managed reason list, the double-submission guard and
 * the access-control refusal. Those are not repeated - see the traceability
 * matrix for the mapping. What is left is the combination table, the
 * change-your-mind case, and the round trip from Active to Inactive and back.
 *
 * THE REASONS THE SHEET NAMES DO NOT EXIST. It asks for "Contract Terminated"
 * and "Payer Merger"; the managed list holds Contract Ended, Regulatory Action,
 * Payer Request, Compliance Issue and Other - verified live by the guardrails
 * story. The substitution is made from that list rather than typed, because the
 * control is a closed dropdown, and it is recorded here rather than made
 * silently.
 *
 * INACTIVATION STAGES A DRAFT; IT DOES NOT CHANGE THE STATUS. Every case that
 * needs to see "Inactive" carries the approval round trip as its own step. The
 * sheet expects the status to move on Confirm, and asserting that would report
 * a defect against a module behaving exactly as every other payer change does.
 *
 * Every case works on a payer the suite created. Inactivating a shared record
 * takes its status away from whatever else needs it.
 */

/** The reason a straightforward inactivation gives. */
export const PRIMARY_REASON = INACTIVATION_REASONS[0];

/**
 * The pair the change-your-mind case moves between.
 *
 * Two distinct entries from the managed list, standing in for the sheet's
 * "Contract Terminated" then "Payer Merger".
 */
export const REASON_CHANGE = {
  first: INACTIVATION_REASONS[1],
  final: INACTIVATION_REASONS[2],
} as const;

/** Details well inside the limit the guardrails story pins. */
export const VALID_DETAILS = 'Contract expired and was not renewed.';

/** Restated only so a reader need not open the other file to see the bound. */
export const DETAILS_LIMIT = DETAILS_MAX_LENGTH;

/**
 * The rows of the sheet's decision table that can be evaluated here.
 *
 * The role dimension is deliberately absent: proving a non-administrator is
 * refused needs a second account, which this environment does not expose, and
 * the guardrails story already carries that case and already reports it as
 * BLOCKED. Duplicating it here would double one blocked result rather than add
 * coverage.
 */
export const DECISION_ROWS = [
  { label: 'a reason and no details', reason: PRIMARY_REASON, details: '', expectAccepted: true },
  { label: 'no reason at all', reason: null, details: '', expectAccepted: false },
  {
    label: 'a reason and valid details',
    reason: PRIMARY_REASON,
    details: VALID_DETAILS,
    expectAccepted: true,
  },
] as const;

/** What the audit trail must show for a completed inactivate/reactivate pair. */
export const AUDIT_EXPECTATION = {
  /** Two events, not one - the second must not overwrite the first. */
  distinctEntries: 2,
  inactivated: /inactiv/i,
  reactivated: /activat/i,
} as const;
