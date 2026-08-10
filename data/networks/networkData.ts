import { DateUtils } from '../../utils/DateUtils';
import { RandomDataUtils } from '../../utils/RandomDataUtils';
import type { NetworkData } from '../common/types';

/**
 * Test data factory for Network Management.
 * Prefer `buildUniqueNetwork()` inside tests so parallel runs never collide.
 */
export function buildUniqueNetwork(overrides: Partial<NetworkData> = {}): NetworkData {
  return {
    nameEn: RandomDataUtils.uniqueNetworkName(),
    networkType: 'POS',
    effectiveDate: DateUtils.todayFormatted(),
    expiryDate: DateUtils.futureDate(365),
    ...overrides,
  };
}

export const NETWORK_TYPES = ['HMO', 'EPO', 'POS'] as const;
