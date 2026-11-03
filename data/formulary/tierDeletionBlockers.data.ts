import type { FormularyBlockedCase } from './formulary.data';

/**
 * US 15195 "Prevent deletion of tiers that are currently used" (formulary folder 05).
 *
 * A tier is "used" while any formulary trade sits in it, whatever the trade's
 * status. Trades take the statuses Active and Suspended (the screens' word for
 * "Inactive"); a "pending" trade here is one priced to start 30 days after the
 * formulary does. Every case builds its own Draft formulary - tier deletion
 * applies at once on drafts and published formularies alike.
 *
 * Literal readings:
 * - 18637: an EXPIRED trade cannot be produced on demand (it needs a price
 *   period that has already ended; Add Trade refuses a past start and the
 *   lifecycle job is daily), so its step reports BLOCKED once the other three
 *   statuses were checked.
 * - 18641: the "alternate deletion entry point" is the direct DeleteTier
 *   request - the Tiers tab offers no bulk delete (screen map: per-card Edit /
 *   Delete only).
 * - 18640: the restricted user is the Payer Admin account as provided; the
 *   case runs only when that account lacks Formularies.DeleteTier (see
 *   utils/formulary/writerBHelpers requireFormularyRights).
 */

/** Trade status labels: the screens say "Suspended" where the story says "Inactive". */
export const SUSPENDED = /Suspended|Inactive/i;
/** What a blocked tier deletion must say (by meaning). */
export const IN_USE = /cannot be deleted|in use|assigned|trades/i;

export const EXPIRED_TRADE_REASON =
  'An EXPIRED trade needs a price period that has already ended. Add Trade / AddPricingPeriod refuse a start in the past and '
  + 'the formulary lifecycle job runs daily, so no suite formulary can hold one on demand. The Active, Inactive (Suspended) and '
  + 'pending references were checked above; runnable once a seeded formulary with an expired trade exists.';

export const CASES = {
  deleteUnused: { azureId: '18633' },
  activeReference: { azureId: '18634' },
  singleReference: { azureId: '18635' },
  zeroReferences: { azureId: '18636' },
  everyStatus: { azureId: '18637', pendingAfterDays: 30 },
  becameInactive: { azureId: '18638' },
  explainBlock: { azureId: '18639' },
  noPermission: { azureId: '18640' },
  otherPath: { azureId: '18641' },
  checklist: { azureId: '18642' },
  becomesDeletable: { azureId: '18643' },
  deleteHiddenAfterBlock: { azureId: '18645' },
} as const;

export const BLOCKED_CASES: FormularyBlockedCase[] = [
  {
    azureId: '18644',
    title: 'should delete only the unused tiers and report the blocked ones when several tiers are deleted in bulk',
    reason:
      'Needs a bulk deletion of several selected tiers. The Tiers tab offers no tier selection and no bulk delete - each card '
      + 'has only its own Edit / Delete (screen map, 2026-11-02) - and the story\'s acceptance criteria do not ask for one, so '
      + 'there is no entry point that processes a mixed selection and reports which tiers were blocked. Runnable once a bulk '
      + 'tier deletion exists; single-tier blocking is covered by 18634-18643.',
  },
];
