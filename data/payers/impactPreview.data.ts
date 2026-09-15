/**
 * Test data for "Preview Impact Before Confirming Inactivation".
 *
 * The inactivation drawer already renders an impact preview - the cascade
 * story's data file owns IMPACT_SUMMARY_PATTERN, which parses its
 * "N active plan(s), N active policy(ies), N member(s)" shape. This story's
 * residue is about that preview specifically: that it names and counts all
 * three categories, that a payer with nothing shows zeros, and that cancelling
 * it leaves the payer untouched.
 *
 * THE LIVE-COUNT CASES ARE BLOCKED. Showing counts ABOVE zero, and proving they
 * aggregate from the Plans, Policies and Members modules, needs a payer that
 * actually owns active plans and policies - which this environment cannot
 * provision, the same wall the cascade story met. The reachable core is the
 * preview's presence, its zero state, and the cancel/confirm behaviour.
 *
 * THE RBAC CASE is BLOCKED for the non-admin account.
 */

/** The three categories the preview must name. */
export const IMPACT_CATEGORIES = ['plan', 'polic', 'member'] as const;

/** The account the access-control case needs. */
export const IMPACT_ROLE_REQUIREMENT = {
  role: 'a non-administrator payer role',
  reason:
    'The case proves only an authorised role can inactivate a payer and see its impact preview. '
    + 'The shared administrator can do both, so it cannot show the withheld half.',
} as const;
