/**
 * The Policy module's shared texts - read off the live screens and the
 * application's English translation bundle (`policy.*`, `fin.*`, chunk of
 * 2026-11-03; reports/policy/probe/i18n-*.flat.txt) - and the server's own
 * messages captured from its answers. Folder data files import from here
 * rather than retyping a label.
 *
 * Where the screen and a story disagree, the SCREEN's text is what is recorded
 * here; the story's expectation lives in the folder's data file and its case
 * asserts it (findings stay failing tests).
 */

export { SUITE_POLICY_PREFIX, SEED_POLICY_PREFIX, SUITE_POLICY_PLAN_PREFIX, POLICY_SUITE_PAYER, STAGED_DOCUMENT_PREFIX } from '../../utils/PolicyProvisioning';

/** Status badges (list, header, Overview). A never-approved policy reads "Not Live" whatever its status id. */
export const POLICY_STATUS_LABEL = {
  notLive: 'Not Live',
  draft: 'Draft',
  /** The `pending` code. */
  future: 'Future',
  active: 'Active',
  inactive: 'Inactive',
  expired: 'Expired',
  terminated: 'Terminated',
  inGrace: 'In Grace',
} as const;

/** The approval badge is `v<n> · <label>` ("v0 · Draft", "v1 · Approved", "v0 · Pending Approval", "v1 · Rejected"). */
export const APPROVAL_LABEL = {
  draft: 'Draft',
  pending: 'Pending Approval',
  approved: 'Approved',
  rejected: 'Rejected',
} as const;

/** `v1 · Approved` and so on - the screen's version badge. */
export const versionBadge = (version: number, label: string): string => `v${version} · ${label}`;

/** Matches any version badge, capturing the number and the label. */
export const VERSION_BADGE_RE = /^v(\d+)\s*·\s*(Draft|Pending Approval|Approved|Rejected)$/;

/** Policy numbers: `POL-D-0054` while never approved, `POL-2026-0035` once approved. */
export const DRAFT_NUMBER_RE = /^POL-D-\d{4}$/;
export const PUBLISHED_NUMBER_RE = /^POL-\d{4}-\d{4}$/;

/** Version History: Approval Status / Change labels. */
export const VERSION_STATUS_LABEL = { draft: 'Draft', pending: 'Pending Approval', published: 'Approved', superseded: 'Superseded', rejected: 'Rejected' } as const;
export const VERSION_CHANGE_LABEL = { create: 'Created', update: 'Updated', revert: 'Reverted', delete: 'Deleted', submit: 'Submitted', activate: 'Activated', inactivate: 'Deactivated' } as const;

/** Member roster states (`rosterState` -> label). */
export const MEMBER_STATE_LABEL = {
  live: 'Enrolled',
  draftEnrollment: 'Draft Enrollment',
  draftRemoval: 'Draft Removal',
  pendingEnrollment: 'Pending Enrollment',
  pendingRemoval: 'Pending Removal',
} as const;

/** Network assignment states (`assignmentState` -> label). */
export const NETWORK_STATE_LABEL = {
  live: 'Assigned',
  draftAssignment: 'Draft Assignment',
  draftRemoval: 'Draft Removal',
  pendingAssignment: 'Pending Assignment',
  pendingRemoval: 'Pending Removal',
} as const;

/** Document states (`state` -> label). */
export const DOCUMENT_STATE_LABEL = {
  live: 'On policy',
  draftAttachment: 'Draft Attachment',
  draftRemoval: 'Draft Removal',
  pendingAttachment: 'Pending Attachment',
  pendingRemoval: 'Pending Removal',
} as const;

