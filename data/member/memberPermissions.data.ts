/**
 * The Member rights the member suite shapes on the existing "Payer Admin" role,
 * through the `memberRole` fixture of utils/member/memberRole.ts (the Policy
 * `policyRole` approach: rights toggled by catalogue LABEL, restored at
 * teardown, the shaped account signed in through shapedNonAdmin).
 *
 * THE LABELS come from the role catalogue on 2026-11-05
 * (reports/member/Member-Foundation-Notes.md, "Permissions"):
 *   Members   GetMembers is the LIST right and parent of the rest:
 *             "Import members" (BulkImport), CheckDocumentIdExists, CheckEmailExists,
 *             CreateMember, DeleteMember, ExportMembers, GetBenefitByPatientId,
 *             GetMember, GetMemberForEdit, GetMembersDashboard, SetMemberActive,
 *             UpdateMember, "View member upload history and results" (ViewBulkHistory)
 *             - the Payer Admin role held ALL of them on 2026-11-05.
 *   Cob       GetMemberCobTimeline (parent): ReorderMemberCoverage, GetPolicyCobRules,
 *             CreateCobRule, UpdateCobRule, DeleteCobRule - NOT held by the Payer Admin.
 *   MemberAccumulators  GetMemberAccumulator (parent): GetPolicyBenefitYears,
 *             GetResetJobHistory, ResetPolicyBenefits - NOT held by the Payer Admin.
 *
 * Activate and Deactivate are ONE right (SetMemberActive). A case the catalogue
 * cannot express is BLOCKED naming the missing right.
 *
 * THE PARENT TRAP: GetMembers is the parent of every member right, so
 * withholding a child may leave it partly ticked and take the list away -
 * `requireMemberListAccess` BLOCKS such a case.
 */
export const MEMBER_RIGHT = {
  /** Parent of the Members section - "may list members". */
  list: 'GetMembers',
  view: 'GetMember',
  dashboard: 'GetMembersDashboard',
  create: 'CreateMember',
  editOpen: 'GetMemberForEdit',
  edit: 'UpdateMember',
  delete: 'DeleteMember',
  setActive: 'SetMemberActive',
  export: 'ExportMembers',
  import: 'Import members',
  importHistory: 'View member upload history and results',
  benefitLookup: 'GetBenefitByPatientId',
  checkDocumentId: 'CheckDocumentIdExists',
  checkEmail: 'CheckEmailExists',
  /** Cob section (parent GetMemberCobTimeline). */
  cob: 'GetMemberCobTimeline',
  cobReorder: 'ReorderMemberCoverage',
  cobRules: 'GetPolicyCobRules',
  cobCreateRule: 'CreateCobRule',
  cobUpdateRule: 'UpdateCobRule',
  cobDeleteRule: 'DeleteCobRule',
  /** MemberAccumulators section (parent GetMemberAccumulator). */
  accumulator: 'GetMemberAccumulator',
  benefitYears: 'GetPolicyBenefitYears',
  resetHistory: 'GetResetJobHistory',
  resetBenefits: 'ResetPolicyBenefits',
} as const;

export type MemberRight = keyof typeof MEMBER_RIGHT;

/** The section each right's effective-permission code lives in. */
const SECTION: Partial<Record<MemberRight, string>> = {
  cob: 'Cob', cobReorder: 'Cob', cobRules: 'Cob', cobCreateRule: 'Cob', cobUpdateRule: 'Cob', cobDeleteRule: 'Cob',
  accumulator: 'MemberAccumulators', benefitYears: 'MemberAccumulators', resetHistory: 'MemberAccumulators', resetBenefits: 'MemberAccumulators',
};

/** The effective code of rights whose catalogue label is a sentence. */
const CODE_OF_LABEL: Partial<Record<MemberRight, string>> = {
  import: 'Members.BulkImport',
  importHistory: 'Members.ViewBulkHistory',
};

/** A shape for the `memberRole` fixture: rights to tick (first) and to untick (after). */
export interface MemberShape {
  with?: readonly MemberRight[];
  without?: readonly MemberRight[];
}

/** Every right - parents first, so unticking a parent clears its children before they are visited. */
export const ALL_MEMBER_RIGHTS: readonly MemberRight[] = [
  'list', 'cob', 'accumulator',
  ...(Object.keys(MEMBER_RIGHT) as MemberRight[]).filter((k) => !['list', 'cob', 'accumulator'].includes(k)),
];

/** The effective-permission code of a right (`Members.GetMember`, `Cob.ReorderMemberCoverage`). */
export function memberRightCode(right: MemberRight): string {
  const coded = CODE_OF_LABEL[right];
  if (coded) return coded;
  return `${SECTION[right] ?? 'Members'}.${MEMBER_RIGHT[right]}`;
}
