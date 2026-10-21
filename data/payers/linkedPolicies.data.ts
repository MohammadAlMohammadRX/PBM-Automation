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

/**
 * The request the tab is expected to issue for the payer's policies.
 *
 * NARROWED 2026-10-11: plain /polic/ also matched the lookup the page loads
 * for every payer ("Lookups/Items/policyStatus"), which would pass the case
 * without the payer's policies ever being asked for. VERIFIED on payer number
 * 2: the page asks GetPayerLinkedPolicies {payerId} as the detail loads.
 */
export const POLICY_REQUEST_PATTERN = /\/api\/Payers\/GetPayerLinkedPolicies/i;

/** Control ids the read-only section must not carry. */
export const FORBIDDEN_CONTROL_PATTERN = /add|create|edit|delete|remove|link|assign|unlink/i;

/** The account the access-control case needs. */
export const LINKED_POLICIES_ROLE_REQUIREMENT = {
  role: 'a role without payer-oversight (Linked Policies) rights',
  reason:
    'The case proves the Linked Policies tab is withheld from a role that may not see it. The '
    + 'shared administrator sees everything, so running it as the administrator asserts nothing.',
} as const;

/**
 * What the register holds on 2026-10-11, read from GetPayers and the tab
 * itself. Payers DO own policies now - payer number 2 has two (both Expired)
 * and the largest holding is six - so "no payer owns a policy" is no longer
 * the reason; each case below names what it is still missing. Policies are
 * created in the Policies module, outside this framework.
 */
const POLICY_HOLDINGS =
  'Policy holdings on 2026-10-11: payer number 2 owns 2 policies (both Expired); the most any '
  + 'payer owns is 6. Policies are created in the Policies module, outside this framework.';

/** The sheet's cases this environment cannot exercise, in renumbered order. */
export const BLOCKED_CASES: readonly BlockedCase[] = [
  {
    id: '006',
    title: 'should paginate when the policy count is one over the default page size',
    reason: `${POLICY_HOLDINGS} The boundary needs a payer with one policy more than the tab's default page size.`,
  },
  {
    id: '009',
    title: 'should show a Members count sourced from true ownership data',
    reason: `${POLICY_HOLDINGS} The case also needs a known per-policy member count to compare `
      + 'with; member enrolment is the Member Management module, also outside this framework.',
  },
];
