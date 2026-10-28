import type { NetworkBlockedCase } from '../networks/network.data';
import type { PlanKpiKey } from '../../constants/ElementIds';
import type { PlanTypeCode } from '../../utils/PlanProvisioning';
import type { RolePermissionKey } from '../accounts/payerAdminRole.data';
import { networkStamp } from '../../utils/NetworkProvisioning';
import { PLAN_LIFECYCLE, PLAN_MESSAGE, PLAN_STATUS_FILTER_OPTIONS, PLAN_VERSION_STATUS, planNamed } from './plan.data';
import { PLAN_SUITE } from './planSuite.data';

/**
 * Test data for US 14145 "View plan directory with KPI tiles and filtering"
 * (plan folder 01; network twin: tests/network/03 + 02).
 *
 * The sheet's fixed distribution (2 Active / 1 Pending / 1 Inactive / 1
 * Expired) is not this environment's - the register holds many plans - so the
 * KPI cases read the tiles as they load and check the rules the distribution
 * illustrates: Total covers each status tile, Pending and Inactive are counted
 * apart, and no filter or search changes any tile (KPI_STATUS_FILTERS below).
 *
 * The sheet's payer "Bupa Arabia" is not a payer of this environment's Plans
 * suite; the suite payer (data/plans/planSuite.data.ts) is used instead. Its
 * Plan Type "Group" is a real type here (lookup planType).
 */

export type PlanBlockedCase = NetworkBlockedCase;

/** The five tiles the story requires, by the key their ids carry (`plan-list-kpi-{key}`). */
export const REQUIRED_KPI_KEYS: PlanKpiKey[] = ['total', 'active', 'pending', 'inactive', 'expired'];

/** A tile the story removed - no tile may be labelled or keyed like this. */
export const REMOVED_TILE = /draft/i;

/**
 * The KPI tiles count the WHOLE register and must not change when the list is
 * filtered or searched - a business rule confirmed by the QA lead on
 * 2026-10-27. 18947 and 18952 used to compare each tile with the list's total
 * for the matching Status filter; they now check that the tiles keep their
 * values under every filter instead.
 */
export const KPI_STATUS_FILTERS = PLAN_STATUS_FILTER_OPTIONS.filter((option) => option !== 'All Statuses');

/** The Type filter and the search term 18947 applies on top of the Status filters. */
export const KPI_TYPE_FILTER = 'Group';
/** A term the suite's own plans match (planFormData names them "Automation Plan ..."), so the list stays on screen. */
export const kpiSearchTerm = (): string => 'Automation Plan';

/** How long a tile may take to settle after the list re-fetches. */
export const KPI_SETTLE_MS = 10_000;

/** The statuses whose badges 18958 reads, one plan each, as the Status filter labels them. */
export const BADGE_STATUSES = [PLAN_LIFECYCLE.active, PLAN_LIFECYCLE.pending, PLAN_LIFECYCLE.inactive, PLAN_LIFECYCLE.expired];

/**
 * The permissions a "may not view the plan directory" role is stripped of
 * (18959) - the read rights behind the list, its dashboard and its rows.
 */
export const DIRECTORY_PERMISSIONS: RolePermissionKey[] = ['viewPlansDashboard', 'viewPlanDetails'];

/** The version a plan reads after its first approval and one approved inactivation (v1 -> v2). */
export const TWO_VERSION_CURRENT = 2;

/** The plan's version numbers as the Version History tab shows them ("v2", "2", "Version 2"). */
export const versionNumber = (cell: string): number => Number((cell.match(/\d+/) ?? ['-1'])[0]);

export const CASES = {
  versionHistory: { azureId: '18946', superseded: PLAN_VERSION_STATUS.superseded, minimumVersions: 2 },
  kpiCounts: { azureId: '18947' },
  noDraftTile: { azureId: '18948' },
  oneEntryPerPlan: { azureId: '18949', currentVersion: TWO_VERSION_CURRENT },
  typeFilter: { azureId: '18950', type: 'Group', typeCode: 'group' as PlanTypeCode },
  statusFilter: { azureId: '18951', status: PLAN_LIFECYCLE.active },
  pendingInactiveSeparate: { azureId: '18952', pending: PLAN_LIFECYCLE.pending, inactive: PLAN_LIFECYCLE.inactive },
  payerFilter: { azureId: '18953', payer: PLAN_SUITE.payerName },
  combinedFilters: {
    azureId: '18954',
    payer: PLAN_SUITE.payerName,
    // The sheet's "Group": the suite's Active plans are provisioned as Individual,
    // so Individual is the type the three criteria are known to meet together.
    type: 'Individual',
    status: PLAN_LIFECYCLE.active,
  },
  quickSearch: { azureId: '18955', nameEn: (): string => planNamed('Family Care Plan') },
  noMatch: { azureId: '18956', term: (): string => `zzznoplanmatch999 ${networkStamp()}`, empty: PLAN_MESSAGE.noPlansFound },
  viewToggle: { azureId: '18957' },
  statusBadges: { azureId: '18958', statuses: BADGE_STATUSES },
  directoryAccess: { azureId: '18959', permissions: DIRECTORY_PERMISSIONS },
} as const;

export const BLOCKED_CASES: PlanBlockedCase[] = [];
