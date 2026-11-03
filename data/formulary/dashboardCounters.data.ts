import type { FormularyBlockedCase } from './formulary.data';
import type { FormularyKpiKey } from '../../constants/ElementIds';
import { NON_ADMIN_PROFILE } from '../accounts/nonAdminAccount.data';

/**
 * US 15194 "Formulary list - dashboard counters" (formulary folder 04).
 *
 * The five KPI tiles of the list (`formulary-list-kpi-{total|active|pending|inactive|expired}`),
 * fed by GetFormulariesDashboard. The story's "Pending" counter is the status
 * code `pending`, which the tile labels "Future Formularies" (18619 itself
 * names it Future), so its label is matched as Pending OR Future.
 *
 * The counters are not narrowed by the list's filters or search (the Plans
 * business rule); they ARE calculated on the user's data scope (US 15194 AC),
 * which for the payer-scoped account is the top-bar payer scope.
 *
 * The register's own sizes are what they are: the sheet's example counts
 * (5 / 3 / 2 / 1, Pending = 4 ...) are checked as RELATIONS (sum, +1 / -1),
 * never as those literal numbers.
 */

/** The label each tile must carry (sheet wording; Pending = the Future tile). */
export const TILE_LABEL: Record<FormularyKpiKey, RegExp> = {
  total: /total/i,
  active: /active/i,
  pending: /pending|future/i,
  inactive: /inactive/i,
  expired: /expired/i,
};

/** The quick status filter option behind each status tile. */
export const FILTER_OF: Record<Exclude<FormularyKpiKey, 'total'>, string> = {
  active: 'Active',
  pending: 'Pending',
  inactive: 'Inactive',
  expired: 'Expired',
};

export const CASES = {
  fiveCounters: { azureId: '18619' },
  totalIsSum: { azureId: '18621' },
  allZero: { azureId: '18622' },
  /** A Future (pending) formulary taken Active (promoteToActive - a staged change approved after its effective time). */
  pendingToActive: { azureId: '18623', effectiveInMinutes: 2 },
  ownCategory: { azureId: '18624' },
  /** The sheet's two administrators of Region A / Region B are the one payer-scoped account switching its payer scope. */
  scopedCounts: { azureId: '18626', payerA: NON_ADMIN_PROFILE.scopedPayers[0], payerB: NON_ADMIN_PROFILE.scopedPayers[1] },
  noPermission: { azureId: '18627' },
  externalChange: { azureId: '18628' },
  checklist: { azureId: '18630' },
  /** Two formularies imported through the list's bulk import (CSV in the template's columns). */
  afterImport: { azureId: '18631', rows: 2 },
  attention: { azureId: '18632' },
} as const;

export const BLOCKED_CASES: FormularyBlockedCase[] = [
  {
    azureId: '18625',
    title: 'should show exactly 1 on the Expired counter when exactly one formulary is Expired',
    reason:
      'Needs a data scope holding EXACTLY one Expired formulary. Expired cannot be produced on demand (the formulary '
      + 'lifecycle job runs daily) and the shared register holds many Expired formularies (26 on 2026-11-02) in the '
      + 'administrator\'s scope; the payer-scoped account cannot be narrowed to a scope with exactly one. Runnable on an '
      + 'environment seeded with a single Expired formulary in a dedicated payer scope.',
  },
  {
    azureId: '18629',
    title: 'should keep every counter correct and load without errors when a formulary has no status',
    reason:
      'Needs a formulary record with NO status (a data anomaly). The application never saves one - every create and '
      + 'approval sets a status - and the suite has no database access to blank it; the counters are computed on the '
      + 'server, so faking the list answer in the browser would not exercise them. Runnable once such a record is '
      + 'seeded directly in the database.',
  },
];
