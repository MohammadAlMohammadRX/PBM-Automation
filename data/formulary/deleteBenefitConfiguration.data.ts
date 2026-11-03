import type { FormularyBlockedCase } from './formulary.data';

/**
 * US 15204 "Delete Benefit Configuration" (formulary folder 12).
 *
 * A configuration may be deleted only while it is Not Live (a draft, "Draft ·
 * New") or Future; Active and Expired ones are refused ("Only a future benefit
 * configuration can be edited or removed. A current or expired one has already
 * applied - add a new configuration instead."), as is one referenced by
 * processed claims. Active / Expired configurations are produced with
 * writerBHelpers.benefitTimeline (dated a few minutes ahead, then waited for).
 *
 * Literal readings:
 * - "removed from the list" is the trade's Benefit Configuration list on screen.
 * - 18753: the claim-reference half of the matrix cannot be produced (see the
 *   BLOCKED cases); the status half is checked in full.
 * - 18750: the restricted user is the Payer Admin account as provided; the case
 *   runs only when it lacks BenefitConfigs.DeleteBenefitConfig.
 */

/** The refusal of a configuration that is no longer future-dated. */
export const ONLY_FUTURE = /Only a future benefit configuration can be edited or removed|future|cannot|not allowed|only/i;
export const DELETE_PROMPT = /delete|remove|are you sure/i;
export const DRAFT = /Draft|Not Live|New/i;
export const FUTURE = /Future/i;
export const ACTIVE = /Active/i;
export const EXPIRED = /Expired/i;

export const CASES = {
  deleteFuture: { azureId: '18742' },
  deleteNotLive: { azureId: '18744' },
  activeBlocked: { azureId: '18746' },
  expiredBlocked: { azureId: '18747' },
  noPermission: { azureId: '18750' },
  revalidatedOnConfirm: { azureId: '18751' },
  confirmationRequired: { azureId: '18752' },
  everyStatus: { azureId: '18753' },
} as const;

const NO_CLAIMS =
  'Needs processed claims that reference a benefit configuration. The environment exposes no claims adjudication the suite can '
  + 'drive and no seeded claim references a suite formulary\'s configuration, so no reference can be created. Runnable once '
  + 'claims can be submitted against a suite formulary (or seeded with known references).';

export const BLOCKED_CASES: FormularyBlockedCase[] = [
  {
    azureId: '18748',
    title: 'should block the deletion when processed claims reference the benefit configuration',
    reason: NO_CLAIMS,
  },
  {
    azureId: '18749',
    title: 'should state the exact number of referencing claims when the deletion is blocked',
    reason: `${NO_CLAIMS} The case also needs one configuration with exactly 1 and another with 25 referencing claims.`,
  },
];
