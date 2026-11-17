/**
 * US 21301 "Configure Approval Management Permissions" (role folder 16, 19 cases 22170-22188) - Writer F.
 *
 * PERMISSIONS (catalogue keys, foundation 2026-11-14). Tabs: `ApprovalManagement.<Payer|Network|Plan|Policy|
 * Formulary|Invitation>` ("<Module> Approvals", Registrations = Invitation), each with `.ApproveReject`
 * ("Approve/Reject", one at a time) and `.ApproveRejectAll` ("Approve/Reject all", bulk). General
 * (Approvals module): GetApprovals, GetApprovalDetail, ApproveRequest, RejectRequest, GetPendingApprovalCount
 * (+ ExportApprovals). Registration: Invitations.GetInvitationApprovals / ApproveInvitation / RejectInvitation.
 *
 * NAMES (lead decision 3): the AC / TCs quote the general rights as "View Approval Submissions", "View an
 * Approval Submission", "Approve a Submission", "Reject a Submission", "View Pending Approval Count" and the
 * registration ones as "View Invitation Approvals", "Approve Invitation", "Reject Invitation". Wherever a step
 * confirms such a right on the Role Management screen, the View Role tree row of that key must carry the
 * QUOTED name (GENERAL_LABEL / INVITATION_LABEL). The foundation saw the technical keys ("ApproveRequest",
 * "GetPendingApprovalCount", ...) - those steps FAIL with what was shown (finding).
 *
 * WHO IS WHO. The reviewer is the role holder maalmohammad (`roleHolder`) holding a suite role made for the
 * case (rights below), or a predefined role where the case needs the product's own approver:
 *  - 22181 / 22186 (self-approval disabled, full approval rights, the reviewer SUBMITS): Organization
 *    Administrator - it can create the entity and approve, and may not approve its own (predefined facts).
 *  - 22182 (self-approval enabled in ONE of its roles): Organization Administrator + a suite role with
 *    "Can a user approve their own requests?" ticked holding the Payer approval rights.
 *  - 22184 / 22185 (bulk, payer-scoped so the queue holds suite requests only - SAFETY): Payer Administrator
 *    scoped to ONE existing suite payer ("Automation Payer ...", read only): bulk + self-approval disabled.
 *  - 22187 ("reviewer with full Network rights", requests from OTHER submitters): Organization Administrator;
 *    careconnect submits.
 *  - 22183: careconnect itself (the System Administrator, role "Admin").
 * "A different user / another submitter" = careconnect (only careconnect and the holder can sign in -
 * "several other users" (22184) = several requests of careconnect).
 *
 * REQUESTS (decision 2 - example entities replaced): every pending request is a NEW suite entity submitted
 * through the API ("Automation Network/Plan ...", "QA Automation Policy/Formulary ...") on the suite's data
 * payer (Plans / Policy / Formulary suites: "Al sharq", FORM-0023 read only) - or, for the Payer tab, a
 * Licence Number change of a payer PUBLISHED for the case (`suitePayers.publish()`, purged at teardown).
 * Every request is tracked by `suiteApprovals` (rejected at teardown if still pending).
 *
 * Decisions / open points:
 *  - 22170 BASE_VIEW_RIGHTS (assessment question): the reviewer role also holds View Approval Submissions /
 *    View an Approval Submission - without them the AC hides the Approvals menu and no tab could show.
 *    "Enable the Payer tab permission only" = tick the Payer Approvals group in the Edit drawer; the tree
 *    ticks the group's children too (foundation: a group tick fills it) - asserted as shown.
 *  - 22171 / 22175 "cannot be reached, including by direct navigation" / "cannot access any of its
 *    requests": the hub has no route per tab, so the direct way in is GetApprovals for the Network tab
 *    through the reviewer's own session - it must be refused or return nothing
 *    (API_COUNTS_AS_ACCESS = true; set false to judge the tab strip only).
 *  - 22175 EXTRA_TAB: the role holds the Payer tab so the screen has a tab to load (step 2 "loads").
 *  - 22176 Role A / Role B are run one after the other on the holder (reshaped between the logins).
 *  - 22177 BLOCKED (decision 7): a registration waiting for approval exists only after someone registers
 *    through the e-mailed invitation link (story 20422 is Manual) - REGISTRATION_GATE. Step 1 (the rights on
 *    the Role Management screen) runs; the rest is BLOCKED while the gate is closed.
 *  - 22180 "count badge on the Approvals menu": a number on the Approval Mgmt menu entry equal to
 *    GetPendingApprovalCount through the reviewer. The foundation saw no number on that entry (the hub's
 *    tabs carry counts) - if so step 2 FAILS (finding).
 *  - 22183 (PARTIAL): the precondition "self-approval disabled on all assigned roles" cannot be set
 *    (careconnect's static "Admin" role is never edited) - recorded as a note; steps 2-4 run.
 *  - 22184 "a message indicating no eligible requests were approved" - no text quoted: the dialog / toast
 *    must say something (asserted non-empty, shown in the failure) and the own requests stay pending.
 *    "Add one / several requests from another submitter" = careconnect submits 1, then SEVERAL_OTHERS.
 *  - 22186 the message is quoted literally (FOUR_EYES_MESSAGE); the forced approve = ApproveRequest through
 *    the reviewer's own session for its own request (the UI shows no control).
 *  - 22187 step 5 "the history/status list": GetApprovals of the Network tab with no status filter, read
 *    by the reviewer (the queue's own history) - the two requests show Approved / Rejected.
 *  - 22181 OWN_REQUEST_MESSAGE is quoted literally (AC).
 */
