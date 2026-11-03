import { NON_ADMIN_PROFILE } from '../accounts/nonAdminAccount.data';
import { formularyDateText } from '../../utils/FormularyProvisioning';

/**
 * US 15211 "Clone Formulary" (formulary folder 15).
 *
 * The list row's Clone opens the clone drawer (`formulary-list-clone-drawer`,
 * the detail's component): step 1 shows "Cloning a formulary: This creates a
 * NEW formulary from "<source>" ...", the names (prefilled "(Clone)"),
 * descriptions and Include Tiers / Trades / Pricing; step 2 the clone's own
 * period ("A clone does not inherit its source period"). Clone sends
 * CloneFormulary; the clone is a new v0 Draft with a temporary FORM-D- code.
 * The sheet's "clone confirmation dialog" is this drawer, "Confirm" its Clone.
 *
 * Sources are the case's own formularies (Draft unless the case needs a live
 * one), built through `formularyIn`; every clone gets a suite name and is
 * registered for discard before it is made. The clone's period is the
 * source's (or starts an hour from now when the source is already live) so
 * every source price falls inside it - the drawer leaves out trades priced
 * outside the clone's period, which is not what these cases test.
 *
 * Producing the excluded data:
 *  - expired trade / expired price record / inactive benefit configuration:
 *    a period or benefit dated wholly in the PAST, added through the API. When
 *    the application refuses past dates the case is BLOCKED with its answer.
 *  - inactive trade: the trade suspended (SetFormularyTradeStatus).
 *  - Expired source (18793): an existing Expired formulary of the register, used
 *    read-only (cloning does not change it); BLOCKED when the register has none.
 */

/** The clone drawer's period for a source: its own dates, never starting in the past. */
export const clonePeriodFor = (source: { effectiveDate: string; expiryDate: string }): { effectiveDate: string; expiryDate: string } => {
  const start = Math.max(new Date(source.effectiveDate).getTime(), Date.now() + 60 * 60_000);
  const end = Math.max(new Date(source.expiryDate).getTime(), start + 30 * 86_400_000);
  return { effectiveDate: formularyDateText(new Date(start)), expiryDate: formularyDateText(new Date(end)) };
};

/** A period wholly in the past (ISO): from `fromDays` to `toDays` days ago. */
export const pastPeriod = (fromDays = 30, toDays = 2): { from: string; to: string } => ({
  from: new Date(Date.now() - fromDays * 86_400_000).toISOString(),
  to: new Date(Date.now() - toDays * 86_400_000).toISOString(),
});

/** What the drawer must say about the data it leaves out (18795). */
export const EXCLUSION_NOTE = /expired|inactive|suspended|left out|excluded|not (be )?(cloned|copied|included)/i;

/**
 * The source's configuration stays OPEN-ENDED, as every provisioned one was before
 * 2026-11-02 (provisioning now bounds them to 12 h unless told otherwise), so a clone
 * that leaves it out cannot be blamed on its window.
 */
const OPEN_BENEFIT = [{ benefitEndDate: null }];

export const CASES = {
  carriesOver: { azureId: '18783', tiers: 2, trades: 2, benefitConfigs: OPEN_BENEFIT },
  unapproved: { azureId: '18784' },
  codeOnApproval: { azureId: '18785' },
  expiredTrade: { azureId: '18786' },
  inactiveTrade: { azureId: '18787' },
  expiredPrice: { azureId: '18788' },
  completeCopy: { azureId: '18789', tiers: 2, trades: 2, benefitConfigs: OPEN_BENEFIT },
  noTradesLeft: { azureId: '18790', tiers: 2, trades: 2 },
  inactiveBenefit: { azureId: '18791', benefitConfigs: OPEN_BENEFIT },
  viewerCannotClone: { azureId: '18792', payer: NON_ADMIN_PROFILE.scopedPayers[0] },
  expiredSource: { azureId: '18793' },
  /** Clone-of-a-clone and two clones of the same source in quick succession. */
  exploratory: { azureId: '18794', repeats: 2 },
  dialog: { azureId: '18795' },
} as const;
