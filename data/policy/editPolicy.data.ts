import type { PolicyShape } from './policyPermissions.data';
import { POLICY_SCOPED_PAYER } from '../../utils/policy/writerBHelpers';

/**
 * US 15169 "Edit policy" (policy folder 03).
 *
 * How editing works in this build (foundation notes, 2026-11-03): only a
 * never-approved (v0) policy offers Edit - header, row and card; a published
 * one has none, and every later change (member, network, document) is STAGED
 * as a draft of the next version and goes through Send for Approval. The Edit
 * drawer seen live (probe 31 / 32) rendered the English / Arabic names and the
 * Deductible, Coinsurance, Out-of-Pocket and Sublimit inputs DISABLED, and the
 * bundle says "Policy type cannot be changed after creation." - the cases below
 * that change those fields assert the case and fail where the field is locked.
 * Why (2026-11-04 triage, bundle + register): the drawer locks the names, plan,
 * holder and the four amounts when the policy's status code is not "draft",
 * but a v0 policy never carries that code (every v0 in the register has statusId
 * "pending" (Future) or "active") - so they are locked on every Draft V0; the
 * type is locked in Edit always ("Policy type cannot be changed after creation.").
 * 19493 / the member limit: the number field drops a minus sign and ignores
 * letters, which prevents those values at input (nothing is saved then).
 *
 * Literal readings and TC-vs-AC notes:
 * - 19482 / 19483 / 19485: the CASE says the deductible, coinsurance, amounts,
 *   names, type, plan and holder of a Draft V0 can be changed; the AC lists them
 *   under the v0 edit too. A disabled field is reported by name.
 * - 19485: the plan is changed to another plan of the payer whose period covers
 *   the policy's when one is offered (else the current plan is chosen again and
 *   only its being editable is shown); the TYPE is checked for being editable
 *   but not switched, because switching Group -> Individual drops the holder the
 *   same step changes.
 * - 19489 / 19490: "the Compliance Officer" and "the Reviewer" are the one
 *   administrator account - it approves its own requests (no checker account).
 *   "The reviewer's pending list" is the hub's Policy tab.
 * - 19491: a policy carries NO trades, price history, benefit configuration or
 *   tiers in this build (they belong to the plan's formulary), although the
 *   story's AC names them among "policy changes". The case is automated
 *   literally - the published policy is looked at for such a section - and its
 *   absence is the finding (decision item: TC/AC vs design).
 * - 19492: "a full edit form through direct navigation" is the URL
 *   `/policy-management/{id}/edit` AND the form's own request (UpdatePolicy) sent
 *   directly - both must be refused for a published policy.
 * - 19494: the sheet's dates (2026-06-01 / 2026-05-31 / 2026-12-31) are in the
 *   past on the run date and a past effective time is refused outright; the same
 *   shape is used relative to today (effective in 3 days, expiry the day before
 *   / 60 days after).
 * - 19495: "view-only user" = the Payer Admin role shaped without the policy
 *   write rights (UpdatePolicy, CreatePolicy, DeletePolicy, ClonePolicy,
 *   SubmitPolicyForApproval, InactivatePolicy, SetPolicyActive), on a Draft of
 *   that account's payer (it does not see the suite payer's policies); "the user
 *   with edit permission" is the administrator.
 * - 19497: "change the Network Assignment tab" = assign a second ACTIVE network
 *   of the payer (removing the only one could never be approved); "the
 *   Compliance Officer is notified" is not observable (no notification feed) and
 *   is not asserted. BLOCKED at run time when the payer has no second active network.
 */
export const CASES = {
  draftEdit: { azureId: '19482', deductibleBefore: 100, deductibleAfter: 250 },
  limits: { azureId: '19483', start: { deductibleAmount: 100, coinsurancePercent: 20, outOfPocketMaximum: 1000, sublimitAmount: 500 } },
  coreInfo: { azureId: '19485', holderBefore: 'Acme Corporation', holderAfter: 'Globex Corporation', nameLabel: 'Edited', arabicPrefix: 'وثيقة معدلة' },
  publishedTabs: { azureId: '19487' },
  listEditRemoved: { azureId: '19488' },
  approvalGate: { azureId: '19489', relationship: 'Spouse' },
  reviewerVisibility: { azureId: '19490', documentTitle: 'Automation Reviewer Visibility Note' },
  tradeTierChange: { azureId: '19491', section: /trade|benefit|tier|pric/i },
  restrictedInfo: { azureId: '19492' },
  memberLimit: { azureId: '19493', start: 10, negative: '-5', text: 'abc', valid: '500' },
  expiryBeforeEffective: { azureId: '19494', effectiveInDays: 3, validExpiryDays: 60 },
  editPermission: {
    azureId: '19495',
    payerName: POLICY_SCOPED_PAYER,
    shape: { without: ['edit', 'create', 'delete', 'clone', 'submit', 'inactivate', 'activate'] } satisfies PolicyShape,
  },
  rejectAndResubmit: { azureId: '19497' },
} as const;

/** A validation message of any wording (the case quotes none for these fields). */
export const VALIDATION = /required|invalid|must|cannot|positive|at least|number|numeric|valid/i;

/** The server / screen refusing an edit of a published policy. */
export const LOCKED = /cannot|not allowed|not permitted|published|approved|read.?only|locked|denied|only .*draft/i;

