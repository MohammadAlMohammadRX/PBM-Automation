import { PLAN_LIFECYCLE, PLAN_MESSAGE } from './plan.data';
import { PLAN_SUITE } from './planSuite.data';
import { APPROVER_NAME, type PlanBlockedCase } from './rejectPendingPlanVersion.data';

/**
 * Test data for US 14148 "Assign or change a plan's formulary through the
 * approval workflow" (plan folder 04).
 *
 * How the sheet maps onto this environment (2026-10-27):
 * - The sheet's PayerA is the Plans suite payer ("Al sharq", data/plans/planSuite.data.ts),
 *   F-10 its formulary (fixture `planFormulary`), F-20 a second Active formulary of the
 *   same payer (fixture `suitePayerFormularies(2)[1]`), PayerB's F-30 an Active
 *   formulary of another payer (fixture `foreignFormulary`).
 * - The Formulary Assignment tab works by Remove + Assign: a draft's change applies
 *   at once (no approval request), a published plan's change is staged as a draft
 *   and goes live only once its "Send for Approval" is approved.
 * - The assignment carries NO effective period of its own (AssignFormularyToPlan
 *   takes only `{ planId, formularyId }`), so the two date-overlap cases cannot be
 *   expressed - BLOCKED below.
 * - The approver is the administrator (the only account with approval rights).
 */
export const CASE = {
  draftAssign: '18989',
  liveChangeHeld: '18990',
  crossPayer: '18991',
  clearAnyStatus: '18992',
  pendingNotLive: '18994',
  rejectedChange: '18995',
  requiredField: '18997',
  missingFormulary: '18999',
  rapidChanges: '19000',
  auditTrail: '19001',
  sharedApproval: '19002',
} as const;

export { APPROVER_NAME };

/** The minimal formulary shape the helpers below read (utils/FormularyProvisioning FormularyOption). */
interface FormularyRef {
  formularyCode: string | null;
  formularyNameEn: string;
}

/** How the picker and the cards name a formulary: its code (its English name when it has none). */
export const formularyCode = (formulary: FormularyRef): string => formulary.formularyCode ?? formulary.formularyNameEn;

const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Matches a cell / text that names the formulary by code or by English name. */
export const formularyMention = (formulary: FormularyRef): RegExp =>
  new RegExp([formulary.formularyCode, formulary.formularyNameEn].filter((t): t is string => Boolean(t)).map(escape).join('|'));

export const SUITE_PAYER = PLAN_SUITE.payerName;

export const LIFECYCLE = PLAN_LIFECYCLE;

/** The tab's state badge for a change saved but not yet sent. */
export const DRAFT_ASSIGNMENT = /Draft Assignment/i;

/** The "Important" notice a plan carries while a change awaits approval. */
export const PENDING_NOTICE = /awaiting approval|pending/i;

/** A payer-mismatch refusal (18991). */
export const PAYER_MISMATCH = /payer/i;

/** The refusal of a formulary that does not exist (18999). */
export const FORMULARY_NOT_FOUND = /not found|unable to load|does not exist|no longer exists/i;

/** A formulary id nothing carries - the sheet's F-999 (18999). */
export const MISSING_FORMULARY_ID = '00000000-0000-4000-8000-00000000f999';

/** A required-field message on the empty picker (18997). */
export const REQUIRED_FORMULARY = /required|select a formulary|choose a formulary/i;

/** The sheet's rejection reason "Incorrect drug list version" (18995) - the closest managed reason. */
export const REJECTION_REASON = 'Incorrect Data' as const;

/** The approval refusal of a plan left without a formulary (18992's live / expired plans). */
export const NEEDS_FORMULARY = PLAN_MESSAGE.needsFormulary;

/** How a second change on a plan already awaiting approval may be answered without corrupting it (19000). */
export const SECOND_CHANGE_HANDLED = /requiresDraftConfirmation|awaiting approval|pending|already/i;

/** Audit entries the timeline must show for a formulary change and its decision (19001). */
export const AUDIT_ACTION = {
  change: /Update|Formulary|Saved as Draft|Assign/i,
  submission: /Submitted|Send for Approval|Submit/i,
  decision: /Approv|Status Change|Publish/i,
} as const;

/** Cases this environment cannot run, with the exact missing resource. */
export const BLOCKED_CASES: PlanBlockedCase[] = [
  {
    azureId: '18993',
    title: 'should reject a formulary version whose effective period overlaps another version when the dates overlap',
    reason: 'A formulary assignment has no effective period of its own in this application: the Formulary Assignment tab and '
      + 'AssignFormularyToPlan take only { planId, formularyId }, so "a new formulary version effective 01-Jul-2026 to '
      + '31-Dec-2027" cannot be entered; and the existing version\'s fixed past dates (01-Jan-2026) are refused as being in '
      + 'the past. Needs an assignment-level effective period (or seeded past-dated plan versions) to run.',
  },
  {
    azureId: '18996',
    title: 'should let only a Plan Administrator submit a formulary change when a user without the role tries',
    reason: 'Needs a signed-in account WITHOUT plan formulary rights: the only non-administrator (Payer Admin) is scoped to '
      + '"Al Dawaa 2" / "NUPCO", and the role-shaping catalogue (data/accounts/payerAdminRole.data.ts ROLE_PERMISSION) has no '
      + 'Plans permission keys, so shapedNonAdmin cannot withhold the formulary right. Needs a "Viewer" account in the '
      + 'suite payer\'s scope, or the Plans permissions added to the role catalogue.',
  },
  {
    azureId: '18998',
    title: 'should evaluate the boundary consistently when a formulary version starts the day an existing version expires',
    reason: 'Same gap as 18993: an assignment carries no effective date, so versions "effective 01-Jan-2026 to 30-Jun-2026" '
      + 'and "effective 30-Jun-2026 / 01-Jul-2026" cannot be built - the dates are in the past and the assignment call takes '
      + 'no period. Needs an assignment-level effective period or seeded plan versions with those dates.',
  },
];