/** Select options as the screens offer them (2026-11-03). */
export const OPTIONS = {
  policyType: ['Individual', 'Group'],
  statusFilter: ['All Statuses', 'Not Live', 'Future', 'Active', 'Inactive', 'Expired'],
  typeFilter: ['All Types', 'Individual', 'Group'],
  approvalFilter: ['All Approval States', 'Draft', 'Pending Approval', 'Approved'],
  /** The Add Member drawer leaves out "Self"; the members advanced search offers it. */
  relationship: ['Spouse', 'Child', 'Parent', 'Other'],
  relationshipFilter: ['Self', 'Spouse', 'Child', 'Parent', 'Other'],
  documentType: ['Rider Addition', 'Coverage Change', 'Member Change', 'Premium Adjustment', 'Other'],
  inactivationReason: ['Contract Suspended', 'Payment Issue', 'Policy Holder Request', 'Compliance Issue', 'Other'],
  /** Group holders (GetPolicyHoldersDropdown, terminology). */
  holders: ['Acme Corporation', 'Globex Corporation', 'Neorx'],
  networkStatusFilter: ['Future', 'Active', 'Inactive', 'Expired'],
  assignmentFilter: ['Assigned', 'Draft Assignment', 'Pending Assignment', 'Draft Removal', 'Pending Removal'],
  auditAction: ['Policy created', 'Policy cloned', 'Policy updated', 'Policy deleted', 'Status changed', 'Member enrolled', 'Member removed', 'Network assigned', 'Network unassigned', 'Documentation added', 'Documentation removed', 'Coverage ordering changed'],
  /** Sort menu labels, in order. */
  sort: ['Policy Name (A-Z)', 'Policy Name (Z-A)', 'Policy Number (A-Z)', 'Policy Number (Z-A)', 'Status (A-Z)', 'Status (Z-A)', 'Effective Date (A-Z)', 'Effective Date (Z-A)', 'Expiry Date (A-Z)', 'Expiry Date (Z-A)', 'Created On (Newest to Oldest)', 'Created On (Oldest to Newest)', 'Last Modified (Newest to Oldest)', 'Last Modified (Oldest to Newest)'],
} as const;

/** Field labels (the drawer, the Overview, the list headers). */
export const LABEL = {
  kpi: { total: 'Total Policies', active: 'Active Policies', draftPending: 'Draft / Pending', closed: 'Expired / Terminated' },
  listHeaders: ['Policy Name', 'Policy Number', 'Policy Type', 'Plan', 'Payer', 'Policy Holder', 'Status', 'Effective Date', 'Expiry Date', 'Members', 'Approval Status', 'Actions'],
  tabs: { overview: 'Overview', members: 'Members', networks: 'Network Assignment', documents: 'Documentation', versions: 'Version History', audit: 'Audit History' },
  steps: ['Policy Information', 'Coverage Period'],
  drawerTitle: { add: 'Add New Policy', edit: 'Edit Policy', clone: 'Clone Policy', member: 'Add Member', document: 'Add Documentation', inactivate: 'Inactivate Policy', reset: 'Reset policy benefits', version: 'Version Details', audit: 'Audit Entry' },
  memberHeaders: ['Member Number', 'Name', 'Relationship', 'Document ID', 'State', 'Actions'],
  networkHeaders: ['Network Code', 'Network', 'Status', 'Assignment', 'Assigned On', 'Actions'],
  versionHeaders: ['Version', 'Approval Status', 'Change', 'Networks', 'Requested By', 'Requested On', 'Reviewed By', 'Reviewed On', 'Actions'],
  approvalHeaders: ['Policy Name', 'Change Type', 'Status', 'Requested By', 'Requested On', 'Actions'],
  resetTabs: { policies: 'Policies in force', history: 'Reset history' },
  resetPolicyHeaders: ['Policy', 'Benefit period', 'Next reset', 'Members', 'Benefit used', 'Override'],
  selfHolder: 'Self Holder',
  holderStatic: 'The member themselves',
} as const;

