import type { PolicyBlockedCase } from '../../utils/policy/writerCHelpers';
import { fullAccessWithout } from './policyPermissionCases.data';

/**
 * US 15177 "View Policy - Network Assignment" (policy folder 10).
 *
 * The tab (live 2026-11-03): a select "Select a network to assign" + Assign
 * (no Add drawer - the cases' "Add Network Assignment" is that control), the
 * search box with its advanced search (Network Code, Network, Status,
 * Assignment) and the table Network Code, Network, Status, Assignment, Assigned
 * On ("—" until approved), Actions (Remove). The select offers only ACTIVE
 * networks of the policy's payer; on 2026-11-03 "Al sharq" had ONE active
 * network (NET-001093), plus the suite's own NET-001133 once it turns Active -
 * so the cases needing two distinct networks (19545, 19548, 19553, 19554)
 * check the select first and are BLOCKED when it offers fewer.
 *
 * Literal readings and disagreements:
 * - 19544 S5 "select a FUTURE network": the select offers active ones only - a
 *   future network of the payer is looked up and must be offered (BLOCKED at
 *   run time when the payer has none). S6 / 19555 expect "Approval Status" and
 *   "Network Name" columns and a populated Assigned On: the table shows
 *   "Assignment" / "Network" and "—" until approval.
 * - 19545: assignment dates cannot be entered (no date field) - each row must
 *   show its own Assigned On date.
 * - 19546: "the network already selected is not retrieved in the DDL".
 * - 19548 (TC vs AC): the case expects add / delete to SUCCEED on an Inactive
 *   policy; the AC blocks changes on inactive policies. The case is asserted.
 * - 19547: Expired is not reachable on demand - an existing Expired policy is
 *   looked at READ-ONLY (only availability is read, nothing is clicked).
 * - 19550: the removal on a published policy is staged ("Draft Removal") until
 *   approved; the case expects the row to leave the table.
 * - 19554 "Assignment: All": the filter has no "All" - the row's own
 *   assignment state is chosen.
 * - 19558: "a user without Policy Administrator permissions" = the Payer Admin
 *   with AssignPolicyNetwork / UnassignPolicyNetwork withheld; its policy is
 *   built for a payer in its scope (it does not see "Al sharq").
 */
export const CASES = {
  addActiveAndFuture: { azureId: '19544' },
  twoDistinct: { azureId: '19545' },
  noDuplicateInSelect: { azureId: '19546' },
  expiredReadOnly: { azureId: '19547', message: 'Network assignments cannot be changed on an expired or terminated policy.' },
  inactiveChangeable: { azureId: '19548' },
  removeWithoutTransactions: { azureId: '19550' },
  payerNetworksOnly: { azureId: '19551' },
  payerWithoutNetworks: { azureId: '19552', candidatePayers: ['NUPCO', 'Al Dawaa 2'] as const },
  searchByCode: { azureId: '19553' },
  combinedFilters: { azureId: '19554', status: 'Active' },
  columns: { azureId: '19555', headers: ['Network Code', 'Network Name', 'Status', 'Approval Status', 'Assigned On'] },
  selectFromList: { azureId: '19556' },
  exploratory: { azureId: '19557', rounds: 2 },
  authorizedOnly: { azureId: '19558', shape: fullAccessWithout('assignNetwork', 'unassignNetwork') },
} as const;

/** The placeholder Assigned On shows before an assignment is approved. */
export const NOT_ASSIGNED_YET = /^\s*(—|-)?\s*$/;

/** "network cannot be unassigned while transactions exist". */
export const BLOCKED_CASES: PolicyBlockedCase[] = [
  {
    azureId: '19549',
    title: 'should block removing a network assignment that has recorded transactions',
    reason:
      'Needs an Active policy whose assigned network has RECORDED TRANSACTIONS (processed claims / authorizations against the '
      + 'policy and network). The test environment has no claims or transaction feed the suite can drive, and none of the '
      + 'suite\'s policies carries transactions, so the "cannot unassign while transactions exist" rule cannot be exercised. '
      + 'Runnable once a claims / transaction simulator (or a seeded policy-network pair with transactions) is available.',
  },
];
