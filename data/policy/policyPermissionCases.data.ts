import { ALL_POLICY_RIGHTS, type PolicyRight, type PolicyShape } from './policyPermissions.data';
import type { PolicyBlockedCase } from '../../utils/policy/writerCHelpers';

/**
 * US 15189 "Policy Permissions" (policy folder 18) - and the shapes the other
 * Writer C folders use for the Payer Admin account.
 *
 * HOW THE ROLE IS SHAPED (user decision 2026-11-03): the existing "Payer Admin"
 * role is granted / withheld policy rights by catalogue label through the
 * `policyRole` fixture (utils/policy/policyRole.ts, labels in
 * data/policy/policyPermissions.data.ts), as the Formulary suite's
 * `formularyRole`. Evidence, never a verdict: a withheld right the account is
 * still told it holds is annotated `permission-not-propagated`, a granted one
 * it is not told it holds `permission-not-granted`.
 *
 * VISIBILITY: the Payer Admin sees only its own payers' policies, not the suite
 * payer "Al sharq" - every policy of these cases is built for SCOPED_POLICY_PAYER
 * (NUPCO, utils/policy/writerCHelpers.ts), so only the permission can explain
 * what the account is offered. Draft policies are built without a network (no
 * dependency on that payer's networks); the cases that need a published policy
 * are BLOCKED by the fixture when that payer offers no active network.
 *
 * THE TERMINOLOGY TRAP: GetPolicies is the parent of every policy right;
 * withholding a child may take the list with it - `requirePolicyListAccess`
 * BLOCKS such a case.
 *
 * Catalogue facts behind the readings (2026-11-03): ONE import right for
 * policies, members and networks ("Import policies, members and network
 * assignments"); no "Edit" right for a member, a network assignment or a
 * document (none can be edited); Activate = SetPolicyActive, Inactivate =
 * InactivatePolicy (separate, as the story asks).
 * - 19655 "Activate only": the list / view rights are kept (the policy must be
 *   opened) and every ACTION right but SetPolicyActive withheld; the activation
 *   is staged, so the administrator sends and approves it before the status is
 *   read (the case expects Active).
 * - 19665 / 19667 / 19668 "Edit": the step expects an edit control (19665: the
 *   edit to succeed) - none exists; 19667 / 19668 expect it unavailable.
 * - 19666: members import is the shared import right.
 * - 19673: the checklist below names, per required permission, the catalogue
 *   labels that would satisfy it.
 */

/** The ACTION rights of a policy (story 15189 "policy actions"). */
export const ACTION_RIGHTS: readonly PolicyRight[] = ['create', 'edit', 'delete', 'clone', 'viewForClone', 'submit', 'submitLegacy', 'activate', 'inactivate', 'revert', 'import', 'importHistory', 'export'];

/** Every right that changes a policy, its tabs or exports / imports its data. */
export const WRITE_RIGHTS: readonly PolicyRight[] = [
  ...ACTION_RIGHTS,
  'addMember', 'removeMember', 'exportMembers', 'assignNetwork', 'unassignNetwork', 'exportNetworks', 'addDocument', 'deleteDocument', 'resetBenefits',
];

/** Every policy right named (grants first), then `withhold` unticked. */
export const fullAccessWithout = (...withhold: PolicyRight[]): PolicyShape => ({
  with: ALL_POLICY_RIGHTS.filter((r) => !withhold.includes(r)),
  without: withhold,
});

/** Every policy right. */
export const FULL_ACCESS: PolicyShape = { with: ALL_POLICY_RIGHTS };
/** The list and the record only - every write right withheld. */
export const VIEW_ONLY: PolicyShape = fullAccessWithout(...WRITE_RIGHTS);
/** No policy right at all. */
export const NO_ACCESS: PolicyShape = { without: ALL_POLICY_RIGHTS };
/** Only the given rights (plus nothing else of the section). */
export const only = (...keep: PolicyRight[]): PolicyShape => fullAccessWithout(...ALL_POLICY_RIGHTS.filter((r) => !keep.includes(r)));

