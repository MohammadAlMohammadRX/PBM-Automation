import { PRIMARY_REASON, REASON_CHANGE, VALID_DETAILS } from './inactivationDecisions.data';

/**
 * Test data for "Show Inactivation Reason, Details, By and On While a Payer Is
 * Inactive".
 *
 * The four fields only exist on an inactive payer's Overview, so whether they
 * appear is checked as CONTENT - the reason and the details entered at
 * inactivation must show up in the Overview text when the payer is inactive and
 * must be gone when it is active again. That is robust to the exact field ids,
 * which the four fields carry only while inactive.
 *
 * The reason-required, 500-character and over-length cases are REUSE - the
 * activation-guardrails story already owns them - and are not rewritten here.
 * The non-admin case is BLOCKED for want of the account; the historical case is
 * out of reach because there is no point-in-time reconstruction UI (verified).
 */

/** The reason and details a straightforward inactivation records. */
export const DISPLAY_REASON = PRIMARY_REASON;
export const DISPLAY_DETAILS = VALID_DETAILS;

/** A distinct reason/details for the second-cycle case. */
export const SECOND_CYCLE = {
  reason: REASON_CHANGE.final,
  details: 'Second inactivation cycle - a different set of details entirely.',
} as const;

/** The account the access-control case needs. */
export const INACTIVATION_DISPLAY_ROLE_REQUIREMENT = {
  role: 'a non-administrator payer role',
  reason:
    'The case proves a non-administrator cannot inactivate a payer nor improperly view the '
    + 'inactivation fields. The shared administrator can do both, so it cannot show the '
    + 'withheld half.',
} as const;
