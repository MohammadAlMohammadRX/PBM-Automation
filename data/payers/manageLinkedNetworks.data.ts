import { PAYER_LINKED_NETWORKS } from '../../constants/ElementIds';
import type { BlockedCase } from './payerTypes';

/**
 * Test data for "Manage Linked Networks from Payer Details".
 *
 * Most of this story is the network-assignment story under another name, and
 * that one is already automated (folder 32): the end-to-end assign and remove,
 * the exclusion of networks another payer owns, the re-validation of a network
 * claimed in the meantime, the self-approval rule and the restricted role. None
 * of that is repeated here. What remains is the drawer's own gating (nothing
 * selected, nothing to submit), the status rule for the eligible pool, and the
 * checklist of what the Linked Networks section must offer.
 *
 * THE POOL IS EMPTY. Every network in this environment belongs to a payer, so
 * the Assign Network drawer offers nothing - see networkAssignment.fixture for
 * why that is reported rather than repaired. The eligibility case uses that
 * fixture and reports BLOCKED until a network is freed; the cases that need to
 * SUBMIT an assignment are listed in BLOCKED_CASES for the same reason.
 */

/**
 * The columns the Linked Networks table must carry, as its header ids spell
 * them. Read off the live table: name, code, facilities, status, the
 * assignment state (the pending-change indicator the sheet asks for) and the
 * per-row actions.
 */
export const EXPECTED_LINKED_NETWORK_COLUMNS = [
  PAYER_LINKED_NETWORKS.nameCell,
  PAYER_LINKED_NETWORKS.codeCell,
  PAYER_LINKED_NETWORKS.facilitiesCell,
  PAYER_LINKED_NETWORKS.statusCell,
  PAYER_LINKED_NETWORKS.assignmentStateCell,
  'actions',
] as const;

/** The section's hint must state the maker-checker rule. */
export const HINT_STATES_APPROVAL = /approv/i;

/**
 * The "Reason for Change" the sheet's checklist requires on submission.
 *
 * Matched on the drawer's control ids. NOT VERIFIED to exist: the live drawer
 * carries a title, a networks multiselect, Cancel and Assign - so this item
 * of the checklist is expected to fail and report that the drawer asks for no
 * reason.
 */
export const CHANGE_REASON_CONTROL = /reason/i;

/** How many offered networks to cross-check against the Network list. */
export const ELIGIBILITY_SAMPLE = 3;

/**
 * How the Assign Network drawer labels an option - VERIFIED live:
 * "NET-000007 — Automation Network mscwnzwvwpja · Active", i.e. code, name and
 * the network's status. The name is what the Network list is searched by; the
 * status is a first answer to the eligibility question before that cross-check.
 */
export const OPTION_LABEL = /^(?<code>\S+)\s+[—–-]\s+(?<name>.+?)\s+·\s+(?<status>.+)$/;

/** The parts of an offered network's label, or the whole label as the name when it does not parse. */
export const parseOptionLabel = (label: string): { code: string; name: string; status: string } => {
  const match = OPTION_LABEL.exec(label.trim());
  return {
    code: match?.groups?.code ?? '',
    name: (match?.groups?.name ?? label).trim(),
    status: (match?.groups?.status ?? '').trim(),
  };
};

const NEEDS_FREE_NETWORK =
  'This case has to SUBMIT a network assignment, and the Assign Network drawer offers no '
  + 'network here: every network already belongs to a payer and a payer holding one cannot be '
  + 'deleted, so no link was ever released. Free one network (unassign it from a payer and '
  + 'approve the removal, or create and approve a new network) and re-run.';

/** The sheet's cases this environment cannot exercise, in renumbered order. */
export const BLOCKED_CASES: readonly BlockedCase[] = [
  {
    id: '003',
    title: 'should offer exactly the eligible networks across every status, ownership and reservation combination',
    reason:
      'The decision matrix needs networks in every combination of Active/Inactive, owned/unowned '
      + 'and reserved/unreserved. Only owned networks exist here. Provision one network per '
      + 'combination in Network Management and re-run.',
  },
  {
    id: '004',
    title: 'should revert the draft with no effect and no audit entry when a reviewer rejects a network change',
    reason: NEEDS_FREE_NETWORK,
  },
  {
    id: '005',
    title: 'should warn and still allow removal when the network has active dependent policies',
    reason:
      'This case needs a linked network with at least one active policy depending on it. No '
      + 'linked network here carries a policy, and policies are created in the Policies module, '
      + 'outside this framework. Provide such a link and re-run.',
  },
  {
    id: '006',
    title: 'should let the user stop the removal when warned about dependent policies',
    reason:
      'Same precondition as the previous case: a linked network with an active dependent policy.',
  },
  {
    id: '007',
    title: 'should record the correct audit details when a network change is approved',
    reason: NEEDS_FREE_NETWORK,
  },
  {
    id: '008',
    title: 'should fail gracefully when the approval workflow service is unavailable during submission',
    reason:
      `${NEEDS_FREE_NETWORK} The submission endpoint to fail is also learned from a real `
      + 'submission (see NetworkUtils.captureRequestUrl), which needs the same free network.',
  },
  {
    id: '009',
    title: 'should behave consistently across search, filter and cancel-draft on the Linked Networks tab',
    reason:
      'The exploratory session needs a payer with a MIX of linked and eligible networks. The '
      + 'eligible half is empty here - see the free-network remedy above.',
  },
];
