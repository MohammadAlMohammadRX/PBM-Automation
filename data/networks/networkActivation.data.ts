/**
 * Test data for "Enable Network Activation Regardless of Payer Status".
 *
 * WHERE THIS CAPABILITY ACTUALLY LIVES - the finding that shapes the whole
 * story. The sheet describes opening a payer, going to its Networks tab,
 * selecting a network and clicking Activate or Deactivate there. That screen
 * offers no such action: the payer's Linked Networks table has exactly one
 * control per row, Unassign, alongside the network's status and the assignment
 * state. Verified on a payer holding a linked network.
 *
 * A network's status is changed from the NETWORK module, whose row actions
 * mirror the payer list's:
 *
 *   Inactive  activate   ENABLED   · inactivate ABSENT
 *   Active    inactivate ENABLED   · activate   ABSENT
 *   Expired   activate   DISABLED, carrying the same style of message the payer
 *             list uses: "Cannot reactivate: the network has expired. Update
 *             its expiry date to reactivate it."
 *   Not Live  neither - an unapproved draft has no live status to change
 *
 * So the story's REQUIREMENT is met - a network's activation depends on the
 * network's own status and never on its payer's - while the sheet's ROUTE to it
 * does not exist. Each case asserts the requirement where it lives and records
 * that the payer-tab route is missing.
 *
 * MAKER-CHECKER APPLIES HERE TOO. The prompt says so in as many words, and it
 * was verified: confirming leaves the status untouched and moves the approval
 * cell to Draft ("v3 · Published" became "v3 · Draft"), with the row then
 * offering Send for Approval. Every case that must observe the NEW status
 * therefore carries the approval round trip.
 */

/** Network lifecycle statuses, as the row badge renders them. */
export const NETWORK_STATUS = {
  active: 'Active',
  inactive: 'Inactive',
  expired: 'Expired',
  /** An unapproved draft: no live status yet, and no lifecycle action. */
  notLive: 'Not Live',
} as const;

export type NetworkStatusKey = keyof typeof NETWORK_STATUS;

/** The activation prompt, as the live application words it. */
export const ACTIVATION_PROMPT = {
  title: 'Activate Network',
  /** The consequence it explains. */
  consequence: 'It will be available for policy linkage.',
  /** The maker-checker caveat every status prompt in this application carries. */
  approvalCaveat: 'send it for approval when you are ready',
} as const;

/** The staged-change toast both directions produce. */
export const STAGED_TOAST = {
  summary: 'Saved as draft',
  detail: 'Your changes were saved as a draft. Send the record for approval when you are ready.',
} as const;

/** The expiry guardrail on a network, mirroring the payer one. */
export const NETWORK_EXPIRY_GUARDRAIL =
  'Cannot reactivate: the network has expired. Update its expiry date to reactivate it.';

/**
 * The four payer/network status combinations the story is really about.
 *
 * Held as data so the matrix case iterates the rule rather than restating it
 * four times, and so the individual cases and the matrix case cannot drift
 * apart.
 */
export interface StatusCombination {
  caseId: string;
  payerStatus: 'Active' | 'Inactive';
  networkStatus: 'Active' | 'Inactive';
  /** The action that must be offered for this combination. */
  action: 'activate' | 'inactivate';
  /** The status the network must reach once the change is approved. */
  becomes: 'Active' | 'Inactive';
}

export const STATUS_COMBINATIONS: readonly StatusCombination[] = [
  {
    caseId: 'TC-001',
    payerStatus: 'Active',
    networkStatus: 'Inactive',
    action: 'activate',
    becomes: 'Active',
  },
  {
    caseId: 'TC-002',
    payerStatus: 'Inactive',
    networkStatus: 'Inactive',
    action: 'activate',
    becomes: 'Active',
  },
  {
    caseId: 'TC-003',
    payerStatus: 'Inactive',
    networkStatus: 'Active',
    action: 'inactivate',
    becomes: 'Inactive',
  },
  {
    caseId: 'TC-004',
    payerStatus: 'Active',
    networkStatus: 'Active',
    action: 'inactivate',
    becomes: 'Inactive',
  },
];

/**
 * What the API does with a status request the UI would not have sent.
 *
 * There is no status FIELD to corrupt: activation and deactivation are separate
 * endpoints taking `{ id }` alone, so an "invalid status value" cannot be
 * expressed against this interface. What CAN be sent is a request with the id
 * missing, and a repeat of an action the row no longer offers - which is what
 * the two direct-request cases do instead.
 */
export const DIRECT_REQUEST = {
  /** A request with no id at all - the "required field" half of the sheet's case. */
  missingId: null,
  /** The statuses the UI offers, which is the whole valid vocabulary. */
  offeredStatuses: [NETWORK_STATUS.active, NETWORK_STATUS.inactive] as const,
  /** A rejection must be a handled one - not a 500 with a stack trace. */
  unacceptableStatuses: [500] as const,
  leakMarkers: ['StackTrace', 'System.', '/src/'] as const,
} as const;

/** The account the restricted-role case needs. */
export const RESTRICTED_ROLE_REQUIREMENT = {
  role: 'a role that may view networks but not change their status',
  reason:
    'The case exists to prove the activation controls are withheld from a user without '
    + 'network-status rights. The shared administrator session holds every permission, so '
    + 'running it as the administrator would assert nothing.',
} as const;
