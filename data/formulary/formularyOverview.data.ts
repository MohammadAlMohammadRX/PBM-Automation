import { FORMULARY_SUITE_PAYER } from '../../utils/FormularyProvisioning';
import { NO_ACCESS, SCOPED_PAYER } from './formularyPermissions.data';
import type { FormularyBlockedCase } from './formulary.data';

/**
 * US 15218 "View Formulary - Overview" (formulary folder 20).
 *
 * The detail screen opens on Overview (Formulary Code, Payer, Total Tiers,
 * Total Trades, Effective Date, Expiry Date, Description) with the tabs Tiers,
 * Trades & Pricing, Version History and Audit History.
 *
 * Literal readings:
 * - Dates are compared on their day (`DD/MM/YYYY`): the Overview may or may not
 *   show the time the pickers carry.
 * - 18883 "valid for a single day": effective at the start of a day two days
 *   ahead and expiry 23 h later the same day (the application refuses equal
 *   instants, 422). The Overview must show the same date for both.
 * - 18886 "Total Tiers 3, Total Trades 10": the suite catalogue offers three
 *   trades (MED-001..003), so 3 tiers and 3 trades.
 * - 18882 / 18889 "a user without formulary access": the Payer Admin role
 *   shaped with no formulary right at all; the formulary belongs to a payer in
 *   its scope, so only the permission can hide it.
 */
export const CASES = {
  overviewDetails: { azureId: '18879', tiers: 2, trades: 2, description: 'Owned by the automation suite.', payer: FORMULARY_SUITE_PAYER },
  allTabs: { azureId: '18880' },
  zeroCounts: { azureId: '18881' },
  viewPermission: { azureId: '18882', payerName: SCOPED_PAYER, shape: NO_ACCESS },
  singleDay: { azureId: '18883', daysAhead: 2, windowMinutes: 23 * 60 },
  tabSwitching: { azureId: '18884', rounds: 2 },
  deletedFormulary: { azureId: '18885', message: /Unable to load the requested formulary\./i },
  countsMatchTabs: { azureId: '18886', tiers: 3, trades: 3 },
  noDescription: { azureId: '18887' },
  versionsFromOverview: { azureId: '18888' },
  noRoleNoView: { azureId: '18889', payerName: SCOPED_PAYER, shape: NO_ACCESS },
  countsAfterAdd: { azureId: '18890', addedTrade: 'MED-002' },
} as const;

/** The five tabs, in order. */
export const ALL_TABS = ['overview', 'tiers', 'trades', 'versions', 'audit'] as const;

/** An empty Description as the Overview should show it. */
export const EMPTY_DESCRIPTION = /^(-|—|–|No description provided)$/i;

/** The same instant, `daysAhead` days from now at 00:00, as ISO. */
export const dayAheadIso = (daysAhead: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

export const BLOCKED_CASES: FormularyBlockedCase[] = [];
