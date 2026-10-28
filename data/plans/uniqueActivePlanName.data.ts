import { NON_ADMIN_PROFILE } from '../accounts/nonAdminAccount.data';
import { planFormData, planNamed, type PlanFormData } from './plan.data';
import { PLAN_FORM_MESSAGE, type PlanBlockedCase } from './createPlan.data';
import type { PlanSpec } from '../../utils/PlanProvisioning';

/**
 * Test data for US 14325 "Enforce unique active plan name at every stage of a
 * change" (plan folder 19), written 2026-10-27.
 *
 * Every name is the sheet's name plus a unique suffix (planNamed), so a re-run
 * never meets an earlier run's Active namesake. The existing holders of a name
 * ("Silver Care 2026", "Wellness Choice 2026", ...) are provisioned by the case
 * itself in the state it needs (fixture `planIn`); the new plans are made
 * through the Add Plan wizard.
 *
 * SAME-NAME PLANS ARE ADDRESSED BY ID. Two plans carrying one name make the
 * list row and the approval-queue row ambiguous (both are matched by name), so
 * those cases drive the plan detail screen by id and approve a named plan's
 * request by id (PlanManagementPage.approveRequestOfPlan).
 *
 * "ACTIVE AT APPROVAL": a form-made plan is effective a few minutes ahead (now
 * is refused as past); the case waits that out before approving, so the
 * approval makes it Active at once rather than Pending until the lifecycle job.
 */

/** The wait for an approved plan to read Active (approval landing + one lifecycle-job pass). */
export const ACTIVE_WAIT_MS = 5 * 60_000;

/** The duplicate-name refusal, in any wording. */
export const DUPLICATE_NAME = PLAN_FORM_MESSAGE.duplicateName;

/** The refusal must point at the Active holder of the name. */
export const ACTIVE_REFERENCE = /active/i;

/** ApprovalManagementPage.attemptApprove's answer for an accepted decision ("... answered 200: ..."). */
export const APPROVED_ANSWER = /answered 2\d\d/;

/** 19195's checklist for the duplicate-name message. */
export const MESSAGE_CHECKLIST = {
  namesField: /name/i,
  statesReason: /already|active|in use|exist/i,
  jargon: /exception|stack|sql|null|undefined|error code|guid|\b[45]\d\d\b/i,
  suggestsAction: /choose|different|another|change|rename|unique|use a/i,
} as const;

/** The English-name length limit - INFERRED from the network module's 255, not yet verified on plans. */
export const PLAN_NAME_MAX = 255;

/** A unique name of exactly `length` characters (the sheet's suffix padded with letters). */
export const nameOfLength = (length: number): string => `${planNamed('Max Length Plan')} ${'x'.repeat(length)}`.slice(0, length);

/** A plan the non-admin account can see: a draft of its first scoped payer, no formulary. */
export const NON_ADMIN_VISIBLE_DRAFT: PlanSpec = { payerName: NON_ADMIN_PROFILE.scopedPayers[0], noFormulary: true };

/** Statuses a refused unauthorised request may carry. */
export const DENIED_STATUSES = [401, 403] as const;

/** Form data for a new plan carrying `nameEn`. */
export const newPlanNamed = (nameEn: string): PlanFormData => planFormData({ nameEn });

export const UNIQUE = {
  uniqueName: { azureId: '19183', name: () => planNamed('Gold Advantage 2026') },
  duplicateActive: { azureId: '19184', name: () => planNamed('Silver Care 2026') },
  reuseInactive: { azureId: '19186', name: () => planNamed('Platinum Plus 2025') },
  blockedAtSubmit: { azureId: '19187', name: () => planNamed('Executive Health 2026') },
  blockedAtApproval: { azureId: '19188', name: () => planNamed('Executive Health 2026') },
  onlyOneActive: { azureId: '19189', name: () => planNamed('Wellness Choice 2026') },
  reuseDeleted: { azureId: '19190', name: () => planNamed('Family Care 2024') },
  normalised: {
    azureId: '19192',
    name: () => planNamed('Family Shield 2026'),
    variants: (name: string): { label: string; value: string }[] => [
      { label: 'different case', value: name.toUpperCase() },
      { label: 'leading and trailing spaces', value: ` ${name} ` },
    ],
  },
  simultaneousApprovals: { azureId: '19193', name: () => planNamed('Corporate Care 2026'), labels: ['Plan D', 'Plan E'] as const },
  renameMidEdit: { azureId: '19194', reserved: () => planNamed('Reserved Name 2026'), draft: () => planNamed('Plan F Unique') },
  clearMessage: { azureId: '19195', name: () => planNamed('Guardian Health 2026') },
  viewerRole: { azureId: '19196' },
  lengthLimits: { azureId: '19197', oneCharacter: 'Q', overMax: () => nameOfLength(PLAN_NAME_MAX + 1), atMax: () => nameOfLength(PLAN_NAME_MAX) },
} as const;

/**
 * The cases this environment cannot run: both need a plan holding the name in
 * EXPIRED status, and none can be produced within a run - a plan's period must
 * be at least one calendar day (same-day periods are refused, US 14147) and its
 * effective date cannot be in the past, so a new plan expires a day later at
 * the earliest, and the suite provisions its records rather than sampling
 * whatever the shared environment happens to hold.
 */
export const BLOCKED_CASES: PlanBlockedCase[] = [
  {
    azureId: '19185',
    title: 'should accept a reused name and activate the new plan when the previous holder has expired',
    reason:
      'Needs a plan carrying the name in EXPIRED status. A plan cannot be made to expire within a run: its expiry must '
      + 'fall on a later calendar day than its effective date (same-day periods are refused) and the effective date '
      + 'cannot be in the past, so the earliest expiry is a day after provisioning. Runnable with a plan seeded the day '
      + 'before (effective now, expiry next day) and its name passed to this case, as the payer expiry seed cases do.',
  },
  {
    azureId: '19191',
    title: 'should accept a freed name for a new effective period when the earlier plan has expired',
    reason:
      'Needs an EXPIRED plan holding the name ("Summer Health 2024") to free it for a 2027 period. Expiry cannot be '
      + 'reached within a run (the period must span at least one calendar day and cannot start in the past); runnable '
      + 'with a plan seeded the day before and expired overnight, like the payer expiry seed cases.',
  },
];
