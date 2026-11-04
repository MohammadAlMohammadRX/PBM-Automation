/**
 * The Policy rights the permission story 15189 (policy folder 18) shapes on the
 * existing "Payer Admin" role, through the `policyRole` fixture of
 * utils/policy/policyRole.ts (the Formulary `formularyRole` approach: rights are
 * toggled by catalogue LABEL, restored at teardown, the shaped account signed in
 * through shapedNonAdmin).
 *
 * THE LABELS were read off the live catalogue on 2026-11-03 (Payer Admin role,
 * search "Polic"), with the state the role held then:
 *   Policies (32/33)            the section; GetPolicies (29/30) is the LIST right and parent of the rest
 *   AddPolicyMember, AssignPolicyNetwork, ClonePolicy, CreatePolicy,
 *   CreatePolicyEndorsement, DeletePolicy, DeletePolicyEndorsement, ExportPolicies,
 *   GetPoliciesDashboard, GetPoliciesDropdown, GetPolicy, GetPolicyAuditTrail,
 *   GetPolicyForClone, GetPolicyMemberCandidates, GetPolicyVersions,
 *   InactivatePolicy, RemovePolicyMember, RevertPolicyVersion, SetPolicyActive,
 *   SubmitPolicy, SubmitPolicyForApproval, UnassignPolicyNetwork, UpdatePolicy,
 *   View Audit Logs                                           all held
 *   GetPolicyEndorsements                                     NOT held (the Documentation tab's view right)
 *   GetPolicyMembers (1/1) > ExportPolicyMembers, GetPolicyNetworks (1/1) > ExportPolicyNetworks
 *   Bulk import (2/2) > "Import policies, members and network assignments",
 *                       "View policy upload history and results"
 *   MemberAccumulators (3/3) > GetMemberAccumulator (2/2), GetPolicyBenefitYears, ResetPolicyBenefits
 *   Approval Management > Policy Approvals (2/2) > Approve/Reject, Approve/Reject all
 *
 * There is ONE import right for policies, members and networks, ONE export right
 * per tab (no separate Add/Edit/Delete-member export), no "Edit" right for a
 * member, network or document (none can be edited), and Activate is
 * SetPolicyActive while Inactivate is InactivatePolicy (separate, as the story
 * asks). A case the catalogue cannot express is BLOCKED naming the missing right.
 *
 * THE TERMINOLOGY TRAP applies: GetPolicies is the parent of every policy right,
 * so withholding a child may leave it partly ticked and take the list away -
 * `requirePolicyListAccess` BLOCKS such a case.
 */
export const POLICY_RIGHT = {
  /** Parent of the section's rights - "may list policies". */
  list: 'GetPolicies',
  view: 'GetPolicy',
  dashboard: 'GetPoliciesDashboard',
  dropdown: 'GetPoliciesDropdown',
  create: 'CreatePolicy',
  edit: 'UpdatePolicy',
  delete: 'DeletePolicy',
  clone: 'ClonePolicy',
  viewForClone: 'GetPolicyForClone',
  submit: 'SubmitPolicyForApproval',
  submitLegacy: 'SubmitPolicy',
  activate: 'SetPolicyActive',
  inactivate: 'InactivatePolicy',
  revert: 'RevertPolicyVersion',
  versions: 'GetPolicyVersions',
  audit: 'GetPolicyAuditTrail',
  auditLogs: 'View Audit Logs',
  export: 'ExportPolicies',
  import: 'Import policies, members and network assignments',
  importHistory: 'View policy upload history and results',
  /** Members tab (parent of ExportPolicyMembers). */
  members: 'GetPolicyMembers',
  memberCandidates: 'GetPolicyMemberCandidates',
  addMember: 'AddPolicyMember',
  removeMember: 'RemovePolicyMember',
  exportMembers: 'ExportPolicyMembers',
  /** Network Assignment tab (parent of ExportPolicyNetworks). */
  networks: 'GetPolicyNetworks',
  assignNetwork: 'AssignPolicyNetwork',
  unassignNetwork: 'UnassignPolicyNetwork',
  exportNetworks: 'ExportPolicyNetworks',
  /** Documentation tab - NOT held by the Payer Admin role on 2026-11-03. */
  documents: 'GetPolicyEndorsements',
  addDocument: 'CreatePolicyEndorsement',
  deleteDocument: 'DeletePolicyEndorsement',
  /** MemberAccumulators section. */
  accumulator: 'GetMemberAccumulator',
  benefitYears: 'GetPolicyBenefitYears',
  resetBenefits: 'ResetPolicyBenefits',
} as const;

export type PolicyRight = keyof typeof POLICY_RIGHT;

/** The rights whose effective code reads `MemberAccumulators.<label>` (the others `Policies.<label>`). */
export const ACCUMULATOR_RIGHTS: readonly PolicyRight[] = ['accumulator', 'benefitYears', 'resetBenefits'];

/** A shape for the `policyRole` fixture: rights to tick (first) and to untick (after). */
export interface PolicyShape {
  with?: readonly PolicyRight[];
  without?: readonly PolicyRight[];
}

/** Every right - parents first, so unticking a parent clears its children before they are visited. */
export const ALL_POLICY_RIGHTS: readonly PolicyRight[] = [
  'list', 'members', 'networks',
  ...(Object.keys(POLICY_RIGHT) as PolicyRight[]).filter((k) => !['list', 'members', 'networks'].includes(k)),
];

/** The effective-permission code of a right (`Policies.GetPolicy`, `MemberAccumulators.ResetPolicyBenefits`), '' for a label that is not a code. */
export function policyRightCode(right: PolicyRight): string {
  const label = POLICY_RIGHT[right];
  if (label.includes(' ')) return '';
  return `${ACCUMULATOR_RIGHTS.includes(right) ? 'MemberAccumulators' : 'Policies'}.${label}`;
}
