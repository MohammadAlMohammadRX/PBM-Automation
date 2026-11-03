import { formularyDateText } from '../../utils/FormularyProvisioning';
import { fullAccessWithout, SCOPED_PAYER } from './formularyPermissions.data';
import type { FormularyBlockedCase } from './formulary.data';

/**
 * US 15209 "Activate and expire formularies by date vs Inactive status"
 * (formulary folder 14). 18770, 18771, 18772, 18773 and 18781 are Manual (date
 * / job driven) and not automated.
 *
 * Literal readings:
 * - 18774 / 18775 "confirm the action - the status changes": Deactivate and
 *   Activate are staged as drafts like every formulary change (Foundation
 *   notes), so the confirmation is followed by Send for Approval and the
 *   approval before the status is read.
 * - 18777 / 18778: Expired cannot be produced on demand (daily job); an
 *   EXISTING Expired formulary of the register is only looked at, and the case
 *   is BLOCKED when there is none. "Draft" in 18778 is the never-published
 *   status the screens label "Not Live".
 * - 18780 "Claims Processor": the Payer Admin role shaped without
 *   SetFormularyActive (one right covers Deactivate and Activate).
 */
export const CASES = {
  setInactive: { azureId: '18774' },
  activateInactive: { azureId: '18775' },
  expiredNotActivatable: { azureId: '18777' },
  distinctStatuses: { azureId: '18778' },
  endBeforeStart: { azureId: '18779' },
  onlyAdministrator: { azureId: '18780', payerName: SCOPED_PAYER, shape: fullAccessWithout('setActive') },
} as const;

/** 18779 - a start a month ahead at 00:00 and an end one day before it, as the pickers take them. */
export const endBeforeStart = (): { effectiveDate: string; expiryDate: string } => {
  const start = new Date();
  start.setDate(start.getDate() + 30);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() - 86_400_000);
  return { effectiveDate: formularyDateText(start), expiryDate: formularyDateText(end) };
};

/** 18779 - "the end date cannot be earlier than the start date". */
export const END_BEFORE_START = /after|later|greater|earlier|before|expiry|end date|start/i;

/** The quick status filter's "everything" option. */
export const ALL_STATUSES = 'All Statuses';

export const BLOCKED_CASES: FormularyBlockedCase[] = [
  {
    azureId: '18776',
    title: 'should block activating an Inactive formulary that lacks the minimum tier and trade data',
    reason:
      'Needs INACTIVE formularies with zero tiers (FRM-2007) and with a tier but no trade holding both pricing and a benefit '
      + 'configuration (FRM-2008). A formulary only becomes Inactive after an approval, and approval requires a tier and a trade; '
      + 'afterwards a tier with trades cannot be deleted (409 "A tier cannot be deleted while trades are assigned to it.") and '
      + 'trade / benefit removals on a published formulary are only staged until the next approval - so an Inactive formulary '
      + 'missing that data cannot be built by the suite. Runnable once such Inactive formularies exist (e.g. seeded data).',
  },
  {
    azureId: '18782',
    title: 'should activate the Inactive formulary once its missing tier has been added',
    reason:
      'Needs an INACTIVE formulary with no tier (FRM-2014) whose first activation is refused. An Inactive formulary has '
      + 'necessarily passed an approval that requires a tier and a trade, and its tiers cannot be removed while trades are '
      + 'assigned to them - so the zero-tier Inactive starting point cannot be built by the suite. Runnable with seeded data.',
  },
];
