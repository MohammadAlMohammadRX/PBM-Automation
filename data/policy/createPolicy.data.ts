import type { PolicyShape } from './policyPermissions.data';
import { POLICY_SCOPED_PAYER } from '../../utils/policy/writerBHelpers';

/**
 * US 15173 "Create policy" (policy folder 06).
 *
 * The Add Policy drawer (verified live 2026-11-03): step 1 "Policy Information"
 * (English / Arabic name, Policy Type, Payer, Plan, holder), step 2 "Coverage
 * Period" (Deductible, Coinsurance %, Out-of-Pocket Maximum, Sublimit, Grace
 * Period, Member Limit, Effective / Expiry date-time). Save creates a v0 Draft
 * ("Not Live", `v0 · Draft`); Send for Approval makes it `v0 · Pending Approval`;
 * the FIRST approval gives status Future (code `pending` - the AC's "Pending").
 *
 * Literal readings and TC-vs-AC notes:
 * - Names a case types carry the suite prefix (`QA Automation Policy <label> <stamp>`)
 *   so teardown owns them; the sheet's names ("Family Health Plan") are the label.
 * - 19436 "appears in the policy list with status Draft": the row's Status reads
 *   "Not Live" and its Approval Status "v0 · Draft" - Draft is looked for across both.
 * - 19437 / 19439: the English name input has no maxlength (bundle / probe); 255
 *   must pass Next untruncated, 256 must raise a max-length message (the AC's limit).
 * - 19440 "the logged-in user's current payer": the administrator belongs to no
 *   payer, so the Payer Admin account is used, scoped to its payer
 *   (POLICY_SCOPED_PAYER, NUPCO); its Add drawer must show that payer, filled in.
 * - 19441 "Plan C of Payer Y": the plan of an existing policy of another payer
 *   (read-only), which must NOT be offered for "Al sharq".
 * - 19443 / 19444 / 19445 / 19452 "a policy at Step 2 Coverage Period": the Add
 *   drawer's step 2 (this is the create story); 19443 creates one policy at 0 %
 *   and another at 100 %. 19444 / 19445: the amount and coinsurance inputs are
 *   number fields (min 0, coinsurance max 100) that drop a minus sign and cap
 *   101 at 100 - a value the field does not keep is prevented at input (as in
 *   the Formulary suite) and nothing is saved; a kept one must be refused with
 *   the message (2026-11-04 triage: the run saved the capped / positive value).
 * - 19448: the sheet's effective date (2026-10-27) is in the past; the policy is
 *   made effective two minutes out and approved before that. "Remains Pending
 *   Approval" after the approval is read as the AC's "Pending" (status code
 *   `pending`, label Future), not Active. Step 3 "advance to the effective date"
 *   is NOT drivable: Active is set only by the daily policy lifecycle job (time
 *   not exposed or configurable - foundation notes), so the step is BLOCKED at
 *   run time unless the policy already reads Active. (Same class as the Manual
 *   date cases 19449 / 19455; a candidate for the Manual tag.)
 * - 19451: "a user without Compliance Officer or Policy Administrator role" is the
 *   Payer Admin shaped without CreatePolicy. Step 3 (approve as the same user)
 *   is BLOCKED at run time: that account's role holds "Policy Approvals >
 *   Approve/Reject" and the policy rights catalogue the suite shapes
 *   (data/policy/policyPermissions.data.ts) has no approval right to withhold.
 * - 19452: the sheet's dates (2026-11-01 / 2026-10-01) are in the past; the same
 *   shape (expiry a month before the effective date) is used ahead of today.
 * - 19453: "Coverage Holder" and "Policy Holder" are both looked for, as listed.
 */
export const CASES = {
  createDraft: {
    azureId: '19436',
    label: 'Family Health Plan',
    nameAr: 'خطة صحية عائلية',
    type: 'Group',
    holder: 'Acme Corporation',
    coverage: { deductible: '500', coinsurance: '20', outOfPocket: '5000', sublimit: '2000', gracePeriod: '5' },
  },
  name255: { azureId: '19437', length: 255 },
  arabicOnly: { azureId: '19438', nameAr: 'Family Plan' },
  name256: { azureId: '19439', length: 256 },
  payerDefault: { azureId: '19440', payerName: POLICY_SCOPED_PAYER },
  plansOfPayer: { azureId: '19441' },
  holderByType: { azureId: '19442' },
  coinsuranceBounds: { azureId: '19443', values: ['0', '100'] as const },
  coinsuranceAbove: { azureId: '19444', value: '101' },
  negativeAmounts: { azureId: '19445', value: '-500', fields: ['deductible', 'outOfPocket', 'sublimit'] as const },
  submitDraft: { azureId: '19446' },
  mandatoryStep1: { azureId: '19447' },
  activeOnEffective: { azureId: '19448', effectiveInMinutes: 2 },
  identityLocked: { azureId: '19450' },
  createAccess: { azureId: '19451', payerName: POLICY_SCOPED_PAYER, shape: { without: ['create'] } satisfies PolicyShape },
  expiryBeforeEffective: { azureId: '19452', effectiveInDays: 40, expiryInDays: 10 },
  fieldChecklist: {
    azureId: '19453',
    // The spec's "English / Arabic Policy Name" render as "Policy Name" and "اسم الوثيقة"
    // (each in its own language, 2026-11-03); the fields themselves are checked by id.
    step1: ['Policy Name', 'اسم الوثيقة', 'Policy Type', 'Payer', 'Plan', 'Coverage Holder', 'Policy Holder'],
    step2: ['Deductible', 'Coinsurance', 'Out-of-Pocket', 'Sublimit', 'Grace Period', 'Member Limit', 'Effective Date', 'Expiry Date'],
  },
  stepsKeepData: { azureId: '19456', deductible: '750' },
} as const;

/** "Draft" anywhere in the row's Status / Approval Status. */
export const DRAFT = /Draft/;

/** A max-length message for the English name. */
export const NAME_TOO_LONG = /255|maximum|too long|exceed|at most|characters/i;

/** The Active status reached only by the daily lifecycle job (19448). */
export const LIFECYCLE_JOB_REASON = 'the policy did not turn Active within this run: in this build Active is set only by the daily policy lifecycle job '
  + '(its time is neither exposed nor configurable in System Settings - foundation notes), and the first approval always gives Future, so '
  + '"advance to the effective date" cannot be driven by a test. Same class as the Manual date cases 19449 / 19455.';

/** 19451 step 3. */
export const APPROVAL_RIGHT_REASON = 'the "approve as the same unauthorised user" half needs a role without policy approval rights: the only second '
  + 'account (Payer Admin) holds "Policy Approvals > Approve/Reject", and the policy rights catalogue the suite shapes '
  + '(data/policy/policyPermissions.data.ts) has no approval right to withhold - so an Approve offered to it says nothing about authorisation.';

