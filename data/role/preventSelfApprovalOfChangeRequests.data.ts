/**
 * US 21285 - Prevent Self-Approval of Change Requests (folder 06, writer E, 12 cases).
 *
 * WHO IS WHO: careconnect (the admin `page`, may approve its own requests) and the ONE role holder maalmohammad
 * (`roleHolder`). In every case the requester and the reviewer are DIFFERENT accounts unless the case is about the
 * same account (self-approval). "User A / User B", "the requester", "the reviewer", "user (a)..(d)" are mapped
 * per case below.
 *
 * WHAT IS CHANGED - only the suite's own records (brief SAFETY):
 *  - Payer cases (22042, 22045, 22047) use a payer this test publishes (`suitePayers.publish()`, purged at
 *    teardown) or the `draftPayer` fixture; the change is the License Number (the payer module's usual edit).
 *  - Cases that name no entity (22044, 22048-22053) and the Network case (22043) use networks the suite
 *    provisions itself ("Automation Network <stamp>", approved, effective in two days so nothing goes live), or a
 *    formulary the holder creates for the published suite payer (22044 - every predefined role may create one).
 *  - Every request the suite raises is tracked with `suiteApprovals.track()` and rejected at teardown; holder-made
 *    formularies are also discarded (`discardFormularyNamed`). Approve All / Reject All are never used.
 *
 * LEAD DEFAULTS APPLIED (decision -> case)
 *  - 7: "new registration" (22047) = a NEW suite payer submitted for approval (Payer tab), not an invitation
 *    registration (story 20422 is Manual).
 *  - 2: "Payer record", "two pending requests" etc. are examples where the case names no entity - a suite
 *    network stands in (22048-22053); the data comments say which.
 *  - 8: a step that cannot be observed (the holder lacks the approval right that makes a hidden Approve
 *    meaningful; a predefined role cannot submit any change) is BLOCKED at run time, unless an earlier step
 *    already failed (the finding stays a FAIL).
 *  - 22048 (needs details): module = Network approvals; the three permissions are mapped in REVIEWER_SHAPES.
 *  - 22052 (needs details): "the audit trail/history for both requests" = the network's own Audit History
 *    (GetNetworkAuditTrail, the entity's audit tab) - an entry after the decision must name the reviewer, the
 *    action and carry a timestamp. The title's "same permissions" claim has no step of its own.
 *  - 22044: Payer Officer holds no approval right at all (foundation: Approval Management 0/18, Approvals 0/6),
 *    so its "blocked" proves the missing right as much as the self-approval rule - asserted as the case words it.
 */

/** The payer field edited in the payer cases (License Number - free text, no approval side effects). */
export const PAYER_EDIT_FIELD = 'License Number';

/** A fresh License Number for an edit. */
export const newLicence = (tag: string): string => `LIC-ROLE-${tag}-${Date.now().toString(36).toUpperCase()}`;

/** A fresh network description for an edit. */
export const newNetworkDescription = (tag: string): string => `Changed by role case ${tag} ${Date.now().toString(36)}`;

/** The approval queue status texts the cases name ("Approved", "Rejected", "Pending Approval"). */
export const REQUEST_STATUS = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' } as const;
/** The TC quotes "Pending Approval"; an edited published payer reads "Under change · Pending approval" (smoke
 *  2026-11-14) - the same state, matched without regard to case. */
export const PAYER_PENDING_APPROVAL = /pending approval/i;

/**
 * Rights of a suite role that may see the Approval Management screen and its requests but decide nothing:
 * the two module nodes + View Approval Submissions + View an Approval Submission (so users (a)-(c) of 22048 can
 * reach the request at all - the assessment's open question, answered "yes" here).
 */
export const APPROVAL_VIEW_RIGHTS = ['ApprovalManagement', 'Approvals', 'Approvals.GetApprovals', 'Approvals.GetApprovalDetail'] as const;