/** Toasts (summary / detail). */
export const TOAST_TEXT = {
  savedAsDraft: { title: 'Saved as draft', body: 'Your changes were saved as a draft. Send the record for approval when you are ready.' },
  pendingApproval: { title: 'Submitted for approval', body: 'Your change has been submitted and is waiting for a second authorized user to approve it.' },
  noChanges: 'No changes were made — there is nothing to save.',
  saveFailed: { title: 'The policy was not saved', body: 'Please correct the highlighted fields and try again.' },
  draftDiscarded: { title: 'Draft discarded', body: 'The draft policy has been discarded.' },
  created: { title: 'Policy created', body: 'The policy has been created.' },
  deleted: { title: 'Policy deleted', body: 'The policy has been deleted.' },
  memberAdded: { title: 'Member added', body: 'The member has been enrolled.' },
  memberRemoved: { title: 'Member removed', body: 'The member has been removed.' },
  networkAssigned: { title: 'Network assigned', body: 'The network has been assigned.' },
  networkRemoved: { title: 'Network removed', body: 'The network has been removed.' },
  documentAdded: { title: 'Documentation added', body: 'The document has been recorded.' },
  documentDeleted: { title: 'Documentation deleted', body: 'The record and its attachment have been deleted.' },
  resetDone: { title: 'Policy benefits reset' },
} as const;

/** The server's own answers (successMessage / ValidationErrors / ErrorMessage), captured 2026-11-03. */
export const SERVER_MESSAGE = {
  createdAsDraft: 'The policy has been saved as a draft. Send it for approval when you are ready.',
  submitted: 'The change has been submitted for approval.',
  approved: 'Approval request approved successfully.',
  deletionStaged: 'The deletion has been saved as a draft. Send it for approval when you are ready.',
  /** Writes on a PENDING policy without confirmRevertToDraft answer 200 with this and `requiresDraftConfirmation: true`. */
  requiresDraftConfirmation: 'This policy is awaiting approval. Saving this change withdraws that request and returns the policy to draft.',
  pastEffective: 'Effective date and time cannot be in the past.',
  duplicateName: /A policy with this English name already exists for this payer in an overlapping pe/,
  needsNetwork: 'A policy must have at least one assigned network before this change can be approved.',
  needsMember: 'A policy must have at least one enrolled member before this change can be approved.',
  memberAlreadyEnrolled: 'This member is already enrolled in this policy.',
  memberLimitReached: 'This policy has reached its member limit.',
  networkAlreadyAssigned: 'This network is already assigned to the policy.',
  onlyActiveNetworks: 'Only active networks can be assigned to a policy.',
  deleteWithMembers: 'Cannot delete a policy that has enrolled members. Please remove the members first.',
  memberRequired: 'Member is required.',
  invalidPolicyId: 'Invalid policy ID.',
  resetSameDay: "The policy's current benefit period already starts today; it cannot be reset again today.",
} as const;

/** Inline field messages. */
export const FIELD_MESSAGE = {
  required: 'This field is required.',
  holderRequired: 'Select a policy holder.',
  memberRequired: 'Select a member.',
  expiryBeforeEffective: 'Expiry date must be after the effective date.',
  arabicOnly: 'Arabic name must contain only Arabic characters.',
  graceRange: 'Grace period must be between 0 and 365 days.',
  maxMembersMin: 'The member limit must be at least 1.',
  maxBelowCurrent: 'The member limit cannot be below the members already enrolled.',
  coinsuranceRange: 'Coinsurance must be between 0 and 100.',
  oopBelowDeductible: 'The out-of-pocket maximum cannot be less than the deductible.',
  amountNotNegative: 'The amount must be zero or greater.',
  detailsTooLong: 'Details must not exceed 500 characters.',
  fileTooLarge: 'The attachment must not exceed 10 MB.',
  fileType: 'The attachment must be a PDF, Word document, or image.',
  resetReasonTooLong: 'The reason must not exceed 1000 characters.',
  resetFileType: 'Only a PDF document can be attached.',
  resetFileTooLarge: 'The document must not exceed 10 MB.',
} as const;

/** Confirmation dialogs (`#pbm-dialog`): titles and messages. */
export const DIALOG = {
  submit: { title: 'Send for approval?', message: 'This policy and all of its draft changes will be sent to a reviewer. You can still edit it afterwards, but doing so returns it to draft.', confirm: 'Send for Approval' },
  returnToDraft: { title: 'Return this policy to draft?', confirm: 'Continue' },
  activate: { title: 'Activate policy?', message: 'The change is saved as a draft — send it for approval when you are ready, and the policy becomes Active once a reviewer approves it.' },
  removeMember: { title: 'Delete Member', message: (name: string) => `Do you want to delete ${name}?`, confirm: 'Remove', cancel: 'No' },
  removeNetwork: { title: 'Delete Network', message: (name: string) => `Do you want to delete ${name}?`, confirm: 'Remove', cancel: 'No' },
  deleteDocument: { title: 'Delete Documentation', message: (title: string) => `Do you want to delete ${title}?`, confirm: 'Delete documentation', cancel: 'No' },
  reject: { title: 'Reject this request', alert: 'Rejecting discards the proposed change. The requester has to submit it again from scratch.' },
} as const;

