import { repeatTo, type NetworkBlockedCase } from './network.data';

/**
 * Test data for US 14127 "Deactivate network with a documented reason".
 *
 * The sheet names reasons ('Contract Suspension', 'Regulatory Review',
 * 'Compliance Issue') as EXAMPLES of "a valid reason from the maintained list".
 * The list is an administrator-maintained lookup (`networkInactivationReason`,
 * first entry "Contract Ended" on 2026-10-21), so the cases take the reason
 * from what the drawer offers rather than pinning a label that can be renamed.
 *
 * Maker-checker, verified 2026-10-21: confirming the drawer saves a DRAFT
 * (toast "Saved as draft"); the network keeps reading Active, its approval cell
 * moves to "v{n} · Draft", and only Send for Approval puts the request in the
 * queue ("Pending Approval"). The sheet's "submit the inactivation request"
 * is therefore drawer + Send for Approval.
 */

export const DEACTIVATE = {
  details: 'Suspended pending contract renewal',
  detailsAudit: 'Awaiting renewal',
  detailsNoReason: 'Temporary pause',
  detailsLimit: 500,
  atLimit: repeatTo('D', 500),
  overLimit: repeatTo('D', 501),
  /** Special characters, emoji and padding the exploratory case types. */
  exploratoryDetails: '  Ünïcödé «quotes» & <tags> 😀 — trailing  ',
  rapidClicks: 4,
} as const;

/** Lifecycle budget per case: an Active network takes ~2 minutes to provision. */
export const LIFECYCLE_TIMEOUT_MS = 25 * 60_000;

/** The reason select reads its placeholder when nothing is chosen. */
export const UNSELECTED_REASON = /^(Select)?$/;

/** The non-Active statuses that must not offer Inactivate (17811, 17810). */
export const NOT_INACTIVATABLE = [
  { azureId: '17811', state: 'Pending', label: 'Pending' },
  { azureId: '17810', state: 'Inactive', label: 'Inactive' },
] as const;

/** The approval cell states a staged and a submitted change show. */
export const APPROVAL_CELL = {
  draft: /Draft/,
  pendingApproval: /Pending Approval/,
  published: /Published/,
} as const;

/** What the audit entry of an approved inactivation must carry. */
export const AUDIT_EXPECTATION = {
  action: /Status Change/i,
  statusField: /status/i,
  before: /Active/,
  after: /Inactive/,
  /** The automatic job's entries, which a user-made change is told apart from. */
  systemActor: 'System',
  reasonField: /reason/i,
  detailsField: /details/i,
  /** "dd/mm/yyyy hh:mm • <actor>" - a timestamp and a named actor. */
  meta: /\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}\s*•\s*\S+/,
} as const;

/**
 * Cases this environment cannot run, each naming what is missing.
 */
export const BLOCKED_CASES: readonly NetworkBlockedCase[] = [
  {
    azureId: '17818',
    title: 'should offer no Approve or Reject on a pending inactivation when the user lacks approval permission',
    reason:
      'Needs a sign-in whose role lacks the Network Approvals "Approve/Reject" permission. The only non-admin '
      + 'account (Payer Admin) holds it, and shapedNonAdmin cannot remove it: the catalogue label "Approve/Reject" '
      + 'repeats under every approvals group (Formulary, Registration, Network, Payer, Plan, Policy), and role edits '
      + 'do not propagate to signed-in users in this build. Unblock with a seeded account without network approval rights.',
  },
  {
    azureId: '17819',
    title: 'should leave the facilities and linked policies Active when their network is inactivated',
    reason:
      'Needs a SUITE-OWNED network that has an Active linked policy. Policies link to networks from the Policy module '
      + '(AssignPolicyNetwork) and no suite helper creates that link; the register networks that have policies are '
      + 'shared team data that a case must not inactivate. Unblock with a policy-linking fixture or a reserved '
      + 'network-with-policy the suite may flip.',
  },
];