/** 22048 / 22053 - the three permissions of the AC, mapped to catalogue keys for the NETWORK tab. */
export const THREE_PERMISSIONS = {
  /** "access to the relevant module tab" - Network Approvals. */
  tab: ['ApprovalManagement.Network'],
  /** "permission to perform actions on that tab" - Network Approvals > Approve/Reject. */
  action: ['ApprovalManagement.Network.ApproveReject'],
  /** "the general permission to review, approve or reject requests" - Approvals > ApproveRequest / RejectRequest. */
  general: ['Approvals.ApproveRequest', 'Approvals.RejectRequest'],
} as const;

/** 22048 users (a)-(d): the one suite role on the holder is reshaped to each in turn (rights reach the session at once). */
export const REVIEWER_SHAPES = {
  a: [...APPROVAL_VIEW_RIGHTS, ...THREE_PERMISSIONS.tab],
  b: [...APPROVAL_VIEW_RIGHTS, ...THREE_PERMISSIONS.action],
  c: [...APPROVAL_VIEW_RIGHTS, ...THREE_PERMISSIONS.general],
  d: [...APPROVAL_VIEW_RIGHTS, ...THREE_PERMISSIONS.tab, ...THREE_PERMISSIONS.action, ...THREE_PERMISSIONS.general],
} as const;

/** 22050 / 22053 - tab + action, WITHOUT the general review permission. */
export const WITHOUT_GENERAL_RIGHTS = [...APPROVAL_VIEW_RIGHTS, ...THREE_PERMISSIONS.tab, ...THREE_PERMISSIONS.action] as const;

/** 22051 - a holder that may change and submit a network AND review network requests (all three permissions). */
export const NETWORK_MAKER_CHECKER_RIGHTS = [
  'Networks',
  'Networks.GetNetworks',
  'Networks.GetNetwork',
  'Networks.UpdateNetwork',
  'Networks.SubmitNetworkForApproval',
  ...REVIEWER_SHAPES.d,
] as const;

/**
 * 22050 sends ApproveRequest directly from a session WITHOUT the general review permission, against a request the
 * suite raised on its own network - not a predefined role, not the System Administrator - so the attempt is
 * allowed. Switch to `allowed: false` to block the step instead.
 */
export const BYPASS_APPROVE_GATE = {
  allowed: true,
  reason: 'the direct ApproveRequest attempt is switched off in data/role/preventSelfApprovalOfChangeRequests.data.ts',
} as const;

/** The decision words an audit entry must carry (22052): action type or text. */
export const AUDIT_ACTION = { approve: /approv/i, reject: /reject/i } as const;

export const CASES = {
  otherReviewerApproves: {
    azureId: '22042',
    /** User A = the holder as Organization Administrator (requester); User B = careconnect (reviewer, holds all three). */
    requesterRole: 'Organization Administrator',
  },
  requesterCannotSelfApprove: {
    azureId: '22043',
    /** The requester = the holder as Organization Administrator (self-approval box unticked on that role). */
    requesterRole: 'Organization Administrator',
  },
  predefinedRolesNoSelfApproval: {
    azureId: '22044',
    roles: ['Organization Administrator', 'Payer Administrator', 'Payer Officer'],
  },
  payerChangeRouted: { azureId: '22045' },
  otherChangesRouted: { azureId: '22046' },
  newRegistrationRouted: { azureId: '22047' },
  missingAnyPermission: { azureId: '22048', label: 'reviewer shape' },
  approveAndReject: {
    azureId: '22049',
    /** Requester = careconnect; reviewer = the holder as Organization Administrator (all three permissions). */
    reviewerRole: 'Organization Administrator',
  },
  bypassScreen: { azureId: '22050', label: 'no general review' },
  selfApprovalToggle: { azureId: '22051', label: 'self approver' },
  auditTrail: { azureId: '22052', reviewerRole: 'Organization Administrator' },
  cannotRejectEither: { azureId: '22053', label: 'no general reject' },
} as const;
