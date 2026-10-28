import { networkStamp } from '../../utils/NetworkProvisioning';
import {
  NETWORK_KPI_LABELS,
  NETWORK_LIFECYCLE,
  NETWORK_LIST_HEADERS,
  type NetworkBlockedCase,
} from './network.data';

/**
 * Test data for US 14120 "View network directory with KPI dashboard".
 *
 * The sheet's fixed distribution (50 / 20 / 10 / 15 / 5) is not this
 * environment's - the register holds hundreds of networks - so the cases
 * compare each tile with the matching PARTITION of the register as the list
 * itself reports it (the total its GetNetworks answers for that status
 * filter), which is the rule the distribution only illustrates.
 *
 * The KPI band and the list are scoped to the top-bar payer, so every
 * comparison is made inside one scope: the band against the list's own
 * dashboard request (captureDashboardTotals), never against a direct call.
 */

export const KPI_LABELS = Object.values(NETWORK_KPI_LABELS);

/** KPI tile -> the Status quick-filter option that is its partition. */
export const KPI_PARTITIONS = [
  { kpi: 'active', status: NETWORK_LIFECYCLE.active },
  { kpi: 'pending', status: NETWORK_LIFECYCLE.pending },
  { kpi: 'inactive', status: NETWORK_LIFECYCLE.inactive },
  { kpi: 'expired', status: NETWORK_LIFECYCLE.expired },
] as const;

/** The list columns the story requires (17751, 17754). */
export const REQUIRED_HEADERS = NETWORK_LIST_HEADERS.filter((header) => header !== 'Actions');

/** Formats the list renders (17754): dates "DD/MM/YYYY HH:mm", counts digits. */
export const DATE_CELL = /^\d{2}\/\d{2}\/\d{4}( \d{2}:\d{2})?$/;
export const COUNT_CELL = /^\d+$/;

/** The page size the story states. */
export const PAGE_SIZE = 10;

/**
 * 17750 - a dataset of exactly 0, 10 and 11 records is built from the case's
 * own drafts under one unique prefix: ten "<prefix> Ten NN" and one
 * "<prefix> Extra". Searching the prefix lists 11, "<prefix> Ten" lists 10, and
 * a term nothing carries lists 0.
 */
export const pagerDataset = (): { prefix: string; ten: string; names: string[]; none: string } => {
  const prefix = `Pager ${networkStamp()}`;
  const ten = `${prefix} Ten`;
  const names = [
    ...Array.from({ length: 10 }, (_, i) => `${ten} ${String(i + 1).padStart(2, '0')}`),
    `${prefix} Extra`,
  ];
  return { prefix, ten, names, none: `${prefix} Nothing` };
};

export const CASES = {
  defaultView: { azureId: '17751' },
  partitions: { azureId: '17749' },
  pagination: {
    azureId: '17750',
    // QA lead, 2026-10-27: steps 2 and 3 need test data, so the case is reported Skipped.
    skipReason: 'Skipped by the QA lead (2026-10-27): steps 2 and 3 need test data - exactly 10 and exactly 11 '
      + 'networks matching one search - which this environment does not have.',
  },
  filterIndependence: { azureId: '17752', type: 'HMO' },
  viewToggle: { azureId: '17753', status: NETWORK_LIFECYCLE.active },
  columns: { azureId: '17754' },
  liveCounts: { azureId: '17755' },
  loadMore: { azureId: '17756', clicks: 4 },
  permission: { azureId: '17758' },
  serverAggregation: { azureId: '17759' },
  totalIsSum: { azureId: '17760' },
} as const;

/** The permissions a "may not view the directory" role is stripped of (17758). */
export const DIRECTORY_PERMISSIONS = ['viewNetworksDashboard', 'viewNetworkDetails', 'viewNetworksDropdown'] as const;

export const BLOCKED_CASES: NetworkBlockedCase[] = [
  {
    azureId: '17757',
    title: 'should show zero on every KPI tile and an empty list state when no networks exist',
    reason:
      'Needs an environment holding NO networks at all. This shared environment holds several hundred, and the '
      + 'band is scoped to a payer whose scope always includes the unowned networks, so no scope reads zero. '
      + 'Runnable against an empty tenant (or a payer scope that excludes unowned networks).',
  },
];
