import { nonAdminBlockReason } from '../accounts/nonAdminAccount.data';

/**
 * Test data for "Show Real Facility Count per Linked Network".
 *
 * VERIFIED: the payer's Linked Networks table carries a Facilities column
 * (cell key `networkfacilities`), and a network with nothing attached shows
 * "0" - not the dash the payer list uses for a zero count. The Network list
 * shows the same figure in its own Facilities column, which is the second
 * source every "real count" case compares against.
 *
 * WHAT THE ENVIRONMENT HOLDS. Every network linked to a payer here carries
 * zero facilities. So the zero boundary, the all-rows check and the
 * no-placeholder checklist run for real, while the cases that need a count
 * above zero - several, exactly one, five hundred, a count that changes as
 * facilities are added - report what was found. Facilities are attached in
 * Facility Management, outside this framework.
 */

/** A real count is a whole number, nothing else. */
export const WHOLE_NUMBER = /^\d+$/;

/** What a count cell must never read as. */
export const PLACEHOLDER_PATTERN = /^(|-|—|–|n\/?a|none|null|undefined|\?+)$/i;

/** The exact text a zero-facility network must show. */
export const ZERO_FACILITIES = '0';

/** How many owned networks the consistency checklist reviews. */
export const CONSISTENCY_SAMPLE = 3;

/** The account the access-control case needs. */
export const FACILITY_ROLE_REQUIREMENT = {
  role: 'a role without Linked Networks tab permission',
  reason:
    'The case proves the facility counts are withheld from a user who may not see the Linked '
    + 'Networks tab. The shared administrator sees it, so it cannot show the withheld half.',
} as const;
