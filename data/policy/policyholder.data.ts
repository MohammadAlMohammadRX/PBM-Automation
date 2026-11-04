import type { PolicyShape } from './policyPermissions.data';
import { POLICY_SCOPED_PAYER } from '../../utils/policy/writerBHelpers';

/**
 * US 15172 "Assign a Single Policyholder to policy" (policy folder 05).
 *
 * In this build a GROUP policy takes its holder from a select (GetPolicyHoldersDropdown:
 * Acme Corporation, Globex Corporation, Neorx - terminology) and the drawer's
 * Next refuses an empty one ("Select a policy holder."); an INDIVIDUAL policy
 * shows the static "The member themselves" (list / Overview: "Self Holder").
 *
 * Literal readings and TC-vs-AC notes:
 * - 19421 / 19428 "a Draft policy has no policyholder assigned": built through
 *   CreatePolicy as a Group policy with `policyHolderId: null` (the screen cannot
 *   make one). When the server refuses that, the precondition cannot exist and
 *   the case is BLOCKED quoting the answer - the stronger rule is then enforced
 *   at creation, not at submission.
 * - 19422 / 19425 "set to Self": the screen's "The member themselves" (drawer)
 *   and "Self Holder" (Overview) are read as Self.
 * - 19429: the case's test data is "Status = Pending Approval" while its title
 *   says "approved"; the Pending Approval policy is used. "Remove or clear the
 *   policyholder": the select offers no clear, so the attempt is the form's own
 *   request (UpdatePolicy with `policyHolderId: null`).
 * - 19430: "the field is shown as read-only" on a Pending Approval policy - the
 *   AC allows holder changes "only while status is Draft"; the Edit drawer of a
 *   pending policy is looked at, and a change, if the select takes one, is saved
 *   to see whether it is kept.
 * - 19431: the holder of a SAVED Draft, in its Edit drawer (the case opens the
 *   Draft); the type select must be switchable for the case to proceed.
 * - 19432 "submit": step 3's submit is the drawer's Next (blocked without a
 *   holder), step 4's is the completed Save (the policy is created).
 * - 19434: the unauthorised role is the Payer Admin shaped without UpdatePolicy,
 *   on an approved (Future) and a Draft policy of that account's payer.
 * - 19435 "every policyholder configured in terminology": the holder select's
 *   source, GetPolicyHoldersDropdown, read in full.
 */
export const CASES = {
  noHolderSubmit: { azureId: '19421', label: 'No Holder' },
  individualSelf: { azureId: '19422' },
  holderSubmit: { azureId: '19423', holder: 'Acme Corporation' },
  individualLocked: { azureId: '19425' },
  changeInDraft: { azureId: '19426', from: 'Acme Corporation', to: 'Globex Corporation' },
  groupSelect: { azureId: '19427', holder: 'Neorx' },
  groupNoHolder: { azureId: '19428', label: 'Group No Holder' },
  removeApproved: { azureId: '19429', holder: 'Acme Corporation' },
  pendingLocked: { azureId: '19430', from: 'Acme Corporation', to: 'Globex Corporation' },
  typeSwitch: { azureId: '19431', holder: 'Acme Corporation' },
  rulesByType: { azureId: '19432', holder: 'Globex Corporation', label: 'Holder Rules' },
  rapidToggle: { azureId: '19433', rounds: 3, label: 'Rapid Toggle' },
  holderPermission: { azureId: '19434', payerName: POLICY_SCOPED_PAYER, shape: { without: ['edit'] } satisfies PolicyShape, to: 'Globex Corporation' },
  terminologyList: { azureId: '19435' },
} as const;

/** "Self" as the screens put it: "The member themselves" (drawer), "Self Holder" (list / Overview). */
export const SELF = /self|themselves/i;

/** A holder-required refusal. */
export const HOLDER_REQUIRED = /holder/i;

/** A removal refused once approved. */
export const HOLDER_LOCKED = /holder|cannot|not allowed|approved|required/i;

/** A permissions refusal. */
export const DENIED = /permission|not authori[sz]ed|access denied|forbidden|not allowed|denied|unauthori[sz]ed/i;
