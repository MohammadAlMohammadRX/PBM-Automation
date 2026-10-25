import { NETWORK_ADVANCED_SEARCH_FIELD } from '../../constants/ElementIds';
import { NETWORK_FILTER_DEFAULT, NETWORK_LIFECYCLE, NETWORK_TYPES } from './network.data';

/**
 * Test data for US 14118 "Filter networks by type and status".
 *
 * The list's quick filters (verified 2026-10-21): "All Types" + HMO / PPO /
 * EPO / POS and "All Statuses" + Pending / Active / Inactive / Expired. Applied
 * values also render as chips above the table. The sheet's "apply" step is
 * the selection itself - the quick filters apply on change.
 */

export const FIELD = NETWORK_ADVANCED_SEARCH_FIELD;
export const FILTER_DEFAULT = NETWORK_FILTER_DEFAULT;

/** The options each quick filter must offer, defaults excluded (17744). */
export const EXPECTED_OPTIONS = {
  type: [...NETWORK_TYPES],
  status: [NETWORK_LIFECYCLE.pending, NETWORK_LIFECYCLE.active, NETWORK_LIFECYCLE.inactive, NETWORK_LIFECYCLE.expired],
} as const;

export const CASES = {
  byType: { azureId: '17739', type: 'HMO' },
  byEachStatus: {
    azureId: '17740',
    statuses: [NETWORK_LIFECYCLE.pending, NETWORK_LIFECYCLE.active, NETWORK_LIFECYCLE.inactive, NETWORK_LIFECYCLE.expired],
  },
  combined: { azureId: '17741', type: 'PPO', status: NETWORK_LIFECYCLE.expired },
  boundaries: { azureId: '17743', first: 'HMO', last: 'POS' },
  removeChip: { azureId: '17742', type: 'EPO', status: NETWORK_LIFECYCLE.active },
  checklist: { azureId: '17744' },
  invalidValue: { azureId: '17746', invalidType: 'XYZ', probeType: 'HMO' },
  clearAll: { azureId: '17745', type: 'HMO', status: NETWORK_LIFECYCLE.inactive },
  randomOrder: { azureId: '17747', nameOrCode: 'Care', type: 'POS', status: NETWORK_LIFECYCLE.pending },
  noMatch: { azureId: '17748', type: 'EPO', status: NETWORK_LIFECYCLE.expired },
} as const;

/** What a handled refusal of a manipulated filter must never expose. */
export const UNHANDLED_ERROR_MARKERS = ['StackTrace', 'System.', 'NullReference', 'Exception'] as const;
