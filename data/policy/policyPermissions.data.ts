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
/**
 * SINCE THE BUILD OF 14 NOV 2026 the privilege tree shows plain labels ("View version history", "View audit history"),
 * not the codes read on 2026-11-03, and labels such as "View audit logs" repeat in every section - so each right is
 * addressed by its catalogue KEY (`key:<Module.Key>`, RolePermissionsStep). Keys VERIFIED 23 Nov 2026 through
 * GetRolePermissions; the codes above were blocking every shaped case ("no GetPolicyVersions permission": 19615,
 * 19635, 19636). The label each key shows is noted beside it.
 */
export const POLICY_RIGHT = {
  /** Parent of the section's rights - "may list policies" ("View policies"). */
  list: 'key:Policies.GetPolicies',
  view: 'key:Policies.GetPolicy', // View policy details
  dashboard: 'key:Policies.GetPoliciesDashboard', // View policies dashboard
  dropdown: 'key:Policies.GetPoliciesDropdown', // List policies in pickers
  create: 'key:Policies.CreatePolicy', // Create policy
  edit: 'key:Policies.UpdatePolicy', // Edit policy
  delete: 'key:Policies.DeletePolicy', // Delete policy
  clone: 'key:Policies.ClonePolicy', // Clone policy
  viewForClone: 'key:Policies.GetPolicyForClone', // Open a policy for cloning
  submit: 'key:Policies.SubmitPolicyForApproval', // Send policy for approval
  submitLegacy: 'key:Policies.SubmitPolicy', // Submit policy
  activate: 'key:Policies.SetPolicyActive', // Activate policy
  inactivate: 'key:Policies.InactivatePolicy', // Inactivate policy
  revert: 'key:Policies.RevertPolicyVersion', // Revert to a previous version
  versions: 'key:Policies.GetPolicyVersions', // View version history
  audit: 'key:Policies.GetPolicyAuditTrail', // View audit history
  auditLogs: 'key:Policies.AuditLogs', // View audit logs
  export: 'key:Policies.ExportPolicies', // Export policies
  import: 'key:Policies.BulkImport', // Import policies, members and network assignments
  importHistory: 'key:Policies.ViewBulkHistory', // View policy upload history and results
  /** Members tab (parent of ExportPolicyMembers) - "View policy members". */
  members: 'key:Policies.GetPolicyMembers',
  memberCandidates: 'key:Policies.GetPolicyMemberCandidates', // Search members to enroll
  addMember: 'key:Policies.AddPolicyMember', // Add policy member
  removeMember: 'key:Policies.RemovePolicyMember', // Remove policy member
  exportMembers: 'key:Policies.ExportPolicyMembers', // Export policy members
  /** Network Assignment tab (parent of ExportPolicyNetworks) - "View policy networks". */
  networks: 'key:Policies.GetPolicyNetworks',
  assignNetwork: 'key:Policies.AssignPolicyNetwork', // Assign network
  unassignNetwork: 'key:Policies.UnassignPolicyNetwork', // Remove network
  exportNetworks: 'key:Policies.ExportPolicyNetworks', // Export network assignments
  /** Documentation tab - "View documentation" (NOT held by the Payer Admin role on 2026-11-03). */
  documents: 'key:Policies.GetPolicyEndorsements',
  addDocument: 'key:Policies.CreatePolicyEndorsement', // Add documentation
  deleteDocument: 'key:Policies.DeletePolicyEndorsement', // Delete documentation
  /** MemberAccumulators section. */
  accumulator: 'key:MemberAccumulators.GetMemberAccumulator', // View member benefit accumulator
  benefitYears: 'key:MemberAccumulators.GetPolicyBenefitYears', // View policy benefit years
  resetBenefits: 'key:MemberAccumulators.ResetPolicyBenefits', // Reset a policy's benefits
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
  const label: string = POLICY_RIGHT[right];
  // A catalogue key IS the effective-permission code (since 23 Nov 2026 every right is addressed by its key).
  if (label.startsWith('key:')) return label.slice('key:'.length);
  if (label.includes(' ')) return '';
  return `${ACCUMULATOR_RIGHTS.includes(right) ? 'MemberAccumulators' : 'Policies'}.${label}`;
}
