import type { NetworkBlockedCase } from '../networks/network.data';
import type { RolePermissionKey } from '../accounts/payerAdminRole.data';
import { networkStamp } from '../../utils/NetworkProvisioning';
import { PLAN_LIFECYCLE, PLAN_MESSAGE } from './plan.data';

/**
 * Test data for US 14160 "Paginate and load more plans in card view" (plan
 * folder 11; network twin: tests/network/03 directory-list - pager, cards,
 * Load More).
 *
 * Cases that need an EXACT number of plans (10, 11, 25) build that many
 * drafts of their own under one unique prefix and search it, so the count
 * is exact whatever the register holds; the drafts are discarded at teardown
 * by `planIn`. Cases about "more than 20 plans" use the register itself.
 *
 * Searching happens in table view (PlanManagementPage.search reopens the list
 * when the table is not on screen); the cards view is switched to afterwards
 * and keeps the search.
 */

export type PlanBlockedCase = NetworkBlockedCase;

/** The page size the story states, for both views. */
export const PAGE_SIZE = 10;

/** `count` draft names sharing a unique prefix ("Pager <stamp> 01" ...). */
export const pagerDataset = (count: number): { prefix: string; names: string[] } => {
  const prefix = `Pager ${networkStamp()}`;
  return { prefix, names: Array.from({ length: count }, (_, i) => `${prefix} ${String(i + 1).padStart(2, '0')}`) };
};

/** What a restricted role is stripped of to lose the directory (19066). */
export const DIRECTORY_PERMISSIONS: RolePermissionKey[] = ['viewPlansDashboard', 'viewPlanDetails'];

export const CASES = {
  loadMore: { azureId: '19055', batches: 2 },
  tablePages: { azureId: '19056' },
  exactlyTen: { azureId: '19057', count: 10 },
  exactlyEleven: { azureId: '19058', count: 11 },
  viewAndFilter: { azureId: '19059', status: PLAN_LIFECYCLE.active },
  viewSwitch: { azureId: '19060', loads: 2 },
  rapidClicks: { azureId: '19061', clicks: 4, expectedRequests: 1 },
  exploration: { azureId: '19062', status: PLAN_LIFECYCLE.active },
  pageSizeAndSpinner: { azureId: '19063' },
  empty: { azureId: '19064', term: (): string => `NOSUCHPLAN ${networkStamp()}`, message: PLAN_MESSAGE.noPlansFound },
  latestVersion: { azureId: '19065', pages: 3 },
  noAccess: { azureId: '19066', permissions: DIRECTORY_PERMISSIONS, appUrl: /^https?:\/\// },
  loadMoreFailure: { azureId: '19067' },
  requestScope: { azureId: '19068', status: PLAN_LIFECYCLE.active, pageField: 'pageNumber', nextPage: 2 },
  boundaries: { azureId: '19069', count: 25, lastPage: 3, lastPageRows: 5 },
} as const;

export const BLOCKED_CASES: PlanBlockedCase[] = [];
