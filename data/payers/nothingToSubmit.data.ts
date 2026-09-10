/**
 * Test data for "Reject Submissions and Saves That Change Nothing".
 *
 * THE RULE HOLDS, AND THE SERVER EVEN EXPLAINS IT - THE INTERFACE THROWS THE
 * EXPLANATION AWAY. This is the finding, and it is sharper than "no message is
 * shown", so it is worth stating precisely.
 *
 * Saving an edit form in which nothing changed DOES send a request. The server
 * answers HTTP 200 with a body that says, in as many words:
 *
 *   { "successMessage": "No changes were made - there is nothing to submit for
 *      approval.", "payload": { "noChanges": true, "draft": false } }
 *
 * So the record is protected - `noChanges: true`, no draft version created -
 * and the exact sentence the sheet asks for is already in the response. The
 * interface renders none of it: no toast, no inline error, no dialog. A
 * developer does not need to write the copy; they need to display what the API
 * already returns.
 *
 * SEND FOR APPROVAL is a separate guard, enforced by withholding the control:
 * a published payer carrying no draft changes offers View, Edit and Delete and
 * no Send for Approval, so "click it and read the refusal" cannot happen -
 * there is nothing to click, and nothing is said.
 *
 * Every case asserts the two halves separately, so a working guard is never
 * reported as a defect and a withheld message is never passed over.
 */

/** What a no-op save actually returns, verified on the wire. */
export const NO_OP_SAVE_RESPONSE = {
  status: 200,
  /** The flag that proves the record was protected. */
  noChangesFlag: 'noChanges',
  /** The sentence the server sends and the interface discards. */
  message: 'No changes were made',
} as const;

/** The messages the sheet requires, and neither of which appears. */
export const EXPECTED_MESSAGES = {
  noDraftChanges: 'There are no draft changes to send',
  nothingToSubmit: 'There is nothing to submit',
} as const;

/** Approval-cell text, per language, for the states these cases move between. */
export const APPROVAL_STATE = {
  en: { draft: 'Draft', pending: 'Pending Approval', published: 'Published' },
  ar: { draft: 'مسودة', pending: 'قيد الموافقة' },
} as const;

/**
 * The actions a payer's row offers, by whether it holds a draft change.
 *
 * The distinction IS the feature: a payer with nothing staged cannot be
 * submitted, and the interface expresses that by not offering the action.
 */
export const ROW_ACTIONS = {
  withDraftChange: ['view', 'edit', 'submit-for-approval', 'delete'],
  withoutDraftChange: ['view', 'edit', 'delete'],
} as const;

/** The field the edit cases move, and the values they move it between. */
export const EDITED_FIELD = {
  label: 'License Number',
  value: 'LIC-NOOP-BASE',
  changed: 'LIC-NOOP-CHANGED',
} as const;

/**
 * The subtle non-changes the exploratory case tries.
 *
 * Each is a value that DIFFERS as a string but not in meaning. The invariant
 * asserted is consistency: whatever the application decides for one of these,
 * it must decide the same for the others - a build that treats a trailing space
 * as a change while treating a re-typed identical value as no change would
 * create draft versions that differ only by whitespace.
 */
export function subtleVariants(base: string): { label: string; value: string }[] {
  return [
    { label: 'a trailing space', value: `${base} ` },
    { label: 'the identical value re-typed', value: base },
    { label: 'a leading space', value: ` ${base}` },
  ];
}

/** How many times the rapid-click case presses the submit action. */
export const RAPID_CLICKS = 3;

/** The account the restricted-role case needs. */
export const RESTRICTED_ROLE_REQUIREMENT = {
  role: 'a payer role without submission rights',
  reason:
    'The case exists to prove Send for Approval is refused for a user who may view a payer but '
    + 'not submit it. The shared administrator session holds every permission, so running it as '
    + 'the administrator would assert nothing.',
} as const;
