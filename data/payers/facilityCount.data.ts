import type { BlockedCase } from './payerTypes';
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

const NEEDS_FACILITIES =
  'This case needs a linked network with facilities attached, and every network linked to a '
  + 'payer here carries zero. Facilities are attached in Facility Management, outside this '
  + 'framework. Attach the facilities the case names to a linked network and re-run.';

/** The sheet's cases this environment cannot exercise, in renumbered order. */
export const BLOCKED_CASES: readonly BlockedCase[] = [
  {
    id: '004',
    title: 'should show the full count without truncation when a network has 500 facilities',
    reason: NEEDS_FACILITIES,
  },
  {
    id: '005',
    title: 'should update the count when facilities are added to and removed from the network',
    reason: `${NEEDS_FACILITIES} The case also drives Facility Management during the run.`,
  },
  {
    id: '007',
    title: 'should count only the facility statuses the business rule defines as countable',
    reason:
      `${NEEDS_FACILITIES} NO BUSINESS RULE was provided with the story naming which statuses `
      + 'count, so the expected figure cannot be derived even once facilities exist.',
  },
  {
    id: '008',
    title: 'should stay accurate after a facility change made through an alternate integration path',
    reason: `${NEEDS_FACILITIES} It also needs the bulk-import path, which is not available to this suite.`,
  },
  {
    id: '011',
    title: 'should keep facility counts correct through sorting, filtering and pagination of the tab',
    reason:
      'This case needs a payer with MANY linked networks of varied counts. Every payer here holds '
      + 'at most one, so the tab has nothing to sort or page.',
  },
];
