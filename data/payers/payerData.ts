import { RandomDataUtils } from '../../utils/RandomDataUtils';
import type { PayerData } from '../common/types';

/**
 * Test data factory for Payer Management.
 * Prefer `buildUniquePayer()` inside tests so parallel runs never collide on
 * the same payer name/email/license number.
 */
export function buildUniquePayer(overrides: Partial<PayerData> = {}): PayerData {
  const suffix = RandomDataUtils.uniqueSuffix();
  return {
    nameEn: RandomDataUtils.uniquePayerName(),
    nameAr: `شركة أوتوميشن ${suffix}`,
    payerType: 'Private',
    licenseNumber: RandomDataUtils.uniqueLicenseNumber(),
    email: RandomDataUtils.uniqueEmail(),
    phoneNumber: RandomDataUtils.validSaudiMobileNumber(),
    ...overrides,
  };
}

/** A small set of representative, valid payer types for data-driven tests. */
export const PAYER_TYPES = ['Private', 'Government', 'Self-Insured'] as const;