/** Notices and hints. */
export const NOTICE = {
  formDraft: 'This policy will be submitted for approval. Once a reviewer approves it, it becomes Pending and turns Active on its effective date.',
  draftHint: 'This policy has draft changes that are not live yet. Keep editing them, then send them for approval.',
  pendingHint: 'This policy is awaiting approval. Editing it will withdraw the request and return it to draft.',
  rejectedHint: 'This policy was rejected and was never published. Edit it to start a new draft. Reason:',
  notApprovedYet: 'Not available until this policy is approved.',
  groupNotActive: 'Members can be added once the group policy is active.',
  membersReadOnly: 'Members cannot be changed on an expired or terminated policy.',
  memberLimitReached: (max: number) => `Member limit of ${max} reached. Raise the limit to enroll more.`,
  networksReadOnly: 'Network assignments cannot be changed on an expired or terminated policy.',
  noNetworkForPayer: (payer: string) => `No assignable networks belong to ${payer}. A policy can only be linked to networks of its own payer — assign one to this payer first, in Network Management.`,
  inactivateApproval: 'Needs approval. Switching this saves a draft — it takes effect only after you send it for approval and a reviewer approves it.',
  inactivateWarning: 'The policy leaves service once approved. Its members’ claims stop adjudicating against it until it is reactivated. The change is saved as a draft — send it for approval when you are ready.',
  typeImmutable: 'Policy type cannot be changed after creation.',
  holderSelf: 'An individual policy is held by the person it covers, so there is no separate policy holder to choose.',
  cloneSource: (name: string) => `This creates a NEW policy from "${name}". The name has been given a "Clone" suffix and the effective and expiry dates are blank — set the new policy period below. The original policy is not changed.`,
  cloneUnpublishedSource: 'The original policy has not been approved yet and has no members, networks or documentation, so only its details will be cloned.',
  emptyMembers: 'No members enrolled yet.',
  emptyNetworks: 'No networks assigned yet.',
  emptyDocuments: 'No documentation recorded yet.',
  emptyVersions: 'No version history yet. The first approved change will appear here.',
  emptyAudit: 'No audit history for this policy yet.',
  emptyList: 'No policies found.',
  noResets: 'No resets have been recorded yet.',
  noPolicyInForce: 'No policy is in force.',
  noSublimits: 'No sublimits consumed in this period.',
  deleteBlockedMembers: (members: number) => `Cannot delete: ${members} member(s) are enrolled. Remove them first.`,
  deleteBlockedDocuments: (docs: number) => `Cannot delete: this policy has ${docs} document(s) on file. A document amends the policy and cannot outlive it.`,
  importIntro: /^Import Policies from a file in the template format/,
  importHint: 'Excel (.xlsx) or CSV (.csv), up to 25 MB. Headers in English or Arabic both work.',
  importLocked: 'Your policy import is still running. Policy changes are unavailable to you until it finishes — you can still view, search and export.',
} as const;

/** Text of an exact length (field-limit cases): `textOfLength(255)`, Arabic with `textOfLength(255, 'ar')`. */
export function textOfLength(length: number, script: 'en' | 'ar' = 'en'): string {
  const unit = script === 'ar' ? 'وثيقة' : 'Policy';
  return unit.repeat(Math.ceil(length / unit.length)).slice(0, length);
}

/** A suite-prefixed English name of an exact length. */
export function suiteNameOfLength(length: number, prefix = 'QA Automation Policy '): string {
  return `${prefix}${textOfLength(Math.max(0, length - prefix.length))}`;
}
