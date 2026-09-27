import type { BlockedCase } from './payerTypes';
import { nonAdminBlockReason } from '../accounts/nonAdminAccount.data';

/**
 * Test data for "Display Read-Only Linked Policies List".
 *
 * WHAT THE PROBE FOUND, because it shapes every case here. On a payer with no
 * policies the Linked Policies tab renders a search bar, the sentence "No
 * policies are linked to this payer yet." and no table - and activating it
 * fires no request of its own. So the three cases a payer without policies
 * can reach are exactly the ones that ask what an empty section shows (that
 * empty-state message - PASSES), where its data comes from (a request for the
 * payer's policies - FAILS: none is made, so whatever the tab shows came with
 * the payer record and may be stale), and what it must not offer
 * (add/edit/delete controls - PASSES).
 *
 * Every other case needs a payer that OWNS policies - one, exactly a page
 * worth, one over, one under, each status, a known member count - and the
 * Policy module that creates them is outside this framework. Those cases are
 * listed in BLOCKED_CASES with the payer they are waiting for.
 */

/** Wording an empty Linked Policies section is expected to carry, in either language. */
export const EMPTY_STATE_PATTERN = /no (linked )?polic|no records|no results|nothing|empty|لا (توجد|يوجد)/i;

/** The request the tab is expected to issue for the payer's policies. */
export const POLICY_REQUEST_PATTERN = /polic/i;

/** Control ids the read-only section must not carry. */
export const FORBIDDEN_CONTROL_PATTERN = /add|create|edit|delete|remove|link|assign|unlink/i;

/** The account the access-control case needs. */
export const LINKED_POLICIES_ROLE_REQUIREMENT = {
  role: 'a role without payer-oversight (Linked Policies) rights',
  reason:
    'The case proves the Linked Policies tab is withheld from a role that may not see it. The '
    + 'shared administrator sees everything, so running it as the administrator asserts nothing.',
} as const;

export const NEEDS_POLICY_OWNER =
  'This case needs a payer that OWNS policies, and no payer in this environment does - the '
  + 'Policies module that would create one is outside this framework. Provide a payer with the '
  + 'linked policies the case names and re-run; the readers for the tab already exist.';

/** The sheet's cases this environment cannot exercise, in renumbered order. */
export const BLOCKED_CASES: readonly BlockedCase[] = [
  {
    id: '001',
    title: 'should show every required column when a payer with linked policies opens the tab',
    reason: `${NEEDS_POLICY_OWNER} Note the tab renders NO table at all for a payer without policies, so its columns cannot be read from an empty section.`,
  },
  {
    id: '002',
    title: 'should open the policy details view when a linked policy row is clicked',
    reason: NEEDS_POLICY_OWNER,
  },
  {
    id: '005',
    title: 'should not paginate when the policy count equals the default page size',
    reason: `${NEEDS_POLICY_OWNER} The boundary needs exactly one page of policies (e.g. 20).`,
  },
  {
    id: '006',
    title: 'should paginate when the policy count is one over the default page size',
    reason: `${NEEDS_POLICY_OWNER} The boundary needs one policy more than a page (e.g. 21).`,
  },
  {
    id: '007',
    title: 'should not paginate when the policy count is one under the default page size',
    reason: `${NEEDS_POLICY_OWNER} The boundary needs one policy fewer than a page (e.g. 19).`,
  },
  {
    id: '008',
    title: 'should show the correct Status value for each linked policy status',
    reason: `${NEEDS_POLICY_OWNER} The decision table needs a policy in each of Active, Inactive, Expired and Pending.`,
  },
  {
    id: '009',
    title: 'should show a Members count sourced from true ownership data',
    reason: `${NEEDS_POLICY_OWNER} Member enrolment is the Member Management module, also outside this framework.`,
  },
  {
    id: '013',
    title: 'should sort, filter and scroll correctly across multiple linked policies',
    reason: `${NEEDS_POLICY_OWNER} The exploratory session needs several policies spanning statuses and expiry dates.`,
  },
];