export const CASES = {
  tabOnly: { azureId: '22170' },
  tabHidden: { azureId: '22171' },
  approveOne: { azureId: '22172' },
  viewOnly: { azureId: '22173' },
  noGeneralApprove: { azureId: '22174' },
  generalNoTab: { azureId: '22175' },
  bulkVsSingle: { azureId: '22176' },
  registration: { azureId: '22177' },
  rejectInDrawer: { azureId: '22178' },
  bulkControls: { azureId: '22179' },
  pendingCount: { azureId: '22180' },
  ownRequestMessage: { azureId: '22181' },
  selfApproveAllowed: { azureId: '22182' },
  adminSelfApprove: { azureId: '22183' },
  approveAllSkipsOwn: { azureId: '22184' },
  rejectAllSkipsOwn: { azureId: '22185' },
  fourEyes: { azureId: '22186' },
  approveThenReject: { azureId: '22187' },
  sixModules: { azureId: '22188' },
} as const;

/** The six approval modules: tab key on the hub, catalogue module key, the tree group's label. */
export const APPROVAL_MODULES = [
  { tab: 'payer', key: 'ApprovalManagement.Payer', label: 'Payer Approvals' },
  { tab: 'network', key: 'ApprovalManagement.Network', label: 'Network Approvals' },
  { tab: 'plan', key: 'ApprovalManagement.Plan', label: 'Plan Approvals' },
  { tab: 'policy', key: 'ApprovalManagement.Policy', label: 'Policy Approvals' },
  { tab: 'formulary', key: 'ApprovalManagement.Formulary', label: 'Formulary Approvals' },
  { tab: 'invitation', key: 'ApprovalManagement.Invitation', label: 'Registration Approvals' },
] as const;

/** The one-at-a-time and bulk leaves' labels (TC 22188 / AC). */
export const ACTION_LABEL = { one: 'Approve/Reject', all: 'Approve/Reject all' } as const;

export const tabKey = (module: string): string => `ApprovalManagement.${module}`;
export const oneKey = (module: string): string => `ApprovalManagement.${module}.ApproveReject`;
export const allKey = (module: string): string => `ApprovalManagement.${module}.ApproveRejectAll`;

/** The general rights and the names the AC gives them. */
export const GENERAL = {
  viewList: 'Approvals.GetApprovals',
  viewOne: 'Approvals.GetApprovalDetail',
  approve: 'Approvals.ApproveRequest',
  reject: 'Approvals.RejectRequest',
  count: 'Approvals.GetPendingApprovalCount',
} as const;
export const GENERAL_LABEL: Record<string, string> = {
  [GENERAL.viewList]: 'View Approval Submissions',
  [GENERAL.viewOne]: 'View an Approval Submission',
  [GENERAL.approve]: 'Approve a Submission',
  [GENERAL.reject]: 'Reject a Submission',
  [GENERAL.count]: 'View Pending Approval Count',
};
export const INVITATION = {
  view: 'Invitations.GetInvitationApprovals',
  approve: 'Invitations.ApproveInvitation',
  reject: 'Invitations.RejectInvitation',
} as const;
export const INVITATION_LABEL: Record<string, string> = {
  [INVITATION.view]: 'View Invitation Approvals',
  [INVITATION.approve]: 'Approve Invitation',
  [INVITATION.reject]: 'Reject Invitation',
};

/** 22170: the general view rights every reviewer role holds (see header). */
export const BASE_VIEW_RIGHTS = [GENERAL.viewList, GENERAL.viewOne] as const;
/** The general approve + reject rights. */
export const GENERAL_DECIDE = [GENERAL.approve, GENERAL.reject] as const;