/** 19673 - the permissions the story names, with the catalogue labels that would satisfy each (a separate, selectable row). */
export const REQUIRED_PERMISSIONS: Record<string, Record<string, readonly string[]>> = {
  actions: {
    'Send for Approval': ['SubmitPolicyForApproval'],
    Activate: ['SetPolicyActive', 'ActivatePolicy'],
    Inactivate: ['InactivatePolicy'],
    Delete: ['DeletePolicy'],
    Clone: ['ClonePolicy'],
    View: ['GetPolicy'],
    Import: ['ImportPolicies', 'Import policies, members and network assignments'],
    Export: ['ExportPolicies'],
  },
  tabs: {
    Members: ['GetPolicyMembers'],
    'Network Assignment': ['GetPolicyNetworks'],
    Documentation: ['GetPolicyEndorsements'],
    'Version History': ['GetPolicyVersions'],
    'Audit History': ['GetPolicyAuditTrail'],
  },
  membersSub: {
    Add: ['AddPolicyMember'],
    Edit: ['UpdatePolicyMember', 'EditPolicyMember'],
    Delete: ['RemovePolicyMember'],
    Import: ['ImportPolicyMembers', 'Import policy members'],
    Export: ['ExportPolicyMembers'],
  },
  networksSub: {
    Add: ['AssignPolicyNetwork'],
    Edit: ['UpdatePolicyNetwork', 'EditPolicyNetwork'],
    Delete: ['UnassignPolicyNetwork'],
    Import: ['ImportPolicyNetworks', 'Import policy network assignments'],
    Export: ['ExportPolicyNetworks'],
  },
  documentationSub: {
    Add: ['CreatePolicyEndorsement'],
    Edit: ['UpdatePolicyEndorsement', 'EditPolicyEndorsement'],
    Delete: ['DeletePolicyEndorsement'],
  },
};

/** 19672 - the mixed set: View, Members Add, Network Assignment Export (and the list, the tabs they live in, the member picker). */
export const MIXED_RIGHTS: readonly PolicyRight[] = ['list', 'view', 'members', 'memberCandidates', 'addMember', 'networks', 'exportNetworks'];

export const CASES = {
  activateOnly: { azureId: '19655', shape: fullAccessWithout(...ACTION_RIGHTS.filter((r) => r !== 'activate')) },
  noDelete: { azureId: '19656', shape: fullAccessWithout('delete') },
  viewOnly: { azureId: '19657', shape: VIEW_ONLY },
  noSubmit: { azureId: '19658', shape: fullAccessWithout('submit', 'submitLegacy') },
  cloneOnlyWithRight: { azureId: '19659', withClone: FULL_ACCESS, withoutClone: fullAccessWithout('clone', 'viewForClone'), cloneLabel: 'Perm Clone' },
  importOnlyWithRight: { azureId: '19660', withImport: FULL_ACCESS, withoutImport: fullAccessWithout('import', 'importHistory'), importLabel: 'Perm Import' },
  exportOnlyWithRight: { azureId: '19661', withExport: FULL_ACCESS, withoutExport: fullAccessWithout('export') },
  noMembersTab: { azureId: '19662', shape: fullAccessWithout('members', 'exportMembers', 'addMember', 'removeMember', 'memberCandidates') },
  noVersionsTab: { azureId: '19663', shape: fullAccessWithout('versions', 'revert') },
  noAuditTab: { azureId: '19664', shape: fullAccessWithout('audit', 'auditLogs') },
  membersNoDelete: { azureId: '19665', shape: fullAccessWithout('removeMember') },
  membersNoImportExport: { azureId: '19666', shape: fullAccessWithout('import', 'importHistory', 'exportMembers') },
  networksAddExportOnly: { azureId: '19667', shape: fullAccessWithout('unassignNetwork', 'import', 'importHistory') },
  documentsAddOnly: { azureId: '19668', shape: fullAccessWithout('deleteDocument') },
  noPolicyRights: { azureId: '19669', shape: NO_ACCESS },
  revokedWhileSignedIn: { azureId: '19670', granted: FULL_ACCESS, revoke: { without: ['inactivate'] } as PolicyShape },
  noBypass: { azureId: '19671', shape: fullAccessWithout('delete') },
  mixedPartial: { azureId: '19672', shape: only(...MIXED_RIGHTS) },
  catalogueChecklist: { azureId: '19673' },
} as const;

/** Nothing in this story is BLOCKED by data: every case shapes the Payer Admin role (a fixture BLOCKS what it cannot build). */
export const BLOCKED_CASES: PolicyBlockedCase[] = [];
