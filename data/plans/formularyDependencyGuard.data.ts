import { PLAN_APPROVAL_CELL } from './plan.data';
import { PLAN_SUITE } from './planSuite.data';
import type { PlanBlockedCase } from './rejectPendingPlanVersion.data';

/**
 * Test data for US 14342 "Prevent formulary payer changes or deletion while a
 * plan depends on it" (plan folder 27).
 *
 * Every formulary a case changes or deletes is its own (fixture
 * `disposableFormulary`: a fresh Active formulary of the suite payer) - never a
 * team formulary; "assigned to a plan" is an Active plan carrying it
 * (`planIn('Active', { formularyId })`), "a plan change in progress that
 * assigns it" a plan awaiting approval with it (`planIn('PendingApproval', ...)`).
 * The new payer is the payer of `foreignFormulary` (another real payer).
 * Formulary actions go through the Formulary module (pages/formulary/FormularyDetailPage).
 *
 * The edit drawer renders the payer read-only in edit mode (bundle, 2026-10-27),
 * so a payer change is SENT the way the drawer would send it (UpdateFormulary).
 */
export const CASE = {
  unassignedChange: '19336',
  assignedBlocked: '19337',
  oneOrMany: '19338',
  decisionTable: '19339',
  deleteBlockedPending: '19340',
  deleteAfterDiscard: '19341',
  deleteAfterDecision: '19342',
  payerLocked: '19343',
  repeatedAttempts: '19344',
  listConsistent: '19346',
  reevaluated: '19347',
} as const;

export const SUITE_PAYER = PLAN_SUITE.payerName;

/** "Formulary B (5 plans)" - more than one plan is the case; two keep the run within reason. */
export const MANY_PLANS = 2;

/** How many rapid repeats 19344 sends. */
export const REPEATS = 3;

/** MSG-PLN-018 - the payer cannot change while the formulary is assigned to a plan. */
export const PAYER_CHANGE_BLOCKED = /MSG-PLN-018|payer[\s\S]*(assigned|plan)|(assigned|plan)[\s\S]*payer/i;

/** MSG-PLN-019 - "Cannot delete: a plan change that assigns this formulary is awaiting approval. Have that change decided first." */
export const DELETE_BLOCKED_PENDING = /MSG-PLN-019|plan change[\s\S]*(awaiting approval|in progress)/i;

/** An inline warning that the payer cannot be changed (19343). */
export const PAYER_LOCK_WARNING = /cannot be changed|can't be changed|locked|assigned to .*plan/i;

export const APPROVAL_CELL = PLAN_APPROVAL_CELL;

export const BLOCKED_CASES: PlanBlockedCase[] = [
  {
    azureId: '19345',
    title: 'should deny the payer change and the delete when a Read-Only user tries them',
    reason: 'Needs a signed-in "Read-Only User" account without formulary edit / delete rights in the suite payer\'s scope: '
      + 'the only non-administrator (Payer Admin) is scoped to "Al Dawaa 2" / "NUPCO", and the role-shaping catalogue '
      + '(data/accounts/payerAdminRole.data.ts) has no Formulary permission keys, so shapedNonAdmin cannot withhold '
      + 'UpdateFormulary / DeleteFormulary. Needs that account, or the Formulary permissions added to the role catalogue.',
  },
];