/** Reviewer roles per case (suite roles; keys). */
export const ROLE_RIGHTS = {
  /** 22170 before the edit: the view rights only (no tab). */
  tabOnlyBefore: [...BASE_VIEW_RIGHTS],
  /** 22171: Payer tab, no Network tab. */
  payerTabOnly: [...BASE_VIEW_RIGHTS, tabKey('Payer')],
  /** 22172: Plan tab + one-at-a-time + Approve a Submission. */
  planApprove: [...BASE_VIEW_RIGHTS, tabKey('Plan'), oneKey('Plan'), GENERAL.approve],
  /** 22173: Policy tab, view only. */
  policyView: [...BASE_VIEW_RIGHTS, tabKey('Policy')],
  /** 22174: Formulary tab + its Approve/Reject, NO general Approve. */
  formularyNoGeneral: [...BASE_VIEW_RIGHTS, tabKey('Formulary'), oneKey('Formulary')],
  /** 22175: general approve / reject + the Payer tab (EXTRA_TAB), NO Network tab. */
  generalNoNetwork: [...BASE_VIEW_RIGHTS, ...GENERAL_DECIDE, tabKey('Payer')],
  /** 22176 Role A: Payer tab one-at-a-time. */
  payerOne: [...BASE_VIEW_RIGHTS, ...GENERAL_DECIDE, tabKey('Payer'), oneKey('Payer')],
  /** 22176 Role B: + bulk. */
  payerBulk: [...BASE_VIEW_RIGHTS, ...GENERAL_DECIDE, tabKey('Payer'), oneKey('Payer'), allKey('Payer')],
  /** 22177: the registration rights. */
  registration: [...BASE_VIEW_RIGHTS, tabKey('Invitation'), INVITATION.view, INVITATION.approve, INVITATION.reject],
  /** 22178: Plan tab one-at-a-time + general approve / reject. */
  planOne: [...BASE_VIEW_RIGHTS, ...GENERAL_DECIDE, tabKey('Plan'), oneKey('Plan')],
  /** 22179: Policy tab bulk + general. */
  policyBulk: [...BASE_VIEW_RIGHTS, ...GENERAL_DECIDE, tabKey('Policy'), oneKey('Policy'), allKey('Policy')],
  /** 22180 reviewer 1: + View Pending Approval Count; reviewer 2 = without it. */
  countOn: [...BASE_VIEW_RIGHTS, tabKey('Payer'), GENERAL.count],
  countOff: [...BASE_VIEW_RIGHTS, tabKey('Payer')],
  /** 22182: the Payer approval rights on the self-approving suite role. */
  payerSelfApprove: [...BASE_VIEW_RIGHTS, ...GENERAL_DECIDE, tabKey('Payer'), oneKey('Payer'), allKey('Payer')],
} as const;

/** 22175 / 22171: GetApprovals of the hidden tab through the reviewer counts as reaching it (see header). */
export const API_COUNTS_AS_ACCESS = true;

/** 22177: registrations waiting for approval cannot be produced (story 20422 Manual). */
export const REGISTRATION_GATE = {
  allowed: false,
  reason: 'A registration waiting for approval exists only after someone registers through the e-mailed invitation link; story 20422 (registration) is Manual since 2026-11-08 and the suite cannot complete a registration - lead decision 7.',
} as const;

/** 22183: the System Administrator's own role cannot be set to "self-approval disabled". */
export const ADMIN_SELF_APPROVAL_PRECONDITION = {
  met: false,
  note: 'Precondition not met by design: careconnect\'s static "Admin" role (the System Administrator) is never edited and is not listed on Role Administration, so "Can a User Approve Their Own Requests?" cannot be disabled on it; steps 2-4 run as the System Administrator.',
} as const;

/** Literal texts (AC). */
export const OWN_REQUEST_MESSAGE = 'You submitted this request. A different reviewer must approve or reject it.';
export const FOUR_EYES_MESSAGE = 'You cannot approve a request you submitted (four-eyes principle).';

/** Predefined reviewer roles used (see header). */
export const FULL_REVIEWER = 'Organization Administrator' as const;
export const SCOPED_BULK_REVIEWER = 'Payer Administrator' as const;
/** View Role labels. */
export const VIEW_LABEL = { selfApproval: /approve their own requests/i, hasAssignedPayers: /Has Assigned Payers/i } as const;
export const YES_NO = { yes: 'Yes', no: 'No' } as const;

/** 22184: "several" other requests. */
export const SEVERAL_OTHERS = 3;
/** Row action sets (sorted). */
export const ROW_ACTIONS = {
  oneAtATime: ['approve', 'review'],
  bulk: ['approve', 'reject', 'review'],
  viewOnly: ['review'],
} as const;
/** Request statuses as GetApprovals answers them. */
export const STATUS = { pending: 'Pending', approved: /Approved/i, rejected: /Rejected/i } as const;
/** The drawer's Reject reason ("Other" also needs Rejection Details since 2026-11 - typed by writerFHelpers). */
export const REJECT_REASON = 'Other';

/**
 * Failure text of a View Role tree comparison (triage 2026-11-15). The tree rows of the general and registration
 * rights carry the technical keys ("ApproveRequest", "GetPendingApprovalCount", "ApproveInvitation"...) instead
 * of the names the TC / AC quote - per lead decision 3 that FAILS (finding); the step now says which row shows what.
 */
export const TREE_DIFF = 'View Role tree rows that differ from the case (key: shown vs expected label [state])';
